import { app, BrowserWindow, dialog, session } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import updaterPkg from "electron-updater";
import { createApp } from "./server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverInstance;
let dataDir;
let mainLogPath;

const logMain = (message) => {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  if (mainLogPath) {
    fs.appendFile(mainLogPath, line, () => {});
  } else {
    console.error(line.trim());
  }
};

process.on("uncaughtException", (err) => {
  logMain(`Uncaught exception: ${err?.stack || err}`);
});

process.on("unhandledRejection", (err) => {
  logMain(`Unhandled rejection: ${err?.stack || err}`);
});

const startServer = () =>
  new Promise((resolve, reject) => {
    try {
      const appInstance = createApp();
      const server = appInstance.listen(0, () => {
        const { port } = server.address();
        logMain(`Server started on port ${port}`);
        resolve({ server, port });
      });
      server.on("error", (err) => {
        logMain(`Server error: ${err?.message || err}`);
        reject(err);
      });
    } catch (err) {
      logMain(`Server init failed: ${err?.stack || err}`);
      reject(err);
    }
  });

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: "#f7f7f7",
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
    },
  });

  const { server, port } = await startServer();
  serverInstance = server;
  await session.defaultSession.clearCache();
  await mainWindow.loadURL(`http://localhost:${port}`);
  mainWindow.webContents.reloadIgnoringCache();

  const logPath = dataDir ? path.join(dataDir, "electron-renderer.log") : null;
  if (logPath) {
    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      const entry = `[${new Date().toISOString()}] [L${level}] ${message} (${sourceId}:${line})\n`;
      fs.appendFile(logPath, entry, () => {});
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      const entry = `[${new Date().toISOString()}] [RENDERER GONE] ${JSON.stringify(details)}\n`;
      fs.appendFile(logPath, entry, () => {});
    });
    mainWindow.on("unresponsive", () => {
      const entry = `[${new Date().toISOString()}] [WINDOW] unresponsive\n`;
      fs.appendFile(logPath, entry, () => {});
    });
  }
};

app.whenReady().then(async () => {
  dataDir = path.join(app.getPath("userData"), "audio-suite");
  process.env.DATA_DIR = dataDir;
  fs.mkdirSync(dataDir, { recursive: true });
  mainLogPath = path.join(dataDir, "electron-main.log");
  logMain("Electron app starting");

  const { autoUpdater } = updaterPkg;
  if (process.env.UPDATE_FEED_URL) {
    autoUpdater.setFeedURL({ provider: "generic", url: process.env.UPDATE_FEED_URL });
  }
  autoUpdater.autoDownload = true;
  autoUpdater.on("update-available", () => {
    dialog.showMessageBox({
      type: "info",
      buttons: ["OK"],
      title: "Update available",
      message: "A new version is available. Downloading in the background.",
    });
  });
  autoUpdater.on("update-downloaded", async () => {
    const result = await dialog.showMessageBox({
      type: "info",
      buttons: ["Install and Restart", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: "Update downloaded. Install and restart now?",
    });
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
  autoUpdater.on("error", (err) => {
    console.error("Auto update failed:", err?.message || err);
  });

  if (ffmpegInstaller?.path) {
    let ffmpegPath = ffmpegInstaller.path;
    if (ffmpegPath.includes("app.asar")) {
      ffmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
    }
    if (!fs.existsSync(ffmpegPath)) {
      const fallback = path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "@ffmpeg-installer",
        "darwin-arm64",
        "ffmpeg"
      );
      if (fs.existsSync(fallback)) ffmpegPath = fallback;
    }
    process.env.FFMPEG_PATH = ffmpegPath;
  }
  await createWindow();
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("Auto update check failed:", err?.message || err);
  });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (serverInstance) {
    serverInstance.close(() => {});
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
