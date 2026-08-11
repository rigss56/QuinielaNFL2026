// Requiere que el HTML ya haya cargado (en orden): firebase-app-compat.js,
// firebase-auth-compat.js, firebase-firestore-compat.js,
// firebase-functions-compat.js, firebase-config.js, auth-guard.js

const functions = firebase.app().functions("us-central1");

// ---------- Tabs ----------
document.querySelectorAll(".admin-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-tabs button").forEach((b) => b.classList.remove("selected"));
    document.querySelectorAll(".admin-panel-section").forEach((s) => s.classList.remove("selected"));
    btn.classList.add("selected");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("selected");
  });
});

// ============================================================
// SOLICITUDES PENDIENTES
// ============================================================
async function cargarSolicitudes() {
  const cont = document.getElementById("solicitudes-container");
  const sinSolicitudes = document.getElementById("sin-solicitudes");
  cont.innerHTML = "";

  const snap = await db.collection("solicitudes").where("estado", "==", "pendiente").get();

  if (snap.empty) {
    sinSolicitudes.style.display = "block";
    return;
  }
  sinSolicitudes.style.display = "none";

  snap.forEach((doc) => {
    const datos = doc.data();
    const row = document.createElement("div");
    row.className = "solicitud-row";
    row.innerHTML = `
      <div class="datos-solicitud">
        <strong>${datos.nombre}</strong> (${datos.apodo})<br />
        ${datos.correo} · ${datos.equipoFavorito}
      </div>
      <div class="acciones">
        <button class="btn-mini aprobar">Aprobar</button>
        <button class="btn-mini rechazar">Rechazar</button>
      </div>
    `;

    const [btnAprobar, btnRechazar] = row.querySelectorAll("button");

    async function resolver(accion) {
      btnAprobar.disabled = true;
      btnRechazar.disabled = true;
      try {
        const resultado = await functions.httpsCallable("panelResolverSolicitud")({
          solicitudId: doc.id,
          accion,
        });
        row.innerHTML = `<div class="datos-solicitud">${resultado.data.mensaje}</div>`;
      } catch (err) {
        console.error(err);
        alert("Hubo un error: " + err.message);
        btnAprobar.disabled = false;
        btnRechazar.disabled = false;
      }
    }

    btnAprobar.addEventListener("click", () => resolver("aprobar"));
    btnRechazar.addEventListener("click", () => resolver("rechazar"));

    cont.appendChild(row);
  });
}

// ============================================================
// CARGAR PARTIDOS
// ============================================================
function poblarSelectSemanas(select) {
  for (let s = 1; s <= 18; s++) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = `Semana ${s}`;
    select.appendChild(opt);
  }
}

function poblarSelectEquipos(select) {
  const vacio = document.createElement("option");
  vacio.value = "";
  vacio.textContent = "Elige un equipo";
  vacio.disabled = true;
  vacio.selected = true;
  select.appendChild(vacio);
  EQUIPOS_NFL.forEach((equipo) => {
    const opt = document.createElement("option");
    opt.value = equipo;
    opt.textContent = equipo;
    select.appendChild(opt);
  });
}

poblarSelectSemanas(document.getElementById("p-semana"));
poblarSelectEquipos(document.getElementById("p-local"));
poblarSelectEquipos(document.getElementById("p-visitante"));
poblarSelectSemanas(document.getElementById("rev-semana"));
poblarSelectSemanas(document.getElementById("res-semana"));
poblarSelectSemanas(document.getElementById("sync-semana"));

