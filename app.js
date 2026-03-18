const folderInput = document.getElementById("folderInput");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const browseFilesBtn = document.getElementById("browseFilesBtn");
const fileCount = document.getElementById("fileCount");
const sampleRate = document.getElementById("sampleRate");
const statusLabel = document.getElementById("status");
const fileList = document.getElementById("fileList");
const progress = document.getElementById("progress");
const processBtn = document.getElementById("processBtn");
const clearBtn = document.getElementById("clearBtn");
const ffmpegStatus = document.getElementById("ffmpegStatus");
const serverStatus = document.getElementById("serverStatus");
const ffmpegBadge = document.getElementById("ffmpegBadge");
const batchStatus = document.getElementById("batchStatus");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");
const logBox = document.getElementById("logBox");
const clearLogBtn = document.getElementById("clearLogBtn");

const normMode = document.getElementById("normMode");
const targetDb = document.getElementById("targetDb");
const hpFreq = document.getElementById("hpFreq");
const compThreshold = document.getElementById("compThreshold");
const compRatio = document.getElementById("compRatio");
const limiterCeiling = document.getElementById("limiterCeiling");
const mp3Export = document.getElementById("mp3Export");
const mp3Bitrate = document.getElementById("mp3Bitrate");

let files = [];
let isProcessing = false;

const supportedExtensions = [".wav", ".aif", ".aiff", ".mp3", ".m4a", ".flac", ".ogg"];

function setBadge(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("ok", "warn", "error", "busy");
  if (type) el.classList.add(type);
}

