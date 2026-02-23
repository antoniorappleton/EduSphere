// public/js/dashboard-explicador.js

const DASH_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DASH_DIAS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

let _dashPagamentos = [];

async function loadDashboard() {
  console.log("Loading Dashboard...");

  // 1. Verificar Sessão
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.href = '../../index.html';
    return;
  }

  // 2. Obter ID do Explicador
  const explId = await ExplicadorService.getMyExplId();
  if (!explId) {
    const { data: userProfile } = await supabase.from('app_users').select('role').eq('user_id', session.user.id).single();
    if (userProfile && userProfile.role === 'admin') {
       console.log("Admin detetado sem perfil de Explicador. A criar...");
       await supabase.from('explicadores').insert([{ user_id: session.user.id, nome: 'Admin (Modo Explicador)', email: session.user.email }]);
       location.reload();
       return;
    }
    document.getElementById('dash-alunos-contador').textContent = "(Sem perfil)";
    return;
  }

  // 3. Fetch KPIs (Pagamentos)
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  // Fetch ALL pagamentos for KPIs + status detection (last 12 months)
  const { data: allPagsExpl } = await supabase
    .from('pagamentos')
    .select('valor_previsto, valor_pago, estado, id_aluno, ano, mes')
    .eq('id_explicador', explId)
    .gte('ano', currentYear - 1)
    .order('ano', { ascending: false })
    .order('mes', { ascending: false });

  // Current month subset for KPIs
  const pags = (allPagsExpl || []).filter(p => Number(p.ano) === currentYear && Number(p.mes) === currentMonth);

  let totalPrevisto = 0;
  let totalRealizado = 0;
  let totalPendentes = 0;

  if (pags) {
    pags.forEach(p => {
      const prev = parseFloat(p.valor_previsto || 0);
      const pago = parseFloat(p.valor_pago || 0);
      totalPrevisto += prev;
      totalRealizado += pago;
      if (p.estado !== 'PAGO') {
        totalPendentes += (prev - pago);
      }
    });
  }

  updateKpis(totalPrevisto, totalRealizado, totalPendentes);

  // 3.1. Auto-Reset dos Sinos
  if (pags && pags.length > 0) {
    const alunosPagosNesteMes = pags.filter(p => p.estado === 'PAGO').map(p => p.id_aluno);
    if (alunosPagosNesteMes.length > 0) {
      await supabase
        .from('alunos')
        .update({ mensalidade_avisada: false })
        .in('id_aluno', alunosPagosNesteMes);
    }
  }

  // 4. Fetch Alunos (Top 4)
  const { data: alunos } = await supabase
    .from('alunos')
    .select('*')
    .eq('id_explicador', explId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(4);

  // 5. Compute 3-state status per student:
  //    PAGO (green)    — current month paid
  //    PENDENTE (orange) — current month not yet paid, no gap
  //    ATRASADO (red)  — missed month(s) between last payment and current month
  const alunosWithStatus = (alunos || []).map(aluno => {
    const pagCurr = pags ? pags.find(p => p.id_aluno === aluno.id_aluno) : null;

    if (pagCurr && pagCurr.estado === 'PAGO') {
      return { ...aluno, estado_pagamento: 'PAGO', pagamento_mes: pagCurr };
    }

    // Check for gaps: find the last PAGO payment for this student
    const studentPags = (allPagsExpl || [])
      .filter(p => p.id_aluno === aluno.id_aluno && p.estado === 'PAGO')
      .sort((a, b) => (Number(b.ano) * 100 + Number(b.mes)) - (Number(a.ano) * 100 + Number(a.mes)));

    const lastPaid = studentPags.length > 0 ? studentPags[0] : null;

    if (lastPaid) {
      const lastPaidYM = Number(lastPaid.ano) * 12 + Number(lastPaid.mes);
      const currentYM = currentYear * 12 + currentMonth;
      const gap = currentYM - lastPaidYM;

      if (gap > 1) {
        // More than 1 month since last payment → Atrasado
        return { ...aluno, estado_pagamento: 'ATRASADO', pagamento_mes: pagCurr };
      }
    }

    // No gap or no payment history → Pendente
    return { ...aluno, estado_pagamento: 'PENDENTE', pagamento_mes: pagCurr };
  });

  const countEl = document.getElementById('dash-alunos-contador');
  if (countEl) {
     const { count } = await supabase
        .from('alunos')
        .select('*', { count: 'exact', head: true })
        .eq('id_explicador', explId)
        .eq('is_active', true);
     countEl.textContent = `(${count || 0} ativos)`;
  }


  renderAlunos(alunosWithStatus, currentMonth, currentYear);

  // 5. Weekly Sessions
  try {
    const sessoes = await ExplicadorService.listSessoes();
    renderWeeklySessions(sessoes);
  } catch(e) {
    console.warn("Erro ao carregar sessões semanais:", e);
    const weekEl = document.getElementById('dash-week-sessions');
    if (weekEl) weekEl.innerHTML = '<p style="color:#94a3b8">Sem sessões para mostrar.</p>';
  }

  // 6. Monthly Reports
  try {
    const { data: allPags } = await supabase
      .from('pagamentos')
      .select('*, alunos!inner(nome, apelido)')
      .eq('id_explicador', explId)
      .order('ano', { ascending: false })
      .order('mes', { ascending: false });

    _dashPagamentos = allPags || [];
    renderMonthlyReports(_dashPagamentos);
  } catch(e) {
    console.warn("Erro ao carregar relatórios mensais:", e);
  }
}

