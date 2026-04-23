// public/js/alunos-explicador.js

let sessoesCache = [];

async function initAlunosPage() {
  console.log("Initializing Alunos Page...");

  const grid = document.getElementById("alunos-cards-grid");
  grid.innerHTML = "<p>A carregar...</p>";

  try {
    const list = await ExplicadorService.listAlunos();

    // Update Counts
    document.getElementById("contagem").textContent = list.length;
    // Limit (fake data for now)
    document.getElementById("limite").textContent = "10"; // Default from schema
    document.getElementById("restantes").textContent = 10 - list.length;

    if (list.length === 0) {
      grid.innerHTML = '<p class="empty-state">Sem alunos registados.</p>';
      return;
    }

    grid.innerHTML = "";
    list.forEach(renderAlunoCard);
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p style="color:red">Erro: ${err.message}</p>`;
  }
}

function renderAlunoCard(aluno) {
  const container = document.getElementById("alunos-cards-grid");
  const div = document.createElement("div");
  div.className = "dash-aluno-card";

  const statusBadge = aluno.is_active
    ? '<span class="dash-aluno-card__badge" style="background:#dcfce7;color:#166534">Ativo</span>'
    : '<span class="dash-aluno-card__badge" style="background:#fef2f2;color:#991b1b">Inativo</span>';

  const prox = aluno.proxima_sessao_data
    ? new Date(aluno.proxima_sessao_data).toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "short",
      }) +
      (aluno.proxima_sessao_hora
        ? " às " + aluno.proxima_sessao_hora.slice(0, 5)
        : "")
    : "Sem aulas";

  // Billing: valor/sessão × sessões/mês
  const valorSessao = Number(aluno.valor_explicacao || 0);
  const sessMes = Number(aluno.sessoes_mes || 1);
  const previstoMensal = valorSessao * sessMes;

  div.innerHTML = `
    <div class="dash-aluno-card__top">
      <div class="dash-aluno-card__avatar">${(aluno.nome || "?")[0]}</div>
      <div class="dash-aluno-card__info">
        <h3 class="dash-aluno-card__name">${aluno.nome} ${aluno.apelido || ""}</h3>
        <p class="dash-aluno-card__year">${aluno.ano || "?"}º Ano</p>
      </div>
      <div>${statusBadge}</div>
    </div>
    <div class="dash-aluno-card__content">
       <div class="dash-aluno-card__row">
         <span class="dash-aluno-card__label">Previsão mensal</span>
         <span class="dash-aluno-card__date" style="font-weight:600; color:#16a34a;">${formatCurrency(previstoMensal)}</span>
       </div>
       <div class="dash-aluno-card__row">
         <span class="dash-aluno-card__label">Sessões/mês</span>
         <span class="dash-aluno-card__date">${sessMes} × ${formatCurrency(valorSessao)}</span>
       </div>
       <div class="dash-aluno-card__row">
         <span class="dash-aluno-card__label">Próxima aula</span>
         <span class="dash-aluno-card__date">${prox}</span>
       </div>
    </div>
    <button class="dash-aluno-card__btn" onclick="openPerfil('${aluno.id_aluno}')">Ver Perfil</button>
  `;
  container.appendChild(div);
}

function formatCurrency(v) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(v);
}

async function openPerfil(id) {
  console.log("Open perfil", id);
  const listView = document.getElementById("view-lista-alunos");
  const perfilView = document.getElementById("view-perfil-aluno");

  if (!listView || !perfilView) return;

  listView.style.display = "none";
  perfilView.style.display = "block";

  try {
    // 1. Carregar Dados do Aluno
    const aluno = await ExplicadorService.getAluno(id);
    document.getElementById("alunoNome").textContent =
      `${aluno.nome} ${aluno.apelido || ""}`;
    document.getElementById("alunoAvatar").textContent = (aluno.nome || "?")[0];
    document.getElementById("alunoAno").textContent =
      `${aluno.ano || "?"}º Ano`;
    document.getElementById("alunoEmail").textContent = aluno.email || "—";
    document.getElementById("alunoTele").textContent = aluno.telemovel || "—";
    document.getElementById("alunoDataInscricao").textContent = aluno.created_at
      ? new Date(aluno.created_at).toLocaleDateString("pt-PT")
      : "—";

    // Status Badge
    const statusEl = document.getElementById("alunoStatus");
    statusEl.textContent = aluno.is_active ? "Ativo" : "Inativo";
    statusEl.className = `badge status ${aluno.is_active ? "active" : "inactive"}`;

    // ID do aluno guardado para o modal de exercício
    perfilView.dataset.currentAlunoId = id;

    // 2. Carregar Explicações
    const sessoes = await ExplicadorService.listSessoes(id);
    sessoesCache = sessoes; // Update local memory cache
    renderSessoesTable(sessoes);

    // Update Próxima Aula KPI
    const hoje = new Date().toISOString();
    const proxSessao = sessoes
      .filter((s) => s.data >= hoje.split("T")[0] && s.estado === "AGENDADA")
      .sort((a, b) =>
        (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio),
      )[0];
    document.getElementById("proximaAulaTxt").textContent = proxSessao
      ? `${new Date(proxSessao.data).toLocaleDateString("pt-PT")} às ${(proxSessao.hora_inicio || "??:??").slice(0, 5)}`
      : "Sem sessões agendadas";

    // 3. Carregar Exercícios
    const exercicios = await ExplicadorService.listExercicios(id);
    renderExerciciosTable(exercicios);

    // 4. Carregar Pagamentos
    // Nota: listPagamentos ainda não está no service, mas podemos usar fallback ou implementar
    // Por agora, vamos deixar placeholder se falhar
    try {
      const { data: pagamentos } = await supabase
        .from("v_pagamentos_detalhe")
        .select("*")
        .eq("id_aluno", id)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false });
      renderPagamentosTable(pagamentos || []);
    } catch (e) {
      console.warn("Erro ao carregar pagamentos:", e);
    }
  } catch (err) {
    console.error("Erro ao abrir perfil:", err);
    alert("Erro ao carregar dados do aluno.");
    fecharPerfilAluno();
  }
}

function renderSessoesTable(list) {
  const tbody = document.getElementById("listaExplicacoes");
  if (!tbody) return;

  // Ordenar: mais recente primeiro (data desc, hora desc)
  const sorted = [...list].sort((a, b) => {
    const dateTimeA = (a.data || "") + (a.hora_inicio || "");
    const dateTimeB = (b.data || "") + (b.hora_inicio || "");
    return dateTimeB.localeCompare(dateTimeA);
  });

  tbody.innerHTML = sorted.length
    ? sorted
        .map((s) => {
          const dateStr = new Date(s.data).toLocaleDateString("pt-PT");
          // Se estiver pendente de sync, mostrar aviso
          const syncTag = s.pending_sync
            ? `<span class="status-tag pending-sync" title="A aguardar internet">Pendente</span>`
            : "";

          return `
      <tr data-id="${s.id_sessao}">
        <td>${dateStr}</td>
        <td>${(s.hora_inicio || "??:??").slice(0, 5)}</td>
        <td>${(s.hora_fim || "??:??").slice(0, 5)}</td>
        <td>${s.duracao_min || 60} min</td>
        <td>${syncTag} 
          <select class="input" style="padding: 2px 5px; font-size: 11px; width: auto; height: auto; min-width: 90px;" onchange="handleEstadoChange('${s.id_sessao}', this.value)">
            <option value="AGENDADA" ${s.estado === "AGENDADA" ? "selected" : ""}>AGENDADA</option>
            <option value="REALIZADA" ${s.estado === "REALIZADA" ? "selected" : ""}>REALIZADA</option>
            <option value="CANCELADA" ${s.estado === "CANCELADA" ? "selected" : ""}>CANCELADA</option>
            <option value="CONFIRMADA" ${s.estado === "CONFIRMADA" ? "selected" : ""}>CONFIRMADA</option>
          </select>
        </td>
        <td>
          <div style="display:flex; gap:8px;">
            <button class="btn-detalhe" onclick="openModalSessao('${s.id_sessao}')" title="Detalhes">
              <span class="material-symbols-outlined">description</span>
            </button>
            <button class="btn-detalhe" onclick="handleDeleteSessaoClick('${s.id_sessao}')" title="Eliminar" style="color: #ef4444;">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </td>
      </tr>
    `;
        })
        .join("")
    : '<tr><td colspan="6">Sem histórico.</td></tr>';
}

async function handleEstadoChange(id_sessao, newEstado) {
  const sessao = sessoesCache.find(s => s.id_sessao === id_sessao);
  if (!sessao) return;
  
  const payload = {
    ...sessao,
    estado: newEstado
  };
  
  try {
    await ExplicadorService.upsertSessao(payload);
    const idx = sessoesCache.findIndex(s => s.id_sessao === id_sessao);
    if (idx !== -1) {
      sessoesCache[idx] = { ...sessoesCache[idx], estado: newEstado };
    }
  } catch (err) {
    alert("Erro ao atualizar estado: " + err.message);
    renderSessoesTable(sessoesCache);
  }
}

async function handleDeleteSessaoClick(id_sessao) {
  if (!confirm("Tem a certeza que deseja eliminar esta sessão?")) return;
  try {
    await ExplicadorService.deleteSessao(id_sessao);
    const perfilView = document.getElementById("view-perfil-aluno");
    const alunoId = perfilView ? perfilView.dataset.currentAlunoId : null;
    
    sessoesCache = sessoesCache.filter(s => s.id_sessao !== id_sessao);
    renderSessoesTable(sessoesCache);
    
    if (alunoId) {
      try {
        const { data: pagamentos } = await supabase
          .from("v_pagamentos_detalhe")
          .select("*")
          .eq("id_aluno", alunoId)
          .order("ano", { ascending: false })
          .order("mes", { ascending: false });
        renderPagamentosTable(pagamentos || []);
        
        // Update global KPIs in the list view if needed
        initAlunosPage(); 
      } catch (e) {
        console.warn("Erro ao carregar pagamentos após eliminar sessão:", e);
      }
    }
  } catch (err) {
    alert("Erro ao eliminar sessão: " + err.message);
  }
}

function renderPagamentosTable(list) {
  const tbody = document.getElementById("listaPagamentos");
  const totalEl = document.getElementById("pagTotal");
  if (!tbody) return;

  let totalVisible = 0;
  tbody.innerHTML = list.length
    ? list
        .map((p) => {
          totalVisible += Number(p.valor_pago || 0);
          // Armazenar os dados na row para edição fácil
          const pJson = JSON.stringify(p).replace(/"/g, "&quot;");
          return `
      <tr data-pagamento='${pJson}'>
        <td>${p.data_pagamento ? new Date(p.data_pagamento).toLocaleDateString("pt-PT") : "—"}</td>
        <td>${p.mes}/${p.ano}</td>
        <td>${formatCurrency(p.valor_pago)} / ${formatCurrency(p.valor_previsto)}</td>
        <td>Multibanco/MBWay</td>
        <td><span class="badge ${p.estado?.toLowerCase()}">${p.estado}</span></td>
        <td>
          <div style="display:flex; gap:8px;">
            <button class="button secondary button--sm" onclick="openModalPagamento('${p.id_pagamento}')" title="Editar">✏️</button>
            <button class="button secondary button--sm" onclick="handleDeletePagamento('${p.id_pagamento}')" title="Apagar">🗑️</button>
          </div>
        </td>
      </tr>
    `;
        })
        .join("")
    : '<tr><td colspan="6">Sem pagamentos.</td></tr>';

  if (totalEl) totalEl.textContent = totalVisible.toFixed(2);
}

// ================== DIÁRIO DE BORDO: SESSÃO ==================

function openModalSessao(idSessao) {
  const m = document.getElementById("modal-sessao-detalhe");
  const form = document.getElementById("fSessaoDetalhe");
  if (!m || !form) return;

  const sessao = sessoesCache.find((s) => s.id_sessao === idSessao);
  if (!sessao) {
    console.error("Sessão não encontrada no cache local.");
    return;
  }

  form.reset();
  document.getElementById("det-sessao-id").value = sessao.id_sessao;
  document.getElementById("det-sessao-sumario").value = sessao.sumario || "";
  document.getElementById("det-sessao-exercicios").value =
    sessao.exercicios_realizados || "";
  document.getElementById("det-sessao-notas-prox").value =
    sessao.notas_proxima_sessao || "";
  document.getElementById("det-sessao-obs").value = sessao.observacoes || "";
  document.getElementById("det-sessao-hora-fim").value = sessao.hora_fim
    ? sessao.hora_fim.slice(0, 5)
    : "";
  document.getElementById("det-sessao-estado").value =
    sessao.estado || "AGENDADA";

  m.classList.add("open");
  m.setAttribute("aria-hidden", "false");
}

async function openModalPagamento(id = null) {
  const m = document.getElementById("modal-pagamento");
  const form = document.getElementById("fPagamento");
  const title = document.getElementById("modal-pagamento-titulo");
  if (!m || !form) return;

  form.reset();
  document.getElementById("in-pag-id").value = id || "";

  const alunoId =
    document.getElementById("view-perfil-aluno").dataset.currentAlunoId;
  const aluno = await ExplicadorService.getAluno(alunoId);

  if (id) {
    title.textContent = "Editar Pagamento";
    // Procurar os dados na tabela
    const row = document.querySelector(`tr[data-pagamento*="${id}"]`);
    if (row) {
      const p = JSON.parse(row.dataset.pagamento);
      document.getElementById("in-pag-mes").value = p.mes;
      document.getElementById("in-pag-ano").value = p.ano;
      document.getElementById("in-pag-prev").value = p.valor_previsto;
      document.getElementById("in-pag-pago").value = p.valor_pago;
      document.getElementById("in-pag-data").value = p.data_pagamento || "";
      document.getElementById("in-pag-estado").value = p.estado;
    }
  } else {
    title.textContent = "Registar Pagamento";
    document.getElementById("in-pag-mes").value = new Date().getMonth() + 1;
    document.getElementById("in-pag-ano").value = new Date().getFullYear();
    document.getElementById("in-pag-prev").value = aluno.valor_explicacao || 0;
  }

  m.classList.add("open");
  m.setAttribute("aria-hidden", "false");
}

async function handleDeletePagamento(id) {
  if (!confirm("Tem a certeza que deseja eliminar este registo de pagamento?"))
    return;
  try {
    await ExplicadorService.deletePagamento(id);
    const alunoId =
      document.getElementById("view-perfil-aluno").dataset.currentAlunoId;
    // Recarregar pagamentos
    const { data: pagamentos } = await supabase
      .from("v_pagamentos_detalhe")
      .select("*")
      .eq("id_aluno", alunoId)
      .order("ano", { ascending: false })
      .order("mes", { ascending: false });
    renderPagamentosTable(pagamentos || []);
  } catch (e) {
    alert("Erro ao eliminar: " + e.message);
  }
}

function renderExerciciosTable(list) {
  const tbody = document.getElementById("listaExercicios");
  if (!tbody) return;

  tbody.innerHTML = list.length
    ? list
        .map(
          (e) => `
    <tr>
      <td>${new Date(e.data_envio).toLocaleDateString("pt-PT")}</td>
      <td>${e.nome}</td>
      <td>${e.data_entrega_prevista ? new Date(e.data_entrega_prevista).toLocaleDateString("pt-PT") : "—"}</td>
      <td><span class="badge ${e.is_concluido ? "realizada" : "agendada"}">${e.is_concluido ? "Concluído" : "Pendente"}</span></td>
      <td>
        <div style="display:flex; gap:8px;">
           <a href="${e.url}" target="_blank" class="button secondary button--sm" title="Ver/Download">🔗</a>
           <button class="button secondary button--sm" onclick="deleteExercicio('${e.id_exercicio}')" title="Apagar">🗑️</button>
        </div>
      </td>
    </tr>
  `,
        )
        .join("")
    : '<tr><td colspan="5">Ainda não enviou exercícios.</td></tr>';
}

async function deleteExercicio(id) {
  if (!confirm("Tem a certeza que deseja apagar este exercício?")) return;
  try {
    await ExplicadorService.deleteExercicio(id);
    const alunoId =
      document.getElementById("view-perfil-aluno").dataset.currentAlunoId;
    const exercicios = await ExplicadorService.listExercicios(alunoId);
    renderExerciciosTable(exercicios);
  } catch (e) {
    alert("Erro ao apagar: " + e.message);
  }
}

async function handleDeleteAluno() {
  const perfilView = document.getElementById("view-perfil-aluno");
  const id = perfilView.dataset.currentAlunoId;
  const nome = document.getElementById("alunoNome").textContent;

  if (
    !id ||
    !confirm(
      `Tem a certeza que deseja ELIMINAR definitivamente o aluno "${nome}"? Esta ação não pode ser desfeita.`,
    )
  )
    return;

  try {
    await ExplicadorService.deleteAluno(id);
    alert("Aluno eliminado com sucesso.");
    fecharPerfilAluno(); // Função que volta para a lista
    initAlunosPage(); // Recarrega a lista
  } catch (err) {
    alert("Erro ao eliminar aluno: " + err.message);
  }
}

// ================== CHAT LOGIC ==================

async function carregarMensagensTutor(idAluno) {
  const container = document.getElementById("chat-container-expl");
  if (!container) return;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Precisamos do user_id do aluno
    const { data: aluno } = await supabase
      .from("alunos")
      .select("user_id")
      .eq("id_aluno", idAluno)
      .single();
    if (!aluno?.user_id) {
      container.innerHTML =
        '<p class="text-xs text-gray-500">Este aluno ainda não tem conta de utilizador associada.</p>';
      return;
    }

    const { data: msgs, error } = await supabase
      .from("mensagens")
      .select("*")
      .or(
        `and(de_user_id.eq.${user.id},para_user_id.eq.${aluno.user_id}),and(de_user_id.eq.${aluno.user_id},para_user_id.eq.${user.id})`,
      )
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!msgs || !msgs.length) {
      container.innerHTML =
        '<div class="text-center py-4 text-gray-400 text-xs">Sem mensagens ainda.</div>';
      return;
    }

    container.innerHTML = msgs
      .map((m) => {
        const isMine = m.de_user_id === user.id;
        const time = new Date(m.created_at).toLocaleTimeString("pt-PT", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `
        <div class="chat-msg ${isMine ? "chat-msg--mine" : "chat-msg--theirs"}">
          <div class="chat-msg__bubble">
            <p>${m.texto}</p>
            <span class="chat-msg__meta">${time}</span>
          </div>
        </div>
      `;
      })
      .join("");

    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error("Erro ao carregar mensagens:", err);
    container.innerHTML =
      '<p class="text-red-500 text-xs">Erro ao carregar mensagens.</p>';
  }
}

async function enviarMensagemTutor(e) {
  e.preventDefault();
  const form = e.target;
  const input = form.texto;
  const texto = input.value.trim();
  if (!texto) return;

  const perfilView = document.getElementById("view-perfil-aluno");
  const alunoId = perfilView.dataset.currentAlunoId;
  const btn = form.querySelector("button");

  try {
    btn.disabled = true;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: aluno } = await supabase
      .from("alunos")
      .select("user_id, id_aluno")
      .eq("id_aluno", alunoId)
      .single();

    if (!aluno?.user_id) throw new Error("Aluno sem conta de utilizador.");

    const { error } = await supabase.from("mensagens").insert({
      de_user_id: user.id,
      para_user_id: aluno.user_id,
      texto: texto,
      id_aluno: aluno.id_aluno,
    });

    if (error) throw error;

    input.value = "";
    await carregarMensagensTutor(alunoId);
  } catch (err) {
    console.error("Erro ao enviar:", err);
    alert("Erro ao enviar: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ================== HELPER: Fechar modais ==================
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = ""; // Restaurar scroll
  }
}

// Iniciar quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
  initAlunosPage();
  if (window.SyncEngine) SyncEngine.initOfflineUI();

  // Abrir Modal
  document
    .getElementById("btn-open-add-aluno")
    ?.addEventListener("click", () => {
      const m = document.getElementById("modal-add-aluno");
      if (m) {
        m.classList.add("open");
        m.setAttribute("aria-hidden", "false");
      }
    });
 
  // Abrir Relatório
  document.getElementById("btnPerfilRelatorio")?.addEventListener("click", () => {
    const alunoId = document.getElementById("view-perfil-aluno").dataset.currentAlunoId;
    if (alunoId) gerarRelatorio(alunoId);
  });

  // Submeter Form de Novo Aluno
  const formNew = document.getElementById("fNewAluno");
  const msgNew = document.getElementById("msgNewAluno");

  formNew?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (msgNew) msgNew.textContent = "A criar aluno...";

    const btn = document.getElementById("btnCreateAluno");
    if (btn) btn.disabled = true;

    const fd = new FormData(formNew);
    const sessMes = Number(fd.get("sessoes_mes") || 1);
    const payload = {
      nome: fd.get("nome"),
      apelido: fd.get("apelido"),
      email: fd.get("email"),
      password: fd.get("password"),
      username: fd.get("username"),
      telemovel: fd.get("telemovel"),
      ano: fd.get("ano"),
      valor_explicacao: fd.get("valor_explicacao"),
      sessoes_mes: sessMes,
      dia_semana_preferido: fd.getAll("dia_semana_preferido").join(", "),
      hora_preferida: fd.get("hora_preferida"),

      nome_pai_cache: fd.get("nome_pai_cache"),

      contacto_pai_cache: fd.get("contacto_pai_cache"),
    };

    try {
      const res = await ExplicadorService.createAluno(payload);
      if (res.error) throw new Error(res.error);

      if (msgNew) {
        msgNew.style.color = "green";
        msgNew.textContent = "Aluno criado com sucesso!";
      }

      formNew.reset();
      setTimeout(() => {
        closeModal("modal-add-aluno");
        initAlunosPage(); // Atualiza a lista
        if (msgNew) msgNew.textContent = "";
      }, 1500);
    } catch (err) {
      console.error(err);
      if (msgNew) {
        msgNew.style.color = "red";
        let msg = err.message || err.error || "Falha técnica";
        if (err.details) msg += ` (${err.details})`;
        msgNew.textContent = "Erro: " + msg;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  // Abrir Modal Novo Exercício
  document
    .getElementById("btn-novo-exercicio")
    ?.addEventListener("click", () => {
      const m = document.getElementById("modal-novo-exercicio");
      if (m) {
        m.classList.add("open");
        m.setAttribute("aria-hidden", "false");
      }
    });

  // Switch Exercício Tipo UI
  const selTipo = document.querySelector('#fNewExercicio select[name="tipo"]');
  selTipo?.addEventListener("change", (e) => {
    const isLink = e.target.value === "LINK";
    document.getElementById("wrapper-input-file").style.display = isLink
      ? "none"
      : "block";
    document.getElementById("wrapper-input-link").style.display = isLink
      ? "block"
      : "none";
  });

  // Submeter Novo Exercício
  const formEx = document.getElementById("fNewExercicio");
  const msgEx = document.getElementById("msgNewExercicio");

  formEx?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnSendExercicio");
    const fd = new FormData(formEx);
    const perfilView = document.getElementById("view-perfil-aluno");
    const alunoId = perfilView.dataset.currentAlunoId;
    const explId = await ExplicadorService.getMyExplId();

    if (msgEx) msgEx.textContent = "A enviar...";
    if (btn) btn.disabled = true;

    try {
      let url = fd.get("url");
      const tipo = fd.get("tipo");
      const file = fd.get("ficheiro");

      if (tipo === "FICHEIRO" && file && file.size > 0) {
        if (msgEx) msgEx.textContent = "A carregar ficheiro para o Storage...";
        const uploadRes = await ExplicadorService.uploadFile(file);
        url = uploadRes.url;
      }

      const payload = {
        id_aluno: alunoId,
        id_explicador: explId,
        nome: fd.get("titulo"),
        tipo: tipo,
        url: url || "",
        data_entrega_prevista: fd.get("data_entrega") || null,
      };

      await ExplicadorService.createExercicio(payload);

      if (msgEx) {
        msgEx.style.color = "green";
        msgEx.textContent = "Enviado com sucesso!";
      }

      formEx.reset();
      setTimeout(async () => {
        closeModal("modal-novo-exercicio");
        const updatedEx = await ExplicadorService.listExercicios(alunoId);
        renderExerciciosTable(updatedEx);
        if (msgEx) msgEx.textContent = "";
      }, 1500);
    } catch (err) {
      console.error(err);
      if (msgEx) {
        msgEx.style.color = "red";
        msgEx.textContent = "Erro: " + (err.message || "Falha ao enviar");
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Abrir Modal Novo Pagamento
  document
    .getElementById("btn-registar-pagamento")
    ?.addEventListener("click", () => {
      openModalPagamento();
    });

  // Submeter Pagamento
  const formPag = document.getElementById("fPagamento");
  const msgPag = document.getElementById("msgPagamento");

  formPag?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnSavePagamento");
    const fd = new FormData(formPag);
    const alunoId =
      document.getElementById("view-perfil-aluno").dataset.currentAlunoId;

    if (msgPag) msgPag.textContent = "A guardar...";
    if (btn) btn.disabled = true;

    try {
      const payload = {
        id_pagamento: fd.get("id_pagamento") || null,
        id_aluno: alunoId,
        ano: fd.get("ano"),
        mes: fd.get("mes"),
        valor_previsto: fd.get("valor_previsto"),
        valor_pago: fd.get("valor_pago"),
        data_pagamento: fd.get("data_pagamento") || null,
        estado: fd.get("estado"),
      };

      await ExplicadorService.upsertPagamento(payload);

      if (msgPag) {
        msgPag.style.color = "green";
        msgPag.textContent = "Guardado com sucesso!";
      }

      setTimeout(async () => {
        closeModal("modal-pagamento");
        const { data: pagamentos } = await supabase
          .from("v_pagamentos_detalhe")
          .select("*")
          .eq("id_aluno", alunoId)
          .order("ano", { ascending: false })
          .order("mes", { ascending: false });
        renderPagamentosTable(pagamentos || []);
        if (msgPag) msgPag.textContent = "";
      }, 1500);
    } catch (err) {
      console.error(err);
      if (msgPag) {
        msgPag.style.color = "red";
        msgPag.textContent = "Erro: " + (err.message || "Falha ao guardar");
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Submeter Diário de Bordo
  const formSess = document.getElementById("fSessaoDetalhe");
  const msgSess = document.getElementById("msgSessaoDetalhe");

  formSess?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnSaveSessaoDetalhe");
    const fd = new FormData(formSess);
    const idSessao = fd.get("id_sessao");
    const alunoId =
      document.getElementById("view-perfil-aluno").dataset.currentAlunoId;

    if (msgSess) {
      msgSess.style.color = "#64748b";
      msgSess.textContent = "A guardar...";
    }
    if (btn) btn.disabled = true;

    try {
      const payload = {
        id_sessao: idSessao,
        id_aluno: alunoId,
        data: sessoesCache.find((s) => s.id_sessao === idSessao)?.data,
        estado: fd.get("estado"),
        sumario: fd.get("sumario"),
        exercicios_realizados: fd.get("exercicios_realizados"),
        notas_proxima_sessao: fd.get("notas_proxima_sessao"),
        observacoes: fd.get("observacoes"),
        hora_fim: fd.get("hora_fim") || null,
      };

      const res = await ExplicadorService.upsertSessao(payload);
      if (res.error) throw new Error(res.error);

      if (msgSess) {
        msgSess.style.color = "green";
        msgSess.textContent = "Guardado com sucesso!";
      }

      // Atualizar cache local e UI sem reload total
      const idx = sessoesCache.findIndex((s) => s.id_sessao === idSessao);
      if (idx !== -1) {
        sessoesCache[idx] = { ...sessoesCache[idx], ...payload };
        renderSessoesTable(sessoesCache);
      }

      setTimeout(() => {
        closeModal("modal-sessao-detalhe");
        if (msgSess) msgSess.textContent = "";
      }, 1500);
    } catch (err) {
      console.error(err);
      if (msgSess) {
        msgSess.style.color = "red";
        msgSess.textContent = "Erro: " + (err.message || "Falha ao guardar");
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // ================== EDITAR ALUNO ==================

  // Botão "Editar Perfil" na vista de perfil
  document.getElementById("btnPerfilEditar")?.addEventListener("click", () => {
    const perfilView = document.getElementById("view-perfil-aluno");
    const alunoId = perfilView?.dataset.currentAlunoId;
    if (alunoId) openEditAluno(alunoId);
  });

  // Botão "Eliminar Aluno" na vista de perfil
  document
    .getElementById("btnPerfilEliminar")
    ?.addEventListener("click", handleDeleteAluno);

  // Submit do Form Editar Aluno
  const formEdit = document.getElementById("fEditAluno");
  const msgEdit = document.getElementById("msgEditAluno");

  formEdit?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnSaveEditAluno");
    if (btn) btn.disabled = true;
    if (msgEdit) {
      msgEdit.style.color = "#64748b";
      msgEdit.textContent = "A guardar...";
    }

    const fd = new FormData(formEdit);
    const sessMes = Number(fd.get("sessoes_mes") || 1);

    const payload = {
      id_aluno: fd.get("id_aluno"),
      nome: fd.get("nome"),
      apelido: fd.get("apelido"),
      telemovel: fd.get("telemovel"),
      ano: fd.get("ano"),
      valor_explicacao: fd.get("valor_explicacao"),
      sessoes_mes: sessMes,
      dia_semana_preferido: fd.getAll("dia_semana_preferido").join(", "),
      hora_preferida: fd.get("hora_preferida"),

      nome_pai_cache: fd.get("nome_pai_cache"),

      contacto_pai_cache: fd.get("contacto_pai_cache"),
      username: fd.get("username"),
      is_active: document.getElementById("edit-active").checked,
    };

    // Only send password if it was filled in
    const pw = fd.get("password")?.trim();
    if (pw && pw.length >= 6) payload.password = pw;

    try {
      const res = await ExplicadorService.updateAluno(payload);
      if (res.error) throw new Error(res.error);

      if (msgEdit) {
        msgEdit.style.color = "green";
        msgEdit.textContent = "Guardado!";
      }
      setTimeout(() => {
        closeModal("modal-edit-aluno");
        if (msgEdit) msgEdit.textContent = "";
        // Refresh perfil and list
        openPerfil(payload.id_aluno);
        initAlunosPage();
      }, 1000);
    } catch (err) {
      console.error(err);
      if (msgEdit) {
        msgEdit.style.color = "red";
        msgEdit.textContent = "Erro: " + (err.message || "Falha técnica");
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Listener para o form de chat no perfil
  document
    .getElementById("fMsgExpl")
    ?.addEventListener("submit", enviarMensagemTutor);

  // Hook para carregar mensagens quando a tab é aberta
  // Como showPerfilTab é global e definida em explicador.js, vamos adicionar um listener
  // manual nos botões de Tab para disparar o load se for mensagens.
  document.querySelectorAll('.tab[data-tab="mensagens"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const alunoId =
        document.getElementById("view-perfil-aluno").dataset.currentAlunoId;
      if (alunoId) carregarMensagensTutor(alunoId);
    });
  });

  // Abrir o perfil diretamente se houver um ID na URL (vindo do Dashboard)
  const urlParams = new URLSearchParams(window.location.search);
  const idToOpen = urlParams.get('id');
  if (idToOpen) {
    // delay curto para garantir que os elementos e o fetch inicial resolveram
    setTimeout(() => openPerfil(idToOpen), 600);
  }
});

// ================== OPEN EDIT ALUNO ==================

async function openEditAluno(id) {
  try {
    const aluno = await ExplicadorService.getAluno(id);
    if (!aluno) return;

    document.getElementById("edit-id-aluno").value = aluno.id_aluno;
    document.getElementById("edit-nome").value = aluno.nome || "";
    document.getElementById("edit-apelido").value = aluno.apelido || "";
    document.getElementById("edit-telemovel").value = aluno.telemovel || "";
    document.getElementById("edit-ano").value = aluno.ano || "";
    document.getElementById("edit-valor").value = aluno.valor_explicacao || "";
    document.getElementById("edit-sessoes").value = aluno.sessoes_mes || 1;
    // Checkboxes para múltiplos dias
    const dias = (aluno.dia_semana_preferido || "")
      .split(",")
      .map((d) => d.trim());
    document
      .querySelectorAll('#container-edit-dias input[type="checkbox"]')
      .forEach((ck) => {
        ck.checked = dias.includes(ck.value);
      });

    document.getElementById("edit-hora").value =
      aluno.hora_preferida || "16:00";

    document.getElementById("edit-nome-pai").value = aluno.nome_pai_cache || "";
    document.getElementById("edit-contacto-pai").value =
      aluno.contacto_pai_cache || "";
    document.getElementById("edit-active").checked = aluno.is_active !== false;
    document.getElementById("edit-username").value = aluno.username || "";
    document.getElementById("edit-password").value = "";

    calcPrevistoEdit();

    const m = document.getElementById("modal-edit-aluno");
    if (m) {
      m.classList.add("open");
      m.setAttribute("aria-hidden", "false");
    }
  } catch (err) {
    console.error("Erro ao abrir modal de edição:", err);
    alert("Erro ao carregar dados do aluno.");
  }
}

// ================== BILLING CALC ==================

function calcPrevistoAdd() {
  const v = Number(document.getElementById("in-add-valor")?.value || 0);
  const s = Number(document.getElementById("in-add-sessoes")?.value || 1);
  const total = v * s;
  const el = document.getElementById("add-previsto-mensal");
  if (el) el.textContent = formatCurrency(total);
}

function calcPrevistoEdit() {
  const v = Number(document.getElementById("edit-valor")?.value || 0);
  const s = Number(document.getElementById("edit-sessoes")?.value || 1);
  const total = v * s;
  const el = document.getElementById("edit-previsto-mensal");
  if (el) el.textContent = formatCurrency(total);
}

async function gerarRelatorio(id) {
  const modal = document.getElementById("modal-relatorio");
  const content = document.getElementById("relatorio-content");
  if (!modal || !content) return;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden"; // Prevenir scroll do fundo
  content.innerHTML = '<div class="text-center py-12"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div><p class="text-gray-500">A processar dados e gerar relatório profissional...</p></div>';

  try {
    const aluno = await ExplicadorService.getAluno(id);
    const sessoes = await ExplicadorService.listSessoes(id);
    const explId = await ExplicadorService.getMyExplId();
    const { data: expl } = await supabase.from('explicadores').select('nome').eq('id_explicador', explId).single();

    // Filter sessions for current month
    const agora = new Date();
    const mesAtual = agora.getMonth();
    const anoAtual = agora.getFullYear();
    
    // Sort all sessions first
    const sortedSessoes = [...sessoes].sort((a, b) => a.data.localeCompare(b.data));
    
    // Sessions for the current month
    const sessoesMes = sortedSessoes.filter(s => {
      const d = new Date(s.data);
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    });

    const realizasMes = sessoesMes.filter(s => s.estado === 'REALIZADA');

    const valorSessao = Number(aluno.valor_explicacao || 0);
    const sessoesPactadas = Number(aluno.sessoes_mes || 0);
    const totalMes = realizasMes.length * valorSessao;
    const mensalidadePactada = valorSessao * sessoesPactadas;

    const html = `
      <div class="relatorio-paper">
        <!-- CABEÇALHO PROFISSIONAL -->
        <div class="relatorio-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #b91c1c; padding-bottom: 20px; margin-bottom: 30px;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <img src="../../public/img/imagens/logo-icon192.png" alt="Logo" style="width: 50px; height: 50px; object-fit: contain;">
            <div>
              <h1 style="color: #b91c1c; font-weight: 800; font-size: 26px; margin: 0; letter-spacing: -0.02em;">EduSphere</h1>
              <p style="color: #64748b; font-size: 13px; font-weight: 600; margin: 2px 0 0; text-transform: uppercase; letter-spacing: 0.05em;">Relatório Mensal de Atividade</p>
            </div>
          </div>
          <div style="text-align: right">
            <p style="font-weight: 700; color: #1e293b; font-size: 16px; margin: 0;">${expl?.nome || 'Explicador'}</p>
            <p style="font-size: 12px; color: #94a3b8; font-weight: 500; margin: 2px 0 0;">Emitido em ${agora.toLocaleDateString('pt-PT')}</p>
          </div>
        </div>

        <div class="relatorio-grid" style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; margin-bottom: 30px;">
          <div class="relatorio-info-box" style="background: #fff; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <h3 style="color: #b91c1c; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 18px; font-weight: 800; border-left: 4px solid #b91c1c; padding-left: 10px;">Perfil do Aluno</h3>
            <div class="relatorio-data-row" style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
              <span style="color: #64748b;">Nome Completo</span>
              <span style="font-weight: 700; color: #0f172a;">${aluno.nome} ${aluno.apelido || ''}</span>
            </div>
            <div class="relatorio-data-row" style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
              <span style="color: #64748b;">Ano Escolar</span>
              <span style="font-weight: 700; color: #0f172a;">${aluno.ano}º Ano de Escolaridade</span>
            </div>
            <div class="relatorio-data-row" style="display: flex; justify-content: space-between; font-size: 15px;">
              <span style="color: #64748b;">Período de Referência</span>
              <span style="font-weight: 700; color: #0f172a; text-transform: capitalize;">${agora.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}</span>
            </div>
          </div>

          <div class="relatorio-info-box" style="background: #fef2f2; padding: 24px; border-radius: 12px; border: 1px solid #fee2e2;">
            <h3 style="color: #991b1b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 18px; font-weight: 800;">Resumo do Mês</h3>
            <div class="relatorio-data-row" style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
              <span style="color: #b91c1c; opacity: 0.8;">Sessões Realizadas</span>
              <span style="font-weight: 700; color: #991b1b;">${realizasMes.length}</span>
            </div>
            <div class="relatorio-data-row" style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
              <span style="color: #b91c1c; opacity: 0.8;">Investimento p/ Sessão</span>
              <span style="font-weight: 700; color: #991b1b;">${formatCurrency(valorSessao)}</span>
            </div>
            <div class="relatorio-data-row" style="display: flex; justify-content: space-between; font-size: 15px; padding-top: 12px; border-top: 1px dashed #fecaca; margin-top: 5px;">
              <span style="color: #991b1b; font-weight: 800;">Total Acumulado</span>
              <span style="font-weight: 900; color: #b91c1c; font-size: 18px;">${formatCurrency(totalMes)}</span>
            </div>
          </div>
        </div>

        <h2 class="relatorio-section-title" style="font-size: 18px; font-weight: 800; color: #1e293b; margin: 40px 0 20px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
          <span style="background: #b91c1c; color: white; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </span>
          Histórico de Atividade e Evolução
        </h2>
        
        <div style="overflow: hidden; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 40px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <table class="relatorio-sessions-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <th style="padding: 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 800; width: 130px;">Data / Hora</th>
                <th style="padding: 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 800;">Sumário e Notas Pedagógicas</th>
              </tr>
            </thead>
            <tbody>
              ${sessoesMes.length ? sessoesMes.map(s => {
                const dateObj = new Date(s.data);
                const isPast = s.estado === 'REALIZADA';
                const rowStyle = isPast ? '' : 'opacity: 0.5; background: #fdfdfd;';
                const statusBadge = isPast ? '' : `<span style="font-size: 10px; background: #f1f5f9; color: #94a3b8; padding: 2px 8px; border-radius: 4px; margin-left: 10px; font-weight: 700;">${s.estado}</span>`;
                
                return `
                <tr style="border-bottom: 1px solid #f1f5f9; ${rowStyle}">
                  <td style="padding: 18px 16px; vertical-align: top;">
                    <div style="font-weight: 800; color: #1e293b; font-size: 14px;">${dateObj.toLocaleDateString('pt-PT')}</div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px; font-weight: 500;">${(s.hora_inicio || '').slice(0,5)}h</div>
                  </td>
                  <td style="padding: 18px 16px;">
                    <div style="font-size: 15px; color: #334155; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center;">
                      ${s.sumario || 'Sessão Registada'} ${statusBadge}
                    </div>
                    ${s.observacoes ? `<div style="font-size: 13px; color: #475569; background: #f8fafc; padding: 12px; border-radius: 10px; border-left: 4px solid #cbd5e1; font-style: italic; line-height: 1.5; margin-bottom: 10px;">"${s.observacoes}"</div>` : ''}
                    ${s.exercicios_realizados ? `<div style="font-size: 13px; color: #64748b; display: flex; align-items: center; gap: 8px;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      <strong style="color: #475569;">Exercícios:</strong> ${s.exercicios_realizados}
                    </div>` : ''}
                  </td>
                </tr>
                `;
              }).join('') : '<tr><td colspan="2" style="padding: 40px; text-align: center; color: #94a3b8; font-weight: 500;">Nenhuma atividade pedagógica registada no período selecionado.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 40px;">
          <div style="background: #fff; padding: 20px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0; border-top: 4px solid #64748b;">
            <p style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800; margin-bottom: 8px; letter-spacing: 0.05em;">Acordo Mensal</p>
            <p style="font-size: 22px; font-weight: 800; color: #1e293b;">${formatCurrency(mensalidadePactada)}</p>
          </div>
          <div style="background: #fff; padding: 20px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0; border-top: 4px solid #64748b;">
            <p style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800; margin-bottom: 8px; letter-spacing: 0.05em;">Aulas Contratadas</p>
            <p style="font-size: 22px; font-weight: 800; color: #1e293b;">${sessoesPactadas}</p>
          </div>
          <div style="background: #b91c1c; padding: 20px; border-radius: 12px; text-align: center; color: white; box-shadow: 0 10px 15px -3px rgba(185, 28, 28, 0.2);">
            <p style="font-size: 11px; text-transform: uppercase; color: #ffffff; opacity: 0.9; font-weight: 800; margin-bottom: 8px; letter-spacing: 0.05em;">Previsão Próximo Mês</p>
            <p style="font-size: 24px; font-weight: 900;">${formatCurrency(mensalidadePactada)}</p>
          </div>
        </div>

        <div class="relatorio-footer" style="margin-top: 80px; padding-top: 30px; border-top: 1px solid #f1f5f9; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 15px;">
          <div style="display: flex; gap: 40px; color: #94a3b8; font-size: 12px; font-weight: 500;">
            <span>Doc: REL-${aluno.id_aluno.slice(0,8).toUpperCase()}</span>
            <span>Sistema: EduSphere Core v2.0</span>
            <span>Ref: Pedagógico-Mensal</span>
          </div>
          <p style="color: #64748b; font-size: 12px; max-width: 500px; line-height: 1.6;">Este documento é um relatório informativo de acompanhamento escolar gerado automaticamente pela plataforma <strong>EduSphere</strong>. Tem como objetivo a transparência e a partilha de progresso entre o explicador e os encarregados de educação.</p>
          <div style="margin-top: 10px; font-weight: 900; color: #b91c1c; font-size: 18px; letter-spacing: 4px; opacity: 0.3;">EDUSPHERE</div>
        </div>
      </div>
    `;

    content.innerHTML = html;
  } catch (err) {
    console.error(err);
    content.innerHTML = `
      <div class="text-center py-12">
        <div style="color: #ef4444; margin-bottom: 20px; display: flex; justify-content: center;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        </div>
        <h3 style="font-weight: 700; color: #1e293b; margin-bottom: 10px;">Erro ao gerar relatório</h3>
        <p style="color: #64748b; font-size: 14px;">${err.message}</p>
        <button class="button secondary mt-6" onclick="closeModal('modal-relatorio')">Fechar</button>
      </div>
    `;
  }
}
