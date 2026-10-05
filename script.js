/*
 * TryoutKu - satu file JavaScript untuk tiga halaman.
 * Setiap halaman memiliki data-page sehingga kode halaman lain
 * tidak akan dijalankan. Ini mencegah error null.addEventListener().
 */

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby_oVoQoQ_zBxW7ILxJoaUop8VJYyZ4LpKJxtbODnvLw-WjtidtxReKV7SdNY0-Nctzcg/exec";

const EXAM_NAMES = {
  pretest: "Pretest",
  komprehensif: "Komprehensif",
  posttest: "Post Test"
};

const page = document.body?.dataset?.page || "";

document.addEventListener("DOMContentLoaded", () => {
  if (page === "login") initLogin();
  if (page === "exam") initExam();
  if (page === "admin") initAdmin();
});


/* =========================================================
   UTILITAS
========================================================= */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeExamType(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["pretest", "pre-test", "pre test"].includes(v)) return "pretest";
  if (["komprehensif", "comprehensive"].includes(v)) return "komprehensif";
  if (["posttest", "post-test", "post test"].includes(v)) return "posttest";
  return v;
}

function showStatus(element, message, type = "") {
  if (!element) return;
  element.textContent = message || "";
  element.className = "status-message" + (type ? " " + type : "");
}

async function postJSON(payload) {
  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Response server tidak valid: " + text);
  }

  return result;
}

function clearParticipantStorage() {
  localStorage.removeItem("participantName");
  localStorage.removeItem("participantEmail");
  localStorage.removeItem("selectedExam");
}

function clearAdminStorage() {
  localStorage.removeItem("adminName");
  localStorage.removeItem("adminEmail");
}


/* =========================================================
   LOGIN
========================================================= */

function initLogin() {
  // Login selalu tampil. Tidak ada auto-redirect berdasarkan localStorage.
  // Ini memudahkan testing dan mencegah halaman login blank/terlewati.

  const form = document.getElementById("loginForm");
  const nameInput = document.getElementById("participantName");
  const emailInput = document.getElementById("participantEmail");
  const nameError = document.getElementById("nameError");
  const emailError = document.getElementById("emailError");
  const button = document.getElementById("loginButton");
  const message = document.getElementById("loginMessage");

  if (!form || !nameInput || !emailInput || !button) {
    console.error("Elemen login tidak lengkap.");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();

    nameError.textContent = "";
    emailError.textContent = "";
    nameInput.classList.remove("input-error");
    emailInput.classList.remove("input-error");
    showStatus(message, "");

    let valid = true;

    if (!name) {
      nameError.textContent = "Nama wajib diisi.";
      nameInput.classList.add("input-error");
      valid = false;
    }

    if (!email) {
      emailError.textContent = "Email wajib diisi.";
      emailInput.classList.add("input-error");
      valid = false;
    } else if (!isValidEmail(email)) {
      emailError.textContent = "Email tidak valid. Contoh: nama@gmail.com";
      emailInput.classList.add("input-error");
      valid = false;
    }

    if (!valid) return;

    button.disabled = true;
    button.textContent = "Memeriksa...";
    showStatus(message, "Menghubungkan ke server...");

    try {
      const result = await postJSON({
        action: "adminLogin",
        name,
        email
      });

      if (result.success && result.role === "admin") {
        clearParticipantStorage();
        localStorage.setItem("adminName", result.name || name);
        localStorage.setItem("adminEmail", result.email || email);
        window.location.href = "admin.html";
        return;
      }

      // Jika bukan admin, server mengembalikan role participant.
      if (result.role === "participant" || result.success === false) {
        clearAdminStorage();
        localStorage.setItem("participantName", name);
        localStorage.setItem("participantEmail", email);
        localStorage.removeItem("selectedExam");
        window.location.href = "index.html";
        return;
      }

      throw new Error(result.message || "Login tidak dapat diproses.");

    } catch (error) {
      console.error("Login error:", error);
      showStatus(message, error.message || "Tidak dapat terhubung ke server.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Masuk";
    }
  });
}


