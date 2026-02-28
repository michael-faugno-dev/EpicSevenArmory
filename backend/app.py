"""
app.py — Main Flask backend for Epic Seven Armory.

Responsibilities:
  - REST API for unit management (upload, read, update, delete)
  - OCR-based stat extraction from in-game screenshots (PyTesseract)
  - JSON import from Fribbels Optimizer exports
  - Twitch overlay data (selected units per user)
  - Profile management and JWT authentication

External services:
  - Google OAuth 2.0  (scripts/google_auth_native.py)
  - Smilegate static API — canonical hero name list
  - epic7db.com — hero images (proxied via scripts/hero_images.py)
  - MongoDB Atlas — persistent data store
"""

from flask import Flask, request, jsonify, make_response
from PIL import Image
import requests
from werkzeug.utils import secure_filename
import json
import os
import logging
import re
import atexit
from functools import wraps
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from bson.objectid import ObjectId
from dotenv import load_dotenv
from fuzzywuzzy import fuzz
import pytesseract
import jwt as pyjwt
from routes_draft import draft_bp

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or 'dev-only-secret-change-me'
app.config['UPLOAD_FOLDER'] = 'static/uploads/'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB upload limit

myApiUser = os.getenv('E7_DB_KEY')

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'json'}

def allowed_file(filename):
    """Return True only if the uploaded file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Path to Tesseract inside project
script_dir = os.path.dirname(os.path.abspath(__file__))
tesseract_path = os.path.join(script_dir, 'Pytesseract', 'tesseract.exe')
pytesseract.pytesseract.tesseract_cmd = tesseract_path

MONGO_URI = os.getenv("MONGO_URI")

# ------------------------
# CORS configuration
# ------------------------
ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "https://epicsevenarmoryserver-1.onrender.com"
}

ALLOWED_HEADERS = "Content-Type, Authorization, Username"
ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS"
MAX_AGE = "86400"

def _origin_allowed(origin: str) -> bool:
    """Return True only for explicitly trusted web origins."""
    return bool(origin and origin in ALLOWED_ORIGINS)

def _is_electron_origin(origin: str) -> bool:
    """
    Electron renders from file:// which sends a null/empty Origin header.
    We allow wildcard CORS for these requests only — not for unknown web origins.
    """
    return not origin or origin == "null"

from routes_detect import bp as detect_bp
app.register_blueprint(detect_bp)

@app.before_request
def attach_db():
    request.app_db = db

@app.before_request
def handle_cors_preflight():
    if request.method == "OPTIONS":
        origin = request.headers.get("Origin", "")
        resp = make_response("", 204)
        if _origin_allowed(origin):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
            resp.headers["Vary"] = "Origin"
        elif _is_electron_origin(origin):
            resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = ALLOWED_HEADERS
        resp.headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS
        resp.headers["Access-Control-Max-Age"] = MAX_AGE
        return resp

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    if _origin_allowed(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    elif _is_electron_origin(origin):
        response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = ALLOWED_HEADERS
    response.headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS
    return response

app.register_blueprint(draft_bp)

# Set up logging
handler = logging.StreamHandler()
handler.setLevel(logging.INFO)
app.logger.addHandler(handler)
app.logger.setLevel(logging.INFO)

# MongoDB connection
client = MongoClient(MONGO_URI, server_api=ServerApi('1'))
atexit.register(client.close)

db = client['epic_seven_armory']
users_collection = db['Users']
image_stats_collection = db['ImageStats']

# Create indexes for performance
try:
    image_stats_collection.create_index("uploaded_by")
    db.selected_units.create_index("username", unique=True)
except Exception as e:
    app.logger.warning(f"Could not create indexes: {e}")

# Google OAuth blueprint
from scripts.google_auth_native import register_google_auth_blueprint
register_google_auth_blueprint(app, users_collection=users_collection, db=db)

from scripts.hero_images import register_hero_images
register_hero_images(app)

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ------------------------
# JWT auth decorator
# ------------------------
def require_auth(f):
    """
    Decorator that enforces JWT authentication on a route.

    Expects:  Authorization: Bearer <token>
    On success: sets request.jwt_username from the token payload.
    On failure: returns 401 JSON error — never proceeds to the route handler.

    Usage:
        @app.route('/protected')
        @require_auth
        def protected():
            username = request.jwt_username
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        token = None
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
        if not token:
            return jsonify({"error": "Authentication required"}), 401
        try:
            payload = pyjwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            # Attach the verified username to the request context
            request.jwt_username = payload.get('username', '')
        except pyjwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired, please sign in again"}), 401
        except pyjwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated

