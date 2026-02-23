/* pages/admin/perfil-admin.js */

(function () {
  const form = document.getElementById("fChangePass");
  const msg = document.getElementById("msgPass");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";

    const p1 = form.password.value;
    const p2 = form.confirmPassword.value;

    if (p1 !== p2) {
      msg.textContent = "As passwords não coincidem.";
      msg.style.color = "#dc2626";
      return;
    }

    try {
      msg.textContent = "A atualizar...";
      msg.style.color = "var(--text-soft)";

      const { data, error } = await supabase.auth.updateUser({
        password: p1,
      });

      if (error) throw error;

      msg.textContent = "Password atualizada com sucesso!";
      msg.style.color = "#16a34a";
      form.reset();
    } catch (err) {
      console.error(err);
      msg.textContent = "Erro: " + (err.message || "Falha ao atualizar.");
      msg.style.color = "#dc2626";
    }
  });
})();