function updateKpis(prev, real, pend) {
  if (document.getElementById('card-total-previsto')) document.getElementById('card-total-previsto').textContent = formatCurrency(prev);
  if (document.getElementById('card-total-mes')) document.getElementById('card-total-mes').textContent = formatCurrency(real);
  const pendEl = document.getElementById('card-pendentes');
  if (pendEl) {
    pendEl.textContent = formatCurrency(pend);
    if (pend > 0) pendEl.classList.add('expl-kpi-value--red');
    else pendEl.classList.remove('expl-kpi-value--red');
  }
}

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(val);
}

function renderAlunos(lista, mes, ano) {
  const grid = document.getElementById('dash-alunos-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (lista.length === 0) {
    grid.innerHTML = '<p class="empty-state">Ainda não tem alunos registados.</p>';
    return;
  }

  lista.forEach(aluno => {
    const card = document.createElement('article');
    card.className = 'expl-card';
    card.style = "padding: 24px; position: relative;";
    
    const init = (aluno.nome || '?')[0].toUpperCase();
    const isPago = aluno.estado_pagamento === 'PAGO';
    const isAtrasado = aluno.estado_pagamento === 'ATRASADO';
    const statusText = isPago ? 'Pago' : isAtrasado ? 'Atrasado' : 'Pendente';
    const statusColor = isPago
      ? 'background:#dcfce7; color:#166534;'
      : isAtrasado
        ? 'background:#fee2e2; color:#b91c1c;'
        : 'background:#fff7ed; color:#c2410c;';

    const isAvisado = aluno.mensalidade_avisada && !isPago;
    const bellColor = isAvisado ? '#b91c1c' : '#94a3b8';

    card.innerHTML = `
      <!-- Sino de Aviso -->
      <button onclick="toggleAviso('${aluno.id_aluno}', ${isAvisado})" 
              style="position: absolute; top: 16px; right: 16px; background: none; border: none; cursor: pointer; padding: 4px; color: ${bellColor};"
              title="${isAvisado ? 'Aviso ligado — clique para desligar' : 'Clique para marcar como avisado'}">
        <svg style="width:20px; height:20px" viewBox="0 0 24 24" fill="${isAvisado ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
      </button>

      <!-- Top: Avatar + Nome -->
      <div style="display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem;">
        <div style="width: 48px; height: 48px; border-radius: 999px; background: #f8fafc; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #475569; flex-shrink: 0;">
          ${init}
        </div>
        <div style="min-width: 0; padding-right: 24px;">
          <h3 style="margin: 0; font-size: 1rem; font-weight: 600; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${aluno.nome}</h3>
          <p style="margin: 2px 0 0; font-size: 0.875rem; color: #64748b;">${aluno.ano || '?'}º Ano</p>
        </div>
      </div>

      <!-- Content: Monthly Payment info -->
      <div style="margin-bottom: 1.5rem;">
        <p style="margin: 0 0 4px; font-size: 0.875rem; color: #64748b;">Mensalidade de ${getMesNome(mes)}:</p>
        <p style="margin: 0 0 12px; font-size: 1.1rem; font-weight: 600; color: #0f172a;">${formatCurrency(aluno.valor_explicacao * (aluno.sessoes_mes || 0))}</p>
        <span style="display: inline-flex; padding: 4px 12px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; ${statusColor}">
          ${statusText}
        </span>
      </div>

      <!-- Action -->
      <button onclick="location.href='alunos.html'" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #0f172a; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s ease;">
        Ver detalhes
      </button>
    `;
    grid.appendChild(card);
  });
}

