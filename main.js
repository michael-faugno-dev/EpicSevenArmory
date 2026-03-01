// main.js — Electron main process
//
// Responsibilities:
//   - Create and manage the BrowserWindow (React renderer at APP_URL).
//   - Intercept navigation and window.open calls: same-origin links stay in-app,
//     external URLs are delegated to the system browser via shell.openExternal.
//   - Spawn update_hero_data.py on startup to refresh the local hero database.
//   - Handle the 'google-oauth-signin' IPC channel: loads client credentials from
//     the config JSON file and runs the PKCE desktop OAuth flow (auth/google_native.js).
//   - Stop any running Python subprocess on app quit.
const { app, BrowserWindow, Menu, ipcMain, shell, net } = require("electron");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { googleDesktopSignIn } = require("./auth/google_native");

let mainWindow;
let pythonProcess = null;
let monitorProcess = null;
let stdoutBuffer = "";   // carry-forward buffer for partial stdout lines
let statusCheckInterval = null;

// Unit scanner (hero stat-screen auto-import)
let unitScannerProcess = null;
let unitScanBuffer     = "";
let unitScanToken      = "";
let unitScanUsername   = "";

// Use this to compare origins when deciding if a link is external
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const APP_ORIGIN = new URL(APP_URL).origin;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 1000,
    minWidth: 970,
    minHeight: 660,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  mainWindow.loadURL(APP_URL);

  // Open any target="_blank"/window.open external link in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const dest = new URL(url);
      // Allow same-origin (your app), send everything else to the system browser
      if (dest.origin === APP_ORIGIN) {
        return { action: "allow" };
      }
    } catch {
      // Non-HTTP(S) or invalid URL — treat as external
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Prevent in-app navigation to external sites (but allow same-origin)
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const dest = new URL(url);
      if (dest.origin !== APP_ORIGIN) {
        event.preventDefault();
        shell.openExternal(url);
      }
      // else: same-origin (e.g., http://localhost:3000/route) — allow
    } catch {
      // If URL can't be parsed, be safe and block
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    updateHeroData();
    checkForUpdates();
    // Monitor is user-toggled
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Hide default menu
  Menu.setApplicationMenu(null);

}

// ---------- Helper: load Google client credentials from JSON (no env vars) ----------
// Checks multiple candidate paths so the app works both in dev and when packaged.
function loadGoogleClientFromFile() {
  const candidates = [
    path.join(__dirname, "backend", "config", "google_oauth.json"),
    path.join(__dirname, "config", "google_oauth.json"),
    process.resourcesPath
      ? path.join(
          process.resourcesPath,
          "backend",
          "config",
          "google_oauth.json"
        )
      : null,
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const { client_id, client_secret } = JSON.parse(
          fs.readFileSync(p, "utf8")
        );
        const clientId = (client_id || "").trim();
        const clientSecret = (client_secret || "").trim();
        if (clientId) return { clientId, clientSecret, path: p };
      }
    } catch {
      // try next
    }
  }
  return { clientId: "", clientSecret: "", path: "(not found)" };
}

// ---------- Update hero data on startup ----------
// Runs update_hero_data.py as a child process and forwards its stdout/stderr to
// the renderer via IPC so the UI can show progress or log any errors.
function updateHeroData() {
  const updateScript = path.join(__dirname, "python", "update_hero_data.py");
  console.log("Updating hero data...");

  const updateProcess = spawn("python", [updateScript]);

  updateProcess.stdout.on("data", (data) => {
    console.log(`Update script output: ${data}`);
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("update-output", data.toString());
  });

  updateProcess.stderr.on("data", (data) => {
    console.error(`Update script error: ${data}`);
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("update-error", data.toString());
  });

  updateProcess.on("close", (code) => {
    console.log(`Update script exited with code ${code}`);
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("update-complete", code);
  });
}

// ---------- Update check — compares current version against latest GitHub release ----------
// Uses net.request (Node networking, not subject to renderer CSP).
// If a newer tag is found, sends 'update-available' to the renderer so it can show a banner.
function isNewerVersion(latest, current) {
  const parse = (v) => String(v).replace(/^v/, "").split(".").map(Number);
  const [lMaj = 0, lMin = 0, lPat = 0] = parse(latest);
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

function checkForUpdates() {
  const currentVersion = app.getVersion();
  let req;
  try {
    req = net.request({
      url: "https://api.github.com/repos/michael-faugno-dev/EpicSevenArmory/releases/latest",
      method: "GET",
    });
  } catch (_) { return; }

  req.setHeader("User-Agent", "EpicSevenArmory-UpdateCheck/" + currentVersion);
  req.setHeader("Accept", "application/vnd.github+json");

  const chunks = [];
  req.on("response", (resp) => {
    resp.on("data", (chunk) => chunks.push(chunk));
    resp.on("end", () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const latestTag = (data.tag_name || "").replace(/^v/, "");
        if (latestTag && isNewerVersion(latestTag, currentVersion)) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("update-available", {
              version: latestTag,
              url: data.html_url || "https://github.com/michael-faugno-dev/EpicSevenArmory/releases/latest",
            });
          }
        }
      } catch (_) {}
    });
  });
  req.on("error", () => {});
  req.end();
}

