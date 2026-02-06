# edit_roi.py
import argparse, json, cv2, os

CFG_PATH = "config/roi_config.json"

def draw_rois_preview(img, rois):
    vis = img.copy()
    for i, (x,y,w,h) in enumerate(rois, start=1):
        color = (0,255,0)
        cv2.rectangle(vis, (x,y), (x+w,y+h), color, 2)
        cv2.putText(vis, f"{i}", (x, y-6), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2, cv2.LINE_AA)
    return vis

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slot", type=int, required=True, help="1-based ROI index to edit (e.g., 4)")
    ap.add_argument("--config", default=CFG_PATH, help="Path to roi_config.json")
    ap.add_argument("--screen", default=None, help="(Optional) Override screen image path")
    args = ap.parse_args()

    # Load config
    if not os.path.exists(args.config):
        raise FileNotFoundError(args.config)
    with open(args.config, "r") as f:
        cfg = json.load(f)

    rois = [tuple(r) for r in cfg.get("rois", [])]
    if not rois:
        raise RuntimeError("No ROIs in config. Run calibrate_rois.py first.")
    if args.slot < 1 or args.slot > len(rois):
        raise ValueError(f"--slot must be between 1 and {len(rois)}")

    screen_path = args.screen or cfg.get("screen_path")
    if not screen_path or not os.path.exists(screen_path):
        raise FileNotFoundError(f"Screen image not found: {screen_path}")

    img = cv2.imread(screen_path, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(screen_path)

    # Show current ROIs and the one we will edit
    vis = draw_rois_preview(img, rois)
    sx, sy, sw, sh = rois[args.slot - 1]
    cv2.rectangle(vis, (sx,sy), (sx+sw,sy+sh), (0,0,255), 2)  # highlight target ROI in red
    cv2.putText(vis, f"Editing ROI #{args.slot}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0,0,255), 2, cv2.LINE_AA)

    cv2.imshow("Current ROIs (press any key to reselect ROI #{})".format(args.slot), vis)
    cv2.waitKey(0)
    cv2.destroyAllWindows()

    # Reselect just this ROI
    print(f"Draw a new box for ROI #{args.slot}. Press ENTER to confirm; ESC to cancel.")
    new_r = cv2.selectROI(f"Reselect ROI #{args.slot}", img, False, False)  # (x,y,w,h)
    cv2.destroyAllWindows()
    if new_r == (0,0,0,0):
        print("No selection made. Nothing changed.")
        return

    rois[args.slot - 1] = [int(new_r[0]), int(new_r[1]), int(new_r[2]), int(new_r[3])]
    cfg["rois"] = rois

    with open(args.config, "w") as f:
        json.dump(cfg, f, indent=2)
    print(f"Updated ROI #{args.slot} and saved -> {args.config}")

if __name__ == "__main__":
    main()
