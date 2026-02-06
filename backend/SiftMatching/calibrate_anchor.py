# calibrate_anchor.py
import argparse, json, cv2

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--screen", required=True, help="Path to post-ban screenshot")
    args = ap.parse_args()

    img = cv2.imread(args.screen, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(args.screen)

    print("Draw a small box around the phrase 'Choose your team's formation.'")
    r = cv2.selectROI("Select text anchor ROI", img, False, False)  # x,y,w,h
    cv2.destroyAllWindows()
    if r == (0,0,0,0):
        raise RuntimeError("Empty ROI")

    x,y,w,h = map(int, r)
    anchor = img[y:y+h, x:x+w]
    cv2.imwrite("config/anchor.png", anchor)

    with open("config/anchor_config.json", "w") as f:
        json.dump({"x":x, "y":y, "w":w, "h":h}, f, indent=2)

    print("Saved -> config/anchor.png and config/anchor_config.json")

if __name__ == "__main__":
    main()
