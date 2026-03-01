# Duplicate Unit Handling — Future Plan

## Problem

The auto-import scanner upserts units by `(username, unit_name)` — one record per hero per user.
This works for re-scanning a unit after a gear change (update), but silently overwrites the stats
if the user has a **second copy** of the same hero with a different build.

The scanner has no reliable way to distinguish between:
- Same unit, re-geared → should **update** existing record
- 2nd copy of same hero, different build → should **create** a new record

---

## Options Considered

### Option 1 — Always insert, never upsert (recommended)
Every scan creates a new record with a `scanned_at` timestamp.
The roster UI shows the **most recent** scan per hero by default,
with a "show all copies" toggle. User manually deletes stale/unwanted entries.

- **Pros**: never loses data, handles 2 copies naturally
- **Cons**: roster accumulates stale records without manual cleanup

### Option 2 — Upsert + CP delta check
If the new scan's CP is within ±5% of the stored value → assume same unit, overwrite.
If CP differs significantly → create a 2nd record automatically.

- **Pros**: mostly automatic
- **Cons**: OCR reads CP inconsistently; same build scanned twice may produce different CP values

### Option 3 — Current behaviour (keep as-is)
One record per hero per user, last scan wins.

- **Pros**: simplest, roster stays clean
- **Cons**: silently overwrites a 2nd copy's stats

---

## Recommendation: Option 1

Switch `routes_auto_import.py` from upsert to always-insert:

```python
# Remove the find_one + update_one/insert_one logic, replace with:
stats["scanned_at"] = time.time() * 1000  # ms timestamp
image_stats.insert_one(stats)
event_type = "added"  # always "added" since we no longer detect existing
```

Then in the roster UI, group by hero name and surface the latest scan by default,
with a "show all X copies" expansion per hero.

---

## Files to Change When Implementing

| File | Change |
|---|---|
| `backend/routes_auto_import.py` | Remove `find_one` + conditional upsert; always `insert_one` with `scanned_at` timestamp |
| `backend/app.py` `process_image()` | Same change if manual uploads should also support multiple copies |
| Roster/display page | Group by `unit` name, show latest by `scanned_at`, add "show all copies" toggle |
| Auto-Import Log page | Already shows all events; no change needed |

---

## Known Issue: Similar-Name Fuzzy Match Collisions

### Problem

`fuzz.token_set_ratio` treats a short string as a perfect 100% match against any longer
name that contains it as a token subset.  Example:

- OCR misreads "Dragon King Sharun" → partial read "sharun"
- `token_set_ratio("sharun", "Sharun")` = 100
- `token_set_ratio("sharun", "Dragon King Sharun")` = 100  ← tie!
- Length tiebreaker should prefer the longer name, but only if the OCR read
  the full name.  If the prefix ("Dragon King") was garbled, the score for
  "Dragon King Sharun" drops and "Sharun" wins incorrectly.

Other pairs likely to collide: any hero whose name is a substring of a longer hero's name
(e.g. future ML/limited versions, titled units like "Dragon King / Crimson / Seaside").

### Fix Applied (Feb 2026)

Both `_correct_name` (routes_auto_import.py) and `correct_name` (app.py) now multiply
the raw `token_set_ratio` score by a length-similarity factor:

```python
len_ratio = min(len(extracted), len(choice)) / max(len(extracted), len(choice))
score = token_set_ratio * (0.8 + 0.2 * len_ratio)
```

Effect:
- Same-length match → multiplier = 1.0 (no penalty)
- "sharun"(6) vs "Dragon King Sharun"(17) → multiplier ≈ 0.87 (penalised)
- "dragon king sharun"(18) vs "Dragon King Sharun"(18) → multiplier = 1.0

Word-order-swapped names (e.g. "Luna New Moon" → "New Moon Luna") are unaffected
because both strings have the same length so `len_ratio = 1.0`.

---

## TODO: Host Hero Images on AWS S3

### Problem

Hero portrait images are currently served by fetching from the Epic7DB API on demand and caching
locally. With multiple users the app risks getting rate-limited by Epic7DB, and every new image
lookup hits their servers.

### Plan

1. **Create S3 bucket** (`epic-seven-armory-images`) — disable block-public-access, add public
   `GetObject` policy, add CORS rule for `GET` from `*`.
2. **Bulk upload existing cache** — `aws s3 sync backend/hero_images/ s3://<bucket>/heroes/`
3. **Update `hero_images.py`** — `_serve()` returns a `302` redirect to the S3 URL when
   `HERO_IMAGES_S3_BASE` env var is set; falls back to local disk in dev.
4. **Update `update_hero_data.py`** — after saving a new image locally, upload to S3 via `boto3`.
5. **Local `hero_images_reversed/`** stays local — only used by the SIFT scanner, never served.

### Files to Change

| File | Change |
|---|---|
| `backend/scripts/hero_images.py` | `_serve()` → S3 redirect when env var set |
| `backend/scripts/update_hero_data.py` | `boto3` upload after local save |
| `backend/requirements.txt` | Add `boto3>=1.34` |
| `.env` | Add `HERO_IMAGES_S3_BASE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |

### Remaining Edge Cases to Watch

- Units whose entire canonical name is very short (e.g. single-word heroes) will
  naturally score lower against longer OCR reads — acceptable behaviour.
- If OCR consistently misreads a specific name prefix, add a manual override in
  `routes_auto_import.py` (see existing "draaon bride senva" / "new moon luna" guards).
