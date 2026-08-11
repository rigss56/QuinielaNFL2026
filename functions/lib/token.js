const crypto = require("crypto");

/**
 * Genera una firma HMAC para un link de aprobación/rechazo, de forma que
 * nadie pueda aprobar/rechazar inscripciones adivinando o modificando la URL:
 * la firma solo se puede generar conociendo APPROVAL_SECRET (vive en el
 * servidor, nunca se expone al público).
 */
function firmar(solicitudId, accion, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${solicitudId}:${accion}`)
    .digest("hex");
}

function verificar(solicitudId, accion, token, secret) {
  const esperado = firmar(solicitudId, accion, secret);
  const a = Buffer.from(esperado);
  const b = Buffer.from(String(token || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function generarPasswordTemporal() {
  // 10 caracteres, sin símbolos ambiguos (0/O, 1/l/I) para que sea fácil de
  // transcribir a mano si alguien lo necesita.
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pass = "";
  const bytes = crypto.randomBytes(10);
  for (let i = 0; i < 10; i++) {
    pass += alfabeto[bytes[i] % alfabeto.length];
  }
  return pass;
}

module.exports = { firmar, verificar, generarPasswordTemporal };