document.getElementById("btn-sincronizar").addEventListener("click", async () => {
  const semana = parseInt(document.getElementById("sync-semana").value, 10);
  const btn = document.getElementById("btn-sincronizar");
  const status = document.getElementById("sync-status");

  btn.disabled = true;
  status.textContent = "Consultando ESPN...";

  try {
    const resultado = await functions.httpsCallable("panelSincronizarCalendario")({ semana });
    const { encontrados, agregados, actualizados } = resultado.data;
    status.textContent = `Listo: ${encontrados} partidos encontrados en ESPN — ${agregados} agregados, ${actualizados} con horario actualizado.`;
    cargarPartidosCargados(semana);
    document.getElementById("rev-semana").value = String(semana);
  } catch (err) {
    console.error(err);
    status.textContent = "No se pudo sincronizar: " + err.message;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("form-partido").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = document.getElementById("partido-status");
  const btn = document.getElementById("btn-guardar-partido");

  const semana = parseInt(document.getElementById("p-semana").value, 10);
  const equipoLocal = document.getElementById("p-local").value;
  const equipoVisitante = document.getElementById("p-visitante").value;
  const fechaValue = document.getElementById("p-fecha").value;

  if (!equipoLocal || !equipoVisitante || !fechaValue) {
    status.textContent = "Completa todos los campos.";
    return;
  }
  if (equipoLocal === equipoVisitante) {
    status.textContent = "El equipo Local y Visitante no pueden ser el mismo.";
    return;
  }

  btn.disabled = true;
  status.textContent = "Guardando...";

  try {
    await db.collection("partidos").add({
      semana,
      equipoLocal,
      equipoVisitante,
      fechaHora: firebase.firestore.Timestamp.fromDate(new Date(fechaValue)),
      resultadoFinal: "",
    });
    status.textContent = "¡Partido agregado!";
    document.getElementById("form-partido").reset();
    if (parseInt(document.getElementById("rev-semana").value, 10) === semana) {
      cargarPartidosCargados(semana);
    }
  } catch (err) {
    console.error(err);
    status.textContent = "Hubo un error al guardar. Intenta de nuevo.";
  } finally {
    btn.disabled = false;
  }
});

async function cargarPartidosCargados(semana) {
  const cont = document.getElementById("partidos-cargados-container");
  cont.innerHTML = "Cargando...";
  const snap = await db.collection("partidos").where("semana", "==", semana).orderBy("fechaHora").get();

  if (snap.empty) {
    cont.innerHTML = `<div class="callout">No hay partidos cargados para la Semana ${semana}.</div>`;
    return;
  }

  cont.innerHTML = "";
  snap.forEach((doc) => {
    const p = doc.data();
    const row = document.createElement("div");
    row.className = "resultado-row";
    row.innerHTML = `
      <div>
        <div class="vs">${p.equipoLocal} vs ${p.equipoVisitante}</div>
        <div class="fecha">${p.fechaHora.toDate().toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>
      </div>
      <button class="btn-mini rechazar">Eliminar</button>
    `;
    row.querySelector("button").addEventListener("click", async () => {
      if (!confirm(`¿Eliminar ${p.equipoLocal} vs ${p.equipoVisitante}?`)) return;
      await doc.ref.delete();
      cargarPartidosCargados(semana);
    });
    cont.appendChild(row);
  });
}

document.getElementById("rev-semana").addEventListener("change", (e) => {
  cargarPartidosCargados(parseInt(e.target.value, 10));
});

// ============================================================
// CAPTURAR RESULTADOS
// ============================================================
async function cargarResultados(semana) {
  const cont = document.getElementById("resultados-container");
  const sinResultados = document.getElementById("sin-resultados");
  cont.innerHTML = "";

  const snap = await db.collection("partidos").where("semana", "==", semana).orderBy("fechaHora").get();

  if (snap.empty) {
    sinResultados.style.display = "block";
    return;
  }
  sinResultados.style.display = "none";

  snap.forEach((doc) => {
    const p = doc.data();
    const row = document.createElement("div");
    row.className = "resultado-row";

    const fechaTxt = p.fechaHora.toDate().toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

    if (p.resultadoFinal) {
      row.innerHTML = `
        <div>
          <div class="vs">${p.equipoLocal} vs ${p.equipoVisitante}</div>
          <div class="fecha">${fechaTxt}</div>
        </div>
        <div class="matchup-picker">
          <button class="selected" disabled>${p.resultadoFinal}</button>
        </div>
      `;
    } else {
      row.innerHTML = `
        <div>
          <div class="vs">${p.equipoLocal} vs ${p.equipoVisitante}</div>
          <div class="fecha">${fechaTxt}</div>
        </div>
        <div class="matchup-picker">
          <button data-opcion="L">L</button>
          <button data-opcion="E">E</button>
          <button data-opcion="V">V</button>
        </div>
      `;
      row.querySelectorAll(".matchup-picker button").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm(`¿Confirmar resultado ${btn.dataset.opcion} para ${p.equipoLocal} vs ${p.equipoVisitante}? Esto calcula los puntos de todos y no se puede deshacer desde aquí.`)) return;
          row.querySelectorAll("button").forEach((b) => (b.disabled = true));
          await doc.ref.update({ resultadoFinal: btn.dataset.opcion });
          cargarResultados(semana);
        });
      });
    }

    cont.appendChild(row);
  });
}

document.getElementById("res-semana").addEventListener("change", (e) => {
  cargarResultados(parseInt(e.target.value, 10));
});

document.getElementById("btn-descargar-resultados").addEventListener("click", async () => {
  const semana = parseInt(document.getElementById("res-semana").value, 10);
  const btn = document.getElementById("btn-descargar-resultados");
  const status = document.getElementById("resultados-sync-status");

  btn.disabled = true;
  status.textContent = "Consultando ESPN...";

  try {
    const resultado = await functions.httpsCallable("panelSincronizarResultados")({ semana });
    const { revisados, calificados } = resultado.data;
    status.textContent = calificados > 0
      ? `Listo: ${calificados} de ${revisados} partidos terminados se calificaron solos.`
      : `Revisados ${revisados} partidos — ninguno nuevo por calificar todavía.`;
    cargarResultados(semana);
  } catch (err) {
    console.error(err);
    status.textContent = "No se pudo consultar: " + err.message;
  } finally {
    btn.disabled = false;
  }
});

// ============================================================
// INIT
// ============================================================
requireAdmin().then(({ datos }) => {
  const userBar = document.getElementById("user-bar");
  const nombreSpan = document.createElement("span");
  nombreSpan.textContent = `${datos.apodo} (admin) · `;
  const salirLink = document.createElement("a");
  salirLink.href = "#";
  salirLink.textContent = "Cerrar sesión";
  salirLink.addEventListener("click", (e) => { e.preventDefault(); cerrarSesion(); });
  userBar.appendChild(nombreSpan);
  userBar.appendChild(salirLink);

  cargarSolicitudes();
  cargarPartidosCargados(1);
  cargarResultados(1);
});
