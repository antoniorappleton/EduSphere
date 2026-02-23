/**
 * EduSphere — Relatórios do Explicador
 * KPIs, gráficos, e lista de relatórios mensais com modal.
 */

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmtCurrency(v) {
  return new Intl.NumberFormat('pt-PT', { style:'currency', currency:'EUR' }).format(v);
}

// cached data for modal
let _cachedPagamentos = [];

document.addEventListener('DOMContentLoaded', () => { initReports(); });

async function initReports() {
  try {
    // 1. Fetch report data from Edge Function
    const data = await ExplicadorService.getDetailedReports();

    // 2. Fetch raw pagamentos for monthly list + KPIs
    const explId = await ExplicadorService.getMyExplId();
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;

    const { data: allPags } = await supabase
      .from('pagamentos')
      .select('*, alunos!inner(nome, apelido)')
      .eq('id_explicador', explId)
      .order('ano', { ascending: false })
      .order('mes', { ascending: false });

    _cachedPagamentos = allPags || [];

    // 3. Fetch active student count
    const { count: activeCount } = await supabase
      .from('alunos')
      .select('*', { count: 'exact', head: true })
      .eq('id_explicador', explId)
      .eq('is_active', true);

    // 4. Calculate KPIs from current month pagamentos
    const curMonthPags = _cachedPagamentos.filter(p => p.ano === curYear && p.mes === curMonth);
    let totalPago = 0, totalPrev = 0;
    curMonthPags.forEach(p => {
      totalPago += Number(p.valor_pago || 0);
      totalPrev += Number(p.valor_previsto || 0);
    });

    // Sessions this month from report data
    const sessoesMes = (data.sessoes_mes || []).find(s => s.ano === curYear && s.mes === curMonth);
    const totalSessoes = sessoesMes ? Number(sessoesMes.total_sessoes || 0) : 0;

    renderKpis(activeCount || 0, totalPago, totalSessoes, totalPrev > 0 ? Math.round((totalPago / totalPrev) * 100) : 0);

    // 5. Render charts
    renderCharts(data);

    // 6. Render monthly reports list
    renderMonthlyList(_cachedPagamentos);

  } catch (err) {
    console.error("Erro ao carregar relatórios:", err);
  }
}

function renderKpis(alunos, faturacao, sessoes, taxa) {
  document.getElementById('kpi-alunos').textContent = alunos;
  document.getElementById('kpi-faturacao').textContent = fmtCurrency(faturacao);
  document.getElementById('kpi-sessoes').textContent = sessoes;
  document.getElementById('kpi-taxa').textContent = taxa + '%';
}

function renderCharts(data) {
  renderFatChart(data.faturacao || []);
  renderSessionsChart(data.sessoes_mes || []);
  renderStudentsChart(data.alunos_mes || []);
  renderDisciplinasChart(data.disciplinas || []);
}

function renderFatChart(fatData) {
  const ctx = document.getElementById('chartFatMensal');
  if (!ctx) return;
  const labels = fatData.map(d => MESES[(d.mes || 1) - 1]?.slice(0, 3) || d.mes);
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Recebido (€)', data: fatData.map(d => Number(d.total_pago || 0)), backgroundColor: '#16a34a', borderRadius: 6 },
        { label: 'Previsto (€)', data: fatData.map(d => Number(d.total_previsto || 0)), backgroundColor: '#e5e7eb', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderSessionsChart(sessData) {
  const ctx = document.getElementById('chartSessoes');
  if (!ctx) return;
  const labels = sessData.map(d => MESES[(d.mes || 1) - 1]?.slice(0, 3) || d.mes);
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Sessões',
        data: sessData.map(d => Number(d.total_sessoes || 0)),
        borderColor: '#b91c1c',
        backgroundColor: 'rgba(185, 28, 28, 0.08)',
        fill: true, tension: 0.4, pointRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

function renderStudentsChart(alData) {
  const ctx = document.getElementById('chartAlunos');
  if (!ctx) return;
  const labels = alData.map(d => MESES[(d.mes || 1) - 1]?.slice(0, 3) || d.mes);
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Alunos Ativos',
        data: alData.map(d => Number(d.total_alunos || 0)),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        fill: true, tension: 0.4, pointRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

function renderDisciplinasChart(discData) {
  const ctx = document.getElementById('chartDisciplinas');
  if (!ctx) return;
  if (!discData.length) {
    ctx.parentElement.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:2rem 0;">Sem dados de disciplinas</p>';
    return;
  }
  const labels = discData.map(d => d.disciplina || 'Outro');
  const values = discData.map(d => Number(d.total || 0));
  const colors = ['#b91c1c','#2563eb','#16a34a','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316'];
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors.slice(0, values.length), borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { padding: 16 } } }
    }
  });
}

