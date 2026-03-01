# backend/routes_auto_import.py
#
# Auto unit import endpoints — receives frames captured by unit_scanner.py,
# runs pytesseract OCR, upserts the unit in ImageStats, and logs the event.
#
# Endpoints:
#   POST /auto_import/unit       — receive captured frame, OCR, upsert
#   GET  /scan_events            — return recent import log for a user
#   GET  /monitor_status         — hero scanner running flag
#   POST /auto_import/set_status — Electron sets running flag on start/stop
#
import io
import os
import re
import time
import unicodedata

import jwt as pyjwt
import pytesseract
from PIL import Image
from flask import Blueprint, request, jsonify

auto_import_bp = Blueprint("auto_import_bp", __name__)

SECRET_KEY_FALLBACK = "dev-only-secret-change-me"

# In-memory flag updated by Electron when the unit scanner starts/stops.
_unit_scanner_running = False

# Base resolution the OCR regions were calibrated against —
# matches the in-game screenshot tool output (no window chrome).
# Identical to the regions used in process_image() in app.py, which are
# confirmed to work correctly for uploaded in-game screenshots.
OCR_BASE_W = 1920
OCR_BASE_H = 1080

# OCR regions — same as process_image() in app.py.
# Each entry: (x, y, width, height)
OCR_REGIONS = {
    "unit":               (150,  170, 700,  60),
    "cp":                 (207,  555, 200,  50),
    "imprint":            (275,  360, 190, 100),
    "attack":             (418,  620,  70,  29),
    "defense":            (418,  648,  70,  34),
    "health":             (394,  683, 100,  34),
    "speed":              (385,  720, 100,  29),
    "critical_hit_chance":(385,  750, 100,  29),
    "critical_hit_damage":(385,  785, 100,  34),
    "effectiveness":      (385,  820, 100,  34),
    "effect_resistance":  (385,  850, 100,  34),
    "set1":               (210,  942, 200,  34),
    "set2":               (210,  976, 200,  34),
    "set3":               (210, 1010, 200,  34),
}

