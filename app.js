(() => {
  "use strict";

  const SPEED_KEY = "prompter.speed";
  const SIZE_KEY = "prompter.size";
  const MIRROR_KEY = "prompter.mirror";
  const TOKEN_KEY = "prompter.token";

  // Mismo origen: el servidor del frontend reenvía /api al backend (sin CORS ni
  // problemas de certificado, y funciona tanto por HTTP como por HTTPS).
  const API_BASE = "";

  // ---- Elements ----
  const authView = document.getElementById("auth");
  const authForm = document.getElementById("authForm");
  const authUsername = document.getElementById("authUsername");
  const authPassword = document.getElementById("authPassword");
  const authPasswordConfirm = document.getElementById("authPasswordConfirm");
  const authError = document.getElementById("authError");
  const authSubmit = document.getElementById("authSubmit");
  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const accountUsername = document.getElementById("accountUsername");
  const btnLogout = document.getElementById("btnLogout");

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

  // ---- Auth state ----
  let authToken = null;
  let currentUser = null;
  let authMode = "login";

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

  // ---- Sesión: claves de localStorage por usuario, para que si varias
  // cuentas usan el mismo navegador no se mezclen sus guiones leídos ----
  function textStorageKey() {
    return `prompter.text.${currentUser.id}`;
  }

  function activeStorageKey() {
    return `prompter.activeId.${currentUser.id}`;
  }

  function saveToken(token) {
    authToken = token;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function authHeader() {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  }

  function handleUnauthorized() {
    saveToken(null);
    currentUser = null;
    showAuthView();
    toast("Tu sesión ha caducado. Inicia sesión de nuevo.");
  }

  // Wrapper de fetch para todo lo que requiere sesión: añade el token y
  // fuerza el cierre de sesión si el backend responde 401.
  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), ...authHeader() },
    });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("No autenticado");
    }
    return res;
  }

  async function apiRegister(username, password) {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "No se pudo crear la cuenta");
    return data;
  }

  async function apiLogin(username, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "No se pudo iniciar sesión");
    return data;
  }

  // ---- API: los guiones viven en el backend (SQLite), nunca en el cliente ----
  async function apiListScripts() {
    const res = await apiFetch("/api/scripts");
    if (!res.ok) throw new Error("No se pudo listar los guiones");
    return res.json();
  }

  async function apiCreateScript(title, text) {
    const res = await apiFetch("/api/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text }),
    });
    if (!res.ok) throw new Error("No se pudo crear el guion");
    return res.json();
  }

  async function apiUpdateScript(id, title, text) {
    const res = await apiFetch(`/api/scripts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text }),
    });
    if (!res.ok) throw new Error("No se pudo guardar el guion");
    return res.json();
  }

  async function apiDeleteScript(id) {
    const res = await apiFetch(`/api/scripts/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) throw new Error("No se pudo eliminar el guion");
  }

  function saveActiveId() {
    if (activeId) localStorage.setItem(activeStorageKey(), activeId);
    else localStorage.removeItem(activeStorageKey());
  }

  function saveCurrentText(value) {
    localStorage.setItem(textStorageKey(), value);
  }

  function init() {
    activeId = localStorage.getItem(activeStorageKey());
    textDisplay.textContent = localStorage.getItem(textStorageKey()) || "";
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

  async function closeEditor() {
    const value = textInput.value;
    let title = titleInput.value.trim();
    textDisplay.textContent = value;
    saveCurrentText(value);

    if (value.trim()) {
      if (!title) {
        title = value.trim().split("\n")[0].slice(0, 60) || "Guion sin título";
      }
      try {
        if (editingId) {
          const updated = await apiUpdateScript(editingId, title, value);
          const idx = scripts.findIndex((s) => s.id === editingId);
          if (idx >= 0) scripts[idx] = updated;
          else scripts.push(updated);
          activeId = editingId;
        } else {
          const created = await apiCreateScript(title, value);
          scripts.push(created);
          activeId = created.id;
        }
        toast("Guion guardado");
      } catch (err) {
        toast("No se pudo guardar en el servidor. ¿Está arrancado el backend?");
      }
    } else {
      activeId = null;
    }

    saveActiveId();
    editor.classList.add("hidden");
    scrollArea.scrollTop = 0;
  }

  // ---- Library ----
  async function openLibrary() {
    pause();
    library.classList.remove("hidden");
    libraryList.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "emptyHint";
    loading.textContent = "Cargando…";
    libraryList.appendChild(loading);

    try {
      scripts = await apiListScripts();
    } catch (err) {
      libraryList.innerHTML = "";
      const hint = document.createElement("div");
      hint.className = "emptyHint";
      hint.textContent =
        "No se pudo conectar con el servidor de guiones. ¿Está arrancado el backend?";
      libraryList.appendChild(hint);
      return;
    }

    renderLibrary();
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

  async function deleteScript(id) {
    if (!confirm("¿Eliminar este guion?")) return;
    try {
      await apiDeleteScript(id);
    } catch (err) {
      toast("No se pudo eliminar el guion.");
      return;
    }
    scripts = scripts.filter((s) => s.id !== id);
    if (activeId === id) {
      activeId = null;
      saveActiveId();
    }
    renderLibrary();
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

  // ---- Auth: vistas ----
  function showAuthView() {
    reader.classList.add("hidden");
    editor.classList.add("hidden");
    library.classList.add("hidden");
    reviewPanel.classList.add("hidden");
    authView.classList.remove("hidden");
    pause();
    stopCamera();
  }

  function showApp() {
    authView.classList.add("hidden");
    reader.classList.remove("hidden");
    accountUsername.textContent = currentUser.username;
    init();
    applyPendingLaunchAction();
  }

  function setAuthMode(mode) {
    authMode = mode;
    tabLogin.classList.toggle("active", mode === "login");
    tabRegister.classList.toggle("active", mode === "register");
    authPasswordConfirm.classList.toggle("hidden", mode === "login");
    authPassword.setAttribute(
      "autocomplete",
      mode === "login" ? "current-password" : "new-password"
    );
    authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
    authError.classList.add("hidden");
  }

  function showAuthError(message) {
    authError.textContent = message;
    authError.classList.remove("hidden");
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const username = authUsername.value.trim();
    const password = authPassword.value;
    authError.classList.add("hidden");

    if (authMode === "register") {
      if (password !== authPasswordConfirm.value) {
        showAuthError("Las contraseñas no coinciden.");
        return;
      }
      if (password.length < 6) {
        showAuthError("La contraseña debe tener al menos 6 caracteres.");
        return;
      }
    }

    authSubmit.disabled = true;
    try {
      const data =
        authMode === "login"
          ? await apiLogin(username, password)
          : await apiRegister(username, password);
      saveToken(data.token);
      currentUser = data.user;
      authForm.reset();
      showApp();
    } catch (err) {
      showAuthError(err.message);
    } finally {
      authSubmit.disabled = false;
    }
  }

  function logout() {
    saveToken(null);
    currentUser = null;
    textDisplay.textContent = "";
    showAuthView();
  }

  // ---- Arranque: valida la sesión guardada contra el backend ----
  let pendingLaunchAction = null;

  function applyPendingLaunchAction() {
    if (pendingLaunchAction === "library") openLibrary();
    else if (pendingLaunchAction === "new") openEditor(null, false);
    pendingLaunchAction = null;
  }

  async function boot() {
    loadSettings();

    const launchParams = new URLSearchParams(location.search);
    pendingLaunchAction = launchParams.get("action");
    if (pendingLaunchAction) {
      history.replaceState(null, "", location.pathname);
    }

    authToken = localStorage.getItem(TOKEN_KEY);
    if (!authToken) {
      showAuthView();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeader() });
      if (res.status === 401) {
        saveToken(null);
        showAuthView();
        return;
      }
      if (!res.ok) throw new Error("backend error");
      currentUser = await res.json();
      showApp();
    } catch (err) {
      // El backend no responde: no borramos la sesión guardada, solo avisamos.
      showAuthView();
      toast("No se pudo conectar con el servidor. ¿Está arrancado el backend?");
    }
  }

  // ---- Events ----
  btnPlay.addEventListener("click", togglePlay);
  btnEdit.addEventListener("click", () => openEditor(null, true));
  btnLibrary.addEventListener("click", openLibrary);
  btnLibraryClose.addEventListener("click", () => library.classList.add("hidden"));
  btnNewScript.addEventListener("click", () => openEditor(null, false));
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

  tabLogin.addEventListener("click", () => setAuthMode("login"));
  tabRegister.addEventListener("click", () => setAuthMode("register"));
  authForm.addEventListener("submit", handleAuthSubmit);
  btnLogout.addEventListener("click", logout);

  // ---- Init ----
  boot();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
