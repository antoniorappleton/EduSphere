/**
 * EduSphere — Relatórios do Explicador
 * Visualização de dados e performance.
 */

document.addEventListener('DOMContentLoaded', async () => {
    initReports();
});

async function initReports() {
    try {
        const data = await ExplicadorService.getDetailedReports();
        renderCharts(data);
    } catch (err) {
        console.error("Erro ao carregar relatórios:", err);
        alert("Erro ao carregar dados dos relatórios.");
    }
}

function renderCharts(data) {
    renderFatChart(data.faturacao || []);
    renderSessionsChart(data.sessoes_mes || []);
    renderStudentsChart(data.alunos_mes || []);
}

function renderFatChart(fatData) {
    const ctx = document.getElementById('chartFatMensal');
    if (!ctx) return;

    const labels = fatData.map(d => `${d.mes}/${d.ano}`);
    const valsPago = fatData.map(d => Number(d.total_pago || 0));
    const valsPrev = fatData.map(d => Number(d.total_previsto || 0));

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Recebido (€)',
                    data: valsPago,
                    backgroundColor: '#16a34a',
                    borderRadius: 6
                },
                {
                    label: 'Previsto (€)',
                    data: valsPrev,
                    backgroundColor: '#e5e7eb',
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function renderSessionsChart(sessData) {
    const ctx = document.getElementById('chartHoras'); // Usando o canvas existente para horas/sessões
    if (!ctx) return;

    const labels = sessData.map(d => `${d.mes}/${d.ano}`);
    const totals = sessData.map(d => Number(d.total_sessoes || 0));

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sessões Realizadas',
                data: totals,
                borderColor: '#b91c1c',
                backgroundColor: 'rgba(185, 28, 28, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderStudentsChart(alData) {
    // Placeholder se houvesse um gráfico de alunos, mas vamos focar nos principais
    console.log("Alunos por mês:", alData);
}