/* =========================================================
   HALAMAN PESERTA / UJIAN
========================================================= */

let examState = {
  questions: [],
  currentQuestion: 0,
  answers: [],
  examType: "",
  examName: "",
  sessionId: "",
  expiresAt: 0,
  submitting: false,
  timerId: null
};

function initExam() {
  const name = localStorage.getItem("participantName");
  const email = localStorage.getItem("participantEmail");

  // Admin/visitor tidak boleh masuk langsung ke halaman ujian.
  if (!name || !email) {
    window.location.replace("login.html");
    return;
  }

  const display = document.getElementById("participantDisplay");
  if (display) display.textContent = `${name} • ${email}`;

  const selectionPage = document.getElementById("examSelectionPage");
  const examContainer = document.getElementById("examContainer");
  const resultPage = document.getElementById("resultPage");

  if (!selectionPage || !examContainer || !resultPage) {
    console.error("Struktur halaman ujian tidak lengkap.");
    return;
  }

  document.querySelectorAll("[data-exam]").forEach((button) => {
    button.addEventListener("click", () => {
      const examType = button.dataset.exam;
      startSelectedExam(examType);
    });
  });

  loadParticipantExamSettings();

  document.getElementById("logoutButton")?.addEventListener("click", () => {
    clearParticipantStorage();
    window.location.href = "login.html";
  });

  document.getElementById("prevButton")?.addEventListener("click", previousQuestion);
  document.getElementById("nextButton")?.addEventListener("click", nextQuestion);
  document.getElementById("finishButton")?.addEventListener("click", () => submitExam(false));
  document.getElementById("backToExamSelection")?.addEventListener("click", () => {
    resultPage.classList.add("hidden");
    selectionPage.classList.remove("hidden");
    resetExamState();
  });
}

async function loadParticipantExamSettings() {
  try {
    const result = await postJSON({
      action: "getExamSettings"
    });

    if (!result.success) {
      throw new Error(result.message || "Pengaturan ujian gagal dimuat.");
    }

    renderParticipantExamSettings(result.settings);
  } catch (error) {
    console.error("loadExamSettings error:", error);

    ["pretest", "komprehensif", "posttest"].forEach((examType) => {
      const button = document.querySelector(`[data-exam="${examType}"]`);
      const lock = document.getElementById(`lock-${examType}`);
      const meta = document.getElementById(`meta-${examType}`);

      if (button) button.disabled = true;
      if (lock) {
        lock.textContent = "Terkunci";
        lock.className = "exam-lock locked";
      }
      if (meta) meta.textContent = "Pengaturan tidak dapat dimuat";
    });

    setSelectionMessage(
      "Tidak dapat memuat status ujian. Coba refresh halaman.",
      "error"
    );
  }
}

function renderParticipantExamSettings(settings) {
  ["pretest", "komprehensif", "posttest"].forEach((examType) => {
    const setting = settings?.[examType];
    const button = document.querySelector(`[data-exam="${examType}"]`);
    const lock = document.getElementById(`lock-${examType}`);
    const meta = document.getElementById(`meta-${examType}`);

    if (!setting) return;

    const duration = Number(setting.durationMinutes) || 2;
    const enabled = setting.enabled === true;

    if (button) {
      button.disabled = !enabled;
      button.classList.toggle("is-locked", !enabled);
    }

    if (meta) {
      meta.textContent = `Pilihan ganda • ${duration} menit`;
    }

    if (lock) {
      lock.textContent = enabled ? "Buka" : "Terkunci";
      lock.className = `exam-lock ${enabled ? "open" : "locked"}`;
    }
  });
}

