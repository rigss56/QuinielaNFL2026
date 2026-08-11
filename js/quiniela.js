// Requiere que el HTML ya haya cargado (en orden): firebase-app-compat.js,
// firebase-auth-compat.js, firebase-firestore-compat.js, firebase-config.js,
// auth-guard.js, nav.js

const EQUIPOS_ABREV = {
  "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR", "Chicago Bears": "CHI", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL", "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
  "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX", "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LA", "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
  "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB", "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
};

function abrevEquipo(nombre) {
  return EQUIPOS_ABREV[nombre] || nombre.slice(0, 3).toUpperCase();
}

function formatearFecha(fechaHora) {
  return fechaHora.toDate().toLocaleString("es-MX", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

let semanaActual = 1;
let partidosActuales = [];
let seleccionesPendientes = {}; // partidoId -> "L" | "E" | "V"
let usuarioActual = null;

function poblarSelectorSemanas() {
  const sel = document.getElementById("select-semana");
  for (let s = 1; s <= 18; s++) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = `Semana ${s}`;
    sel.appendChild(opt);
  }
  sel.value = String(semanaActual);
  sel.addEventListener("change", () => {
    semanaActual = parseInt(sel.value, 10);
    document.getElementById("tag-semana").textContent = `Semana ${semanaActual}`;
    cargarSemana();
  });
}

function crearTarjetaPartido(partido, bloqueado, seleccionInicial) {
  const card = document.createElement("div");
  card.className = "matchup-card";

  const row = document.createElement("div");
  row.className = "matchup-row";

  const colLocal = document.createElement("div");
  colLocal.className = "matchup-team";
  colLocal.innerHTML = `<span class="badge">LOCAL</span><div class="name">${partido.equipoLocal}</div>`;

  const picker = document.createElement("div");
  picker.className = "matchup-picker";
  ["L", "E", "V"].forEach((opcion) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = opcion;
    btn.dataset.opcion = opcion;
    if (opcion === seleccionInicial) btn.classList.add("selected");
    btn.disabled = bloqueado;
    btn.addEventListener("click", () => {
      if (bloqueado) return;
      picker.querySelectorAll("button").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      seleccionesPendientes[partido.id] = opcion;
      document.getElementById("btn-guardar").disabled = false;
    });
    picker.appendChild(btn);
  });

  const colVisitante = document.createElement("div");
  colVisitante.className = "matchup-team";
  colVisitante.innerHTML = `<span class="badge">VISITANTE</span><div class="name">${partido.equipoVisitante}</div>`;

  row.appendChild(colLocal);
  row.appendChild(picker);
  row.appendChild(colVisitante);
  card.appendChild(row);

  const fecha = document.createElement("div");
  fecha.className = "matchup-date";
  fecha.textContent = formatearFecha(partido.fechaHora);
  card.appendChild(fecha);

  return card;
}

async function cargarSemana() {
  const cont = document.getElementById("partidos-container");
  const sinPartidos = document.getElementById("sin-partidos");
  const lockBanner = document.getElementById("lock-banner");
  const saveBar = document.getElementById("save-bar");
  cont.innerHTML = "";
  seleccionesPendientes = {};

  const snap = await db.collection("partidos")
    .where("semana", "==", semanaActual)
    .orderBy("fechaHora")
    .get();

  if (snap.empty) {
    sinPartidos.style.display = "block";
    lockBanner.style.display = "none";
    saveBar.style.display = "none";
    partidosActuales = [];
    return;
  }
  sinPartidos.style.display = "none";

  partidosActuales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const primerFecha = partidosActuales[0].fechaHora.toDate();
  const cierre = new Date(primerFecha.getTime() - 5 * 60 * 1000);
  const bloqueado = new Date() >= cierre;

  if (bloqueado) {
    lockBanner.style.display = "block";
    lockBanner.textContent = `La Quiniela de la Semana ${semanaActual} está cerrada — el primer partido ya empezó o está por empezar.`;
    saveBar.style.display = "none";
  } else {
    lockBanner.style.display = "none";
    saveBar.style.display = "block";
    document.getElementById("btn-guardar").disabled = true;
  }

  // Cargar picks existentes del usuario para estos partidos
  const picksSnaps = await Promise.all(
    partidosActuales.map((p) => db.collection("pronosticos").doc(`${usuarioActual.uid}_${p.id}`).get())
  );

  partidosActuales.forEach((p, i) => {
    const picksSnap = picksSnaps[i];
    const seleccionInicial = picksSnap.exists ? picksSnap.data().pronostico : null;
    if (seleccionInicial) seleccionesPendientes[p.id] = seleccionInicial;
    cont.appendChild(crearTarjetaPartido(p, bloqueado, seleccionInicial));
  });
}

async function guardarPronosticos() {
  const btn = document.getElementById("btn-guardar");
  const status = document.getElementById("save-status");
  btn.disabled = true;
  status.textContent = "Guardando...";

  try {
    const batch = db.batch();
    Object.entries(seleccionesPendientes).forEach(([partidoId, pronostico]) => {
      const ref = db.collection("pronosticos").doc(`${usuarioActual.uid}_${partidoId}`);
      batch.set(ref, {
        usuarioId: usuarioActual.uid,
        partidoId,
        pronostico,
        autoGenerado: false,
        fechaGuardado: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
    status.textContent = "¡Guardado!";
    setTimeout(() => { status.textContent = ""; }, 2500);
  } catch (err) {
    console.error(err);
    status.textContent = "No se pudo guardar. Intenta de nuevo (¿ya cerró la semana?).";
    btn.disabled = false;
  }
}

requireAuth().then(({ user, datos }) => {
  usuarioActual = user;
  document.getElementById("nav-mount").appendChild(renderNav("quiniela"));

  const userBar = document.getElementById("user-bar");
  const nombreSpan = document.createElement("span");
  nombreSpan.textContent = `${datos.apodo} · `;
  const salirLink = document.createElement("a");
  salirLink.href = "#";
  salirLink.textContent = "Cerrar sesión";
  salirLink.addEventListener("click", (e) => { e.preventDefault(); cerrarSesion(); });
  userBar.appendChild(nombreSpan);
  userBar.appendChild(salirLink);

  poblarSelectorSemanas();
  cargarSemana();

  document.getElementById("btn-guardar").addEventListener("click", guardarPronosticos);
});
