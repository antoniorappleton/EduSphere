// /public/js/pages/admin.js
(function () {
  const s = window.supabase;
  const $ = (q) => document.querySelector(q);

  // UI refs
  const ui = {
    loginPanel: $("#adminLogin"),
    adminPanel: $("#adminPanel"),
    msgLogin: $("#msgAdmin"),
    formLogin: $("#fAdminLogin"),
    formNew: $("#fNewExpl"),
    msgNew: $("#signupExplMsg"),
    tableBody: $("#tblExpl tbody"),
    editModal: $("#editModal"),
    editClose: $("#editClose"),
    formEdit: $("#fEditExpl"),
    editMsg: $("#editMsg"),
    btnLogout: $("#btnLogout"),
  };

  // ---------- helpers ----------
  function showLogin() {
    ui.loginPanel.style.display = "block";
    ui.adminPanel.style.display = "none";
  }
  function showAdmin() {
    ui.loginPanel.style.display = "none";
    ui.adminPanel.style.display = "block";
  }
  function openModal() {
    ui.editModal.classList.add("open");
    ui.editModal.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    ui.editModal.classList.remove("open");
    ui.editModal.setAttribute("aria-hidden", "true");
    if (ui.editMsg) ui.editMsg.textContent = "";
    ui.formEdit?.reset();
  }

  async function isAdmin() {
    const {
      data: { user },
    } = await s.auth.getUser();
    if (!user) return false;
    const { data, error } = await s
      .from("app_users")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (error) return false;
    return data?.role === "admin";
  }

  async function ensureAdminUI() {
    if (await isAdmin()) {
      showAdmin();
      await loadExplicadores();
    } else {
      showLogin();
    }
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", ensureAdminUI);

  // também reage a mudanças de sessão (login/logout noutra aba, etc.)
  s.auth.onAuthStateChange(async (_evt) => {
    await ensureAdminUI();
  });

  // ---------- login ----------
  ui.formLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();
    ui.msgLogin.textContent = "";
    const email = e.target.email.value.trim();
    const password = e.target.password.value;

    const { error } = await s.auth.signInWithPassword({ email, password });
    if (error) {
      ui.msgLogin.textContent = error.message;
      return;
    }
    // validar role
    if (!(await isAdmin())) {
      await s.auth.signOut();
      ui.msgLogin.textContent =
        "Acesso negado. Esta conta não é de administrador.";
      showLogin();
      return;
    }
    await ensureAdminUI();
  });

  // ---------- logout ----------
  ui.btnLogout?.addEventListener("click", async () => {
    await s.auth.signOut();
    // volta à home e obriga novo login depois
    location.href = "../index.html";
  });

  // ---------- criar explicador ----------
  ui.formNew?.addEventListener("submit", async (e) => {
    e.preventDefault();
    ui.msgNew.textContent = "";

    const payload = {
      nome: e.target.nome.value.trim(),
      apelido: e.target.apelido.value.trim() || null,
      email: e.target.email.value.trim(),
      password: e.target.password.value,
      contacto: e.target.contacto.value.trim() || null,
      max_alunos: e.target.max.value ? Number(e.target.max.value) : 0,
    };

    // validações mínimas
    if (!payload.nome || !payload.email || !payload.password) {
      ui.msgNew.textContent = "Preenche nome, email e password.";
      return;
    }

    const { error } = await s.functions.invoke("admin-users", {
      body: { action: "create_explicador", payload },
    });

    if (error) {
      ui.msgNew.textContent = error.message || "Falha ao criar explicador.";
      return;
    }
    ui.msgNew.style.color = "#d3ffe5";
    ui.msgNew.textContent = "Explicador criado com sucesso.";
    e.target.reset();
    await loadExplicadores();
  });

  // ---------- carregar lista ----------
  async function loadExplicadores() {
    if (!ui.tableBody) return;
    ui.tableBody.innerHTML = '<tr><td colspan="6">A carregar…</td></tr>';

    const { data, error } = await s
      .from("explicadores")
      .select("id_explicador,user_id,nome,apelido,email,contacto,max_alunos")
      .order("apelido", { nullsFirst: true })
      .order("nome");

    if (error) {
      ui.tableBody.innerHTML = `<tr><td colspan="6">Erro: ${error.message}</td></tr>`;
      return;
    }

    if (!data || data.length === 0) {
      ui.tableBody.innerHTML =
        '<tr><td colspan="6">Sem explicadores.</td></tr>';
      return;
    }

    ui.tableBody.innerHTML = "";
    data.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.nome ?? ""}</td>
        <td>${r.apelido ?? ""}</td>
        <td>${r.email ?? ""}</td>
        <td>${r.contacto ?? ""}</td>
        <td>${r.max_alunos ?? 0}</td>
        <td style="display:flex; gap:6px; justify-content:flex-end">
          <button class="button btn-edit" data-id="${
            r.id_explicador
          }">Editar</button>
          <button class="button btn-pass" data-user="${
            r.user_id
          }" style="background:#fff;color:#a92a1f">Password</button>
          <button class="button btn-del"  data-user="${
            r.user_id
          }" style="background:#fff;color:#a92a1f">Eliminar</button>
        </td>
      `;
      ui.tableBody.appendChild(tr);
    });
  }

  // ---------- ações na tabela ----------
  $("#tblExpl")?.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;

    // EDITAR
    if (b.classList.contains("btn-edit")) {
      const id = b.dataset.id;
      const { data, error } = await s
        .from("explicadores")
        .select("id_explicador,nome,apelido,email,contacto,max_alunos")
        .eq("id_explicador", id)
        .single();
      if (error || !data) return alert(error?.message || "Não encontrado.");
      ui.formEdit.id_explicador.value = data.id_explicador;
      ui.formEdit.nome.value = data.nome ?? "";
      ui.formEdit.apelido.value = data.apelido ?? "";
      ui.formEdit.email.value = data.email ?? "";
      ui.formEdit.contacto.value = data.contacto ?? "";
      ui.formEdit.max.value = data.max_alunos ?? 0;
      openModal();
      return;
    }

    // RESET PASSWORD
    if (b.classList.contains("btn-pass")) {
      const user_id = b.dataset.user;
      const np = prompt("Nova password (>= 6 chars):");
      if (!np) return;
      const { error } = await s.functions.invoke("admin-users", {
        body: {
          action: "update_password",
          payload: { user_id, new_password: np },
        },
      });
      if (error) return alert(error.message);
      alert("Password atualizada.");
      return;
    }

    // ELIMINAR
    if (b.classList.contains("btn-del")) {
      const user_id = b.dataset.user;
      if (!confirm("Eliminar este explicador e respetiva conta?")) return;
      const { error } = await s.functions.invoke("admin-users", {
        body: { action: "delete_user", payload: { user_id } },
      });
      if (error) return alert(error.message);
      await loadExplicadores();
      return;
    }
  });

  // ---------- guardar edição ----------
  ui.formEdit?.addEventListener("submit", async (e) => {
    e.preventDefault();
    ui.editMsg.textContent = "";
    const p = {
      id_explicador: e.target.id_explicador.value,
      nome: e.target.nome.value.trim(),
      apelido: e.target.apelido.value.trim() || null,
      email: e.target.email.value.trim(),
      contacto: e.target.contacto.value.trim() || null,
      max_alunos: e.target.max.value ? Number(e.target.max.value) : 0,
    };
    const { error } = await s.functions.invoke("admin-users", {
      body: { action: "update_explicador", payload: p },
    });
    if (error) {
      ui.editMsg.textContent = error.message;
      return;
    }
    closeModal();
    await loadExplicadores();
  });

  // modal close handlers
  ui.editClose?.addEventListener("click", closeModal);
  ui.editModal?.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal__backdrop")) closeModal();
  });
})();
