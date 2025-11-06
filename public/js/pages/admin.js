(async () => {
  const supa = window.supabase;
  const el = (sel) => document.querySelector(sel);

  const ui = {
    login: el("#adminLogin"),
    panel: el("#adminPanel"),
    msgAdmin: el("#msgAdmin"),
    fAdminLogin: el("#fAdminLogin"),
    fNewExpl: el("#fNewExpl"),
    msgNew: el("#msgNew"),
    tblBody: el("#tblExpl tbody"),
  };

  // 1) login admin
  ui.fAdminLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();
    ui.msgAdmin.textContent = "";
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    const { error } = await supa.auth.signInWithPassword({ email, password });
    if (error) return (ui.msgAdmin.textContent = error.message);
    await guardAdminAndLoad();
  });

  // 2) autorizar admin e carregar lista
  async function guardAdminAndLoad() {
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user) return;
    const { data: roleRow, error } = await supa
      .from("app_users")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (error || roleRow?.role !== "admin")
      return (ui.msgAdmin.textContent = "Acesso restrito a administradores.");
    ui.login.style.display = "none";
    ui.panel.style.display = "block";
    await loadExpl();
  }

  // 3) listar explicadores
  async function loadExpl() {
    const { data, error } = await supa
      .from("explicadores")
      .select("id_explicador,nome,email,contacto,user_id");
    if (error) {
      console.error(error);
      return;
    }
    ui.tblBody.innerHTML = "";
    (data || []).forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.nome}</td>
        <td>${row.email}</td>
        <td>${row.contacto ?? ""}</td>
        <td style="text-align:right">
          <button class="button" data-user="${
            row.user_id || ""
          }" style="background:#fff;color:#a92a1f;">Eliminar</button>
        </td>`;
      ui.tblBody.appendChild(tr);
    });
  }

  // 4) criar explicador (via Edge Function)
  ui.fNewExpl?.addEventListener("submit", async (e) => {
    e.preventDefault();
    ui.msgNew.textContent = "";
    const payload = {
      nome: e.target.nome.value.trim(),
      contacto: e.target.contacto.value.trim() || null,
      email: e.target.email.value.trim(),
      password: e.target.password.value,
    };
    const { data, error } = await supa.functions.invoke(
      "admin-create-explicador",
      { body: payload }
    );
    if (error) return (ui.msgNew.textContent = error.message);
    ui.msgNew.style.color = "#d3ffe5";
    ui.msgNew.textContent = "Explicador criado.";
    e.target.reset();
    loadExpl();
  });

  // 5) eliminar explicador (via Edge Function)
  el("#tblExpl")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-user]");
    if (!btn) return;
    const user_id = btn.getAttribute("data-user");
    if (!user_id)
      return alert(
        "Este explicador não tem user_id guardado (adiciona a coluna user_id em explicadores)."
      );
    if (!confirm("Eliminar este explicador e a sua conta?")) return;
    const { error } = await supa.functions.invoke("admin-delete-explicador", {
      body: { user_id },
    });
    if (error) return alert(error.message);
    loadExpl();
  });

  // sessão existente?
  guardAdminAndLoad();
})();