async function startSelectedExam(examType) {
  examType = normalizeExamType(examType);

  if (!EXAM_NAMES[examType]) {
    setSelectionMessage("Jenis ujian tidak valid.", "error");
    return;
  }

  const selectionPage = document.getElementById("examSelectionPage");
  const examContainer = document.getElementById("examContainer");

  setSelectionMessage("Menyiapkan soal...", "");
  document.querySelectorAll("[data-exam]").forEach(btn => btn.disabled = true);

  try {
    const result = await postJSON({
      action: "startExam",
      examType
    });

    if (!result.success) {
      throw new Error(result.message || "Gagal memulai ujian.");
    }

    if (!Array.isArray(result.questions) || result.questions.length === 0) {
      throw new Error("Server tidak mengirim soal.");
    }

    examState.questions = result.questions;
    examState.answers = new Array(result.questions.length).fill("-");
    examState.currentQuestion = 0;
    examState.examType = result.examType;
    examState.examName = result.examName;
    examState.sessionId = result.sessionId;
    examState.expiresAt = Number(result.expiresAt);
    examState.submitting = false;

    localStorage.setItem("selectedExam", examType);

    selectionPage.classList.add("hidden");
    examContainer.classList.remove("hidden");

    const examNameDisplay = document.getElementById("examNameDisplay");
    if (examNameDisplay) examNameDisplay.textContent = result.examName;

    renderQuestion();
    renderPalette();
    startServerTimer();

  } catch (error) {
    console.error("startExam error:", error);
    setSelectionMessage(error.message || "Gagal memulai ujian.", "error");
  } finally {
    document.querySelectorAll("[data-exam]").forEach(btn => btn.disabled = false);
  }
}

function setSelectionMessage(message, type = "") {
  showStatus(document.getElementById("selectionMessage"), message, type);
}

function renderQuestion() {
  const question = examState.questions[examState.currentQuestion];
  if (!question) return;

  const number = examState.currentQuestion + 1;

  const numberEl = document.getElementById("questionNumber");
  const textEl = document.getElementById("questionText");
  const optionsEl = document.getElementById("options");

  if (!numberEl || !textEl || !optionsEl) return;

  numberEl.textContent = `Soal ${number} dari ${examState.questions.length}`;
  textEl.textContent = question.question;
  optionsEl.innerHTML = "";

  ["A", "B", "C", "D"].forEach((letter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-button";

    if (examState.answers[examState.currentQuestion] === letter) {
      button.classList.add("selected");
    }

    const letterSpan = document.createElement("span");
    letterSpan.className = "option-letter";
    letterSpan.textContent = letter;

    const textSpan = document.createElement("span");
    textSpan.textContent = question.options[letter];

    button.append(letterSpan, textSpan);

    button.addEventListener("click", () => {
      if (examState.submitting) return;

      examState.answers[examState.currentQuestion] = letter;
      renderQuestion();
      renderPalette();
    });

    optionsEl.appendChild(button);
  });

  document.getElementById("prevButton").disabled = examState.currentQuestion === 0;
  document.getElementById("nextButton").textContent =
    examState.currentQuestion === examState.questions.length - 1
      ? "Soal Terakhir"
      : "Berikutnya";
}

function renderPalette() {
  const palette = document.getElementById("questionPalette");
  if (!palette) return;

  palette.innerHTML = "";

  examState.questions.forEach((_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "palette-button";

    if (examState.answers[index] && examState.answers[index] !== "-") {
      button.classList.add("answered");
    }

    if (index === examState.currentQuestion) {
      button.classList.add("current");
    }

    button.textContent = index + 1;
    button.addEventListener("click", () => {
      if (examState.submitting) return;
      examState.currentQuestion = index;
      renderQuestion();
      renderPalette();
    });

    palette.appendChild(button);
  });
}

function previousQuestion() {
  if (examState.currentQuestion <= 0) return;

  examState.currentQuestion--;
  renderQuestion();
  renderPalette();
}

function nextQuestion() {
  if (examState.currentQuestion >= examState.questions.length - 1) return;

  examState.currentQuestion++;
  renderQuestion();
  renderPalette();
}

