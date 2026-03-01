# backend/routes_scan.py
#
# POST /scan/result — receive auto-detected hero slugs from the window monitor
# and update the caller's selected_units in MongoDB.
#
# This endpoint is the backend half of the live scan pipeline:
#   window_monitor.py  →  Electron IPC  →  ScanToggle.jsx
#   →  POST /scan/result  →  selected_units upsert  →  Twitch overlay
#
# Auth: JWT Bearer token (inline decode — avoids circular import with app.py).
# Body: { "slugs": ["celine", "krau", "flan", "straze"] }
#
import os
import re
import unicodedata

import jwt as pyjwt
from flask import Blueprint, request, jsonify

scan_bp = Blueprint("scan_bp", __name__)

SECRET_KEY_FALLBACK = "dev-only-secret-change-me"


# ---------------------------------------------------------------------------
# Internal helpers (mirrors routes_draft.py to avoid import side-effects)
# ---------------------------------------------------------------------------

def _verify_token(token: str):
    """Decode a HS256 JWT and return the username, or None on failure."""
    secret = os.getenv("SECRET_KEY", SECRET_KEY_FALLBACK)
    try:
        payload = pyjwt.decode(token, secret, algorithms=["HS256"])
        return payload.get("username", "")
    except pyjwt.PyJWTError:
        return None


def _slugify(s: str) -> str:
    """
    Unicode-aware slug: strip combining marks, lowercase,
    keep only alnum/hyphen/space, collapse spaces to hyphens.
    Identical to the logic in routes_draft.py and hero_images.py.
    """
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"[^a-z0-9\-\s]", "", s)
    s = re.sub(r"\s+", "-", s).strip("-")
    return s


def _find_unit_id_for_slug(db, username: str, slug: str):
    """
    Match a detected slug (e.g. 'new-moon-luna') to the user's ImageStats doc.
    Returns (stringified ObjectId, unit_name) or (None, None) if no match.
    """
    image_stats = db['ImageStats']

    # Fast path: exact slugified match against the user's units
    cursor = image_stats.find({"uploaded_by": username}, {"unit": 1})
    for doc in cursor:
        unit_name = doc.get("unit") or ""
        if _slugify(unit_name) == slug:
            return str(doc["_id"]), unit_name

    # Fallback: loose regex for minor punctuation differences
    patt = re.compile(
        r"\b" + re.sub(r"-+", r"\\s*", re.escape(slug)) + r"\b",
        re.IGNORECASE,
    )
    doc = image_stats.find_one({"uploaded_by": username, "unit": {"$regex": patt}})
    if doc:
        return str(doc["_id"]), doc.get("unit") or ""

    return None, None


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@scan_bp.route("/scan/result", methods=["POST"])
def scan_result():
    """
    Accept a list of hero slugs detected by the live window monitor, resolve
    them to the user's unit IDs, and upsert selected_units.

    Request body (JSON):
        { "slugs": ["celine", "krau", "flan", "straze"] }

    Headers:
        Authorization: Bearer <jwt>
    """
    # --- Auth ---
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    if not token:
        return jsonify({"error": "Authentication required"}), 401

    username = _verify_token(token)
    if not username:
        return jsonify({"error": "Invalid or expired token"}), 401

    # --- Body ---
    body = request.get_json(silent=True) or {}
    slugs = body.get("slugs", [])
    if not isinstance(slugs, list):
        return jsonify({"error": "'slugs' must be an array"}), 400

    # Keep only up to 4 slugs
    slugs = slugs[:4]

    # --- Resolve slugs → unit IDs + names ---
    db = request.app_db
    unit_ids = []
    unit_names = []
    unmatched = []

    for slug in slugs:
        uid, name = _find_unit_id_for_slug(db, username, slug)
        if uid:
            unit_ids.append(uid)
            unit_names.append(name)
        else:
            unmatched.append(slug)

    # --- Upsert selected_units ---
    update_doc = {"username": username}
    for i in range(4):
        update_doc[f"unit_id{i + 1}"] = unit_ids[i] if i < len(unit_ids) else None

    db.selected_units.update_one(
        {"username": username},
        {"$set": update_doc},
        upsert=True,
    )

    return jsonify({
        "status": "ok",
        "username": username,
        "detected_slugs": slugs,
        "saved": [update_doc.get(f"unit_id{i + 1}") for i in range(4)],
        "saved_names": unit_names,
        "unmatched": unmatched,
    }), 200


@scan_bp.route("/scan/debug", methods=["GET"])
def scan_debug():
    """
    GET /scan/debug — return the current selected_units for the authenticated user.
    Useful for verifying saves without opening the Twitch overlay.
    """
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    if not token:
        return jsonify({"error": "Authentication required"}), 401

    username = _verify_token(token)
    if not username:
        return jsonify({"error": "Invalid or expired token"}), 401

    db = request.app_db
    doc = db.selected_units.find_one({"username": username})
    if not doc:
        return jsonify({"username": username, "selected_units": None}), 200

    doc["_id"] = str(doc["_id"])

    # Also resolve unit names for readability
    image_stats = db['ImageStats']
    resolved = []
    for i in range(1, 5):
        uid = doc.get(f"unit_id{i}")
        if uid:
            from bson.objectid import ObjectId
            unit = image_stats.find_one({"_id": ObjectId(uid)}, {"unit": 1})
            resolved.append(unit.get("unit") if unit else f"<unknown id: {uid}>")
        else:
            resolved.append(None)

    return jsonify({
        "username": username,
        "selected_units": doc,
        "resolved_names": resolved,
    }), 200
