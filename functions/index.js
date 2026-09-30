const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

const { firmar, verificar, generarPasswordTemporal } = require("./lib/token");
const {
  correoNuevaInscripcion,
  correoCredenciales,
  correoRechazo,
  enviarCorreo,
  APP_BASE_URL,
} = require("./lib/email");
const { calcularPuntosDePartido, procesarSemanaSiCompleta } = require("./lib/scoring");
const { procesarSolicitud } = require("./lib/aprobacion");
const { sincronizarSemana, sincronizarResultados, semanasARevisar } = require("./lib/calendario");

admin.initializeApp();
const db = admin.firestore();

const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const APPROVAL_SECRET = defineSecret("APPROVAL_SECRET");

const CORREOS_ADMIN = [
  "rigss56@gmail.com",
  "checoloco12@hotmail.com",
  "alex_ngr@hotmail.com",
];

const FUNCTIONS_REGION = "us-central1";

const ctxAprobacion = {
  db, admin, enviarCorreo, correoCredenciales, correoRechazo,
  APP_BASE_URL, generarPasswordTemporal,
};

// ============================================================
// 1. Nueva inscripción en /solicitudes → avisa a los 3 admins
// ============================================================
exports.onNuevaInscripcion = onDocumentCreated(
  { document: "solicitudes/{solicitudId}", region: FUNCTIONS_REGION, secrets: [GMAIL_APP_PASSWORD, APPROVAL_SECRET] },
  async (event) => {
    const solicitudId = event.params.solicitudId;
    const datos = event.data.data();
    const secret = APPROVAL_SECRET.value();

    const [yaAprobado, otrasSolicitudes] = await Promise.all([
      db.collection("usuarios").where("correo", "==", datos.correo).limit(1).get(),
      db.collection("solicitudes").where("correo", "==", datos.correo).get(),
    ]);
    const esDuplicado = !yaAprobado.empty || otrasSolicitudes.size > 1;

    const tokenAprobar = firmar(solicitudId, "aprobar", secret);
    const tokenRechazar = firmar(solicitudId, "rechazar", secret);

    const base = `https://${FUNCTIONS_REGION}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net`;
    const linkAprobar = `${base}/resolverInscripcion?id=${solicitudId}&accion=aprobar&token=${tokenAprobar}`;
    const linkRechazar = `${base}/resolverInscripcion?id=${solicitudId}&accion=rechazar&token=${tokenRechazar}`;

    const html = correoNuevaInscripcion({
      nombre: datos.nombre,
      apodo: datos.apodo,
      correo: datos.correo,
      equipoFavorito: datos.equipoFavorito,
      linkAprobar,
      linkRechazar,
      esDuplicado,
    });

    await enviarCorreo({
      to: CORREOS_ADMIN,
      subject: `${esDuplicado ? "[Posible duplicado] " : ""}Nueva inscripción: ${datos.nombre} (${datos.apodo})`,
      html,
    });
  }
);

// ============================================================
// 2. Resolver inscripción desde el LINK DEL CORREO (token firmado)
// ============================================================
exports.resolverInscripcion = onRequest(
  { region: FUNCTIONS_REGION, secrets: [GMAIL_APP_PASSWORD, APPROVAL_SECRET] },
  async (req, res) => {
    const { id, accion, token } = req.query;
    const secret = APPROVAL_SECRET.value();

    if (!id || !accion || !token || !["aprobar", "rechazar"].includes(accion)) {
      return res.status(400).send(paginaResultado("Solicitud inválida.", false));
    }
    if (!verificar(id, accion, token, secret)) {
      return res.status(403).send(paginaResultado("Este link no es válido o ya expiró.", false));
    }

    const resultado = await procesarSolicitud(ctxAprobacion, id, accion);
    return res.status(resultado.ok ? 200 : 409).send(paginaResultado(resultado.mensaje, resultado.ok));
  }
);

// ============================================================
// 2b. Resolver inscripción desde el PANEL DE ADMIN (sesión autenticada)
// ============================================================
exports.panelResolverSolicitud = onCall(
  { region: FUNCTIONS_REGION, secrets: [GMAIL_APP_PASSWORD, APPROVAL_SECRET] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const adminSnap = await db.collection("usuarios").doc(request.auth.uid).get();
    if (!adminSnap.exists || adminSnap.data().rol !== "admin") {
      throw new HttpsError("permission-denied", "Solo administradores pueden hacer esto.");
    }

    const { solicitudId, accion } = request.data;
    if (!solicitudId || !["aprobar", "rechazar"].includes(accion)) {
      throw new HttpsError("invalid-argument", "Solicitud inválida.");
    }

    return procesarSolicitud(ctxAprobacion, solicitudId, accion);
  }
);