// ---------- App lifecycle — standard Electron patterns ----------
// macOS keeps the app running after the last window closes (activate event re-creates it).
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
// ---------- Stop any running monitor subprocess ----------
function stopPythonScript() {
  if (monitorProcess) {
    try { monitorProcess.kill(); } catch (_) {}
    monitorProcess = null;
  }
}

app.on("will-quit", () => {
  stopPythonScript();
  if (unitScannerProcess) {
    try { unitScannerProcess.kill(); } catch (_) {}
    unitScannerProcess = null;
  }
  if (statusCheckInterval) clearInterval(statusCheckInterval);
});

// IPC handler for Render API calls — runs in the main process so CORS never applies.
// The renderer calls window.api.renderFetch({ url, method, headers, body })
// and gets back { ok, status, json, text, error }.
ipcMain.handle("render-api-fetch", (_event, { url, method = "GET", headers = {}, body }) => {
  return new Promise((resolve) => {
    let req;
    try {
      req = net.request({ url, method, useSessionCookies: false });
    } catch (e) {
      return resolve({ ok: false, status: 0, json: null, text: "", error: String(e.message || e) });
    }

    for (const [k, v] of Object.entries(headers || {})) {
      try { req.setHeader(k, String(v)); } catch (_) {}
    }

    const chunks = [];
    let statusCode = 0;

    req.on("response", (resp) => {
      statusCode = resp.statusCode;
      resp.on("data", (chunk) => chunks.push(chunk));
      resp.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ ok: statusCode >= 200 && statusCode < 300, status: statusCode, json, text });
      });
    });

    req.on("error", (err) => {
      resolve({ ok: false, status: 0, json: null, text: "", error: String(err.message || err) });
    });

    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
});

// ---------- Monitor IPC handlers ----------
// start-monitor: spawns window_monitor.py and forwards its JSON stdout lines
// to the renderer via 'monitor-status' and 'monitor-result' IPC events.
ipcMain.handle("start-monitor", () => {
  if (monitorProcess) {
    return { ok: false, error: "Monitor already running" };
  }

  const matcherDir = path.join(__dirname, "backend", "SiftMatching");
  const monitorScript = path.join(matcherDir, "window_monitor.py");
  const templatesDir = path.join(matcherDir, "data", "templates");

  try {
    monitorProcess = spawn("python", [monitorScript, "--templates", templatesDir], {
      cwd: matcherDir,
    });
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }

  stdoutBuffer = "";

  monitorProcess.stdout.on("data", (data) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split("\n");
    // Keep the last (potentially incomplete) chunk in the buffer
    stdoutBuffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (!mainWindow || mainWindow.isDestroyed()) continue;
        if (msg.status === "detected") {
          mainWindow.webContents.send("monitor-result", msg);
        } else {
          mainWindow.webContents.send("monitor-status", msg);
        }
      } catch (_) {
        // non-JSON debug output — ignore
      }
    }
  });

  monitorProcess.stderr.on("data", (data) => {
    console.error("[monitor stderr]", data.toString());
  });

  monitorProcess.on("close", () => {
    monitorProcess = null;
    stdoutBuffer = "";
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("monitor-status", { status: "stopped" });
    }
  });

  return { ok: true };
});

ipcMain.handle("stop-monitor", () => {
  stopPythonScript();
  return { ok: true };
});

// ── Unit scanner helpers ────────────────────────────────────────────────────

function _postSetStatus(running) {
  try {
    const req = net.request({
      url: "http://127.0.0.1:5000/auto_import/set_status",
      method: "POST",
    });
    req.setHeader("Content-Type", "application/json");
    req.on("response", () => {});
    req.on("error", () => {});
    req.write(JSON.stringify({ running }));
    req.end();
  } catch (_) {}
}

