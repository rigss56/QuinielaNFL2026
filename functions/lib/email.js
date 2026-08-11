const sgMail = require("@sendgrid/mail");

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "quiniela@example.com";
const APP_BASE_URL = process.env.APP_BASE_URL || "https://TU-USUARIO.github.io/TU-REPO";

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

const AZUL = "#013369";
const ROJO = "#d50a0a";
const BLANCO = "#ffffff";

function envolver(tituloEyebrow, cuerpoHtml) {
  return `
  <div style="background:${AZUL};padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#0b2a52;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:26px 30px 10px;">
              <img src="${APP_BASE_URL}/img/logo.png" width="46" height="46" alt="Quiniela NFL 2026" style="border-radius:50%;vertical-align:middle;" />
              <span style="color:${BLANCO};font-size:18px;font-weight:bold;letter-spacing:0.03em;vertical-align:middle;margin-left:10px;">
                QUINIELA <span style="color:${ROJO};">NFL 2026</span>
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 30px 0;">
              <p style="color:#ffb3b3;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;margin:0;">${tituloEyebrow}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 30px 30px;color:#eef2f8;font-size:15px;line-height:1.6;">
              ${cuerpoHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 30px;border-top:1px solid rgba(255,255,255,0.12);color:#93a4bd;font-size:12px;">
              Quiniela NFL 2026 · Este es un correo automático, no respondas a este mensaje.
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

function botón(texto, href, color) {
  return `<a href="${href}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:bold;letter-spacing:0.03em;padding:12px 22px;border-radius:6px;font-size:14px;">${texto}</a>`;
}

// ---------- 1. Aviso a los administradores de nueva inscripción ----------
function correoNuevaInscripcion({ nombre, apodo, correo, equipoFavorito, linkAprobar, linkRechazar }) {
  const cuerpo = `
    <p style="margin:0 0 16px;">Nueva inscripción pendiente de revisión:</p>
    <table role="presentation" width="100%" cellpadding="6" cellspacing="0" style="background:#0e315c;border-radius:8px;margin-bottom:22px;">
      <tr><td style="color:#93a4bd;">Nombre</td><td style="color:#fff;font-weight:bold;">${nombre}</td></tr>
      <tr><td style="color:#93a4bd;">Apodo</td><td style="color:#fff;">${apodo}</td></tr>
      <tr><td style="color:#93a4bd;">Correo</td><td style="color:#fff;">${correo}</td></tr>
      <tr><td style="color:#93a4bd;">Equipo favorito</td><td style="color:#fff;">${equipoFavorito}</td></tr>
    </table>
    <div>
      ${botón("Aprobar inscripción", linkAprobar, ROJO)}
      &nbsp;&nbsp;
      ${botón("Rechazar", linkRechazar, "#3a4c6b")}
    </div>
    <p style="margin:22px 0 0;color:#93a4bd;font-size:12.5px;">
      Al aprobar, el sistema crea la cuenta automáticamente y le envía usuario
      y contraseña temporal al correo del participante.
    </p>`;
  return envolver("Nueva inscripción · acción requerida", cuerpo);
}

// ---------- 2. Credenciales temporales al participante aprobado ----------
function correoCredenciales({ nombre, correo, passwordTemporal, linkLogin }) {
  const cuerpo = `
    <p style="margin:0 0 16px;">¡Hola ${nombre}! Tu inscripción a la Quiniela NFL 2026 fue aprobada.</p>
    <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#0e315c;border-radius:8px;margin-bottom:22px;">
      <tr><td style="color:#93a4bd;">Usuario</td><td style="color:#fff;font-weight:bold;">${correo}</td></tr>
      <tr><td style="color:#93a4bd;">Contraseña temporal</td><td style="color:#fff;font-family:monospace;font-size:16px;letter-spacing:0.05em;">${passwordTemporal}</td></tr>
    </table>
    <p style="margin:0 0 20px;">Al entrar por primera vez, el sistema te va a pedir definir tu contraseña definitiva.</p>
    <div>${botón("Iniciar sesión", linkLogin, ROJO)}</div>`;
  return envolver("¡Ya estás dentro!", cuerpo);
}

// ---------- 3. Aviso de rechazo (opcional, informativo) ----------
function correoRechazo({ nombre }) {
  const cuerpo = `
    <p style="margin:0;">Hola ${nombre}, tu inscripción a la Quiniela NFL 2026 no fue aprobada. Si crees que se trata de un error, contacta directamente a un administrador.</p>`;
  return envolver("Inscripción no aprobada", cuerpo);
}

async function enviarCorreo({ to, subject, html }) {
  if (!SENDGRID_API_KEY) {
    console.warn(`[email] SENDGRID_API_KEY no configurado — se omite el envío a ${to}: "${subject}"`);
    return;
  }
  await sgMail.send({ to, from: FROM_EMAIL, subject, html });
}

module.exports = {
  correoNuevaInscripcion,
  correoCredenciales,
  correoRechazo,
  enviarCorreo,
  APP_BASE_URL,
};
