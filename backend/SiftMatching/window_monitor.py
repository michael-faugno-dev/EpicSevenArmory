# window_monitor.py
#
# Window-aware monitor for Epic Seven PvP draft screen detection.
#
# Flow:
#   1. Find the "Epic Seven" PC client window using win32gui.
#   2. Capture just that window region with mss.
#   3. Scale the anchor template to the current window size and run template
#      matching to detect the "Choose your team's formation" screen.
#   4. When the gate triggers, run SIFT hero detection on the captured frame
#      with ROIs scaled to the actual window dimensions.
#   5. Emit JSON lines to stdout so the Electron main process can forward
#      results to the React renderer via IPC.
#
# stdout protocol (one JSON object per line, always flushed):
#   {"status": "started"}
#   {"status": "window_found"}
#   {"status": "window_not_found"}
#   {"status": "triggered"}
#   {"status": "detected", "clean": ["slug1", ...], "banned": "slug-or-null"}
#   {"status": "stopped"}
#
import sys
import json
import time
import threading
import argparse
import cv2
import numpy as np
from mss import mss
from pathlib import Path

try:
    import win32gui
    import win32process
    import win32ui
    import win32con
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

# Gate hysteresis parameters
GATE_FPS       = 3.0   # polling rate (Hz)
GATE_ENTER     = 0.78  # score needed to enter triggered state (formation screen scores ~0.84)
GATE_STAY      = 0.70  # score needed to stay triggered
HIT_REQ        = 2     # consecutive hits to enter (reduces latency)
MISS_REQ       = 3     # consecutive misses to exit
COOL_DOWN_SEC  = 5.0   # seconds between detections

# The game window title must match exactly (not just contain this string),
# so that "Epic Seven Armory" (the Electron app) is never matched.
E7_WINDOW_TITLE_EXACT = "Epic Seven"

# The game's process executable name in Task Manager (no space, no .exe suffix needed)
E7_PROCESS_NAME = "EpicSeven.exe"


def _emit(obj: dict) -> None:
    """Write a JSON line to stdout and flush immediately."""
    print(json.dumps(obj), flush=True)


def _get_process_name(hwnd: int) -> str:
    """Return the .exe name for the process that owns this window, or ''."""
    if not HAS_WIN32 or not HAS_PSUTIL:
        return ""
    try:
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        return psutil.Process(pid).name()
    except Exception:
        return ""


def find_e7_window():
    """
    Return (hwnd, (left, top, right, bottom)) for the Epic Seven game window,
    or None if not found.

    Uses TWO filters to avoid matching "Epic Seven Armory" (our own Electron app):
      1. Window title must be exactly "Epic Seven" (not a substring match).
      2. Owning process name must be "EpicSeven.exe".
    """
    if not HAS_WIN32:
        return None

    found = []

    def _cb(hwnd, _):
        if not win32gui.IsWindowVisible(hwnd):
            return
        title = win32gui.GetWindowText(hwnd)
        # Exact title match — rejects "Epic Seven Armory", "Epic Seven - ..."
        if title != E7_WINDOW_TITLE_EXACT:
            return
        # Process-name guard — rejects any non-game window with the same title
        proc_name = _get_process_name(hwnd)
        if proc_name and E7_PROCESS_NAME.lower() not in proc_name.lower():
            return
        rect = win32gui.GetWindowRect(hwnd)
        found.append((hwnd, rect))

    win32gui.EnumWindows(_cb, None)

    if not found:
        return None

    hwnd, rect = found[0]
    left, top, right, bottom = rect
    # Skip minimised or zero-size windows
    if right <= left or bottom <= top:
        return None
    return hwnd, (left, top, right, bottom)


def capture_window(hwnd: int, win_w: int, win_h: int) -> np.ndarray:
    """
    Capture the window contents using PrintWindow so it works even when the
    game is minimized or covered by another window.

    Falls back to mss (screen-grab) if PrintWindow fails or win32 is unavailable.
    """
    if HAS_WIN32 and hwnd:
        try:
            # Create a device context and compatible bitmap for the window
            hwnd_dc   = win32gui.GetWindowDC(hwnd)
            mfc_dc    = win32ui.CreateDCFromHandle(hwnd_dc)
            save_dc   = mfc_dc.CreateCompatibleDC()
            bitmap    = win32ui.CreateBitmap()
            bitmap.CreateCompatibleBitmap(mfc_dc, win_w, win_h)
            save_dc.SelectObject(bitmap)

            # PW_RENDERFULLCONTENT (2) renders the full DWM-composited window
            result = win32gui.PrintWindow(hwnd, save_dc.GetSafeHdc(), 2)
            if result:
                bmp_info = bitmap.GetInfo()
                bmp_arr  = bitmap.GetBitmapBits(True)
                img = np.frombuffer(bmp_arr, dtype=np.uint8)
                img.shape = (bmp_info["bmHeight"], bmp_info["bmWidth"], 4)
                # Clean up GDI resources before returning
                win32gui.DeleteObject(bitmap.GetHandle())
                save_dc.DeleteDC()
                mfc_dc.DeleteDC()
                win32gui.ReleaseDC(hwnd, hwnd_dc)
                return img[:, :, :3]  # drop alpha

            # PrintWindow returned 0 — fall through to mss
            win32gui.DeleteObject(bitmap.GetHandle())
            save_dc.DeleteDC()
            mfc_dc.DeleteDC()
            win32gui.ReleaseDC(hwnd, hwnd_dc)
        except Exception:
            pass  # fall through to mss

    # mss fallback (only works when the window is visible on screen)
    rect = win32gui.GetWindowRect(hwnd) if HAS_WIN32 and hwnd else (0, 0, win_w, win_h)
    left, top = rect[0], rect[1]
    with mss() as mon:
        frame = mon.grab({"left": left, "top": top, "width": win_w, "height": win_h})
    return np.array(frame)[:, :, :3]


