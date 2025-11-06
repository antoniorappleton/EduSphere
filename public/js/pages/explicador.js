(async () => {
  const supa = window.supabase;
  const el = (sel) => document.querySelector(sel);

  const ui = {
    login: el("#explLogin"),
    panel: el("#explPanel"),
    msgLogin: el("#msgExplLogin"),
    fLogin: el("#fExplLogin"),
    fNew: el("#fNewAluno"),
    msgNew: el("#msgNewAluno"),
    tblBody: el("#tblAlunos tbody"),
  };

  // 1) login explicador
  ui.fLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();
    ui.msgLogin.textContent = "";
    const { email, password } = e.target;
    const { error } = await supa.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });
    if (error) return (ui.msgLogin.textContent = error.message);
    await guardExplAndLoad();
  });

  // 2) autorizar explicador + carregar alunos
  async function guardExplAndLoad() {
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user) return;
    const { data: me, error } = await supa
      .from("app_users")
      .select("role,id_explicador")
      .eq("user_id", user.id)
      .single();
    if (error || me?.role !== "explicador") {
      ui.msgLogin.textContent = "Acesso restrito a explicadores.";
      return;
    }
    ui.login.style.display = "none";
    ui.panel.style.display = "block";
    await loadAlunos(me.id_explicador);
  }

  async function loadAlunos(id_explicador) {
    const { data, error } = await supa
      .from("alunos")
      .select("id_aluno,nome,email,ano_escolaridade,user_id")
      .eq("id_explicador", id_explicador)
      .order("nome", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    ui.tblBody.innerHTML = "";
    (data || []).forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${a.nome}</td>
        <td>${a.email ?? ""}</td>
        <td>${a.ano_escolaridade ?? ""}</td>
        <td style="text-align:right">
          <button class="button" data-user="${a.user_id || ""}" data-id="${
        a.id_aluno
      }" style="background:#fff;color:#a92a1f;">Eliminar</button>
        </td>`;
      ui.tblBody.appendChild(tr);
    });
  }

  // 3) criar aluno (Edge Function)
  ui.fNew?.addEventListener("submit", async (e) => {
    e.preventDefault();
    ui.msgNew.textContent = "";
    const payload = {
      nome: e.target.nome.value.trim(),
      apelido: e.target.apelido.value.trim() || null,
      contacto: e.target.contacto.value.trim() || null,
      email: e.target.email.value.trim(),
      password: e.target.password.value,
      ano_escolaridade: e.target.ano.value ? Number(e.target.ano.value) : null,
    };
    const { data, error } = await supa.functions.invoke(
      "explicador-create-aluno",
      { body: payload }
    );
    if (error) return (ui.msgNew.textContent = error.message);
    ui.msgNew.style.color = "#d3ffe5";
    ui.msgNew.textContent = "Aluno criado.";
    e.target.reset();
    guardExplAndLoad();
  });

  // 4) eliminar aluno (Edge Function)
  el("#tblAlunos")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-user]");
    if (!btn) return;
    const user_id = btn.getAttribute("data-user");
    const id_aluno = btn.getAttribute("data-id");
    if (!confirm("Eliminar este aluno e a sua conta?")) return;
    const { error } = await supa.functions.invoke("explicador-delete-aluno", {
      body: { user_id, id_aluno },
    });
    if (error) return alert(error.message);
    guardExplAndLoad();
  });

  // sessão existente?
  guardExplAndLoad();
})();
