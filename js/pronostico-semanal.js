// Requiere que el HTML ya haya cargado (en orden): firebase-app-compat.js,
// firebase-auth-compat.js, firebase-firestore-compat.js, firebase-config.js,
// auth-guard.js, nav.js, calendario-temporada.js
//
// PRONÓSTICO SEMANAL — vaciado de los picks de TODOS los participantes.
// El documento pronosticoSemanal/semana_N lo genera la Cloud Function
// programada "publicarPronosticoSemanal" en el momento en que cierra la
// quiniela de esa semana (5 min antes del primer partido), incluyendo los
// picks autocalculados de quien no llenó. Aquí solo se muestra el más
// reciente; se reemplaza solo cuando cierra la semana siguiente.

const PS_ABREV = {
  "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR", "Chicago Bears": "CHI", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL", "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
  "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX", "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LA", "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
  "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB", "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
};

function psAbrev(nombre) {
  return PS_ABREV[nombre] || String(nombre || "").slice(0, 3).toUpperCase();
}

function psEsc(txt) {
  const d = document.createElement("div");
  d.textContent = txt == null ? "" : String(txt);
  return d.innerHTML;
}

function psFecha(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("es-MX", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

async function cargarPronosticoSemanal(uidActual) {
  const vacio = document.getElementById("ps-vacio");
  const contenido = document.getElementById("ps-contenido");
  const subtitulo = document.getElementById("ps-subtitulo");

  const snap = await db.collection("pronosticoSemanal").orderBy("semana", "desc").limit(1).get();

  if (snap.empty) {
    const semana = semanaActualPorFecha();
    contenido.style.display = "none";
    vacio.style.display = "block";
    vacio.innerHTML = `Todavía no hay pronósticos publicados. El de la <strong>Semana ${semana}</strong>
      aparece aquí en cuanto cierre la quiniela (al arranque del primer partido de la semana).`;
    subtitulo.textContent = "";
    return;
  }

  const vac = snap.docs[0].data();
  const semana = vac.semana;
  const partidos = vac.partidos || [];

  // Resultados en vivo (se van llenando durante la semana)
  const partidosSnap = await db.collection("partidos").where("semana", "==", semana).get();
  const resultados = {};
  partidosSnap.forEach((d) => { resultados[d.id] = d.data().resultadoFinal || null; });

  const filas = (vac.participantes || []).map((p) => {
    let aciertos = 0;
    partidos.forEach((m) => {
      const r = resultados[m.id];
      if (r && p.picks && p.picks[m.id] === r) aciertos++;
    });
    return { ...p, aciertos };
  });
  filas.sort((a, b) => b.aciertos - a.aciertos || String(a.apodo).localeCompare(String(b.apodo), "es"));

  const jugados = partidos.filter((m) => resultados[m.id]).length;
  subtitulo.innerHTML = `<strong style="color:var(--cream);">Semana ${semana}</strong> · publicado al cierre
    (${psEsc(psFecha(vac.publicadoEn))}) · ${jugados} de ${partidos.length} partidos con resultado.
    Se reemplaza cuando cierre la Semana ${semana + 1}.`;

  // Encabezado: VIS @ LOC por partido
  let html = `<thead><tr><th class="col-participante">Participante</th>`;
  partidos.forEach((m) => {
    html += `<th title="${psEsc(m.equipoVisitante)} en ${psEsc(m.equipoLocal)}">
      <div class="ps-eq">${psEsc(psAbrev(m.equipoVisitante))}</div>
      <div class="ps-at">@</div>
      <div class="ps-eq">${psEsc(psAbrev(m.equipoLocal))}</div></th>`;
  });
  html += `<th class="col-total">Aciertos</th></tr></thead><tbody>`;

  // Renglón de resultados reales
  html += `<tr class="ps-fila-resultado"><td class="col-participante">Resultado</td>`;
  partidos.forEach((m) => {
    const r = resultados[m.id];
    html += `<td>${r ? `<span class="ps-pick ps-real">${r}</span>` : `<span class="ps-pendiente">·</span>`}</td>`;
  });
  html += `<td class="col-total">${jugados}</td></tr>`;

  filas.forEach((p) => {
    const autos = new Set(p.auto || []);
    const esYo = p.uid === uidActual;
    html += `<tr class="${esYo ? "ps-yo" : ""}"><td class="col-participante">${psEsc(p.apodo)}${
      p.sinLlenar ? ` <span class="ps-tag-auto" title="No llenó a tiempo">AUTO</span>` : ""}</td>`;
    partidos.forEach((m) => {
      const pick = p.picks ? p.picks[m.id] : null;
      const r = resultados[m.id];
      let cls = "ps-pick";
      if (r && pick) cls += pick === r ? " ps-ok" : " ps-fallo";
      if (autos.has(m.id)) cls += " ps-auto";
      html += `<td>${pick ? `<span class="${cls}">${pick}${autos.has(m.id) ? "*" : ""}</span>` : "—"}</td>`;
    });
    html += `<td class="col-total">${p.aciertos}</td></tr>`;
  });
  html += "</tbody>";

  document.getElementById("ps-tabla").innerHTML = html;
  vacio.style.display = "none";
  contenido.style.display = "block";
}

requireAuth().then(({ user, datos }) => {
  document.getElementById("nav-mount").appendChild(renderNav("pronostico"));

  const userBar = document.getElementById("user-bar");
  const nombreSpan = document.createElement("span");
  nombreSpan.textContent = `${datos.apodo} · `;
  const salirLink = document.createElement("a");
  salirLink.href = "#";
  salirLink.textContent = "Cerrar sesión";
  salirLink.addEventListener("click", (e) => { e.preventDefault(); cerrarSesion(); });
  userBar.appendChild(nombreSpan);
  userBar.appendChild(salirLink);

  const cargar = () => cargarPronosticoSemanal(user.uid).catch((err) => {
    console.error(err);
    const vacio = document.getElementById("ps-vacio");
    vacio.style.display = "block";
    vacio.textContent = "No se pudo cargar el pronóstico semanal. Intenta con el botón Actualizar o recarga la página.";
  });
  cargar();

  const btn = document.getElementById("btn-actualizar");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Actualizando…";
    await cargar();
    btn.textContent = "Actualizar";
    btn.disabled = false;
  });
});
