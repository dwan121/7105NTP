/* ============================================================
   TRYOUTKU - SCRIPT.JS
   ------------------------------------------------------------
   Fitur:
   - Login peserta
   - Login admin
   - Redirect otomatis admin -> admin.html
   - Redirect peserta -> index.html
   - Proteksi halaman admin
   - Pilihan ujian
   - Pengaturan ujian
   - Timer server-side
   - Random soal dari server
   - Random pilihan
   - Penilaian di Apps Script
   - Upload PDF/DOCX
   - Paket soal / batch
   - Pilih paket aktif
   - Hapus paket soal
   ============================================================ */


/* ============================================================
   KONFIGURASI GOOGLE APPS SCRIPT
   ============================================================ */

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby_oVoQoQ_zBxW7ILxJoaUop8VJYyZ4LpKJxtbODnvLw-WjtidtxReKV7SdNY0-Nctzcg/exec";


/* ============================================================
   KONFIGURASI UJIAN
   ============================================================ */

const EXAM_NAMES = {

  pretest:
    "Pretest",

  komprehensif:
    "Komprehensif",

  posttest:
    "Post Test"

};


const EXAM_TYPES = [
  "pretest",
  "komprehensif",
  "posttest"
];


/* ============================================================
   IDENTITAS ADMIN
   ============================================================ */

const ADMIN_NAME =
  "Dodik Setyawan";

const ADMIN_EMAIL =
  "setyawandodik35@gmail.com";


/* ============================================================
   HALAMAN
   ============================================================ */

const page =
  document.body?.dataset?.page || "";


/* ============================================================
   STATE UJIAN
   ============================================================ */

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


/* ============================================================
   STATE DELETE PAKET
   ============================================================ */

let selectedDeletePack = null;

/* ============================================================
   PENYIMPANAN STATE UJIAN
   Agar ujian tetap berlanjut setelah refresh
   ============================================================ */

function getExamStorageKey() {
  const email =
    localStorage.getItem("participantEmail") || "unknown";

  return "tryoutku_active_exam_" + email.toLowerCase();
}

function saveExamStateToStorage() {
  if (
    !examState.examType ||
    !examState.sessionId ||
    !examState.questions.length
  ) {
    return;
  }

  localStorage.setItem(
    getExamStorageKey(),
    JSON.stringify({
      questions: examState.questions,
      currentQuestion: examState.currentQuestion,
      answers: examState.answers,
      examType: examState.examType,
      examName: examState.examName,
      sessionId: examState.sessionId,
      expiresAt: examState.expiresAt,
      savedAt: Date.now()
    })
  );
}

function restoreExamStateFromStorage() {
  try {
    const saved =
      localStorage.getItem(
        getExamStorageKey()
      );

    if (!saved) {
      return false;
    }

    const state =
      JSON.parse(saved);

    if (
      !state ||
      !state.questions ||
      !state.questions.length ||
      !state.sessionId ||
      !state.expiresAt
    ) {
      return false;
    }

    if (
      Number(state.expiresAt) <= Date.now()
    ) {
      localStorage.removeItem(
        getExamStorageKey()
      );

      return false;
    }

    examState.questions =
      state.questions;

    examState.currentQuestion =
      Number(state.currentQuestion) || 0;

    examState.answers =
      Array.isArray(state.answers)
        ? state.answers
        : new Array(
            state.questions.length
          ).fill("-");

    examState.examType =
      state.examType;

    examState.examName =
      state.examName;

    examState.sessionId =
      state.sessionId;

    examState.expiresAt =
      Number(state.expiresAt);

    examState.submitting =
      false;

    return true;

  }
  catch (error) {

    console.error(
      "Restore exam error:",
      error
    );

    localStorage.removeItem(
      getExamStorageKey()
    );

    return false;
  }
}


/**
 * Tampilkan kembali halaman ujian
 * setelah state berhasil dipulihkan
 */
function restoreExamInterface() {
  const selectionPage =
    document.getElementById(
      "examSelectionPage"
    );

  const examContainer =
    document.getElementById(
      "examContainer"
    );

  if (
    !selectionPage ||
    !examContainer
  ) {
    return;
  }

  selectionPage.classList.add(
    "hidden"
  );

  examContainer.classList.remove(
    "hidden"
  );

  const title =
    document.getElementById(
      "examNameDisplay"
    );

  if (title) {
    title.textContent =
      examState.examName;
  }

  renderQuestion();

  renderPalette();

  startServerTimer();
}


/**
 * Hapus state ujian yang tersimpan
 */
function clearSavedExamState() {
  try {
    localStorage.removeItem(
      getExamStorageKey()
    );

    console.log(
      "State ujian dihapus."
    );
  }
  catch (error) {
    console.error(
      "Gagal menghapus state ujian:",
      error
    );
  }
}

/* ============================================================
   DOM READY
   ============================================================ */

document.addEventListener(
  "DOMContentLoaded",
  function () {

    console.log(
      "TryoutKu script aktif. Page:",
      page
    );


    if (
      page === "login"
    ) {

      initLogin();

    }


    if (
      page === "exam"
    ) {

      initExam();

    }


    if (
      page === "admin"
    ) {

      initAdmin();

    }

  }
);


/* ============================================================
   UTILITAS
   ============================================================ */


/**
 * Validasi email
 */
function isValidEmail(
  email
) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(
      email
    );

}


/**
 * Normalisasi jenis ujian
 */
function normalizeExamType(
  value
) {

  const v =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();


  if (
    [
      "pretest",
      "pre-test",
      "pre test"
    ].includes(v)
  ) {

    return "pretest";

  }


  if (
    [
      "komprehensif",
      "comprehensive"
    ].includes(v)
  ) {

    return "komprehensif";

  }


  if (
    [
      "posttest",
      "post-test",
      "post test"
    ].includes(v)
  ) {

    return "posttest";

  }


  return v;

}


/**
 * Tampilkan pesan status
 */
function showStatus(
  element,
  message,
  type = ""
) {

  if (!element) {

    return;

  }


  element.textContent =
    message || "";


  element.className =
    "status-message";


  if (
    type
  ) {

    element.classList.add(
      type
    );

  }

}


/**
 * Request ke Google Apps Script
 */
async function postJSON(
  payload
) {

  console.log(
    "Request:",
    payload.action,
    payload
  );


  const response =
    await fetch(
      GOOGLE_SCRIPT_URL,
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "text/plain;charset=utf-8"

        },

        body:
          JSON.stringify(
            payload
          )

      }
    );


  const text =
    await response.text();


  console.log(
    "Response:",
    text
  );


  let result;


  try {

    result =
      JSON.parse(
        text
      );

  }
  catch (error) {

    throw new Error(
      "Response server tidak valid: " +
      text
    );

  }


  return result;

}


/**
 * Hapus session peserta
 */
