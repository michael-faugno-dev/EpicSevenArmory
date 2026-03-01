# unit_scanner.py
#
# Hero stat-screen monitor for Epic Seven auto unit import.
#
# Flow:
#   1. Find the "Epic Seven" PC client window using win32gui.
#   2. Capture the window using PrintWindow (works minimized/covered).
#   3. Scale anchor_unit.png to current window size and run template matching.
#   4. Require HIT_REQ consecutive hits (~2 s dwell) before capturing.
#   5. On capture: save frame to out/unit_frame.png and emit a JSON line.
#   6. Electron main reads the frame and POSTs it to /auto_import/unit.
#
# stdout protocol (one JSON object per line, always flushed):
#   {"status": "started"}
#   {"status": "window_found",     "win_w": N, "win_h": N}
#   {"status": "window_not_found"}
#   {"status": "window_minimized", "win_w": N, "win_h": N}
#   {"status": "capturing"}                         <- dwell met, capture imminent
#   {"status": "captured", "path": "out/unit_frame.png", "win_w": N, "win_h": N}
#   {"status": "stopped"}
#
import sys
import json
import time
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

# ── Tunable parameters ──────────────────────────────────────────────────────
SCAN_FPS       = 2.0    # polling rate (Hz)
ENTER_THRESH   = 0.72   # template-match score to count as "on stat screen"
HIT_REQ        = 4      # consecutive hits needed to trigger (≈ 2 s at 2 Hz)
COOL_DOWN_SEC  = 4.0    # seconds between captures (avoid re-importing same unit)

# The game window title must match exactly so we never match "Epic Seven Armory".
E7_WINDOW_TITLE_EXACT = "Epic Seven"
E7_PROCESS_NAME       = "EpicSeven.exe"


def _emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


