// public/js/alunos-explicador.js

async function initAlunosPage() {
  console.log("Initializing Alunos Page...");
  
  const grid = document.getElementById('alunos-cards-grid');
  grid.innerHTML = '<p>A carregar...</p>';

  try {
    const list = await ExplicadorService.listAlunos();
    
    // Update Counts
    document.getElementById('contagem').textContent = list.length;
    // Limit (fake data for now)
    document.getElementById('limite').textContent = "10"; // Default from schema
    document.getElementById('restantes').textContent = (10 - list.length);

    if (list.length === 0) {
      grid.innerHTML = '<p class="empty-state">Sem alunos registados.</p>';
      return;
    }

    grid.innerHTML = '';
    list.forEach(renderAlunoCard);

  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p style="color:red">Erro: ${err.message}</p>`;
  }
}

function renderAlunoCard(aluno) {
  const container = document.getElementById('alunos-cards-grid');
  const div = document.createElement('div');
  div.className = 'dash-aluno-card';
  
  const statusBadge = aluno.is_active 
     ? '<span class="dash-aluno-card__badge" style="background:#dcfce7;color:#166534">Ativo</span>'
     : '<span class="dash-aluno-card__badge" style="background:#fef2f2;color:#991b1b">Inativo</span>';

  const prox = aluno.proxima_sessao_data 
     ? new Date(aluno.proxima_sessao_data).toLocaleDateString('pt-PT', {day:'numeric', month:'short'}) + (aluno.proxima_sessao_hora ? ' às ' + aluno.proxima_sessao_hora.slice(0,5) : '')
     : 'Sem aulas';

  // Billing: valor/sessão × sessões/semana × 4.33
  const valorSessao = Number(aluno.valor_explicacao || 0);
  const sessSemana = Number(aluno.sessoes_mes || 1);
  const previstoMensal = valorSessao * sessSemana * 4.33;

  div.innerHTML = `
    <div class="dash-aluno-card__top">
      <div class="dash-aluno-card__avatar">${(aluno.nome||'?')[0]}</div>
      <div class="dash-aluno-card__info">
        <h3 class="dash-aluno-card__name">${aluno.nome} ${aluno.apelido||''}</h3>
        <p class="dash-aluno-card__year">${aluno.ano || '?'}º Ano</p>
      </div>
      <div>${statusBadge}</div>
    </div>
    <div class="dash-aluno-card__content">
       <div class="dash-aluno-card__row">
         <span class="dash-aluno-card__label">Previsão mensal</span>
         <span class="dash-aluno-card__date" style="font-weight:600; color:#16a34a;">${formatCurrency(previstoMensal)}</span>
       </div>
       <div class="dash-aluno-card__row">
         <span class="dash-aluno-card__label">Sessões/semana</span>
         <span class="dash-aluno-card__date">${sessSemana} × ${formatCurrency(valorSessao)}</span>
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
  return new Intl.NumberFormat('pt-PT', {style:'currency', currency:'EUR'}).format(v); 
}

async function openPerfil(id) {
  console.log("Open perfil", id);
  const listView = document.getElementById('view-lista-alunos');
  const perfilView = document.getElementById('view-perfil-aluno');
  
  if (!listView || !perfilView) return;

  listView.style.display = 'none';
  perfilView.style.display = 'block';

  try {
    // 1. Carregar Dados do Aluno
    const aluno = await ExplicadorService.getAluno(id);
    document.getElementById('alunoNome').textContent = `${aluno.nome} ${aluno.apelido || ''}`;
    document.getElementById('alunoAvatar').textContent = (aluno.nome || '?')[0];
    document.getElementById('alunoAno').textContent = `${aluno.ano || '?'}º Ano`;
    document.getElementById('alunoEmail').textContent = aluno.email || '—';
    document.getElementById('alunoTele').textContent = aluno.telemovel || '—';
    document.getElementById('alunoDataInscricao').textContent = aluno.created_at ? new Date(aluno.created_at).toLocaleDateString('pt-PT') : '—';
    
    // Status Badge
    const statusEl = document.getElementById('alunoStatus');
    statusEl.textContent = aluno.is_active ? 'Ativo' : 'Inativo';
    statusEl.className = `badge status ${aluno.is_active ? 'active' : 'inactive'}`;

    // ID do aluno guardado para o modal de exercício
    perfilView.dataset.currentAlunoId = id;

    // 2. Carregar Explicações
    const sessoes = await ExplicadorService.listSessoes(id);
    renderSessoesTable(sessoes);
    
    // Update Próxima Aula KPI
    const hoje = new Date().toISOString();
    const proxSessao = sessoes.filter(s => s.data >= hoje.split('T')[0] && s.estado === 'AGENDADA')
                              .sort((a,b) => (a.data+a.hora_inicio).localeCompare(b.data+b.hora_inicio))[0];
    document.getElementById('proximaAulaTxt').textContent = proxSessao 
        ? `${new Date(proxSessao.data).toLocaleDateString('pt-PT')} às ${proxSessao.hora_inicio?.slice(0,5)}`
        : 'Sem sessões agendadas';

    // 3. Carregar Exercícios
    const exercicios = await ExplicadorService.listExercicios(id);
    renderExerciciosTable(exercicios);

    // 4. Carregar Pagamentos
    // Nota: listPagamentos ainda não está no service, mas podemos usar fallback ou implementar
    // Por agora, vamos deixar placeholder se falhar
    try {
      const { data: pagamentos } = await supabase.from('v_pagamentos_detalhe').select('*').eq('id_aluno', id).order('ano', {ascending:false}).order('mes', {ascending:false});
      renderPagamentosTable(pagamentos || []);
    } catch(e) { console.warn("Erro ao carregar pagamentos:", e); }

  } catch (err) {
    console.error("Erro ao abrir perfil:", err);
    alert("Erro ao carregar dados do aluno.");
    fecharPerfilAluno(); 
  }
}

function renderSessoesTable(list) {
  const tbody = document.getElementById('listaExplicacoes');
  if (!tbody) return;
  tbody.innerHTML = list.length ? list.map(s => `
    <tr>
      <td>${new Date(s.data).toLocaleDateString('pt-PT')}</td>
      <td>${s.hora_inicio?.slice(0,5)}</td>
      <td>—</td>
      <td>${s.duracao_min} min</td>
      <td><span class="badge ${s.estado?.toLowerCase()}">${s.estado}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="5">Sem histórico.</td></tr>';
}

function renderPagamentosTable(list) {
  const tbody = document.getElementById('listaPagamentos');
  const totalEl = document.getElementById('pagTotal');
  if (!tbody) return;
  
  let totalVisible = 0;
  tbody.innerHTML = list.length ? list.map(p => {
    totalVisible += Number(p.valor_pago || 0);
    // Armazenar os dados na row para edição fácil
    const pJson = JSON.stringify(p).replace(/"/g, '&quot;');
    return `
      <tr data-pagamento='${pJson}'>
        <td>${p.data_pagamento ? new Date(p.data_pagamento).toLocaleDateString('pt-PT') : '—'}</td>
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
  }).join('') : '<tr><td colspan="6">Sem pagamentos.</td></tr>';
  
  if (totalEl) totalEl.textContent = totalVisible.toFixed(2);
}

