# e7SiftMatching/detect_once.py
import argparse, json, cv2
from pathlib import Path

# your core runner should stay the same; adapt the import if needed:
# expected signature: run_sift_on_rois(screen_path, templates_dir, rois_px) -> (annotated_img, results_list)
from sift_core import run_sift_on_rois

OUT_DIR = Path("out")
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_IMG = OUT_DIR / "annotated.png"
OUT_JSON = OUT_DIR / "matches.json"

def scale_rois(rois, base_wh, cur_wh):
    bw, bh = base_wh
    cw, ch = cur_wh
    sx, sy = (cw / float(bw), ch / float(bh))
    scaled = []
    for x, y, w, h in rois:
        scaled.append([int(round(x * sx)), int(round(y * sy)), int(round(w * sx)), int(round(h * sy))])
    return scaled

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--screen", required=True)
    ap.add_argument("--templates", required=True)
    ap.add_argument("--config", default="config/roi_config.json")
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    rois_px = [tuple(r) for r in cfg["rois"]]
    base_size = cfg.get("base_size")  # [W, H] of your calibration screenshot (optional, but recommended)

    img = cv2.imread(args.screen, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"Could not read image: {args.screen}")
    ch, cw = img.shape[:2]

    if base_size and len(base_size) == 2:
        rois = scale_rois(rois_px, (base_size[0], base_size[1]), (cw, ch))
    else:
        rois = rois_px

    annotated, results = run_sift_on_rois(args.screen, args.templates, rois)

    cv2.imwrite(str(OUT_IMG), annotated)
    OUT_JSON.write_text(json.dumps({"results": results}, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