def scale_rois(rois, base_w: int, base_h: int, cur_w: int, cur_h: int):
    """Scale ROIs from calibration resolution to current window size."""
    sx = cur_w / float(base_w)
    sy = cur_h / float(base_h)
    return [
        [int(round(x * sx)), int(round(y * sy)),
         int(round(w * sx)), int(round(h * sy))]
        for x, y, w, h in rois
    ]


def gate_score(window_bgr: np.ndarray, anchor_gray: np.ndarray,
               base_w: int, base_h: int) -> float:
    """
    Scale the anchor template to match the current window size, then run
    template matching across the full window image. Returns the best score.
    """
    win_h, win_w = window_bgr.shape[:2]
    win_gray = cv2.cvtColor(window_bgr, cv2.COLOR_BGR2GRAY)

    ah, aw = anchor_gray.shape[:2]
    sx = win_w / float(base_w)
    sy = win_h / float(base_h)
    new_aw = max(1, int(round(aw * sx)))
    new_ah = max(1, int(round(ah * sy)))

    scaled_anchor = cv2.resize(anchor_gray, (new_aw, new_ah),
                               interpolation=cv2.INTER_LINEAR)

    # If anchor is larger than the search area, matching is impossible
    if scaled_anchor.shape[0] > win_gray.shape[0] or \
       scaled_anchor.shape[1] > win_gray.shape[1]:
        return 0.0

    result = cv2.matchTemplate(win_gray, scaled_anchor, cv2.TM_CCOEFF_NORMED)
    return float(result.max())


def run_detection(window_bgr: np.ndarray, rois: list, templates_dir: str) -> list:
    """
    Save the captured frame to disk, then invoke sift_core.run_sift_on_rois().
    Returns the raw results list from sift_core.
    """
    from sift_core import run_sift_on_rois

    out_dir = Path("out")
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp = out_dir / "live_frame.png"
    cv2.imwrite(str(tmp), window_bgr)

    _annotated, results = run_sift_on_rois(str(tmp), templates_dir, rois)
    return results


