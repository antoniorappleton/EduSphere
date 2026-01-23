// public/js/alunos-explicador.js

async function initAlunosPage() {
  console.log("Initializing Alunos Page...");
  
  const grid = document.getElementById('alunos-cards-grid');
  grid.innerHTML = '<p>A carregar...</p>';

  try {
    const list = await ExplicadorService.listAlunos();
    
    // Update Counts
    document.getElementById('contagem').textContent = list.length;
    // Limit (fake data for now)
    document.getElementById('limite').textContent = "10"; // Default from schema
    document.getElementById('restantes').textContent = (10 - list.length);

    if (list.length === 0) {
      grid.innerHTML = '<p class="empty-state">Sem alunos registados.</p>';
      return;
    }

    grid.innerHTML = '';
    list.forEach(renderAlunoCard);

  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p style="color:red">Erro: ${err.message}</p>`;
  }
}

function renderAlunoCard(aluno) {
  const container = document.getElementById('alunos-cards-grid');
  const div = document.createElement('div');
  div.className = 'dash-aluno-card';
  
  const statusBadge = aluno.is_active 
     ? '<span class="dash-aluno-card__badge dash-aluno-card__badge--pago" style="background:#dcfce7;color:#166534">Ativo</span>'
     : '<span class="dash-aluno-card__badge dash-aluno-card__badge--nao-pago" style="background:#fef2f2;color:#991b1b">Inativo</span>';

  const prox = aluno.proxima_sessao 
     ? new Date(aluno.proxima_sessao).toLocaleDateString('pt-PT', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})
     : 'Agendar';

  div.innerHTML = `
    <div class="dash-aluno-card__top">
      <div class="dash-aluno-card__avatar">${(aluno.nome||'?')[0]}</div>
      <div class="dash-aluno-card__info">
        <h3 class="dash-aluno-card__name">${aluno.nome} ${aluno.apelido||''}</h3>
        <p class="dash-aluno-card__year">${aluno.ano_escolaridade || '?'}º Ano</p>
      </div>
      <div>${statusBadge}</div>
    </div>
    <div class="dash-aluno-card__content">
       <div class="dash-aluno-card__row">
         <span class="dash-aluno-card__label">Mensalidade</span>
         <span class="dash-aluno-card__date">${formatCurrency(aluno.valor_explicacao || 0)}</span>
       </div>
       <div class="dash-aluno-card__row">
         <span class="dash-aluno-card__label">Próxima aula</span>
         <span class="dash-aluno-card__date">${prox}</span>
       </div>
    </div>
    <button class="dash-aluno-card__btn" onclick="openPerfil(${aluno.id})">Ver Perfil</button>
  `;
  container.appendChild(div);
}

function formatCurrency(v) { 
  return new Intl.NumberFormat('pt-PT', {style:'currency', currency:'EUR'}).format(v); 
}

function openPerfil(id) {
  // Simple redirect or open modal
  console.log("Open perfil", id);
  // Implementation of Modal profile viewing would go here using ExplicadorService.getAluno(id)
  alert("Funcionalidade de Ver Perfil em implementação (Service Mode).");
}

// Iniciar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initAlunosPage);
