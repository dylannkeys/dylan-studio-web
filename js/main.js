(function () {
  const API = window.DYLAN_API_URL || "http://localhost:3001/api";

  // ====== Año en footer ======
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ====== Header glass al scroll ======
  const header = document.querySelector(".site-header");
  const setHeaderState = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 10);
  };
  setHeaderState();
  window.addEventListener("scroll", setHeaderState, { passive: true });

  // ====== Menú móvil (hamburguesa) ======
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");

  const closeNav = () => {
    if (!nav || !toggle) return;
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const openNav = () => {
    if (!nav || !toggle) return;
    nav.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
  };

  if (toggle && nav) {
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = nav.classList.contains("open");
      if (isOpen) closeNav();
      else openNav();
    });

    // Cierra tocando/clic fuera
    document.addEventListener("click", (e) => {
      if (!nav.classList.contains("open")) return;
      const clickedInside = nav.contains(e.target) || toggle.contains(e.target);
      if (!clickedInside) closeNav();
    });

    // Cierra al cambiar tamaño (si vuelve a desktop)
    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) closeNav();
    });

    // Cierra nav al navegar (móvil)
    document.querySelectorAll(".site-nav a").forEach((a) => {
      a.addEventListener("click", () => closeNav());
    });
  }

  // ====== Dropdown (móvil: tap) ======
  const dropdownItems = document.querySelectorAll(".has-dropdown");
  dropdownItems.forEach((item) => {
    const btn = item.querySelector(".dropdown-toggle");
    if (!btn) return;

    btn.addEventListener("click", (e) => {
      const isMobile = window.matchMedia("(max-width: 760px)").matches;
      if (!isMobile) return; // desktop se maneja por CSS (hover)

      e.preventDefault();
      e.stopPropagation();

      const isOpen = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(isOpen));

      dropdownItems.forEach((other) => {
        if (other !== item) {
          other.classList.remove("open");
          const otherBtn = other.querySelector(".dropdown-toggle");
          if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
        }
      });
    });
  });

  // ====== Swap móvil "pasar dedo" (touchmove) + hover desktop ======
  const tiles = document.querySelectorAll("[data-swap-tile]");
  tiles.forEach((tile) => {
    const on = () => tile.classList.add("is-hover");
    const off = () => tile.classList.remove("is-hover");

    tile.addEventListener("touchmove", on, { passive: true });
    tile.addEventListener("touchend", off, { passive: true });
    tile.addEventListener("touchcancel", off, { passive: true });

    tile.addEventListener("pointerenter", on);
    tile.addEventListener("pointerleave", off);
  });

  // =========================
  // FORM LEADS (POST REAL a SQL Server)
  // =========================
  const form = document.getElementById("leadForm");
  if (!form) return;

  const note = document.getElementById("leadNote");
  const fieldLimits = {
    nombre: { minLength: 2, maxLength: 100 },
    apellido: { minLength: 2, maxLength: 100 },
    empresa: { maxLength: 150 },
    email: { maxLength: 150 },
    asunto: { minLength: 5, maxLength: 150 },
    mensaje: { minLength: 10, maxLength: 2000 }
  };

  Object.entries(fieldLimits).forEach(([id, limits]) => {
    const input = document.getElementById(id);
    if (!input) return;
    Object.entries(limits).forEach(([name, value]) => input.setAttribute(name, String(value)));
  });

  const setErr = (name, msg) => {
    const el = document.querySelector(`[data-err-for="${name}"]`);
    if (el) el.textContent = msg || "";
  };

  const getVal = (id) => (document.getElementById(id)?.value || "").trim();
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  function validate() {
    let ok = true;

    const nombre = getVal("nombre");
    const apellido = getVal("apellido");
    const email = getVal("email");
    const servicio = getVal("servicio"); // debe ser "1-4"
    const asunto = getVal("asunto");
    const mensaje = getVal("mensaje");

    ["nombre", "apellido", "email", "servicio", "asunto", "mensaje"].forEach((k) => setErr(k, ""));

    if (nombre.length < 2 || nombre.length > 100) {
      setErr("nombre", "Escribe entre 2 y 100 caracteres."); ok = false;
    }
    if (apellido.length < 2 || apellido.length > 100) {
      setErr("apellido", "Escribe entre 2 y 100 caracteres."); ok = false;
    }

    if (!email) { setErr("email", "Escribe tu email."); ok = false; }
    else if (!isEmail(email)) { setErr("email", "Email no válido."); ok = false; }

    if (!servicio) { setErr("servicio", "Selecciona un servicio."); ok = false; }

    if (asunto.length < 5 || asunto.length > 150) {
      setErr("asunto", "Escribe entre 5 y 150 caracteres."); ok = false;
    }

    if (mensaje.length < 10 || mensaje.length > 2000) {
      setErr("mensaje", "Escribe entre 10 y 2000 caracteres.");
      ok = false;
    }

    return ok;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (note) note.textContent = "";

    if (!validate()) {
      if (note) note.textContent = "Revisa los campos marcados.";
      return;
    }

    // Importante: servicio debe ser numérico (1..4)
    const payload = {
      nombre: getVal("nombre"),
      apellido: getVal("apellido"),
      empresa: getVal("empresa"),
      email: getVal("email"),
      id_servicio: Number(getVal("servicio")),
      asunto: getVal("asunto"),
      mensaje: getVal("mensaje")
    };

    try {
      if (note) note.textContent = "Enviando...";

      const r = await fetch(`${API}/solicitudes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await r.json().catch(() => ({}));
      if (data.fields) {
        Object.entries(data.fields).forEach(([field, message]) => setErr(field, message));
      }
      if (!r.ok) throw new Error(data.error || `Error HTTP ${r.status}`);

      // Solo resetea si fue OK
      form.reset();
      if (note) note.textContent = `Enviado correctamente. ID: ${data.id_solicitud}`;
    } catch (err) {
      if (note) note.textContent = `No se pudo enviar: ${err.message}`;
      console.error(err);
    }
  });
})();
