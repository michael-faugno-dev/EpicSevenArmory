import argparse
import json
import os
import re
import shutil
from pathlib import Path
from typing import Dict, Tuple

# Supported image extensions
EXTS = {".png", ".jpg", ".jpeg", ".webp"}

# Where we write a log of moves (for undo/debug)
LOG_PATH = Path("out/organize_log.json")

def sanitize(text: str) -> str:
    """
    Normalize hero IDs and variant names:
    - lowercase
    - spaces -> hyphens
    - keep letters, numbers, hyphens, underscores only
    """
    t = text.strip().lower().replace(" ", "-")
    t = re.sub(r"[^a-z0-9\-_]+", "-", t)
    t = re.sub(r"-{2,}", "-", t).strip("-")
    return t or "unknown"

def parse_name(filename: str) -> Tuple[str, str]:
    """
    Heuristics to split hero vs variant from a filename (no extension):
    Priority:
      1) 'hero@variant'
      2) 'hero__variant'
      3) default: hero = whole name, variant='default'
    Examples:
      'celine'                -> ('celine', 'default')
      'celine@halloween'      -> ('celine', 'halloween')
      'spirit-eye-celine'     -> ('spirit-eye-celine', 'default')
      'witch-of-the-mere-tenebria__halloween'
                              -> ('witch-of-the-mere-tenebria','halloween')
    """
    base = filename
    if "@" in base:
        hero, variant = base.split("@", 1)
    elif "__" in base:
        hero, variant = base.split("__", 1)
    else:
        hero, variant = base, "default"
    return sanitize(hero), sanitize(variant)

def load_config_map(path: Path) -> Dict[str, Dict[str, str]]:
    """
    Optional mapping JSON that can override/define hero/variant per file.
    Keys can be file basenames with or without extension.
    Value must be: {"hero": "...", "variant": "..."}  (variant optional)
    """
    if not path or not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for k, v in data.items():
        key = Path(k).stem.lower()
        hero = sanitize(v.get("hero", key))
        variant = sanitize(v.get("variant", "default"))
        out[key] = {"hero": hero, "variant": variant}
    return out

def choose_target(root: Path, hero: str, variant: str, ext: str) -> Path:
    """
    Compute a non-colliding target path under root/<hero>/<variant>.<ext>.
    If that filename exists, append a numeric suffix.
    """
    hero_dir = root / hero
    hero_dir.mkdir(parents=True, exist_ok=True)
    target = hero_dir / f"{variant}{ext}"
    if not target.exists():
        return target
    # add numeric suffix
    n = 2
    while True:
        t = hero_dir / f"{variant}-{n}{ext}"
        if not t.exists():
            return t
        n += 1

def organize(root: Path, config_map: Dict[str, Dict[str, str]], dry_run: bool, keep_original_names: bool) -> Dict:
    """
    Move images in `root` into per-hero subfolders.
    - Files already placed under `root/<hero>/...` are left as-is.
    - Flat files in `root/` are organized.
    - Uses config_map overrides when present.
    """
    log = {"moves": [], "skipped": [], "already_organized": []}

    # Gather flat images directly under root (not in subfolders)
    flat_imgs = [p for p in root.glob("*") if p.is_file() and p.suffix.lower() in EXTS]
    # Images already inside hero folders
    nested_imgs = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in EXTS and p.parent != root]

    for p in nested_imgs:
        log["already_organized"].append(str(p.relative_to(root)))

    for src in flat_imgs:
        key = src.stem.lower()
        ext = src.suffix.lower()

        # If mapping provided, use it; else parse from filename
        if key in config_map:
            hero = sanitize(config_map[key]["hero"])
            variant = sanitize(config_map[key].get("variant", "default"))
        else:
            hero, variant = parse_name(src.stem)

        # Optionally keep the original filename as variant
        if keep_original_names:
            variant = sanitize(src.stem)

        target = choose_target(root, hero, variant, ext)

        # Avoid moving if target is identical (same path)
        if target.resolve() == src.resolve():
            log["skipped"].append(str(src.name))
            continue

        print(f"[MOVE] {src.name} -> {target.relative_to(root)}")
        if not dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(target))

        log["moves"].append({
            "from": str(src.name),
            "to":   str(target.relative_to(root)),
            "hero": hero,
            "variant": variant
        })

    # Save log
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text(json.dumps(log, indent=2), encoding="utf-8")
    return log

def main():
    ap = argparse.ArgumentParser(description="Organize hero portrait templates into per-hero folders with variants.")
    ap.add_argument("--root", default="data/templates", help="Templates root directory")
    ap.add_argument("--config", default="", help="Optional JSON mapping file for hero/variant per image")
    ap.add_argument("--dry-run", action="store_true", help="Show what would happen without moving files")
    ap.add_argument("--keep-original-names", action="store_true",
                    help="Use original filename (sans ext) as variant instead of 'default' or parsed variant")
    args = ap.parse_args()

    root = Path(args.root)
    root.mkdir(parents=True, exist_ok=True)

    config_map = load_config_map(Path(args.config)) if args.config else {}

    log = organize(root, config_map, args.dry_run, args.keep_original_names)
    print("\n[SUMMARY]")
    print(f"  moved:   {len(log['moves'])}")
    print(f"  skipped: {len(log['skipped'])}")
    print(f"  nested (already organized): {len(log['already_organized'])}")
    print(f"Log saved to: {LOG_PATH}")

if __name__ == "__main__":
    main()
