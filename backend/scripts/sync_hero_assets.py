# backend/scripts/sync_hero_assets.py
#
# Runs once in a background thread when Flask starts.
# Fetches the full hero list from the Smilegate API and ensures every hero has:
#   1. A portrait PNG in hero_images/<slug>.png          (display cache)
#   2. A portrait PNG in SiftMatching/data/templates/<slug>/default.png  (SIFT)
#
# Images that already exist on disk are never re-downloaded.
# A small sleep between requests keeps traffic to epic7db polite.
import os
import re
import time
import threading
import logging
from pathlib import Path

log = logging.getLogger(__name__)

SMILEGATE_URL = "https://static.smilegatemegaport.com/gameRecord/epic7/epic7_hero.json"


def _slugify(name: str) -> str:
    """Matches the slugify used in scripts/hero_images.py."""
    s = (name or "").strip().lower()
    s = re.sub(r"[''`.,/()_]", " ", s)
    s = re.sub(r"\s+", "-", s).strip("-")
    s = re.sub(r"[^a-z0-9\-]", "", s)
    s = re.sub(r"-{2,}", "-", s)
    return s


def _fetch_hero_names() -> list:
    try:
        import requests as req
        r = req.get(SMILEGATE_URL, timeout=10)
        if r.status_code == 200:
            data = r.json()
            return [h["name"] for h in data.get("en", []) if h.get("name")]
    except Exception as e:
        log.warning(f"[sync] Could not fetch hero list: {e}")
    return []


def _fetch_image_bytes(slug: str, e7db_suffix: str):
    try:
        import requests as req
        api_url = f"https://epic7db.com/api/heroes/{slug}/{e7db_suffix}"
        r = req.get(api_url, timeout=6)
        if r.status_code != 200:
            return None
        ct = r.headers.get("content-type", "")
        if not ct.startswith("application/json"):
            return None
        img_url = r.json().get("image")
        if not img_url:
            return None
        ir = req.get(img_url, timeout=8)
        if ir.status_code == 200:
            return ir.content
    except Exception as e:
        log.debug(f"[sync] image fetch failed for '{slug}': {e}")
    return None


def sync_hero_assets(hero_images_dir: Path, templates_dir: Path, e7db_suffix: str):
    """
    Download portrait images for any hero that is missing from the local cache.
    Called once in a daemon thread at Flask startup.
    """
    hero_names = _fetch_hero_names()
    if not hero_names:
        log.info("[sync] Hero list unavailable — skipping asset sync.")
        return

    log.info(f"[sync] Checking assets for {len(hero_names)} heroes…")
    hero_images_dir.mkdir(parents=True, exist_ok=True)
    downloaded = 0

    for name in hero_names:
        slug = _slugify(name)
        if not slug:
            continue

        portrait_path = hero_images_dir / f"{slug}.png"
        template_path = templates_dir / slug / "default.png"

        needs_portrait = not portrait_path.exists()
        needs_template = not template_path.exists()

        if not needs_portrait and not needs_template:
            continue  # already cached — skip network entirely

        img_bytes = _fetch_image_bytes(slug, e7db_suffix)
        if not img_bytes:
            continue

        if needs_portrait:
            portrait_path.write_bytes(img_bytes)
            log.info(f"[sync] portrait  ← {slug}.png")
            downloaded += 1

        if needs_template:
            template_path.parent.mkdir(parents=True, exist_ok=True)
            template_path.write_bytes(img_bytes)
            log.info(f"[sync] template  ← {slug}/default.png")
            downloaded += 1

        time.sleep(0.15)  # polite rate-limit; only when we actually downloaded

    log.info(f"[sync] Done. {downloaded} new image(s) saved.")


def start_sync(app):
    """Kick off the sync in a daemon thread so Flask startup is not blocked."""
    backend_dir = Path(__file__).resolve().parents[1]
    hero_images_dir = backend_dir / "hero_images"
    templates_dir   = backend_dir / "SiftMatching" / "data" / "templates"
    e7db_suffix     = os.getenv("E7_DB_KEY", "")

    t = threading.Thread(
        target=sync_hero_assets,
        args=(hero_images_dir, templates_dir, e7db_suffix),
        daemon=True,
        name="hero-asset-sync",
    )
    t.start()
    app.logger.info("[sync] Hero asset sync started in background.")