function clearParticipantStorage() {

  localStorage.removeItem(
    "participantName"
  );

  localStorage.removeItem(
    "participantEmail"
  );

  localStorage.removeItem(
    "selectedExam"
  );

  /*
   * Hapus juga ujian aktif.
   */
  try {
    localStorage.removeItem(
      getExamStorageKey()
    );
  }
  catch (error) {
    console.error(
      "Gagal menghapus state ujian:",
      error
    );
  }
}


/**
 * Hapus session admin
 */
function clearAdminStorage() {

  localStorage.removeItem(
    "adminName"
  );

  localStorage.removeItem(
    "adminEmail"
  );

}


/**
 * Ambil identitas admin
 *
 * TIDAK lagi menggunakan
 * identitas default otomatis.
 */
function getAdminIdentity() {

  const name =
    localStorage.getItem(
      "adminName"
    );

  const email =
    localStorage.getItem(
      "adminEmail"
    );


  if (
    !name ||
    !email
  ) {

    throw new Error(
      "Session admin tidak ditemukan. Silakan login kembali."
    );

  }


  if (
    name
      .trim()
      .toLowerCase() !==
    ADMIN_NAME.toLowerCase()
  ) {

    throw new Error(
      "Nama admin tidak valid."
    );

  }


  if (
    email
      .trim()
      .toLowerCase() !==
    ADMIN_EMAIL.toLowerCase()
  ) {

    throw new Error(
      "Email admin tidak valid."
    );

  }


  return {

    adminName:
      name,

    adminEmail:
      email

  };

}


/**
 * Escape HTML
 */
function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/**
 * Format ukuran file
 */
function formatBytes(
  bytes
) {

  if (
    !bytes
  ) {

    return "0 B";

  }


  const units = [
    "B",
    "KB",
    "MB",
    "GB"
  ];


  const index =
    Math.min(
      Math.floor(
        Math.log(bytes) /
        Math.log(1024)
      ),
      units.length - 1
    );


  return (
    (
      bytes /
      Math.pow(
        1024,
        index
      )
    )
      .toFixed(
        index
          ? 1
          : 0
      )
    +
    " " +
    units[index]
  );

}


/**
 * Format tanggal upload
 */
function formatUploadDate(
  value
) {

  if (
    !value
  ) {

    return "-";

  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(
      value
    );

  }


  return date.toLocaleString(
    "id-ID",
    {

      day:
        "2-digit",

      month:
        "2-digit",

      year:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",

      second:
        "2-digit"

    }
  );

}


/**
 * Baca file sebagai Base64
 */
function readFileAsBase64(
  file
) {

  return new Promise(
    function (
      resolve,
      reject
    ) {

      const reader =
        new FileReader();


      reader.onload =
        function () {

          const result =
            String(
              reader.result || ""
            );


          const comma =
            result.indexOf(
              ","
            );


          resolve(
            comma >= 0
              ? result.slice(
                  comma + 1
                )
              : result
          );

        };


      reader.onerror =
        function () {

          reject(
            new Error(
              "File gagal dibaca oleh browser."
            )
          );

        };


      reader.readAsDataURL(
        file
      );

    }
  );

}


/* ============================================================
   LOGIN
   ============================================================ */

function initLogin() {

  console.log(
    "Inisialisasi login..."
  );


  const form =
    document.getElementById(
      "loginForm"
    );


  const nameInput =
    document.getElementById(
      "participantName"
    );


  const emailInput =
    document.getElementById(
      "participantEmail"
    );


  const nameError =
    document.getElementById(
      "nameError"
    );


  const emailError =
    document.getElementById(
      "emailError"
    );


  const button =
    document.getElementById(
      "loginButton"
    );


  const message =
    document.getElementById(
      "loginMessage"
    );


  if (
    !form ||
    !nameInput ||
    !emailInput ||
    !button
  ) {

    console.error(
      "Elemen login tidak lengkap."
    );

    return;

  }


  form.addEventListener(
    "submit",
    async function (
      event
    ) {

      event.preventDefault();


      const name =
        nameInput.value.trim();


      const email =
        emailInput.value
          .trim()
          .toLowerCase();


      /* ------------------------------------------------------
         RESET ERROR
      ------------------------------------------------------ */

      if (
        nameError
      ) {

        nameError.textContent =
          "";

      }


      if (
        emailError
      ) {

        emailError.textContent =
          "";

      }


      nameInput.classList.remove(
        "input-error"
      );

      emailInput.classList.remove(
        "input-error"
      );


      showStatus(
        message,
        ""
      );


      /* ------------------------------------------------------
         VALIDASI
      ------------------------------------------------------ */

      let valid =
        true;


      if (
        !name
      ) {

        if (
          nameError
        ) {

          nameError.textContent =
            "Nama wajib diisi.";

        }


        nameInput.classList.add(
          "input-error"
        );


        valid =
          false;

      }


      if (
        !email
      ) {

        if (
          emailError
        ) {

          emailError.textContent =
            "Email wajib diisi.";

        }


        emailInput.classList.add(
          "input-error"
        );


        valid =
          false;

      }
      else if (
        !isValidEmail(
          email
        )
      ) {

        if (
          emailError
        ) {

          emailError.textContent =
            "Email tidak valid.";

        }


        emailInput.classList.add(
          "input-error"
        );


        valid =
          false;

      }


      if (
        !valid
      ) {

        return;

      }


      /* ------------------------------------------------------
         BUTTON
      ------------------------------------------------------ */

      button.disabled =
        true;


      button.textContent =
        "Memeriksa...";


      showStatus(
        message,
        "Menghubungkan ke server...",
        "info"
      );


      try {

        /*
         * Semua login pertama kali
         * dikirim ke adminLogin.
         *
         * Code.gs akan menentukan:
         * admin atau peserta.
         */

        const result =
          await postJSON({

            action:
              "adminLogin",

            name:
              name,

            email:
              email

          });


        /* ----------------------------------------------------
           ADMIN
        ---------------------------------------------------- */

        if (
          result &&
          result.success === true &&
          result.role === "admin"
        ) {

          console.log(
            "Login admin berhasil."
          );


          clearParticipantStorage();


          localStorage.setItem(
            "adminName",
            result.name ||
            ADMIN_NAME
          );


          localStorage.setItem(
            "adminEmail",
            result.email ||
            ADMIN_EMAIL
          );


          window.location.href =
            "admin.html";


          return;

        }


        /* ----------------------------------------------------
           PESERTA
        ---------------------------------------------------- */

        console.log(
          "Login sebagai peserta."
        );


        clearAdminStorage();


        localStorage.setItem(
          "participantName",
          name
        );


        localStorage.setItem(
          "participantEmail",
          email
        );


        localStorage.removeItem(
          "selectedExam"
        );


        window.location.href =
          "index.html";

      }
      catch (
        error
      ) {

        console.error(
          "Login error:",
          error
        );


        showStatus(

          message,

          error.message ||
          "Tidak dapat terhubung ke server.",

          "error"

        );

      }
      finally {

        button.disabled =
          false;


        button.textContent =
          "Masuk";

      }

    }
  );

}


/* ============================================================
   PESERTA / HALAMAN UJIAN
   ============================================================ */

