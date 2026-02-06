# backend/routes_draft.py
# POST /draft/upload: accepts multipart image, runs SIFT, maps detected slugs
# to user's units in image_stats via uploaded_by + slugified 'unit' name.
import os
import re
import tempfile
import unicodedata
from flask import Blueprint, request, jsonify

from draft_detection import detect_heroes

draft_bp = Blueprint("draft_bp", __name__)

def _slugify(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"[^a-z0-9\-\s]", "", s)  # keep alnum, space, hyphen
    s = re.sub(r"\s+", "-", s).strip("-")
    return s

def _find_unit_id_for_slug(db, username: str, slug: str):
    """
    Match detected slug (e.g., 'new-moon-luna') to the user's unit document in image_stats.
    Schema used: { unit: 'New Moon Luna', uploaded_by: <username>, ... }
    """
    image_stats = db.image_stats

    # Fast path: scan only the user's units and compare slugified 'unit'
    cursor = image_stats.find({"uploaded_by": username}, {"unit": 1})
    for doc in cursor:
        unit_name = doc.get("unit") or ""
        if _slugify(unit_name) == slug:
            return str(doc["_id"])

    # Fallback: loose regex for minor punctuation differences
    patt = re.compile(r"\b" + re.sub(r"-+", r"\\s*", re.escape(slug)) + r"\b", re.IGNORECASE)
    doc = image_stats.find_one({"uploaded_by": username, "unit": {"$regex": patt}})
    if doc:
        return str(doc["_id"])

    return None

@draft_bp.route("/draft/upload", methods=["POST"])
def upload_and_detect_draft():
    """
    multipart/form-data with file field 'image'
    Header: Username: <username>
    Upserts selected_units (unit_id1..unit_id4) for that username.
    """
    username = request.headers.get("Username") or request.headers.get("username")
    if not username:
        return jsonify({"error": "Username header missing"}), 400

    if "image" not in request.files:
        return jsonify({"error": "No file part 'image'"}), 400

    f = request.files["image"]
    if f.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, f.filename)
        f.save(p)
        slugs = detect_heroes(p, top_k=4)

    db = request.app_db  # set in app.py via before_request hook
    unit_ids = []
    debug_map = []
    unmatched = []

    for slug in slugs:
        uid = _find_unit_id_for_slug(db, username, slug)
        debug_map.append({"slug": slug, "matched_unit_id": uid})
        if uid:
            unit_ids.append(uid)
        else:
            unmatched.append(slug)

    # Upsert selected_units
    selected_units = db.selected_units
    update_doc = {"username": username}
    for i in range(4):
        key = f"unit_id{i+1}"
        update_doc[key] = unit_ids[i] if i < len(unit_ids) else None

    selected_units.update_one(
        {"username": username},
        {"$set": update_doc},
        upsert=True
    )

    return jsonify({
        "username": username,
        "detected_slugs": slugs,
        "saved_unit_ids": [
            update_doc.get("unit_id1"),
            update_doc.get("unit_id2"),
            update_doc.get("unit_id3"),
            update_doc.get("unit_id4"),
        ],
        "unmatched_slugs": unmatched,
        "match_debug": debug_map
    }), 200
