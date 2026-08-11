// ============================================================
// QUINIELA NFL 2026 — Rangos de fecha de cada semana de temporada
// regular 2026 (mismos que usan las Cloud Functions del lado del
// servidor: de MARTES a LUNES, alineado con la apertura de la quiniela
// cada martes), usados aquí para calcular la semana actual sin pedirle
// nada al usuario.
// ============================================================

const RANGOS_SEMANA_TEMPORADA = {
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
 * Devuelve la semana "actual" según la fecha de hoy: la que contiene hoy,
 * o la más próxima si todavía no arranca la temporada, o la última si ya
 * terminó.
 */
function semanaActualPorFecha(hoy = new Date()) {
  const hoyStr = hoy.toISOString().slice(0, 10).replace(/-/g, "");
  const entradas = Object.entries(RANGOS_SEMANA_TEMPORADA);

  for (const [semana, [inicio, fin]] of entradas) {
    if (hoyStr >= inicio && hoyStr <= fin) return Number(semana);
  }
  if (hoyStr < entradas[0][1][0]) return 1;
  return 18;
}
