# backend/scripts/hero_images.py
#
# Flask Blueprint that serves hero portrait images from a local cache directory.
# Lookup strategy (in order):
#   1. Exact filename match: hero_images/<slug>.png
#   2. Fuzzy filename match via slugified index (prefix / substring checks)
#   3. Network fallback: fetch from epic7db.com API, save locally, then serve
#
# The image index (_INDEX) is built lazily on first request and invalidated
# whenever a new image is downloaded from the network fallback.
#
from __future__ import annotations
import re, os
from pathlib import Path
from typing import Optional, List, Tuple
from flask import Blueprint, send_from_directory, request, jsonify, current_app
from dotenv import load_dotenv

load_dotenv()

# Optional dependency for fallback
try:
    import requests  # pip install requests
except Exception:  # pragma: no cover
    requests = None

HERO_BP = Blueprint("hero_images", __name__)

# ---------- config ----------
E7DB_SUFFIX = os.getenv('E7DB_SUFFIX') # matches your previous API usage
# You can disable network fallback by setting app.config["HERO_IMAGES_FALLBACK"]=False
# You can override images dir with app.config["HERO_IMAGES_DIR"] = ".../hero_images"
# ----------------------------

def _slugify(name: str) -> str:
    """
    Normalize a hero name or filename stem to a URL-safe slug.
    e.g. "New Moon Luna" -> "new-moon-luna", "Destina (Tenebria)" -> "destina-tenebria"
    Used for both URL routing and file-system lookup to ensure consistent matching.
    """
    s = (name or "").strip().lower()
    s = re.sub(r"[‘’`.,/()_]", " ", s)     # drop punctuation-ish
    s = re.sub(r"\s+", "-", s).strip("-")  # spaces -> dash
    s = re.sub(r"[^a-z0-9\-]", "", s)      # keep a-z0-9-
    s = re.sub(r"-{2,}", "-", s)           # collapse --
    return s

def _hero_dir() -> Path:
    """Return the hero images folder. Can be overridden via app.config['HERO_IMAGES_DIR']."""
    cfg = current_app.config.get("HERO_IMAGES_DIR")
    if cfg:
        return Path(cfg).resolve()
    return Path(__file__).resolve().parents[1] / "hero_images"

def _ensure_dir():
    d = _hero_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d

def _normalize_filename(p: Path) -> str:
    return _slugify(p.stem)

# Lazy index: list of (Path, slugified_stem) for every .png in the hero_images folder.
# Rebuilt on first request and invalidated after any network download.
_INDEX: List[Tuple[Path, str]] | None = None

def _reset_index():
    """Invalidate the filename index so it is rebuilt on the next request."""
    global _INDEX
    _INDEX = None

def _ensure_index() -> List[Tuple[Path, str]]:
    global _INDEX
    if _INDEX is None:
        folder = _hero_dir()
        _INDEX = [(p, _normalize_filename(p)) for p in folder.glob("*.png")]
    return _INDEX

def _find_best_filename(slug: str) -> Optional[str]:
    """
    Find the best matching .png filename for a given slug using a three-tier lookup:
      1. Exact match: hero_images/<slug>.png (fastest path)
      2. Exact slugified-stem match from the full index
      3. Prefix/suffix match (handles variant suffixes like "-1" or "-skin")
      4. Substring containment match (loosest; avoids network fallback for near-misses)
    Returns the filename (not full path) or None if no match found.
    """
    folder = _hero_dir()
    exact = folder / f"{slug}.png"
    if exact.exists():
        return exact.name

    index = _ensure_index()

    for p, norm in index:
        if norm == slug:
            return p.name
    for p, norm in index:
        if norm.startswith(slug) or slug.startswith(norm):
            return p.name
    for p, norm in index:
        if slug in norm or norm in slug:
            return p.name
    return None

