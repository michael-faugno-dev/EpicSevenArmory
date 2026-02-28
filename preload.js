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
});
