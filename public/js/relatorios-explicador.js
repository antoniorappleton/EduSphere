/**
 * EduSphere — Relatórios do Explicador
 * KPIs, gráficos, lista de relatórios mensais com modal detalhado.
 * Funciona inteiramente a partir de dados locais (pagamentos + sessões),
 * com fallback se a Edge Function get_relatorios não estiver deployed.
 */

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_CURTO = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtCurrency(v) {
  return new Intl.NumberFormat('pt-PT', { style:'currency', currency:'EUR' }).format(v);
}

let _cachedPagamentos = [];
let _cachedSessoes = [];

document.addEventListener('DOMContentLoaded', () => { initReports(); });

async function initReports() {
  try {
    const explId = await ExplicadorService.getMyExplId();
    if (!explId) { 
      console.warn("Sem perfil de explicador");
      return;
    }

    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;

    // 1. Fetch ALL pagamentos (principal data source)
    const { data: allPags } = await supabase
      .from('pagamentos')
      .select('*, alunos!inner(nome, apelido)')
      .eq('id_explicador', explId)
      .order('ano', { ascending: true })
      .order('mes', { ascending: true });

    _cachedPagamentos = allPags || [];

    // 2. Fetch ALL sessões
    let sessoes = [];
    try {
      sessoes = await ExplicadorService.listSessoes();
    } catch(e) {
      console.warn("Erro a carregar sessões:", e);
    }
    _cachedSessoes = sessoes || [];

    // 3. Fetch active student count
    const { count: activeCount } = await supabase
      .from('alunos')
      .select('*', { count: 'exact', head: true })
      .eq('id_explicador', explId)
      .eq('is_active', true);

    // 4. KPIs (mês corrente)
    const curMonthPags = _cachedPagamentos.filter(p => Number(p.ano) === curYear && Number(p.mes) === curMonth);
    let totalPago = 0, totalPrev = 0;
    curMonthPags.forEach(p => {
      totalPago += Number(p.valor_pago || 0);
      totalPrev += Number(p.valor_previsto || 0);
    });

    const sessoesEsteMes = _cachedSessoes.filter(s => {
      if (!s.data) return false;
      const d = new Date(s.data);
      return d.getFullYear() === curYear && (d.getMonth() + 1) === curMonth;
    });

    const taxa = totalPrev > 0 ? Math.round((totalPago / totalPrev) * 100) : 0;
    renderKpis(activeCount || 0, totalPago, sessoesEsteMes.length, taxa);

    // 5. Charts (built from local data)
    renderCharts();

    // 6. Monthly reports list
    renderMonthlyList(_cachedPagamentos);

  } catch (err) {
    console.error("Erro ao carregar relatórios:", err);
  }
}

// ========== KPIs ==========

function renderKpis(alunos, faturacao, sessoes, taxa) {
  const el = (id) => document.getElementById(id);
  if (el('kpi-alunos')) el('kpi-alunos').textContent = alunos;
  if (el('kpi-faturacao')) el('kpi-faturacao').textContent = fmtCurrency(faturacao);
  if (el('kpi-sessoes')) el('kpi-sessoes').textContent = sessoes;
  if (el('kpi-taxa')) el('kpi-taxa').textContent = taxa + '%';
}

// ========== CHARTS ==========

function renderCharts() {
  renderFatChart();
  renderSessionsChart();
  renderStudentsChart();
  renderDisciplinasChart();
}