def _fallback_fetch_and_cache(slug: str) -> Optional[str]:
    """Fetch from epic7db then save as <slug>.png in hero_images.
    Returns filename or None.
    """
    if not current_app.config.get("HERO_IMAGES_FALLBACK", True):
        return None
    if requests is None:
        current_app.logger.warning("[hero_image] requests not available; cannot fallback-fetch.")
        return None

    try:
        api = f"https://epic7db.com/api/heroes/{slug}/{E7DB_SUFFIX}"
        r = requests.get(api, timeout=6)
        if r.status_code != 200:
            current_app.logger.info(f"[hero_image] fallback API miss {api} ({r.status_code})")
            return None
        data = r.json() if r.headers.get("content-type","").startswith("application/json") else {}
        img_url = data.get("image")
        if not img_url:
            current_app.logger.info(f"[hero_image] fallback JSON had no 'image' for slug='{slug}'")
            return None

        ir = requests.get(img_url, timeout=8)
        if ir.status_code != 200:
            current_app.logger.info(f"[hero_image] image fetch failed {img_url} ({ir.status_code})")
            return None

        folder = _ensure_dir()
        out = folder / f"{slug}.png"
        out.write_bytes(ir.content)
        _reset_index()
        current_app.logger.info(f"[hero_image] cached '{out.name}' from epic7db")
        return out.name
    except Exception as e:
        current_app.logger.exception(f"[hero_image] fallback error for slug='{slug}': {e}")
        return None

def _serve(fname: str):
    folder = _hero_dir()
    return send_from_directory(str(folder), fname, mimetype="image/png", max_age=86400)

def _serve_placeholder():
    """Return Aither's portrait as a stand-in when no matching image can be found.
    Tries the local cache first, then falls back to Epic7DB the same way as any other hero.
    Returns a Flask response or None if Aither itself cannot be located.
    """
    fname = _find_best_filename("aither")
    if fname:
        return _serve(fname)
    fetched = _fallback_fetch_and_cache("aither")
    if fetched:
        return _serve(fetched)
    return None

@HERO_BP.route("/hero_image/<slug>", methods=["GET"])
def hero_image_by_slug(slug: str):
    slug = _slugify(slug)
    folder = _hero_dir()

    fname = _find_best_filename(slug)
    if not fname:
        # try network fallback + cache
        fetched = _fallback_fetch_and_cache(slug)
        if fetched:
            return _serve(fetched)
        current_app.logger.info(f"[hero_image] not found slug='{slug}', serving placeholder")
        placeholder = _serve_placeholder()
        if placeholder:
            return placeholder
        return jsonify({"success": False, "error": "not_found", "slug": slug, "folder": str(folder)}), 404

    return _serve(fname)

@HERO_BP.route("/hero_image_by_unit", methods=["GET"])
def hero_image_by_unit():
    unit = request.args.get("unit", "")
    slug = _slugify(unit)
    folder = _hero_dir()

    fname = _find_best_filename(slug)
    if not fname:
        fetched = _fallback_fetch_and_cache(slug)
        if fetched:
            return _serve(fetched)
        current_app.logger.info(f"[hero_image_by_unit] not found unit='{unit}', serving placeholder")
        placeholder = _serve_placeholder()
        if placeholder:
            return placeholder
        return jsonify({"success": False, "error": "not_found", "unit": unit, "slug": slug, "folder": str(folder)}), 404

    return _serve(fname)

# ---- optional debug helpers ----
@HERO_BP.route("/hero_image/_where", methods=["GET"])
def hero_image_where():
    folder = _hero_dir()
    return jsonify({"folder": str(folder), "count": len(list(folder.glob('*.png')))})

@HERO_BP.route("/hero_image/_list", methods=["GET"])
def hero_image_list():
    folder = _hero_dir()
    files = sorted([p.name for p in folder.glob("*.png")])
    limit = int(request.args.get("limit", 100))
    return jsonify({"folder": str(folder), "total": len(files), "files": files[:limit]})
# --------------------------------

def register_hero_images(app):
    app.register_blueprint(HERO_BP)
