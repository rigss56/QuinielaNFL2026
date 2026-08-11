const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
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

admin.initializeApp();
const db = admin.firestore();

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
const APPROVAL_SECRET = defineSecret("APPROVAL_SECRET");

const CORREOS_ADMIN = [
  "rigss56@gmail.com",
  "checoloco12@hotmail.com",
  "alex_ngr@hotmail.com",
];

const FUNCTIONS_REGION = "us-central1";

// ============================================================
// 1. Nueva inscripción en /solicitudes → avisa a los 3 admins
// ============================================================
exports.onNuevaInscripcion = onDocumentCreated(
  { document: "solicitudes/{solicitudId}", region: FUNCTIONS_REGION, secrets: [SENDGRID_API_KEY, APPROVAL_SECRET] },
  async (event) => {
    const solicitudId = event.params.solicitudId;
    const datos = event.data.data();
    const secret = APPROVAL_SECRET.value();

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
    });

    await enviarCorreo({
      to: CORREOS_ADMIN,
      subject: `Nueva inscripción: ${datos.nombre} (${datos.apodo})`,
      html,
    });
  }
);

// ============================================================
// 2. Resolver inscripción (aprobar o rechazar) — link del correo
// ============================================================
exports.resolverInscripcion = onRequest(
  { region: FUNCTIONS_REGION, secrets: [SENDGRID_API_KEY, APPROVAL_SECRET] },
  async (req, res) => {
    const { id, accion, token } = req.query;
    const secret = APPROVAL_SECRET.value();

    if (!id || !accion || !token || !["aprobar", "rechazar"].includes(accion)) {
      return res.status(400).send(paginaResultado("Solicitud inválida.", false));
    }
    if (!verificar(id, accion, token, secret)) {
      return res.status(403).send(paginaResultado("Este link no es válido o ya expiró.", false));
    }

    const ref = db.collection("solicitudes").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).send(paginaResultado("Esta solicitud ya no existe.", false));
    }
    const datos = snap.data();

    if (datos.estado !== "pendiente") {
      return res.status(200).send(paginaResultado(`Esta solicitud ya fue procesada (estado: ${datos.estado}).`, true));
    }

    if (accion === "rechazar") {
      await ref.update({ estado: "rechazado", fechaResolucion: admin.firestore.FieldValue.serverTimestamp() });
      await enviarCorreo({
        to: datos.correo,
        subject: "Tu inscripción a la Quiniela NFL 2026",
        html: correoRechazo({ nombre: datos.nombre }),
      });
      return res.status(200).send(paginaResultado(`Inscripción de ${datos.nombre} rechazada.`, true));
    }

    // accion === "aprobar"
    const passwordTemporal = generarPasswordTemporal();

    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: datos.correo,
        password: passwordTemporal,
        displayName: datos.nombre,
      });
    } catch (err) {
      if (err.code === "auth/email-already-exists") {
        return res.status(409).send(paginaResultado("Ya existe una cuenta con ese correo.", false));
      }
      console.error(err);
      return res.status(500).send(paginaResultado("Ocurrió un error al crear la cuenta. Intenta de nuevo.", false));
    }

    await db.collection("usuarios").doc(userRecord.uid).set({
      nombre: datos.nombre,
      equipoFavorito: datos.equipoFavorito,
      correo: datos.correo,
      apodo: datos.apodo,
      rol: "participante",
      puntosTotales: 0,
      passwordTemporal: true,
      fechaAprobacion: admin.firestore.FieldValue.serverTimestamp(),
    });

    await ref.update({ estado: "aprobado", fechaResolucion: admin.firestore.FieldValue.serverTimestamp() });

    await enviarCorreo({
      to: datos.correo,
      subject: "¡Ya estás dentro! Tus accesos a la Quiniela NFL 2026",
      html: correoCredenciales({
        nombre: datos.nombre,
        correo: datos.correo,
        passwordTemporal,
        linkLogin: `${APP_BASE_URL}/login.html`,
      }),
    });

    return res.status(200).send(paginaResultado(`${datos.nombre} fue aprobado y ya recibió sus credenciales.`, true));
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
