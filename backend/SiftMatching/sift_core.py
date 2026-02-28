"""
sift_core.py — Core SIFT-based hero detection for the real-time unit scanner.

Pipeline overview:
  1. Load screen image and extract per-slot ROIs (regions of interest) using
     coordinates from roi_config.json (calibrated to a reference resolution).
  2. For each ROI, compute whether the slot is "banned" using two signals:
       a. Red-ribbon detection — a red context belt appears to the right of
          banned portraits in the draft screen.
       b. Desaturation/dimming — banned heroes have noticeably greyed-out
          portraits compared to active picks.
  3. For non-banned ROIs, score every hero template using SIFT + Lowe's ratio
     test and pick the top candidate. Ties (score margin < MIN_SCORE_MARGIN)
     are left unresolved to avoid false positives.
  4. Return annotated image and per-slot result dicts.

Tunable constants are grouped at the top of the file.
"""

import cv2
import numpy as np
import os
import json
from pathlib import Path
from typing import Dict, List, Tuple

# =========================
# Tunables
# =========================
LOWE_RATIO = 0.75             # 0.70–0.80 typical
MIN_GOOD_MATCHES = 8          # discard very weak matches
MIN_INLIERS = 8               # in this no-homography version, "inliers" == good-count
MAX_FEATURES_PER_IMAGE = 600  # cap SIFT features per image

# --- BANNED detection (right-side ribbon + optional text match) ---
CTX_BELT_X_W = 0.6        # width of belt = 0.6 * portrait width
CTX_BELT_Y_PAD = 0.20     # ±20% of portrait height vertically
RED_RATIO_CTX_THR = 0.035 # >=3.5% of belt pixels red => ribbon-ish

# Desaturation/dimming inside the portrait
SAT_MEAN_ABS_THR = 80     # absolute saturation threshold (lower = greyer)
VAL_MEAN_ABS_THR = 150    # absolute value threshold (lower = darker)
REL_SAT_RATIO_THR = 0.85  # <=85% of second-lowest S among the 5

# Optional "BANNED" template (strong signal)
BANNED_TEMPLATE_PATH = "config/banned.png"
BANNED_TM_THRESH = 0.70    # TM_CCOEFF_NORMED

# Hero scoring margin to avoid near-ties (e.g., Krau vs Celine)
MIN_SCORE_MARGIN = 5.0

# =========================
# Utilities
# =========================
def load_image_gray(path: str):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img, gray

def create_sift():
    return cv2.SIFT_create(nfeatures=MAX_FEATURES_PER_IMAGE)

def create_flann():
    index_params = dict(algorithm=1, trees=5)  # KD-tree
    search_params = dict(checks=64)
    return cv2.FlannBasedMatcher(index_params, search_params)

def load_roi_config(path="config/roi_config.json") -> List[Tuple[int, int, int, int]]:
    with open(path, "r") as f:
        cfg = json.load(f)
    rois = [tuple(r) for r in cfg["rois"]]
    if not rois:
        raise RuntimeError("No ROIs found in config/roi_config.json")
    return rois

def _img_paths_under(root: Path) -> List[Path]:
    files: List[Path] = []
    for ext in ("*.png","*.jpg","*.jpeg","*.webp"):
        files.extend(sorted(root.glob(ext)))
    return files

def compute_template_db(templates_dir: str):
    """
    Build descriptors for all templates.
    Supports two layouts:
      - data/templates/HERO/*.png   (recommended: per-hero subfolder with variants)
      - data/templates/*.png        (single image per hero at root)
    Returns:
      {
        hero_id: {
          'variants': [ np.ndarray(des), ... ],  # one descriptor matrix per variant image
          'paths':    [ "path_to_img", ... ]
        },
        ...
      }
    """
    sift = create_sift()
    db: Dict[str, Dict[str, List]] = {}
    tdir = Path(templates_dir)

    # Case 1: per-hero folders
    subdirs = [p for p in tdir.iterdir() if p.is_dir()]
    if subdirs:
        for d in sorted(subdirs):
            hero_id = d.name
            v_descs, v_paths = [], []
            for p in _img_paths_under(d):
                color = cv2.imread(str(p), cv2.IMREAD_COLOR)
                if color is None:
                    print(f"[WARN] Cannot read template: {p}")
                    continue
                gray = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)
                gray = cv2.GaussianBlur(gray, (3,3), 0)
                kp, des = sift.detectAndCompute(gray, None)
                if des is None or len(kp) == 0:
                    print(f"[WARN] No SIFT features in template: {p.name}")
                    continue
                v_descs.append(des); v_paths.append(str(p))
            if v_descs:
                db[hero_id] = {"variants": v_descs, "paths": v_paths}
                print(f"[DB] {hero_id}: {sum(len(v) for v in v_descs)} descriptors across {len(v_descs)} variant(s)")
    else:
        # Case 2: flat files; hero_id from filename stem
        for p in _img_paths_under(tdir):
            color = cv2.imread(str(p), cv2.IMREAD_COLOR)
            if color is None:
                print(f"[WARN] Cannot read template: {p}")
                continue
            gray = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (3,3), 0)
            kp, des = sift.detectAndCompute(gray, None)
            if des is None or len(kp) == 0:
                print(f"[WARN] No SIFT features in template: {p.name}")
                continue
            db[p.stem] = {"variants": [des], "paths": [str(p)]}
            print(f"[DB] {p.stem}: {len(kp)} descriptors (1 variant)")
    if not db:
        raise RuntimeError(f"No templates in {templates_dir}")
    return db

