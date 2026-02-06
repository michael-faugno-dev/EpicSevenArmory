# Flask blueprint: verifies Google ID tokens, links/creates Mongo user, returns app session.
# Loads GOOGLE_CLIENT_ID from:
#   1) app.config["GOOGLE_CLIENT_ID"]
#   2) config/google_oauth.json (preferred local path)
#   3) backend/config/google_oauth.json (back-compat)
#   4) environment var GOOGLE_CLIENT_ID
#
# Compatible with Python < 3.10. Adds clock skew tolerance with a fallback.

from flask import Blueprint, request, jsonify, current_app
from datetime import datetime, timedelta
from typing import Optional
import os
import json
import jwt
import logging

# Google token verification
try:
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
    from google.auth.exceptions import GoogleAuthError
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False
    print("Warning: google-auth library not installed. Install with: pip install google-auth")

GOOGLE_BP = Blueprint("google_native_auth", __name__)
log = logging.getLogger(__name__)

def _profile_completed(user_doc: dict) -> bool:
    for k in ("epic_seven_account", "streamer_name", "rta_rank"):
        v = (user_doc or {}).get(k, "")
        if not v or not str(v).strip():
            return False
    return True

def _ensure_username(users_collection, base_name: str) -> str:
    name = base_name or "user"
    i = 1
    original_name = name
    while users_collection.find_one({"username": name}):
        i += 1
        name = f"{original_name}{i}"
    return name

def _load_google_client_id() -> Optional[str]:
    """
    Order:
      1) app.config["GOOGLE_CLIENT_ID"]
      2) config/google_oauth.json -> {"client_id": "..."}
      3) backend/config/google_oauth.json -> {"client_id": "..."} (back-compat)
      4) environment var GOOGLE_CLIENT_ID
    """
    try:
        cid = current_app.config.get("GOOGLE_CLIENT_ID")
        if cid:
            return cid.strip()

        # Preferred local path
        try_paths = [
            os.path.join(current_app.root_path, "config", "google_oauth.json"),
            os.path.abspath(os.path.join(current_app.root_path, "backend", "config", "google_oauth.json")),
        ]
        for cfg in try_paths:
            try:
                if os.path.exists(cfg):
                    with open(cfg, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    val = (data.get("client_id") or "").strip()
                    if val:
                        return val
            except Exception as e:
                log.warning("Failed reading %s: %s", cfg, e)

        cid = (os.environ.get("GOOGLE_CLIENT_ID") or "").strip()
        return cid or None
    except Exception as e:
        log.error("Error loading Google client ID: %s", e)
        return None

@GOOGLE_BP.route("/auth/google/native", methods=["POST"])
def auth_google_native():
    try:
        if not GOOGLE_AUTH_AVAILABLE:
            return jsonify({
                "success": False,
                "error": "google_auth_not_available",
                "error_message": "Google authentication library not installed. Run: pip install google-auth"
            }), 500

        data = request.get_json(silent=True) or {}
        id_tok = data.get("id_token")
        if not id_tok:
            return jsonify({"success": False, "error": "missing_id_token"}), 400

        client_id = _load_google_client_id()
        if not client_id:
            return jsonify({
                "success": False,
                "error": "server_missing_client_id",
                "error_message": "Set config/google_oauth.json with {\"client_id\": \"...\"} or env GOOGLE_CLIENT_ID"
            }), 500

        # Verify with Google – allow small clock skew. Fallback if library version
        # doesn't support the kwarg.
        req = google_requests.Request()
        try:
            try:
                idinfo = google_id_token.verify_oauth2_token(
                    id_tok, req, audience=client_id, clock_skew_in_seconds=60
                )
            except TypeError:
                # Older google-auth without clock_skew_in_seconds
                idinfo = google_id_token.verify_oauth2_token(
                    id_tok, req, audience=client_id
                )
        except GoogleAuthError as e:
            log.exception("GoogleAuthError verifying ID token")
            return jsonify({"success": False, "error": "google_auth_error", "error_message": str(e)}), 401
        except ValueError as e:
            log.exception("ValueError verifying ID token (likely audience/clock mismatch)")
            return jsonify({"success": False, "error": "invalid_value", "error_message": str(e)}), 401
        except Exception as e:
            log.exception("Unexpected error verifying ID token")
            return jsonify({"success": False, "error": "verify_failed", "error_message": str(e)}), 500

        iss = idinfo.get("iss")
        if iss not in ("accounts.google.com", "https://accounts.google.com"):
            return jsonify({"success": False, "error": "invalid_issuer"}), 401

        google_sub = idinfo.get("sub")
        email = idinfo.get("email", "")
        email_verified = bool(idinfo.get("email_verified", False))
        name = idinfo.get("name", "")
        picture = idinfo.get("picture", "")

        users_collection = current_app.config.get("USERS_COLLECTION")
        db = current_app.config.get("DB")
        
        if users_collection is None:
            return jsonify({"success": False, "error": "users_collection_not_configured"}), 500

        # Link by google_id first, then by verified email
        user = users_collection.find_one({"google_id": google_sub})
        if not user and email_verified and email:
            # Escape special regex characters in email
            escaped_email = email.replace(".", r"\.").replace("+", r"\+")
            user = users_collection.find_one({"email": {"$regex": f"^{escaped_email}$", "$options": "i"}})

        if user:
            # Update existing user
            update_fields = {
                "google_id": google_sub,
                "email": email,
                "email_verified": email_verified,
                "name": name or user.get("name", ""),
                "picture": picture or user.get("picture", ""),
            }
            users_collection.update_one({"_id": user["_id"]}, {"$set": update_fields})
            user = users_collection.find_one({"_id": user["_id"]})
        else:
            # Create new user
            base_username = (email.split("@", 1)[0] if email else "user").strip() or "user"
            username = _ensure_username(users_collection, base_username)
            user_doc = {
                "username": username,
                "google_id": google_sub,
                "email": email,
                "email_verified": email_verified,
                "name": name,
                "picture": picture,
                "epic_seven_account": "",
                "streamer_name": "",
                "rta_rank": "",
                "access_token": "",
                "created_at": datetime.utcnow(),
            }
            ins = users_collection.insert_one(user_doc)
            user = users_collection.find_one({"_id": ins.inserted_id})

        completed = _profile_completed(user)

        secret = current_app.config.get("SECRET_KEY")
        if secret is None or secret == "":
            return jsonify({"success": False, "error": "secret_key_not_configured"}), 500

        now = datetime.utcnow()
        payload = {
            "sub": str(user["_id"]),
            "username": user["username"],
            "email": user.get("email", ""),
            "provider": "google",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(days=7)).timestamp()),
        }
        app_token = jwt.encode(payload, secret, algorithm="HS256")

        return jsonify({
            "success": True,
            "token": app_token,
            "username": user["username"],
            "profile_completed": completed,
        }), 200

    except Exception as e:
        log.exception("Fatal error in /auth/google/native: %s", str(e))
        return jsonify({"success": False, "error": "server_error", "error_message": str(e)}), 500


def register_google_auth_blueprint(app, *, users_collection, db):
    try:
        app.config["USERS_COLLECTION"] = users_collection
        app.config["DB"] = db
        # Optional: allow setting GOOGLE_CLIENT_ID via env to app.config
        if not app.config.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_ID"):
            app.config["GOOGLE_CLIENT_ID"] = os.environ["GOOGLE_CLIENT_ID"]
        app.register_blueprint(GOOGLE_BP)
        print("Google auth blueprint registered successfully")
    except Exception as e:
        print(f"Error registering Google auth blueprint: {e}")
        raise