function initExam() {

  console.log(
    "Inisialisasi halaman ujian..."
  );


  const name =
    localStorage.getItem(
      "participantName"
    );


  const email =
    localStorage.getItem(
      "participantEmail"
    );


  if (
    !name ||
    !email
  ) {

    window.location.replace(
      "login.html"
    );


    return;

  }


  const display =
    document.getElementById(
      "participantDisplay"
    );


  if (
    display
  ) {

    display.textContent =
      `${name} • ${email}`;

  }


  const selectionPage =
    document.getElementById(
      "examSelectionPage"
    );


  const examContainer =
    document.getElementById(
      "examContainer"
    );


  const resultPage =
    document.getElementById(
      "resultPage"
    );


  if (
    !selectionPage ||
    !examContainer ||
    !resultPage
  ) {

    console.error(
      "Struktur halaman ujian tidak lengkap."
    );


    return;

  }


  /* ----------------------------------------------------------
     PILIH UJIAN
  ---------------------------------------------------------- */

  document
    .querySelectorAll(
      "[data-exam]"
    )
    .forEach(
      function (
        button
      ) {

        button.addEventListener(
          "click",
          function () {

            startSelectedExam(
              button.dataset.exam
            );

          }
        );

      }
    );


  /* ----------------------------------------------------------
     SETTINGS
  ---------------------------------------------------------- */

  /*
 * Cek apakah peserta sedang memiliki ujian aktif.
 * Jika ada, langsung lanjutkan ujian.
 */
const restored =
  restoreExamStateFromStorage();

if (restored) {

  document
    .getElementById("examSelectionPage")
    ?.classList.add("hidden");

  document
    .getElementById("examContainer")
    ?.classList.remove("hidden");

  const title =
    document.getElementById(
      "examNameDisplay"
    );

  if (title) {
    title.textContent =
      examState.examName;
  }

  renderQuestion();
  renderPalette();
  startServerTimer();

}
else {

  loadParticipantExamSettings();

}


  /* ----------------------------------------------------------
     LOGOUT
  ---------------------------------------------------------- */

  document
    .getElementById(
      "logoutButton"
    )
    ?.addEventListener(
      "click",
      function () {

        clearParticipantStorage();

        window.location.href =
          "login.html";

      }
    );


  /* ----------------------------------------------------------
     NAVIGASI
  ---------------------------------------------------------- */

  document
    .getElementById(
      "prevButton"
    )
    ?.addEventListener(
      "click",
      previousQuestion
    );


  document
    .getElementById(
      "nextButton"
    )
    ?.addEventListener(
      "click",
      nextQuestion
    );


  document
    .getElementById(
      "finishButton"
    )
    ?.addEventListener(
      "click",
      function () {

        submitExam(
          false
        );

      }
    );


  document
    .getElementById(
      "backToExamSelection"
    )
    ?.addEventListener(
      "click",
      function () {

        resultPage.classList.add(
          "hidden"
        );


        selectionPage.classList.remove(
          "hidden"
        );


        resetExamState();


        loadParticipantExamSettings();

      }
    );

}


/* ============================================================
   LOAD SETTINGS PESERTA
   ============================================================ */

async function loadParticipantExamSettings() {

  try {

    const result =
      await postJSON({

        action:
          "getExamSettings"

      });


    if (
      !result.success
    ) {

      throw new Error(
        result.message ||
        "Pengaturan ujian gagal dimuat."
      );

    }


    renderParticipantExamSettings(
      result.settings
    );

  }
  catch (
    error
  ) {

    console.error(
      error
    );


    EXAM_TYPES.forEach(
      function (
        examType
      ) {

        const button =
          document.querySelector(
            `[data-exam="${examType}"]`
          );


        const lock =
          document.getElementById(
            `lock-${examType}`
          );


        if (
          button
        ) {

          button.disabled =
            true;

        }


        if (
          lock
        ) {

          lock.textContent =
            "Terkunci";

          lock.className =
            "exam-lock locked";

        }

      }
    );


    setSelectionMessage(
      "Tidak dapat memuat status ujian. Coba refresh halaman.",
      "error"
    );

  }

}


/* ============================================================
   RENDER SETTINGS PESERTA
   ============================================================ */

function renderParticipantExamSettings(
  settings
) {

  EXAM_TYPES.forEach(
    function (
      examType
    ) {

      const setting =
        settings?.[
          examType
        ];


      const button =
        document.querySelector(
          `[data-exam="${examType}"]`
        );


      const lock =
        document.getElementById(
          `lock-${examType}`
        );


      const meta =
        document.getElementById(
          `meta-${examType}`
        );


      if (
        !setting
      ) {

        return;

      }


      const enabled =
        setting.enabled === true;


      const duration =
        Number(
          setting.durationMinutes
        ) ||
        2;


      if (
        button
      ) {

        button.disabled =
          !enabled;


        button.classList.toggle(
          "is-locked",
          !enabled
        );

      }


      if (
        meta
      ) {

        meta.textContent =
          `Pilihan ganda • ${duration} menit`;

      }


      if (
        lock
      ) {

        lock.textContent =
          enabled
            ? "Buka"
            : "Terkunci";


        lock.className =
          `exam-lock ${
            enabled
              ? "open"
              : "locked"
          }`;

      }

    }
  );

}


/* ============================================================
   MULAI UJIAN
   ============================================================ */

async function startSelectedExam(
  examType
) {

  examType =
    normalizeExamType(
      examType
    );


  if (
    !EXAM_NAMES[
      examType
    ]
  ) {

    setSelectionMessage(
      "Jenis ujian tidak valid.",
      "error"
    );


    return;

  }


  const selectionPage =
    document.getElementById(
      "examSelectionPage"
    );


  const examContainer =
    document.getElementById(
      "examContainer"
    );


  setSelectionMessage(
    "Menyiapkan soal...",
    "info"
  );


  document
    .querySelectorAll(
      "[data-exam]"
    )
    .forEach(
      function (
        button
      ) {

        button.disabled =
          true;

      }
    );


  try {

    const result =
      await postJSON({

        action:
          "startExam",

        examType:
          examType

      });


    if (
      !result.success
    ) {

      throw new Error(
        result.message ||
        "Gagal memulai ujian."
      );

    }


    if (
      !Array.isArray(
        result.questions
      ) ||
      result.questions.length === 0
    ) {

      throw new Error(
        "Server tidak mengirim soal."
      );

    }


    examState.questions =
      result.questions;


    examState.answers =
      new Array(
        result.questions.length
      ).fill(
        "-"
      );


    examState.currentQuestion =
      0;


    examState.examType =
      result.examType;


    examState.examName =
      result.examName;


    examState.sessionId =
      result.sessionId;


    examState.expiresAt =
      Number(
        result.expiresAt
      );


    examState.submitting =
      false;

      saveExamStateToStorage();


    localStorage.setItem(
      "selectedExam",
      examType
    );


    selectionPage.classList.add(
      "hidden"
    );


    examContainer.classList.remove(
      "hidden"
    );


    const title =
      document.getElementById(
        "examNameDisplay"
      );


    if (
      title
    ) {

      title.textContent =
        result.examName;

    }


    renderQuestion();

    renderPalette();

    startServerTimer();

  }
  catch (
    error
  ) {

    console.error(
      error
    );


    setSelectionMessage(
      error.message ||
      "Gagal memulai ujian.",
      "error"
    );

  }
  finally {

    document
      .querySelectorAll(
        "[data-exam]"
      )
      .forEach(
        function (
          button
        ) {

          button.disabled =
            false;

        }
      );

  }

}


