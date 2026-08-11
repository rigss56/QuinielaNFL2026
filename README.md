# Quiniela NFL 2026 — Fases 1 + 2 + 3

Estructura base del sitio, identidad visual, la página pública de Registro/
Instrucciones, las Cloud Functions que automatizan los 3 correos, y ahora
también el cambio de contraseña obligatorio en el primer ingreso — con las
páginas privadas ya protegidas por sesión.

## Qué incluye esta entrega

- `index.html` — página pública (Registro + Instrucciones + Reglamento). Es lo
  único que se comparte antes de la aprobación. Ahora escribe en la colección
  `solicitudes` (no en `usuarios` — ver nota del modelo de datos abajo).
- `login.html` — inicio de sesión + restablecimiento de contraseña automático.
- `app/quiniela.html`, `app/tabla.html`, `app/premios.html` — stubs de las
  páginas privadas (se completan en Fases 4 y 5).
- `admin/panel.html` — stub del panel de administrador (se completa en Fase 6).
- `css/styles.css` — sistema de diseño completo del proyecto.
- `js/firebase-config.js` — **aquí van tus llaves de Firebase**.
- `firestore.rules` — reglas de seguridad, ya actualizadas a dos colecciones.
- `firebase.json` — configuración para desplegar Functions y Firestore rules.
- `functions/` — las 2 Cloud Functions de la Fase 2 (ver sección dedicada abajo).
- `js/auth-guard.js` — protege las páginas privadas: exige sesión activa y,
  si la contraseña sigue siendo temporal, redirige a cambiar-password antes
  de dejar pasar a nadie. También expone `requireAdmin()` para el panel.
- `app/cambiar-password.html` — pantalla obligatoria de cambio de contraseña
  en el primer ingreso.

## Cambio en el modelo de datos (importante)

La inscripción pública ya **no** escribe directamente en `usuarios`, porque el
ID de ese documento debe coincidir con el UID de Firebase Auth — y ese UID no
existe todavía cuando alguien apenas se está registrando. Ahora el flujo es:

1. El formulario público crea un documento en **`solicitudes/{id autogenerado}`** con `estado: "pendiente"`.
2. La función `onNuevaInscripcion` avisa por correo a los 3 administradores con botones **Aprobar** / **Rechazar**.
3. Al dar clic en **Aprobar**, la función `resolverInscripcion`: crea la cuenta en Firebase Auth, crea el documento definitivo en **`usuarios/{uid}`**, marca la solicitud como `aprobado`, y le envía al participante su usuario + contraseña temporal.
4. Al dar clic en **Rechazar**, solo se marca la solicitud como `rechazado` y se le avisa al participante.

## Paso a paso para dejarlo funcionando

