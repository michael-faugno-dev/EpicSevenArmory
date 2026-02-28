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
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { googleDesktopSignIn } = require("./auth/google_native");

let mainWindow;
let pythonProcess = null;
let statusCheckInterval = null;
let monitorEnabled = false;

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
    // Monitor is user-toggled
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Hide default menu
  Menu.setApplicationMenu(null);

  if (!statusCheckInterval) {
    statusCheckInterval = setInterval(checkMonitorStatus, 1000);
  }
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

// ---------- App lifecycle — standard Electron patterns ----------
// macOS keeps the app running after the last window closes (activate event re-creates it).
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("will-quit", () => {
  stopPythonScript();
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
