// Requiere que el HTML ya haya cargado (en orden): firebase-app-compat.js,
// firebase-auth-compat.js, firebase-firestore-compat.js, firebase-config.js,
// auth-guard.js

const form = document.getElementById("form-cambiar");
const statusBox = document.getElementById("form-status");
const submitBtn = document.getElementById("submit-btn");
const saludo = document.getElementById("saludo");

// Permite estar en esta página aunque passwordTemporal siga en true
// (es justo el propósito de esta pantalla).
requireAuth({ allowPasswordTemporal: true }).then(({ user, datos }) => {
  saludo.textContent = `Hola ${datos.nombre.split(" ")[0]}, entraste con una contraseña temporal. Antes de continuar, define la que vas a usar el resto de la temporada.`;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusBox.className = "";

    const p1 = document.getElementById("password1").value;
    const p2 = document.getElementById("password2").value;

    if (p1.length < 8) {
      statusBox.className = "err";
      statusBox.textContent = "La contraseña debe tener al menos 8 caracteres.";
      return;
    }
    if (p1 !== p2) {
      statusBox.className = "err";
      statusBox.textContent = "Las dos contraseñas no coinciden.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    try {
      await user.updatePassword(p1);
      await db.collection("usuarios").doc(user.uid).update({ passwordTemporal: false });

      statusBox.className = "ok";
      statusBox.textContent = "¡Listo! Entrando a la Quiniela...";
      setTimeout(() => {
        window.location.href = "quiniela.html";
      }, 900);
    } catch (err) {
      console.error(err);
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar y entrar a la Quiniela";
      statusBox.className = "err";
      if (err.code === "auth/requires-recent-login") {
        statusBox.textContent = "Por seguridad, vuelve a iniciar sesión con tu contraseña temporal e inténtalo de nuevo.";
      } else {
        statusBox.textContent = "No se pudo guardar tu contraseña. Intenta de nuevo.";
      }
    }
  });
});
