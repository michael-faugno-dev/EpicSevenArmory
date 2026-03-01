// preload.js — Electron preload script
//
// Runs in a privileged context (Node.js access) but is sandboxed from the
// renderer page. contextBridge.exposeInMainWorld creates a safe, explicit
// API surface on window.api so the renderer can communicate with the main
// process via IPC without having direct access to Node.js or ipcRenderer.
//
// Each method wraps ipcRenderer calls and cleans up its own event listener
// by returning a removal function, preventing memory leaks on component unmount.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  onPythonOutput: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("python-output", listener);
    return () => ipcRenderer.removeListener("python-output", listener);
  },
  onPythonError: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("python-error", listener);
    return () => ipcRenderer.removeListener("python-error", listener);
  },

  // NEW: Google sign-in (will open browser, then resolve with tokens/profile)
  googleSignIn: () => ipcRenderer.invoke("google-oauth-signin"),

  // Proxy HTTP requests through the main process so CORS never applies.
  // Used for calls to the Render backend from the renderer.
  renderFetch: (args) => ipcRenderer.invoke("render-api-fetch", args),

  // Notifies the renderer when a newer GitHub release is detected.
  // Returns a cleanup function to remove the listener on unmount.
  onUpdateAvailable: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("update-available", listener);
    return () => ipcRenderer.removeListener("update-available", listener);
  },

  // ---------- Live window monitor ----------
  // Start the Python window monitor subprocess. Resolves with { ok, error }.
  startMonitor: () => ipcRenderer.invoke("start-monitor"),

  // Stop the running monitor subprocess. Resolves with { ok }.
  stopMonitor: () => ipcRenderer.invoke("stop-monitor"),

  // Subscribe to window-status events (window_found, window_not_found, stopped, …).
  // Returns a cleanup function — call it on component unmount.
  onMonitorStatus: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("monitor-status", listener);
    return () => ipcRenderer.removeListener("monitor-status", listener);
  },

  // Subscribe to detection results ({ status: "detected", clean: [...], banned }).
  // Returns a cleanup function — call it on component unmount.
  onMonitorResult: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("monitor-result", listener);
    return () => ipcRenderer.removeListener("monitor-result", listener);
  },

  // ---------- Unit auto-import scanner ----------
  // Start the hero stat-screen monitor. token + username are passed so main.js
  // can POST captured frames to Flask on behalf of the logged-in user.
  startUnitScanner: (token, username) =>
    ipcRenderer.invoke("start-unit-scanner", { token, username }),

  // Stop the unit scanner subprocess.
  stopUnitScanner: () => ipcRenderer.invoke("stop-unit-scanner"),

  // Subscribe to unit scanner status events (window_found, capturing, stopped, …).
  onUnitScannerStatus: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("unit-scanner-status", listener);
    return () => ipcRenderer.removeListener("unit-scanner-status", listener);
  },

  // Subscribe to import results ({ ok, event_type, hero_name, cp } or error).
  onUnitImportResult: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("unit-import-result", listener);
    return () => ipcRenderer.removeListener("unit-import-result", listener);
  },
});