async function openModalPagamento(id = null) {
  const m = document.getElementById('modal-pagamento');
  const form = document.getElementById('fPagamento');
  const title = document.getElementById('modal-pagamento-titulo');
  if (!m || !form) return;

  form.reset();
  document.getElementById('in-pag-id').value = id || '';
  
  const alunoId = document.getElementById('view-perfil-aluno').dataset.currentAlunoId;
  const aluno = await ExplicadorService.getAluno(alunoId);

  if (id) {
    title.textContent = "Editar Pagamento";
    // Procurar os dados na tabela
    const row = document.querySelector(`tr[data-pagamento*="${id}"]`);
    if (row) {
      const p = JSON.parse(row.dataset.pagamento);
      document.getElementById('in-pag-mes').value = p.mes;
      document.getElementById('in-pag-ano').value = p.ano;
      document.getElementById('in-pag-prev').value = p.valor_previsto;
      document.getElementById('in-pag-pago').value = p.valor_pago;
      document.getElementById('in-pag-data').value = p.data_pagamento || '';
      document.getElementById('in-pag-estado').value = p.estado;
    }
  } else {
    title.textContent = "Registar Pagamento";
    document.getElementById('in-pag-mes').value = new Date().getMonth() + 1;
    document.getElementById('in-pag-ano').value = new Date().getFullYear();
    document.getElementById('in-pag-prev').value = aluno.valor_explicacao || 0;
  }

  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
}