function getMesNome(m) {
  return DASH_MESES[m-1] || '';
}

// ========== BELL TOGGLE VIA EDGE FUNCTION ==========

async function toggleAviso(alunoId, currentStatus) {
  try {
    await ExplicadorService.setMensalidadeAvisada(alunoId, !currentStatus);
    loadDashboard(); // Refresh
  } catch (err) {
    console.error("Erro ao alternar aviso:", err);
    alert("Erro ao alternar aviso: " + err.message);
  }
}

// ========== WEEKLY SESSIONS ==========

function renderWeeklySessions(sessoes) {
  const container = document.getElementById('dash-week-sessions');
  if (!container) return;

  // Calculate current week Mon-Sun
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const mondayStr = monday.toISOString().slice(0, 10);
  const sundayStr = sunday.toISOString().slice(0, 10);

  // Filter sessions for this week
  const weekSessions = (sessoes || []).filter(s => {
    return s.data >= mondayStr && s.data <= sundayStr;
  }).sort((a, b) => {
    const cmp = a.data.localeCompare(b.data);
    if (cmp !== 0) return cmp;
    return (a.hora_inicio || '').localeCompare(b.hora_inicio || '');
  });

  if (!weekSessions.length) {
    container.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem;">Sem explicações agendadas esta semana.</p>';
    return;
  }

  container.innerHTML = weekSessions.map(s => {
    const d = new Date(s.data + 'T00:00:00');
    const diaNome = DASH_DIAS[d.getDay()];
    const diaNum = d.getDate();
    const hora = s.hora_inicio ? s.hora_inicio.slice(0, 5) : '—';
    const aluno = s.aluno_nome || 'Aluno';
    const estadoClass = s.estado === 'REALIZADA' ? 'sessao-badge--realizada' 
                       : s.estado === 'CANCELADA' ? 'sessao-badge--cancelada'
                       : 'sessao-badge--agendada';

    return `
      <div class="dash-week-item">
        <div class="dash-week-item__day">${diaNome} ${diaNum}</div>
        <div class="dash-week-item__info">
          <strong>${aluno}</strong> às ${hora}
          ${s.duracao_min ? `<span style="color:#94a3b8"> · ${s.duracao_min}min</span>` : ''}
        </div>
        <span class="sessao-badge ${estadoClass}">${s.estado || 'AGENDADA'}</span>
      </div>
    `;
  }).join('');
}

// ========== MONTHLY REPORTS LIST ==========