function appendLog(level, message) {
  if (!logBox) return;
  const line = document.createElement("div");
  line.className = `log-line ${level}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
  sendClientLog(level, message);
}

function safeStringify(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

function sendClientLog(level, message) {
  const payload = JSON.stringify({ type: level, message });
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/client-log", blob);
    return;
  }
  fetch("/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

function hookConsole() {
  if (!logBox) return;
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args) => {
    appendLog("log", args.map(safeStringify).join(" "));
    origLog(...args);
  };
  console.warn = (...args) => {
    appendLog("warn", args.map(safeStringify).join(" "));
    origWarn(...args);
  };
  console.error = (...args) => {
    appendLog("error", args.map(safeStringify).join(" "));
    origError(...args);
  };

  window.addEventListener("error", (event) => {
    appendLog("error", `${event.message} (${event.filename}:${event.lineno})`);
  });

  window.addEventListener("unhandledrejection", (event) => {
    appendLog("error", `Unhandled promise rejection: ${safeStringify(event.reason)}`);
  });
}

function updateProgress(done, total) {
  if (!progressFill || !progressText) return;
  const pct = total ? Math.round((done / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressText.textContent = `${pct}%`;
  if (progressBar) {
    progressBar.setAttribute("aria-valuenow", String(pct));
  }
}

async function checkServer() {
  if (!serverStatus) return;
  try {
    const res = await fetch("/health", { cache: "no-store" });
    if (!res.ok) throw new Error("bad");
    const body = await res.json();
    setBadge(serverStatus, "Online", "ok");
    if (body.ffmpeg === false) {
      setBadge(ffmpegBadge, "Missing", "error");
      ffmpegStatus.textContent = "FFmpeg: missing on server";
    } else {
      setBadge(ffmpegBadge, "Ready", "ok");
      ffmpegStatus.textContent = "FFmpeg: server-side";
    }
  } catch (err) {
    setBadge(serverStatus, "Offline", "error");
  }
}

function updateSummary() {
  fileCount.textContent = files.length;
  statusLabel.textContent = files.length ? "Ready" : "Waiting";
  if (!isProcessing) {
    progress.textContent = `0 / ${files.length}`;
  }
  processBtn.disabled = !files.length || isProcessing;
  mp3Export.disabled = isProcessing;
  mp3Bitrate.disabled = isProcessing;
  if (!isProcessing) {
    updateProgress(0, 0);
  }
  if (batchStatus) {
    if (isProcessing) {
      setBadge(batchStatus, "Running", "busy");
    } else if (!files.length) {
      setBadge(batchStatus, "Empty", "error");
    } else {
      setBadge(batchStatus, "Idle", "warn");
    }
  }
}

function resetList() {
  fileList.innerHTML = '<p class="empty">No files yet. Add a folder to get started.</p>';
}

function clearFiles() {
  if (isProcessing) return;
  files = [];
  folderInput.value = "";
  fileInput.value = "";
  sampleRate.textContent = "-";
  progress.textContent = "0 / 0";
  updateProgress(0, 0);
  updateSummary();
  resetList();
}

function createRow(name) {
  const row = document.createElement("div");
  row.className = "file-row";
  row.dataset.name = name;
  row.innerHTML = `
    <div>
      <p>${name}</p>
      <img class="waveform" alt="Waveform preview" />
      <audio class="audio-preview" controls preload="none"></audio>
    </div>
    <div class="stats stats-input">
      <div>Input peak: -</div>
      <div>Input RMS: -</div>
      <div>Target: -</div>
    </div>
    <div class="stats stats-output">
      <div>Output peak: -</div>
      <div>Output RMS: -</div>
      <div>Gain: -</div>
    </div>
    <div class="file-actions">
      <span class="pill status queued">Queued</span>
      <div class="links"></div>
    </div>
  `;
  fileList.appendChild(row);
  return row;
}

function renderFileList() {
  fileList.innerHTML = "";
  files.forEach((file) => createRow(file.name));
}

function handleSelection(fileListInput) {
  if (isProcessing) return;
  files = Array.from(fileListInput).filter((file) => {
    if (file.type && file.type.startsWith("audio/")) return true;
    return supportedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
  });
  appendLog("log", `Selected ${fileListInput.length} item(s), ${files.length} supported audio files.`);
  updateSummary();
  renderFileList();
  if (!files.length) {
    appendLog("warn", "No supported audio files found in selection.");
    statusLabel.textContent = "No supported audio files found";
  }
}

function updateRow(row, result) {
  if (!row || !result) return;
  const statusCell = row.querySelector(".status");
  const inputStats = row.querySelector(".stats-input");
  const outputStats = row.querySelector(".stats-output");
  const links = row.querySelector(".links");
  const waveformImg = row.querySelector(".waveform");
  const audio = row.querySelector(".audio-preview");

  links.innerHTML = "";

  if (!result.success) {
    statusCell.textContent = "Failed";
    statusCell.className = "pill status failed";
    inputStats.innerHTML = `
      <div>Input peak: -</div>
      <div>Input RMS: -</div>
      <div>${result.error || "Processing failed"}</div>
    `;
    outputStats.innerHTML = `
      <div>Output peak: -</div>
      <div>Output RMS: -</div>
      <div>Gain: -</div>
    `;
    return;
  }

  const stats = result.stats || {};
  const targetLabel =
    stats.normMode === "rms" ? `${stats.targetDb} dB RMS` : `${stats.targetDb} dBFS`;
  inputStats.innerHTML = `
    <div>Input peak: ${stats.inputPeakDb ?? "-"} dB</div>
    <div>Input RMS: ${stats.inputMeanDb ?? "-"} dB</div>
    <div>Target: ${targetLabel}</div>
  `;
  outputStats.innerHTML = `
    <div>Output peak: ${stats.outputPeakDb ?? "-"} dB</div>
    <div>Output RMS: ${stats.outputMeanDb ?? "-"} dB</div>
    <div>Gain: ${stats.gainDb ?? "-"} dB</div>
  `;

  if (waveformImg && result.waveformUrl) {
    waveformImg.src = result.waveformUrl;
  }

  if (audio) {
    audio.innerHTML = "";
    if (result.outputMp3Url) {
      const srcMp3 = document.createElement("source");
      srcMp3.src = result.outputMp3Url;
      srcMp3.type = "audio/mpeg";
      audio.appendChild(srcMp3);
    }
    if (result.outputWavUrl) {
      const srcWav = document.createElement("source");
      srcWav.src = result.outputWavUrl;
      srcWav.type = "audio/wav";
      audio.appendChild(srcWav);
    }
  }

  const wavLink = document.createElement("a");
  wavLink.className = "download";
  wavLink.href = result.outputWavUrl;
  wavLink.download = "";
  wavLink.textContent = "Download WAV";
  links.appendChild(wavLink);

  if (result.outputMp3Url) {
    const mp3Link = document.createElement("a");
    mp3Link.className = "download";
    mp3Link.href = result.outputMp3Url;
    mp3Link.download = "";
    mp3Link.textContent = "Download MP3";
    links.appendChild(mp3Link);
  }

  if (result.waveformUrl) {
    const pngLink = document.createElement("a");
    pngLink.className = "download";
    pngLink.href = result.waveformUrl;
    pngLink.download = "";
    pngLink.textContent = "Download PNG";
    links.appendChild(pngLink);
  }

  statusCell.textContent = "Ready";
  statusCell.className = "pill status ready";
}

async function processBatch() {
  if (!files.length || isProcessing) return;
  isProcessing = true;
  processBtn.disabled = true;
  statusLabel.textContent = "Uploading";
  setBadge(batchStatus, "Running", "busy");
  updateProgress(0, files.length);
  progress.textContent = `0 / ${files.length}`;

  const form = new FormData();
  files.forEach((file) => form.append("files", file, file.name));
  form.append("normMode", normMode.value);
  form.append("targetDb", targetDb.value);
  form.append("hpFreq", hpFreq.value);
  form.append("compThreshold", compThreshold.value);
  form.append("compRatio", compRatio.value);
  form.append("limiterCeiling", limiterCeiling.value);
  form.append("mp3Export", mp3Export.value);
  form.append("mp3Bitrate", mp3Bitrate.value);

  try {
    const res = await fetch("/process", { method: "POST", body: form });
    if (!res.ok) {
      throw new Error(`Server error ${res.status}`);
    }
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error || "Processing failed");
    }

    const rows = Array.from(fileList.children);
    let processed = 0;
    data.files.forEach((result, index) => {
      updateRow(rows[index], result);
      processed += 1;
      updateProgress(processed, files.length);
      progress.textContent = `${processed} / ${files.length}`;
    });

    statusLabel.textContent = "Done";
    setBadge(batchStatus, "Done", "ok");
    if (data.sampleRate) {
      sampleRate.textContent = `${data.sampleRate} Hz`;
    }
  } catch (err) {
    appendLog("error", err.message || "Processing failed");
    statusLabel.textContent = "Failed";
    setBadge(batchStatus, "Error", "error");
  } finally {
    isProcessing = false;
    updateSummary();
  }
}

function bindUI() {
  browseBtn.addEventListener("click", () => folderInput.click());
  if (browseFilesBtn) browseFilesBtn.addEventListener("click", () => fileInput.click());
  folderInput.addEventListener("change", (event) => handleSelection(event.target.files));
  if (fileInput) fileInput.addEventListener("change", (event) => handleSelection(event.target.files));
  clearBtn.addEventListener("click", clearFiles);

  const dropzone = document.getElementById("dropzone");
  if (dropzone) {
    dropzone.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      folderInput.click();
    });
    dropzone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        folderInput.click();
      }
    });
    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("drag");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("drag");
    });
    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropzone.classList.remove("drag");
      if (event.dataTransfer && event.dataTransfer.files) {
        appendLog("log", `Dropped ${event.dataTransfer.files.length} item(s).`);
        handleSelection(event.dataTransfer.files);
      }
    });
  }

  processBtn.addEventListener("click", processBatch);

  if (clearLogBtn) {
    clearLogBtn.addEventListener("click", () => {
      if (logBox) logBox.innerHTML = "";
    });
  }
}

updateSummary();
setBadge(ffmpegBadge, "Unknown", "warn");
ffmpegStatus.textContent = "FFmpeg: checking...";
checkServer();
setInterval(checkServer, 5000);
hookConsole();
appendLog("log", "Ready. Click Browse Folder or Select Files, or drop files here.");
bindUI();