/* ============================================================
   PESAN SELECTION
   ============================================================ */

function setSelectionMessage(
  message,
  type = ""
) {

  showStatus(

    document.getElementById(
      "selectionMessage"
    ),

    message,

    type

  );

}


/* ============================================================
   RENDER SOAL
   ============================================================ */

function renderQuestion() {

  const question =
    examState.questions[
      examState.currentQuestion
    ];


  if (
    !question
  ) {

    return;

  }


  const number =
    examState.currentQuestion +
    1;


  const numberEl =
    document.getElementById(
      "questionNumber"
    );


  const textEl =
    document.getElementById(
      "questionText"
    );


  const optionsEl =
    document.getElementById(
      "options"
    );


  if (
    !numberEl ||
    !textEl ||
    !optionsEl
  ) {

    return;

  }


  numberEl.textContent =
    `Soal ${number} dari ${examState.questions.length}`;


  textEl.textContent =
    question.question;


  optionsEl.innerHTML =
    "";


  [
    "A",
    "B",
    "C",
    "D"
  ]
    .forEach(
      function (
        letter
      ) {

        const button =
          document.createElement(
            "button"
          );


        button.type =
          "button";


        button.className =
          "option-button";


        if (
          examState.answers[
            examState.currentQuestion
          ] ===
          letter
        ) {

          button.classList.add(
            "selected"
          );

        }


        const letterSpan =
          document.createElement(
            "span"
          );


        letterSpan.className =
          "option-letter";


        letterSpan.textContent =
          letter;


        const textSpan =
          document.createElement(
            "span"
          );


        textSpan.textContent =
          question.options?.[
            letter
          ] ||
          "";


        button.append(
          letterSpan,
          textSpan
        );


        button.addEventListener(
          "click",
          function () {

            if (
              examState.submitting
            ) {

              return;

            }


            examState.answers[
              examState.currentQuestion
            ] =
              letter;

              /*
               * Simpan jawaban segera.
               */
              saveExamStateToStorage();


            renderQuestion();

            renderPalette();

          }
        );


        optionsEl.appendChild(
          button
        );

      }
    );


  const prev =
    document.getElementById(
      "prevButton"
    );


  const next =
    document.getElementById(
      "nextButton"
    );


  if (
    prev
  ) {

    prev.disabled =
      examState.currentQuestion ===
      0;

  }


  if (
    next
  ) {

    next.textContent =
      examState.currentQuestion ===
      examState.questions.length - 1
        ? "Soal Terakhir"
        : "Berikutnya";

  }

}


/* ============================================================
   PALETTE
   ============================================================ */

function renderPalette() {

  const palette =
    document.getElementById(
      "questionPalette"
    );


  if (
    !palette
  ) {

    return;

  }


  palette.innerHTML =
    "";


  examState.questions
    .forEach(
      function (
        _,
        index
      ) {

        const button =
          document.createElement(
            "button"
          );


        button.type =
          "button";


        button.className =
          "palette-button";


        if (
          examState.answers[
            index
          ] &&
          examState.answers[
            index
          ] !== "-"
        ) {

          button.classList.add(
            "answered"
          );

        }


        if (
          index ===
          examState.currentQuestion
        ) {

          button.classList.add(
            "current"
          );

        }


        button.textContent =
          index + 1;


        button.addEventListener(
          "click",
          function () {

            if (
              examState.submitting
            ) {

              return;

            }


            examState.currentQuestion =
              index;


            renderQuestion();

            renderPalette();

          }
        );


        palette.appendChild(
          button
        );

      }
    );

}


/* ============================================================
   NAVIGASI
   ============================================================ */

function previousQuestion() {

  if (
    examState.currentQuestion >
    0
  ) {

    examState.currentQuestion--;

    saveExamStateToStorage();

    renderQuestion();

    renderPalette();

  }

}


function nextQuestion() {

  if (
    examState.currentQuestion <
    examState.questions.length - 1
  ) {

    examState.currentQuestion++;

    saveExamStateToStorage();

    renderQuestion();

    renderPalette();

  }

}


/* ============================================================
   TIMER SERVER
   ============================================================ */

function startServerTimer() {

  stopTimer();


  const update =
    function () {

      const remaining =
        Math.max(
          0,
          examState.expiresAt -
          Date.now()
        );


      updateTimerDisplay(
        remaining
      );


      if (
        remaining <=
        0
      ) {

        stopTimer();

        submitExam(
          true
        );

      }

    };


  update();


  examState.timerId =
    setInterval(
      update,
      250
    );

}


function stopTimer() {

  if (
    examState.timerId
  ) {

    clearInterval(
      examState.timerId
    );


    examState.timerId =
      null;

  }

}


function updateTimerDisplay(
  remainingMs
) {

  const totalSeconds =
    Math.ceil(
      remainingMs /
      1000
    );


  const minutes =
    Math.floor(
      totalSeconds /
      60
    );


  const seconds =
    totalSeconds %
    60;


  const timer =
    document.getElementById(
      "timer"
    );


  if (
    timer
  ) {

    timer.textContent =
      `${String(
        minutes
      ).padStart(
        2,
        "0"
      )}:${String(
        seconds
      ).padStart(
        2,
        "0"
      )}`;

  }

}


/* ============================================================
   SUBMIT UJIAN
   ============================================================ */

