# backend/routes_detect.py
#
# Exposes a single endpoint that runs the SIFT hero detection pipeline
# against a user-uploaded screenshot. Detection runs in a subprocess rather
# than in-process so that OpenCV crashes or long-running GPU ops don't
# affect the Flask worker.
#
import json, os, tempfile, subprocess
from pathlib import Path
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename

bp = Blueprint("detect", __name__)

# Absolute paths so the subprocess inherits the correct working directory
MATCHER_DIR = Path(__file__).resolve().parents[1] / "SiftMatching"
CONFIG_PATH = MATCHER_DIR / "config" / "roi_config.json"
TEMPLATES_DIR = MATCHER_DIR / "data" / "templates"
DETECT_SCRIPT = MATCHER_DIR / "detect_once.py"
# detect_once.py writes its output here; we read it back after the process exits
OUT_JSON = MATCHER_DIR / "out" / "matches.json"

@bp.route("/detect-once", methods=["POST"])
def detect_once():
    """
    Accept a screenshot (multipart field 'screen'), run SIFT detection,
    and return the matched heroes as JSON.

    Flow:
      1. Save upload to a temporary directory.
      2. Spawn detect_once.py as a subprocess (keeps OpenCV out of the Flask process).
      3. Read the JSON result written to SiftMatching/out/matches.json.
      4. Return it to the caller, or stderr on failure.
    """
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
            except Exception:
                pass

        # Fallback: return stderr/stdout for debugging
        return jsonify({
            "error": "matcher did not produce JSON",
            "stdout": proc.stdout,
            "stderr": proc.stderr
        }), 500
