# backend/routes_detect.py
import json, os, tempfile, subprocess
from pathlib import Path
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename

bp = Blueprint("detect", __name__)

MATCHER_DIR = Path(__file__).resolve().parents[1] / "SiftMatching"
CONFIG_PATH = MATCHER_DIR / "config" / "roi_config.json"
TEMPLATES_DIR = MATCHER_DIR / "data" / "templates"
DETECT_SCRIPT = MATCHER_DIR / "detect_once.py"
OUT_JSON = MATCHER_DIR / "out" / "matches.json"

@bp.route("/detect-once", methods=["POST"])
def detect_once():
    f = request.files.get("screen")
    if not f:
        return jsonify({"error": "missing 'screen' file"}), 400

    # Write upload to a temp file
    with tempfile.TemporaryDirectory() as td:
        img_path = Path(td) / secure_filename(f.filename or "frame.png")
        f.save(str(img_path))

        # Run the matcher (it will write out/matches.json inside MATCHER_DIR)
        cmd = [
            "python", str(DETECT_SCRIPT),
            "--screen", str(img_path),
            "--templates", str(TEMPLATES_DIR),
            "--config", str(CONFIG_PATH),
        ]
        proc = subprocess.run(cmd, cwd=str(MATCHER_DIR), capture_output=True, text=True)

        # Try to read the matcher JSON output
        if OUT_JSON.exists():
            try:
                data = json.loads(OUT_JSON.read_text(encoding="utf-8"))
                return jsonify(data)
            except Exception as e:
                pass

        # Fallback: return stderr/stdout for debugging
        return jsonify({
            "error": "matcher did not produce JSON",
            "stdout": proc.stdout,
            "stderr": proc.stderr
        }), 500