async function submitExam(timeUp = false) {

  if (examState.submitting) {
    return;
  }


  /*
   * Jika peserta menekan Selesai secara manual,
   * tampilkan konfirmasi.
   */

  if (!timeUp) {

    const unanswered =
      examState.answers.filter(
        function(answer) {
          return answer === "-";
        }
      ).length;


    const message =
      unanswered > 0

        ? `Masih ada ${unanswered} soal yang belum dijawab.\n\nYakin ingin menyelesaikan ujian?`

        : "Yakin ingin menyelesaikan ujian?";


    const confirmed =
      window.confirm(
        message
      );


    if (!confirmed) {
      return;
    }

  }


  examState.submitting =
    true;


  stopTimer();


  /*
   * Nonaktifkan tombol selama
   * proses penyimpanan.
   */

  [
    "finishButton",
    "prevButton",
    "nextButton"
  ].forEach(
    function(id) {

      const element =
        document.getElementById(
          id
        );


      if (element) {
        element.disabled = true;
      }

    }
  );


  /*
   * Susun data.
   */

  const questionIds =
    examState.questions.map(
      function(question) {
        return String(
          question.id
        );
      }
    );


  const answers =
    examState.answers.map(
      function(answer) {

        return answer || "-";

      }
    );


  const payload = {

    action:
      "saveExamResult",

    name:
      localStorage.getItem(
        "participantName"
      ) || "",

    email:
      localStorage.getItem(
        "participantEmail"
      ) || "",

    examType:
      examState.examType,

    sessionId:
      examState.sessionId,

    questionIds:
      questionIds,

    answers:
      answers,

    timeUp:
      Boolean(timeUp)

  };


  console.log(
    "DATA SUBMIT:",
    payload
  );


  try {

    const result =
      await postJSON(
        payload
      );


    console.log(
      "RESPONSE APPS SCRIPT:",
      result
    );


    if (
      !result.success
    ) {
      throw new Error(
        result.message ||
        "Hasil gagal disimpan."
      );
    }

    /*
     * Ujian sudah berhasil disimpan.
     * Hapus state agar tidak muncul lagi
     * ketika peserta melakukan refresh.
     */
    clearSavedExamState();

    localStorage.removeItem(
      "selectedExam"
    );

    showResult(
      result
    );


  }
  catch(error) {

    console.error(
      "SUBMIT ERROR:",
      error
    );


    /*
     * Jika gagal, peserta masih berada
     * di halaman ujian dan dapat mencoba
     * mengirim ulang.
     */

    examState.submitting =
      false;


    const finish =
      document.getElementById(
        "finishButton"
      );

    if (finish) {
      finish.disabled =
        false;
    }


    const prev =
      document.getElementById(
        "prevButton"
      );

    if (prev) {

      prev.disabled =
        examState.currentQuestion === 0;

    }


    const next =
      document.getElementById(
        "nextButton"
      );

    if (next) {

      next.disabled =
        false;

    }


    window.alert(
      "Hasil ujian belum berhasil disimpan.\n\n" +
      (
        error.message ||
        "Terjadi kesalahan."
      )
    );

  }

}


/* ============================================================
   HASIL
   ============================================================ */

function showResult(
  result
) {

  document
    .getElementById(
      "examContainer"
    )
    ?.classList.add(
      "hidden"
    );


  document
    .getElementById(
      "examSelectionPage"
    )
    ?.classList.add(
      "hidden"
    );


  document
    .getElementById(
      "resultPage"
    )
    ?.classList.remove(
      "hidden"
    );


  const title =
    document.getElementById(
      "resultTitle"
    );


  const message =
    document.getElementById(
      "resultMessage"
    );


  const score =
    document.getElementById(
      "score"
    );


  const scoreCard =
    score?.closest(
      ".score-card"
    );


  const stats =
    document.querySelector(
      ".result-stats"
    );


  if (
    title
  ) {

    title.textContent =
      result.timeUp
        ? "Waktu Habis"
        : "Ujian Selesai";

  }


  if (
    message
  ) {

    message.textContent =
      result.showScore === false

        ? "Hasil ujian berhasil disimpan."

        : `${result.examName} berhasil dinilai oleh server.`;

  }


  if (
    result.showScore === true
  ) {

    scoreCard?.classList.remove(
      "hidden"
    );


    stats?.classList.remove(
      "hidden"
    );


    if (
      score
    ) {

      score.textContent =
        result.score ??
        0;

    }


    const correct =
      document.getElementById(
        "correctCount"
      );


    const wrong =
      document.getElementById(
        "wrongCount"
      );


    const unanswered =
      document.getElementById(
        "unansweredCount"
      );


    if (
      correct
    ) {

      correct.textContent =
        result.correct ??
        0;

    }


    if (
      wrong
    ) {

      wrong.textContent =
        result.wrong ??
        0;

    }


    if (
      unanswered
    ) {

      unanswered.textContent =
        result.unanswered ??
        0;

    }

  }
  else {

    scoreCard?.classList.add(
      "hidden"
    );


    stats?.classList.add(
      "hidden"
    );

  }

}


/* ============================================================
   RESET UJIAN
   ============================================================ */

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


  const finish =
    document.getElementById(
      "finishButton"
    );


  if (
    finish
  ) {

    finish.disabled =
      false;

  }


  const questionText =
    document.getElementById(
      "questionText"
    );


  if (
    questionText
  ) {

    questionText.textContent =
      "Memuat soal...";

  }


  const options =
    document.getElementById(
      "options"
    );


  if (
    options
  ) {

    options.innerHTML =
      "";

  }


  const palette =
    document.getElementById(
      "questionPalette"
    );


  if (
    palette
  ) {

    palette.innerHTML =
      "";

  }


  const timer =
    document.getElementById(
      "timer"
    );


  if (
    timer
  ) {

    timer.textContent =
      "02:00";

  }

}


/* ============================================================
   ============================================================
   ADMIN
   ============================================================
   ============================================================ */


/* ============================================================
   INIT ADMIN
   ============================================================ */

function initAdmin() {

  console.log(
    "Inisialisasi halaman admin..."
  );


  let adminName =
    localStorage.getItem(
      "adminName"
    );


  let adminEmail =
    localStorage.getItem(
      "adminEmail"
    );


  /* ----------------------------------------------------------
     JANGAN AUTO LOGIN
  ---------------------------------------------------------- */

  if (
    !adminName ||
    !adminEmail
  ) {

    console.warn(
      "Tidak ada session admin."
    );


    window.location.replace(
      "login.html"
    );


    return;

  }


  /* ----------------------------------------------------------
     VALIDASI SESSION
  ---------------------------------------------------------- */

  if (
    adminName
      .trim()
      .toLowerCase() !==
    ADMIN_NAME.toLowerCase()

    ||

    adminEmail
      .trim()
      .toLowerCase() !==
    ADMIN_EMAIL.toLowerCase()
  ) {

    console.warn(
      "Session admin tidak valid."
    );


    clearAdminStorage();


    window.location.replace(
      "login.html"
    );


    return;

  }


  /* ----------------------------------------------------------
     TAMPILKAN NAMA
  ---------------------------------------------------------- */

  const displayName =
    document.getElementById(
      "adminDisplayName"
    );


  if (
    displayName
  ) {

    displayName.textContent =
      adminName;

  }


  /* ----------------------------------------------------------
     LOGOUT
  ---------------------------------------------------------- */

  document
    .getElementById(
      "adminLogoutButton"
    )
    ?.addEventListener(
      "click",
      function () {

        clearAdminStorage();

        window.location.href =
          "login.html";

      }
    );


  /* ----------------------------------------------------------
     FILE UPLOAD
  ---------------------------------------------------------- */

  const fileInput =
    document.getElementById(
      "adminQuestionFile"
    );


  const fileName =
    document.getElementById(
      "selectedFileName"
    );


  if (
    fileInput
  ) {

    fileInput.addEventListener(
      "change",
      function () {

        const file =
          fileInput.files?.[0];


        if (
          fileName
        ) {

          fileName.textContent =
            file

              ? `${file.name} (${formatBytes(file.size)})`

              : "Belum ada file dipilih.";

        }

      }
    );

  }


  /* ----------------------------------------------------------
     UPLOAD FORM
  ---------------------------------------------------------- */

  document
    .getElementById(
      "uploadForm"
    )
    ?.addEventListener(
      "submit",
      async function (
        event
      ) {

        event.preventDefault();

        await uploadAdminQuestions();

      }
    );


  /* ----------------------------------------------------------
     SAVE SETTINGS
  ---------------------------------------------------------- */

  document
    .querySelectorAll(
      ".save-setting-button"
    )
    .forEach(
      function (
        button
      ) {

        button.addEventListener(
          "click",
          function () {

            saveAdminExamSetting(
              button.dataset.exam
            );

          }
        );

      }
    );


  /* ----------------------------------------------------------
     PAKET
  ---------------------------------------------------------- */

  document
    .getElementById(
      "packExamType"
    )
    ?.addEventListener(
      "change",
      loadQuestionPacks
    );


  document
    .getElementById(
      "refreshPacksButton"
    )
    ?.addEventListener(
      "click",
      loadQuestionPacks
    );


  document
    .getElementById(
      "saveActivePacksButton"
    )
    ?.addEventListener(
      "click",
      saveActiveQuestionPacks
    );


  /* ----------------------------------------------------------
     MODAL DELETE
  ---------------------------------------------------------- */

  document
    .getElementById(
      "cancelDeleteButton"
    )
    ?.addEventListener(
      "click",
      closeDeletePackModal
    );


  document
    .getElementById(
      "confirmDeleteButton"
    )
    ?.addEventListener(
      "click",
      confirmDeletePack
    );


  document
    .getElementById(
      "deleteModal"
    )
    ?.addEventListener(
      "click",
      function (
        event
      ) {

        if (
          event.target.id ===
          "deleteModal"
        ) {

          closeDeletePackModal();

        }

      }
    );


  /* ----------------------------------------------------------
     LOAD DATA
  ---------------------------------------------------------- */

  loadAdminExamSettings();

  loadQuestionPacks();

}


