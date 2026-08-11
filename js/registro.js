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
// Lee de "stats/public", un contador que solo actualizan las Cloud Functions
// al aprobar a alguien — así el público puede ver el número sin tener acceso
// de lectura a la colección real de "usuarios" (que sí está protegida).
async function actualizarMarcador() {
  try {
    const snap = await db.collection("stats").doc("public").get();
    const aprobados = snap.exists ? (snap.data().aprobados || 0) : 0;
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
    await db.collection("solicitudes").add({
      nombre,
      equipoFavorito,
      correo,
      apodo,
      estado: "pendiente",
      fechaRegistro: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // La Cloud Function "onNuevaInscripcion" revisa si el correo ya está
    // registrado o aprobado y avisa a los administradores (incluyendo si es
    // un posible duplicado). Al aprobar (con el link del correo), la función
    // "resolverInscripcion" crea la cuenta de Auth, mueve los datos a
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