# =========================
# Matching (no homography)
# =========================
def score_template_vs_roi(template_des, roi_gray, flann):
    """
    Score a single template against a screen ROI using SIFT + Lowe's ratio test.

    Returns the count of 'good' matches (higher = more confident identification).
    We use the raw good-match count as the score rather than a homography inlier
    count because portrait crops are small and mostly planar — a full homography
    check adds latency without meaningfully improving precision at this scale.
    """
    sift = create_sift()
    kp_q, des_q = sift.detectAndCompute(roi_gray, None)
    if des_q is None or len(kp_q) < 2:
        return 0
    matches = flann.knnMatch(template_des, des_q, k=2)
    good = [m for m, n in matches if m.distance < LOWE_RATIO * n.distance]
    return len(good)

# =========================
# Banned detection helpers
# =========================
def right_belt(full_bgr, x, y, w, h):
    """
    Extract the context strip immediately to the right of a portrait ROI.
    This strip contains the red 'banned' ribbon in the draft screen.
    The vertical extent is padded by CTX_BELT_Y_PAD to tolerate slight
    alignment variation between different device resolutions.
    Returns (belt_crop, bounding_box) or (None, box) if the crop is empty.
    """
    H, W, _ = full_bgr.shape
    x0 = x + w
    x1 = min(W, int(x + w + CTX_BELT_X_W * w))
    y0 = max(0, int(y - CTX_BELT_Y_PAD * h))
    y1 = min(H, int(y + (1 + CTX_BELT_Y_PAD) * h))
    if x0 >= x1 or y0 >= y1:
        return None, (x+w, y, x+w, y+h)
    return full_bgr[y0:y1, x0:x1], (x0, y0, x1, y1)

def red_ratio(img_bgr) -> float:
    """
    Return the fraction of pixels in img_bgr that fall in the HSV red range.
    Red wraps around the hue wheel (0–10° and 170–180°), so two range checks
    are combined with a bitwise OR mask before counting.
    A ratio above RED_RATIO_CTX_THR indicates a red ribbon is present.
    """
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    lower1 = np.array([0, 100, 100], dtype=np.uint8)
    upper1 = np.array([10, 255, 255], dtype=np.uint8)
    lower2 = np.array([170,100,100], dtype=np.uint8)
    upper2 = np.array([180,255,255], dtype=np.uint8)
    mask = cv2.inRange(hsv, lower1, upper1) | cv2.inRange(hsv, lower2, upper2)
    return cv2.countNonZero(mask) / float(img_bgr.shape[0] * img_bgr.shape[1])

def sat_val_means(roi_bgr):
    """
    Return (saturation_mean, value_mean) of the portrait crop in HSV space.
    Used to detect greyed-out (banned) portraits: low S = desaturated, low V = dark.
    """
    hsv = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2HSV)
    return float(np.mean(hsv[:,:,1])), float(np.mean(hsv[:,:,2]))

def banned_text_score(belt_bgr, tmpl_gray) -> float:
    """
    Template-match a pre-cropped 'BANNED' text image against the context belt.
    Uses TM_CCOEFF_NORMED (1.0 = perfect match). Returns 0.0 if either input
    is None or the belt is smaller than the template (match not possible).
    A score >= BANNED_TM_THRESH is treated as a confirmed ban.
    """
    if belt_bgr is None or tmpl_gray is None:
        return 0.0
    belt_gray = cv2.cvtColor(belt_bgr, cv2.COLOR_BGR2GRAY)
    if belt_gray.shape[0] < tmpl_gray.shape[0] or belt_gray.shape[1] < tmpl_gray.shape[1]:
        return 0.0
    res = cv2.matchTemplate(belt_gray, tmpl_gray, cv2.TM_CCOEFF_NORMED)
    return float(res.max())

