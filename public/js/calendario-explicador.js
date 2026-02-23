/**
 * EduSphere — Calendário do Explicador
 * Gere a visualização semanal, agendamentos e KPIs.
 */

let currentWeekStart = new Date();
currentWeekStart.setHours(0, 0, 0, 0);
// Ajustar para a Segunda-feira da semana atual
const day = currentWeekStart.getDay();
const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
currentWeekStart.setDate(diff);

let sessoesCache = [];
let alunosCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    initCalendar();
    
    // Listeners de Navegação de Semana
    document.getElementById('week-prev')?.addEventListener('click', () => changeWeek(-1));
    document.getElementById('week-next')?.addEventListener('click', () => changeWeek(1));

    // Botão Agendar
    document.getElementById('btn-agendar-explicacao')?.addEventListener('click', () => openSessaoModal());

    // Form de Sessão
    document.getElementById('fSessao')?.addEventListener('submit', handleSessaoSubmit);

    // Botão Eliminar
    document.getElementById('btn-delete-sessao')?.addEventListener('click', handleDeleteSessao);
});

async function initCalendar() {
    await carregarAlunos(); // Para o dropdown do modal
    await carregarDadosSemana();
}

async function carregarAlunos() {
    try {
        alunosCache = await ExplicadorService.listAlunos();
        const sel = document.getElementById('sel-aluno');
        if (sel) {
            sel.innerHTML = '<option value="">Selecionar aluno...</option>' + 
                alunosCache.map(a => `<option value="${a.id_aluno}">${a.nome} ${a.apelido || ''}</option>`).join('');
        }
    } catch (err) {
        console.error("Erro ao carregar alunos para o calendário:", err);
    }
}

async function carregarDadosSemana() {
    updateWeekLabel();
    renderGridLoading();
    
    try {
        // Por agora a listSessoes devolve tudo ou por aluno. 
        // Idealmente filtraria por data no backend, mas vamos filtrar no frontend por agora.
        sessoesCache = await ExplicadorService.listSessoes();
        renderCalendar();
        updateKpis();
    } catch (err) {
        console.error("Erro ao carregar sessões:", err);
    }
}

function updateWeekLabel() {
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 6);
    
    const fmt = { day: '2-digit', month: 'short' };
    const label = `${currentWeekStart.toLocaleDateString('pt-PT', fmt)} - ${end.toLocaleDateString('pt-PT', fmt)}`;
    const el = document.getElementById('week-label');
    if (el) el.textContent = label;
}

function changeWeek(n) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (n * 7));
    carregarDadosSemana();
}

function renderGridLoading() {
    const grid = document.getElementById('calendar-grid');
    if (grid) grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding: 2rem; color:#999;">A carregar semana...</p>';
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const proxList = document.getElementById('calendar-proximas');
    if (!grid) return;

    grid.innerHTML = '';
    const hojeStr = new Date().toISOString().slice(0, 10);

    // Gerar os 7 dias da semana
    for (let i = 0; i < 7; i++) {
        const d = new Date(currentWeekStart);
        d.setDate(d.getDate() + i);
        const dStr = d.toISOString().slice(0, 10);
        
        const isHoje = dStr === hojeStr;
        const sessoesDia = sessoesCache.filter(s => s.data === dStr);

        const col = document.createElement('div');
        col.className = `calendar-day-col ${isHoje ? 'is-today' : ''}`;
        
        const dayName = d.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '');
        const dayNum = d.getDate();

        col.innerHTML = `
            <div class="calendar-day-header">
                <span class="day-name">${dayName}</span>
                <span class="day-num">${dayNum}</span>
            </div>
            <div class="day-events">
                ${sessoesDia.map(s => renderEventMini(s)).join('')}
            </div>
        `;
        grid.appendChild(col);
    }

    // Listagem de próximas
    if (proxList) {
        const futuras = sessoesCache
            .filter(s => s.data >= hojeStr && s.estado !== 'CANCELADA')
            .sort((a,b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio))
            .slice(0, 5);

        proxList.innerHTML = futuras.length 
            ? futuras.map(s => renderEventRow(s)).join('')
            : '<p class="empty-state">Sem sessões agendadas.</p>';
    }

    // Listagem completa (Todas)
    const totalList = document.getElementById('cal-view-lista');
    if (totalList) {
        const ordenadas = [...sessoesCache].sort((a,b) => b.data.localeCompare(a.data));
        totalList.innerHTML = ordenadas.length
            ? ordenadas.map(s => renderEventDetailedRow(s)).join('')
            : '<p class="empty-state">Histórico vazio.</p>';
    }
}

function renderEventMini(s) {
    const hora = (s.hora_inicio || '--:--').slice(0, 5);
    const aluno = s.aluno_nome || 'Aluno';
    let statusClass = s.estado?.toLowerCase() || 'agendada';
    
    return `
        <div class="event-mini ${statusClass}" onclick="event.stopPropagation(); openSessaoModal('${s.id_sessao}')">
            <span class="event-time">${hora}</span>
            <span class="event-title">${aluno}</span>
        </div>
    `;
}

function renderEventRow(s) {
    const d = new Date(s.data);
    const dia = d.getDate();
    const mes = d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '');
    const hora = (s.hora_inicio || '--:--').slice(0, 5);
    const statusLabel = s.estado === 'REALIZADA' ? 'Concluída' : (s.estado === 'CANCELADA' ? 'Cancelada' : 'Agendada');

    return `
        <div class="cal-event-item" onclick="openSessaoModal('${s.id_sessao}')">
            <div class="cal-event-date">
                <span class="day">${dia}</span>
                <span class="month">${mes}</span>
            </div>
            <div class="cal-event-info">
                <p class="name">${s.aluno_nome} ${s.aluno_apelido || ''}</p>
                <p class="time">${hora} · ${s.duracao_min} min</p>
            </div>
            <div class="cal-event-status ${s.estado?.toLowerCase()}">${statusLabel}</div>
        </div>
    `;
}