PERCENTAGE_STATS = {
    "imprint", "critical_hit_chance", "critical_hit_damage",
    "effectiveness", "effect_resistance",
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _verify_token(token: str):
    secret = os.getenv("SECRET_KEY", SECRET_KEY_FALLBACK)
    try:
        payload = pyjwt.decode(token, secret, algorithms=["HS256"])
        return payload.get("username", "")
    except pyjwt.PyJWTError:
        return None


def _slugify(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"[^a-z0-9\-\s]", "", s)
    s = re.sub(r"\s+", "-", s).strip("-")
    return s


def _clean_stat(raw: str, keep_percentage: bool = False) -> str:
    raw = re.sub(r"[*:Â©]", "", raw or "").strip()
    raw = re.split(r"[.|]", raw)[0].strip()
    if keep_percentage:
        if raw and not raw.endswith("%"):
            raw += "%"
    else:
        raw = raw.rstrip("%")
    return raw


def _clean_unit_name(name: str) -> str:
    return re.sub(r"\s*\d+$", "", name or "").rstrip()


def _correct_name(extracted: str, choices: list) -> str:
    """Fuzzy-match OCR output to the closest official hero name (≥80% confidence).

    Uses token_set_ratio (word-order tolerant) weighted by a length-similarity
    factor so that a short OCR fragment like "sharun" cannot score equally against
    both "Sharun" and the longer "Dragon King Sharun".  Names whose length closely
    matches the extracted text are preferred over subset matches.

    An additional len_ratio guard rejects matches where the canonical name is much
    shorter than the OCR text (ratio < 0.5).  This prevents base-form names like
    "Celine" from winning over an unlisted alt-form like "Spirit Eye Celine".
    The guard is bypassed when confidence is very high (≥ 96).
    """
    from fuzzywuzzy import fuzz
    best, best_score, best_len_ratio = None, 0, 0
    ext_len = len(extracted) or 1
    for choice in choices:
        ts = fuzz.token_set_ratio(extracted, choice)
        len_ratio = min(ext_len, len(choice)) / max(ext_len, len(choice)) if choice else 0
        score = ts * (0.8 + 0.2 * len_ratio)
        if score > best_score or (score == best_score and len(choice) > len(best or "")):
            best_score = score
            best = choice
            best_len_ratio = len_ratio
    if best_score >= 80 and (best_len_ratio >= 0.5 or best_score >= 96):
        return best
    return None


def _ocr_image(pil_image: Image.Image, win_w: int, win_h: int) -> dict:
    """
    Run pytesseract on all OCR regions, scaled from the base calibration
    resolution to the actual window dimensions.
    Returns a raw stats dict (keys matching OCR_REGIONS + 'unit' etc.).
    """
    sx = win_w / float(OCR_BASE_W)
    sy = win_h / float(OCR_BASE_H)

    stats = {}
    for field, (bx, by, bw, bh) in OCR_REGIONS.items():
        x0 = int(round(bx * sx))
        y0 = int(round(by * sy))
        x1 = int(round((bx + bw) * sx))
        y1 = int(round((by + bh) * sy))
        crop = pil_image.crop((x0, y0, x1, y1))
        raw = pytesseract.image_to_string(crop, config="--psm 6").strip()
        stats[field] = _clean_stat(raw, keep_percentage=(field in PERCENTAGE_STATS))

    return stats


# ── Routes ───────────────────────────────────────────────────────────────────

@auto_import_bp.route("/auto_import/unit", methods=["POST"])
def auto_import_unit():
    """
    Receive a captured hero stat-screen frame, OCR it, and upsert the unit
    in the caller's ImageStats collection.

    Headers:  Authorization: Bearer <jwt>
    Form:     image=<file>  [win_w=<int>  win_h=<int>  optional]
    """
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    if not token:
        return jsonify({"error": "Authentication required"}), 401

    username = _verify_token(token)
    if not username:
        return jsonify({"error": "Invalid or expired token"}), 401

    if "image" not in request.files:
        return jsonify({"error": "No 'image' file in request"}), 400

    f = request.files["image"]
    if not f or f.filename == "":
        return jsonify({"error": "Empty file"}), 400

    # Client area dimensions (chrome already stripped by unit_scanner)
    try:
        win_w = int(request.form.get("win_w", OCR_BASE_W))
        win_h = int(request.form.get("win_h", OCR_BASE_H))
        chrome_x = int(request.form.get("chrome_x", 0))
        chrome_y = int(request.form.get("chrome_y", 0))
    except (TypeError, ValueError):
        win_w, win_h = OCR_BASE_W, OCR_BASE_H
        chrome_x = chrome_y = 0

    raw_bytes = f.read()
    try:
        pil_image = Image.open(io.BytesIO(raw_bytes))
    except Exception as e:
        return jsonify({"error": f"Cannot open image: {e}"}), 400

    # Crop window chrome (title bar + borders) so the image matches
    # the in-game screenshot format that the OCR regions were calibrated for.
    if chrome_y > 0 or chrome_x > 0:
        iw, ih = pil_image.size
        pil_image = pil_image.crop((chrome_x, chrome_y, iw - chrome_x, ih - chrome_x))

    # ── OCR ──────────────────────────────────────────────────────────────────
    stats = _ocr_image(pil_image, win_w, win_h)

    # Resolve unit name via fuzzy match against canonical list
    raw_name = _clean_unit_name(stats.get("unit", "")).lower()
    db = request.app_db

    # Load canonical names once per request (cached in app module via correct_unit_names)
    from app import correct_unit_names
    corrected = None

    # Heroes released after the Smilegate API was last updated.
    # Safe to leave here permanently — once Smilegate adds them the entry just
    # becomes a harmless duplicate and the fuzzy match still picks the right one.
    HERO_OVERRIDES = [
        "Aki",
        "Dragon King Sharun",
        "Hecate",
        "Lady of the Scales",
        "Monarch of the Sword Iseria",
        "Ruiza",
        "Shepherd of the Dark Diene",
        "Spirit Eye Celine",
    ]
    all_names = list(correct_unit_names) + [h for h in HERO_OVERRIDES if h not in correct_unit_names]

    if "draaon bride senva" in raw_name:
        corrected = "Dragon Bride Senya"
    elif "lady of the" in raw_name:
        # Decorative artwork behind this hero's name plate consistently corrupts
        # the OCR read (e.g. "lady of thes@@iee=").  Any prefix match is reliable.
        corrected = "Lady of the Scales"
    elif "new moon luna" in raw_name:
        corrected = "New Moon Luna"
    else:
        corrected = _correct_name(raw_name, all_names)

    if not corrected:
        # Fall back to the cleaned OCR text so the unit is still saved.
        # The user can rename it via the Edit button on the Your Units page.
        corrected = _clean_unit_name(stats.get("unit", "")).strip() or raw_name or "(unknown)"
        _log_event(db, username, "added", corrected, None,
                   "Hero name uncertain — OCR read used as-is. Edit in Your Units if wrong.")

    stats["unit"] = corrected
    stats["uploaded_by"] = username
    stats["user_rank"] = request.form.get("rta_rank", "")

    cp_raw = stats.get("cp", "")

    # ── Upsert ───────────────────────────────────────────────────────────────
    image_stats = db["ImageStats"]
    existing = image_stats.find_one({"uploaded_by": username, "unit": corrected})
    event_type = "updated" if existing else "added"

    if existing:
        image_stats.update_one(
            {"_id": existing["_id"]},
            {"$set": stats},
        )
    else:
        image_stats.insert_one(stats)

    # ── Log ──────────────────────────────────────────────────────────────────
    _log_event(db, username, event_type, corrected, cp_raw, "")

    return jsonify({
        "ok": True,
        "event_type": event_type,
        "hero_name": corrected,
        "cp": cp_raw,
    }), 200


def _log_event(db, username: str, event_type: str, hero_name: str, cp, message: str):
    db.scan_events.insert_one({
        "ts":         time.time() * 1000,  # milliseconds (JS Date compatible)
        "username":   username,
        "event_type": event_type,
        "hero_name":  hero_name,
        "cp":         cp,
        "message":    message or "",
    })


@auto_import_bp.route("/scan_events", methods=["GET"])
def scan_events():
    """
    GET /scan_events?username=<user>
    Returns the 50 most recent auto-import events for the given user.
    """
    username = request.args.get("username", "").strip()
    if not username:
        return jsonify({"ok": False, "events": []}), 200

    db = request.app_db
    cursor = (
        db.scan_events
        .find({"username": username}, {"_id": 0})
        .sort("ts", -1)
        .limit(50)
    )
    events = list(cursor)
    return jsonify({"ok": True, "events": events}), 200


@auto_import_bp.route("/monitor_status", methods=["GET"])
def monitor_status():
    """
    GET /monitor_status
    Returns {hero_scanner_running: bool} — read from module-level flag
    updated by Electron via POST /auto_import/set_status.
    """
    return jsonify({"hero_scanner_running": _unit_scanner_running}), 200


@auto_import_bp.route("/auto_import/set_status", methods=["POST"])
def set_status():
    """
    POST /auto_import/set_status   Body: {running: bool}
    Called by Electron main when the unit scanner starts or stops.
    Only accepts requests from localhost.
    """
    global _unit_scanner_running
    remote = request.remote_addr or ""
    if remote not in ("127.0.0.1", "::1", "localhost"):
        return jsonify({"error": "Forbidden"}), 403

    body = request.get_json(silent=True) or {}
    _unit_scanner_running = bool(body.get("running", False))
    return jsonify({"ok": True, "running": _unit_scanner_running}), 200
