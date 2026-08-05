$(function () {
  const API = window.DYLAN_API_URL || "http://localhost:3001/api";
  const AUTH_KEY = "dylanstudio_admin_token";

  $("#year").text(new Date().getFullYear());

  $("#loginForm").on("submit", async function (event) {
    event.preventDefault();

    const user = $("#user").val().trim();
    const password = $("#pass").val();
    const $note = $("#loginNote");

    if (!user || !password) {
      $note.text("Escribe el usuario y la contraseña.");
      return;
    }

    $note.text("Verificando acceso...");

    try {
      const response = await fetch(`${API}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.token) {
        throw new Error(data.error || "No se pudo iniciar sesión.");
      }

      sessionStorage.setItem(AUTH_KEY, data.token);
      window.location.href = "panel.html";
    } catch (error) {
      sessionStorage.removeItem(AUTH_KEY);
      $note.text(error.message);
    }
  });
});
