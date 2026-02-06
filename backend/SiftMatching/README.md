# E7 SIFT Draft Matcher

A small, standalone toolkit you can run **outside your app** to identify your **left‑side draft units** on the post‑ban _“Choose your team’s formation.”_ screen in Epic Seven. It supports **multiple skins per hero**, detects the **BANNED** unit, and outputs both an annotated image and a machine‑readable JSON that your app can consume.

> This repo is designed to live independently of your main application. Once you’re happy with the outputs, point your app at the JSON files or embed the matcher as a subprocess/microservice.

---

## What’s Included

- **SIFT portrait matcher** (OpenCV SIFT + FLANN + Lowe ratio)
- **Multi‑variant templates** (multiple skins per hero; best variant wins)
- **BANNED detection** using:
  - direct **template match** of `config/banned.png` in a tight belt next to a portrait (recommended)
  - fallback **red‑ribbon + dimming** heuristics (HSV)
- **5 calibrated ROIs** (the left column portraits)
- **Optional text gate**: only run matching when the phrase _“Choose your team’s formation.”_ is visible
- Helper scripts:
  - `edit_roi.py` — re‑draw just **one** ROI in place
  - `organize_templates.py` — create per‑hero folders and move images automatically

---

## Folder Layout

```
e7_sift_demo/
  requirements.txt
  README.md
  data/
    screens/
      battle_results.png           # sample screenshot (post‑ban formation prompt)
    templates/
      # EITHER (flat):
      #   krau.png, celine.png, spirit-eye-celine.png, ...
      # OR (recommended) per‑hero with variants:
      #   celine/default.png, celine/halloween.png, ...
  config/
    roi_config.json                # made by calibrate_rois.py
    anchor_config.json             # made by calibrate_anchor.py
    anchor.png                     # cropped “formation” phrase (for live gate)
    banned.png                     # cropped red BANNED word (recommended)
  out/
    annotated.png                  # detect_once output
    matches.json                   # per‑slot results
    annotated_live.png             # monitor_gate output (if used)
    matches_live.json
  calibrate_rois.py
  calibrate_anchor.py
  detect_once.py
  monitor_gate.py
  sift_core.py
  edit_roi.py
  organize_templates.py
```

---

## Requirements & Install

- **Python 3.9–3.12**
- OS: Windows or macOS (Windows recommended for live capture)
- Install deps:
  ```bash
  pip install -r requirements.txt
  ```

`requirements.txt`:

```
opencv-contrib-python>=4.9.0
numpy>=1.23
mss>=9.0.1
```

---

## Quick Start (Static Screenshot)

1. **Put assets**

   - Screenshot → `data/screens/battle_results.png`
   - Templates → `data/templates/`
     - Flat files: `data/templates/<hero_id>.png`
     - **Recommended:** per‑hero folders with variants:
       `data/templates/<hero_id>/<variant>.png`

2. **Calibrate the 5 left‑side portrait ROIs**

   ```bash
   python calibrate_rois.py --screen data/screens/battle_results.png --slots 5
   ```

   Draw tight boxes over the 5 **portrait artworks** (top→bottom). Exclude stars, level badge, element icon, borders, and the red BANNED ribbon.

3. **(Optional) Calibrate the text gate**

   ```bash
   python calibrate_anchor.py --screen data/screens/battle_results.png
   ```

   Draw a small box around **“Choose your team’s formation.”** (or just “formation”).  
   Saves `config/anchor.png` and `config/anchor_config.json`.

4. **(Recommended) Provide a BANNED template**

   - Crop the red **“BANNED”** word from your screenshot (about on‑screen size) and save as:
     ```
     config/banned.png
     ```

5. **Run detection on the screenshot**
   ```bash
   python detect_once.py --screen data/screens/battle_results.png --templates data/templates
   ```
   Outputs:
   - `out/annotated.png` — rectangles + labels
   - `out/matches.json` — per‑slot info (see schema below)

---

## Live Monitor (Optional)

Continuously watch the tiny text ROI and only run SIFT when the formation phrase appears:

```bash
python monitor_gate.py --templates data/templates
```

- Writes `out/annotated_live.png` and `out/matches_live.json` on each trigger.
- Stop with **Ctrl+C**.

---

## How It Works (Pipeline)

1. **Gate (optional, cheap)**  
   A tiny ROI over the phrase _“Choose your team’s formation.”_ is monitored with `cv2.matchTemplate`. When it crosses a threshold, we trigger a detection burst. (This keeps CPU low.)

2. **ROIs (your 5 portraits)**  
   You calibrate five rectangles on the left column portraits. All downstream logic runs **only** inside these boxes.

3. **BANNED detection (per portrait)**

   - We build a tight **context belt** immediately to the **right** of each portrait (0.6× width, ±20% height).
   - In that belt we check:
     - direct template match vs `config/banned.png` (if present)
     - **red ratio** (HSV ranges at both ends of the hue wheel)
   - Inside the portrait we also compute **mean Saturation & Value** (HSV). Banned units are usually slightly **desaturated/dim**.
   - Decision: a slot is **BANNED** if
     - the belt matches `banned.png` above threshold, **or**
     - (belt red is high) **and** (portrait is dim/desaturated relative to its peers).