def main():
    ap = argparse.ArgumentParser(
        description="Monitor the Epic Seven window for the draft screen and run SIFT detection."
    )
    ap.add_argument("--templates", required=True,
                    help="Path to the hero template images directory")
    ap.add_argument("--config", default="config/roi_config.json",
                    help="ROI config JSON (default: config/roi_config.json)")
    ap.add_argument("--anchor", default="config/anchor.png",
                    help="Anchor template image (default: config/anchor.png)")
    args = ap.parse_args()

    # --- Load ROI config ---
    cfg_path = Path(args.config)
    if not cfg_path.exists():
        _emit({"status": "error", "msg": f"ROI config not found: {cfg_path}"})
        sys.exit(1)

    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    rois_base = [tuple(r) for r in cfg["rois"]]

    # Determine calibration base size from reference screenshot
    base_w, base_h = None, None
    ref_path_str = cfg.get("screen_path")
    if ref_path_str:
        ref_img = cv2.imread(ref_path_str, cv2.IMREAD_GRAYSCALE)
        if ref_img is not None:
            base_h, base_w = ref_img.shape[:2]
    # Also accept explicit base_size in config
    if cfg.get("base_size") and len(cfg["base_size"]) == 2:
        base_w, base_h = int(cfg["base_size"][0]), int(cfg["base_size"][1])

    # --- Load anchor template ---
    anchor_path = Path(args.anchor)
    if not anchor_path.exists():
        _emit({"status": "error", "msg": f"Anchor image not found: {anchor_path}"})
        sys.exit(1)

    anchor_gray = cv2.imread(str(anchor_path), cv2.IMREAD_GRAYSCALE)
    if anchor_gray is None:
        _emit({"status": "error", "msg": f"Could not read anchor: {anchor_path}"})
        sys.exit(1)

    templates_dir = str(Path(args.templates).resolve())

    _emit({"status": "started"})

    hit = 0
    miss = 0
    triggered = False
    cooldown_until = 0.0
    last_window_status = None  # track to avoid spamming same status
    score_emit_counter = 0     # throttle score output to every ~3 s

    try:
        while True:
            t0 = time.time()

            # ---- Cooldown period ----
            if time.time() < cooldown_until:
                time.sleep(1.0 / GATE_FPS)
                continue

            # ---- Find E7 window ----
            result = find_e7_window()
            if result is None:
                if last_window_status != "window_not_found":
                    _emit({"status": "window_not_found"})
                    last_window_status = "window_not_found"
                hit = 0
                miss = 0
                triggered = False
                time.sleep(1.0)  # slow poll when window missing
                continue

            hwnd, (left, top, right, bottom) = result
            win_w = right - left
            win_h  = bottom - top

            # Detect minimized window — PrintWindow still works but warn the user
            is_minimized = HAS_WIN32 and win32gui.IsIconic(hwnd)
            new_status = "window_minimized" if is_minimized else "window_found"
            if last_window_status != new_status:
                _emit({"status": new_status, "win_w": win_w, "win_h": win_h})
                last_window_status = new_status

            # When minimized GetWindowRect returns the restore dimensions, which
            # are valid for PrintWindow. Still capture — PrintWindow renders off-screen.
            if is_minimized:
                # Use the pre-minimise size from the restore rect (if available)
                # to get sensible dimensions; fall back to stored rect values.
                try:
                    placement = win32gui.GetWindowPlacement(hwnd)
                    # placement[4] is the normal (restore) rect
                    rr = placement[4]
                    win_w = rr[2] - rr[0]
                    win_h = rr[3] - rr[1]
                except Exception:
                    pass

            # ---- Capture window (works even when minimized / covered) ----
            try:
                window_bgr = capture_window(hwnd, win_w, win_h)
            except Exception as e:
                _emit({"status": "capture_error", "msg": str(e)})
                time.sleep(1.0 / GATE_FPS)
                continue

            # ---- Anchor gate ----
            if base_w and base_h:
                score = gate_score(window_bgr, anchor_gray, base_w, base_h)
            else:
                # No calibration reference — use anchor at its native size and
                # search the full window (works only if sizes happen to match)
                win_gray = cv2.cvtColor(window_bgr, cv2.COLOR_BGR2GRAY)
                ah, aw = anchor_gray.shape[:2]
                if aw <= win_w and ah <= win_h:
                    res = cv2.matchTemplate(win_gray, anchor_gray, cv2.TM_CCOEFF_NORMED)
                    score = float(res.max())
                else:
                    score = 0.0

            # Emit gate score every ~3 seconds so the UI can show it for debugging
            score_emit_counter += 1
            if score_emit_counter >= int(GATE_FPS * 3):
                _emit({"status": "gate_score", "score": round(score, 3),
                       "win_w": win_w, "win_h": win_h})
                score_emit_counter = 0

            thresh = GATE_STAY if triggered else GATE_ENTER
            if score >= thresh:
                hit += 1
                miss = 0
            else:
                miss += 1
                hit = 0

            # ---- Gate ENTER ----
            if not triggered and hit >= HIT_REQ:
                triggered = True
                _emit({"status": "triggered"})

                # Scale ROIs to current window size
                if base_w and base_h:
                    rois = scale_rois(rois_base, base_w, base_h, win_w, win_h)
                else:
                    rois = list(rois_base)

                # Run detection in a background thread so gate keeps ticking
                frame_snapshot = window_bgr.copy()

                def _detect(frame, scaled_rois):
                    try:
                        results = run_detection(frame, scaled_rois, templates_dir)
                        clean = [
                            r["best"] for r in results
                            if r and not r.get("banned") and r.get("best")
                        ][:4]
                        banned = next(
                            (r["best"] for r in results
                             if r and r.get("banned") and r.get("best")),
                            None
                        )
                        _emit({
                            "status": "detected",
                            "clean": clean,
                            "banned": banned,
                        })
                    except Exception as e:
                        _emit({"status": "detection_error", "msg": str(e)})

                threading.Thread(
                    target=_detect,
                    args=(frame_snapshot, rois),
                    daemon=True
                ).start()

            # ---- Gate EXIT ----
            if triggered and miss >= MISS_REQ:
                triggered = False
                cooldown_until = time.time() + COOL_DOWN_SEC

            # ---- Rate limiting ----
            dt = time.time() - t0
            wait = max(0.0, (1.0 / GATE_FPS) - dt)
            time.sleep(wait)

    except KeyboardInterrupt:
        _emit({"status": "stopped"})


if __name__ == "__main__":
    main()
