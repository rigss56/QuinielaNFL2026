// ============================================================
// QUINIELA NFL 2026 — Sincronización automática del calendario
// con la API pública (no oficial) de ESPN, sin llave ni costo.
// ============================================================

// Rango exacto de fechas de cada semana de temporada regular 2026 —
// de MARTES a LUNES, para que coincida con la regla de que la quiniela
// abre el martes (y no con la agrupación interna de ESPN, que va de
// miércoles a martes y se traslaparía un día con la apertura).
const RANGOS_SEMANA = {
  1: ["20260908", "20260914"],
  2: ["20260915", "20260921"],
  3: ["20260922", "20260928"],
  4: ["20260929", "20261005"],
  5: ["20261006", "20261012"],
  6: ["20261013", "20261019"],
  7: ["20261020", "20261026"],
  8: ["20261027", "20261102"],
  9: ["20261103", "20261109"],
  10: ["20261110", "20261116"],
  11: ["20261117", "20261123"],
  12: ["20261124", "20261130"],
  13: ["20261201", "20261207"],
  14: ["20261208", "20261214"],
  15: ["20261215", "20261221"],
  16: ["20261222", "20261228"],
  17: ["20261229", "20270104"],
  18: ["20270105", "20270111"],
};

/**
 * Descarga los partidos de una semana desde ESPN y los guarda/actualiza en
 * Firestore. Si un partido ya existe (mismo local + visitante en esa
 * semana), solo le actualiza la fecha/hora (por si hubo flex schedule) —
 * y nunca toca un partido que ya tiene resultadoFinal capturado.
 */
async function sincronizarSemana(db, admin, semana) {
  const rango = RANGOS_SEMANA[semana];
  if (!rango) throw new Error(`Semana inválida: ${semana}`);

    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${semana}&seasontype=2&year=2026`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`ESPN respondió con estado ${resp.status}`);
  const data = await resp.json();

  const eventos = (data.events || []).filter((ev) => ev.season && ev.season.type === 2);

  const existentesSnap = await db.collection("partidos").where("semana", "==", semana).get();
  const existentesPorEquipos = {};
  existentesSnap.forEach((doc) => {
    const d = doc.data();
    existentesPorEquipos[`${d.equipoLocal}|${d.equipoVisitante}`] = { id: doc.id, ...d };
  });

  let agregados = 0;
  let actualizados = 0;
  const batch = db.batch();

  eventos.forEach((ev) => {
    const competicion = ev.competitions && ev.competitions[0];
    if (!competicion) return;
    const local = competicion.competitors.find((c) => c.homeAway === "home");
    const visitante = competicion.competitors.find((c) => c.homeAway === "away");
    if (!local || !visitante) return;

    const equipoLocal = local.team.displayName;
    const equipoVisitante = visitante.team.displayName;
    const fechaHora = admin.firestore.Timestamp.fromDate(new Date(ev.date));
    const clave = `${equipoLocal}|${equipoVisitante}`;
    const existente = existentesPorEquipos[clave];

    if (!existente) {
      const ref = db.collection("partidos").doc();
      batch.set(ref, { semana, equipoLocal, equipoVisitante, fechaHora, resultadoFinal: "" });
      agregados++;
    } else if (!existente.resultadoFinal && existente.fechaHora.toMillis() !== fechaHora.toMillis()) {
      const ref = db.collection("partidos").doc(existente.id);
      batch.update(ref, { fechaHora });
      actualizados++;
    }
  });

  await batch.commit();
  return { semana, encontrados: eventos.length, agregados, actualizados };
}

/**
 * Determina qué semana(s) conviene revisar hoy: la que está en curso ahora
 * mismo (por si hubo flex schedule) y la siguiente (para tenerla lista con
 * tiempo antes de que abra el martes).
 */
function semanasARevisar(hoy = new Date()) {
  // Fecha de HOY en hora de la Ciudad de México (no UTC): así el Monday Night
  // del lunes en la noche sigue contando como parte de su semana.
  const hoyStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(hoy).replace(/-/g, "");
  const entradas = Object.entries(RANGOS_SEMANA);
  const semanas = [];
  let siguienteAgregada = false;

  entradas.forEach(([semana, [inicio, fin]], i) => {
    if (hoyStr >= inicio && hoyStr <= fin) {
      // También la semana ANTERIOR: el partido del lunes en la noche termina
      // cuando ya empezó la semana nueva y hay que seguir revisándolo.
      if (i > 0) semanas.push(Number(entradas[i - 1][0]));
      semanas.push(Number(semana));
    } else if (!siguienteAgregada && hoyStr < inicio) {
      semanas.push(Number(semana));
      siguienteAgregada = true;
    }
  });
  return [...new Set(semanas)];
}

/**
 * Convierte un marcador final (goles/puntos de cada equipo) al criterio
 * L / E / V de la quiniela: 7 puntos de diferencia o más decide, si no, empate.
 */
function resultadoDesdeMarcador(puntosLocal, puntosVisitante) {
  const diferencia = puntosLocal - puntosVisitante;
  if (diferencia >= 7) return "L";
  if (diferencia <= -7) return "V";
  return "E";
}

/**
 * Descarga los marcadores de ESPN para una semana y captura resultadoFinal
 * en cualquier partido que ya haya terminado (status "Final") y todavía no
 * tenga resultado guardado. Al escribir resultadoFinal, dispara sola la
 * Cloud Function calcularPuntos (Fase 5) — no hace falta nada más.
 */
async function sincronizarResultados(db, admin, semana) {
  const rango = RANGOS_SEMANA[semana];
  if (!rango) throw new Error(`Semana inválida: ${semana}`);

    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${semana}&seasontype=2&year=2026`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`ESPN respondió con estado ${resp.status}`);
  const data = await resp.json();

  const eventos = (data.events || []).filter((ev) => ev.season && ev.season.type === 2);

  const partidosSnap = await db.collection("partidos").where("semana", "==", semana).get();
  const partidosPorEquipos = {};
  partidosSnap.forEach((doc) => {
    const d = doc.data();
    partidosPorEquipos[`${d.equipoLocal}|${d.equipoVisitante}`] = { id: doc.id, ...d };
  });

  let calificados = 0;

  for (const ev of eventos) {
    const competicion = ev.competitions && ev.competitions[0];
    if (!competicion) continue;
    if (!competicion.status || !competicion.status.type || !competicion.status.type.completed) continue;

    const local = competicion.competitors.find((c) => c.homeAway === "home");
    const visitante = competicion.competitors.find((c) => c.homeAway === "away");
    if (!local || !visitante) continue;

    const clave = `${local.team.displayName}|${visitante.team.displayName}`;
    const partido = partidosPorEquipos[clave];
    if (!partido || partido.resultadoFinal) continue;

    const resultado = resultadoDesdeMarcador(Number(local.score), Number(visitante.score));
    await db.collection("partidos").doc(partido.id).update({ resultadoFinal: resultado });
    calificados++;
  }

  return { semana, revisados: eventos.length, calificados };
}

module.exports = {
  sincronizarSemana, sincronizarResultados, semanasARevisar, resultadoDesdeMarcador, RANGOS_SEMANA,
};
