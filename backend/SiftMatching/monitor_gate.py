# monitor_gate.py
import time, threading, json, cv2, numpy as np
from mss import mss
from pathlib import Path
from sift_core import run_sift_on_rois, load_roi_config

GATE_FPS = 3.0
GATE_ENTER = 0.86    # enter threshold
GATE_STAY  = 0.80    # stay threshold
HIT_REQ = 3
MISS_REQ = 3
COOL_DOWN_SEC = 2.0

def load_anchor():
    cfg = json.load(open("config/anchor_config.json"))
    anchor = cv2.imread("config/anchor.png", cv2.IMREAD_GRAYSCALE)
    if anchor is None:
        raise FileNotFoundError("config/anchor.png")
    return cfg, anchor

def gate_score(roi_gray, anchor_gray):
    res = cv2.matchTemplate(roi_gray, anchor_gray, cv2.TM_CCOEFF_NORMED)
    return float(res.max())

def grab_roi(mon, rect):
    x,y,w,h = rect["x"], rect["y"], rect["w"], rect["h"]
    frame = mon.grab({"left": x, "top": y, "width": w, "height": h})
    bgr = np.array(frame)[:,:,:3]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return gray

def grab_fullscreen(mon):
    # Full-screen capture (primary monitor)
    m = mon.monitors[1]     # 1 = primary
    frame = mon.grab(m)
    return np.array(frame)[:,:,:3]

def on_trigger(full_bgr, templates_dir):
    # Save temp full image, then run sift on the calibrated ROIs using that frame
    tmp = Path("out/live_frame.png")
    cv2.imwrite(str(tmp), full_bgr)
    rois = load_roi_config("config/roi_config.json")
    annotated, results = run_sift_on_rois(str(tmp), templates_dir, rois)
    cv2.imwrite("out/annotated_live.png", annotated)
    with open("out/matches_live.json","w") as f:
        json.dump({"results": results}, f, indent=2)
    print("[TRIGGER] Results written to out/annotated_live.png and out/matches_live.json")

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--templates", required=True, help="Dir with hero templates")
    args = ap.parse_args()

    cfg, anchor = load_anchor()
    mon = mss()
    hit, miss = 0, 0
    triggered = False
    cooldown_until = 0.0

    print("[INFO] Monitoring... Ctrl+C to stop.")
    try:
        while True:
            t0 = time.time()

            if time.time() < cooldown_until:
                time.sleep(1.0 / GATE_FPS)
                continue

            roi_gray = grab_roi(mon, cfg)
            score = gate_score(roi_gray, anchor)

            thresh = GATE_STAY if triggered else GATE_ENTER
            if score >= thresh:
                hit += 1
                miss = 0
            else:
                miss += 1
                hit = 0

            if not triggered and hit >= HIT_REQ:
                triggered = True
                full = grab_fullscreen(mon)
                threading.Thread(target=on_trigger, args=(full, args.templates), daemon=True).start()

            if triggered and miss >= MISS_REQ:
                triggered = False
                cooldown_until = time.time() + COOL_DOWN_SEC

            dt = time.time() - t0
            wait = max(0.0, (1.0 / GATE_FPS) - dt)
            time.sleep(wait)
    except KeyboardInterrupt:
        print("\n[INFO] Stopped.")

if __name__ == "__main__":
    main()