# ------------------------
# Helper functions
# ------------------------

def load_unit_names(api_url, language_code='en'):
    try:
        response = requests.get(api_url, timeout=10)
        response.raise_for_status()
        data = response.json()
        unit_names = [unit['name'] for unit in data[language_code]]
        unit_names.sort()
        return unit_names
    except Exception as e:
        app.logger.error(f"Failed to load unit names: {e}")
        return []

# Fetch hero name list once at startup and cache it in memory.
# Used by correct_name() to fuzzy-match OCR output to valid hero names.
api_url = 'https://static.smilegatemegaport.com/gameRecord/epic7/epic7_hero.json'
correct_unit_names = load_unit_names(api_url, 'en')

def fetch_unit_data(unit_name):
    if unit_name == "Ainos 2.0":
        formatted_unit_name = "ainos-20"
    else:
        formatted_unit_name = unit_name.replace(' ', '-')
    url = f'https://epic7db.com/api/heroes/{formatted_unit_name.lower()}/{myApiUser}'
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        app.logger.error(f"Failed to fetch unit data for {unit_name}: {e}")
    return None

def fetch_unit_image(unit_name):
    slug = unit_name.replace(' ', '-').lower()
    url = f'https://epic7db.com/api/heroes/{slug}/{myApiUser}'
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            return response.json().get('image', '')
    except Exception as e:
        app.logger.error(f"Failed to fetch unit image for {unit_name}: {e}")
    return ''

def correct_name(extracted_name, choices):
    """
    Fuzzy-match an OCR-extracted name to the closest official hero name.

    Uses token_set_ratio which handles word order differences well (e.g.
    "Luna New Moon" vs "New Moon Luna"). On a tie, prefers the longer name
    to avoid matching short common words. Returns None if confidence < 80.
    """
    best_match = None
    best_score = 0
    for choice in choices:
        score = fuzz.token_set_ratio(extracted_name, choice)
        if score > best_score or (score == best_score and len(choice) > len(best_match or '')):
            best_score = score
            best_match = choice
    if best_score > 80:
        return best_match
    return None

def clean_stat(stat, keep_percentage=False):
    """
    Sanitise a raw OCR string for a single stat field.
    - Strips artefact characters that Tesseract commonly misreads (*, :, Â©).
    - Truncates at the first period or pipe — OCR occasionally runs lines together.
    - Appends/strips the '%' suffix depending on whether the field is a percentage.
    """
    stat = re.sub(r'[*:Â©]', '', stat or '').strip()
    stat = re.split(r'[.|]', stat)[0].strip()
    if keep_percentage:
        if stat and not stat.endswith('%'):
            stat += '%'
    else:
        stat = stat.rstrip('%')
    return stat

def clean_unit_name(name):
    """Strip trailing level numbers that Tesseract reads off hero name banners (e.g. 'Arby 60')."""
    cleaned_name = re.sub(r'\s*\d+$', '', name or '')
    return cleaned_name.rstrip()

