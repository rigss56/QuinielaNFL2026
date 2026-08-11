// Requiere que el HTML ya haya cargado (en orden): firebase-app-compat.js,
// firebase-auth-compat.js, firebase-firestore-compat.js, firebase-config.js,
// auth-guard.js, nav.js

async function cargarTabla(uidActual) {
  const cont = document.getElementById("tabla-container");
  const sinDatos = document.getElementById("sin-datos");
  cont.innerHTML = "";

  const snap = await db.collection("tabla").orderBy("puntosTotales", "desc").get();

  if (snap.empty) {
    sinDatos.style.display = "block";
    return;
  }
  sinDatos.style.display = "none";

  const tabla = document.createElement("table");
  tabla.className = "ranking";
  tabla.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Participante</th>
        <th style="text-align:right;">Puntos</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = tabla.querySelector("tbody");

  snap.docs.forEach((doc, i) => {
    const datos = doc.data();
    const tr = document.createElement("tr");
    if (i === 0) tr.className = "top1";
    if (doc.id === uidActual) tr.style.outline = "1px solid var(--gold)";
    tr.innerHTML = `
      <td class="pos">${i + 1}</td>
      <td>
        <div class="apodo">${datos.apodo}</div>
        <div class="equipo">${datos.equipoFavorito || ""}</div>
      </td>
      <td class="puntos">${datos.puntosTotales || 0}</td>
    `;
    tbody.appendChild(tr);
  });

  cont.appendChild(tabla);
}

requireAuth().then(({ user, datos }) => {
  document.getElementById("nav-mount").appendChild(renderNav("tabla"));

  const userBar = document.getElementById("user-bar");
  const nombreSpan = document.createElement("span");
  nombreSpan.textContent = `${datos.apodo} · `;
  const salirLink = document.createElement("a");
  salirLink.href = "#";
  salirLink.textContent = "Cerrar sesión";
  salirLink.addEventListener("click", (e) => { e.preventDefault(); cerrarSesion(); });
  userBar.appendChild(nombreSpan);
  userBar.appendChild(salirLink);

  cargarTabla(user.uid);
});
