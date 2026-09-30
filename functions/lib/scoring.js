// ============================================================
// QUINIELA NFL 2026 — Lógica de cálculo de puntos y desempates
// ============================================================

/**
 * Determina el pronóstico por default para un usuario que no llenó su
 * quiniela a tiempo: V en todos los partidos, excepto el de su equipo
 * favorito, donde se le asigna la opción que lo haga ganar.
 */
function pronosticoAutomatico(equipoFavoritoUsuario, partido) {
  if (partido.equipoLocal === equipoFavoritoUsuario) return "L";
  if (partido.equipoVisitante === equipoFavoritoUsuario) return "V";
  return "V";
}

/**
 * Al terminar un partido (resultadoFinal ya capturado), calcula el punto de
 * cada participante aprobado para ese partido: usa su pronóstico guardado,
 * o genera uno automático (criterio de no llenado) si no metió nada.
 * Actualiza: pronosticos/{uid_partidoId}, usuarios/{uid}.puntosTotales,
 * tabla/{uid}.puntosTotales, y puntosSemana/{semana_uid} (para el cálculo
 * de premios semanales).
 */
async function calcularPuntosDePartido(db, admin, partidoId, partido) {
  const usuariosSnap = await db.collection("usuarios").get();
  const pronosticosExistentesSnap = await db.collection("pronosticos")
    .where("partidoId", "==", partidoId)
    .get();

  const pronosticosPorUid = {};
  pronosticosExistentesSnap.forEach((doc) => {
    pronosticosPorUid[doc.data().usuarioId] = doc.data();
  });

  const batch = db.batch();

  usuariosSnap.forEach((userDoc) => {
    const uid = userDoc.id;
    const usuario = userDoc.data();
    const existente = pronosticosPorUid[uid];

    const pronostico = existente
      ? existente.pronostico
      : pronosticoAutomatico(usuario.equipoFavorito, partido);
    const autoGenerado = !existente;
    const acierto = pronostico === partido.resultadoFinal;

    const pronosticoRef = db.collection("pronosticos").doc(`${uid}_${partidoId}`);
    batch.set(pronosticoRef, {
      usuarioId: uid,
      partidoId,
      pronostico,
      autoGenerado,
      puntoObtenido: acierto,
      fechaCalculo: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (acierto) {
      const usuarioRef = db.collection("usuarios").doc(uid);
      batch.set(usuarioRef, { puntosTotales: admin.firestore.FieldValue.increment(1) }, { merge: true });

      const tablaRef = db.collection("tabla").doc(uid);
      batch.set(tablaRef, {
        apodo: usuario.apodo,
        equipoFavorito: usuario.equipoFavorito,
        puntosTotales: admin.firestore.FieldValue.increment(1),
      }, { merge: true });

      const puntosSemanaRef = db.collection("puntosSemana").doc(`${partido.semana}_${uid}`);
      batch.set(puntosSemanaRef, {
        semana: partido.semana,
        usuarioId: uid,
        puntos: admin.firestore.FieldValue.increment(1),
      }, { merge: true });
    }
  });

  await batch.commit();
}

/**
 * Si ya se calificaron TODOS los partidos de una semana, resuelve el premio
 * semanal (y, en cadena, cualquier empate pendiente de semanas anteriores).
 */
async function procesarSemanaSiCompleta(db, admin, semana) {
  const partidosSemanaSnap = await db.collection("partidos").where("semana", "==", semana).get();
  if (partidosSemanaSnap.empty) return;

  const todosCalificados = partidosSemanaSnap.docs.every((d) => !!d.data().resultadoFinal);
  if (!todosCalificados) return;

  // 1. Premio semanal normal de esta semana, entre TODOS los participantes.
  const yaExiste = await db.collection("resultadosSemana").doc(String(semana)).get();
  if (!yaExiste.exists) {
    const puntosSemanaSnap = await db.collection("puntosSemana").where("semana", "==", semana).get();
    const puntos = puntosSemanaSnap.docs.map((d) => d.data());

    if (puntos.length > 0) {
      const maxPuntos = Math.max(...puntos.map((p) => p.puntos));
      const candidatos = puntos.filter((p) => p.puntos === maxPuntos).map((p) => p.usuarioId);

      if (candidatos.length === 1) {
        await db.collection("resultadosSemana").doc(String(semana)).set({
          semana,
          estado: "pagado",
          ganadorUid: candidatos[0],
          puntos: maxPuntos,
          premio: 1000,
          semanaResolucion: semana,
          fecha: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await db.collection("resultadosSemana").doc(String(semana)).set({
          semana,
          estado: "empate_pendiente",
          candidatos,
          puntos: maxPuntos,
          premio: 1000,
          fecha: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  // 2. Intenta resolver cualquier empate pendiente de una semana ANTERIOR,
  //    comparando únicamente a los candidatos empatados, con los puntos que
  //    sacaron en ESTA semana.
  const pendientesSnap = await db.collection("resultadosSemana")
    .where("estado", "==", "empate_pendiente")
    .get();

  for (const doc of pendientesSnap.docs) {
    const pendiente = doc.data();
    if (pendiente.semana >= semana) continue; // solo semanas anteriores a esta

    const puntosSemanaSnap = await db.collection("puntosSemana").where("semana", "==", semana).get();
    const puntosPorUid = {};
    puntosSemanaSnap.forEach((d) => { puntosPorUid[d.data().usuarioId] = d.data().puntos; });

    const puntosCandidatos = pendiente.candidatos.map((uid) => ({
      uid, puntos: puntosPorUid[uid] || 0,
    }));
    const maxPuntos = Math.max(...puntosCandidatos.map((c) => c.puntos));
    const nuevosCandidatos = puntosCandidatos.filter((c) => c.puntos === maxPuntos).map((c) => c.uid);

    if (nuevosCandidatos.length === 1) {
      await doc.ref.set({
        estado: "pagado",
        ganadorUid: nuevosCandidatos[0],
        semanaResolucion: semana,
        fecha: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      await doc.ref.set({
        candidatos: nuevosCandidatos,
        ultimaSemanaIntento: semana,
      }, { merge: true });
    }
  }
}

module.exports = { pronosticoAutomatico, calcularPuntosDePartido, procesarSemanaSiCompleta };
