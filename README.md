New Readme Coming Soon.
# Epic Seven Armory  
**Desktop Unit Tracker & Twitch Overlay for Epic Seven**

Epic Seven Armory is a desktop application and Twitch extension designed to track Epic Seven units, extract stats automatically from gameplay, and display selected units live on stream as an overlay.

The system combines **manual control**, **automatic detection**, and a **stream-ready overlay** so streamers can manage units without breaking gameplay flow.

---

## Features

- Manual unit selection for full control  
- Automatic unit detection using SIFT image matching  
- Persistent unit tracking and stat storage  
- Stream-ready Twitch overlay with live updates  
- Desktop app built for long-running sessions  

---

## Tech Stack

**Desktop App**
- Electron  
- React  
- Flask  
- MongoDB  

**Image Processing**
- OpenCV  
- SIFT feature matching  
- PyTesseract (OCR)  

**Auth & Integration**
- Google OAuth (Desktop / PKCE)  
- Twitch Extension (Overlay + Config Page)  

---

## How It Works (High Level)

1. The desktop app monitors the Epic Seven game window  
2. Screenshots are analyzed to detect units and stats  
3. Units are stored and updated in the local database  
4. Selected units are sent to the Twitch extension  
5. The overlay displays units and stats live on stream  

---

## Manual Unit Overlay Selection

Streamers can manually select which units appear on the Twitch overlay. This is useful for:

- Draft discussions  
- RTA breakdowns  
- Highlighting specific builds  

### Images
_Add images here:_

```
/images/manual-overlay-selection-1.png
/images/manual-overlay-selection-2.png
```

---

## Automatic Selection with SIFT Matching

The app can automatically detect units on screen using **SIFT feature matching**. When a known unit portrait is detected:

- The unit is matched against stored data  
- Stats are refreshed  
- The overlay updates automatically  

This allows hands-off operation during gameplay.

### Images

```
![Sift Results](SiftResults.png
```

---

## Your Units

All detected and manually added units are stored in the **Your Units** section.  
Units persist between sessions and can be expanded to view full stat breakdowns or deleted if needed.

### Images
_Add images here:_

```
/images/your-units-1.png
/images/your-units-2.png
```

---

## Unit Stats

Each unit includes extracted and stored stats such as:

- Attack, Defense, Health  
- Speed, Crit Chance, Crit Damage  
- Effectiveness and Effect Resistance  
- Set and gear metadata (when available)  

Stats are updated automatically when new screenshots are processed.

### Images
_Add images here:_

```
/images/unit-stats-1.png
/images/unit-stats-2.png
```

---

## Twitch Extension

The Twitch extension mirrors the unit overlay from the desktop app:

- No browser sources required  
- Real-time updates  
- Designed to sit cleanly on stream without UI clutter  

The extension includes:

- Viewer overlay  
- Streamer configuration page  
- Secure OAuth-based login  

---

## Project Status

This project is actively developed and used as a live streaming tool.  
Features, UI, and detection accuracy continue to evolve based on real gameplay testing.

---

## Notes

- Designed specifically for **Epic Seven**  
- Targets the **standalone game window**, not emulators  
- Built for long uptime and live streaming reliability  
