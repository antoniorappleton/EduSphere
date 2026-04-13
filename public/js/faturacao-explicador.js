/**
 * EduSphere — Faturação do Explicador
 * Gere mensalidades, pagamentos e resumos financeiros.
 */

let pagamentosCache = [];
let filtroMes = new Date().getMonth() + 1;
let filtroAno = new Date().getFullYear();

document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar filtros
    const selMes = document.getElementById('fat-filtro-mes');
    const selAno = document.getElementById('fat-filtro-ano');
    
    if (selMes) selMes.value = filtroMes;
    if (selAno) selAno.value = filtroAno;

    // Listeners
    selMes?.addEventListener('change', (e) => {
        filtroMes = Number(e.target.value);
        carregarDadosFaturacao();
    });
    selAno?.addEventListener('change', (e) => {
        filtroAno = Number(e.target.value);
        carregarDadosFaturacao();
    });

    document.getElementById('btn-gerar-mensalidades')?.addEventListener('click', handleGerarMensalidades);

    // Carregar dados iniciais
    carregarDadosFaturacao();
});

async function carregarDadosFaturacao() {
    renderLoading();
    
    try {
        // Obter o ID do explicador
        const explId = await ExplicadorService.getMyExplId();
        if (!explId) throw new Error("Não autenticado como explicador.");

        // Buscar pagamentos para o mês/ano selecionado
        const { data, error } = await supabase
            .from('v_pagamentos_detalhe')
            .select('*')
            .eq('id_explicador', explId)
            .eq('ano', filtroAno)
            .eq('mes', filtroMes);

        if (error) throw error;
        pagamentosCache = data || [];

        renderTabelas();
        updateKpis();
    } catch (err) {
        console.error("Erro ao carregar faturação:", err);
        mostrarErro(err.message);
    }
}

function renderLoading() {
    const bodies = [
        document.querySelector('#tblMensalidadesPendentes tbody'), 
        document.querySelector('#tblMensalidadesPagas tbody')
    ];
    bodies.forEach(b => {
        if (b) b.innerHTML = '<tr><td colspan="7" style="text-align:center">A carregar...</td></tr>';
    });
}

function mostrarErro(msg) {
    alert("Erro: " + msg);
}

function renderTabelas() {
    const pendentesBody = document.querySelector('#tblMensalidadesPendentes tbody');
    const pagasBody = document.querySelector('#tblMensalidadesPagas tbody');

    const pendentes = pagamentosCache.filter(p => p.estado !== 'PAGO');
    const pagas = pagamentosCache.filter(p => p.estado === 'PAGO');

    if (pendentesBody) {
        pendentesBody.innerHTML = pendentes.length 
            ? pendentes.map(p => renderPendenteRow(p)).join('')
            : '<tr><td colspan="7" class="empty-state">Sem mensalidades em falta para este mês.</td></tr>';
    }

    if (pagasBody) {
        pagasBody.innerHTML = pagas.length
            ? pagas.map(p => renderPagaRow(p)).join('')
            : '<tr><td colspan="5" class="empty-state">Ainda sem mensalidades pagas.</td></tr>';
    }
}

function renderPendenteRow(p) {
    const valorPrev = Number(p.valor_previsto || 0);
    const valorPago = Number(p.valor_pago || 0);
    const emFalta = valorPrev - valorPago;
    const statusClass = (p.estado || 'PENDENTE').toLowerCase();
    
    // Avisado logic
    const isAvisado = p.mensalidade_avisada === true;
    const avisadoIcon = isAvisado ? 'notifications_active' : 'notifications_none';
    const avisadoClass = isAvisado ? 'avisado-sim' : 'avisado-nao';

    const rowColor = valorPago === 0 ? 'color: #ef4444;' : '';

    return `
        <tr style="${rowColor}">
            <td><strong style="${rowColor}">${p.aluno_nome} ${p.aluno_apelido || ''}</strong></td>
            <td>${p.mes}/${p.ano}</td>
            <td>€${valorPrev.toFixed(2)}</td>
            <td>€${valorPago.toFixed(2)}</td>
            <td style="color:#ef4444; font-weight:600">€${emFalta.toFixed(2)}</td>
            <td><span class="badge ${statusClass}" style="border: 1px solid currentColor">${p.estado || "PENDENTE"}</span></td>
            <td>
                <button class="button-icon ${avisadoClass}" onclick="toggleAvisado('${p.id_aluno}', ${!isAvisado})" title="${isAvisado ? 'Marcar como não avisado' : 'Marcar como avisado'}">
                    <span class="material-symbols-outlined">${avisadoIcon}</span>
                </button>
            </td>
        </tr>
    `;
}

function renderPagaRow(p) {
    const valorPrev = Number(p.valor_previsto || 0);
    const valorPago = Number(p.valor_pago || 0);
    const statusClass = (p.estado || 'PAGO').toLowerCase();
    
    return `
        <tr>
            <td><strong>${p.aluno_nome} ${p.aluno_apelido || ''}</strong></td>
            <td>${p.mes}/${p.ano}</td>
            <td style="color:#16a34a; font-weight:600">€${valorPago.toFixed(2)}</td>
            <td>€${valorPrev.toFixed(2)}</td>
            <td><span class="badge ${statusClass}">${p.estado}</span></td>
        </tr>
    `;
}

async function toggleAvisado(alunoId, novoEstado) {
    try {
        await ExplicadorService.setMensalidadeAvisada(alunoId, novoEstado);
        // Atualizar cache local para não recarregar tudo se possível, ou recarregar
        const pag = pagamentosCache.find(x => x.id_aluno === alunoId);
        if (pag) pag.mensalidade_avisada = novoEstado;
        renderTabelas();
    } catch (err) {
        console.error("Erro ao mudar estado de aviso:", err);
        alert("Erro ao atualizar aviso: " + err.message);
    }
}

function updateKpis() {
    let totalPrevisto = 0;
    let totalRecebido = 0;

    pagamentosCache.forEach(p => {
        totalPrevisto += Number(p.valor_previsto || 0);
        totalRecebido += Number(p.valor_pago || 0);
    });

    const pendente = totalPrevisto - totalRecebido;

    document.getElementById('kpi-fat-previsto').textContent = formatCurrency(totalPrevisto);
    document.getElementById('kpi-fat-recebido').textContent = formatCurrency(totalRecebido);
    const pendenteEl = document.getElementById('kpi-fat-pendente');
    if (pendenteEl) {
        pendenteEl.textContent = formatCurrency(pendente);
        pendenteEl.className = pendente > 0 ? 'expl-kpi-value--red' : 'expl-kpi-value--green';
    }
}

function formatCurrency(v) {
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
}

async function handleGerarMensalidades() {
    if (!confirm(`Gerar mensalidades pendentes para ${filtroMes}/${filtroAno}? (Só cria registos para alunos que ainda não tenham mensalidade neste mês)`)) return;

    const btn = document.getElementById('btn-gerar-mensalidades');
    btn.disabled = true;
    btn.textContent = 'A gerar...';

    try {
        const res = await ExplicadorService.generateMonthlyBilling(filtroAno, filtroMes);
        alert(`${res.generated_count} novas mensalidades geradas com sucesso!`);
        carregarDadosFaturacao();
    } catch (err) {
        alert("Erro ao gerar: " + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Gerar Mensalidades';
    }
}
