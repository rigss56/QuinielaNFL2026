// ============================================================
// QUINIELA NFL 2026 — Guardia de autenticación (versión compat)
// Requiere que en el <head>/<body> del HTML ya se hayan cargado,
// en este orden:
//   firebase-app-compat.js, firebase-auth-compat.js,
//   firebase-firestore-compat.js, firebase-config.js
// ============================================================

const _app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Prefijo relativo hacia la raíz del sitio (las páginas privadas viven en /app y /admin)
const RAIZ = "../";

/**
 * Protege una página privada. Uso:
 *   requireAuth().then(({ user, datos }) => { ... });
 * Si no hay sesión, redirige a login. Si la contraseña sigue siendo temporal,
 * redirige a cambiar-password.html (salvo que la página actual ya sea esa).
 */
function requireAuth(opts) {
  const allowPasswordTemporal = (opts && opts.allowPasswordTemporal) || false;
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = `${RAIZ}login.html`;
        return;
      }

      const snap = await db.collection("usuarios").doc(user.uid).get();
      if (!snap.exists) {
        await auth.signOut();
        window.location.href = `${RAIZ}login.html`;
        return;
      }

      const datos = snap.data();

      if (datos.passwordTemporal && !allowPasswordTemporal) {
        window.location.href = `${RAIZ}app/cambiar-password.html`;
        return;
      }

      if (!datos.passwordTemporal && allowPasswordTemporal) {
        window.location.href = `${RAIZ}app/quiniela.html`;
        return;
      }

      resolve({ user, datos });
    });
  });
}

function requireAdmin() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = `${RAIZ}login.html`;
        return;
      }
      const snap = await db.collection("usuarios").doc(user.uid).get();
      if (!snap.exists || snap.data().rol !== "admin") {
        window.location.href = `${RAIZ}app/quiniela.html`;
        return;
      }
      resolve({ user, datos: snap.data() });
    });
  });
}

function cerrarSesion() {
  return auth.signOut().then(() => {
    window.location.href = `${RAIZ}login.html`;
  });
}