def _get_process_name(hwnd: int) -> str:
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
    or None if not found.  Uses exact title + process-name guard to avoid
    matching "Epic Seven Armory" (our own Electron app).
    """
    if not HAS_WIN32:
        return None

    found = []

    def _cb(hwnd, _):
        if not win32gui.IsWindowVisible(hwnd):
            return
        title = win32gui.GetWindowText(hwnd)
        if title != E7_WINDOW_TITLE_EXACT:
            return
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
    if right <= left or bottom <= top:
        return None
    return hwnd, (left, top, right, bottom)


def capture_window(hwnd: int, win_w: int, win_h: int) -> np.ndarray:
    """
    Capture the window via PrintWindow (works even minimised/covered).
    Falls back to mss screen-grab if PrintWindow fails.
    """
    if HAS_WIN32 and hwnd:
        try:
            hwnd_dc = win32gui.GetWindowDC(hwnd)
            mfc_dc  = win32ui.CreateDCFromHandle(hwnd_dc)
            save_dc = mfc_dc.CreateCompatibleDC()
            bitmap  = win32ui.CreateBitmap()
            bitmap.CreateCompatibleBitmap(mfc_dc, win_w, win_h)
            save_dc.SelectObject(bitmap)

            result = win32gui.PrintWindow(hwnd, save_dc.GetSafeHdc(), 2)
            if result:
                bmp_info = bitmap.GetInfo()
                bmp_arr  = bitmap.GetBitmapBits(True)
                img = np.frombuffer(bmp_arr, dtype=np.uint8)
                img.shape = (bmp_info["bmHeight"], bmp_info["bmWidth"], 4)
                win32gui.DeleteObject(bitmap.GetHandle())
                save_dc.DeleteDC()
                mfc_dc.DeleteDC()
                win32gui.ReleaseDC(hwnd, hwnd_dc)
                return img[:, :, :3]

            win32gui.DeleteObject(bitmap.GetHandle())
            save_dc.DeleteDC()
            mfc_dc.DeleteDC()
            win32gui.ReleaseDC(hwnd, hwnd_dc)
        except Exception:
            pass

    rect = win32gui.GetWindowRect(hwnd) if HAS_WIN32 and hwnd else (0, 0, win_w, win_h)
    left, top = rect[0], rect[1]
    with mss() as mon:
        frame = mon.grab({"left": left, "top": top, "width": win_w, "height": win_h})
    return np.array(frame)[:, :, :3]


def anchor_score(window_bgr: np.ndarray, anchor_gray: np.ndarray,
                 base_w: int, base_h: int) -> float:
    """
    Scale anchor_gray to the current window size and return the peak
    TM_CCOEFF_NORMED score.
    """
    win_h, win_w = window_bgr.shape[:2]
    win_gray = cv2.cvtColor(window_bgr, cv2.COLOR_BGR2GRAY)

    ah, aw = anchor_gray.shape[:2]
    sx = win_w / float(base_w)
    sy = win_h / float(base_h)
    new_aw = max(1, int(round(aw * sx)))
    new_ah = max(1, int(round(ah * sy)))
    scaled = cv2.resize(anchor_gray, (new_aw, new_ah), interpolation=cv2.INTER_LINEAR)

    if scaled.shape[0] > win_gray.shape[0] or scaled.shape[1] > win_gray.shape[1]:
        return 0.0

    result = cv2.matchTemplate(win_gray, scaled, cv2.TM_CCOEFF_NORMED)
    return float(result.max())


def main():
    ap = argparse.ArgumentParser(
        description="Monitor the Epic Seven hero stat screen and capture frames for auto-import."
    )
    ap.add_argument("--anchor", default="config/anchor_unit.png",
                    help="Anchor image for the hero stat screen (default: config/anchor_unit.png)")
    ap.add_argument("--debug", action="store_true",
                    help="Print template match score each frame and save debug_frame.png")
    args = ap.parse_args()

    anchor_path = Path(args.anchor)
    if not anchor_path.exists():
        _emit({"status": "error", "msg": f"Anchor not found: {anchor_path}"})
        sys.exit(1)

    anchor_gray = cv2.imread(str(anchor_path), cv2.IMREAD_GRAYSCALE)
    if anchor_gray is None:
        _emit({"status": "error", "msg": f"Could not read anchor: {anchor_path}"})
        sys.exit(1)

    # Base resolution the anchor was cropped from (hero stat screen screenshots).
    # Must match the resolution of the window used to capture anchor_unit.png.
    BASE_W, BASE_H = 1998, 1161

    out_dir = Path("out")
    out_dir.mkdir(parents=True, exist_ok=True)

    _emit({"status": "started"})

    hit                = 0
    cooldown_until     = 0.0
    last_win_status    = None
    score_emit_counter = 0

    try:
        while True:
            t0 = time.time()

            # ── Cooldown ────────────────────────────────────────────────────
            if time.time() < cooldown_until:
                time.sleep(1.0 / SCAN_FPS)
                continue

            # ── Find window ─────────────────────────────────────────────────
            result = find_e7_window()
            if result is None:
                if last_win_status != "window_not_found":
                    _emit({"status": "window_not_found"})
                    last_win_status = "window_not_found"
                hit = 0
                time.sleep(1.0)
                continue

            hwnd, (left, top, right, bottom) = result
            win_w = right - left
            win_h = bottom - top

            # Compute client-area offset (strips title bar + window borders)
            try:
                cr = win32gui.GetClientRect(hwnd)
                client_w = cr[2]
                client_h = cr[3]
                chrome_x = (win_w - client_w) // 2   # side border (usually ~8 or 0)
                chrome_y = win_h - client_h - chrome_x  # title bar height
            except Exception:
                client_w, client_h = win_w, win_h
                chrome_x = chrome_y = 0

            is_minimized = HAS_WIN32 and win32gui.IsIconic(hwnd)
            new_status = "window_minimized" if is_minimized else "window_found"
            if last_win_status != new_status:
                _emit({"status": new_status, "win_w": win_w, "win_h": win_h})
                last_win_status = new_status

            if is_minimized:
                try:
                    placement = win32gui.GetWindowPlacement(hwnd)
                    rr = placement[4]
                    win_w = rr[2] - rr[0]
                    win_h = rr[3] - rr[1]
                except Exception:
                    pass

            # ── Capture ─────────────────────────────────────────────────────
            try:
                window_bgr = capture_window(hwnd, win_w, win_h)
            except Exception as e:
                _emit({"status": "capture_error", "msg": str(e)})
                time.sleep(1.0 / SCAN_FPS)
                continue

            # ── Template match ───────────────────────────────────────────────
            score = anchor_score(window_bgr, anchor_gray, BASE_W, BASE_H)

            if args.debug:
                print(f"[debug] score={score:.4f}  hit={hit}  thresh={ENTER_THRESH}", flush=True)
                cv2.imwrite(str(out_dir / "debug_frame.png"), window_bgr)

            # Emit gate score every ~3 s so the UI can show it
            score_emit_counter += 1
            if score_emit_counter >= int(SCAN_FPS * 3):
                _emit({"status": "gate_score", "score": round(score, 3),
                       "win_w": win_w, "win_h": win_h})
                score_emit_counter = 0

            if score >= ENTER_THRESH:
                hit += 1
            else:
                hit = 0

            # ── Dwell threshold met → capture ────────────────────────────────
            if hit >= HIT_REQ:
                hit = 0
                _emit({"status": "capturing"})

                frame_path = str(out_dir / "unit_frame.png")
                cv2.imwrite(frame_path, window_bgr)

                _emit({
                    "status":   "captured",
                    "path":     frame_path,
                    "win_w":    client_w,
                    "win_h":    client_h,
                    "chrome_x": chrome_x,
                    "chrome_y": chrome_y,
                })

                cooldown_until = time.time() + COOL_DOWN_SEC

            # ── Rate limiting ────────────────────────────────────────────────
            dt   = time.time() - t0
            wait = max(0.0, (1.0 / SCAN_FPS) - dt)
            time.sleep(wait)

    except KeyboardInterrupt:
        _emit({"status": "stopped"})


if __name__ == "__main__":
    main()
