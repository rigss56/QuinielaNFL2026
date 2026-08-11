// Requiere que el HTML ya haya cargado (en orden): firebase-app-compat.js,
// firebase-auth-compat.js, firebase-firestore-compat.js, firebase-config.js

const _app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const form = document.getElementById("form-login");
const statusBox = document.getElementById("form-status");
const loginBtn = document.getElementById("login-btn");
const linkReset = document.getElementById("link-reset");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusBox.className = "";
  const correo = document.getElementById("correo").value.trim().toLowerCase();
  const password = document.getElementById("password").value;

  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando...";

  try {
    const cred = await auth.signInWithEmailAndPassword(correo, password);

    const snap = await db.collection("usuarios").doc(cred.user.uid).get();
    if (!snap.exists) {
      statusBox.className = "err";
      statusBox.textContent = "Tu cuenta no está vinculada a ningún participante. Contacta a un administrador.";
      return;
    }

    if (snap.data().passwordTemporal) {
      window.location.href = "app/cambiar-password.html";
    } else {
      window.location.href = "app/quiniela.html";
    }
  } catch (err) {
    statusBox.className = "err";
    statusBox.textContent = "Correo o contraseña incorrectos. Si acabas de ser aprobado, revisa el correo con tu contraseña temporal.";
    console.error(err);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";
  }
});

linkReset.addEventListener("click", async (e) => {
  e.preventDefault();
  const correo = document.getElementById("correo").value.trim().toLowerCase();
  statusBox.className = "";

  if (!correo) {
    statusBox.className = "err";
    statusBox.textContent = "Escribe tu correo arriba y vuelve a dar clic en \"¿Olvidaste tu contraseña?\".";
    return;
  }

  try {
    await auth.sendPasswordResetEmail(correo);
    statusBox.className = "ok";
    statusBox.textContent = `Te enviamos un correo a ${correo} con instrucciones para restablecer tu contraseña.`;
  } catch (err) {
    statusBox.className = "err";
    statusBox.textContent = "No pudimos enviar el correo de restablecimiento. Verifica que el correo esté registrado.";
    console.error(err);
  }
});