# =========================
# Annotation
# =========================
def annotate(base_bgr, rois, results):
    """
    Draw detection results onto a copy of the screen image.
    Each portrait ROI gets a colored rectangle (red=banned, green=matched, orange=unknown)
    and a text label with the hero name and confidence score. The context belt box is
    also drawn in blue for debugging banned detection.
    """
    out = base_bgr.copy()
    for i, (x,y,w,h) in enumerate(rois):
        res = results[i]
        best   = res.get("best")
        banned = res.get("banned", False)
        color  = (0, 0, 255) if banned else ((0, 255, 0) if best else (0, 165, 255))
        cv2.rectangle(out, (x,y), (x+w,y+h), color, 2)
        bx0, by0, bx1, by1 = res["belt_box"]
        cv2.rectangle(out, (bx0,by0), (bx1,by1), (255, 0, 0), 1)
        label = "BANNED" if banned else (best or "unknown")
        conf  = res.get("score", 0.0)
        txt   = f"{label} ({conf:.1f})" if best and not banned else label
        cv2.putText(out, txt, (x, max(0,y - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2, cv2.LINE_AA)
    return out

# =========================
# Main
# =========================
def run_sift_on_rois(screen_path: str, templates_dir: str, rois: List[Tuple[int,int,int,int]]):
    """
    Main entry point: run the full detection pipeline on a single screenshot.

    Steps:
      1. Load screen + build template descriptor DB (SIFT features per hero/skin).
      2. First pass: compute saturation/value means and red-ribbon ratio for all ROIs,
         allowing relative ban detection (comparing ROIs against each other).
      3. Second pass: for non-banned ROIs, score every hero template via SIFT and
         Lowe's ratio test. The top candidate is accepted only if its margin over the
         second-best exceeds MIN_SCORE_MARGIN.
      4. Return annotated image + list of per-slot result dicts.

    Returns:
      (annotated_bgr, results) where results is a list of dicts with keys:
        slot, best (hero_id or None), score, inliers, roi, banned, metrics, belt_box
    """
    base_bgr, base_gray = load_image_gray(screen_path)
    db   = compute_template_db(templates_dir)
    flann= create_flann()

    # optional banned text template
    banned_tmpl = None
    if os.path.exists(BANNED_TEMPLATE_PATH):
        tmp = cv2.imread(BANNED_TEMPLATE_PATH, cv2.IMREAD_GRAYSCALE)
        if tmp is not None:
            banned_tmpl = tmp

    # First pass: metrics
    metrics = []
    for (x,y,w,h) in rois:
        roi_bgr = base_bgr[y:y+h, x:x+w]
        s_mean, v_mean = sat_val_means(roi_bgr)
        belt, belt_box = right_belt(base_bgr, x, y, w, h)
        rr = red_ratio(belt) if belt is not None else 0.0
        tscore = banned_text_score(belt, banned_tmpl) if banned_tmpl is not None else 0.0
        metrics.append({
            "s_mean": s_mean, "v_mean": v_mean,
            "red_ratio_ctx": rr, "banned_text": tscore,
            "belt_box": belt_box,
        })

    sat_values = [m["s_mean"] for m in metrics]
    sat_sorted = sorted(sat_values)
    second_lowest = sat_sorted[1] if len(sat_sorted) >= 2 else sat_sorted[0]

    results = []
    for idx, (x,y,w,h) in enumerate(rois):
        roi_gray = base_gray[y:y+h, x:x+w]
        roi_bgr  = base_bgr[y:y+h, x:x+w]
        m = metrics[idx]
        s_mean = m["s_mean"]; v_mean = m["v_mean"]
        rr     = m["red_ratio_ctx"]; tscore = m["banned_text"]

        abs_dim   = (s_mean <= SAT_MEAN_ABS_THR and v_mean <= VAL_MEAN_ABS_THR)
        rel_dim   = (s_mean <= REL_SAT_RATIO_THR * second_lowest)
        dimmed    = abs_dim and rel_dim
        ribbonish = rr >= RED_RATIO_CTX_THR
        banned    = (tscore >= BANNED_TM_THRESH) or (ribbonish and dimmed)

        best_id, best_score = None, 0.0
        if not banned:
            # score each hero by the BEST variant score
            scores = []
            for hero_id, rec in db.items():
                v_best = 0
                for des in rec["variants"]:
                    s = score_template_vs_roi(des, roi_gray, flann)
                    if s > v_best:
                        v_best = s
                if v_best >= MIN_INLIERS:
                    scores.append((v_best, hero_id))
            if scores:
                scores.sort(reverse=True)
                best_score, best_id = scores[0]
                if len(scores) > 1:
                    margin = best_score - scores[1][0]
                    if margin < MIN_SCORE_MARGIN:
                        best_id = None  # not confident enough

        results.append({
            "slot": idx + 1,
            "best": best_id,
            "score": float(best_score),
            "inliers": int(best_score),
            "roi": [int(x), int(y), int(w), int(h)],
            "banned": bool(banned),
            "metrics": {
                "sat_mean": float(s_mean),
                "val_mean": float(v_mean),
                "red_ratio_ctx": float(rr),
                "banned_text_score": float(tscore)
            },
            "belt_box": m["belt_box"],
        })

        why = "TEXT" if tscore >= BANNED_TM_THRESH else ("RIBBON+DIM" if (ribbonish and dimmed) else "")
        status = "BANNED:" + why if banned else (best_id or "unknown")
        print(f"[ROI {idx+1}] {status} | score={best_score:.1f} "
              f"| S={s_mean:.1f} V={v_mean:.1f} red={rr:.3f} txt={tscore:.2f}")

    annotated = annotate(base_bgr, rois, results)
    return annotated, results
