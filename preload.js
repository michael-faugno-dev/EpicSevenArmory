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
});
