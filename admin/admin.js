/* Admin CRUD REAL (API + SQL Server) */
(function () {
  const API = window.DYLAN_API_URL || "http://localhost:3001/api";
  const AUTH_KEY = "dylanstudio_admin_token";

  const escapeHtml = (str) =>
    (str || "").toString().replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));

  const opt = (val, current) => {
    const sel = val === current ? "selected" : "";
    return `<option value="${val}" ${sel}>${val}</option>`;
  };

  const guard = () => {
    const token = sessionStorage.getItem(AUTH_KEY);
    if (!token) {
      window.location.href = "login.html";
      return false;
    }
    return true;
  };

  const logout = async () => {
    const token = sessionStorage.getItem(AUTH_KEY);
    if (token) {
      await fetch(`${API}/admin/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
    sessionStorage.removeItem(AUTH_KEY);
    window.location.href = "login.html";
  };

  async function adminFetch(url, options = {}) {
    const token = sessionStorage.getItem(AUTH_KEY);
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token || ""}`
    };
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      sessionStorage.removeItem(AUTH_KEY);
      window.location.href = "login.html";
      throw new Error("La sesión expiró.");
    }

    return response;
  }

  async function apiGetSolicitudes() {
    const qEl = document.getElementById("q");
    const stEl = document.getElementById("status");

    const q = qEl ? (qEl.value || "").trim() : "";
    const estado = stEl ? (stEl.value || "") : "";

    const url = new URL(`${API}/solicitudes`);
    if (q) url.searchParams.set("q", q);
    if (estado) url.searchParams.set("estado", estado);

    const r = await adminFetch(url.toString());
    const data = await r.json().catch(() => ([]));
    if (!r.ok) throw new Error(data.error || "Error cargando solicitudes");
    return data;
  }

  async function apiUpdateEstado(id, estado) {
    const r = await adminFetch(`${API}/solicitudes/${id}/estado`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Error actualizando estado");
  }

  async function apiDelete(id) {
    const r = await adminFetch(`${API}/solicitudes/${id}`, { method: "DELETE" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Error eliminando");
  }

  async function render() {
    const $rows = $("#rows");
    $rows.empty();
    $rows.append(`<tr><td colspan="8" style="padding:14px;color:#666;">Cargando...</td></tr>`);

    let items;
    try {
      items = await apiGetSolicitudes();
    } catch (e) {
      $rows.empty();
      $rows.append(`<tr><td colspan="8" style="padding:14px;color:#666;">${escapeHtml(e.message)}</td></tr>`);
      return;
    }

    $rows.empty();

    if (!items.length) {
      $rows.append(`<tr><td colspan="8" style="padding:14px;color:#666;">No hay solicitudes.</td></tr>`);
      return;
    }

    for (const x of items) {
      $rows.append(`
        <tr>
          <td>${x.id_solicitud}</td>
          <td>${escapeHtml(x.fecha)}</td>
          <td>${escapeHtml(`${x.nombre} ${x.apellido}`)}</td>
          <td>${escapeHtml(x.email)}</td>
          <td>${escapeHtml(x.servicio)}</td>
          <td>${escapeHtml(x.asunto)}</td>
          <td>
            <select class="row-status" data-id="${x.id_solicitud}">
              ${opt("nuevo", x.estado)}
              ${opt("en proceso", x.estado)}
              ${opt("cerrado", x.estado)}
            </select>
          </td>
          <td>
            <button class="row-view btn btn-secondary" data-json='${escapeHtml(JSON.stringify(x))}' type="button">Ver</button>
            <button class="row-del btn btn-secondary" data-id="${x.id_solicitud}" type="button">Eliminar</button>
          </td>
        </tr>
      `);
    }

  }

  function viewFromButton(btn) {
    const raw = $(btn).attr("data-json");
    if (!raw) return;
    const x = JSON.parse(raw);

    alert(
      `Solicitud #${x.id_solicitud}\n\n` +
      `Fecha: ${x.fecha}\n` +
      `Cliente: ${x.nombre} ${x.apellido}\n` +
      `Empresa: ${x.empresa || "-"}\n` +
      `Email: ${x.email}\n` +
      `Servicio: ${x.servicio}\n` +
      `Asunto: ${x.asunto}\n\n` +
      `Mensaje:\n${x.mensaje}\n\n` +
      `Estado: ${x.estado}`
    );
  }

  $(function () {
    if (!guard()) return;
    render();

    $("#q, #status").on("input change", function () {
      clearTimeout(window.__t);
      window.__t = setTimeout(render, 180);
    });

    $("#btnLogout").on("click", logout);

    $(document).on("change", ".row-status", async function () {
      const id = Number($(this).data("id"));
      const estado = $(this).val();
      try {
        await apiUpdateEstado(id, estado);
        await render();
      } catch (e) {
        alert(e.message);
        await render();
      }
    });

    $(document).on("click", ".row-del", async function () {
      const id = Number($(this).data("id"));
      if (!confirm("¿Eliminar esta solicitud?")) return;
      try {
        await apiDelete(id);
        await render();
      } catch (e) {
        alert(e.message);
      }
    });

    $(document).on("click", ".row-view", function () {
      viewFromButton(this);
    });
  });
})();