// ========== MONTHLY REPORTS LIST ==========

function renderMonthlyList(pags) {
  const container = document.getElementById('monthly-reports-list');
  if (!container) return;

  // Group by ano/mes
  const groups = {};
  pags.forEach(p => {
    const key = `${p.ano}-${String(p.mes).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = { ano: p.ano, mes: p.mes, items: [] };
    groups[key].items.push(p);
  });

  const sorted = Object.values(groups).sort((a, b) => (b.ano * 100 + b.mes) - (a.ano * 100 + a.mes));

  if (!sorted.length) {
    container.innerHTML = '<p style="color:#94a3b8">Sem relatórios disponíveis.</p>';
    return;
  }

  container.innerHTML = sorted.map(g => {
    const totalPago = g.items.reduce((s, p) => s + Number(p.valor_pago || 0), 0);
    const totalPrev = g.items.reduce((s, p) => s + Number(p.valor_previsto || 0), 0);
    const nAlunos = g.items.length;
    const allPaid = g.items.every(p => p.estado === 'PAGO');
    const badgeClass = allPaid ? 'sessao-badge--realizada' : 'sessao-badge--agendada';
    const badgeText = allPaid ? 'Tudo pago' : 'Pendente';

    return `
      <div class="month-row" onclick="openMonthReport(${g.ano}, ${g.mes})">
        <div class="month-row__period">
          <strong>${MESES[g.mes - 1]} ${g.ano}</strong>
        </div>
        <div class="month-row__stats">
          <span>${nAlunos} aluno${nAlunos !== 1 ? 's' : ''}</span>
          <span style="color:#16a34a; font-weight:600;">${fmtCurrency(totalPago)}</span>
          <span style="color:#94a3b8">/ ${fmtCurrency(totalPrev)}</span>
        </div>
        <span class="sessao-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');
}

// ========== MONTH REPORT MODAL ==========

function openMonthReport(ano, mes) {
  const modal = document.getElementById('modal-relatorio-mes');
  const titulo = document.getElementById('modal-rel-titulo');
  const body = document.getElementById('modal-rel-body');
  if (!modal) return;

  titulo.textContent = `Relatório — ${MESES[mes - 1]} ${ano}`;

  // Filter cached pagamentos
  const items = _cachedPagamentos.filter(p => p.ano === ano && p.mes === mes);
  
  if (!items.length) {
    body.innerHTML = '<p style="color:#94a3b8">Sem dados para este mês.</p>';
  } else {
    const totalPago = items.reduce((s, p) => s + Number(p.valor_pago || 0), 0);
    const totalPrev = items.reduce((s, p) => s + Number(p.valor_previsto || 0), 0);

    body.innerHTML = `
      <div style="display:flex; gap:1rem; margin-bottom:1rem; flex-wrap:wrap;">
        <div class="rel-kpi-card" style="flex:1; min-width:120px; min-height:auto; padding:1rem;">
          <p class="rel-kpi-label">Previsto</p>
          <p class="rel-kpi-value" style="font-size:1.2rem">${fmtCurrency(totalPrev)}</p>
        </div>
        <div class="rel-kpi-card" style="flex:1; min-width:120px; min-height:auto; padding:1rem;">
          <p class="rel-kpi-label">Recebido</p>
          <p class="rel-kpi-value" style="font-size:1.2rem; color:#16a34a">${fmtCurrency(totalPago)}</p>
        </div>
        <div class="rel-kpi-card" style="flex:1; min-width:120px; min-height:auto; padding:1rem;">
          <p class="rel-kpi-label">Em falta</p>
          <p class="rel-kpi-value" style="font-size:1.2rem; color:#b91c1c">${fmtCurrency(totalPrev - totalPago)}</p>
        </div>
      </div>
      <table class="tabela" style="width:100%">
        <thead>
          <tr>
            <th style="text-align:left">Aluno</th>
            <th>Previsto</th>
            <th>Pago</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(p => {
            const nome = p.alunos ? `${p.alunos.nome} ${p.alunos.apelido || ''}`.trim() : '—';
            const estadoClass = p.estado === 'PAGO' ? 'sessao-badge--realizada' : p.estado === 'PARCIAL' ? 'sessao-badge--agendada' : 'sessao-badge--agendada';
            return `
              <tr>
                <td style="text-align:left">${nome}</td>
                <td>${fmtCurrency(p.valor_previsto)}</td>
                <td>${fmtCurrency(p.valor_pago)}</td>
                <td><span class="sessao-badge ${estadoClass}">${p.estado}</span></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeRelModal() {
  const modal = document.getElementById('modal-relatorio-mes');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
}