/* ============================================================
   LOAD PENGATURAN ADMIN
   ============================================================ */

async function loadAdminExamSettings() {

  try {

    const admin =
      getAdminIdentity();


    const result =
      await postJSON({

        action:
          "getExamSettings",

        adminName:
          admin.adminName,

        adminEmail:
          admin.adminEmail

      });


    if (
      !result.success
    ) {

      throw new Error(
        result.message ||
        "Pengaturan gagal dimuat."
      );

    }


    renderAdminExamSettings(
      result.settings
    );

  }
  catch (
    error
  ) {

    console.error(
      error
    );


    showStatus(

      document.getElementById(
        "settingsMessage"
      ),

      `Gagal memuat pengaturan: ${error.message}`,

      "error"

    );

  }

}


/* ============================================================
   RENDER SETTINGS ADMIN
   ============================================================ */

function renderAdminExamSettings(
  settings
) {

  EXAM_TYPES.forEach(
    function (
      examType
    ) {

      const setting =
        settings?.[
          examType
        ];


      if (
        !setting
      ) {

        return;

      }


      const duration =
        document.getElementById(
          `duration-${examType}`
        );


      const enabled =
        document.getElementById(
          `enabled-${examType}`
        );


      const showScore =
        document.getElementById(
          `show-score-${examType}`
        );


      if (
        duration
      ) {

        duration.value =
          Number(
            setting.durationMinutes
          ) ||
          2;

      }


      if (
        enabled
      ) {

        enabled.checked =
          setting.enabled ===
          true;

      }


      if (
        showScore
      ) {

        showScore.checked =
          setting.showScore !==
          false;

      }


      updateAdminStatusBadge(

        examType,

        setting.enabled ===
        true

      );

    }
  );

}


/* ============================================================
   STATUS BADGE ADMIN
   ============================================================ */

function updateAdminStatusBadge(
  examType,
  enabled
) {

  const status =
    document.getElementById(
      `status-${examType}`
    );


  if (
    !status
  ) {

    return;

  }


  status.textContent =
    enabled
      ? "Terbuka"
      : "Terkunci";


  status.className =
    `status-badge ${
      enabled
        ? "unlocked"
        : "locked"
    }`;

}


/* ============================================================
   SIMPAN SETTINGS
   ============================================================ */

async function saveAdminExamSetting(
  examType
) {

  const durationElement =
    document.getElementById(
      `duration-${examType}`
    );


  const enabledElement =
    document.getElementById(
      `enabled-${examType}`
    );


  const showScoreElement =
    document.getElementById(
      `show-score-${examType}`
    );


  const durationMinutes =
    Number(
      durationElement?.value
    );


  const enabled =
    Boolean(
      enabledElement?.checked
    );


  const showScore =
    Boolean(
      showScoreElement?.checked
    );


  if (
    !Number.isFinite(
      durationMinutes
    ) ||

    durationMinutes <
      1 ||

    durationMinutes >
      360
  ) {

    showStatus(

      document.getElementById(
        "settingsMessage"
      ),

      "Durasi harus antara 1 sampai 360 menit.",

      "error"

    );


    return;

  }


  const button =
    document.querySelector(
      `.save-setting-button[data-exam="${examType}"]`
    );


  if (
    button
  ) {

    button.disabled =
      true;


    button.textContent =
      "Menyimpan...";

  }


  try {

    const admin =
      getAdminIdentity();


    const result =
      await postJSON({

        action:
          "updateExamSettings",

        adminName:
          admin.adminName,

        adminEmail:
          admin.adminEmail,

        examType:
          examType,

        enabled:
          enabled,

        durationMinutes:
          durationMinutes,

        showScore:
          showScore

      });


    if (
      !result.success
    ) {

      throw new Error(
        result.message ||
        "Pengaturan gagal disimpan."
      );

    }


    updateAdminStatusBadge(
      examType,
      enabled
    );


    showStatus(

      document.getElementById(
        "settingsMessage"
      ),

      `${EXAM_NAMES[examType]} berhasil disimpan.`,

      "success"

    );

  }
  catch (
    error
  ) {

    console.error(
      error
    );


    showStatus(

      document.getElementById(
        "settingsMessage"
      ),

      `Gagal: ${error.message}`,

      "error"

    );

  }
  finally {

    if (
      button
    ) {

      button.disabled =
        false;


      button.textContent =
        "Simpan Pengaturan";

    }

  }

}


/* ============================================================
   UPLOAD SOAL
   ============================================================ */