function renderMonthlyReports(pags) {
  const container = document.getElementById('dash-month-reports');
  if (!container) return;

  // Group by ano/mes, limit to last 6
  const groups = {};
  pags.forEach(p => {
    const key = `${p.ano}-${String(p.mes).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = { ano: p.ano, mes: p.mes, items: [] };
    groups[key].items.push(p);
  });

  const sorted = Object.values(groups)
    .sort((a, b) => (b.ano * 100 + b.mes) - (a.ano * 100 + a.mes))
    .slice(0, 6);

  if (!sorted.length) {
    container.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem;">Sem relatórios disponíveis.</p>';
    return;
  }

  container.innerHTML = sorted.map(g => {
    const totalPago = g.items.reduce((s, p) => s + Number(p.valor_pago || 0), 0);
    const totalPrev = g.items.reduce((s, p) => s + Number(p.valor_previsto || 0), 0);
    const nAlunos = g.items.length;
    const allPaid = g.items.every(p => p.estado === 'PAGO');

    return `
      <div class="month-row" onclick="openDashMonthReport(${g.ano}, ${g.mes})">
        <div class="month-row__period">
          <strong>${DASH_MESES[g.mes - 1]} ${g.ano}</strong>
        </div>
        <div class="month-row__stats">
          <span>${nAlunos} aluno${nAlunos !== 1 ? 's' : ''}</span>
          <span style="color:#16a34a; font-weight:600;">${formatCurrency(totalPago)}</span>
          <span style="color:#94a3b8">/ ${formatCurrency(totalPrev)}</span>
        </div>
        <span class="sessao-badge ${allPaid ? 'sessao-badge--realizada' : 'sessao-badge--agendada'}">${allPaid ? 'Pago' : 'Pendente'}</span>
      </div>
    `;
  }).join('');
}

// ========== MONTH REPORT MODAL ==========

function openDashMonthReport(ano, mes) {
  const modal = document.getElementById('modal-dash-relatorio');
  const titulo = document.getElementById('modal-dash-rel-titulo');
  const body = document.getElementById('modal-dash-rel-body');
  if (!modal) return;

  titulo.textContent = `Relatório — ${DASH_MESES[mes - 1]} ${ano}`;

  const items = _dashPagamentos.filter(p => Number(p.ano) === Number(ano) && Number(p.mes) === Number(mes));
  
  if (!items.length) {
    body.innerHTML = '<p style="color:#94a3b8">Sem dados para este mês.</p>';
  } else {
    const totalPago = items.reduce((s, p) => s + Number(p.valor_pago || 0), 0);
    const totalPrev = items.reduce((s, p) => s + Number(p.valor_previsto || 0), 0);

    body.innerHTML = `
      <div style="display:flex; gap:0.75rem; margin-bottom:1rem; flex-wrap:wrap;">
        <div style="flex:1; min-width:100px; padding:0.75rem 1rem; background:#f8fafc; border-radius:10px; text-align:center;">
          <p style="margin:0; font-size:0.8rem; color:#64748b;">Previsto</p>
          <p style="margin:4px 0 0; font-size:1.1rem; font-weight:700;">${formatCurrency(totalPrev)}</p>
        </div>
        <div style="flex:1; min-width:100px; padding:0.75rem 1rem; background:#f0fdf4; border-radius:10px; text-align:center;">
          <p style="margin:0; font-size:0.8rem; color:#64748b;">Recebido</p>
          <p style="margin:4px 0 0; font-size:1.1rem; font-weight:700; color:#16a34a;">${formatCurrency(totalPago)}</p>
        </div>
        <div style="flex:1; min-width:100px; padding:0.75rem 1rem; background:#fef2f2; border-radius:10px; text-align:center;">
          <p style="margin:0; font-size:0.8rem; color:#64748b;">Em falta</p>
          <p style="margin:4px 0 0; font-size:1.1rem; font-weight:700; color:#b91c1c;">${formatCurrency(totalPrev - totalPago)}</p>
        </div>
      </div>
      <div style="max-height:300px; overflow-y:auto;">
        ${items.map(p => {
          const nome = p.alunos ? `${p.alunos.nome} ${p.alunos.apelido || ''}`.trim() : '—';
          const isPago = p.estado === 'PAGO';
          return `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0; border-bottom:1px solid #f1f5f9;">
              <span style="font-weight:500;">${nome}</span>
              <div style="display:flex; gap:0.75rem; align-items:center;">
                <span style="font-size:0.9rem;">${formatCurrency(p.valor_pago)} / ${formatCurrency(p.valor_previsto)}</span>
                <span class="sessao-badge ${isPago ? 'sessao-badge--realizada' : 'sessao-badge--agendada'}">${p.estado}</span>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeDashRelModal() {
  const modal = document.getElementById('modal-dash-relatorio');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

// Iniciar
loadDashboard();