function renderEventDetailedRow(s) {
    const d = new Date(s.data);
    const dataFmt = d.toLocaleDateString('pt-PT');
    const hora = (s.hora_inicio || '--:--').slice(0, 5);
    
    return `
        <div class="cal-list-row" onclick="openSessaoModal('${s.id_sessao}')">
            <div class="col-data"><strong>${dataFmt}</strong> às ${hora}</div>
            <div class="col-aluno">${s.aluno_nome} ${s.aluno_apelido || ''}</div>
            <div class="col-dur">${s.duracao_min} min</div>
            <div class="col-status"><span class="badge ${s.estado?.toLowerCase()}">${s.estado}</span></div>
        </div>
    `;
}

function updateKpis() {
    const hoje = new Date();
    const findSegunda = (d) => {
        const nd = new Date(d);
        const day = nd.getDay();
        const diff = nd.getDate() - day + (day === 0 ? -6 : 1);
        nd.setDate(diff);
        nd.setHours(0,0,0,0);
        return nd;
    };
    
    const seg = findSegunda(hoje);
    const dom = new Date(seg);
    dom.setDate(dom.getDate() + 6);
    dom.setHours(23,59,59,999);

    const sessoesSemana = sessoesCache.filter(s => {
        const sd = new Date(s.data);
        return sd >= seg && sd <= dom && s.estado !== 'CANCELADA';
    });

    const totalHoras = sessoesSemana.reduce((acc, s) => acc + (s.duracao_min || 0), 0) / 60;
    
    // Faturação Semana (Heurística: buscar valor do aluno no cache ou assumir 25 se não tiver)
    let fatSemana = 0;
    sessoesSemana.forEach(s => {
        const al = alunosCache.find(a => a.id_aluno === s.id_aluno);
        const val = al ? Number(al.valor_explicacao) : 25;
        fatSemana += val;
    });

    const prox = sessoesCache
        .filter(s => s.data >= hoje.toISOString().slice(0, 10) && s.estado === 'AGENDADA')
        .sort((a,b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio))[0];

    document.getElementById('cal-kpi-sessoes-semana').textContent = sessoesSemana.length;
    document.getElementById('cal-kpi-horas').textContent = totalHoras.toFixed(1) + 'h';
    document.getElementById('cal-kpi-fat-semana').textContent = '€' + fatSemana.toFixed(2);
    document.getElementById('cal-kpi-proxima').textContent = prox ? new Date(prox.data).getDate() + ' ' + new Date(prox.data).toLocaleDateString('pt-PT', {month:'short'}) : '—';
}

// --- MODAL LOGIC ---

function openSessaoModal(id = null) {
    const m = document.getElementById('modal-sessao');
    const f = document.getElementById('fSessao');
    const title = document.getElementById('modal-sessao-titulo');
    const btnDel = document.getElementById('btn-delete-sessao');
    const msg = document.getElementById('msgSessao');
    
    if (msg) msg.textContent = '';
    f.reset();
    
    if (id) {
        const s = sessoesCache.find(x => x.id_sessao === id);
        if (s) {
            title.textContent = 'Editar Explicação';
            document.getElementById('in-sessao-id').value = s.id_sessao;
            document.getElementById('sel-aluno').value = s.id_aluno;
            document.getElementById('in-sessao-data').value = s.data;
            document.getElementById('in-sessao-hora').value = s.hora_inicio;
            document.getElementById('in-sessao-dur').value = s.duracao_min;
            document.getElementById('sel-sessao-estado').value = s.estado;
            document.getElementById('in-sessao-notas').value = s.notas || '';
            btnDel.style.display = 'block';
        }
    } else {
        title.textContent = 'Agendar Explicação';
        document.getElementById('in-sessao-id').value = '';
        document.getElementById('in-sessao-data').value = new Date().toISOString().slice(0, 10);
        btnDel.style.display = 'none';
    }

    m.classList.add('open');
}

function closeModalSessao() {
    document.getElementById('modal-sessao').classList.remove('open');
}

async function handleSessaoSubmit(e) {
    e.preventDefault();
    const msg = document.getElementById('msgSessao');
    const btn = document.getElementById('btn-save-sessao');
    
    msg.style.color = 'blue';
    msg.textContent = 'A gravar...';
    btn.disabled = true;

    const fd = new FormData(e.target);
    const payload = {
        id_sessao: fd.get('id_sessao') || null,
        id_aluno: fd.get('id_aluno'),
        data: fd.get('data'),
        hora_inicio: fd.get('hora'),
        duracao_min: Number(fd.get('duracao')),
        estado: fd.get('estado'),
        notas: fd.get('notas')
    };

    try {
        await ExplicadorService.upsertSessao(payload);
        msg.style.color = 'green';
        msg.textContent = 'Gravado com sucesso!';
        
        setTimeout(async () => {
            closeModalSessao();
            await carregarDadosSemana();
        }, 1000);
    } catch (err) {
        msg.style.color = 'red';
        msg.textContent = 'Erro: ' + (err.message || "Falha técnica");
    } finally {
        btn.disabled = false;
    }
}

async function handleDeleteSessao() {
    const id = document.getElementById('in-sessao-id').value;
    if (!id || !confirm("Tens a certeza que queres eliminar esta sessão?")) return;

    try {
        await ExplicadorService.deleteSessao(id);
        closeModalSessao();
        await carregarDadosSemana();
    } catch (err) {
        alert("Erro ao eliminar: " + err.message);
    }
}