function _postUnitFrame(framePath, winW, winH, chromeX, chromeY) {
  return new Promise((resolve) => {
    let imageBuffer;
    try {
      imageBuffer = fs.readFileSync(framePath);
    } catch (e) {
      return resolve({ ok: false, error: "Cannot read frame: " + e.message });
    }

    const boundary = "----E7ArmoryBoundary" + Date.now();
    const CRLF = "\r\n";

    // Build multipart body
    const parts = [];

    // image field
    parts.push(
      "--" + boundary + CRLF +
      'Content-Disposition: form-data; name="image"; filename="unit_frame.png"' + CRLF +
      "Content-Type: image/png" + CRLF + CRLF
    );

    // win_w and win_h as text fields
    const addField = (name, value) =>
      "--" + boundary + CRLF +
      `Content-Disposition: form-data; name="${name}"` + CRLF + CRLF +
      String(value) + CRLF;

    const prefix = Buffer.from(parts[0]);
    const suffix = Buffer.from(
      CRLF +
      addField("win_w", winW) +
      addField("win_h", winH) +
      addField("chrome_x", chromeX || 0) +
      addField("chrome_y", chromeY || 0) +
      "--" + boundary + "--" + CRLF
    );

    const body = Buffer.concat([prefix, imageBuffer, suffix]);

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 5000,
        path: "/auto_import/unit",
        method: "POST",
        headers: {
          "Content-Type":   `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
          "Authorization":  "Bearer " + unitScanToken,
        },
      },
      (resp) => {
        const chunks = [];
        resp.on("data", (chunk) => chunks.push(chunk));
        resp.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch (_) {}
          resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300,
                    status: resp.statusCode, json });
        });
      }
    );
    req.on("error", (err) => resolve({ ok: false, error: String(err.message || err) }));
    req.write(body);
    req.end();
  });
}

// ── Unit scanner IPC handlers ───────────────────────────────────────────────

ipcMain.handle("start-unit-scanner", (_e, { token, username } = {}) => {
  if (unitScannerProcess) {
    return { ok: false, error: "Unit scanner already running" };
  }

  unitScanToken    = token    || "";
  unitScanUsername = username || "";

  const matcherDir    = path.join(__dirname, "backend", "SiftMatching");
  const scannerScript = path.join(matcherDir, "unit_scanner.py");

  try {
    unitScannerProcess = spawn("python", [scannerScript], { cwd: matcherDir });
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }

  unitScanBuffer = "";
  _postSetStatus(true);

  unitScannerProcess.stdout.on("data", async (data) => {
    unitScanBuffer += data.toString();
    const lines = unitScanBuffer.split("\n");
    unitScanBuffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg;
      try { msg = JSON.parse(trimmed); } catch (_) { continue; }

      if (!mainWindow || mainWindow.isDestroyed()) continue;

      if (msg.status === "captured") {
        // Forward status first so UI shows detecting indicator
        mainWindow.webContents.send("unit-scanner-status", msg);

        // POST frame to Flask — resolve path relative to the scanner's cwd
        const framePath = path.resolve(matcherDir, msg.path);
        const result = await _postUnitFrame(framePath, msg.win_w || 1998, msg.win_h || 1161, msg.chrome_x || 0, msg.chrome_y || 0);
        try { fs.unlinkSync(framePath); } catch (_) {}
        mainWindow.webContents.send("unit-import-result", result.json || { ok: false, error: result.error });
      } else {
        mainWindow.webContents.send("unit-scanner-status", msg);
      }
    }
  });

  unitScannerProcess.stderr.on("data", (data) => {
    console.error("[unit-scanner stderr]", data.toString());
  });

  unitScannerProcess.on("close", () => {
    unitScannerProcess = null;
    unitScanBuffer = "";
    _postSetStatus(false);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("unit-scanner-status", { status: "stopped" });
    }
  });

  return { ok: true };
});

ipcMain.handle("stop-unit-scanner", () => {
  if (unitScannerProcess) {
    try { unitScannerProcess.kill(); } catch (_) {}
    unitScannerProcess = null;
    unitScanBuffer = "";
  }
  _postSetStatus(false);
  return { ok: true };
});

// IPC handler for Google sign-in. Called by the renderer via window.api.googleSignIn().
// Loads client credentials from the config JSON (never from env vars in packaged builds),
// runs the PKCE desktop flow, and returns the tokens/profile to the renderer.
ipcMain.handle("google-oauth-signin", async () => {
  try {
    const { clientId, clientSecret } = loadGoogleClientFromFile();
    if (!clientId) {
      return {
        ok: false,
        error:
          "Missing client_id. Create backend/config/google_oauth.json with your Desktop Client ID.",
      };
    }
    const result = await googleDesktopSignIn({ clientId, clientSecret });
    return { ok: true, ...result };
  } catch (err) {
    console.error("google-oauth-signin error:", err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});
