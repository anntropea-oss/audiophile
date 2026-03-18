import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const sanitizeName = (name) => name.replace(/[^a-z0-9._-]/gi, "_");

const runFfmpeg = (ffmpegBin, args) =>
  new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, ["-hide_banner", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stderr);
      } else {
        reject(new Error(stderr || `ffmpeg failed with code ${code}`));
      }
    });
  });

const parseVolumedetect = (text) => {
  const maxMatch = text.match(/max_volume:\s*(-?[\d.]+)\s*dB/i);
  const meanMatch = text.match(/mean_volume:\s*(-?[\d.]+)\s*dB/i);
  return {
    maxVolumeDb: maxMatch ? Number(maxMatch[1]) : null,
    meanVolumeDb: meanMatch ? Number(meanMatch[1]) : null,
  };
};

const runVolumedetect = async (ffmpegBin, filePath) => {
  const stderr = await runFfmpeg(ffmpegBin, [
    "-i",
    filePath,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  return parseVolumedetect(stderr);
};

const buildFilter = (settings, gainDb) => {
  const hp = Number.isFinite(settings.hpFreq) ? settings.hpFreq : 60;
  const threshold = Number.isFinite(settings.compThreshold) ? settings.compThreshold : -24;
  const ratio = Number.isFinite(settings.compRatio) ? settings.compRatio : 3;
  const limiter = Number.isFinite(settings.limiterCeiling) ? settings.limiterCeiling : -1;
  const safeGain = Number.isFinite(gainDb) ? gainDb : 0;
  // FFmpeg acompressor attack must be >= 0.01
  const attack = 0.01;
  const release = 0.25;
  return [
    `highpass=f=${hp}`,
    `volume=${safeGain.toFixed(2)}dB`,
    `acompressor=threshold=${threshold}dB:ratio=${ratio}:attack=${attack}:release=${release}`,
    `alimiter=limit=${limiter}dB`,
  ].join(",");
};

export function createApp() {
  const app = express();
  const dataRoot = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
  const uploadsRoot = path.join(dataRoot, "uploads");
  const processedRoot = path.join(dataRoot, "processed");
  const logsRoot = path.join(dataRoot, "logs");
  ensureDir(uploadsRoot);
  ensureDir(processedRoot);
  ensureDir(logsRoot);

  const require = createRequire(import.meta.url);
  let ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";
  if (!process.env.FFMPEG_PATH) {
    try {
      const installer = require("@ffmpeg-installer/ffmpeg");
      if (installer?.path) ffmpegBin = installer.path;
    } catch (err) {
      // Ignore if installer is unavailable; fallback to PATH.
    }
  }
  const ffmpegAvailable = spawnSync(ffmpegBin, ["-version"], { stdio: "ignore" }).status === 0;
  const logFile = process.env.LOG_FILE || path.join(logsRoot, "server.log");
  const clientLogFile = process.env.CLIENT_LOG_FILE || path.join(logsRoot, "client.log");

  const writeLog = (file, entry) => {
    fs.appendFile(file, `${JSON.stringify(entry)}\n`, () => {});
  };

  writeLog(logFile, {
    ts: new Date().toISOString(),
    event: "ffmpeg",
    path: ffmpegBin,
    available: ffmpegAvailable,
  });

  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      writeLog(logFile, {
        ts: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
        ip: req.ip,
        ua: req.get("user-agent"),
        referer: req.get("referer"),
        accept: req.get("accept"),
      });
    });
    next();
  });

  app.use(express.static(__dirname));
  app.use("/processed", express.static(processedRoot));

  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });

  app.get("/health", (req, res) => {
    res.json({ ok: true, ffmpeg: ffmpegAvailable });
  });

  app.post("/client-log", (req, res) => {
    writeLog(clientLogFile, {
      ts: new Date().toISOString(),
      type: req.body?.type || "log",
      message: req.body?.message || "",
      meta: req.body?.meta || null,
    });
    res.json({ ok: true });
  });

  const initJob = (req, res, next) => {
    const jobId = crypto.randomUUID();
    req.jobId = jobId;
    req.uploadDir = path.join(uploadsRoot, jobId);
    req.processedDir = path.join(processedRoot, jobId);
    ensureDir(req.uploadDir);
    ensureDir(req.processedDir);
    next();
  };

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, req.uploadDir),
    filename: (req, file, cb) => {
      const safe = sanitizeName(file.originalname);
      const unique = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${safe}`;
      cb(null, unique);
    },
  });

  const upload = multer({ storage });

  app.post("/process", initJob, upload.array("files"), async (req, res) => {
    if (!ffmpegAvailable) {
      return res.status(503).json({ ok: false, error: "FFmpeg not available on server" });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, error: "No files uploaded" });
    }

    const settings = {
      normMode: req.body?.normMode === "rms" ? "rms" : "peak",
      targetDb: Number(req.body?.targetDb ?? -1),
      hpFreq: Number(req.body?.hpFreq ?? 60),
      compThreshold: Number(req.body?.compThreshold ?? -24),
      compRatio: Number(req.body?.compRatio ?? 3),
      limiterCeiling: Number(req.body?.limiterCeiling ?? -1),
      mp3Export: req.body?.mp3Export === "on",
      mp3Bitrate: req.body?.mp3Bitrate || "256k",
    };

    const results = [];
    let index = 0;
    for (const file of req.files) {
      index += 1;
      const base = sanitizeName(path.parse(file.originalname).name) || "audio";
      const suffix = `_${index}`;
      const inputPath = file.path;
      const wavName = `${base}${suffix}_mastered.wav`;
      const mp3Name = `${base}${suffix}_mastered.mp3`;
      const pngName = `${base}${suffix}_waveform.png`;
      const outWav = path.join(req.processedDir, wavName);
      const outMp3 = path.join(req.processedDir, mp3Name);
      const outPng = path.join(req.processedDir, pngName);

      try {
        const inputStats = await runVolumedetect(ffmpegBin, inputPath);
        const refLevel =
          settings.normMode === "rms" ? inputStats.meanVolumeDb : inputStats.maxVolumeDb;
        const gainDb = Number.isFinite(refLevel) ? settings.targetDb - refLevel : 0;

        const filter = buildFilter(settings, gainDb);
        await runFfmpeg(ffmpegBin, [
          "-y",
          "-i",
          inputPath,
          "-af",
          filter,
          "-ar",
          "48000",
          "-ac",
          "2",
          outWav,
        ]);

        const outputStats = await runVolumedetect(ffmpegBin, outWav);

        await runFfmpeg(ffmpegBin, [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=c=#fff1f7:s=800x160",
          "-i",
          outWav,
          "-filter_complex",
          "[1:a]showwavespic=s=800x160:colors=#b23a76[sw];[0][sw]overlay",
          "-frames:v",
          "1",
          outPng,
        ]);

        let mp3Url = null;
        if (settings.mp3Export) {
          await runFfmpeg(ffmpegBin, [
            "-y",
            "-i",
            outWav,
            "-codec:a",
            "libmp3lame",
            "-b:a",
            settings.mp3Bitrate,
            outMp3,
          ]);
          mp3Url = `/processed/${req.jobId}/${mp3Name}`;
        }

        results.push({
          originalName: file.originalname,
          success: true,
          outputWavUrl: `/processed/${req.jobId}/${wavName}`,
          outputMp3Url: mp3Url,
          waveformUrl: `/processed/${req.jobId}/${pngName}`,
          stats: {
            inputPeakDb: inputStats.maxVolumeDb,
            inputMeanDb: inputStats.meanVolumeDb,
            outputPeakDb: outputStats.maxVolumeDb,
            outputMeanDb: outputStats.meanVolumeDb,
            gainDb: Number.isFinite(gainDb) ? Number(gainDb.toFixed(2)) : 0,
            targetDb: settings.targetDb,
            normMode: settings.normMode,
          },
        });
      } catch (err) {
        results.push({
          originalName: file.originalname,
          success: false,
          error: err?.message || "Processing failed",
        });
      } finally {
        fs.unlink(inputPath, () => {});
      }
    }

    return res.json({ ok: true, jobId: req.jobId, files: results });
  });

  app.use((err, req, res, next) => {
    writeLog(logFile, {
      ts: new Date().toISOString(),
      error: err?.message || "unknown error",
      stack: err?.stack || null,
      url: req.originalUrl,
      method: req.method,
    });
    res.status(500).json({ ok: false });
    next();
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 8080;
  const app = createApp();
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}