// ============================================================
// 3. Calcular puntos al capturar el resultado de un partido
// ============================================================
exports.calcularPuntos = onDocumentUpdated(
  { document: "partidos/{partidoId}", region: FUNCTIONS_REGION },
  async (event) => {
    const antes = event.data.before.data();
    const despues = event.data.after.data();

    // Solo actuar cuando resultadoFinal pasa de vacío a capturado
    if (antes.resultadoFinal || !despues.resultadoFinal) return;

    const partidoId = event.params.partidoId;
    await calcularPuntosDePartido(db, admin, partidoId, despues);
    await procesarSemanaSiCompleta(db, admin, despues.semana);
  }
);

function paginaResultado(mensaje, ok) {
  const color = ok ? "#013369" : "#d50a0a";
  return `<!DOCTYPE html>
<html lang="es-MX"><head><meta charset="UTF-8"><title>Quiniela NFL 2026</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#01213f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="background:${color};padding:30px 40px;border-radius:10px;max-width:420px;text-align:center;">
    <p style="margin:0;font-size:16px;">${mensaje}</p>
  </div>
</body></html>`;
}

// ============================================================
// 4. Sincronizar calendario con ESPN — botón manual del panel
// ============================================================
exports.panelSincronizarCalendario = onCall(
  { region: FUNCTIONS_REGION },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const adminSnap = await db.collection("usuarios").doc(request.auth.uid).get();
    if (!adminSnap.exists || adminSnap.data().rol !== "admin") {
      throw new HttpsError("permission-denied", "Solo administradores pueden hacer esto.");
    }

    const { semana } = request.data;
    if (!semana || semana < 1 || semana > 18) {
      throw new HttpsError("invalid-argument", "Semana inválida.");
    }

    try {
      return await sincronizarSemana(db, admin, semana);
    } catch (err) {
      console.error(err);
      throw new HttpsError("internal", "No se pudo sincronizar con ESPN. Intenta de nuevo en un rato.");
    }
  }
);

// ============================================================
// 5. Sincronizar calendario con ESPN — automático, cada martes
// ============================================================
exports.sincronizarCalendarioSemanal = onSchedule(
  { region: FUNCTIONS_REGION, schedule: "0 5 * * 2", timeZone: "America/Mexico_City" },
  async () => {
    const semanas = semanasARevisar(new Date());
    for (const semana of semanas) {
      try {
        const resultado = await sincronizarSemana(db, admin, semana);
        console.log(`Semana ${semana} sincronizada:`, resultado);
      } catch (err) {
        console.error(`Error sincronizando semana ${semana}:`, err);
      }
    }
  }
);

// ============================================================
// 6. Descargar resultados de ESPN — botón manual del panel
// ============================================================
exports.panelSincronizarResultados = onCall(
  { region: FUNCTIONS_REGION },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const adminSnap = await db.collection("usuarios").doc(request.auth.uid).get();
    if (!adminSnap.exists || adminSnap.data().rol !== "admin") {
      throw new HttpsError("permission-denied", "Solo administradores pueden hacer esto.");
    }

    const { semana } = request.data;
    if (!semana || semana < 1 || semana > 18) {
      throw new HttpsError("invalid-argument", "Semana inválida.");
    }

    try {
      return await sincronizarResultados(db, admin, semana);
    } catch (err) {
      console.error(err);
      throw new HttpsError("internal", "No se pudo consultar ESPN. Intenta de nuevo en un rato.");
    }
  }
);

// ============================================================
// 7. Descargar resultados de ESPN — automático, todos los días
// ============================================================
exports.sincronizarResultadosDiario = onSchedule(
  { region: FUNCTIONS_REGION, schedule: "0 6,12,20,23 * * *", timeZone: "America/Mexico_City" },
  async () => {
    const semanas = semanasARevisar(new Date());
    for (const semana of semanas) {
      try {
        const resultado = await sincronizarResultados(db, admin, semana);
        console.log(`Resultados semana ${semana}:`, resultado);
      } catch (err) {
        console.error(`Error descargando resultados semana ${semana}:`, err);
      }
    }
  }
);
