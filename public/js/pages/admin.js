/* public/js/admin.js
   Gestão de Explicadores (Admin) – alinhado com Edge Function 'admin-users'
*/

(function () {
  const $ = (s) => document.querySelector(s);

  const formNew = $("#fNewExpl");
  const msgNew = $("#signupExplMsg");
  const tblBody = $("#tblExpl tbody");

  const editModal = $("#editModal");
  const editClose = $("#editClose");
  const formEdit = $("#fEditExpl");
  const msgEdit = $("#editMsg");

  // elementos de resumo
  const statTotal = document.getElementById("stat-total");
  const statAtivos = document.getElementById("stat-ativos");
  const statBloqueados = document.getElementById("stat-bloqueados");

  let FUNCTION_AVAILABLE = true;
  let CURRENT_ADMIN_UID = null;
  let CACHE_LIST = [];
  let EDITING = null;

  // --- PASSWORD VISIBILITY TOGGLE ---
  function initPasswordToggles(parent = document) {
    parent.querySelectorAll(".password-toggle").forEach((btn) => {
      btn.onclick = null;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const wrapper = btn.closest(".password-wrapper");
        if (!wrapper) return;
        const input = wrapper.querySelector("input");
        if (!input) return;

        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";

        const eyeIcon = btn.querySelector(".eye-icon");
        if (eyeIcon) {
          if (isPassword) {
            eyeIcon.innerHTML =
              '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
          } else {
            eyeIcon.innerHTML =
              '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
          }
        }
      });
    });
  }

  async function hasRole(uid, roleName) {
    const { data, error } = await supabase
      .from("app_users")
      .select("role")
      .eq("user_id", uid)
      .eq("role", roleName)
      .limit(1);
    if (error) {
      console.error("hasRole error", error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  }

  async function isAdmin(uid) {
    return hasRole(uid, "admin");
  }

  async function callAdminUsers(action, payload) {
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action, payload },
      });
      if (error) throw error;
      FUNCTION_AVAILABLE = true;
      return { ok: true, data };
    } catch (err) {
      console.warn("Edge Function admin-users indisponível/erro:", err);
      FUNCTION_AVAILABLE = false;
      return { ok: false, error: err };
    }
  }

  // LIST
  async function listExplicadores() {
    if (FUNCTION_AVAILABLE) {
      const res = await callAdminUsers("list_explicadores", {});
      if (res.ok && Array.isArray(res.data)) return res.data;
    }
    // fallback direto (precisa policy de SELECT para admins)
    const { data, error } = await supabase
      .from("explicadores")
      .select(
        "id_explicador, user_id, nome, apelido, email, contacto, max, is_blocked, blocked_until",
      )
      .order("nome", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  function updateStats(list) {
    if (!statTotal || !statAtivos || !statBloqueados) return;
    const total = list.length;
    const bloqueados = list.filter((e) => !!e.is_blocked).length;
    const ativos = total - bloqueados;
    statTotal.textContent = String(total);
    statAtivos.textContent = String(ativos);
    statBloqueados.textContent = String(bloqueados);
  }

  function renderRows(list) {
    if (!list.length) {
      tblBody.innerHTML = '<tr><td colspan="8">Sem explicadores.</td></tr>';
      updateStats([]);
      return;
    }

    tblBody.innerHTML = list
      .map((e) => {
        const self = e.user_id && e.user_id === CURRENT_ADMIN_UID;
        const dis = self
          ? 'disabled title="Não podes aplicar esta ação a ti próprio."'
          : "";

        const temLogin = !!e.user_id;
        const permissaoLabel = temLogin
          ? "Explicador (login ativo)"
          : "Sem login (sem utilizador ligado)";

        const estadoLabel = e.is_blocked
          ? `Bloqueado${
              e.blocked_until
                ? ` até ${new Date(e.blocked_until).toLocaleDateString()}`
                : ""
            }`
          : "Ativo";

        return `
          <tr data-id="${e.id_explicador}">
            <td>
              <div style="display: flex; align-items: center; gap: 12px;">
                <div class="admin-avatar">${(e.nome || "?").charAt(0).toUpperCase()}</div>
                <div>
                  <div style="font-weight: 600;">${e.nome ?? ""} ${e.apelido ?? ""}</div>
                  <div style="font-size: 0.75rem; color: var(--text-soft);">${e.contacto || "Sem contacto"}</div>
                </div>
              </div>
            </td>
            <td>
              <div style="font-weight: 500;">${e.email ?? "-"}</div>
            </td>
            <td>
              <span style="font-weight: 600;">${Number(e.max ?? 0)}</span>
              <span style="font-size: 0.75rem; color: var(--text-soft);"> alunos</span>
            </td>
            <td>
              <span class="badge ${e.is_blocked ? "badge--danger" : "badge--success"}">
                ${e.is_blocked ? "Bloqueado" : "Ativo"}
              </span>
            </td>
            <td>
              <div class="admin-actions">
                <button class="action-btn btn-edit" title="Editar" data-id="${e.id_explicador}">
                  <span class="material-symbols-outlined">edit</span>
                </button>
                <button class="action-btn btn-reset" title="Reset Password" data-id="${e.id_explicador}" ${dis}>
                  <span class="material-symbols-outlined">lock_reset</span>
                </button>
                <button class="action-btn action-btn--warning btn-block" title="${e.is_blocked ? "Desbloquear" : "Bloquear"}" data-id="${e.id_explicador}" ${dis}>
                  <span class="material-symbols-outlined">${e.is_blocked ? "check_circle" : "block"}</span>
                </button>
                <button class="action-btn action-btn--danger btn-del" title="Eliminar" data-id="${e.id_explicador}" ${dis}>
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    // ligar botões
    tblBody
      .querySelectorAll(".btn-edit")
      .forEach((b) =>
        b.addEventListener("click", () => openEdit(b.dataset.id)),
      );
    tblBody
      .querySelectorAll(".btn-reset")
      .forEach((b) =>
        b.addEventListener("click", () => onResetPassword(b.dataset.id)),
      );
    tblBody
      .querySelectorAll(".btn-del")
      .forEach((b) =>
        b.addEventListener("click", () => onDeleteExpl(b.dataset.id)),
      );
    tblBody
      .querySelectorAll(".btn-block")
      .forEach((b) =>
        b.addEventListener("click", () => onToggleBlock(b.dataset.id)),
      );

    updateStats(list);
  }

  async function refreshList() {
    tblBody.innerHTML = '<tr><td colspan="8">A carregar…</td></tr>';
    try {
      CACHE_LIST = await listExplicadores();
      renderRows(CACHE_LIST);
    } catch (e) {
      console.error(e);
      tblBody.innerHTML = '<tr><td colspan="8">Erro a carregar.</td></tr>';
      updateStats([]);
    }
  }

  // CREATE
  formNew?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msgNew.textContent = "";
    const btn = formNew.querySelector('button[type="submit"]');
    btn.disabled = true;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user || !(await isAdmin(session.user.id))) {
      msgNew.textContent = "Sem permissões de administrador.";
      btn.disabled = false;
      return;
    }

    const f = ev.target;
    const payload = {
      nome: f.nome.value.trim(),
      apelido: f.apelido.value.trim() || null,
      email: f.email.value.trim(),
      password: f.password.value,
      confirmPassword: f.confirmPassword.value,
      contacto: f.contacto.value.trim() || null,
      max: f.max.value ? Number(f.max.value) : 0,
    };

    if (!payload.nome || !payload.email || !payload.password) {
      msgNew.textContent = "Preenche pelo menos Nome, Email e Password.";
      btn.disabled = false;
      return;
    }

    if (payload.password !== payload.confirmPassword) {
      msgNew.textContent = "As passwords não coincidem.";
      btn.disabled = false;
      return;
    }

    msgNew.textContent = "A criar explicador...";
    const res = await callAdminUsers("create_explicador", payload);
    if (!res.ok) {
      const detail =
        res.error?.message ||
        res.error?.error ||
        JSON.stringify(res.error || {});
      msgNew.textContent = `Falhou a criação no backend: ${detail}`;
      btn.disabled = false;
      return;
    }
    msgNew.style.color = "#126b3a";
    msgNew.textContent = "Explicador criado com sucesso.";
    f.reset();
    btn.disabled = false;
    await refreshList();
  });

  // EDIT
  function openModal() {
    editModal.classList.add("open");
    editModal.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    editModal.classList.remove("open");
    editModal.setAttribute("aria-hidden", "true");
    msgEdit.textContent = "";
  }
  editClose?.addEventListener("click", closeModal);
  editModal?.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal__backdrop")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && editModal.classList.contains("open"))
      closeModal();
  });

  function openEdit(id) {
    const row = CACHE_LIST.find((x) => x.id_explicador === id);
    if (!row) return;
    EDITING = { ...row };
    formEdit.id_explicador.value = row.id_explicador;
    formEdit.nome.value = row.nome ?? "";
    formEdit.apelido.value = row.apelido ?? "";
    formEdit.email.value = row.email ?? "";
    formEdit.contacto.value = row.contacto ?? "";
    formEdit.max.value = Number(row.max ?? 0);
    msgEdit.textContent = "";
    openModal();
  }

  formEdit?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msgEdit.textContent = "";

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user || !(await isAdmin(session.user.id))) {
      msgEdit.textContent = "Sem permissões de administrador.";
      return;
    }

    const f = ev.target;
    const payload = {
      id_explicador: f.id_explicador.value,
      nome: f.nome.value.trim(),
      apelido: f.apelido.value.trim() || null,
      email: f.email.value.trim(),
      contacto: f.contacto.value.trim() || null,
      max: f.max.value ? Number(f.max.value) : 0,
    };
    if (!payload.id_explicador || !payload.nome || !payload.email) {
      msgEdit.textContent = "Preenche pelo menos Nome e Email.";
      return;
    }

    msgEdit.textContent = "A guardar...";
    const res = await callAdminUsers("update_explicador", payload);
    if (!res.ok) {
      const detail =
        res.error?.message ||
        res.error?.error ||
        JSON.stringify(res.error || {});
      msgEdit.textContent = `Falhou a atualização no backend: ${detail}`;
      return;
    }
    msgEdit.style.color = "#126b3a";
    msgEdit.textContent = "Alterações guardadas!";
    await refreshList();
    setTimeout(closeModal, 600);
  });

  // RESET PASSWORD (para outros users)
  async function onResetPassword(id_explicador) {
    const row = CACHE_LIST.find((x) => x.id_explicador === id_explicador);
    if (!row) return;
    if (row.user_id === CURRENT_ADMIN_UID) {
      alert(
        "Por segurança, não podes fazer reset à tua própria password aqui.",
      );
      return;
    }
    const nova = prompt(`Nova password para ${row.nome || "utilizador"}:`);
    if (!nova) return;

    const res = await callAdminUsers("reset_password", {
      id_explicador,
      new_password: nova,
    });
    if (!res.ok) {
      const detail =
        res.error?.message ||
        res.error?.error ||
        JSON.stringify(res.error || {});
      alert("Falhou reset password: " + detail);
      return;
    }
    alert("Password atualizada.");
  }

  // DELETE (para outros users)
  async function onDeleteExpl(id_explicador) {
    const row = CACHE_LIST.find((x) => x.id_explicador === id_explicador);
    if (!row) return;
    if (row.user_id === CURRENT_ADMIN_UID) {
      alert("Não podes eliminar a tua própria conta aqui.");
      return;
    }
    if (
      !confirm(
        `Eliminar o explicador "${row.nome || ""} ${row.apelido || ""}"?`,
      )
    )
      return;

    const res = await callAdminUsers("delete_explicador", { id_explicador });
    if (!res.ok) {
      const detail =
        res.error?.message ||
        res.error?.error ||
        JSON.stringify(res.error || {});
      alert("Falhou a eliminação: " + detail);
      return;
    }
    await refreshList();
  }

  // Botão bloquear/desbloquear
  async function onToggleBlock(id_explicador) {
    const row = CACHE_LIST.find((x) => x.id_explicador === id_explicador);
    if (!row) return;
    if (row.user_id === CURRENT_ADMIN_UID) {
      alert("Não podes bloquear a tua própria conta.");
      return;
    }

    const currentlyBlocked = !!row.is_blocked;
    let payload;

    if (currentlyBlocked) {
      // Desbloquear
      if (
        !confirm(
          `Desbloquear o explicador "${row.nome || ""} ${row.apelido || ""}"?`,
        )
      )
        return;
      payload = { id_explicador, is_blocked: false, blocked_until: null };
    } else {
      // Bloquear até uma data
      const days = prompt(
        `Bloquear o explicador "${row.nome || ""} ${
          row.apelido || ""
        }" por quantos dias? (0 = indefinido)`,
      );
      if (days === null) return;

      const n = Number(days);
      let blocked_until = null;
      if (!Number.isNaN(n) && n > 0) {
        const d = new Date();
        d.setDate(d.getDate() + n);
        blocked_until = d.toISOString();
      }

      payload = { id_explicador, is_blocked: true, blocked_until };
    }

    const res = await callAdminUsers("set_block", payload);
    if (!res.ok) {
      const detail =
        res.error?.message ||
        res.error?.error ||
        JSON.stringify(res.error || {});
      alert("Falhou a atualização de bloqueio: " + detail);
      return;
    }
    await refreshList();
  }

  // BOOT
  document.addEventListener("DOMContentLoaded", async () => {
    initPasswordToggles();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    CURRENT_ADMIN_UID = session?.user?.id || null;
    if (CURRENT_ADMIN_UID && (await isAdmin(CURRENT_ADMIN_UID))) {
      await refreshList();
    }
  });
})();
