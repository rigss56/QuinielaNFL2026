// Requiere que el HTML ya haya cargado (en orden): firebase-app-compat.js,
// firebase-firestore-compat.js, firebase-config.js

const _app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ---------- Llenar el selector de equipos ----------
const selectEquipo = document.getElementById("equipoFavorito");
EQUIPOS_NFL.forEach((equipo) => {
  const opt = document.createElement("option");
  opt.value = equipo;
  opt.textContent = equipo;
  selectEquipo.appendChild(opt);
});

// ---------- Marcador dinámico (bolsa estimada + cuenta regresiva) ----------
// Nota: "usuarios" solo contiene participantes ya aprobados (con cuenta de
// Auth creada). Las inscripciones en revisión viven en "solicitudes".
async function actualizarMarcador() {
  try {
    const snap = await db.collection("usuarios").get();
    const aprobados = snap.size;
    const bolsa = aprobados * COSTO_INSCRIPCION;

    document.getElementById("stat-inscritos").textContent = aprobados;
    document.getElementById("stat-bolsa").textContent =
      bolsa.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  } catch (e) {
    // Si Firebase todavía no está configurado, no rompemos la página pública
    document.getElementById("stat-inscritos").textContent = "—";
    document.getElementById("stat-bolsa").textContent = "—";
    console.warn("No se pudo leer el marcador dinámico (¿ya configuraste Firebase?):", e);
  }
}

function actualizarCuentaRegresiva() {
  const ahora = new Date();
  const diffMs = FECHA_LIMITE_INSCRIPCION - ahora;
  const el = document.getElementById("stat-dias");
  if (diffMs <= 0) {
    el.textContent = "Cerrado";
    return;
  }
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  el.textContent = `${dias}d`;
}

actualizarMarcador();
actualizarCuentaRegresiva();
document.getElementById("stat-premio-semanal").textContent =
  PREMIO_SEMANAL.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

// ---------- Envío del formulario de registro ----------
const form = document.getElementById("form-registro");
const statusBox = document.getElementById("form-status");
const submitBtn = document.getElementById("submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusBox.className = "";
  statusBox.textContent = "";

  const nombre = document.getElementById("nombre").value.trim();
  const equipoFavorito = document.getElementById("equipoFavorito").value;
  const correo = document.getElementById("correo").value.trim().toLowerCase();
  const apodo = document.getElementById("apodo").value.trim();

  if (!nombre || !equipoFavorito || !correo || !apodo) {
    statusBox.className = "err";
    statusBox.textContent = "Completa todos los campos antes de enviar tu inscripción.";
    return;
  }

  if (new Date() > FECHA_LIMITE_INSCRIPCION) {
    statusBox.className = "err";
    statusBox.textContent = "El periodo de inscripción ya cerró (8 de septiembre 2026, 20:00 hrs).";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";

  try {
    // Evita registros duplicados por correo (ya inscrito o ya aprobado)
    const [snapSolicitud, snapUsuario] = await Promise.all([
      db.collection("solicitudes").where("correo", "==", correo).get(),
      db.collection("usuarios").where("correo", "==", correo).get(),
    ]);
    if (!snapSolicitud.empty || !snapUsuario.empty) {
      statusBox.className = "err";
      statusBox.textContent = "Ese correo ya está registrado. Si no recibiste tu aprobación, contacta a un administrador.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Enviar inscripción";
      return;
    }

    await db.collection("solicitudes").add({
      nombre,
      equipoFavorito,
      correo,
      apodo,
      estado: "pendiente",
      fechaRegistro: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // La Cloud Function "onNuevaInscripcion" notifica por correo a los 3
    // administradores. Al aprobar (con el link del correo), la función
    // "aprobarInscripcion" crea la cuenta de Auth, mueve los datos a
    // "usuarios/{uid}" y envía las credenciales temporales al participante.

    form.reset();
    statusBox.className = "ok";
    statusBox.textContent =
      "¡Listo! Tu inscripción quedó registrada. Un administrador la revisará y te llegará un correo con tu usuario y contraseña temporal en cuanto sea aprobada.";
    actualizarMarcador();
  } catch (err) {
    console.error(err);
    statusBox.className = "err";
    statusBox.textContent = "Hubo un problema al enviar tu inscripción. Intenta de nuevo en unos minutos.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar inscripción";
  }
});
