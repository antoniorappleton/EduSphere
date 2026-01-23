// public/js/dashboard-explicador.js

async function loadDashboard() {
  console.log("Loading Dashboard...");

  // 1. Verificar Sessão
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.href = '../../index.html';
    return;
  }

  // 2. Obter ID do Explicador (User ID -> Explicador ID)
  // Se for Admin a usar email de admin, pode não ter linha aqui.
  const { data: expl, error: errExpl } = await supabase
    .from('explicadores')
    .select('id, nome')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (errExpl) {
    console.error("Erro ao obter explicador:", errExpl);
    return;
  }

  if (!expl) {
    // Ver se é Admin. Se for, criar perfil dummy de Explicador automaticamente.
    const { data: userProfile } = await supabase.from('app_users').select('role').eq('user_id', session.user.id).single();
    
    if (userProfile && userProfile.role === 'admin') {
       console.log("Admin detetado sem perfil de Explicador. A criar...");
       const { data: newExpl, error: createErr } = await supabase
         .from('explicadores')
         .insert([{ user_id: session.user.id, nome: 'Admin (Modo Explicador)', email: session.user.email }])
         .select()
         .single();
       
       if (createErr) {
          console.error("Erro ao criar perfil explicador para admin:", createErr);
          document.getElementById('expl-nome-header').textContent = "Erro Admin";
          return;
       }
       // Recarregar página para assumir novo ID
       location.reload();
       return;
    }

    // Se não for admin, mostra erro normal
    document.getElementById('expl-nome-header').textContent = "Admin / Visitante";
    document.getElementById('dash-alunos-contador').textContent = "(Sem perfil de explicador)";
    document.getElementById('dash-alunos-grid').innerHTML = '<p class="empty-state">Perfil de Explicador não encontrado.</p>';
    updateKpis(0, 0, 0); // Zeros
    return;
  }

  // Preencher nome
  if(expl.nome) document.getElementById('expl-nome-header').textContent = expl.nome;

  const explId = expl.id;
  const today = new Date();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentYear = today.getFullYear();

  // 3. Fetch KPIs (Pagamentos)
  // Nota: Pagamentos tem colunas 'mes', 'ano', 'valor_previsto', 'valor_pago', 'estado'
  const { data: pags, error: errPags } = await supabase
    .from('pagamentos')
    .select('valor_previsto, valor_pago, estado')
    .eq('explicador_id', explId)
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
      if (p.estado === 'EM_ATRASO' || p.estado === 'PARCIAL') {
        totalPendentes += (prev - pago);
      }
    });
  }

  updateKpis(totalPrevisto, totalRealizado, totalPendentes);

  // 4. Fetch Alunos (Top 4 recentes ou ativos)
  const { data: alunos, error: errAlunos } = await supabase
    .from('alunos')
    .select('*')
    .eq('explicador_id', explId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(4);

  const countEl = document.getElementById('dash-alunos-contador');
  if (countEl) {
     // Contagem total
     const { count } = await supabase
        .from('alunos')
        .select('*', { count: 'exact', head: true })
        .eq('explicador_id', explId)
        .eq('is_active', true);
     countEl.textContent = `(${count || 0} ativos)`;
  }

  renderAlunos(alunos || []);
}

function updateKpis(prev, real, pend) {
  document.getElementById('card-total-previsto').textContent = formatCurrency(prev);
  document.getElementById('card-total-mes').textContent = formatCurrency(real);
  const pendEl = document.getElementById('card-pendentes');
  pendEl.textContent = formatCurrency(pend);
  if (pend > 0) pendEl.classList.add('expl-kpi-value--red');
  else pendEl.classList.remove('expl-kpi-value--red');
}

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(val);
}

function renderAlunos(lista) {
  const grid = document.getElementById('dash-alunos-grid');
  grid.innerHTML = '';

  if (lista.length === 0) {
    grid.innerHTML = '<p class="empty-state">Ainda não tem alunos registados.</p>';
    return;
  }

  lista.forEach(aluno => {
    // Card simples
    const card = document.createElement('div');
    card.className = 'aluno-mini-card';
    card.style = "background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #e5e7eb; display:flex; gap:12px; align-items:center;";
    
    // Avatar placeholder
    const init = (aluno.nome || '?')[0].toUpperCase();
    
    card.innerHTML = `
      <div style="width:40px; height:40px; background:#eff6ff; color:#1d4ed8; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold;">
        ${init}
      </div>
      <div>
        <div style="font-weight:500; color:#111827;">${aluno.nome} ${aluno.apelido||''}</div>
        <div style="font-size:0.85rem; color:#6b7280;">${aluno.ano_escolaridade}º Ano</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Iniciar
loadDashboard();
