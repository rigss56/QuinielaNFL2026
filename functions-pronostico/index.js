// ============================================================
// QUINIELA NFL 2026 — Pronóstico Semanal
// ------------------------------------------------------------
// Cada 5 minutos revisa si ya cerró la quiniela de la semana (5 min antes
// del primer partido, igual que el bloqueo de captura). En cuanto cierra,
// arma UNA SOLA VEZ el vaciado de picks de todos los participantes y lo
// guarda en pronosticoSemanal/semana_N, que cualquier participante con
// sesión puede leer (ver firestore.rules).
//
// Quien no llenó algún partido aparece con el pick del criterio de no
// llenado, calculado con la MISMA regla que usa calcularPuntos
// (functions/lib/scoring.js → pronosticoAutomatico): V en todos, salvo el
// partido de su equipo favorito, donde va la opción que lo hace ganar.
//
// Esta función NO escribe en pronosticos, usuarios, tabla ni puntosSemana:
// solo lee y publica el documento de vaciado. El cálculo de puntos sigue
// igual que siempre.
//
// Despliegue (codebase separado, no toca las demás funciones):
//   firebase deploy --only functions:pronostico
// ============================================================

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const MINUTOS_CIERRE = 5;

// Copia exacta de pronosticoAutomatico() en functions/lib/scoring.js
function pronosticoAutomatico(equipoFavoritoUsuario, partido) {
  if (partido.equipoLocal === equipoFavoritoUsuario) return "L";
  if (partido.equipoVisitante === equipoFavoritoUsuario) return "V";
  return "V";
}

async function publicarSiCerro() {
  const ahora = Date.now();

  // Partido más reciente que ya arrancó o arranca en ≤ 5 min → su semana es
  // la que acaba de cerrar (o la última que cerró).
  const ultimoSnap = await db.collection("partidos")
    .where("fechaHora", "<=", admin.firestore.Timestamp.fromMillis(ahora + MINUTOS_CIERRE * 60 * 1000))
    .orderBy("fechaHora", "desc")
    .limit(1)
    .get();
  if (ultimoSnap.empty) return;

  const semana = ultimoSnap.docs[0].data().semana;
  const ref = db.collection("pronosticoSemanal").doc(`semana_${semana}`);
  if ((await ref.get()).exists) return; // ya publicada

  const partidosSnap = await db.collection("partidos")
    .where("semana", "==", semana)
    .orderBy("fechaHora")
    .get();
  if (partidosSnap.empty) return;

  const partidos = partidosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cierre = partidos[0].fechaHora.toMillis() - MINUTOS_CIERRE * 60 * 1000;
  if (ahora < cierre) return; // todavía no cierra

  // Pronósticos guardados de la semana (Firestore "in" admite hasta 30 valores)
  const picksPorUid = {};
  const ids = partidos.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db.collection("pronosticos").where("partidoId", "in", ids.slice(i, i + 30)).get();
    snap.forEach((doc) => {
      const d = doc.data();
      // Un pick marcado autoGenerado lo creó calcularPuntos, no el participante.
      if (!d.pronostico || d.autoGenerado === true) return;
      if (!picksPorUid[d.usuarioId]) picksPorUid[d.usuarioId] = {};
      picksPorUid[d.usuarioId][d.partidoId] = d.pronostico;
    });
  }

  const usuariosSnap = await db.collection("usuarios").get();
  const participantes = [];
  usuariosSnap.forEach((u) => {
    const usuario = u.data();
    const propios = picksPorUid[u.id] || {};
    const picks = {};
    const auto = [];
    partidos.forEach((p) => {
      if (propios[p.id]) {
        picks[p.id] = propios[p.id];
      } else {
        picks[p.id] = pronosticoAutomatico(usuario.equipoFavorito, p);
        auto.push(p.id);
      }
    });
    participantes.push({
      uid: u.id,
      apodo: usuario.apodo || "(sin apodo)",
      equipoFavorito: usuario.equipoFavorito || "",
      picks,
      auto,
      sinLlenar: auto.length === partidos.length,
    });
  });
  participantes.sort((a, b) => a.apodo.localeCompare(b.apodo, "es"));

  try {
    await ref.create({
      semana,
      publicadoEn: admin.firestore.FieldValue.serverTimestamp(),
      cierre: admin.firestore.Timestamp.fromMillis(cierre),
      partidos: partidos.map((p) => ({
        id: p.id,
        equipoLocal: p.equipoLocal,
        equipoVisitante: p.equipoVisitante,
        fechaHora: p.fechaHora,
      })),
      participantes,
    });
    logger.info(`Pronóstico Semanal publicado: semana ${semana}, ${participantes.length} participantes, ${partidos.length} partidos`);
  } catch (err) {
    if (err.code === 6 /* ALREADY_EXISTS */) return;
    throw err;
  }
}

exports.publicarPronosticoSemanal = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/Mexico_City",
    region: "us-central1",
  },
  async () => {
    await publicarSiCerro();
  }
);