function startServerTimer() {
  stopTimer();

  const update = () => {
    const remaining = Math.max(0, examState.expiresAt - Date.now());
    updateTimerDisplay(remaining);

    if (remaining <= 0) {
      stopTimer();
      submitExam(true);
    }
  };

  update();
  examState.timerId = setInterval(update, 250);
}

function stopTimer() {
  if (examState.timerId) {
    clearInterval(examState.timerId);
    examState.timerId = null;
  }
}

function updateTimerDisplay(remainingMs) {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const timer = document.getElementById("timer");
  if (timer) {
    timer.textContent =
      `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
}

async function submitExam(timeUp) {
  if (examState.submitting) return;

  if (!timeUp) {
    const unanswered = examState.answers.filter(a => a === "-").length;
    const confirmed = window.confirm(
      unanswered > 0
        ? `Masih ada ${unanswered} soal yang belum dijawab. Yakin ingin selesai?`
        : "Yakin ingin menyelesaikan ujian?"
    );

    if (!confirmed) return;
  }

  examState.submitting = true;
  stopTimer();

  document.getElementById("finishButton").disabled = true;
  document.getElementById("prevButton").disabled = true;
  document.getElementById("nextButton").disabled = true;

  try {
    const result = await postJSON({
      action: "saveExamResult",
      name: localStorage.getItem("participantName") || "",
      email: localStorage.getItem("participantEmail") || "",
      examType: examState.examType,
      sessionId: examState.sessionId,
      questionIds: examState.questions.map(q => q.id),
      answers: examState.answers,
      timeUp: Boolean(timeUp)
    });

    if (!result.success) {
      throw new Error(result.message || "Hasil gagal disimpan.");
    }

    showResult(result);

  } catch (error) {
    console.error("submitExam error:", error);

    // Jika server menolak karena session expired, peserta diberi pesan.
    window.alert(
      "Hasil ujian belum berhasil disimpan.\n\n" +
      (error.message || "Terjadi kesalahan.")
    );

    examState.submitting = false;
    document.getElementById("finishButton").disabled = false;
    document.getElementById("prevButton").disabled =
      examState.currentQuestion === 0;
    document.getElementById("nextButton").disabled = false;

  }
}

function showResult(result) {
  document.getElementById("examContainer")?.classList.add("hidden");
  document.getElementById("examSelectionPage")?.classList.add("hidden");
  document.getElementById("resultPage")?.classList.remove("hidden");

  const resultTitle = document.getElementById("resultTitle");
  const resultMessage = document.getElementById("resultMessage");
  const scoreElement = document.getElementById("score");
  const scoreCard = scoreElement?.closest(".score-card");
  const stats = document.querySelector(".result-stats");

  if (resultTitle) {
    resultTitle.textContent = result.timeUp ? "Waktu Habis" : "Ujian Selesai";
  }

  if (resultMessage) {
    resultMessage.textContent = result.showScore === false
      ? "Hasil ujian berhasil disimpan."
      : `${result.examName} berhasil dinilai oleh server.`;
  }

  if (result.showScore === true) {
    if (scoreCard) scoreCard.classList.remove("hidden");
    if (stats) stats.classList.remove("hidden");
    if (scoreElement) scoreElement.textContent = result.score ?? 0;

    const correct = document.getElementById("correctCount");
    const wrong = document.getElementById("wrongCount");
    const unanswered = document.getElementById("unansweredCount");
    if (correct) correct.textContent = result.correct ?? 0;
    if (wrong) wrong.textContent = result.wrong ?? 0;
    if (unanswered) unanswered.textContent = result.unanswered ?? 0;
  } else {
    if (scoreCard) scoreCard.classList.add("hidden");
    if (stats) stats.classList.add("hidden");
  }
}

function resetExamState() {
  stopTimer();

  examState = {
    questions: [],
    currentQuestion: 0,
    answers: [],
    examType: "",
    examName: "",
    sessionId: "",
    expiresAt: 0,
    submitting: false,
    timerId: null
  };

  document.getElementById("finishButton").disabled = false;
  document.getElementById("questionText").textContent = "Memuat soal...";
  document.getElementById("options").innerHTML = "";
  document.getElementById("questionPalette").innerHTML = "";
  document.getElementById("timer").textContent = "02:00";
}


/* =========================================================
   ADMIN
========================================================= */

function initAdmin() {
  // localStorage hanya digunakan untuk membawa identitas admin ke server.
  // Validasi sebenarnya tetap dilakukan oleh Apps Script.
  let adminName = localStorage.getItem("adminName") || "";
  let adminEmail = localStorage.getItem("adminEmail") || "";

  // Pulihkan identitas jika localStorage kosong atau berasal dari versi lama.
  if (
    adminName.toLowerCase() !== "dodik setyawan" ||
    adminEmail.toLowerCase() !== "setyawandodik35@gmail.com"
  ) {
    adminName = "Dodik Setyawan";
    adminEmail = "setyawandodik35@gmail.com";

    localStorage.setItem("adminName", adminName);
    localStorage.setItem("adminEmail", adminEmail);
  }

  const displayName = document.getElementById("adminDisplayName");
  if (displayName) displayName.textContent = adminName;

  document.getElementById("adminLogoutButton")?.addEventListener("click", () => {
    clearAdminStorage();
    window.location.href = "login.html";
  });

  const fileInput = document.getElementById("adminQuestionFile");
  const fileName = document.getElementById("selectedFileName");

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (fileName) {
      fileName.textContent = file
        ? `${file.name} (${formatBytes(file.size)})`
        : "Belum ada file dipilih.";
    }
  });

  document.getElementById("uploadForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await uploadAdminQuestions();
  });

  document.querySelectorAll(".save-setting-button").forEach((button) => {
    button.addEventListener("click", () => {
      saveAdminExamSetting(button.dataset.exam);
    });
  });

  loadAdminExamSettings();
}

function getAdminIdentity() {
  return {
    adminName: localStorage.getItem("adminName") || "Dodik Setyawan",
    adminEmail: localStorage.getItem("adminEmail") || "setyawandodik35@gmail.com"
  };
}

async function loadAdminExamSettings() {
  try {
    const admin = getAdminIdentity();

    const result = await postJSON({
      action: "getExamSettings",
      adminName: admin.adminName,
      adminEmail: admin.adminEmail
    });

    if (!result.success) {
      throw new Error(result.message || "Pengaturan gagal dimuat.");
    }

    renderAdminExamSettings(result.settings);
  } catch (error) {
    console.error("loadAdminExamSettings error:", error);
    showStatus(
      document.getElementById("settingsMessage"),
      `Gagal memuat pengaturan: ${error.message}`,
      "error"
    );
  }
}

function renderAdminExamSettings(settings) {
  ["pretest", "komprehensif", "posttest"].forEach((examType) => {
    const setting = settings?.[examType];
    if (!setting) return;

    const durationInput = document.getElementById(`duration-${examType}`);
    const enabledInput = document.getElementById(`enabled-${examType}`);
    const showScoreInput = document.getElementById(`show-score-${examType}`);
    const status = document.getElementById(`status-${examType}`);

    if (durationInput) {
      durationInput.value = Number(setting.durationMinutes) || 2;
    }

    if (enabledInput) {
      enabledInput.checked = setting.enabled === true;
    }

    if (showScoreInput) {
      showScoreInput.checked = setting.showScore !== false;
    }

    updateAdminStatusBadge(examType, setting.enabled === true);
  });
}

function updateAdminStatusBadge(examType, enabled) {
  const status = document.getElementById(`status-${examType}`);
  if (!status) return;

  status.textContent = enabled ? "Dibuka" : "Terkunci";
  status.className = `status-badge ${enabled ? "open" : "locked"}`;
}

async function saveAdminExamSetting(examType) {
  const durationInput = document.getElementById(`duration-${examType}`);
  const enabledInput = document.getElementById(`enabled-${examType}`);

  const durationMinutes = Number(durationInput?.value);
  const enabled = Boolean(enabledInput?.checked);
  const showScoreInput = document.getElementById(`show-score-${examType}`);
  const showScore = Boolean(showScoreInput?.checked);

  if (!Number.isFinite(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 360) {
    showStatus(
      document.getElementById("settingsMessage"),
      "Durasi harus antara 1 sampai 360 menit.",
      "error"
    );
    return;
  }

  const button = document.querySelector(
    `.save-setting-button[data-exam="${examType}"]`
  );

  if (button) {
    button.disabled = true;
    button.textContent = "Menyimpan...";
  }

  showStatus(
    document.getElementById("settingsMessage"),
    `Menyimpan pengaturan ${EXAM_NAMES[examType]}...`
  );

  try {
    const admin = getAdminIdentity();

    const result = await postJSON({
      action: "updateExamSettings",
      adminName: admin.adminName,
      adminEmail: admin.adminEmail,
      examType,
      enabled,
      durationMinutes,
      showScore
    });

    if (!result.success) {
      throw new Error(result.message || "Pengaturan gagal disimpan.");
    }

    updateAdminStatusBadge(examType, result.setting.enabled);

    showStatus(
      document.getElementById("settingsMessage"),
      `${EXAM_NAMES[examType]} berhasil ${result.setting.enabled ? "dibuka" : "dikunci"} dengan durasi ${result.setting.durationMinutes} menit.`,
      "success"
    );
  } catch (error) {
    console.error("saveAdminExamSetting error:", error);

    showStatus(
      document.getElementById("settingsMessage"),
      `Gagal: ${error.message}`,
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Simpan Pengaturan";
    }
  }
}


function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

async function uploadAdminQuestions() {
  const fileInput = document.getElementById("adminQuestionFile");
  const examType = normalizeExamType(
    document.getElementById("adminExamType").value
  );
  const file = fileInput.files?.[0];

  if (!file) {
    showStatus(
      document.getElementById("adminMessage"),
      "Pilih file soal terlebih dahulu.",
      "error"
    );
    return;
  }

  const extension = file.name.split(".").pop().toLowerCase();

  if (!["pdf", "docx"].includes(extension)) {
    showStatus(
      document.getElementById("adminMessage"),
      "File harus berformat PDF atau DOCX.",
      "error"
    );
    return;
  }

  const button = document.getElementById("adminUploadButton");
  button.disabled = true;
  button.textContent = "Mengupload & membaca...";

  showStatus(
    document.getElementById("adminMessage"),
    "File sedang diproses oleh server..."
  );

  try {
    const base64 = await readFileAsBase64(file);

    const result = await postJSON({
      action: "uploadQuestions",
      adminName: localStorage.getItem("adminName") || "",
      adminEmail: localStorage.getItem("adminEmail") || "",
      examType,
      fileName: file.name,
      mimeType: file.type,
      fileBase64: base64
    });

    if (!result.success) {
      throw new Error(result.message || "Upload soal gagal.");
    }

    showStatus(
      document.getElementById("adminMessage"),
      `Berhasil! ${result.totalQuestions} soal ditambahkan ke ${result.sheet}.`,
      "success"
    );

    fileInput.value = "";
    const selectedName = document.getElementById("selectedFileName");
    if (selectedName) selectedName.textContent = "Belum ada file dipilih.";

  } catch (error) {
    console.error("Upload soal error:", error);
    showStatus(
      document.getElementById("adminMessage"),
      `Error: ${error.message}`,
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Upload & Baca Soal";
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };

    reader.onerror = () => reject(new Error("File gagal dibaca oleh browser."));
    reader.readAsDataURL(file);
  });
}
