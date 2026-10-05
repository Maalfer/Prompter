(() => {
  "use strict";

  const STORAGE_KEY = "prompter.text";
  const SPEED_KEY = "prompter.speed";
  const SIZE_KEY = "prompter.size";
  const MIRROR_KEY = "prompter.mirror";
  const SCRIPTS_KEY = "prompter.scripts";
  const ACTIVE_KEY = "prompter.activeId";
  const SEED_FLAG = "prompter.seeded";

  const DEFAULT_SCRIPTS = /* contenido purgado del historial */;

  // ---- Elements ----
  const reader = document.getElementById("reader");
  const editor = document.getElementById("editor");
  const library = document.getElementById("library");
  const reviewPanel = document.getElementById("reviewPanel");
  const cameraPreview = document.getElementById("cameraPreview");
  const scrollArea = document.getElementById("scrollArea");
  const textDisplay = document.getElementById("textDisplay");
  const textInput = document.getElementById("textInput");
  const titleInput = document.getElementById("titleInput");
  const libraryList = document.getElementById("libraryList");
  const recTimer = document.getElementById("recTimer");
  const reviewVideo = document.getElementById("reviewVideo");
  const toastEl = document.getElementById("toast");

  const btnPlay = document.getElementById("btnPlay");
  const btnEdit = document.getElementById("btnEdit");
  const btnLibrary = document.getElementById("btnLibrary");
  const btnLibraryClose = document.getElementById("btnLibraryClose");
  const btnNewScript = document.getElementById("btnNewScript");
  const btnRestoreDefaults = document.getElementById("btnRestoreDefaults");
  const btnDone = document.getElementById("btnDone");
  const btnClear = document.getElementById("btnClear");
  const btnTop = document.getElementById("btnTop");
  const btnMirror = document.getElementById("btnMirror");
  const btnFullscreen = document.getElementById("btnFullscreen");
  const btnCamera = document.getElementById("btnCamera");
  const btnRecord = document.getElementById("btnRecord");
  const btnDiscard = document.getElementById("btnDiscard");
  const btnSave = document.getElementById("btnSave");
  const speedRange = document.getElementById("speedRange");
  const sizeRange = document.getElementById("sizeRange");

  // ---- Teleprompter scroll state ----
  let playing = false;
  let rafId = null;
  let lastTime = null;
  let pxPerSec = 0;
  let scrollPos = 0;

  // ---- Script library state ----
  let scripts = [];
  let activeId = null;
  let editingId = null;

  // ---- Camera / recording state ----
  let cameraStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recording = false;
  let recordStartTime = 0;
  let recordTimerInterval = null;
  let lastRecordingBlob = null;
  let lastRecordingUrl = null;

  function genId() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  // ---- Toast ----
  let toastTimeout = null;
  function toast(message, ms = 2800) {
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    requestAnimationFrame(() => toastEl.classList.add("show"));
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove("show");
      setTimeout(() => toastEl.classList.add("hidden"), 300);
    }, ms);
  }

  // ---- Script storage ----
  function saveScripts() {
    localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts));
  }

  function saveActiveId() {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    else localStorage.removeItem(ACTIVE_KEY);
  }

  function saveCurrentText(value) {
    localStorage.setItem(STORAGE_KEY, value);
  }

  function init() {
    try {
      scripts = JSON.parse(localStorage.getItem(SCRIPTS_KEY) || "[]");
    } catch (e) {
      scripts = [];
    }

    let justSeeded = false;
    if (!localStorage.getItem(SEED_FLAG)) {
      if (scripts.length === 0) {
        scripts = DEFAULT_SCRIPTS.map((s) => ({ ...s }));
        saveScripts();
        justSeeded = true;
      }
      localStorage.setItem(SEED_FLAG, "1");
    }

    activeId = localStorage.getItem(ACTIVE_KEY);
    if (justSeeded && !activeId && scripts[0]) {
      activeId = scripts[0].id;
    }

    const activeScript = scripts.find((s) => s.id === activeId);
    let text;
    if (activeScript) {
      text = activeScript.text;
    } else {
      activeId = null;
      text = localStorage.getItem(STORAGE_KEY) || "";
    }

    textDisplay.textContent = text;
    saveCurrentText(text);
    saveActiveId();
  }

  function applySpeedLabel(value) {
    pxPerSec = parseFloat(value) * 18;
  }

  function loadSettings() {
    const speed = localStorage.getItem(SPEED_KEY);
    const size = localStorage.getItem(SIZE_KEY);
    const mirror = localStorage.getItem(MIRROR_KEY);

    if (speed) speedRange.value = speed;
    if (size) sizeRange.value = size;

    applySpeedLabel(speedRange.value);
    textDisplay.style.fontSize = sizeRange.value + "px";

    if (mirror === "1") {
      reader.classList.add("mirrored");
      btnMirror.classList.add("active");
    }
  }

  // ---- Teleprompter scroll ----
  function pause() {
    playing = false;
    lastTime = null;
    btnPlay.textContent = "▶";
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function play() {
    if (!textDisplay.textContent.trim()) {
      openLibrary();
      return;
    }
    playing = true;
    btnPlay.textContent = "❙❙";
    lastTime = null;
    scrollPos = scrollArea.scrollTop;
    rafId = requestAnimationFrame(step);
  }

  function togglePlay() {
    if (playing) pause();
    else play();
  }

  function step(timestamp) {
    if (!playing) return;
    if (lastTime !== null) {
      const dt = (timestamp - lastTime) / 1000;
      scrollPos += pxPerSec * dt;
      scrollArea.scrollTop = scrollPos;

      if (
        scrollArea.scrollTop + scrollArea.clientHeight >=
        scrollArea.scrollHeight - 2
      ) {
        pause();
        return;
      }
    }
    lastTime = timestamp;
    rafId = requestAnimationFrame(step);
  }

  // ---- Editor ----
  function openEditor(script, useCurrent) {
    pause();
    if (script) {
      textInput.value = script.text;
      titleInput.value = script.title;
      editingId = script.id;
    } else if (useCurrent) {
      textInput.value = textDisplay.textContent;
      const activeScript = scripts.find((s) => s.id === activeId);
      titleInput.value = activeScript ? activeScript.title : "";
      editingId = activeId;
    } else {
      textInput.value = "";
      titleInput.value = "";
      editingId = null;
    }
    library.classList.add("hidden");
    editor.classList.remove("hidden");
    titleInput.focus();
  }

  function closeEditor() {
    const value = textInput.value;
    let title = titleInput.value.trim();
    textDisplay.textContent = value;
    saveCurrentText(value);

    if (value.trim()) {
      if (!title) {
        title = value.trim().split("\n")[0].slice(0, 60) || "Guion sin título";
      }
      if (editingId) {
        const s = scripts.find((s) => s.id === editingId);
        if (s) {
          s.title = title;
          s.text = value;
        } else {
          scripts.push({ id: editingId, title, text: value });
        }
        activeId = editingId;
      } else {
        const id = genId();
        scripts.push({ id, title, text: value });
        activeId = id;
      }
      saveScripts();
      toast("Guion guardado");
    } else {
      activeId = null;
    }

    saveActiveId();
    editor.classList.add("hidden");
    scrollArea.scrollTop = 0;
  }

  // ---- Library ----
  function openLibrary() {
    pause();
    renderLibrary();
    library.classList.remove("hidden");
  }

  function renderLibrary() {
    libraryList.innerHTML = "";

    if (scripts.length === 0) {
      const hint = document.createElement("div");
      hint.className = "emptyHint";
      hint.textContent = "Todavía no tienes guiones guardados.";
      libraryList.appendChild(hint);
      return;
    }

    scripts.forEach((s) => {
      const row = document.createElement("div");
      row.className = "scriptRow" + (s.id === activeId ? " activeScript" : "");

      const titleBtn = document.createElement("button");
      titleBtn.className = "scriptTitle";
      titleBtn.textContent = s.title || "Guion sin título";
      titleBtn.addEventListener("click", () => loadScript(s.id));

      const editBtn = document.createElement("button");
      editBtn.className = "smallBtn";
      editBtn.textContent = "✎";
      editBtn.title = "Editar";
      editBtn.setAttribute("aria-label", "Editar " + (s.title || "guion"));
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditor(s, false);
      });

      const delBtn = document.createElement("button");
      delBtn.className = "smallBtn";
      delBtn.textContent = "🗑";
      delBtn.title = "Eliminar";
      delBtn.setAttribute("aria-label", "Eliminar " + (s.title || "guion"));
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteScript(s.id);
      });

      row.appendChild(titleBtn);
      row.appendChild(editBtn);
      row.appendChild(delBtn);
      libraryList.appendChild(row);
    });
  }

  function loadScript(id) {
    const s = scripts.find((s) => s.id === id);
    if (!s) return;
    pause();
    textDisplay.textContent = s.text;
    activeId = id;
    saveActiveId();
    saveCurrentText(s.text);
    library.classList.add("hidden");
    scrollArea.scrollTop = 0;
  }

  function deleteScript(id) {
    if (!confirm("¿Eliminar este guion?")) return;
    scripts = scripts.filter((s) => s.id !== id);
    saveScripts();
    if (activeId === id) {
      activeId = null;
      saveActiveId();
    }
    renderLibrary();
  }

  function restoreDefaults() {
    const existingIds = new Set(scripts.map((s) => s.id));
    const missing = DEFAULT_SCRIPTS.filter((s) => !existingIds.has(s.id));
    if (missing.length === 0) {
      toast("No falta ningún guion de ejemplo");
      return;
    }
    scripts.push(...missing.map((s) => ({ ...s })));
    saveScripts();
    renderLibrary();
    toast(
      missing.length === 1
        ? "Guion restaurado"
        : missing.length + " guiones restaurados"
    );
  }

  // ---- Camera ----
  async function toggleCamera() {
    if (cameraStream) {
      stopCamera();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Tu navegador no soporta el acceso a la cámara.");
      return;
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
    } catch (err) {
      toast("No se pudo acceder a la cámara o el micrófono.");
      return;
    }
    cameraPreview.srcObject = cameraStream;
    reader.classList.add("camActive");
    btnCamera.classList.add("active");
    btnRecord.classList.remove("hidden");
  }

  function stopCamera() {
    if (recording) stopRecording();
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    cameraPreview.srcObject = null;
    reader.classList.remove("camActive");
    btnCamera.classList.remove("active");
    btnRecord.classList.add("hidden");
  }

  // ---- Recording ----
  function pickMimeType() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    const candidates = [
      "video/mp4;codecs=h264,aac",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  }

  function startRecording() {
    if (!cameraStream) return;
    recordedChunks = [];
    const mimeType = pickMimeType();
    try {
      mediaRecorder = mimeType
        ? new MediaRecorder(cameraStream, { mimeType })
        : new MediaRecorder(cameraStream);
    } catch (err) {
      toast("No se pudo iniciar la grabación en este dispositivo.");
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = onRecordingStop;
    mediaRecorder.start();

    recording = true;
    btnRecord.classList.add("recording");
    recordStartTime = Date.now();
    recTimer.classList.remove("hidden");
    updateRecTimer();
    recordTimerInterval = setInterval(updateRecTimer, 500);
  }

  function stopRecording() {
    if (mediaRecorder && recording) {
      mediaRecorder.stop();
    }
    recording = false;
    btnRecord.classList.remove("recording");
    clearInterval(recordTimerInterval);
    recTimer.classList.add("hidden");
  }

  function toggleRecording() {
    if (!cameraStream) return;
    if (recording) stopRecording();
    else startRecording();
  }

  function updateRecTimer() {
    const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    recTimer.textContent = "● " + m + ":" + s;
  }

  function onRecordingStop() {
    const mimeType = (mediaRecorder && mediaRecorder.mimeType) || "video/webm";
    const blob = new Blob(recordedChunks, { type: mimeType });
    recordedChunks = [];

    if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl);
    lastRecordingBlob = blob;
    lastRecordingUrl = URL.createObjectURL(blob);
    reviewVideo.src = lastRecordingUrl;

    pause();
    reviewPanel.classList.remove("hidden");
  }

  function extForMime(mime) {
    return mime.includes("mp4") ? "mp4" : "webm";
  }

  async function saveRecording() {
    if (!lastRecordingBlob) {
      closeReview();
      return;
    }
    const ext = extForMime(lastRecordingBlob.type);
    const filename = "teleprompter-" + Date.now() + "." + ext;

    try {
      const file = new File([lastRecordingBlob], filename, { type: lastRecordingBlob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        closeReview();
        return;
      }
    } catch (err) {
      // El usuario canceló el share o no está disponible: seguimos con descarga directa.
    }

    const a = document.createElement("a");
    a.href = lastRecordingUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("Vídeo descargado");
    closeReview();
  }

  function closeReview() {
    reviewPanel.classList.add("hidden");
    reviewVideo.pause();
    reviewVideo.removeAttribute("src");
    reviewVideo.load();
  }

  function discardRecording() {
    if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl);
    lastRecordingUrl = null;
    lastRecordingBlob = null;
    closeReview();
  }

  // ---- Events ----
  btnPlay.addEventListener("click", togglePlay);
  btnEdit.addEventListener("click", () => openEditor(null, true));
  btnLibrary.addEventListener("click", openLibrary);
  btnLibraryClose.addEventListener("click", () => library.classList.add("hidden"));
  btnNewScript.addEventListener("click", () => openEditor(null, false));
  btnRestoreDefaults.addEventListener("click", restoreDefaults);
  btnDone.addEventListener("click", closeEditor);

  btnClear.addEventListener("click", () => {
    textInput.value = "";
    titleInput.value = "";
    textInput.focus();
  });

  btnTop.addEventListener("click", () => {
    pause();
    scrollArea.scrollTop = 0;
  });

  btnMirror.addEventListener("click", () => {
    reader.classList.toggle("mirrored");
    const isMirrored = reader.classList.contains("mirrored");
    btnMirror.classList.toggle("active", isMirrored);
    localStorage.setItem(MIRROR_KEY, isMirrored ? "1" : "0");
  });

  btnFullscreen.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  btnCamera.addEventListener("click", toggleCamera);
  btnRecord.addEventListener("click", toggleRecording);
  btnSave.addEventListener("click", saveRecording);
  btnDiscard.addEventListener("click", discardRecording);

  speedRange.addEventListener("input", () => {
    applySpeedLabel(speedRange.value);
    localStorage.setItem(SPEED_KEY, speedRange.value);
  });

  sizeRange.addEventListener("input", () => {
    textDisplay.style.fontSize = sizeRange.value + "px";
    localStorage.setItem(SIZE_KEY, sizeRange.value);
  });

  // Manual scroll (touch / wheel) pauses autoplay so the user keeps control.
  ["touchstart", "wheel"].forEach((evt) => {
    scrollArea.addEventListener(
      evt,
      () => {
        if (playing) pause();
      },
      { passive: true }
    );
  });

  window.addEventListener("beforeunload", () => {
    if (cameraStream) stopCamera();
  });

  // ---- Init ----
  init();
  loadSettings();

  const launchParams = new URLSearchParams(location.search);
  const launchAction = launchParams.get("action");
  if (launchAction === "library") {
    openLibrary();
  } else if (launchAction === "new") {
    openEditor(null, false);
  }
  if (launchAction) {
    history.replaceState(null, "", location.pathname);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
