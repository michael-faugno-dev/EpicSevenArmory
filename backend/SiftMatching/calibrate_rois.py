# calibrate_rois.py
import argparse, json, cv2

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--screen", required=True, help="Path to post-ban screenshot")
    ap.add_argument("--slots", type=int, default=4, help="How many portrait ROIs to select (left side)")
    args = ap.parse_args()

    img = cv2.imread(args.screen, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(args.screen)

    print("Select ROIs for LEFT-SIDE portraits (press ENTER after each). ESC to cancel.")
    rois = []
    for i in range(args.slots):
        r = cv2.selectROI("Select left portrait ROI", img, False, False)  # (x,y,w,h)
        if r == (0,0,0,0):
            print("Empty ROI, stopping.")
            break
        rois.append([int(r[0]), int(r[1]), int(r[2]), int(r[3])])
        print(f"[ROI {i+1}] {r}")

    cv2.destroyAllWindows()
    cfg = {"screen_path": args.screen, "rois": rois}
    with open("config/roi_config.json", "w") as f:
        json.dump(cfg, f, indent=2)
    print("Saved -> config/roi_config.json")

if __name__ == "__main__":
    main()
