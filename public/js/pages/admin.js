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

  let FUNCTION_AVAILABLE = true;
  let CURRENT_ADMIN_UID = null;
  let CACHE_LIST = [];
  let EDITING = null;

  async function hasRole(uid, roleName) {
    const { data, error } = await supabase
      .from("app_users")
      .select("role")
      .eq("user_id", uid)
      .eq("role", roleName)
      .limit(1); // sem .single()
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
      .select("id_explicador, user_id, nome, apelido, email, contacto, max")
      .order("nome", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  function renderRows(list) {
    if (!list.length) {
      tblBody.innerHTML = '<tr><td colspan="6">Sem explicadores.</td></tr>';
      return;
    }
    tblBody.innerHTML = list
      .map((e) => {
        const self = e.user_id && e.user_id === CURRENT_ADMIN_UID;
        const dis = self
          ? 'disabled title="Não podes aplicar esta ação a ti próprio."'
          : "";
        return `
        <tr data-id="${e.id_explicador}">
          <td>${e.nome ?? "-"}</td>
          <td>${e.apelido ?? "-"}</td>
          <td>${e.email ?? "-"}</td>
          <td>${e.contacto ?? "-"}</td>
          <td>${Number(e.max ?? 0)}</td>
          <td style="white-space:nowrap;display:flex;gap:6px;justify-content:flex-end;">
            <button class="button button--ghost btn-edit" data-id="${
              e.id_explicador
            }">Editar</button>
            <button class="button button--ghost btn-reset" data-id="${
              e.id_explicador
            }" ${dis}>Reset PW</button>
            <button class="button button--ghost btn-del"   data-id="${
              e.id_explicador
            }" ${dis}>Eliminar</button>
          </td>
        </tr>
      `;
      })
      .join("");

    tblBody
      .querySelectorAll(".btn-edit")
      .forEach((b) =>
        b.addEventListener("click", () => openEdit(b.dataset.id))
      );
    tblBody
      .querySelectorAll(".btn-reset")
      .forEach((b) =>
        b.addEventListener("click", () => onResetPassword(b.dataset.id))
      );
    tblBody
      .querySelectorAll(".btn-del")
      .forEach((b) =>
        b.addEventListener("click", () => onDeleteExpl(b.dataset.id))
      );
  }

  async function refreshList() {
    tblBody.innerHTML = '<tr><td colspan="6">A carregar…</td></tr>';
    try {
      CACHE_LIST = await listExplicadores();
      renderRows(CACHE_LIST);
    } catch (e) {
      console.error(e);
      tblBody.innerHTML = '<tr><td colspan="6">Erro a carregar.</td></tr>';
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
      contacto: f.contacto.value.trim() || null,
      max: f.max.value ? Number(f.max.value) : 0,
    };
    if (!payload.nome || !payload.email || !payload.password) {
      msgNew.textContent = "Preenche pelo menos Nome, Email e Password.";
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
        "Por segurança, não podes fazer reset à tua própria password aqui."
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
        `Eliminar o explicador "${row.nome || ""} ${row.apelido || ""}"?`
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

  // BOOT
  document.addEventListener("DOMContentLoaded", async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    CURRENT_ADMIN_UID = session?.user?.id || null;
    if (CURRENT_ADMIN_UID && (await isAdmin(CURRENT_ADMIN_UID))) {
      await refreshList();
    }
  });
})();