def process_image(image, username, rta_rank):
    """
    Extract hero stats from an Epic Seven unit info screenshot using OCR.

    Pixel coordinates below are calibrated for the standard 1440×2960 screenshot
    resolution exported from the in-game unit detail screen. Different device
    resolutions will require adjusting these regions.
    """
    regions = {
        'unit': {'x': 150, 'y': 170, 'width': 700, 'height': 60},
        'cp': {'x': 207, 'y': 555, 'width': 200, 'height': 50},
        'imprint': {'x': 275, 'y': 360, 'width': 190, 'height': 100},
        'attack': {'x': 418, 'y': 620, 'width': 70, 'height': 29},
        'defense': {'x': 418, 'y': 648, 'width': 70, 'height': 34},
        'health': {'x': 394, 'y': 683, 'width': 100, 'height': 34},
        'speed': {'x': 385, 'y': 720, 'width': 100, 'height': 29},
        'critical_hit_chance': {'x': 385, 'y': 750, 'width': 100, 'height': 29},
        'critical_hit_damage': {'x': 385, 'y': 785, 'width': 100, 'height': 34},
        'effectiveness': {'x': 385, 'y': 820, 'width': 100, 'height': 34},
        'effect_resistance': {'x': 385, 'y': 850, 'width': 100, 'height': 34},
        'set1': {'x': 210, 'y': 942, 'width': 200, 'height': 34},
        'set2': {'x': 210, 'y': 976, 'width': 200, 'height': 34},
        'set3': {'x': 210, 'y': 1010, 'width': 200, 'height': 34}
    }

    stats = {name: pytesseract.image_to_string(
        image.crop((data['x'], data['y'], data['x'] + data['width'], data['y'] + data['height'])),
        config='--psm 6'
    ).strip() for name, data in regions.items()}

    percentage_stats = ["imprint", 'critical_hit_chance', 'critical_hit_damage', 'effectiveness', 'effect_resistance']
    for key in stats:
        if key not in ['unit', 'uploaded_by', 'user_rank']:
            stats[key] = clean_stat(stats[key], keep_percentage=(key in percentage_stats))

    if 'unit' in stats:
        unit_name = clean_unit_name(stats['unit']).lower()
        # Hard-coded corrections for heroes whose names are consistently
        # misread by Tesseract due to unusual glyphs in the game font.
        if "draaon bride senva" in unit_name:
            stats['unit'] = "Dragon Bride Senya"
        elif "new moon luna" in unit_name:
            stats['unit'] = "New Moon Luna"
        else:
            corrected_name = correct_name(unit_name, correct_unit_names)
            if corrected_name:
                stats['unit'] = corrected_name
            else:
                app.logger.warning(f"No matching unit name found for: {stats['unit']}")

    stats['uploaded_by'] = username
    stats['user_rank'] = rta_rank

    result = image_stats_collection.insert_one(stats)
    stats['_id'] = str(result.inserted_id)
    return stats

def process_json(file_path, username, rta_rank):
    """
    Import hero stats from a Fribbels Epic Seven Optimizer export (.json).
    Heroes with all-zero stats (attack/hp/def == 0) are skipped — they are
    placeholders in the optimizer that haven't been geared yet.
    """
    with open(file_path, 'r', encoding='utf-8') as json_file:
        data = json.load(json_file)

    results = []
    for hero in data.get('heroes', []):
        if hero.get('atk') == 0 and hero.get('hp') == 0 and hero.get('def') == 0:
            continue

        def format_number(num): return f"{num:,}"
        def format_percentage(num): return f"{num:.1f}%"
        def format_set_name(set_name):
            if not set_name:
                return "No set effect"
            words = str(set_name).split('_')
            return ' '.join(word.capitalize() for word in words)

        stats = {
            'unit': hero.get('name', ''),
            'cp': format_number(hero.get('cp', 0)),
            'imprint': hero.get('imprint', 'Locked'),
            'attack': format_number(hero.get('atk', 0)),
            'defense': format_number(hero.get('def', 0)),
            'health': format_number(hero.get('hp', 0)),
            'speed': str(hero.get('spd', '')),
            'critical_hit_chance': format_percentage(hero.get('cr', 0.0)),
            'critical_hit_damage': format_percentage(hero.get('cd', 0.0)),
            'effectiveness': format_percentage(hero.get('eff', 0.0)),
            'effect_resistance': format_percentage(hero.get('res', 0.0)),
            'uploaded_by': username,
            'user_rank': rta_rank
        }

        equipment = hero.get('equipment', {})
        sets = [format_set_name(item.get('set')) for item in equipment.values() if item and 'set' in item]
        stats['set1'] = sets[0] if len(sets) > 0 else "No set effect"
        stats['set2'] = sets[1] if len(sets) > 1 else "No set effect"
        stats['set3'] = sets[2] if len(sets) > 2 else "No set effect"

        for key, value in stats.items():
            stats[key] = str(value)

        result = image_stats_collection.insert_one(stats)
        stats['_id'] = str(result.inserted_id)
        results.append(stats)

    return results

# ------------------------
# Routes
# ------------------------

@app.route('/get_unit_names', methods=['GET'])
def get_unit_names():
    names = list(correct_unit_names)
    names.sort()
    return jsonify(names)