### 1. Crear el proyecto de Firebase
1. Ve a [console.firebase.google.com](https://console.firebase.google.com) y crea un proyecto (ej. `quiniela-nfl-2026`).
2. Cambia el plan a **Blaze** (pago por uso) — es necesario para usar Cloud Functions. Firebase tiene una capa gratuita amplia; con 40 usuarios el costo mensual real debería ser mínimo o nulo.
3. En **Authentication** → Sign-in method, activa **Correo electrónico/contraseña**.
4. En **Firestore Database**, crea la base de datos en modo producción.
5. En **Reglas** de Firestore, pega el contenido de `firestore.rules`.

### 2. Conectar tu app web
1. En **Configuración del proyecto** → **Tus apps**, agrega una app Web.
2. Copia el objeto `firebaseConfig` que te da Firebase.
3. Pégalo en `js/firebase-config.js`, reemplazando los valores `"TU_..."`.
   (Estas llaves no son secretas — la seguridad la dan las reglas de Firestore.)

### 3. Abrir el sitio

Ya no necesitas servidor local: el sitio usa la versión "compat" de Firebase,
así que puedes abrir `index.html` con doble clic directo desde tu explorador
de archivos y va a funcionar (siempre que ya hayas hecho los pasos 1 y 2).

Si prefieres probarlo servido (opcional, no ya no es necesario):
```bash
cd site
python3 -m http.server 8000
```

### 4. Publicar en GitHub Pages
1. Crea un repositorio en GitHub y sube el contenido de esta carpeta (`site/`) a la raíz del repo (o a una carpeta `/docs`, ajustando la configuración de Pages).
2. En el repo: **Settings** → **Pages** → selecciona la rama y carpeta donde subiste los archivos.
3. En unos minutos tu sitio queda publicado en `https://tu-usuario.github.io/tu-repo/`.
4. Ese es el único link que se comparte al inicio (apunta a `index.html`).

### 5. Desplegar las Cloud Functions (Fase 2)

1. Instala las herramientas de Firebase (una sola vez en tu computadora):
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
2. Dentro de la carpeta `site/`, conecta el proyecto:
   ```bash
   firebase use --add
   ```
   y selecciona el proyecto de Firebase que creaste en el paso 1.
3. Crea una cuenta gratuita en [SendGrid](https://sendgrid.com) (o [Resend](https://resend.com), avísame si prefieres ese y te adapto el código), verifica un remitente (Single Sender es suficiente para empezar) y genera un API Key.
4. Configura los 2 valores secretos (nunca se guardan en el código):
   ```bash
   firebase functions:secrets:set SENDGRID_API_KEY
   firebase functions:secrets:set APPROVAL_SECRET
   ```
   Para `APPROVAL_SECRET` pega cualquier cadena larga y aleatoria (por ejemplo generada con `openssl rand -hex 32`) — es lo que protege los links de Aprobar/Rechazar del correo para que nadie más pueda usarlos.
5. Copia `functions/.env.example` a `functions/.env` y llena `FROM_EMAIL` (el remitente que verificaste en SendGrid) y `APP_BASE_URL` (la URL de tu GitHub Pages del paso 4).
6. Instala dependencias y despliega:
   ```bash
   cd functions
   npm install
   cd ..
   firebase deploy --only functions,firestore:rules
   ```
7. Prueba: llena el formulario de `index.html` con un correo tuyo. Debe llegarte el correo de "Nueva inscripción" a los 3 administradores con los botones de Aprobar/Rechazar. Al dar clic en Aprobar, en segundos debe llegar el correo con usuario y contraseña temporal al correo del participante.

## Cómo funciona el cambio de contraseña obligatorio (Fase 3)

1. Al aprobarse, cada participante recibe una contraseña temporal (Fase 2).
2. En `login.html`, tras iniciar sesión, el sistema revisa el campo
   `passwordTemporal` en `usuarios/{uid}`. Si es `true`, redirige a
   `app/cambiar-password.html` en vez de al dashboard.
3. Esa pantalla exige una nueva contraseña (mínimo 8 caracteres, dos veces
   para confirmar), la actualiza en Firebase Auth, y pone `passwordTemporal: false`.
4. **Todas** las páginas privadas (`app/quiniela.html`, `app/tabla.html`,
   `app/premios.html`, `admin/panel.html`) están protegidas por
   `js/auth-guard.js`: si alguien intenta entrar directo por la URL sin haber
   iniciado sesión, lo manda a `login.html`; si su contraseña sigue siendo
   temporal, lo manda primero a cambiar-password, sin excepción.

## Qué falta (próximas fases, según el roadmap del documento de especificación)

- **Fase 4:** Integración del calendario NFL (API + edición manual en Admin) y la pantalla real de captura de pronósticos con bloqueo automático por horario.
- **Fase 5:** Cálculo de puntos, Tabla General y Premios con datos reales de Firestore.
- **Fase 6:** Panel de Administrador completo (lista de solicitudes pendientes, edición de resultados y calendario, gestión de usuarios).
- **Fase 7:** Pruebas con datos reales de Semana 1 y publicación final.

## Nota sobre correos automáticos

El restablecimiento de contraseña (`login.html`) usa el envío de correo
integrado de Firebase Auth — no depende de las Cloud Functions ni de
SendGrid, así que ya funciona en cuanto conectes tu Firebase (Fase 1). Los
otros dos correos (aviso de inscripción y credenciales temporales) sí
requieren que despliegues las Cloud Functions de esta Fase 2.
