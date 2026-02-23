// public/js/dashboard-explicador.js

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
    // Ver se é Admin. Se for, criar perfil dummy de Explicador automaticamente.
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

  const { data: pags } = await supabase
    .from('pagamentos')
    .select('valor_previsto, valor_pago, estado, id_aluno')
    .eq('id_explicador', explId)
    .eq('ano', currentYear)
    .eq('mes', currentMonth);

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

  // 3.1. Auto-Reset dos Sinos (Se houver pagamento no mês, o sino desliga-se automaticamente)
  if (pags && pags.length > 0) {
    const alunosPagosNesteMes = pags.filter(p => p.estado === 'PAGO').map(p => p.id_aluno);
    if (alunosPagosNesteMes.length > 0) {
      await supabase
        .from('alunos')
        .update({ mensalidade_avisada: false })
        .in('id_aluno', alunosPagosNesteMes);
    }
  }

  // 4. Fetch Alunos (Top 4 recentes ativos) e seus pagamentos do mês
  const { data: alunos } = await supabase
    .from('alunos')
    .select('*')
    .eq('id_explicador', explId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(4);

  // 5. Vincular alunos com pagamentos do mês corrente para o estado no card
  const alunosWithStatus = (alunos || []).map(aluno => {
    // Procurar pagamento deste aluno no cache 'pags' obtido no step 3
    const pag = pags ? pags.find(p => p.id_aluno === aluno.id_aluno) : null;
    return {
      ...aluno,
      estado_pagamento: pag ? pag.estado : 'PENDENTE', // Se não houver registo, consideramos pendente
      pagamento_mes: pag
    };
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
    const statusText = isPago ? 'Pago' : 'Pendente';
    const statusColor = isPago ? 'background:#dcfce7; color:#166534;' : 'background:#fff7ed; color:#c2410c;';

    // Sino de aviso (comportamento solicitado)
    // Se estiver pago, o sino não deve estar ativo.
    // Se estiver pendente, o explicador pode marcar.
    const isAvisado = aluno.mensalidade_avisada && !isPago;
    const bellColor = isAvisado ? '#b91c1c' : '#94a3b8';

    // Data de "mensalidade" para visualização (dia 15 do mês corrente como padrão)
    const mensalidadeData = `15/${String(mes).padStart(2, '0')}/${ano}`; 

    card.innerHTML = `
      <!-- Sino de Aviso -->
      <button onclick="toggleAviso('${aluno.id_aluno}', ${isAvisado})" 
              style="position: absolute; top: 16px; right: 16px; background: none; border: none; cursor: pointer; padding: 4px; color: ${bellColor};"
              title="${isAvisado ? 'Aviso ligado' : 'Marcar para aviso'}">
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
          <p style="margin: 2px 0 0; font-size: 0.875rem; color: #64748b;">${aluno.ano_escolaridade || '?'}º Ano</p>
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
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return meses[m-1];
}

async function toggleAviso(alunoId, currentStatus) {
  try {
    const { error } = await supabase
      .from('alunos')
      .update({ mensalidade_avisada: !currentStatus })
      .eq('id_aluno', alunoId);
    
    if (error) throw error;
    loadDashboard(); // Recarregar para mostrar o novo estado
  } catch (err) {
    console.error("Erro ao alternar aviso:", err);
  }
}

async function handleLogout() {
  await supabase.auth.signOut();
  location.href = '../../index.html';
}

document.getElementById('btnLogoutNav')?.addEventListener('click', handleLogout);
document.getElementById('btnLogoutHeader')?.addEventListener('click', handleLogout);

// Iniciar
loadDashboard();
