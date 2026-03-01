const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("passeeker", {
  apiBase: "http://127.0.0.1:8787"
});