4. **SIFT matching (only non‑banned)**

   - Compute SIFT on each ROI and compare against **all templates**.
   - **Multi‑variant support**: If `data/templates/<hero_id>/` contains multiple images, we score each and take the **best variant** as that hero’s score.
   - Score = **#good matches** under Lowe ratio; we also enforce a **score margin** so we don’t commit on near‑ties (reduces Krau/Celine look‑alikes).

5. **Outputs**
   - `out/annotated*.png` — visual overlay with labels; banned in red, matched heroes in green, unknown in orange.
   - `out/matches*.json` — structured results your app can parse.

---

## Commands Reference

- **Calibrate 5 ROIs**

  ```bash
  python calibrate_rois.py --screen data/screens/battle_results.png --slots 5
  ```

- **Edit just one ROI (e.g., slot 4)**

  ```bash
  python edit_roi.py --slot 4
  ```

- **Calibrate formation text gate**

  ```bash
  python calibrate_anchor.py --screen data/screens/battle_results.png
  ```

- **Detect once on screenshot**

  ```bash
  python detect_once.py --screen data/screens/battle_results.png --templates data/templates
  ```

- **Monitor with gate (live)**

  ```bash
  python monitor_gate.py --templates data/templates
  ```

- **Organize templates into per‑hero folders**
  ```bash
  # Dry run
  python organize_templates.py --root data/templates --dry-run
  # Actual move
  python organize_templates.py --root data/templates
  # Keep original filenames as variant names
  python organize_templates.py --root data/templates --keep-original-names
  ```

---

## JSON Output (Schema)

`out/matches.json` (or `_live.json`):

```json
{
  "results": [
    {
      "slot": 1,
      "best": "celine",             // hero_id (folder name) or null if unknown
      "score": 23.0,                // good-match count (higher is better)
      "inliers": 23,                // same as score in no-homography mode
      "roi": [x, y, w, h],
      "banned": false,              // true if this slot is banned
      "metrics": {
        "sat_mean": 102.3,          // portrait saturation mean (0..255)
        "val_mean": 180.5,          // portrait value/brightness mean (0..255)
        "red_ratio_ctx": 0.012,     // % red pixels in right-side belt
        "banned_text_score": 0.81   // template score vs banned.png (0..1)
      },
      "belt_box": [bx0, by0, bx1, by1]
    }
  ]
}
```

**App rule:** keep `best` where `"banned": false`; ignore banned and `best=null`.

---

## Tuning (only if needed)

Open `sift_core.py` and adjust:

- **SIFT & scoring**

  - `LOWE_RATIO = 0.75` → lower (0.70) to be stricter.
  - `MIN_INLIERS = 8` → raise (10–16) to cut weak matches.
  - `MIN_SCORE_MARGIN = 5.0` → raise (7–10) to avoid near‑ties.
  - `MAX_FEATURES_PER_IMAGE = 600` → reduce if CPU is high.

- **BANNED detection**

  - `BANNED_TM_THRESH = 0.70` (0.68–0.75 typical; depends on your crop)
  - `RED_RATIO_CTX_THR = 0.035` (try 0.03–0.05)
  - `SAT_MEAN_ABS_THR = 80` / `VAL_MEAN_ABS_THR = 150` (monitor brightness/contrast dependent)
  - `CTX_BELT_X_W = 0.6`, `CTX_BELT_Y_PAD = 0.20` to resize the belt window

- **Live gate thresholds** in `monitor_gate.py`:
  - `GATE_ENTER = 0.86`, `GATE_STAY = 0.80`, `HIT_REQ = 3`, `MISS_REQ = 3`.

---

## ROI Guidance

- Enclose the **entire portrait art** (face + hair/hat).
- **Exclude** stars, level text, element icon, and the red **BANNED** ribbon.
- Slightly **larger** than the template is fine; too small hurts more than too big.
- Keep all 5 boxes consistent in style/placement.

---

## Template Tips (Skins & Quality)

- Prefer per‑hero folders with variants:
  ```
  data/templates/celine/default.png
  data/templates/celine/halloween.png
  ```
- Crop tightly to the **art** (no UI chrome).
- Aim for **128–256 px** squares; consistent sizes help.
- If a skin misses, add another crop (slightly different zoom/crop).
- If two heroes keep tying, increase `MIN_SCORE_MARGIN` so it returns `unknown` unless there’s a clear winner.

---

## Troubleshooting

- **“can’t open/read file”** → verify the `--screen` path or that the file exists.
- **All slots show BANNED** → crop `config/banned.png` tighter; raise `BANNED_TM_THRESH`; ensure the belt isn’t overlapping other red UI.
- **Wrong hero on a slot** → re‑draw that ROI tighter (`python edit_roi.py --slot N`), add more hero variants, or raise `MIN_SCORE_MARGIN`.
- **Nothing matches** → lower `MIN_INLIERS` slightly or increase `LOWE_RATIO` to 0.78–0.80 (more permissive).
- **CPU high in live mode** → reduce `GATE_FPS`, lower SIFT features, or run the live monitor on a secondary thread/process.

---

## Integrating With Your App

- Read `out/matches*.json`.
- Filter to results with `"banned": false`.
- Map `"best"` (hero_id) to your internal IDs; ignore `null` bests.
- You can run this matcher as a CLI and parse the JSON or spawn it as a small service.

---

## License / Notes

- Uses OpenCV SIFT (via `opencv-contrib-python`).
- This demo is for internal tooling.
