// ============================================================
// QUINIELA NFL 2026 — Configuración de Firebase
// ------------------------------------------------------------
// 1. Ve a https://console.firebase.google.com y crea un proyecto
//    (o usa uno existente).
// 2. En "Configuración del proyecto" > "General" > "Tus apps",
//    crea una app Web y copia aquí los valores de firebaseConfig.
// 3. Activa en el proyecto: Authentication (Correo/contraseña) y
//    Cloud Firestore (modo producción, con las reglas de
//    /firestore.rules de este proyecto).
// 4. Este archivo es seguro de exponer en el frontend: las
//    llaves de Firebase para apps web NO son secretas, la
//    seguridad real la dan las Reglas de Firestore/Auth.
//
// Este archivo usa variables globales normales (sin import/export)
// para que el sitio funcione abriendo los .html con doble clic,
// sin necesidad de un servidor local.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyC0-MEes-Ulq_GoWNM_ZO9gd7aO1Oq-yWU",
  authDomain: "quiniela-2026-5356e.firebaseapp.com",
  projectId: "quiniela-2026-5356e",
  storageBucket: "quiniela-2026-5356e.firebasestorage.app",
  messagingSenderId: "758736766040",
  appId: "1:758736766040:web:4f0e730926841b3033f62d",
};

// Lista de los 32 equipos de la NFL, usada en el formulario de registro
const EQUIPOS_NFL = [
  "Arizona Cardinals", "Atlanta Falcons", "Baltimore Ravens", "Buffalo Bills",
  "Carolina Panthers", "Chicago Bears", "Cincinnati Bengals", "Cleveland Browns",
  "Dallas Cowboys", "Denver Broncos", "Detroit Lions", "Green Bay Packers",
  "Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Kansas City Chiefs",
  "Las Vegas Raiders", "Los Angeles Chargers", "Los Angeles Rams", "Miami Dolphins",
  "Minnesota Vikings", "New England Patriots", "New Orleans Saints", "New York Giants",
  "New York Jets", "Philadelphia Eagles", "Pittsburgh Steelers", "San Francisco 49ers",
  "Seattle Seahawks", "Tampa Bay Buccaneers", "Tennessee Titans", "Washington Commanders",
];

// Costo de inscripción y fecha límite (usados en el frontend para mostrar info dinámica)
const COSTO_INSCRIPCION = 1750;
const FECHA_LIMITE_INSCRIPCION = new Date("2026-09-08T20:00:00-06:00");
const PREMIO_SEMANAL = 1000;