@app.route('/upload_files', methods=['POST'])
@require_auth
def upload_files():
    uploaded_files = []
    for key, file in request.files.items():
        if key.startswith('file') and file and file.filename != '':
            if not allowed_file(file.filename):
                return jsonify({"error": f"File type not allowed: {file.filename}"}), 400
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            uploaded_files.append(filename)
    if 'file' in request.files and not uploaded_files:
        file = request.files['file']
        if file.filename != '':
            if not allowed_file(file.filename):
                return jsonify({"error": f"File type not allowed: {file.filename}"}), 400
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            uploaded_files.append(filename)
    if 'json_file' in request.files:
        json_file = request.files['json_file']
        if json_file.filename != '':
            if not allowed_file(json_file.filename):
                return jsonify({"error": f"File type not allowed: {json_file.filename}"}), 400
            filename = secure_filename(json_file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            json_file.save(file_path)
            uploaded_files.append(filename)
    if uploaded_files:
        return jsonify({"message": "Files uploaded successfully", "filenames": uploaded_files}), 200
    return jsonify({"error": "No files uploaded"}), 400

@app.route('/display', methods=['POST'])
@require_auth
def display_image():
    """
    Process previously-uploaded files and extract unit stats.
    Called immediately after /upload_files with the returned filenames.
    The username is taken from the verified JWT — not the POST body —
    so a user cannot forge stats onto another account.
    """
    data = request.json or {}
    filenames = data.get('filenames')
    username = request.jwt_username
    rta_rank = data.get('rank')
    is_json = data.get('isJson', False)

    if not filenames:
        return jsonify({"error": "No filenames provided"}), 400
    if isinstance(filenames, str):
        filenames = [filenames]

    results = []
    for filename in filenames:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        try:
            if not os.path.exists(file_path):
                return jsonify({"error": f"File not found: {filename}"}), 404
            if is_json:
                result = process_json(file_path, username, rta_rank)
                results.extend(result)
            else:
                image = Image.open(file_path)
                result = process_image(image, username, rta_rank)
                results.append(result)
        finally:
            # Always clean up uploaded file, even if processing failed
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception as e:
                    app.logger.warning(f"Could not remove temp file {file_path}: {e}")

    return jsonify(results), 200

@app.route("/profile", methods=['GET'])
def profile_get():
    username = request.args.get('username', '')
    if not username:
        return jsonify({"success": False, "error": "Username required"}), 400
    user = users_collection.find_one({"username": username}, {
        "_id": 0,
        "google_id": 0,
        "email": 0,           # PII — not needed by any public consumer
        "access_token": 0,    # legacy empty field
        # top-level twitch fields from old schema — excluded in favour of links.twitch
        "twitch_user_id": 0,
        "twitch_display_name": 0,
        "twitch_avatar_url": 0,
        "twitch_linked_at": 0,
    })
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404
    return jsonify({"success": True, "profile": user}), 200

@app.route("/profile", methods=['POST'])
@require_auth
def profile_update():
    form = request.get_json()
    if not form:
        return jsonify({"error": "Form data is invalid"}), 400
    updated_data = {
        "username": form.get('username'),
        "epic_seven_account": form.get('epic_seven_account'),
        "streamer_name": form.get('streamer_name'),
        "rta_rank": form.get('rta_rank')
    }
    result = users_collection.update_one({"username": form.get('username')}, {"$set": updated_data})
    if result.matched_count > 0:
        return jsonify({"message": "Profile updated successfully"}), 200
    return jsonify({"error": "User not found"}), 404

@app.route('/update_profile', methods=['POST'])
@require_auth
def update_profile():
    """Alias for POST /profile for backward compatibility."""
    return profile_update()

@app.route('/your_units', methods=['GET', 'POST', 'OPTIONS'])
@require_auth
def your_units():
    if request.method == 'OPTIONS':
        return "", 204

    username = request.jwt_username or request.headers.get('Username') or request.headers.get('username') or request.args.get('username')

    if request.method == 'GET':
        if not username:
            return jsonify([]), 200
        units = list(image_stats_collection.find({"uploaded_by": username}))
        if not units:
            return jsonify([]), 200
        for unit in units:
            unit['_id'] = str(unit['_id'])
        units = sorted(units, key=lambda x: x.get('unit', ''))
        return jsonify(units), 200

    elif request.method == 'POST':
        form = request.get_json() or {}
        unit_name = form.get('unit')
        if not username:
            return jsonify({"error": "Username not provided"}), 400
        unit = image_stats_collection.find_one({"uploaded_by": username, "unit": unit_name})
        if unit:
            unit['_id'] = str(unit['_id'])
            return jsonify(unit), 200
        return jsonify({"error": "Unit not found"}), 404

@app.route('/delete_unit', methods=['POST'])
@require_auth
def delete_unit():
    data = request.get_json()
    unit_id = data.get('unit_to_delete')
    username = request.jwt_username or request.headers.get('Username')

    if not username:
        return jsonify({"error": "Username not provided"}), 400
    if not unit_id:
        return jsonify({"error": "Unit ID not provided"}), 400

    result = image_stats_collection.delete_one({"_id": ObjectId(unit_id), "uploaded_by": username})
    if result.deleted_count > 0:
        return jsonify({"message": "Unit deleted successfully"}), 200
    return jsonify({"error": "Unit not found or not authorized to delete"}), 404

@app.route('/update_unit_stats', methods=['POST'])
@require_auth
def update_unit_stats():
    payload = request.get_json(silent=True) or {}
    unit_id = payload.get('unit_id')
    updates = payload.get('updates') or {}
    username = request.jwt_username or request.headers.get('Username') or request.headers.get('username') or request.args.get('username')

    if not username:
        return jsonify({"error": "Username not provided"}), 400
    if not unit_id:
        return jsonify({"error": "unit_id is required"}), 400

    allowed = {
        "unit", "name", "unit_name",
        "attack", "defense", "health", "speed",
        "imprint",
        "critical_hit_chance", "critical_hit_damage",
        "effectiveness", "effect_resistance",
        "set1", "set2", "set3",
    }
    clean = {k: v for k, v in updates.items() if k in allowed}

    if not clean:
        return jsonify({"error": "No valid fields to update"}), 400

    for f in ("attack", "defense", "health", "speed"):
        if f in clean:
            try:
                if clean[f] in ("", None):
                    clean[f] = None
                else:
                    clean[f] = int(float(clean[f]))
            except (ValueError, TypeError):
                return jsonify({"error": f"Invalid numeric value for field '{f}'"}), 400

    set_doc = {}
    for k, v in clean.items():
        set_doc[k] = v
        set_doc[f"stats.{k}"] = v

    result = image_stats_collection.update_one(
        {"_id": ObjectId(unit_id), "uploaded_by": username},
        {"$set": set_doc}
    )

    if result.matched_count == 0:
        return jsonify({"error": "Unit not found or not authorized to update"}), 404

    updated = image_stats_collection.find_one({"_id": ObjectId(unit_id)})
    if updated:
        updated["_id"] = str(updated["_id"])
    return jsonify({"ok": True, "unit": updated}), 200

@app.route('/update_unit', methods=['POST'])
@require_auth
def update_unit_alias():
    return update_unit_stats()

@app.route('/update_selected_units', methods=['POST'])
@require_auth
def update_selected_units():
    username = request.jwt_username or request.headers.get('Username')
    if not username:
        return jsonify({"error": "Username not provided"}), 400

    data = request.json
    selected_units = data.get('units', [])
    selected_units = selected_units[:4]
    while len(selected_units) < 4:
        selected_units.append(None)

    result = db.selected_units.update_one(
        {"username": username},
        {"$set": {
            "unit_id1": selected_units[0]['id'] if selected_units[0] else None,
            "unit_id2": selected_units[1]['id'] if selected_units[1] else None,
            "unit_id3": selected_units[2]['id'] if selected_units[2] else None,
            "unit_id4": selected_units[3]['id'] if selected_units[3] else None
        }},
        upsert=True
    )

    if result.acknowledged:
        return jsonify({'status': 'success'}), 200
    return jsonify({'status': 'error', 'message': 'Failed to update selected units'}), 500

@app.route('/get_selected_units_data', methods=['GET'])
@require_auth
def get_selected_units_data():
    username = request.jwt_username or request.headers.get('Username')
    if not username:
        return jsonify({"error": "Username not provided"}), 400

    selected_units = db.selected_units.find_one({"username": username})
    if not selected_units:
        return jsonify([]), 200

    unit_ids = [selected_units.get(f'unit_id{i}') for i in range(1, 5) if selected_units.get(f'unit_id{i}')]

    units_data = []
    for unit_id in unit_ids:
        unit = image_stats_collection.find_one({"_id": ObjectId(unit_id)})
        if unit:
            unit['_id'] = str(unit['_id'])
            units_data.append(unit)

    return jsonify(units_data), 200

if __name__ == '__main__':
    app.logger.info("Starting HTTP dev server on http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=True, threaded=True)