function renderFatChart() {
  const ctx = document.getElementById('chartFatMensal');
  if (!ctx) return;

  // Group pagamentos by month
  const groups = {};
  _cachedPagamentos.forEach(p => {
    const key = `${p.ano}-${String(p.mes).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = { ano: Number(p.ano), mes: Number(p.mes), previsto: 0, pago: 0 };
    groups[key].previsto += Number(p.valor_previsto || 0);
    groups[key].pago += Number(p.valor_pago || 0);
  });

  const sorted = Object.values(groups)
    .sort((a, b) => (a.ano * 100 + a.mes) - (b.ano * 100 + b.mes))
    .slice(-12);

  if (!sorted.length) {
    ctx.parentElement.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:2rem 0;">Sem dados de faturação</p>';
    return;
  }

  const labels = sorted.map(d => MESES_CURTO[d.mes - 1] + ' ' + String(d.ano).slice(-2));

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Recebido (€)', data: sorted.map(d => d.pago), backgroundColor: '#16a34a', borderRadius: 6, barPercentage: 0.6 },
        { label: 'Previsto (€)', data: sorted.map(d => d.previsto), backgroundColor: '#e2e8f0', borderRadius: 6, barPercentage: 0.6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtCurrency(c.raw)}` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => fmtCurrency(v) } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderSessionsChart() {
  const ctx = document.getElementById('chartSessoes');
  if (!ctx) return;

  // Group sessions by month
  const groups = {};
  _cachedSessoes.forEach(s => {
    if (!s.data) return;
    const d = new Date(s.data);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = { ano: y, mes: m, total: 0, realizadas: 0 };
    groups[key].total += 1;
    if ((s.estado || '').toUpperCase() === 'REALIZADA') groups[key].realizadas += 1;
  });

  const sorted = Object.values(groups)
    .sort((a, b) => (a.ano * 100 + a.mes) - (b.ano * 100 + b.mes))
    .slice(-12);

  if (!sorted.length) {
    ctx.parentElement.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:2rem 0;">Sem dados de sessões</p>';
    return;
  }

  const labels = sorted.map(d => MESES_CURTO[d.mes - 1] + ' ' + String(d.ano).slice(-2));

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Total Sessões',
          data: sorted.map(d => d.total),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: '#2563eb'
        },
        {
          label: 'Realizadas',
          data: sorted.map(d => d.realizadas),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22, 163, 74, 0.06)',
          fill: true, tension: 0.4, pointRadius: 4, borderDash: [5, 3], pointBackgroundColor: '#16a34a'
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderStudentsChart() {
  const ctx = document.getElementById('chartAlunos');
  if (!ctx) return;

  // Use pagamentos as proxy: count distinct id_aluno per month
  const groups = {};
  _cachedPagamentos.forEach(p => {
    const key = `${p.ano}-${String(p.mes).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = { ano: Number(p.ano), mes: Number(p.mes), alunos: new Set() };
    groups[key].alunos.add(p.id_aluno);
  });

  const sorted = Object.values(groups)
    .sort((a, b) => (a.ano * 100 + a.mes) - (b.ano * 100 + b.mes))
    .slice(-12);

  if (!sorted.length) {
    ctx.parentElement.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:2rem 0;">Sem dados de alunos</p>';
    return;
  }

  const labels = sorted.map(d => MESES_CURTO[d.mes - 1] + ' ' + String(d.ano).slice(-2));

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Alunos Ativos',
        data: sorted.map(d => d.alunos.size),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.08)',
        fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: '#8b5cf6'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderDisciplinasChart() {
  const ctx = document.getElementById('chartDisciplinas');
  if (!ctx) return;

  // Extract disciplines from pagamentos alunos join
  const discCount = {};
  const seen = new Set();
  _cachedPagamentos.forEach(p => {
    if (!p.alunos || seen.has(p.id_aluno)) return;
    seen.add(p.id_aluno);
    const disc = p.alunos.disciplina || 'Outra';
    discCount[disc] = (discCount[disc] || 0) + 1;
  });

  const entries = Object.entries(discCount);
  if (!entries.length) {
    ctx.parentElement.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:2rem 0;">Sem dados de disciplinas</p>';
    return;
  }

  const labels = entries.map(e => e[0]);
  const values = entries.map(e => e[1]);
  const colors = ['#8b5cf6','#2563eb','#16a34a','#f59e0b','#b91c1c','#ec4899','#14b8a6','#f97316'];

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors.slice(0, values.length), borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw} aluno${c.raw !== 1 ? 's' : ''}` } }
      }
    }
  });
}

// ========== MONTHLY REPORTS LIST ==========