async function uploadAdminQuestions() {

  const fileInput =
    document.getElementById(
      "adminQuestionFile"
    );


  const packageNameInput =
    document.getElementById(
      "adminPackageName"
    );


  const examSelect =
    document.getElementById(
      "adminExamType"
    );


  const examType =
    normalizeExamType(
      examSelect?.value
    );


  const file =
    fileInput?.files?.[0];


  const packageName =
    packageNameInput?.value.trim() ||
    "";


  /* ----------------------------------------------------------
     VALIDASI
  ---------------------------------------------------------- */

  if (
    !examType
  ) {

    showStatus(

      document.getElementById(
        "adminMessage"
      ),

      "Jenis ujian belum dipilih.",

      "error"

    );


    return;

  }


  if (
    !packageName
  ) {

    showStatus(

      document.getElementById(
        "adminMessage"
      ),

      "Nama paket soal wajib diisi.",

      "error"

    );


    return;

  }


  if (
    !file
  ) {

    showStatus(

      document.getElementById(
        "adminMessage"
      ),

      "Pilih file soal terlebih dahulu.",

      "error"

    );


    return;

  }


  const extension =
    file.name
      .split(".")
      .pop()
      .toLowerCase();


  if (
    ![
      "pdf",
      "docx"
    ].includes(
      extension
    )
  ) {

    showStatus(

      document.getElementById(
        "adminMessage"
      ),

      "File harus berformat PDF atau DOCX.",

      "error"

    );


    return;

  }


  /* ----------------------------------------------------------
     BUTTON
  ---------------------------------------------------------- */

  const button =
    document.getElementById(
      "adminUploadButton"
    );


  if (
    button
  ) {

    button.disabled =
      true;


    button.textContent =
      "Mengupload & membaca...";

  }


  try {

    const base64 =
      await readFileAsBase64(
        file
      );


    const admin =
      getAdminIdentity();


    const result =
      await postJSON({

        action:
          "uploadQuestions",

        adminName:
          admin.adminName,

        adminEmail:
          admin.adminEmail,

        examType:
          examType,

        packageName:
          packageName,

        fileName:
          file.name,

        mimeType:
          file.type,

        fileBase64:
          base64

      });


    if (
      !result.success
    ) {

      throw new Error(
        result.message ||
        "Upload soal gagal."
      );

    }


    showStatus(

      document.getElementById(
        "adminMessage"
      ),

      `Berhasil! Paket "${packageName}" berisi ${
        result.totalQuestions ||
        0
      } soal berhasil diupload.`,

      "success"

    );


    /* --------------------------------------------------------
       RESET FORM
    -------------------------------------------------------- */

    fileInput.value =
      "";


    if (
      packageNameInput
    ) {

      packageNameInput.value =
        "";

    }


    const selected =
      document.getElementById(
        "selectedFileName"
      );


    if (
      selected
    ) {

      selected.textContent =
        "Belum ada file dipilih.";

    }


    const packExamType =
      document.getElementById(
        "packExamType"
      );


    if (
      packExamType
    ) {

      packExamType.value =
        examType;

    }


    await loadQuestionPacks();

  }
  catch (
    error
  ) {

    console.error(
      error
    );


    showStatus(

      document.getElementById(
        "adminMessage"
      ),

      `Error: ${error.message}`,

      "error"

    );

  }
  finally {

    if (
      button
    ) {

      button.disabled =
        false;


      button.textContent =
        "Upload & Baca Soal";

    }

  }

}


/* ============================================================
   ============================================================
   PAKET SOAL
   ============================================================
   ============================================================ */


/* ============================================================
   LOAD PAKET SOAL
   ============================================================ */

async function loadQuestionPacks() {

  const examSelect =
    document.getElementById(
      "packExamType"
    );


  const container =
    document.getElementById(
      "questionPacksList"
    );


  if (
    !examSelect ||
    !container
  ) {

    return;

  }


  const examType =
    normalizeExamType(
      examSelect.value
    );


  if (
    !examType
  ) {

    return;

  }


  container.innerHTML = `

    <div class="empty-state">

      Memuat paket soal...

    </div>

  `;


  try {

    const admin =
      getAdminIdentity();


    const result =
      await postJSON({

        action:
          "getQuestionPacks",

        adminName:
          admin.adminName,

        adminEmail:
          admin.adminEmail,

        examType:
          examType

      });


    if (
      !result.success
    ) {

      throw new Error(
        result.message ||
        "Paket soal gagal dimuat."
      );

    }


    renderQuestionPacks(
      result.packs ||
      [],
      result.activeBatchIds ||
      []

    );

  }
  catch (
    error
  ) {

    console.error(
      error
    );


    container.innerHTML = `

      <div class="empty-state">

        <p>
          ❌ Gagal memuat paket soal.
        </p>

        <small>
          ${escapeHtml(
            error.message
          )}
        </small>

      </div>

    `;


    showStatus(

      document.getElementById(
        "packsMessage"
      ),

      error.message,

      "error"

    );

  }

}


/* ============================================================
   RENDER PAKET
   ============================================================ */

/* ============================================================
   RENDER PAKET SOAL
   ============================================================ */

function renderQuestionPacks(
  packs,
  activeBatchIds = []
) {

  const container =
    document.getElementById(
      "questionPacksList"
    );

  if (!container) {
    return;
  }

  if (
    !packs ||
    !packs.length
  ) {

    container.innerHTML = `

      <div class="empty-state">

        <div style="font-size:32px;">
          📚
        </div>

        <p>
          Belum ada paket soal untuk ujian ini.
        </p>

        <small class="muted">
          Upload paket soal terlebih dahulu.
        </small>

      </div>

    `;

    return;
  }


  /*
   * Server hanya boleh mempunyai satu
   * paket aktif.
   */

  const activeBatchId =
    Array.isArray(activeBatchIds) &&
    activeBatchIds.length > 0
      ? String(
          activeBatchIds[0]
        )
      : "";


  container.innerHTML =
    packs
      .map(
        function (pack) {

          const batchId =
            String(
              pack.batchId ||
              ""
            );


          const active =
            pack.active === true ||
            batchId === activeBatchId;


          return `

            <div
              class="question-pack-card ${
                active
                  ? "active"
                  : ""
              }"
            >

              <div
                class="question-pack-main"
              >

                <label
                  class="pack-select-row"
                >

                  <!--
                    RADIO BUTTON:
                    hanya SATU paket
                    yang dapat dipilih
                  -->

                  <input
                    type="radio"
                    name="selectedQuestionPack"
                    class="question-pack-radio"
                    value="${escapeHtml(
                      batchId
                    )}"
                    ${
                      active
                        ? "checked"
                        : ""
                    }
                  >

                  <div
                    class="pack-info"
                  >

                    <div
                      class="pack-title"
                    >

                      ${escapeHtml(
                        pack.packageName ||
                        "Tanpa Nama Paket"
                      )}

                    </div>


                    <div
                      class="pack-meta"
                    >

                      <span>
                        📄
                        ${escapeHtml(
                          pack.fileName ||
                          "-"
                        )}
                      </span>


                      <span>
                        📝
                        ${
                          Number(
                            pack.totalQuestions ||
                            0
                          )
                        }
                        soal
                      </span>


                      <span>
                        🕐
                        ${formatUploadDate(
                          pack.uploadedAt
                        )}
                      </span>

                    </div>


                    <div
                      class="pack-batch"
                    >

                      Batch ID:

                      <code>
                        ${escapeHtml(
                          batchId
                        )}
                      </code>

                    </div>

                  </div>

                </label>


                <div
                  class="pack-status"
                >

                  <span
                    class="status-badge ${
                      active
                        ? "unlocked"
                        : "locked"
                    }"
                  >

                    ${
                      active
                        ? "Digunakan"
                        : "Tidak Digunakan"
                    }

                  </span>

                </div>

              </div>


              <div
                class="pack-actions"
              >

                <button
                  type="button"
                  class="danger-button delete-pack-button"
                  data-batch-id="${escapeHtml(
                    batchId
                  )}"
                  data-package-name="${escapeHtml(
                    pack.packageName ||
                    ""
                  )}"
                  data-total-questions="${
                    Number(
                      pack.totalQuestions ||
                      0
                    )
                  }"
                  data-uploaded-at="${escapeHtml(
                    pack.uploadedAt ||
                    ""
                  )}"
                >

                  Hapus

                </button>

              </div>

            </div>

          `;

        }
      )
      .join("");


  /*
   * Tombol hapus
   */

  container
    .querySelectorAll(
      ".delete-pack-button"
    )
    .forEach(
      function (button) {

        button.addEventListener(
          "click",
          function () {

            openDeletePackModal({

              batchId:
                button.dataset.batchId,

              packageName:
                button.dataset.packageName,

              totalQuestions:
                button.dataset.totalQuestions,

              uploadedAt:
                button.dataset.uploadedAt

            });

          }
        );

      }
    );

}


