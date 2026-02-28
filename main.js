import { app, BrowserWindow } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { startApiServer } from "./server/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  await win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(async () => {
  const docs = app.getPath("documents");
  const dataDir = path.join(docs, "Passeeker");
  ensureDir(dataDir);

  await startApiServer({ host: "127.0.0.1", port: 8787, dataDir });
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});