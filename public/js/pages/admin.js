(async () => {
  const s = window.supabase;
  const el = (q) => document.querySelector(q);

  const UI = {
    login: el("#adminLogin"),
    panel: el("#adminPanel"),
    msgAdmin: el("#msgAdmin"),
    fLogin: el("#fAdminLogin"),
    fNew: el("#fNewExpl"),
    msgNew: el("#signupExplMsg"),
    tbl: el("#tblExpl tbody"),
    editModal: el("#editModal"),
    fEdit: el("#fEditExpl"),
    editMsg: el("#editMsg"),
    editClose: el("#editClose"),
  };

  // Login admin
  UI.fLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();
    UI.msgAdmin.textContent = "";
    const { email, password } = e.target;
    const { error } = await s.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });
    if (error) return (UI.msgAdmin.textContent = error.message);
    guard();
  });

  async function guard() {
    const {
      data: { user },
    } = await s.auth.getUser();
    if (!user) return;
    const { data } = await s
      .from("app_users")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (data?.role !== "admin") {
      UI.msgAdmin.textContent = "Acesso restrito a administradores.";
      return;
    }
    UI.login.style.display = "none";
    UI.panel.style.display = "block";
    load();
  }

  // Criar explicador
  UI.fNew?.addEventListener("submit", async (e) => {
    e.preventDefault();
    UI.msgNew.textContent = "";
    const p = {
      nome: e.target.nome.value.trim(),
      apelido: e.target.apelido.value.trim() || null,
      contacto: e.target.contacto.value.trim() || null,
      email: e.target.email.value.trim(),
      password: e.target.password.value,
      max_alunos: e.target.max.value ? Number(e.target.max.value) : 0,
    };
    const { error } = await s.functions.invoke("admin-users", {
      body: { action: "create_explicador", payload: p },
    });
    if (error) return (UI.msgNew.textContent = error.message);
    UI.msgNew.style.color = "#d3ffe5";
    UI.msgNew.textContent = "Explicador criado.";
    e.target.reset();
    load();
  });

  // Carregar lista
  async function load() {
    const { data, error } = await s
      .from("explicadores")
      .select("id_explicador,user_id,nome,apelido,email,contacto,max_alunos")
      .order("apelido")
      .order("nome");
    if (error) {
      console.error(error);
      return;
    }
    UI.tbl.innerHTML = "";
    (data || []).forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.nome}</td>
        <td>${r.apelido ?? ""}</td>
        <td>${r.email}</td>
        <td>${r.contacto ?? ""}</td>
        <td>${r.max_alunos ?? 0}</td>
        <td style="text-align:right; display:flex; gap:6px; justify-content:flex-end">
          <button class="button btn-edit" data-id="${
            r.id_explicador
          }">Editar</button>
          <button class="button btn-pass" data-user="${
            r.user_id
          }" style="background:#fff;color:#a92a1f">Password</button>
          <button class="button btn-del"  data-user="${
            r.user_id
          }" style="background:#fff;color:#a92a1f">Eliminar</button>
        </td>`;
      UI.tbl.appendChild(tr);
    });
  }

  // Abrir/Fechar modal
  function openModal() {
    UI.editModal.classList.add("open");
    UI.editModal.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    UI.editModal.classList.remove("open");
    UI.editModal.setAttribute("aria-hidden", "true");
    UI.editMsg.textContent = "";
  }
  UI.editClose?.addEventListener("click", closeModal);
  UI.editModal?.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal__backdrop")) closeModal();
  });

  // Tabela actions
  el("#tblExpl")?.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;

    // EDITAR
    if (b.classList.contains("btn-edit")) {
      const id = b.dataset.id;
      const { data } = await s
        .from("explicadores")
        .select("id_explicador,nome,apelido,email,contacto,max_alunos")
        .eq("id_explicador", id)
        .single();
      if (!data) return;
      UI.fEdit.id_explicador.value = data.id_explicador;
      UI.fEdit.nome.value = data.nome;
      UI.fEdit.apelido.value = data.apelido ?? "";
      UI.fEdit.email.value = data.email;
      UI.fEdit.contacto.value = data.contacto ?? "";
      UI.fEdit.max.value = data.max_alunos ?? 0;
      openModal();
      return;
    }

    // PASSWORD
    if (b.classList.contains("btn-pass")) {
      const user_id = b.dataset.user;
      const np = prompt("Nova password (>=6):");
      if (!np) return;
      const { error } = await s.functions.invoke("admin-users", {
        body: {
          action: "update_password",
          payload: { user_id, new_password: np },
        },
      });
      return error ? alert(error.message) : alert("Password atualizada.");
    }

    // ELIMINAR
    if (b.classList.contains("btn-del")) {
      const user_id = b.dataset.user;
      if (!confirm("Eliminar este explicador e a respetiva conta?")) return;
      const { error } = await s.functions.invoke("admin-users", {
        body: { action: "delete_user", payload: { user_id } },
      });
      return error ? alert(error.message) : load();
    }
  });

  // Guardar edição
  UI.fEdit?.addEventListener("submit", async (e) => {
    e.preventDefault();
    UI.editMsg.textContent = "";
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
      UI.editMsg.textContent = error.message;
      return;
    }
    closeModal();
    load();
  });

  // sessão corrente
  (async () => {
    await guard();
  })();
})();