function renderMonthlyList(pags) {
  const container = document.getElementById('monthly-reports-list');
  if (!container) return;

  const groups = {};
  pags.forEach(p => {
    const key = `${p.ano}-${String(p.mes).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = { ano: Number(p.ano), mes: Number(p.mes), items: [] };
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
    const taxa = totalPrev > 0 ? Math.round((totalPago / totalPrev) * 100) : 0;

    // Robust paid check
    const allPaid = g.items.every(p => {
      const est = (p.estado || '').toUpperCase();
      const vPago = Number(p.valor_pago || 0);
      const vPrev = Number(p.valor_previsto || 0);
      return est === 'PAGO' || (vPrev > 0 && vPago >= vPrev);
    });

    const badgeClass = allPaid ? 'sessao-badge--realizada' : taxa >= 50 ? 'sessao-badge--agendada' : 'sessao-badge--cancelada';
    const badgeText = allPaid ? 'Tudo pago' : `${taxa}% cobrado`;

    return `
      <div class="month-row" onclick="openMonthReport(${g.ano}, ${g.mes})">
        <div class="month-row__period">
          <strong>${MESES[g.mes - 1]} ${g.ano}</strong>
          <span style="color:#94a3b8; font-size:0.8rem;">${nAlunos} aluno${nAlunos !== 1 ? 's' : ''}</span>
        </div>
        <div class="month-row__stats">
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

  const items = _cachedPagamentos.filter(p => Number(p.ano) === Number(ano) && Number(p.mes) === Number(mes));

  // Sessions for this month
  const monthSessoes = _cachedSessoes.filter(s => {
    if (!s.data) return false;
    const d = new Date(s.data);
    return d.getFullYear() === Number(ano) && (d.getMonth() + 1) === Number(mes);
  });

  if (!items.length) {
    body.innerHTML = '<p style="color:#94a3b8">Sem dados para este mês.</p>';
  } else {
    const totalPago = items.reduce((s, p) => s + Number(p.valor_pago || 0), 0);
    const totalPrev = items.reduce((s, p) => s + Number(p.valor_previsto || 0), 0);
    const emFalta = totalPrev - totalPago;
    const taxa = totalPrev > 0 ? Math.round((totalPago / totalPrev) * 100) : 0;

    body.innerHTML = `
      <!-- Mini KPIs -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap:0.75rem; margin-bottom:1.25rem;">
        <div style="padding:0.75rem 1rem; background:#f8fafc; border-radius:10px; text-align:center;">
          <p style="margin:0; font-size:0.75rem; color:#64748b;">Previsto</p>
          <p style="margin:4px 0 0; font-size:1.1rem; font-weight:700;">${fmtCurrency(totalPrev)}</p>
        </div>
        <div style="padding:0.75rem 1rem; background:#f0fdf4; border-radius:10px; text-align:center;">
          <p style="margin:0; font-size:0.75rem; color:#64748b;">Recebido</p>
          <p style="margin:4px 0 0; font-size:1.1rem; font-weight:700; color:#16a34a;">${fmtCurrency(totalPago)}</p>
        </div>
        <div style="padding:0.75rem 1rem; background:${emFalta > 0 ? '#fef2f2' : '#f0fdf4'}; border-radius:10px; text-align:center;">
          <p style="margin:0; font-size:0.75rem; color:#64748b;">Em falta</p>
          <p style="margin:4px 0 0; font-size:1.1rem; font-weight:700; color:${emFalta > 0 ? '#b91c1c' : '#16a34a'};">${fmtCurrency(emFalta)}</p>
        </div>
        <div style="padding:0.75rem 1rem; background:#eff6ff; border-radius:10px; text-align:center;">
          <p style="margin:0; font-size:0.75rem; color:#64748b;">Sessões</p>
          <p style="margin:4px 0 0; font-size:1.1rem; font-weight:700; color:#2563eb;">${monthSessoes.length}</p>
        </div>
      </div>

      <!-- Progress bar -->
      <div style="margin-bottom:1.25rem;">
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#64748b; margin-bottom:4px;">
          <span>Taxa de cobrança</span>
          <span style="font-weight:600; color:${taxa >= 100 ? '#16a34a' : taxa >= 50 ? '#f59e0b' : '#b91c1c'}">${taxa}%</span>
        </div>
        <div style="width:100%; height:8px; background:#e2e8f0; border-radius:99px; overflow:hidden;">
          <div style="width:${Math.min(taxa, 100)}%; height:100%; background:${taxa >= 100 ? '#16a34a' : taxa >= 50 ? '#f59e0b' : '#b91c1c'}; border-radius:99px; transition:width 0.5s;"></div>
        </div>
      </div>

      <!-- Tabela alunos -->
      <div style="max-height:300px; overflow-y:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
          <thead>
            <tr style="border-bottom:2px solid #e2e8f0;">
              <th style="text-align:left; padding:8px 6px; color:#64748b; font-weight:600;">Aluno</th>
              <th style="text-align:right; padding:8px 6px; color:#64748b; font-weight:600;">Previsto</th>
              <th style="text-align:right; padding:8px 6px; color:#64748b; font-weight:600;">Pago</th>
              <th style="text-align:center; padding:8px 6px; color:#64748b; font-weight:600;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(p => {
              const nome = p.alunos ? `${p.alunos.nome} ${p.alunos.apelido || ''}`.trim() : '—';
              const est = (p.estado || '').toUpperCase();
              const vPago = Number(p.valor_pago || 0);
              const vPrev = Number(p.valor_previsto || 0);
              const isPaid = est === 'PAGO' || (vPrev > 0 && vPago >= vPrev);

              const badgeCls = isPaid ? 'sessao-badge--realizada' : est === 'PARCIAL' ? 'sessao-badge--agendada' : 'sessao-badge--cancelada';
              const badgeTxt = isPaid ? 'Pago' : est === 'PARCIAL' ? 'Parcial' : 'Pendente';

              return `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="text-align:left; padding:10px 6px; font-weight:500;">${nome}</td>
                  <td style="text-align:right; padding:10px 6px;">${fmtCurrency(vPrev)}</td>
                  <td style="text-align:right; padding:10px 6px; color:${isPaid ? '#16a34a' : '#0f172a'}; font-weight:${isPaid ? '600' : '400'};">${fmtCurrency(vPago)}</td>
                  <td style="text-align:center; padding:10px 6px;"><span class="sessao-badge ${badgeCls}">${badgeTxt}</span></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  modal.classList.add('open');
}

function closeRelModal() {
  const modal = document.getElementById('modal-relatorio-mes');
  if (modal) {
    modal.classList.remove('open');
  }
}