/* ============================================================
   MODAL DELETE
   ============================================================ */

function openDeletePackModal(
  pack
) {

  selectedDeletePack =
    pack;


  const modal =
    document.getElementById(
      "deleteModal"
    );


  const text =
    document.getElementById(
      "deleteModalText"
    );


  if (
    !modal
  ) {

    return;

  }


  if (
    text
  ) {

    text.innerHTML = `

      Paket

      <strong>
        "${escapeHtml(
          pack.packageName ||
          "-"
        )}"
      </strong>

      akan dihapus beserta seluruh
      soal di dalamnya.

      <br><br>

      Jumlah soal:
      <strong>
        ${
          Number(
            pack.totalQuestions ||
            0
          )
        }
      </strong>

      <br>

      Waktu upload:
      <strong>
        ${formatUploadDate(
          pack.uploadedAt
        )}
      </strong>

      <br><br>

      <strong>
        Tindakan ini tidak dapat dibatalkan.
      </strong>

    `;

  }


  modal.style.display =
    "flex";

}


/* ============================================================
   TUTUP MODAL
   ============================================================ */

function closeDeletePackModal() {

  const modal =
    document.getElementById(
      "deleteModal"
    );


  if (
    modal
  ) {

    modal.style.display =
      "none";

  }


  selectedDeletePack =
    null;

}


/* ============================================================
   KONFIRMASI HAPUS PAKET
   ============================================================ */

async function confirmDeletePack() {

  if (
    !selectedDeletePack
  ) {

    return;

  }


  const pack =
    selectedDeletePack;


  const button =
    document.getElementById(
      "confirmDeleteButton"
    );


  if (
    !button
  ) {

    return;

  }


  button.disabled =
    true;


  button.textContent =
    "Menghapus...";


  try {

    const admin =
      getAdminIdentity();


    const examType =
      normalizeExamType(
        document.getElementById(
          "packExamType"
        )?.value
      );


    const result =
      await postJSON({

        action:
          "deleteQuestionPack",

        adminName:
          admin.adminName,

        adminEmail:
          admin.adminEmail,

        examType:
          examType,

        batchId:
          pack.batchId

      });


    if (
      !result.success
    ) {

      throw new Error(
        result.message ||
        "Paket gagal dihapus."
      );

    }


    closeDeletePackModal();


    showStatus(

      document.getElementById(
        "packsMessage"
      ),

      `Paket "${pack.packageName}" berhasil dihapus.`,

      "success"

    );


    await loadQuestionPacks();

  }
  catch (
    error
  ) {

    console.error(
      error
    );


    showStatus(

      document.getElementById(
        "packsMessage"
      ),

      `Gagal menghapus paket: ${error.message}`,

      "error"

    );

  }
  finally {

    button.disabled =
      false;


    button.textContent =
      "Ya, Hapus";

  }

}


/* ============================================================
   SIMPAN PAKET AKTIF
   ============================================================ */

async function saveActiveQuestionPacks() {

  const examSelect =
    document.getElementById(
      "packExamType"
    );


  const examType =
    normalizeExamType(
      examSelect?.value
    );


  /*
   * Ambil radio button yang dipilih.
   *
   * Karena menggunakan radio button,
   * secara normal hanya satu yang bisa dipilih.
   */

  const selected =
    document.querySelector(
      'input[name="selectedQuestionPack"]:checked'
    );


  const batchId =
    selected
      ? String(
          selected.value || ""
        ).trim()
      : "";


  /*
   * Belum memilih paket
   */

  if (!batchId) {

    showStatus(

      document.getElementById(
        "packsMessage"
      ),

      "Pilih satu paket soal terlebih dahulu.",

      "error"

    );

    return;

  }


  const button =
    document.getElementById(
      "saveActivePacksButton"
    );


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Menyimpan...";

  }


  try {

    const admin =
      getAdminIdentity();


    /*
     * Kirim SATU batchId ke Apps Script.
     */

    const result =
      await postJSON({

        action:
          "setActiveQuestionPacks",

        adminName:
          admin.adminName,

        adminEmail:
          admin.adminEmail,

        examType:
          examType,

        batchId:
          batchId,

        /*
         * Tetap kirim batchIds
         * agar kompatibel dengan
         * Code.gs versi sebelumnya.
         *
         * Isinya hanya SATU paket.
         */

        batchIds:
          [
            batchId
          ]

      });


    if (
      !result ||
      !result.success
    ) {

      throw new Error(
        result?.message ||
        "Gagal menyimpan paket aktif."
      );

    }


    /*
     * Berhasil
     */

    showStatus(

      document.getElementById(
        "packsMessage"
      ),

      `Paket soal berhasil dipilih untuk ${EXAM_NAMES[examType]}.`,

      "success"

    );


    /*
     * Muat ulang daftar paket
     * supaya status "Digunakan"
     * langsung berubah.
     */

    await loadQuestionPacks();

  }
  catch (
    error
  ) {

    console.error(
      "Gagal menyimpan paket:",
      error
    );


    showStatus(

      document.getElementById(
        "packsMessage"
      ),

      `Gagal menyimpan paket: ${error.message}`,

      "error"

    );

  }
  finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Simpan Paket yang Dipilih";

    }

  }

}


/* ============================================================
   GLOBAL ERROR HANDLER
   ============================================================ */

window.addEventListener(
  "error",
  function (
    event
  ) {

    console.error(
      "JavaScript Error:",
      event.error ||
      event.message
    );

  }
);


/* ============================================================
   UNHANDLED PROMISE
   ============================================================ */

window.addEventListener(
  "unhandledrejection",
  function (
    event
  ) {

    console.error(
      "Unhandled Promise:",
      event.reason
    );

  }
);