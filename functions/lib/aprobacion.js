// ============================================================
// QUINIELA NFL 2026 — Lógica compartida para aprobar/rechazar
// inscripciones. La usan tanto el link del correo (resolverInscripcion,
// protegido con token firmado) como el panel de Admin (panelResolverSolicitud,
// protegido con sesión de administrador).
// ============================================================

async function procesarSolicitud(ctx, solicitudId, accion) {
  const {
    db, admin, enviarCorreo, correoCredenciales, correoRechazo,
    APP_BASE_URL, generarPasswordTemporal,
  } = ctx;

  const ref = db.collection("solicitudes").doc(solicitudId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, mensaje: "Esta solicitud ya no existe." };
  }
  const datos = snap.data();

  if (datos.estado !== "pendiente") {
    return { ok: true, mensaje: `Esta solicitud ya fue procesada (estado: ${datos.estado}).` };
  }

  if (accion === "rechazar") {
    await ref.update({ estado: "rechazado", fechaResolucion: admin.firestore.FieldValue.serverTimestamp() });
    await enviarCorreo({
      to: datos.correo,
      subject: "Tu inscripción a la Quiniela NFL 2026",
      html: correoRechazo({ nombre: datos.nombre }),
    });
    return { ok: true, mensaje: `Inscripción de ${datos.nombre} rechazada.` };
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
      return { ok: false, mensaje: "Ya existe una cuenta con ese correo." };
    }
    console.error(err);
    return { ok: false, mensaje: "Ocurrió un error al crear la cuenta. Intenta de nuevo." };
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

  await db.collection("tabla").doc(userRecord.uid).set({
    apodo: datos.apodo,
    equipoFavorito: datos.equipoFavorito,
    puntosTotales: 0,
  });

  await ref.update({ estado: "aprobado", fechaResolucion: admin.firestore.FieldValue.serverTimestamp() });

  await db.collection("stats").doc("public").set(
    { aprobados: admin.firestore.FieldValue.increment(1) },
    { merge: true }
  );

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

  return { ok: true, mensaje: `${datos.nombre} fue aprobado y ya recibió sus credenciales.` };
}

module.exports = { procesarSolicitud };
