# backend/draft_detection.py
# Detects heroes by SIFT across a folder-per-slug template tree.
# Example layout:
#   backend/SiftMatching/templates/<slug>/default.png
#   backend/SiftMatching/templates/<slug>/skin1.png
#   ...

import os
import glob
import cv2
from typing import List, Dict, Tuple

# Root containing per-slug folders (each with 1+ skin images)
# Adjust if your layout differs
TEMPLATE_ROOT = os.path.join(os.path.dirname(__file__), "SiftMatching", "templates")

_SIFT = None
_CACHE: Dict[str, list] = {}  # {slug: [{"img":gray, "kp":..., "des":...}, ...]}

def _ensure_loaded():
    """Preload SIFT and per-skin descriptors for each slug (folder name)."""
    global _SIFT, _CACHE
    if _SIFT is None:
        # If your OpenCV build lacks SIFT, switch to ORB:
        # _SIFT = cv2.ORB_create(nfeatures=1200)
        _SIFT = cv2.SIFT_create()

    if _CACHE:
        return

    if not os.path.isdir(TEMPLATE_ROOT):
        return

    for slug in sorted(os.listdir(TEMPLATE_ROOT)):
        slug_dir = os.path.join(TEMPLATE_ROOT, slug)
        if not os.path.isdir(slug_dir):
            continue

        variants = []
        for ext in ("*.png", "*.jpg", "*.jpeg", "*.webp", "*.bmp"):
            for f in glob.glob(os.path.join(slug_dir, ext)):
                img = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
                if img is None:
                    continue
                kp, des = _SIFT.detectAndCompute(img, None)
                if des is None:
                    continue
                variants.append({"img": img, "kp": kp, "des": des, "path": f})

        if variants:
            _CACHE[slug] = variants

def detect_heroes(image_path: str, top_k: int = 4) -> List[str]:
    """
    Return up to top_k hero slugs detected in the uploaded draft screenshot.
    We compute a score per slug as the BEST number of good matches across all
    of that slug's skin templates. Folder name == canonical slug.
    """
    _ensure_loaded()
    if not _CACHE:
        return []

    scene = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if scene is None:
        return []

    # Optional downscale for speed on very large screenshots
    h, w = scene.shape[:2]
    max_dim = 1600
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        scene = cv2.resize(scene, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    sift = _SIFT
    scene_kp, scene_des = sift.detectAndCompute(scene, None)
    if scene_des is None:
        return []

    # FLANN for SIFT (KDTree); if using ORB switch to BFMatcher(NORM_HAMMING)
    index_params = dict(algorithm=1, trees=5)
    search_params = dict(checks=80)
    matcher = cv2.FlannBasedMatcher(index_params, search_params)

    def score_template(template_des) -> int:
        matches = matcher.knnMatch(template_des, scene_des, k=2)
        good = 0
        for m, n in matches:
            if m.distance < 0.7 * n.distance:
                good += 1
        return good

    slug_scores: List[Tuple[str, int]] = []
    for slug, variants in _CACHE.items():
        best = 0
        for v in variants:
            try:
                s = score_template(v["des"])
            except cv2.error:
                s = 0
            if s > best:
                best = s
        slug_scores.append((slug, best))

    slug_scores.sort(key=lambda x: x[1], reverse=True)

    # Tune threshold after a couple of tests; start conservative
    MIN_GOOD_MATCHES = 20
    detected = [slug for slug, score in slug_scores if score >= MIN_GOOD_MATCHES][:top_k]
    return detected
