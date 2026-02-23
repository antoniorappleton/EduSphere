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
    .select('valor_previsto, valor_pago, estado')
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

  // 4. Fetch Alunos (Top 4 recentes ativos)
  const { data: alunos } = await supabase
    .from('alunos')
    .select('*')
    .eq('id_explicador', explId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(4);

  const countEl = document.getElementById('dash-alunos-contador');
  if (countEl) {
     const { count } = await supabase
        .from('alunos')
        .select('*', { count: 'exact', head: true })
        .eq('id_explicador', explId)
        .eq('is_active', true);
     countEl.textContent = `(${count || 0} ativos)`;
  }

  renderAlunos(alunos || []);
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

function renderAlunos(lista) {
  const grid = document.getElementById('dash-alunos-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (lista.length === 0) {
    grid.innerHTML = '<p class="empty-state">Ainda não tem alunos registados.</p>';
    return;
  }

  lista.forEach(aluno => {
    const card = document.createElement('div');
    card.className = 'aluno-mini-card';
    card.style = "background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #e5e7eb; display:flex; gap:12px; align-items:center; cursor:pointer;";
    card.onclick = () => location.href = 'alunos.html';
    
    const init = (aluno.nome || '?')[0].toUpperCase();
    
    card.innerHTML = `
      <div style="width:40px; height:40px; background:#eff6ff; color:#1d4ed8; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold;">
        ${init}
      </div>
      <div>
        <div style="font-weight:500; color:#111827;">${aluno.nome} ${aluno.apelido||''}</div>
        <div style="font-size:0.85rem; color:#6b7280;">${aluno.ano_escolaridade || '?'}º Ano</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Iniciar
loadDashboard();
