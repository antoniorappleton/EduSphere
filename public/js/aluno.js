// public/js/aluno.js

const State = {
    user: null,
    profile: null,
    aluno: null
};

document.addEventListener('DOMContentLoaded', async () => {
    
    // Esperar que o Auth esteja pronto
    let attempts = 0;
    while (!window.Auth && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }

    if (!window.Auth) {
        console.error("Auth module failed to load.");
        return;
    }

    // 1. Auth Check
    const authData = await Auth.requireRole('ALUNO');
    if (!authData) return;

    // Mostrar UI
    document.querySelector('.app-layout').style.display = 'flex';

    State.user = authData.user;
    State.profile = authData.profile;

    console.log("✅ Aluno autenticado:", State.user.email);

    // 2. Load Aluno Data
    await loadAlunoData();

    // 3. Setup UI
    setupNavigation();

    // 4. Initial View
    loadView('dashboard');
});

async function loadAlunoData() {
    // Buscar registo na tabela 'alunos' pelo user_id
    const { data, error } = await supabase
        .from('alunos')
        .select('*')
        .eq('user_id', State.user.id)
        .single();
    
    if (data) {
        State.aluno = data;
        document.getElementById('studentName').textContent = data.nome.split(' ')[0];
        document.getElementById('userAvatar').textContent = getInitials(data.nome);
    } else {
        console.warn("Aluno sem registo associado.");
    }
}

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-item[data-view]');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const viewName = btn.dataset.view;
        loadView(viewName);
      });
    });
  
    document.getElementById('btnLogout').addEventListener('click', Auth.signOut);
}

function loadView(viewName) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${viewName}"]`)?.classList.add('active');
  
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  
    const section = document.getElementById(`view-${viewName}`);
    if (section) {
        section.classList.remove('hidden');
        section.classList.add('active');
        document.getElementById('pageTitle').textContent = viewName === 'dashboard' ? 'Minha Área' : viewName.charAt(0).toUpperCase() + viewName.slice(1);
    }

    if (viewName === 'dashboard') loadDashboardData();
    if (viewName === 'calendario') loadCalendarData();
}

async function loadDashboardData() {
    if (!State.aluno) return;

    // Próxima Aula
    const now = new Date().toISOString().slice(0, 10);
    const { data: nextClass } = await supabase
        .from('sessoes_explicacao')
        .select('*')
        .eq('id_aluno', State.aluno.id_aluno)
        .gte('data', now)
        .order('data', { ascending: true })
        .limit(1)
        .single();

    if (nextClass) {
        document.getElementById('nextClassInfo').textContent = nextClass.detalhes || 'Explicação';
        document.getElementById('nextClassDate').textContent = `${nextClass.data} ${nextClass.hora_inicio || ''}`;
    }

    // Mock KPI Data
    document.getElementById('kpiPaymentStatus').textContent = 'Pendente'; 
    document.getElementById('kpiPaymentValue').textContent = '€60.00'; 
}

async function loadCalendarData() {
    if (!State.aluno) return;
    const container = document.getElementById('calendarList');
    container.innerHTML = '<p>A carregar...</p>';

    const { data: classes } = await supabase
        .from('sessoes_explicacao')
        .select('*')
        .eq('id_aluno', State.aluno.id_aluno)
        .order('data', { ascending: false });

    container.innerHTML = '';
    if (classes && classes.length > 0) {
        classes.forEach(cls => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="flex-between">
                    <strong>${cls.data}</strong>
                    <span class="badge-dot" style="background:${cls.estado==='AGENDADA'?'var(--c-warning)':'var(--c-success)'};position:static;"></span>
                </div>
                <p class="mt-2 text-xl font-bold">${cls.hora_inicio || '--:--'}</p>
                <p class="text-muted text-sm">${cls.duracao_min} min</p>
                <p class="mt-2 text-sm">${cls.notas || 'Sem notas'}</p>
            `;
            container.appendChild(card);
        });
    } else {
        container.innerHTML = '<p class="text-muted">Sem histórico de aulas.</p>';
    }
}

function getInitials(name) {
    if(!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length-1][0]).toUpperCase(); 
}