async function handleDeletePagamento(id) {
  if (!confirm("Tem a certeza que deseja eliminar este registo de pagamento?")) return;
  try {
    await ExplicadorService.deletePagamento(id);
    const alunoId = document.getElementById('view-perfil-aluno').dataset.currentAlunoId;
    // Recarregar pagamentos
    const { data: pagamentos } = await supabase.from('v_pagamentos_detalhe').select('*').eq('id_aluno', alunoId).order('ano', {ascending:false}).order('mes', {ascending:false});
    renderPagamentosTable(pagamentos || []);
  } catch(e) { alert("Erro ao eliminar: " + e.message); }
}

function renderExerciciosTable(list) {
  const tbody = document.getElementById('listaExercicios');
  if (!tbody) return;
  
  tbody.innerHTML = list.length ? list.map(e => `
    <tr>
      <td>${new Date(e.data_envio).toLocaleDateString('pt-PT')}</td>
      <td>${e.nome}</td>
      <td>${e.data_entrega_prevista ? new Date(e.data_entrega_prevista).toLocaleDateString('pt-PT') : '—'}</td>
      <td><span class="badge ${e.is_concluido ? 'realizada' : 'agendada'}">${e.is_concluido ? 'Concluído' : 'Pendente'}</span></td>
      <td>
        <div style="display:flex; gap:8px;">
           <a href="${e.url}" target="_blank" class="button secondary button--sm" title="Ver/Download">🔗</a>
           <button class="button secondary button--sm" onclick="deleteExercicio('${e.id_exercicio}')" title="Apagar">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="5">Ainda não enviou exercícios.</td></tr>';
}

async function deleteExercicio(id) {
  if (!confirm("Tem a certeza que deseja apagar este exercício?")) return;
  try {
    await ExplicadorService.deleteExercicio(id);
    const alunoId = document.getElementById('view-perfil-aluno').dataset.currentAlunoId;
    const exercicios = await ExplicadorService.listExercicios(alunoId);
    renderExerciciosTable(exercicios);
  } catch(e) { alert("Erro ao apagar: " + e.message); }
}

// Helper: Fechar modais
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
  }
}

// Iniciar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  initAlunosPage();

  // Abrir Modal
  document.getElementById('btn-open-add-aluno')?.addEventListener('click', () => {
    const m = document.getElementById('modal-add-aluno');
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  });

  // Submeter Form de Novo Aluno
  const formNew = document.getElementById('fNewAluno');
  const msgNew = document.getElementById('msgNewAluno');

  formNew?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (msgNew) msgNew.textContent = 'A criar aluno...';
    
    const btn = document.getElementById('btnCreateAluno');
    if (btn) btn.disabled = true;

    const fd = new FormData(formNew);
    const sessSemana = Number(fd.get('sessoes_semana') || 1);
    const payload = {
      nome: fd.get('nome'),
      apelido: fd.get('apelido'),
      email: fd.get('email'),
      password: "mudar123",
      telemovel: fd.get('telemovel'),
      ano: fd.get('ano'),
      valor_explicacao: fd.get('valor_explicacao'),
      sessoes_mes: sessSemana,
      dia_semana_preferido: fd.get('dia_semana_preferido'),
      nome_pai_cache: fd.get('nome_pai_cache'),
      contacto_pai_cache: fd.get('contacto_pai_cache')
    };

    try {
      const res = await ExplicadorService.createAluno(payload);
      if (res.error) throw new Error(res.error);

      if (msgNew) {
        msgNew.style.color = 'green';
        msgNew.textContent = 'Aluno criado com sucesso!';
      }
      
      formNew.reset();
      setTimeout(() => {
        closeModal('modal-add-aluno');
        initAlunosPage(); // Atualiza a lista
        if (msgNew) msgNew.textContent = '';
      }, 1500);

    } catch (err) {
      console.error(err);
      if (msgNew) {
        msgNew.style.color = 'red';
        msgNew.textContent = 'Erro: ' + (err.message || err.error || "Falha técnica");
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  // Abrir Modal Novo Exercício
  document.getElementById('btn-novo-exercicio')?.addEventListener('click', () => {
    const m = document.getElementById('modal-novo-exercicio');
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  });

  // Switch Exercício Tipo UI
  const selTipo = document.querySelector('#fNewExercicio select[name="tipo"]');
  selTipo?.addEventListener('change', (e) => {
    const isLink = e.target.value === 'LINK';
    document.getElementById('wrapper-input-file').style.display = isLink ? 'none' : 'block';
    document.getElementById('wrapper-input-link').style.display = isLink ? 'block' : 'none';
  });

  // Submeter Novo Exercício
  const formEx = document.getElementById('fNewExercicio');
  const msgEx = document.getElementById('msgNewExercicio');

  formEx?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSendExercicio');
    const fd = new FormData(formEx);
    const perfilView = document.getElementById('view-perfil-aluno');
    const alunoId = perfilView.dataset.currentAlunoId;
    const explId = await ExplicadorService.getMyExplId();

    if (msgEx) msgEx.textContent = 'A enviar...';
    if (btn) btn.disabled = true;

    try {
      let url = fd.get('url');
      const tipo = fd.get('tipo');
      const file = fd.get('ficheiro');

      if (tipo === 'FICHEIRO' && file && file.size > 0) {
        if (msgEx) msgEx.textContent = 'A carregar ficheiro para o Storage...';
        const uploadRes = await ExplicadorService.uploadFile(file);
        url = uploadRes.url;
      }

      const payload = {
        id_aluno: alunoId,
        id_explicador: explId,
        nome: fd.get('titulo'),
        tipo: tipo,
        url: url || '',
        data_entrega_prevista: fd.get('data_entrega') || null
      };

      await ExplicadorService.createExercicio(payload);

      if (msgEx) {
        msgEx.style.color = 'green';
        msgEx.textContent = 'Enviado com sucesso!';
      }
      
      formEx.reset();
      setTimeout(async () => {
        closeModal('modal-novo-exercicio');
        const updatedEx = await ExplicadorService.listExercicios(alunoId);
        renderExerciciosTable(updatedEx);
        if (msgEx) msgEx.textContent = '';
      }, 1500);

    } catch (err) {
      console.error(err);
      if (msgEx) {
        msgEx.style.color = 'red';
        msgEx.textContent = 'Erro: ' + (err.message || "Falha ao enviar");
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Abrir Modal Novo Pagamento
  document.getElementById('btn-registar-pagamento')?.addEventListener('click', () => {
    openModalPagamento();
  });

  // Submeter Pagamento
  const formPag = document.getElementById('fPagamento');
  const msgPag = document.getElementById('msgPagamento');

  formPag?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSavePagamento');
    const fd = new FormData(formPag);
    const alunoId = document.getElementById('view-perfil-aluno').dataset.currentAlunoId;

    if (msgPag) msgPag.textContent = 'A guardar...';
    if (btn) btn.disabled = true;

    try {
      const payload = {
        id_pagamento: fd.get('id_pagamento') || null,
        id_aluno: alunoId,
        ano: fd.get('ano'),
        mes: fd.get('mes'),
        valor_previsto: fd.get('valor_previsto'),
        valor_pago: fd.get('valor_pago'),
        data_pagamento: fd.get('data_pagamento') || null,
        estado: fd.get('estado')
      };

      await ExplicadorService.upsertPagamento(payload);

      if (msgPag) {
        msgPag.style.color = 'green';
        msgPag.textContent = 'Guardado com sucesso!';
      }
      
      setTimeout(async () => {
        closeModal('modal-pagamento');
        const { data: pagamentos } = await supabase.from('v_pagamentos_detalhe').select('*').eq('id_aluno', alunoId).order('ano', {ascending:false}).order('mes', {ascending:false});
        renderPagamentosTable(pagamentos || []);
        if (msgPag) msgPag.textContent = '';
      }, 1500);

    } catch (err) {
      console.error(err);
      if (msgPag) {
        msgPag.style.color = 'red';
        msgPag.textContent = 'Erro: ' + (err.message || "Falha ao guardar");
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // ================== EDITAR ALUNO ==================

  // Botão "Editar Perfil" na vista de perfil
  document.getElementById('btnPerfilEditar')?.addEventListener('click', () => {
    const perfilView = document.getElementById('view-perfil-aluno');
    const alunoId = perfilView?.dataset.currentAlunoId;
    if (alunoId) openEditAluno(alunoId);
  });

  // Submit do Form Editar Aluno
  const formEdit = document.getElementById('fEditAluno');
  const msgEdit = document.getElementById('msgEditAluno');

  formEdit?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSaveEditAluno');
    if (btn) btn.disabled = true;
    if (msgEdit) { msgEdit.style.color = '#64748b'; msgEdit.textContent = 'A guardar...'; }

    const fd = new FormData(formEdit);
    const sessSemana = Number(fd.get('sessoes_semana') || 1);

    const payload = {
      id_aluno: fd.get('id_aluno'),
      nome: fd.get('nome'),
      apelido: fd.get('apelido'),
      telemovel: fd.get('telemovel'),
      ano: fd.get('ano'),
      valor_explicacao: fd.get('valor_explicacao'),
      sessoes_mes: sessSemana,
      dia_semana_preferido: fd.get('dia_semana_preferido'),
      nome_pai_cache: fd.get('nome_pai_cache'),
      contacto_pai_cache: fd.get('contacto_pai_cache'),
      is_active: document.getElementById('edit-active').checked
    };

    try {
      const res = await ExplicadorService.updateAluno(payload);
      if (res.error) throw new Error(res.error);

      if (msgEdit) { msgEdit.style.color = 'green'; msgEdit.textContent = 'Guardado!'; }
      setTimeout(() => {
        closeModal('modal-edit-aluno');
        if (msgEdit) msgEdit.textContent = '';
        // Refresh perfil and list
        openPerfil(payload.id_aluno);
        initAlunosPage();
      }, 1000);
    } catch (err) {
      console.error(err);
      if (msgEdit) { msgEdit.style.color = 'red'; msgEdit.textContent = 'Erro: ' + (err.message || 'Falha técnica'); }
    } finally {
      if (btn) btn.disabled = false;
    }
  });
});

// ================== OPEN EDIT ALUNO ==================

async function openEditAluno(id) {
  try {
    const aluno = await ExplicadorService.getAluno(id);
    if (!aluno) return;

    document.getElementById('edit-id-aluno').value = aluno.id_aluno;
    document.getElementById('edit-nome').value = aluno.nome || '';
    document.getElementById('edit-apelido').value = aluno.apelido || '';
    document.getElementById('edit-telemovel').value = aluno.telemovel || '';
    document.getElementById('edit-ano').value = aluno.ano || '';
    document.getElementById('edit-valor').value = aluno.valor_explicacao || '';
    document.getElementById('edit-sessoes').value = aluno.sessoes_mes || 1;
    document.getElementById('edit-dia').value = aluno.dia_semana_preferido || '';
    document.getElementById('edit-hora').value = '16:00';
    document.getElementById('edit-nome-pai').value = aluno.nome_pai_cache || '';
    document.getElementById('edit-contacto-pai').value = aluno.contacto_pai_cache || '';
    document.getElementById('edit-active').checked = aluno.is_active !== false;

    calcPrevistoEdit();

    const m = document.getElementById('modal-edit-aluno');
    if (m) { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
  } catch (err) {
    console.error('Erro ao abrir modal de edição:', err);
    alert('Erro ao carregar dados do aluno.');
  }
}

// ================== BILLING CALC ==================

function calcPrevistoAdd() {
  const v = Number(document.getElementById('in-add-valor')?.value || 0);
  const s = Number(document.getElementById('in-add-sessoes')?.value || 1);
  const total = v * s * 4.33;
  const el = document.getElementById('add-previsto-mensal');
  if (el) el.textContent = formatCurrency(total);
}

function calcPrevistoEdit() {
  const v = Number(document.getElementById('edit-valor')?.value || 0);
  const s = Number(document.getElementById('edit-sessoes')?.value || 1);
  const total = v * s * 4.33;
  const el = document.getElementById('edit-previsto-mensal');
  if (el) el.textContent = formatCurrency(total);
}
