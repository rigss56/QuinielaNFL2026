// Requiere que el HTML ya haya cargado (en orden): firebase-app-compat.js,
// firebase-auth-compat.js, firebase-firestore-compat.js, firebase-config.js,
// auth-guard.js, nav.js

function formatoMXN(n) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

async function cargarPremios() {
  const statsSnap = await db.collection("stats").doc("public").get();
  const aprobados = statsSnap.exists ? (statsSnap.data().aprobados || 0) : 0;
  const bolsaTotal = aprobados * COSTO_INSCRIPCION;

  const semanasSnap = await db.collection("resultadosSemana").orderBy("semana").get();
  const comprometidoSemanal = semanasSnap.size * PREMIO_SEMANAL;
  const premioFinalEstimado = bolsaTotal - comprometidoSemanal;

  document.getElementById("stat-bolsa").textContent = formatoMXN(bolsaTotal);
  document.getElementById("stat-inscritos").textContent = aprobados;
  document.getElementById("stat-pagado").textContent = formatoMXN(comprometidoSemanal);
  document.getElementById("stat-final").textContent = formatoMXN(Math.max(premioFinalEstimado, 0));

  const cont = document.getElementById("semanas-container");
  const sinSemanas = document.getElementById("sin-semanas");
  cont.innerHTML = "";

  if (semanasSnap.empty) {
    sinSemanas.style.display = "block";
    return;
  }
  sinSemanas.style.display = "none";

  // Junta los apodos de los involucrados (ganadores o candidatos a empate)
  const uidsNecesarios = new Set();
  semanasSnap.forEach((doc) => {
    const d = doc.data();
    if (d.ganadorUid) uidsNecesarios.add(d.ganadorUid);
    if (d.candidatos) d.candidatos.forEach((uid) => uidsNecesarios.add(uid));
  });
  const apodos = {};
  await Promise.all([...uidsNecesarios].map(async (uid) => {
    const snap = await db.collection("tabla").doc(uid).get();
    apodos[uid] = snap.exists ? snap.data().apodo : "?";
  }));

  semanasSnap.docs.reverse().forEach((doc) => {
    const d = doc.data();
    const row = document.createElement("div");
    row.className = "semana-premio-row";

    if (d.estado === "pagado") {
      row.innerHTML = `
        <span>Semana ${d.semana}</span>
        <span class="ganador">${apodos[d.ganadorUid] || "?"} — ${d.puntos} pts</span>
        <span>${formatoMXN(d.premio)}</span>
      `;
    } else {
      const nombres = (d.candidatos || []).map((uid) => apodos[uid] || "?").join(", ");
      row.innerHTML = `
        <span>Semana ${d.semana}</span>
        <span class="estado-empate">Empate (${nombres}) — se resuelve con la próxima semana</span>
        <span>${formatoMXN(d.premio)}</span>
      `;
    }
    cont.appendChild(row);
  });
}

requireAuth().then(({ datos }) => {
  document.getElementById("nav-mount").appendChild(renderNav("premios"));

  const userBar = document.getElementById("user-bar");
  const nombreSpan = document.createElement("span");
  nombreSpan.textContent = `${datos.apodo} · `;
  const salirLink = document.createElement("a");
  salirLink.href = "#";
  salirLink.textContent = "Cerrar sesión";
  salirLink.addEventListener("click", (e) => { e.preventDefault(); cerrarSesion(); });
  userBar.appendChild(nombreSpan);
  userBar.appendChild(salirLink);

  cargarPremios();
});
