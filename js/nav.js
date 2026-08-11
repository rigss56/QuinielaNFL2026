function renderNav(activo) {
  const items = [
    { id: "quiniela", label: "Quiniela", href: "quiniela.html" },
    { id: "tabla", label: "Tabla General", href: "tabla.html" },
    { id: "premios", label: "Premios", href: "premios.html" },
  ];

  const nav = document.createElement("nav");
  nav.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin:24px 0 0;";

  items.forEach((it) => {
    const a = document.createElement("a");
    a.href = it.href;
    a.textContent = it.label;
    const isActive = it.id === activo;
    a.style.cssText = `
      font-family: var(--font-display);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 13px;
      padding: 10px 16px;
      border-radius: 7px 7px 0 0;
      text-decoration: none;
      color: #ffffff;
      background: ${isActive ? "#d50a0a" : "transparent"};
      border: 1px solid rgba(255,255,255,0.14);
      border-bottom: ${isActive ? "1px solid #d50a0a" : "1px solid rgba(255,255,255,0.14)"};
    `;
    nav.appendChild(a);
  });

  return nav;
}
