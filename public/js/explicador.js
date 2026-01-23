
// ---------- helper DOM ----------
const $ = (s) => document.querySelector(s);

// -------- Helper para chamar a Edge Function expl-alunos com token --------
async function callExplFn(action, payload = null) {
const { data: { session } } = await supabase.auth.getSession();
const accessToken = session?.access_token;

if (!accessToken) {
  return {
    data: null,
    error: { message: 'Sem sessÃ£o vÃ¡lida (faz login primeiro).', status: 401 },
  };
}

try {
  const res = await supabase.functions.invoke("expl-alunos", {
    body: { action, payload },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return res;
} catch (err) {
  console.error("Erro bruto da Edge Function:", err);

  if (err && err.context && typeof err.context.text === "function") {
    try {
      const txt = await err.context.text();
      console.error("Contexto expl-alunos:", txt);
    } catch (e) {
      console.error("Falha a ler contexto:", e);
    }
  }

  return { data: null, error: err };
}
}
let chartEvolucaoAnual = null;   // <-- novo
let chartPrevistoPago = null;
let chartPagamentosPorAluno = null;
let SESSOES_EXPLICADOR = [];
let semanaOffset = 0; // 0 = semana atual, -1 = anterior, +1 = prÃ³xima

// novos grÃ¡ficos da secÃ§Ã£o RelatÃ³rios
let chartFatMesCorrente = null;
let chartFatAlunoMesCorrente = null;
let chartSessoesMensais = null;

const weekLabel   = document.querySelector('#week-label');
const btnWeekPrev = document.querySelector('#week-prev');
const btnWeekNext = document.querySelector('#week-next');
const btnAgendarExplicacao = document.querySelector('#btn-agendar-explicacao');
const listaProximas        = document.querySelector('#calendar-proximas');

// Pagamento modal refs
const modalPag        = $('#modal-pagamento-aluno');
const formPag         = $('#fPagamentoAluno');
const msgPag          = $('#msgPagamentoAluno');
const btnSavePag      = $('#btnSavePagamento');
const pagModalTitle   = $('#pag-modal-title');
const pagModalHint    = $('#pag-modal-hint');
const inputAno        = formPag ? formPag.ano : null;
const inputMes        = formPag ? formPag.mes : null;
const inputDiaPag     = formPag ? formPag.dia_pagamento : null;
const inputValor      = formPag ? formPag.valor : null;

const elYear      = $('#y');
const btnLogout   = $('#btnLogout');
const headerNav   = $('#explSidebarNav');
const loginBox    = $('#explLogin');
const panel       = $('#explPanel');
const msgLogin    = $('#msgExplLogin');
const formLogin   = $('#fExplLogin');

const alunosGrid  = document.getElementById('alunos-cards-grid');
const elLimite    = $('#limite');
const elContagem  = $('#contagem');
const elRestantes = $('#restantes');

const elNomeHeader = $('#expl-nome-header');
const elNomeMini   = $('#expl-nome-mini');

const btnFab          = $('#btn-add-aluno');
const btnOpenAddAluno = $('#btn-open-add-aluno');
const btnScrollLista  = $('#btn-scroll-lista');

const modalAddAluno   = $('#modal-add-aluno');
const formNew         = $('#fNewAluno');
const msgNewAluno     = $('#msgNewAluno');
const btnCreate       = $('#btnCreateAluno');

const modalEditAluno  = $('#modal-edit-aluno');
const formEdit        = $('#fEditAluno');
const msgEditAluno    = $('#msgEditAluno');
const btnSaveEdit     = $('#btnSaveEditAluno');
const btnEditarAluno  = $('#btn-editar-aluno');

const alunoStatusBadge = $('#aluno-status-badge');
const toggleAlunoAtivo = $('#toggle-aluno-ativo');

const btnIniciarFat   = $('#btn-iniciar-faturacao');
const btnRegistarPag  = $('#btn-registar-pagamento');
const btnEditarPag    = $('#btn-editar-pagamento');

const modalSessao     = $('#modal-sessao');
const formSessao      = $('#fSessao');
const msgSessao       = $('#msgSessao');
const btnSaveSessao   = $('#btnSaveSessao');
const btnDeleteSessao = $('#btnDeleteSessao');
const btnAddSessao    = $('#btn-add-sessao');
const tblSessoesBody  = $('#tblSessoesAluno tbody');

const btnDashVerAlunos = $('#btn-dashboard-ver-alunos');
const selFatMes  = document.getElementById("fat-filtro-mes");
const selFatAno  = document.getElementById("fat-filtro-ano");

if (elYear) elYear.textContent = new Date().getFullYear();

let EXPLICADOR       = { userId: null, id_explicador: null, max: 0 };
let ALUNOS_CACHE     = [];
let PAGAMENTOS_CACHE = [];
let ALUNO_ATUAL      = null;
let SESSAO_ATUAL_ID  = null;
  // Filtros atuais da secÃ§Ã£o de faturaÃ§Ã£o
let FAT_ANO_SELEC = null;
let FAT_MES_SELEC = null;
let SESSOES_ALUNO_ATUAL = [];
let PAGAMENTOS_MES = [];

function preencherPerfilAlunoBasico(aluno) {
  if (!aluno) return;

  const nomeCompleto = [aluno.nome, aluno.apelido].filter(Boolean).join(" ");

  const elNome   = document.getElementById("alunoNome");
  const elAno    = document.getElementById("alunoAno");
  const elEmail  = document.getElementById("alunoEmail");
  const elTele   = document.getElementById("alunoTele");
  const elAvatar = document.getElementById("alunoAvatar");
  const elStatus = document.getElementById("alunoStatus");

  if (elNome)   elNome.textContent = nomeCompleto || "Aluno";
  if (elAno)    elAno.textContent  = aluno.ano ? `${aluno.ano}Âº Ano` : "â€”";
  if (elEmail)  elEmail.textContent = aluno.email || "â€”";
  if (elTele)   elTele.textContent  = aluno.telemovel || "â€”";

  if (elAvatar) {
    const ini =
      (aluno.nome?.[0] || "") + (aluno.apelido?.[0] || "");
    elAvatar.textContent = ini.toUpperCase() || "??";
  }

  if (elStatus) {
    const ativo = aluno.is_active !== false;
    elStatus.textContent = ativo ? "Ativo" : "Inativo";
    elStatus.classList.toggle("active", ativo);
  }

  // (se quiseres, podes preencher alunoDataInscricao quando tiveres esse campo)
}

function getInicioSemana(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Dom,1=Seg,...6=SÃ¡b
  const diff = (day + 6) % 7; // queremos comeÃ§ar em SEG
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const NOMES_DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'SÃ¡b', 'Dom'];

// ---------- helpers supabase ----------
async function hasRole(uid, roleName) {
  const { data, error } = await supabase
    .from('app_users')
    .select('role')
    .eq('user_id', uid)
    .eq('role', roleName)
    .maybeSingle();
  if (error) {
    console.error('hasRole error', error);
    return false;
  }
  return !!data;
}

async function getExplRow(uid) {
  const { data, error } = await supabase
    .from('explicadores')
    .select('id_explicador, nome, apelido, max_alunos')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function setState({ loading = false, isExpl = false, isAuthed = false }) {
  if (loading) {
    if(loginBox) loginBox.style.display = 'block';
    if(panel) panel.style.display    = 'none';
    if(msgLogin) msgLogin.textContent   = 'A verificar sessÃ£o...';
    if(btnLogout) btnLogout.style.display = 'none';
    if(headerNav) headerNav.style.display = 'none';
    return;
  }
  if (isAuthed && isExpl) {
    if(loginBox) loginBox.style.display = 'none';
    if(panel) panel.style.display    = 'flex';
    if(msgLogin) msgLogin.textContent   = '';
    if(btnLogout) btnLogout.style.display = 'inline-block';
    if(headerNav) headerNav.style.display = 'flex';
    const mainAuth = document.querySelector('main.auth');
    if(mainAuth) mainAuth.style.display = 'block';
  } else {
    // Caso de exceÃ§Ã£o ou logout, mas que deve ser tratado pelo auth.js na verdade
    // Mantemos aqui caso o utilizador entre diretamente
    if(loginBox) loginBox.style.display = 'block';
    if(panel) panel.style.display    = 'none';
    if(btnLogout) btnLogout.style.display = 'none';
    if(headerNav) headerNav.style.display = 'none';
    const mainAuth = document.querySelector('main.auth');
    if(mainAuth) mainAuth.style.display = 'grid';
  }
}

// ---------- QUOTA UI ----------
function updateQuotaUI(total) {
  const max = Number(EXPLICADOR.max || 0);
  if(elContagem) elContagem.textContent = String(total);

  if (!max) {
    if(elLimite) elLimite.textContent    = 'Sem limite';
    if(elRestantes) elRestantes.textContent = 'â€”';
    btnCreate && (btnCreate.disabled = false);
    return;
  }

  if(elLimite) elLimite.textContent = String(max);
  const rest = Math.max(0, max - total);
  if(elRestantes) elRestantes.textContent = String(rest);

  if (btnCreate) {
    btnCreate.disabled = rest <= 0;
    btnCreate.title    = rest <= 0 ? 'Limite de alunos atingido.' : '';
  }
}

// ---------- DASHBOARD: CARDS DE ALUNOS ----------
function renderDashboardAlunos() {
  const grid = document.getElementById("dash-alunos-grid");
  const contador = document.getElementById("dash-alunos-contador");
  if (!grid) return;

  const alunosAtivos = (ALUNOS_CACHE || []).filter((a) => a.is_active !== false);
  const totalAtivos = alunosAtivos.length;

  if (contador) {
    contador.textContent =
      totalAtivos === 1 ? "(1 ativo)" : `(${totalAtivos} ativos)`;
  }

  if (!totalAtivos) {
    grid.innerHTML =
      '<p class="expl-section-sub">Ainda nÃ£o tens alunos ativos registados.</p>';
    return;
  }

  // SÃ³ mostramos atÃ© 3, como no mock
  const top3 = alunosAtivos.slice(0, 3);

  // helper para mapear estado â†’ label + classe de badge
  function getEstadoInfo(rawEstado) {
    const e = (rawEstado || "").toString().trim().toUpperCase();

    switch (e) {
      case "PAGO":
        return {
          label: "Pago",
          badgeClass: "dash-aluno-card__badge dash-aluno-card__badge--pago",
        };
      case "PARCIAL":
        return {
          label: "Parcial",
          badgeClass: "dash-aluno-card__badge dash-aluno-card__badge--parcial",
        };
      case "PENDENTE":
      default:
        return {
          label: e ? e.charAt(0) + e.slice(1).toLowerCase() : "Pendente",
          badgeClass:
            "dash-aluno-card__badge dash-aluno-card__badge--pendente",
        };
    }
  }

  grid.innerHTML = top3
    .map((a) => {
      const nome = [a.nome, a.apelido].filter(Boolean).join(" ") || "Aluno";
      const anoLabel = a.ano ? `${a.ano}Âº Ano` : "â€”";

      // PrÃ³xima explicaÃ§Ã£o
      let proxExpLabel = "Nenhuma explicaÃ§Ã£o agendada";
      if (a.proxima_sessao_data) {
        const d = new Date(a.proxima_sessao_data);
        if (!isNaN(d.getTime())) {
          const dataNum = d.toLocaleDateString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
          });
          const diaSemana = d.toLocaleDateString("pt-PT", {
            weekday: "short",
          });
          const hora = (a.proxima_sessao_hora || "").slice(0, 5);
          proxExpLabel = hora
            ? `${dataNum} (${diaSemana}) Â· ${hora}`
            : `${dataNum} (${diaSemana})`;
        }
      }

      // prÃ³xima mensalidade
      let proxMensLabel = "â€”";
      if (a.proxima_mensalidade) {
        const d = new Date(a.proxima_mensalidade);
        if (!isNaN(d.getTime())) {
          proxMensLabel = d.toLocaleDateString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
          });
        } else {
          proxMensLabel = a.proxima_mensalidade;
        }
      }
      const { label: estadoLabel, badgeClass } = getEstadoInfo(
        a.estado_mensalidade || "PENDENTE"
      );

      const ativo = a.is_active !== false;
      const statusLabel = ativo ? "Ativo" : "Inativo";
      const statusClass = ativo
        ? "aluno-status-badge aluno-status-badge--ativo"
        : "aluno-status-badge aluno-status-badge--inativo";

      const avisado = !!a.mensalidade_avisada;

      return `
        <article class="dash-aluno-card aluno-card">
          <div>
            <div class="dash-aluno-card__top" style="justify-content: space-between;">
              <div style="display:flex; gap:12px;">
                <div class="dash-aluno-card__avatar"></div>
                <div>
                  <h3 class="dash-aluno-card__name">${nome}</h3>
                  <p class="dash-aluno-card__year">${anoLabel}</p>
                  <p class="aluno-card__phone">
                    TelemÃ³vel: <span>${a.telemovel || "â€”"}</span>
                  </p>
                </div>
              </div>

              <span class="${statusClass}">
                ${statusLabel}
              </span>
            </div>

            <p class="dash-aluno-card__label">PrÃ³xima explicaÃ§Ã£o:</p>
            <p class="dash-aluno-card__date">${proxExpLabel}</p>

            <div class="aluno-card__mensalidade-row">
              <div>
                <p class="dash-aluno-card__label">Mensalidade (mÃªs atual):</p>
                <span class="${badgeClass}">
                  ${estadoLabel}
                </span>
              </div>

              <button
                type="button"
                class="aluno-card__bell"
                data-id-aluno="${a.id_aluno}"
                data-avisado="${avisado ? "true" : "false"}"
                aria-pressed="${avisado ? "true" : "false"}"
                title="${avisado ? "Encarregado avisado" : "Marcar como avisado"}"
              >
                <svg
                  class="aluno-bell-icon${avisado ? " aluno-bell-icon--active" : ""}"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3a4 4 0 0 0-4 4v1.1c0 .5-.2 1-.4 1.5L6.3 12A2 2 0 0 0 8 15h8a2 2 0 0 0 1.7-3l-1.3-2.4c-.2-.5-.4-1-.4-1.5V7a4 4 0 0 0-4-4z" />
                  <path d="M10 18a2 2 0 0 0 4 0" />
                </svg>
              </button>
            </div>

            <p class="dash-aluno-card__label">PrÃ³xima mensalidade:</p>
            <p class="dash-aluno-card__date">${proxMensLabel}</p>
          </div>

          <div class="aluno-card__actions">
            <button
              type="button"
              class="button secondary aluno-card__btn"
              data-action="ver"
              data-id-aluno="${a.id_aluno}"
            >
              Ver perfil
            </button>

            <button
              type="button"
              class="button secondary aluno-card__btn"
              data-action="perfil"
              data-id-aluno="${a.id_aluno}"
            >
              InformaÃ§Ãµes rÃ¡pidas
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  // --- BOTÃ•ES "Ver perfil" / "InformaÃ§Ãµes rÃ¡pidas" ---
  grid
    .querySelectorAll(".aluno-card__btn")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const idAluno = btn.getAttribute("data-id-aluno");
        const acao = btn.dataset.action; // "ver" ou "perfil"

        const aluno = (ALUNOS_CACHE || []).find(
          (x) => String(x.id_aluno) === String(idAluno)
        );
        if (!aluno) return;

        // âžœ Ver perfil completo
        if (acao === "ver") {
          preencherPerfilAlunoBasico(aluno);
          mostrarPainelAluno(aluno);
          ativarScreen("aluno-perfil");
          return;
        }

        // âžœ InformaÃ§Ãµes rÃ¡pidas
        if (acao === "perfil") {
          mostrarPainelAluno(aluno);
          ativarScreen("alunos");

          const card = document.getElementById("aluno-detail-card");
          if (card) {
            card.style.display = "block";
            card.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      });
    });

  // --- SINOS (avisar mensalidade) ---
  grid
    .querySelectorAll(".aluno-card__bell")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idAluno = btn.getAttribute("data-id-aluno");
        const aluno = (ALUNOS_CACHE || []).find(
          (x) => String(x.id_aluno) === String(idAluno)
        );
        if (!aluno) return;

        const avisadoAtual = !!aluno.mensalidade_avisada;
        const novoEstado   = !avisadoAtual;

        // feedback visual imediato
        const svg = btn.querySelector("svg");
        if (svg) {
          svg.classList.toggle("aluno-bell-icon--active", novoEstado);
        }
        btn.setAttribute("aria-pressed", novoEstado ? "true" : "false");
        btn.dataset.avisado = String(novoEstado);

        // chamada ao backend
        btn.disabled = true;
        try {
          const { error } = await callExplFn("set_mensalidade_avisada", {
            aluno_id: aluno.id_aluno,   // TEM de ser aluno_id (como no backend)
            avisado: novoEstado,
          });

          if (error) {
            console.error("Erro ao atualizar aviso:", error);

            // reverte visual se der erro
            if (svg) {
              svg.classList.toggle("aluno-bell-icon--active", avisadoAtual);
            }
            btn.setAttribute(
              "aria-pressed",
              avisadoAtual ? "true" : "false"
            );
            btn.dataset.avisado = String(avisadoAtual);

            alert("NÃ£o foi possÃ­vel atualizar o estado de aviso.");
            return;
          }

          // se correu bem, atualiza cache
          aluno.mensalidade_avisada = novoEstado;
        } finally {
          btn.disabled = false;
        }
      });
    });
}

// ---------- ALUNOS: TABELA GERAL ----------
function renderAlunosList() {
  if (!alunosGrid) return;

  const alunos = ALUNOS_CACHE || [];
  updateQuotaUI(alunos.length);

  // Se nÃ£o houver alunos
  if (alunos.length === 0) {
    alunosGrid.innerHTML = '<p class="text-muted">Ainda nÃ£o tens alunos registados.</p>';
    return;
  }

  function getEstadoInfo(rawEstado) {
      const e = (rawEstado || "").toString().trim().toUpperCase();
      switch (e) {
        case "PAGO":
          return {
            label: "Pago",
            badgeClass: "dash-aluno-card__badge dash-aluno-card__badge--pago",
          };
        case "PARCIAL":
          return {
            label: "Parcial",
            badgeClass: "dash-aluno-card__badge dash-aluno-card__badge--parcial",
          };
        case "PENDENTE":
        default:
          return {
            label: e ? e.charAt(0) + e.slice(1).toLowerCase() : "Pendente",
            badgeClass:
              "dash-aluno-card__badge dash-aluno-card__badge--pendente",
          };
      }
    }

  // Preencher GRID
  alunosGrid.innerHTML = alunos
    .map((a) => {
      const nome = [a.nome, a.apelido].filter(Boolean).join(" ") || "Aluno";
      const anoLabel = a.ano ? `${a.ano}Âº Ano` : "â€”";
      const tel = a.telemovel || "â€”";
      let proxExpLabel = "â€”";
      if (a.proxima_sessao_data) {
        const d = new Date(a.proxima_sessao_data);
        if (!isNaN(d.getTime())) {
          const dataNum = d.toLocaleDateString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
          });
          const diaSemana = d.toLocaleDateString("pt-PT", {
            weekday: "short",
          }); // ex: "seg.", "ter."

          const hora = (a.proxima_sessao_hora || "").slice(0, 5);
          proxExpLabel = hora
            ? `${dataNum} (${diaSemana}) Â· ${hora}`
            : `${dataNum} (${diaSemana})`;
        }
      }

      // prÃ³xima mensalidade
      let proxMensLabel = "â€”";
      if (a.proxima_mensalidade) {
        const d = new Date(a.proxima_mensalidade);
        if (!isNaN(d.getTime())) {
          proxMensLabel = d.toLocaleDateString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
          });
        } else {
          proxMensLabel = a.proxima_mensalidade;
        }
      }
      const { label: estadoLabel, badgeClass } = getEstadoInfo(
        a.estado_mensalidade || "PENDENTE"
      );

      const ativo = a.is_active !== false;
      const statusLabel = ativo ? "Ativo" : "Inativo";
      const statusClass = ativo
        ? "aluno-status-badge aluno-status-badge--ativo"
        : "aluno-status-badge aluno-status-badge--inativo";

      const avisado = !!a.mensalidade_avisada;

      return `
        <article class="dash-aluno-card aluno-card">
          <div>
            <div class="dash-aluno-card__top" style="justify-content: space-between;">
              <div style="display:flex; gap:12px;">
                <div class="dash-aluno-card__avatar"></div>
                <div>
                  <h3 class="dash-aluno-card__name">${nome}</h3>
                  <p class="dash-aluno-card__year">${anoLabel}</p>
                  <p class="aluno-card__phone">
                    TelemÃ³vel: <span>${tel}</span>
                  </p>
                </div>
              </div>

              <span class="${statusClass}">
                ${statusLabel}
              </span>
            </div>

            <p class="dash-aluno-card__label">PrÃ³xima explicaÃ§Ã£o:</p>
            <p class="dash-aluno-card__date">${proxExpLabel}</p>

            <div class="aluno-card__mensalidade-row">
              <div>
                <p class="dash-aluno-card__label">Mensalidade (mÃªs atual):</p>
                <span class="${badgeClass}">
                  ${estadoLabel}
                </span>
              </div>

              <button
                type="button"
                class="aluno-card__bell"
                data-id-aluno="${a.id_aluno}"
                data-avisado="${avisado ? "true" : "false"}"
                aria-pressed="${avisado ? "true" : "false"}"
                title="${avisado ? "Encarregado avisado" : "Marcar como avisado"}"
              >
                <svg
                  class="aluno-bell-icon${avisado ? " aluno-bell-icon--active" : ""}"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3a4 4 0 0 0-4 4v1.1c0 .5-.2 1-.4 1.5L6.3 12A2 2 0 0 0 8 15h8a2 2 0 0 0 1.7-3l-1.3-2.4c-.2-.5-.4-1-.4-1.5V7a4 4 0 0 0-4-4z" />
                  <path d="M10 18a2 2 0 0 0 4 0" />
                </svg>
              </button>
            </div>

            <p class="dash-aluno-card__label">PrÃ³xima mensalidade:</p>
            <p class="dash-aluno-card__date">${proxMensLabel}</p>
          </div>

          <div class="aluno-card__actions">
            <button
              type="button"
              class="button secondary aluno-card__btn"
              data-action="ver"
              data-id-aluno="${a.id_aluno}"
            >
              Ver perfil
            </button>

            <button
              type="button"
              class="button secondary aluno-card__btn"
              data-action="perfil"
              data-id-aluno="${a.id_aluno}"
            >
              InformaÃ§Ãµes rÃ¡pidas
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  // --- BOTÃ•ES "Ver perfil" / "InformaÃ§Ãµes rÃ¡pidas" ---
  alunosGrid
    .querySelectorAll(".aluno-card__btn")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const idAluno = btn.getAttribute("data-id-aluno");
        const acao = btn.dataset.action; // "ver" ou "perfil"

        const aluno = (ALUNOS_CACHE || []).find(
          (x) => String(x.id_aluno) === String(idAluno)
        );
        if (!aluno) return;

        // âžœ Ver perfil completo
        if (acao === "ver") {
          preencherPerfilAlunoBasico(aluno);
          mostrarPainelAluno(aluno);
          ativarScreen("aluno-perfil");
          return;
        }

        // âžœ InformaÃ§Ãµes rÃ¡pidas
        if (acao === "perfil") {
          mostrarPainelAluno(aluno);
          ativarScreen("alunos");

          const card = document.getElementById("aluno-detail-card");
          if (card) {
            card.style.display = "block";
            card.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      });
    });

  // --- SINOS (avisar mensalidade) ---
  alunosGrid
    .querySelectorAll(".aluno-card__bell")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idAluno = btn.getAttribute("data-id-aluno");
        const aluno = (ALUNOS_CACHE || []).find(
          (x) => String(x.id_aluno) === String(idAluno)
        );
        if (!aluno) return;

        const avisadoAtual = !!aluno.mensalidade_avisada;
        const novoEstado   = !avisadoAtual;

        // feedback visual imediato
        const svg = btn.querySelector("svg");
        if (svg) {
          svg.classList.toggle("aluno-bell-icon--active", novoEstado);
        }
        btn.setAttribute("aria-pressed", novoEstado ? "true" : "false");
        btn.dataset.avisado = String(novoEstado);

        // chamada ao backend
        btn.disabled = true;
        try {
          const { error } = await callExplFn("set_mensalidade_avisada", {
            aluno_id: aluno.id_aluno,   // TEM de ser aluno_id (como no backend)
            avisado: novoEstado,
          });

          if (error) {
            console.error("Erro ao atualizar aviso:", error);

            // reverte visual se der erro
            if (svg) {
              svg.classList.toggle("aluno-bell-icon--active", avisadoAtual);
            }
            btn.setAttribute(
              "aria-pressed",
              avisadoAtual ? "true" : "false"
            );
            btn.dataset.avisado = String(avisadoAtual);

            alert("NÃ£o foi possÃ­vel atualizar o estado de aviso.");
            return;
          }

          // se correu bem, atualiza cache
          aluno.mensalidade_avisada = novoEstado;
        } finally {
          btn.disabled = false;
        }
      });
    });
}

// Devolve { ano, mes, mesLabel } garantindo que escolhemos um mÃªs com dados
function getMesAnoSelecionadosOuUltimoComDados() {
  const selMes = document.getElementById("fat-filtro-mes");
  const selAno = document.getElementById("fat-filtro-ano");
  const now = new Date();

  let ano = selAno && selAno.value ? Number(selAno.value) : now.getFullYear();
  let mes = selMes && selMes.value ? Number(selMes.value) : now.getMonth() + 1;

  // Sincronizar selects com esta escolha
  if (selAno) selAno.value = String(ano);
  if (selMes) selMes.value = String(mes);

  const nomesMeses = [
    "Janeiro", "Fevereiro", "MarÃ§o", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const mesLabel = nomesMeses[mes - 1] || String(mes);

  return { ano, mes, mesLabel };
}

// ---------- RESUMO MENSAL ----------
function getDadosMesSelecionado() {
const tbodyPend  = document.querySelector("#tblMensalidadesPendentes tbody");
const tbodyPagas = document.querySelector("#tblMensalidadesPagas tbody");
if (!tbodyPend || !tbodyPagas) return null;

const { ano, mes, mesLabel } = getMesAnoSelecionadosOuUltimoComDados();

const pendentes = [];
const pagas     = [];

let totalPrevistoPend  = 0;
let totalFaltaPend     = 0;
let totalPagoPagas     = 0;
let totalPrevistoPagas = 0;

// Mapear registos da view por id_aluno
const pagamentosDoMes = new Map();
(PAGAMENTOS_CACHE || []).forEach((p) => {
  if (p.ano === ano && p.mes === mes) {
    pagamentosDoMes.set(String(p.id_aluno), p);
  }
});

// Agora processamos TODOS os alunos ativos
(ALUNOS_CACHE || []).forEach((a) => {
  if (a.is_active === false) return;

  const chave = String(a.id_aluno);

  const nomeAluno = [a.nome, a.apelido].filter(Boolean).join(" ");

  const mensalidade = (Number(a.valor_explicacao) || 0) * (Number(a.sessoes_mes) || 0);

  // Obter registo real (se existir)
  const p = pagamentosDoMes.get(chave);

  const previsto = p ? (Number(p.valor_previsto) || mensalidade) : mensalidade;
  const pago     = p ? (Number(p.valor_pago) || 0) : 0;

  const falta = Math.max(previsto - pago, 0);

  const linha = {
    aluno: nomeAluno,
    previsto,
    pago,
    falta,
    estado: falta === 0 && pago > 0 ? "Pago" : "Pendente",
    mes: mesLabel,
    avisado: "â€”",
  };

  if (falta > 0) {
    pendentes.push(linha);
    totalPrevistoPend += previsto;
    totalFaltaPend    += falta;
  } else {
    pagas.push(linha);
    totalPagoPagas     += pago;
    totalPrevistoPagas += previsto;
  }
});

return {
  ano,
  mes,
  mesLabel,
  pendentes,
  pagas,
  totalPrevistoPend,
  totalFaltaPend,
  totalPagoPagas,
  totalPrevistoPagas,
};
}


// ---------- RESUMO MENSAL (tabelas) ----------
function renderResumoMensal() {
  const tbodyPend = document.querySelector("#tblMensalidadesPendentes tbody");
  const tbodyPagas = document.querySelector("#tblMensalidadesPagas tbody");

  if (!tbodyPend || !tbodyPagas) return;

  const dados = getDadosMesSelecionado();
  if (!dados) return;

  const {
    mesLabel,
    pendentes,
    pagas,
    totalPrevistoPend,
    totalFaltaPend,
    totalPagoPagas,
    totalPrevistoPagas,
  } = dados;

  // Pendentes
  if (!pendentes.length) {
    tbodyPend.innerHTML =
      '<tr><td colspan="7">Ainda não existem mensalidades em falta neste mês.</td></tr>';
  } else {
    const rowsPend = pendentes
      .map(
        (r) => `
      <tr>
        <td>${r.aluno}</td>
        <td>${r.mes}</td>
        <td>€ ${r.previsto.toFixed(2)}</td>
        <td>€ ${r.pago.toFixed(2)}</td>
        <td>€ ${r.falta.toFixed(2)}</td>
        <td>${r.estado}</td>
        <td>${r.avisado}</td>
      </tr>
    `
      )
      .join("");

    const totalRow = `
    <tr>
      <td><strong>Total</strong></td>
      <td>${mesLabel}</td>
      <td><strong>€ ${totalPrevistoPend.toFixed(2)}</strong></td>
      <td></td>
      <td><strong>€ ${totalFaltaPend.toFixed(2)}</strong></td>
      <td colspan="2"></td>
    </tr>
  `;

    tbodyPend.innerHTML = rowsPend + totalRow;
  }

  // Pagas
  if (!pagas.length) {
    tbodyPagas.innerHTML =
      '<tr><td colspan="5">Ainda não existem mensalidades pagas neste mês.</td></tr>';
  } else {
    const rowsPagas = pagas
      .map(
        (r) => `
      <tr>
        <td>${r.aluno}</td>
        <td>${r.mes}</td>
        <td>€ ${r.pago.toFixed(2)}</td>
        <td>€ ${r.previsto.toFixed(2)}</td>
        <td>${r.estado}</td>
      </tr>
    `
      )
      .join("");

    const totalRowPagas = `
    <tr>
      <td><strong>Total</strong></td>
      <td>${mesLabel}</td>
      <td><strong>€ ${totalPagoPagas.toFixed(2)}</strong></td>
      <td><strong>€ ${totalPrevistoPagas.toFixed(2)}</strong></td>
      <td></td>
    </tr>
  `;

    tbodyPagas.innerHTML = rowsPagas + totalRowPagas;
  }
}

function atualizarGraficosPagamentos() {
  const canvasResumo   = document.getElementById("chart-previsto-pago");
  const canvasPorAluno = document.getElementById("chart-por-aluno");

  if (!canvasResumo && !canvasPorAluno) return;

  const dados = getDadosMesSelecionado();
  if (!dados) return;

  const { mesLabel, pendentes, pagas } = dados;
  const todos = [...pendentes, ...pagas];

  const totalPrevisto = todos.reduce((acc, r) => acc + (r.previsto || 0), 0);
  const totalPago     = todos.reduce((acc, r) => acc + (r.pago || 0), 0);
  const totalFalta    = Math.max(totalPrevisto - totalPago, 0);

  // --- Gráfico 1: Previsto vs Pago vs Em falta ---
  if (chartPrevistoPago) {
    chartPrevistoPago.destroy();
  }
  if (canvasResumo) {
    const ctxResumo = canvasResumo.getContext("2d");
    chartPrevistoPago = new Chart(ctxResumo, {
      type: "bar",
      data: {
        labels: ["Previsto", "Pago", "Em falta"],
        datasets: [
          {
            label: mesLabel,
            data: [totalPrevisto, totalPago, totalFalta],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,   // < importante com CSS que vamos pôr
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }

  // --- Gráfico 2: Pagamentos por aluno ---
  if (chartPagamentosPorAluno) {
    chartPagamentosPorAluno.destroy();
  }
  if (canvasPorAluno) {
    const ctxPorAluno = canvasPorAluno.getContext("2d");

    const porAluno = new Map();
    todos.forEach((r) => {
      const entry = porAluno.get(r.aluno) || { previsto: 0, pago: 0 };
      entry.previsto += r.previsto || 0;
      entry.pago     += r.pago || 0;
      porAluno.set(r.aluno, entry);
    });

    const labels = Array.from(porAluno.keys());
    const datasetPrevisto = labels.map((nome) => porAluno.get(nome).previsto);
    const datasetPago     = labels.map((nome) => porAluno.get(nome).pago);

    chartPagamentosPorAluno = new Chart(ctxPorAluno, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Previsto", data: datasetPrevisto },
          { label: "Pago", data: datasetPago },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,   // idem
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }
}

function atualizarGraficoEvolucaoAnual() {
  const canvas = document.getElementById("chart-evolucao-anual");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const anoAtual = new Date().getFullYear();

  const nomesMesesCurtos = [
    "Jan","Fev","Mar","Abr","Mai","Jun",
    "Jul","Ago","Set","Out","Nov","Dez"
  ];

  const previsto = new Array(12).fill(0);
  const realizado = new Array(12).fill(0);

  // 1) SOMAR VALORES DE PAGAMENTOS (pagos e previstos)
  (PAGAMENTOS_CACHE || []).forEach((p) => {
    if (p.ano !== anoAtual) return;

    const idx = (Number(p.mes) || 1) - 1;

    previsto[idx]  += Number(p.valor_previsto || 0);
    realizado[idx] += Number(p.valor_pago || 0);
  });

  // 2) PREVISÃO AUTOMÁTICA / CORREÇÃO COM BASE NA MENSALIDADE
  const mensalBase = (() => {
    let tot = 0;
    (ALUNOS_CACHE || []).forEach(a => {
      if (a.is_active === false) return;

      const v = Number(a.valor_explicacao) || 0;
      const s = Number(a.sessoes_mes) || 0;

      if (v > 0 && s > 0) tot += v * s;
    });
    return tot;
  })();

  if (mensalBase > 0) {
    for (let i = 0; i < 12; i++) {
      // usa sempre a mensalidade como mínimo do previsto
      if (previsto[i] < mensalBase) {
        previsto[i] = mensalBase;
      }
    }
  }

  // 3) Destruir gráfico antigo
  if (window.chartEvolucaoAnual) window.chartEvolucaoAnual.destroy();

  // 4) Criar gráfico final
  window.chartEvolucaoAnual = new Chart(ctx, {
    type: "bar",
    data: {
      labels: nomesMesesCurtos,
      datasets: [
        {
          label: "Previsto (€)",
          data: previsto,
          backgroundColor: "#3b82f6"
        },
        {
          label: "Realizado (€)",
          data: realizado,
          backgroundColor: "#ec4899"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderGraficoFatAlunoMesCorrente() {
  const canvas = document.getElementById("chart-fat-aluno-mes"); // <- SINGULAR
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (window.chartFatAlunos) window.chartFatAlunos.destroy();

  const nomes    = PAGAMENTOS_MES.map(a => a.aluno_nome);
  const previsto = PAGAMENTOS_MES.map(a => Number(a.valor_previsto || 0));
  const pago     = PAGAMENTOS_MES.map(a => Number(a.valor_pago || 0));

  window.chartFatAlunos = new Chart(ctx, {
    type: "bar",
    data: {
      labels: nomes,
      datasets: [
        {
          label: "Previsto",
          data: previsto,
          backgroundColor: "#3b82f6", // azul
        },
        {
          label: "Pago",
          data: pago,
          backgroundColor: "#ec4899", // rosa
        }
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true },
        x: { stacked: false }
      }
    }
  });
}


function renderGraficoSessoesMensais() {
  const canvas = document.getElementById("chart-sessoes-mensais");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const now = new Date();
  const anoAtual = now.getFullYear();

  const nomesMesesCurtos = [
    "Jan","Fev","Mar","Abr","Mai","Jun",
    "Jul","Ago","Set","Out","Nov","Dez"
  ];

  const previstasPorMes  = new Array(12).fill(0);
  const realizadasPorMes = new Array(12).fill(0);

  (SESSOES_EXPLICADOR || []).forEach((s) => {
    if (!s.data) return;

    const d = new Date(s.data);
    if (d.getFullYear() !== anoAtual) return;

    const idxMes = d.getMonth(); // 0-11
    const estado = (s.estado || "").toUpperCase();

    if (estado === "AGENDADA") {
      previstasPorMes[idxMes] += 1;
    } else if (estado === "REALIZADA") {
      realizadasPorMes[idxMes] += 1;
    }
  });

  if (chartSessoesMensais) {
    chartSessoesMensais.destroy();
  }

  chartSessoesMensais = new Chart(ctx, {
    type: "line",
    data: {
      labels: nomesMesesCurtos,
      datasets: [
        {
          label: "Previstas",
          data: previstasPorMes,
          tension: 0.3
        },
        {
          label: "Realizadas",
          data: realizadasPorMes,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

// ---------- Gráfico mês corrente --------- //
let chartFatMesCorr = null;

async function renderGraficoFatMesCorrente() {
    const canvas = document.getElementById("chart-fat-mes-corrente");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const hoje = new Date();
    const ano  = hoje.getFullYear();
    const mes  = hoje.getMonth() + 1;

    const { data, error } = await supabase.rpc("fat_mes_corrente", {
      p_id_explicador: EXPLICADOR.id_explicador,
      p_ano: ano,
      p_mes: mes,
    });

    if (error) {
      console.error("Erro RPC fat_mes_corrente:", error);
      return;
    }

    // Guarda para outros gráficos / tabelas
    PAGAMENTOS_MES = data || [];

    // ---- AGRUPAR POR ALUNO (1 entrada por aluno) ----
    const porAluno = new Map();

    (PAGAMENTOS_MES || []).forEach((r) => {
      // chave: idealmente o id_aluno; se não houver, usa o nome
      const chave =
        r.id_aluno != null
          ? String(r.id_aluno)
          : (r.aluno_nome || "Aluno");

      const previstoLinha = Number(r.valor_previsto || 0);
      const pagoLinha     = Number(r.valor_pago || 0);

      let entry = porAluno.get(chave);
      if (!entry) {
        entry = {
          nome: r.aluno_nome || "Aluno",
          previsto: 0,
          pago: 0,
        };
      }

      // somar valores
      entry.previsto += previstoLinha;
      entry.pago     += pagoLinha;

      // se vier um nome "melhor" (por ex. com apelido), usa esse
      if (
        r.aluno_nome &&
        (!entry.nome || r.aluno_nome.length > entry.nome.length)
      ) {
        entry.nome = r.aluno_nome;
      }

      porAluno.set(chave, entry);
    });

    // ---- ARRAYS FINAIS PARA O GRÁFICO ----
    const labels    = [];
    const previsto  = [];
    const realizado = [];

    porAluno.forEach((val) => {
      labels.push(val.nome);
      previsto.push(val.previsto);
      realizado.push(val.pago);
    });

    // ---- DESENHAR GRÁFICO ----
    if (window.chartFatMesCorrente) {
      window.chartFatMesCorrente.destroy();
    }

    window.chartFatMesCorrente = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Previsto (€)",
            data: previsto,
            backgroundColor: "#3b82f6", // azul
          },
          {
            label: "Pago (€)",
            data: realizado,
            backgroundColor: "#ec4899", // rosa
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }


  // ---------- FATURAÇÃO: INICIAR FILTROS (MÊS/ANO) ----------
  function initFiltrosFaturacao() {
    if (!selFatMes || !selFatAno) return;

    const agora        = new Date();
    const anoSistema   = agora.getFullYear();
    const mesSistema   = agora.getMonth() + 1;

    // Se ainda não houver seleção, usar mês/ano atuais
    if (!FAT_ANO_SELEC) FAT_ANO_SELEC = anoSistema;
    if (!FAT_MES_SELEC) FAT_MES_SELEC = mesSistema;

    // Preencher lista de anos com base nos dados + ano atual
    if (!selFatAno.dataset.initialized) {
      const anos = new Set([anoSistema]);
      (PAGAMENTOS_CACHE || []).forEach((p) => {
        if (p.ano) anos.add(p.ano);
      });

      const anosOrdenados = Array.from(anos).sort((a, b) => a - b);
      selFatAno.innerHTML = anosOrdenados
        .map((a) => `<option value="${a}">${a}</option>`)
        .join("");

      selFatAno.dataset.initialized = "1";
    }

    // Sincronizar selects com o estado atual
    selFatMes.value = String(FAT_MES_SELEC);
    selFatAno.value = String(FAT_ANO_SELEC);

    // Listeners (só ligamos uma vez)
    if (!selFatMes.dataset.bound) {
      selFatMes.addEventListener("change", () => {
        FAT_MES_SELEC = Number(selFatMes.value) || mesSistema;
        renderResumoMensal();
      });
      selFatMes.dataset.bound = "1";
    }

    if (!selFatAno.dataset.bound) {
      selFatAno.addEventListener("change", () => {
        FAT_ANO_SELEC = Number(selFatAno.value) || anoSistema;
        renderResumoMensal();
      });
      selFatAno.dataset.bound = "1";
    }
  }

  // ---------- RELATÓRIOS: RESUMOS NO CARTÃO ----------
  function updateResumoRelatorios({
    previstoMesAtual = 0,
    realizadoMesAtual = 0,
    pendenteTotal = 0,
    previstoAnoAtual = 0,
    realizadoAnoAtual = 0,
    nAlunosAtivos = 0,
  } = {}) {
    const elMensal   = document.querySelector("#rel-resumo-mensal");
    const elTend     = document.querySelector("#rel-tendencia-anual");
    const elAlunos   = document.querySelector("#rel-alunos-ativos");

    if (elMensal) {
      elMensal.textContent =
        `Este mês: € ${realizadoMesAtual.toFixed(2)} recebidos ` +
        `de € ${previstoMesAtual.toFixed(2)} previstos  ` +
        `€ ${pendenteTotal.toFixed(2)} em falta.`;
    }

    if (elTend) {
      elTend.textContent =
        `Ano atual: € ${realizadoAnoAtual.toFixed(2)} faturados ` +
        `de € ${previstoAnoAtual.toFixed(2)} previstos.`;
    }

    if (elAlunos) {
      if (nAlunosAtivos <= 0) {
        elAlunos.textContent = "Ainda não tens alunos ativos registados.";
      } else if (nAlunosAtivos === 1) {
        elAlunos.textContent = "A acompanhar 1 aluno ativo.";
      } else {
        elAlunos.textContent = `A acompanhar ${nAlunosAtivos} alunos ativos.`;
      }
    }
  }

  // ------- KPIs Report cartões -----------
  function updateRelatorioKpis({
      previstoMesAtual = 0,
      realizadoMesAtual = 0,
      previstoAnoAtual = 0,
      realizadoAnoAtual = 0,
      pendenteTotalMesAtual = 0,
    } = {}) {

    // 1) Total de alunos
    const total  = (ALUNOS_CACHE || []).length;
    const ativos = (ALUNOS_CACHE || []).filter(a => a.is_active !== false).length;

    const elTot    = document.getElementById("rel-kpi-total-alunos");
    const elTotSub = document.getElementById("rel-kpi-total-alunos-sub");
    if (elTot)    elTot.textContent    = String(total);
    if (elTotSub) elTotSub.textContent = ativos === 1 ? "1 ativo" : `${ativos} ativos`;

    // 2) Taxa de retenção = % da mensalidade em falta (mês atual)
    const elRet = document.getElementById("rel-kpi-retencao");
    if (elRet) {
      let perc = 0;
      if (previstoMesAtual > 0) {
        perc = (pendenteTotalMesAtual / previstoMesAtual) * 100;
      }
      elRet.textContent = `${perc.toFixed(1)}%`;
    }

    // 3) Faturação média / mês  usar janela de 12 meses que passámos
    const mesesConsiderados = 12; // porque já resumimos últimos 12
    const mediaMes = mesesConsiderados > 0
      ? realizadoAnoAtual / mesesConsiderados
      : 0;

    const elFatMed = document.getElementById("rel-kpi-fat-media");
    if (elFatMed) elFatMed.textContent = `€ ${mediaMes.toFixed(0)}/mês`;

    // 4) Crescimento vs mês anterior (usa PAGAMENTOS_CACHE)
    const hoje       = new Date();
    const anoAtual   = hoje.getFullYear();
    const mesAtual   = hoje.getMonth() + 1;
    let mesAnterior  = mesAtual - 1;
    let anoMesAnt    = anoAtual;
    if (mesAnterior < 1) {
      mesAnterior = 12;
      anoMesAnt   = anoAtual - 1;
    }

    let realizadoMesAnterior = 0;
    (PAGAMENTOS_CACHE || []).forEach(p => {
      if (p.ano === anoMesAnt && p.mes === mesAnterior) {
        realizadoMesAnterior += Number(p.valor_pago) || 0;
      }
    });

    let crescimentoTxt = "";
    if (realizadoMesAnterior > 0) {
      const diff = realizadoMesAtual - realizadoMesAnterior;
      const perc = (diff / realizadoMesAnterior) * 100;
      const sinal = perc >= 0 ? "+" : "";
      crescimentoTxt = `${sinal}${perc.toFixed(1)}%`;
    }

    const elCresc = document.getElementById("rel-kpi-crescimento");
    if (elCresc) elCresc.textContent = crescimentoTxt;
  }

  // ---------- KPI financeiros ----------
  async function loadKpisFinanceiros() {
    if (!EXPLICADOR.id_explicador) return;

    const cardTotalPrev = document.getElementById("card-total-previsto");
    const cardTotalMes  = document.getElementById("card-total-mes");
    const cardPendentes = document.getElementById("card-pendentes");

    try {
      const { data, error } = await supabase
        .from("v_pagamentos_detalhe")
        .select("ano, mes, id_aluno, valor_previsto, valor_pago, estado")
        .eq("id_explicador", EXPLICADOR.id_explicador);

      if (error) {
        console.error("Erro a carregar KPI financeiros", error);
        return;
      }

      PAGAMENTOS_CACHE = data || [];

      const now      = new Date();
      const anoAtual = now.getFullYear();
      const mesAtual = now.getMonth() + 1;

      // --- 1) PREVISTO / PENDENTE = sempre com base nas mensalidades configuradas ---
      let previstoMesAtual      = 0;
      let realizadoMesAtual     = 0;
      let pendenteTotalMesAtual = 0;
      let previstoUltimos12     = 0;
      let realizadoUltimos12    = 0;

      // mapa auxiliar: total pago por aluno no mês atual
      const pagoMesPorAluno = new Map();

      (PAGAMENTOS_CACHE || []).forEach((p) => {
        const previsto = Number(p.valor_previsto) || 0;
        const pago     = Number(p.valor_pago) || 0;

        // janela últimos 12 meses (para média e ano atual)
        const diffMeses = (p.ano - anoAtual) * 12 + (p.mes - mesAtual);
        if (diffMeses >= -11 && diffMeses <= 0) {
          previstoUltimos12  += previsto;
          realizadoUltimos12 += pago;
        }

        // pagos do mês atual (independente do previsto na view)
        if (p.ano === anoAtual && p.mes === mesAtual && p.id_aluno) {
          realizadoMesAtual += pago;
          const key = String(p.id_aluno);
          pagoMesPorAluno.set(key, (pagoMesPorAluno.get(key) || 0) + pago);
        }
      });

      // soma de mensalidades de TODOS os alunos ativos
      (ALUNOS_CACHE || []).forEach((a) => {
        if (a.is_active === false) return;

        const v = Number(a.valor_explicacao) || 0;
        const s = Number(a.sessoes_mes) || 0;
        const mensalidade = v * s;
        if (!mensalidade) return;

        previstoMesAtual += mensalidade;

        const pagoAluno = pagoMesPorAluno.get(String(a.id_aluno)) || 0;
        const falta     = Math.max(mensalidade - pagoAluno, 0);
        pendenteTotalMesAtual += falta;
      });

      // contar quantos alunos têm falta > 0
      let nAlunosPend = 0;
      (ALUNOS_CACHE || []).forEach((a) => {
        if (a.is_active === false) return;

        const v = Number(a.valor_explicacao) || 0;
        const s = Number(a.sessoes_mes) || 0;
        const mensalidade = v * s;
        if (!mensalidade) return;

        const pagoAluno = pagoMesPorAluno.get(String(a.id_aluno)) || 0;
        const falta     = Math.max(mensalidade - pagoAluno, 0);
        if (falta > 0.005) nAlunosPend++;
      });

      // ---- Cards na dashboard ----
      if (cardTotalPrev) {
        cardTotalPrev.textContent = `€ ${previstoMesAtual.toFixed(2)}`;
      }

      if (cardTotalMes) {
        cardTotalMes.textContent =
          `€ ${realizadoMesAtual.toFixed(2)} de € ${previstoMesAtual.toFixed(2)}`;
      }

      if (cardPendentes) {
        const labelAlunos =
          nAlunosPend === 0
            ? "Nenhum aluno em falta"
            : nAlunosPend === 1
            ? "1 aluno em falta"
            : `${nAlunosPend} alunos em falta`;

        cardPendentes.textContent =
          `€ ${pendenteTotalMesAtual.toFixed(2)} (${labelAlunos})`;
      }

      // ---- Resumo + KPIs dos relatórios ----
      const nAlunosAtivos = (ALUNOS_CACHE || []).filter(a => a.is_active !== false).length;
      updateResumoRelatorios({
        previstoMesAtual,
        realizadoMesAtual,
        pendenteTotal: pendenteTotalMesAtual,
        previstoAnoAtual:  previstoUltimos12,
        realizadoAnoAtual: realizadoUltimos12,
        nAlunosAtivos,
      });
      updateRelatorioKpis({
        previstoMesAtual,
        realizadoMesAtual,
        previstoAnoAtual:  previstoUltimos12,
        realizadoAnoAtual: realizadoUltimos12,
        pendenteTotalMesAtual,
      });

      prepararFiltrosFaturacao();
      renderResumoMensal();
      if (typeof atualizarGraficosPagamentos === "function") atualizarGraficosPagamentos();
      if (typeof atualizarGraficoEvolucaoAnual === "function") atualizarGraficoEvolucaoAnual();
    } catch (err) {
      console.error("Erro inesperado em loadKpisFinanceiros", err);
    }
  }

// ---------- FATURAÇÃO: filtros de mês/ano (REDUNDANTE MAS MANTIDO) ----------
function prepararFiltrosFaturacao() {
    const selMes = document.getElementById("fat-filtro-mes");
    const selAno = document.getElementById("fat-filtro-ano");
    if (!selMes || !selAno) return;

    // criar lista de anos com base nos dados existentes
    const anos = new Set();
    (PAGAMENTOS_CACHE || []).forEach((p) => {
      if (p.ano) anos.add(p.ano);
    });
    if (!anos.size) {
      anos.add(new Date().getFullYear());
    }
    const anosArr = Array.from(anos).sort();

    selAno.innerHTML = anosArr
      .map((a) => `<option value="${a}">${a}</option>`)
      .join("");

    // mês/ano por defeito
    const now = new Date();
    if (!selMes.value) {
      selMes.value = String(now.getMonth() + 1);
    }
    if (!selAno.value) {
      selAno.value = anosArr.includes(now.getFullYear())
        ? String(now.getFullYear())
        : String(anosArr[0]);
    }

    const onChange = () => {
      renderResumoMensal();
      if (typeof atualizarGraficosPagamentos === "function") atualizarGraficosPagamentos();
    };

    // evitar adicionar múltiplos listeners cada vez que chamas loadKpisFinanceiros
    if (!selMes.dataset.bound) {
      selMes.addEventListener("change", onChange);
      selMes.dataset.bound = "1";
    }
    if (!selAno.dataset.bound) {
      selAno.addEventListener("change", onChange);
      selAno.dataset.bound = "1";
    }
  }

async function loadRelatorios() {
  // Garantir que já tens KPIs financeiros carregados
  if (!PAGAMENTOS_CACHE || !PAGAMENTOS_CACHE.length) {
    if (typeof loadKpisFinanceiros === "function") {
      await loadKpisFinanceiros();
    }
  }
  if (typeof atualizarGraficoEvolucaoAnual === "function") atualizarGraficoEvolucaoAnual();
  // 2) Previsto vs Pago no mês corrente (total + alimenta PAGAMENTOS_MES)
  await renderGraficoFatMesCorrente();
  // 3) Previsto vs Pago por aluno no mês corrente (usa PAGAMENTOS_MES)
  renderGraficoFatAlunoMesCorrente();
  // 4) Sessões previstas vs realizadas por mês
  renderGraficoSessoesMensais();
}

function updateRelatorioKpisFromData(faturacao, alunos_mes, sessoes_mes) {
  const total = ALUNOS_CACHE.length;
  const ativos = ALUNOS_CACHE.filter(a => a.is_active !== false).length;

  document.getElementById("rel-kpi-total-alunos").textContent = total;
  document.getElementById("rel-kpi-total-alunos-sub").textContent =
    ativos === 1 ? "1 ativo" : `${ativos} ativos`;

  const retencao = total > 0 ? (ativos / total) * 100 : 0;
  document.getElementById("rel-kpi-retencao").textContent =
    retencao.toFixed(1) + "%";

    const somaSessoes = sessoes_mes.reduce((a, b) =>
      a + Number(b.total ?? b.n_sessoes ?? 0),
    0);

  const mediaSessoes =
    sessoes_mes.length
      ? sessoes_mes.reduce((a, b) => a + Number(b.total || 0), 0) / sessoes_mes.length
      : 0;
  document.getElementById("rel-kpi-sessoes-mes").textContent =
    mediaSessoes.toFixed(1);

  const mediaFat =
    faturacao.length
      ? faturacao.reduce((a, b) => a + Number(b.total || 0), 0) / faturacao.length
      : 0;
  document.getElementById("rel-kpi-fat-media").textContent =
    "€ " + mediaFat.toFixed(0);
}

// ---------- CARREGAR SESSÕES DO ALUNO ----------
async function loadSessoesAluno(alunoId) {
  if (!alunoId) return;

  const { data, error } = await callExplFn("list_sessoes_aluno", {
    aluno_id: alunoId,
  });

  if (error) {
    console.error("list_sessoes_aluno error", error);
    const tblBody = document.querySelector("#listaExplicacoes");
    if (tblBody) {
      tblBody.innerHTML =
        '<tr><td colspan="5">Erro a carregar sessões do aluno.</td></tr>';
    }
    return;
  }

  SESSOES_ALUNO_ATUAL = data || [];

  // Atualiza tabela + KPI + próxima aula
  atualizarPerfilComSessoes(SESSOES_ALUNO_ATUAL);
}

  function atualizarPerfilComSessoes(sessoes) {
  const tbody      = document.getElementById("listaExplicacoes");
  const kpiAulasEl = document.getElementById("kpiAulas");
  const proxEl     = document.getElementById("proximaAulaTxt");

  if (!tbody) return;

  if (!sessoes || !sessoes.length) {
    tbody.innerHTML =
      '<tr><td colspan="5">Ainda não existem explicações registadas.</td></tr>';
    if (kpiAulasEl) kpiAulasEl.textContent = "0/0";
    if (proxEl) proxEl.textContent = "Nenhuma aula agendada";
    return;
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let proximaSessao = null;

  const rows = sessoes.map((s) => {
    // Data formatada yyyy-mm-dd -> dd/mm/yyyy
    let dataLabel = "";
    if (s.data) {
      const [ano, mes, dia] = s.data.split("-");
      dataLabel = `${dia}/${mes}/${ano}`;
    }

    const inicio = s.hora_inicio ? s.hora_inicio.slice(0, 5) : "--:--";
    const fim    = s.hora_fim ? s.hora_fim.slice(0, 5) : "--:--";
    const dur    = s.duracao_min != null ? s.duracao_min : "";
    const estado = s.estado || "";

    // Próxima aula (AGENDADA no futuro)
    if (s.data) {
      const d = new Date(s.data);
      d.setHours(0, 0, 0, 0);
      if (
        !isNaN(d.getTime()) &&
        d >= hoje &&
        estado.toUpperCase() !== "CANCELADA"
      ) {
        if (!proximaSessao || d < new Date(proximaSessao.data)) {
          proximaSessao = s;
        }
      }
    }

    return `
      <tr data-id="${s.id_sessao}">
        <td>${dataLabel}</td>
        <td>${inicio}</td>
        <td>${fim}</td>
        <td>${dur}</td>
        <td>
          ${estado}
          <span class="acoes-exp">
            <!-- editar -->
            <button class="sessao-btn sessao-acao" data-acao="editar">
              <svg class="icon16" viewBox="0 0 24 24">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="#b91c1c"/>
                <path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" fill="#b91c1c"/>
              </svg>
            </button>

            <!-- marcar como realizada -->
            <button class="sessao-btn sessao-acao" data-acao="realizada">
              <svg class="icon16" viewBox="0 0 24 24">
                <path d="M9 16.2l-3.5-3.5L4 14.2 9 19l11-11-1.5-1.5L9 16.2z"
                      fill="#b91c1c"/>
              </svg>
            </button>

            <!-- apagar -->
            <button class="sessao-btn sessao-acao" data-acao="apagar">
              <svg class="icon16" viewBox="0 0 24 24">
                <path d="M3 6h18" stroke="#b91c1c" stroke-width="2" stroke-linecap="round"/>
                <path d="M8 6V4h8v2" stroke="#b91c1c" stroke-width="2" stroke-linecap="round"/>
                <path d="M10 11v6M14 11v6" stroke="#b91c1c" stroke-width="2" stroke-linecap="round"/>
                <path d="M5 6h14v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6z"
                      stroke="#b91c1c" stroke-width="2" fill="none"/>
              </svg>
            </button>
          </span>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rows.join("");

  // KPI aulas concluídas
  if (kpiAulasEl) {
    const total = sessoes.length;
    const concluidas = sessoes.filter(
      (s) => (s.estado || "").toUpperCase() === "REALIZADA"
    ).length;
    kpiAulasEl.textContent = `${concluidas}/${total}`;
  }

  // Próxima aula
  if (proxEl) {
    if (!proximaSessao) {
      proxEl.textContent = "Nenhuma aula agendada";
    } else {
      const [ano, mes, dia] = proximaSessao.data.split("-");
      const dataNice = `${dia}/${mes}/${ano}`;
      const hora = proximaSessao.hora_inicio
        ? proximaSessao.hora_inicio.slice(0, 5)
        : "";
      proxEl.textContent = hora ? `${dataNice} às ${hora}` : dataNice;
    }
  }

  // ligar handlers uma vez (delegação no tbody)
  if (!tbody.dataset.boundSessao) {
    tbody.addEventListener("click", onClickAcaoSessao);
    tbody.dataset.boundSessao = "1";
  }
}

  async function onClickAcaoSessao(ev) {
  const btn = ev.target.closest(".sessao-acao");
  if (!btn) return;

  ev.stopPropagation();

  const tr   = btn.closest("tr");
  const id   = tr?.dataset.id;
  const acao = btn.dataset.acao;
  if (!id || !acao) return;

  const sessao = (SESSOES_ALUNO_ATUAL || []).find(
    (s) => String(s.id_sessao) === String(id)
  );
  if (!sessao) return;

  // EDITAR  abre modal da sessão (NÃO o perfil do aluno)
  if (acao === "editar") {
    if (typeof preencherModalSessao === "function") {
      preencherModalSessao(sessao);   // função que preenche o form da sessão
    }
    if (typeof modalSessao !== "undefined") {
      openModal(modalSessao);
    }
    return;
  }

  // MARCAR COMO REALIZADA
  if (acao === "realizada") {
    try {
      const payload = {
        id_sessao: sessao.id_sessao,
        aluno_id: sessao.aluno_id || (ALUNO_ATUAL && ALUNO_ATUAL.id_aluno),
        data: sessao.data,
        hora_inicio: sessao.hora_inicio,
        hora_fim: sessao.hora_fim,
        duracao_min: sessao.duracao_min,
        estado: "REALIZADA",
        observacoes: sessao.observacoes,
      };

      const { error } = await callExplFn("upsert_sessao_aluno", payload);
      if (error) {
        console.error(error);
        alert("Não foi possível atualizar a sessão.");
        return;
      }

      await loadSessoesAluno(ALUNO_ATUAL.id_aluno);
      await loadResumoCalendario();
    } catch (e) {
      console.error(e);
      alert("Erro inesperado ao atualizar sessão.");
    }
    return;
  }

  // APAGAR
  if (acao === "apagar") {
    const conf = confirm("Tens a certeza que queres apagar esta sessão?");
    if (!conf) return;

    try {
      const { error } = await callExplFn("delete_sessao_aluno", {
        id_sessao: sessao.id_sessao,
      });

      if (error) {
        console.error(error);
        alert("Não foi possível apagar a sessão.");
        return;
      }

      await loadSessoesAluno(ALUNO_ATUAL.id_aluno);
      await loadResumoCalendario();
    } catch (e) {
      console.error(e);
      alert("Erro inesperado ao apagar sessão.");
    }
  }
}

  function obterIdAluno(alunoOuId) {
  if (!alunoOuId) return null;

  // já é id
  if (typeof alunoOuId === "number" || typeof alunoOuId === "string") {
    return alunoOuId;
  }

  // é objeto aluno
  if (typeof alunoOuId === "object" && alunoOuId.id_aluno) {
    return alunoOuId.id_aluno;
  }

  return null;
}

function renderGraficoAlunos(alunos_mes) {
  const canvas = document.getElementById("chart-evolucao-alunos");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (chartAlunosMes) chartAlunosMes.destroy();

  // ADAPTA AQUI a chave corresponde ao nº de alunos
  const labels = (alunos_mes || []).map(m => m.mes_label || m.mes || "");
  const valores = (alunos_mes || []).map(m =>
    Number(
      m.total ??
      m.n_alunos ??
      m.alunos_ativos ??
      0
    )
  );

  chartAlunosMes = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Alunos ativos",
          data: valores
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderGraficoSessoes(sessoes_mes) {
  const canvas = document.getElementById("chart-sessoes-mensais");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (chartSessoes) chartSessoes.destroy();

  // ADAPTA AQUI a chave para nº de sessões
  const labels = (sessoes_mes || []).map(m => m.mes_label || m.mes || "");
  const valores = (sessoes_mes || []).map(m =>
    Number(
      m.total ??
      m.n_sessoes ??
      m.total_sessoes ??
      0
    )
  );

  chartSessoes = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Sessões",
          data: valores,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

async function carregarPerfilAluno(alunoOuId) {
    const idAluno = obterIdAluno(alunoOuId);
    if (!idAluno) {
      console.error("carregarPerfilAluno: idAluno inválido", alunoOuId);
      return;
    }

    const aluno = await fetchAluno(idAluno);
    if (!aluno) {
      alert("Erro ao carregar aluno.");
      return;
    }

    ALUNO_ATUAL = aluno;

    // aqui usas a tua função que preenche o cartão grande
    if (typeof preencherCartaoPerfil === "function") {
      preencherCartaoPerfil(ALUNO_ATUAL);
    }

    // e mostra a secção correta
    mostrarSecao("aluno-perfil");
  }

// ---------- ATUALIZAR PERFIL DO ALUNO: PAGAMENTOS ----------
  function atualizarPerfilComPagamentos(pagamentos) {
  const tbody   = document.getElementById("listaPagamentos");
  const totalEl = document.getElementById("pagTotal");
  if (!tbody) return;

  if (!pagamentos || !pagamentos.length) {
    tbody.innerHTML =
      '<tr><td colspan="5">Ainda não existem pagamentos registados.</td></tr>';
    if (totalEl) totalEl.textContent = "0.00";
    return;
  }

  const nomesMesesLong = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
  ];

  let totalRecebido = 0;

  const rows = pagamentos.map((p) => {
    const pago = Number(p.valor_pago) || 0;
    totalRecebido += pago;

    const ano = p.ano;
    const mes = p.mes;
    const periodo = (nomesMesesLong[mes - 1] || mes) + " " + ano;

    const dataLabel =
      p.data_pagamento ||
      `${String(1).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;

    const metodo = "";
    const estado = p.estado || "";

    return `
      <tr>
        <td>${dataLabel}</td>
        <td>${periodo}</td>
        <td>€ ${pago.toFixed(2)}</td>
        <td>${metodo}</td>
        <td>
          ${estado}
          <span class="acoes-exp">
            <!-- editar -->
            <button
              class="pag-btn"
              data-acao="editar"
              data-id="${p.id_pagamento}"
              type="button"
            >
              <svg class="icon16" viewBox="0 0 24 24">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="#b91c1c"/>
                <path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" fill="#b91c1c"/>
              </svg>
            </button>

            <!-- apagar -->
            <button
              class="pag-btn"
              data-acao="apagar"
              data-id="${p.id_pagamento}"
              type="button"
            >
              <svg class="icon16" viewBox="0 0 24 24">
                <path d="M3 6h18" stroke="#b91c1c" stroke-width="2" stroke-linecap="round"/>
                <path d="M8 6V4h8v2" stroke="#b91c1c" stroke-width="2" stroke-linecap="round"/>
                <path d="M10 11v6M14 11v6" stroke="#b91c1c" stroke-width="2" stroke-linecap="round"/>
                <path d="M5 6h14v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6z"
                      stroke="#b91c1c" stroke-width="2" fill="none"/>
              </svg>
            </button>
          </span>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rows.join("");

  if (totalEl) {
    totalEl.textContent = totalRecebido.toFixed(2);
  }

  // Ligar botões de EDITAR / APAGAR (pagamentos)
  tbody.querySelectorAll(".pag-btn").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();

      const acao = btn.dataset.acao;
      const id   = btn.dataset.id;

      const pagamento = pagamentos.find(
        (p) => String(p.id_pagamento) === String(id)
      );
      if (!pagamento) return;

      // EDITAR
      if (acao === "editar") {
        // usa o mesmo modal que já tens para pagamentos do aluno
        // -> modo "editar"
        if (typeof abrirModalPagamento === "function") {
          // se tiveres esta função, podes passarlhe o pagamento
          abrirModalPagamento("editar", pagamento);
        } else if (typeof preencherModalPagamento === "function") {
          // fallback para a tua função antiga
          preencherModalPagamento(pagamento);
        }
        return;
      }

      // APAGAR
      if (acao === "apagar") {
        if (!confirm("Tens certeza que queres apagar este pagamento?")) return;

        const { error } = await callExplFn("delete_pagamento", {
          id_pagamento: id,
        });

        if (error) {
          console.error(error);
          alert("Erro ao apagar pagamento.");
          return;
        }

        // recarrega pagamentos/summary desse aluno
        await loadPagamentosAluno(ALUNO_ATUAL.id_aluno);
      }
    });
  });
}

  // ---------- OPEN/CLOSE MODAL ----------
  function openModal(mod) { mod && mod.classList.add("open"); }
  function closeModal(mod) { mod && mod.classList.remove("open"); }

  // ---------- MODAL PAGAMENTO: ABRIR ----------
  function abrirModalPagamento(modo) {
    if (!formPag) return;
    if (!ALUNO_ATUAL || !ALUNO_ATUAL.id_aluno) {
      alert("Seleciona primeiro um aluno na lista.");
      return;
    }

    const agora = new Date();

    inputAno.value = String(agora.getFullYear());
    inputMes.value = String(agora.getMonth() + 1);
    inputDiaPag.value = "";
    inputValor.value = "";

    formPag.modo.value = modo;
    msgPag.textContent = "";
    msgPag.style.color = "";

    inputDiaPag.style.display = "none";
    inputValor.style.display = "none";

    if (modo === "iniciar") {
      pagModalTitle.textContent = "Iniciar faturação";
      pagModalHint.textContent  =
        "Defina o mês/ano de início e o dia de pagamento da mensalidade.";
      inputDiaPag.style.display = "block";
      btnSavePag.textContent    = "Iniciar faturação";

    } else if (modo === "registar") {
      pagModalTitle.textContent = "Registar pagamento";
      pagModalHint.textContent  =
        "Regista um pagamento a acrescentar ao valor já pago nesse mês.";
      inputValor.style.display  = "block";
      btnSavePag.textContent    = "Registar pagamento";

    } else { // "editar"
      pagModalTitle.textContent = "Editar pagamento";
      pagModalHint.textContent  =
        "Substitui o valor pago nesse mês pelo valor indicado.";
      inputValor.style.display  = "block";
      btnSavePag.textContent    = "Guardar alterações";
    }

    openModal(modalPag);
  }

  btnIniciarFat?.addEventListener("click", () => abrirModalPagamento("iniciar"));
  btnRegistarPag?.addEventListener("click", () => abrirModalPagamento("registar"));
  btnEditarPag?.addEventListener("click", () => abrirModalPagamento("editar"));

  $("#modal-pagamento-aluno .modal__close")?.addEventListener("click", () => {
    closeModal(modalPag);
  });

  modalPag?.addEventListener("click", (ev) => {
    if (ev.target.hasAttribute("data-modal-close")) {
      closeModal(modalPag);
    }
  });

  // ---------- SUBMIT MODAL PAGAMENTO ----------
  formPag?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!ALUNO_ATUAL || !ALUNO_ATUAL.id_aluno) {
      msgPag.textContent = "Nenhum aluno selecionado.";
      return;
    }

    const modo  = formPag.modo.value;
    const ano   = Number(inputAno.value);
    const mes   = Number(inputMes.value);
    const dia   = inputDiaPag.value ? Number(inputDiaPag.value) : null;
    const valor = inputValor.value ? Number(inputValor.value) : null;

    if (!ano || !mes || mes < 1 || mes > 12) {
      msgPag.textContent = "Ano ou mês inválidos.";
      return;
    }

    if (modo === "iniciar") {
      if (!dia || dia < 1 || dia > 31) {
        msgPag.textContent = "Dia de pagamento inválido.";
        return;
      }
    } else {
      if (valor === null || isNaN(valor) || valor < 0) {
        msgPag.textContent = "Valor inválido.";
        return;
      }
    }

    btnSavePag.disabled = true;
    msgPag.textContent  = "A guardar...";

    try {
      let action, payload;

      if (modo === "iniciar") {
        action = "iniciar_faturacao_aluno";
        payload = {
          aluno_id: ALUNO_ATUAL.id_aluno,
          ano,
          mes,
          dia_pagamento: dia,
        };
      } else if (modo === "registar") {
        action = "registar_pagamento_aluno";
        payload = {
          aluno_id: ALUNO_ATUAL.id_aluno,
          ano,
          mes,
          valor,
        };
      } else {
        action = "update_pagamento_aluno";
        payload = {
          aluno_id: ALUNO_ATUAL.id_aluno,
          ano,
          mes,
          valor_pago: valor,
        };
      }

      const { data, error } = await callExplFn(action, payload);

      if (error) {
        let extra = "";
        if (error.context) {
          try {
            const raw = await error.context.text();
            console.log("Erro pagamento_aluno:", raw);
            try {
              const json = JSON.parse(raw);
              if (json?.error) extra = " " + json.error;
              else extra = " " + raw;
            } catch {
              extra = " " + raw;
            }
          } catch {}
        }
        msgPag.textContent = "Não foi possível guardar." + extra;
        btnSavePag.disabled = false;
        return;
      }

      msgPag.style.color = "#126b3a";
      msgPag.textContent = "Guardado com sucesso.";

      // 1) Recarrega alunos a partir da BD
      await loadAlunos();              // <- NOVO

      // 2) Atualiza os KPIs financeiros
      await loadKpisFinanceiros();

      // 3) Volta a mostrar o painel do aluno com os dados frescos
      const alunoAtualizado = ALUNOS_CACHE.find(
        (a) => String(a.id_aluno) === String(ALUNO_ATUAL.id_aluno)
      );
      if (alunoAtualizado) {
        await mostrarPainelAluno(alunoAtualizado);
      }

      // 4) Atualiza o resumo do calendário
      await loadResumoCalendario();
      setTimeout(() => closeModal(modalPag), 600);
    } catch (e) {
      console.error("pagamento_aluno error", e);
      msgPag.textContent = "Erro inesperado ao guardar.";
    } finally {
      btnSavePag.disabled = false;
    }
  });

  // ---------- Painel de detalhes por aluno ----------
    async function mostrarPainelAluno(aluno) {
    ALUNO_ATUAL = aluno;

    const card = document.getElementById("aluno-detail-card");
    if (!card) return;

    const nomeCompleto = [aluno.nome, aluno.apelido].filter(Boolean).join(" ");
    document.getElementById("aluno-detail-nome").textContent =
      nomeCompleto || "Aluno";

    updateAlunoStatusUI(aluno);

    document.getElementById("aluno-detail-meta").textContent =
      aluno.username ? `Password: ${aluno.username}` : "";

    document.getElementById("aluno-detail-email").textContent =
      aluno.email || "";
    document.getElementById("aluno-detail-tel").textContent =
      aluno.telemovel || "";
    document.getElementById("aluno-detail-ano").textContent =
      aluno.ano ?? "";

    document.getElementById("aluno-detail-valor").textContent =
      aluno.valor_explicacao != null
        ? `€ ${Number(aluno.valor_explicacao).toFixed(2)}`
        : "";

    document.getElementById("aluno-detail-sessoes").textContent =
      aluno.sessoes_mes != null ? String(aluno.sessoes_mes) : "";

    card.style.display = "block";

    if (!EXPLICADOR.id_explicador) return;

    const elPrevistoMes = document.getElementById("aluno-detail-previsto-mes");
    const elPagoMes = document.getElementById("aluno-detail-pago-mes");
    const elEmFalta = document.getElementById("aluno-detail-emfalta");

    let pagamentosAluno = [];

    try {
      const now = new Date();
      const anoAtual = now.getFullYear();
      const mesAtual = now.getMonth() + 1;

      const { data, error } = await supabase
        .from("v_pagamentos_detalhe")
        .select("ano, mes, valor_previsto, valor_pago, estado, data_pagamento")
        .eq("id_explicador", EXPLICADOR.id_explicador)
        .eq("id_aluno", aluno.id_aluno);

      if (error) {
        console.error("Erro a carregar pagamentos do aluno", error);
        if (elPrevistoMes) elPrevistoMes.textContent = "";
        if (elPagoMes) elPagoMes.textContent = "";
        if (elEmFalta) elEmFalta.textContent = "";
        return;
      }

      pagamentosAluno = data || [];

      let previstoMes = 0;
      let pagoMes = 0;
      let emFaltaTotal = 0;

      const temAlgumPagamento = pagamentosAluno.length > 0;
      const temRegistosMesAtual = pagamentosAluno.some(
        (p) => p.ano === anoAtual && p.mes === mesAtual
      );

      (pagamentosAluno || []).forEach((p) => {
        const previsto = Number(p.valor_previsto) || 0;
        const pago = Number(p.valor_pago) || 0;
        const falta = Math.max(previsto - pago, 0);

        if (p.ano === anoAtual && p.mes === mesAtual) {
          previstoMes += previsto;
          pagoMes += pago;
        }

        emFaltaTotal += falta;
      });

      // Fallback: se NÃO houver registos para o mês atual,
      // mas o aluno tiver valor_explicacao e sessoes_mes,
      // usamos a mensalidade configurada como "previsto" do mês atual.
      if (
        !temRegistosMesAtual &&
        aluno.valor_explicacao != null &&
        aluno.sessoes_mes != null
      ) {
        const estimado =
          Number(aluno.valor_explicacao) * Number(aluno.sessoes_mes);

        previstoMes = estimado;

        // Se não houver qualquer pagamento em lado nenhum,
        // o total em falta passa a ser o estimado.
        if (!temAlgumPagamento) {
          emFaltaTotal = estimado;
        }
        // Se já existem dívidas de meses anteriores, mantemos essas
        // e o "em falta" continua a somar apenas o que vem da view.
      }

      if (elPrevistoMes)
        elPrevistoMes.textContent = `€ ${previstoMes.toFixed(2)}`;
      if (elPagoMes) elPagoMes.textContent = `€ ${pagoMes.toFixed(2)}`;
      if (elEmFalta)
        elEmFalta.textContent = `€ ${emFaltaTotal.toFixed(2)}`;
    } catch (err) {
      console.error("Erro inesperado ao calcular resumo do aluno", err);
      if (elPrevistoMes) elPrevistoMes.textContent = "";
      if (elPagoMes) elPagoMes.textContent = "";
      if (elEmFalta) elEmFalta.textContent = "";
    }

    // continua a funcionar como antes
    atualizarPerfilComPagamentos(pagamentosAluno);
    await loadSessoesAluno(aluno.id_aluno);
  }


  // ---------- CRIAR ALUNO ----------
  async function createAluno(payload) {
    const { data, error } = await callExplFn("create_aluno", payload);

    if (error) {
      console.error(error);
      return { ok: false, error: error.message };
    }

    return { ok: true, data };
  }

  // ---------- MODAIS (add / edit / sessão) ----------
  modalAddAluno?.addEventListener("click", (ev) => {
    if (ev.target.hasAttribute("data-modal-close")) {
      closeModal(modalAddAluno);
    }
  });

  $("#modal-add-aluno .modal__close")?.addEventListener("click", () => {
    closeModal(modalAddAluno);
  });

  btnFab?.addEventListener("click", () => openModal(modalAddAluno));
  btnOpenAddAluno?.addEventListener("click", () => openModal(modalAddAluno));

  $("#modal-edit-aluno .modal__close")?.addEventListener("click", () => {
    closeModal(modalEditAluno);
  });

  modalEditAluno?.addEventListener("click", (ev) => {
    if (ev.target.hasAttribute("data-modal-close")) {
      closeModal(modalEditAluno);
    }
  });

  $("#modal-sessao .modal__close")?.addEventListener("click", () => {
    closeModal(modalSessao);
  });

  modalSessao?.addEventListener("click", (ev) => {
    if (ev.target.hasAttribute("data-modal-close")) {
      closeModal(modalSessao);
    }
  });

  // ---------- PREENCHER MODAL DE EDIÇÃO DO ALUNO ----------
  function preencherModalEdicao(aluno) {
    if (!formEdit || !aluno) return;

    formEdit.nome_edit.value  = aluno.nome || "";
    formEdit.apelido_edit.value = aluno.apelido || "";
    formEdit.telemovel_edit.value = aluno.telemovel || "";
    formEdit.ano_edit.value = aluno.ano != null ? aluno.ano : "";
    formEdit.idade_edit.value = aluno.idade != null ? aluno.idade : "";
    formEdit.dia_semana_preferido_edit.value = aluno.dia_semana_preferido || "";
    formEdit.valor_explicacao_edit.value =
      aluno.valor_explicacao != null ? aluno.valor_explicacao : "";
    formEdit.sessoes_mes_edit.value =
      aluno.sessoes_mes != null ? aluno.sessoes_mes : "";
    formEdit.nome_pai_cache_edit.value = aluno.nome_pai_cache || "";
    formEdit.contacto_pai_cache_edit.value = aluno.contacto_pai_cache || "";
    formEdit.email_edit.value = aluno.email || "";
    formEdit.username_edit.value = aluno.username || "";
    formEdit.password_edit.value = "";
    msgEditAluno.textContent = "";
    msgEditAluno.style.color = "";
  }

  btnEditarAluno?.addEventListener("click", () => {
    if (!ALUNO_ATUAL) {
      alert("Seleciona primeiro um aluno na lista.");
      return;
    }
    preencherModalEdicao(ALUNO_ATUAL);
    openModal(modalEditAluno);
  });

  // ---------- TOGGLE ATIVO / BLOQUEADO ----------
  toggleAlunoAtivo?.addEventListener("click", async () => {
    if (!ALUNO_ATUAL || !ALUNO_ATUAL.id_aluno) return;

    const estavaAtivo = ALUNO_ATUAL.is_active !== false;
    const novoEstado = !estavaAtivo;

    if (!novoEstado) {
      const confirma = confirm(
        "Ao bloquear este aluno ele deixa de conseguir fazer login e deixa de contar como aluno ativo. Continuar?"
      );
      if (!confirma) return;
    }

    // feedback mínimo
    if (alunoStatusBadge) {
      alunoStatusBadge.textContent = "A atualizar...";
    }

    const { error } = await callExplFn("update_aluno", {
      id_aluno: ALUNO_ATUAL.id_aluno,
      is_active: novoEstado,
    });

    if (error) {
      console.error("Erro ao alterar estado do aluno", error);
      alert("Não foi possível atualizar o estado do aluno.");
      // volta ao estado anterior no UI
      updateAlunoStatusUI(ALUNO_ATUAL);
      return;
    }

    // Atualizar caches
    ALUNO_ATUAL.is_active = novoEstado;
    const idx = (ALUNOS_CACHE || []).findIndex(
      a => String(a.id_aluno) === String(ALUNO_ATUAL.id_aluno)
    );
    if (idx >= 0) {
      ALUNOS_CACHE[idx].is_active = novoEstado;
    }

    // Atualizar UI dependentes
    updateAlunoStatusUI(ALUNO_ATUAL);
    renderDashboardAlunos();
    await loadKpisFinanceiros();
  });

  function updateAlunoStatusUI(aluno) {
    if (!alunoStatusBadge) return;
    const ativo = aluno.is_active !== false;
    alunoStatusBadge.textContent = ativo ? "Ativo" : "Bloqueado";
    alunoStatusBadge.className = ativo
      ? "aluno-status-badge aluno-status-badge--ativo"
      : "aluno-status-badge aluno-status-badge--inativo";
  }

  // ---------- SUBMIT EDITAR ALUNO ----------
  formEdit?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msgEditAluno.textContent = "";

    if (!ALUNO_ATUAL || !ALUNO_ATUAL.id_aluno) {
      msgEditAluno.textContent = "Nenhum aluno selecionado.";
      return;
    }

    const f = ev.target;

    const payload = {
      id_aluno: ALUNO_ATUAL.id_aluno,
      nome: f.nome_edit.value.trim() || null,
      apelido: f.apelido_edit.value.trim() || null,
      telemovel: f.telemovel_edit.value.trim() || null,
      ano: f.ano_edit.value ? Number(f.ano_edit.value) : null,
      idade: f.idade_edit.value ? Number(f.idade_edit.value) : null,
      dia_semana_preferido: f.dia_semana_preferido_edit.value.trim() || null,
      valor_explicacao: f.valor_explicacao_edit.value
        ? Number(f.valor_explicacao_edit.value)
        : null,
      sessoes_mes: f.sessoes_mes_edit.value
        ? Number(f.sessoes_mes_edit.value)
        : null,
      nome_pai_cache: f.nome_pai_cache_edit.value.trim() || null,
      contacto_pai_cache: f.contacto_pai_cache_edit.value.trim() || null,
      email: f.email_edit.value.trim() || null,
      username: f.username_edit.value.trim() || null,
      password: f.password_edit.value.trim() || undefined,
      is_active: ALUNO_ATUAL?.is_active ?? true,
    };

    btnSaveEdit.disabled = true;
    msgEditAluno.textContent = "A guardar alterações...";

    try {
      const { data, error } = await callExplFn("update_aluno", payload);

      if (error) {
        let extra = "";
        if (error.context) {
          try {
            const raw = await error.context.text();
            console.log("Erro update_aluno:", raw);
            try {
              const json = JSON.parse(raw);
              if (json?.error) extra = " " + json.error;
            } catch {
              extra = " " + raw;
            }
          } catch {}
        }
        msgEditAluno.textContent =
          "Não foi possível guardar as alterações." + extra;
        btnSaveEdit.disabled = false;
        return;
      }

      msgEditAluno.style.color = "#126b3a";
      msgEditAluno.textContent = "Alterações guardadas com sucesso.";

      await loadAlunos();
      const alunoAtualizado = ALUNOS_CACHE.find(
        (a) => String(a.id_aluno) === String(ALUNO_ATUAL.id_aluno)
      );
      if (alunoAtualizado) {
        mostrarPainelAluno(alunoAtualizado);
      }

      setTimeout(() => {
        closeModal(modalEditAluno);
      }, 600);
    } catch (e) {
      console.error("update_aluno error", e);
      msgEditAluno.textContent = "Erro inesperado ao guardar alterações.";
    } finally {
      btnSaveEdit.disabled = false;
    }
  });

  // ---------- SUBMIT NOVO ALUNO ----------
  formNew?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msgNewAluno.textContent = "";

    if (!EXPLICADOR.id_explicador) {
      msgNewAluno.textContent = "Perfil de explicador inválido.";
      return;
    }

    const f = ev.target;

    const payload = {
      nome: f.nome?.value.trim() || "",
      apelido: f.apelido?.value.trim() || null,
      telemovel: f.telemovel?.value.trim() || null,
      ano: f.ano?.value ? Number(f.ano.value) : null,
      idade: f.idade?.value ? Number(f.idade.value) : null,
      dia_semana_preferido: f.dia_semana_preferido?.value.trim() || null,
      valor_explicacao: f.valor_explicacao?.value
        ? Number(f.valor_explicacao.value)
        : null,
      sessoes_mes: f.sessoes_mes?.value
        ? Number(f.sessoes_mes.value)
        : null,
      nome_pai_cache: f.nome_pai_cache?.value.trim() || null,
      contacto_pai_cache: f.contacto_pai_cache?.value.trim() || null,
      email: f.email?.value.trim() || "",
      username: f.username?.value.trim() || null,
      password: f.password?.value || "",
      is_active: true,
    };

    if (!payload.nome || !payload.email || !payload.password) {
      msgNewAluno.textContent =
        "Preenche pelo menos Nome, Email e Password.";
      return;
    }

    btnCreate.disabled = true;
    msgNewAluno.textContent = "A criar aluno...";

    const { data, error } = await callExplFn("create_aluno", payload);

    if (error) {
      let extra = "";

      if (error.context) {
        try {
          const resp = error.context;
          const raw = await resp.text();
          console.log("Erro bruto da função expl-alunos:", raw);

          try {
            const json = JSON.parse(raw);
            if (json?.error) {
              extra = " " + json.error;
            } else {
              extra = " " + raw;
            }
          } catch {
            extra = " " + raw;
          }
        } catch (e) {
          console.warn("Não consegui ler o body da resposta da função", e);
        }
      }

      console.error("create_aluno error", error);
      msgNewAluno.textContent =
        "Não foi possível criar o aluno." + extra;
      btnCreate.disabled = false;
      return;
    }

    msgNewAluno.style.color = "#126b3a";
    msgNewAluno.textContent = "Aluno criado com sucesso!";
    f.reset();
    await loadAlunos();
    await loadKpisFinanceiros();
    btnCreate.disabled = false;
  });

  // Botão "Agendar explicação" no topo da secção Calendário
  btnAgendarExplicacao?.addEventListener("click", () => {
    if (!ALUNO_ATUAL || !ALUNO_ATUAL.id_aluno) {
      alert("Seleciona primeiro um aluno na lista de Alunos para agendar uma sessão.");

      // muda para o tab Alunos automaticamente
      const tabAlunos = document.querySelector('.expl-nav-btn[data-target="alunos"]');
      tabAlunos?.click();
      return;
    }

    // abre o modal de sessão em modo "nova sessão"
    abrirModalSessao(null);
  });

  // ---------- SESSÕES: SUBMIT ----------
  formSessao?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msgSessao.textContent = "";

    if (!ALUNO_ATUAL || !ALUNO_ATUAL.id_aluno) {
      msgSessao.textContent = "Nenhum aluno selecionado.";
      return;
    }

    const f = ev.target;

    const data = f.data_sessao.value;
    if (!data) {
      msgSessao.textContent = "Data é obrigatória.";
      return;
    }

    const payload = {
      id_sessao: SESSAO_ATUAL_ID || undefined,
      aluno_id: ALUNO_ATUAL.id_aluno,
      data,
      hora_inicio: f.hora_inicio.value || null,
      hora_fim: f.hora_fim.value || null,
      duracao_min: f.duracao_min.value || null,
      estado: f.estado.value || "AGENDADA",
      observacoes: f.observacoes.value || null,
    };

    btnSaveSessao.disabled = true;
    msgSessao.textContent = "A guardar sessão...";

    try {
      const { data, error } = await callExplFn("upsert_sessao_aluno", payload);

      if (error) {
        let extra = "";
        if (error.context) {
          try {
            const raw = await error.context.text();
            console.log("Erro upsert_sessao_aluno:", raw);
            try {
              const json = JSON.parse(raw);
              if (json?.error) extra = " " + json.error;
            } catch {
              extra = " " + raw;
            }
          } catch {}
        }
        msgSessao.textContent =
          "Não foi possível guardar a sessão." + extra;
        btnSaveSessao.disabled = false;
        return;
      }

      msgSessao.style.color = "#126b3a";
      msgSessao.textContent = "Sessão guardada com sucesso.";

      await loadSessoesAluno(ALUNO_ATUAL.id_aluno);
      await loadResumoCalendario();
      setTimeout(() => {
        closeModal(modalSessao);
      }, 500);
    } catch (e) {
      console.error("upsert_sessao_aluno error", e);
      msgSessao.textContent = "Erro inesperado ao guardar sessão.";
    } finally {
      btnSaveSessao.disabled = false;
    }
  });

  // ---------- SESSÕES: APAGAR ----------
  btnDeleteSessao?.addEventListener("click", async () => {
    if (!SESSAO_ATUAL_ID) {
      return;
    }
    if (!ALUNO_ATUAL || !ALUNO_ATUAL.id_aluno) {
      alert("Nenhum aluno selecionado.");
      return;
    }

    const conf = confirm("Tens a certeza que queres apagar esta sessão?");
    if (!conf) return;

    msgSessao.textContent = "A apagar sessão...";
    btnDeleteSessao.disabled = true;

    try {
      const { data, error } = await callExplFn("delete_sessao_aluno", {
        id_sessao: SESSAO_ATUAL_ID,
      });

      if (error) {
        let extra = "";
        if (error.context) {
          try {
            const raw = await error.context.text();
            console.log("Erro delete_sessao_aluno:", raw);
            try {
              const json = JSON.parse(raw);
              if (json?.error) extra = " " + json.error;
            } catch {
              extra = " " + raw;
            }
          } catch {}
        }
        msgSessao.textContent =
          "Não foi possível apagar a sessão." + extra;
        btnDeleteSessao.disabled = false;
        return;
      }

      msgSessao.style.color = "#126b3a";
      msgSessao.textContent = "Sessão apagada com sucesso.";

      await loadSessoesAluno(ALUNO_ATUAL.id_aluno);
      await loadResumoCalendario();
      setTimeout(() => {
        closeModal(modalSessao);
      }, 400);
    } catch (e) {
      console.error("delete_sessao_aluno error", e);
      msgSessao.textContent = "Erro inesperado ao apagar sessão.";
    } finally {
      btnDeleteSessao.disabled = false;
    }
  });

  // ------------------------------------------------------------------
  // RENDER CALENDÁRIO SEMANAL
  // ------------------------------------------------------------------
  function renderCalendarioSemanal() {
    const grid = document.getElementById("calendar-grid");
    const label = document.getElementById("week-label");
    if (!grid || !label) return;

    const hoje = new Date();
    const inicio = getInicioSemana(hoje);
    inicio.setDate(inicio.getDate() + semanaOffset * 7);

    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      dias.push(d);
    }

    const fmt = { day: "2-digit", month: "2-digit" };
    label.textContent = `Semana ${dias[0].toLocaleDateString("pt-PT", fmt)}  ${dias[6].toLocaleDateString("pt-PT", fmt)}`;

    const nomes = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

    grid.innerHTML = dias.map((d, idx) => {
      const dataStr = d.toISOString().slice(0, 10);
      const sessoes = SESSOES_EXPLICADOR.filter(s => s.data === dataStr);

      const temRealizada = sessoes.some(s => s.estado === "REALIZADA");
      const temAgendada  = sessoes.some(s => s.estado === "AGENDADA");
      const temExtra     = sessoes.some(s => s.estado === "EXTRA");

      const dotsHTML = `
        ${temRealizada ? `<span class="dot dot-green"></span>` : ""}
        ${temAgendada  ? `<span class="dot dot-yellow"></span>` : ""}
        ${temExtra     ? `<span class="dot dot-orange"></span>` : ""}
      `.trim();

      const lista = sessoes.length === 0
        ? `<p class="calendar-empty">Sem sessões</p>`
        : sessoes.map(s => `
            <div class="calendar-session">
              <strong>${s.hora_inicio?.slice(0,5) || "--:--"}</strong>
              <span>${s.aluno_nome}</span>
            </div>
          `).join("");

      return `
        <div class="calendar-day">
          <div class="calendar-day__header">
            <span class="calendar-day__weekday">${nomes[idx]}</span>
            <span class="calendar-day__date">${d.toLocaleDateString("pt-PT", fmt)}</span>
          </div>

          <div class="calendar-day__dots">${dotsHTML}</div>
          <div class="calendar-day__list">${lista}</div>
        </div>
      `;
    }).join("");
  }

  function getBadgeInfoSessao(estadoRaw) {
    const e = (estadoRaw || "").toString().trim().toUpperCase();

    switch (e) {
      case "REALIZADA":
        return { label: "Realizada", className: "sessao-badge sessao-badge--realizada" };
      case "FALTOU":
        return { label: "Faltou", className: "sessao-badge sessao-badge--faltou" };
      case "CANCELADA":
        return { label: "Cancelada", className: "sessao-badge sessao-badge--cancelada" };
      case "EXTRA":
        return { label: "Extra", className: "sessao-badge sessao-badge--extra" };
      case "AGENDADA":
      default:
        return { label: "Agendada", className: "sessao-badge sessao-badge--agendada" };
    }
  }

  function renderProximasSessoes(sessoes) {
    const container = document.getElementById("calendar-proximas");
    if (!container) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const proximas = (sessoes || [])
      .filter((s) => s.data)                            // tem data
      .map((s) => {
        const d = new Date(s.data);
        d.setHours(0, 0, 0, 0);
        return { ...s, _dataObj: d };
      })
      .filter((s) => s._dataObj >= hoje)                // de hoje para a frente
      .sort((a, b) => {
        if (a._dataObj - b._dataObj !== 0) {
          return a._dataObj - b._dataObj;
        }
        // ordenar também por hora se existir
        const ha = a.hora_inicio || "";
        const hb = b.hora_inicio || "";
        return ha.localeCompare(hb);
      })
      .slice(0, 10);                                    // top 10 próximas

    if (!proximas.length) {
      container.innerHTML =
        '<p class="calendar-empty">Não tens próximas explicações agendadas.</p>';
      return;
    }

    const fmtData = { day: "2-digit", month: "2-digit", year: "numeric" };

    container.innerHTML = proximas
      .map((s) => {
        const dataObj = s._dataObj;
        const dataLabel = dataObj.toLocaleDateString("pt-PT", fmtData);
        const hora = (s.hora_inicio || "").slice(0, 5) || "--:--";
        const dur = s.duracao_min != null ? `${s.duracao_min} min` : "";
        const aluno = s.aluno_nome || "Aluno";
        const local = s.local || ""; // se algum dia tiveres campo local

        const { label: badgeLabel, className: badgeClass } = getBadgeInfoSessao(s.estado);

        return `
          <article class="sessao-card">
            <header class="sessao-card__header">
              <div>
                <p class="sessao-card__aluno">${aluno}</p>
                <p class="sessao-card__meta">${dataLabel}  ${hora}${dur ? "  " + dur : ""}</p>
              </div>
              <span class="${badgeClass}">${badgeLabel}</span>
            </header>

            ${
              local
                ? `<p class="sessao-card__footer">${local}</p>`
                : ""
            }
          </article>
        `;
      })
      .join("");
  }


  btnWeekPrev?.addEventListener("click", () => {
    semanaOffset -= 1;
    renderCalendarioSemanal();
    updateRelatorioKpis(); // volta a calcular, agora com SESSOES_EXPLICADOR preenchido
  });

  btnWeekNext?.addEventListener("click", () => {
    semanaOffset += 1;
    renderCalendarioSemanal();
  });

  const inputSearchSessoes  = document.querySelector("#cal-search");
  const selectEstadoSessoes = document.querySelector("#cal-filtro-estado");
  const viewLista           = document.querySelector("#cal-view-lista");
  const viewTimeline        = document.querySelector("#cal-view-timeline");
  const tabsSessoes         = document.querySelectorAll(".cal-tab");

  tabsSessoes.forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      tabsSessoes.forEach(b => b.classList.toggle("cal-tab--active", b === btn));
      document.querySelectorAll(".cal-view").forEach(v => {
        v.classList.remove("cal-view--active");
      });
      const target = view === "timeline" ? viewTimeline : viewLista;
      target?.classList.add("cal-view--active");
    });
  });

  inputSearchSessoes?.addEventListener("input", renderTodasSessoes);
  selectEstadoSessoes?.addEventListener("change", renderTodasSessoes);

  function filtrarSessoesParaLista() {
    const termo  = (inputSearchSessoes?.value || "").trim().toLowerCase();
    const estado = (selectEstadoSessoes?.value || "todas").toUpperCase();

    return (SESSOES_EXPLICADOR || [])
      .filter(s => {
        if (estado !== "TODAS" && (s.estado || "").toUpperCase() !== estado) return false;
        if (termo && !(s.aluno_nome || "").toLowerCase().includes(termo)) return false;
        return true;
      })
      .sort((a, b) => {
        const da = new Date(a.data + "T" + (a.hora_inicio || "00:00"));
        const db = new Date(b.data + "T" + (b.hora_inicio || "00:00"));
        return da - db;
      });
  }

  function renderTodasSessoes() {
    if (!viewLista || !viewTimeline) return;

    const sessoes = filtrarSessoesParaLista();

    if (!sessoes.length) {
      const emptyHtml = '<p class="calendar-empty">Não existem sessões com os filtros atuais.</p>';
      viewLista.innerHTML = emptyHtml;
      viewTimeline.innerHTML = emptyHtml;
      return;
    }

    // --- VISTA LISTA ---
    viewLista.innerHTML = sessoes.map((s) => {
      const dataLabel = s.data
        ? new Date(s.data).toLocaleDateString("pt-PT", {
            day: "2-digit", month: "2-digit", year: "numeric"
          })
        : "";

      const horaLabel = s.hora_inicio ? s.hora_inicio.slice(0, 5) : "--:--";
      const dur = s.duracao_min != null ? `${s.duracao_min} min` : "";
      const estadoInfo = getBadgeInfoSessao(s.estado); // já tens esta helper

      return `
        <div class="sessao-list-item">
          <div class="sessao-list-main">
            <div class="sessao-list-header">
              <span class="sessao-aluno">${s.aluno_nome || "Aluno"}</span>
              <span class="${estadoInfo.badgeClass || estadoInfo.className}">
                ${estadoInfo.label}
              </span>
            </div>

            <div class="sessao-meta">
              <span>${dataLabel}</span>
              <span>${horaLabel}${dur ? "  " + dur : ""}</span>
            </div>
          </div>

          <div class="sessao-list-actions">
            <button
              type="button"
              class="button secondary button--sm"
              data-cal-acao="editar"
              data-id-sessao="${s.id_sessao}"
              data-id-aluno="${s.aluno_id || ""}"
            >
              Editar
            </button>
            <button
              type="button"
              class="button ghost button--sm"
              data-cal-acao="apagar"
              data-id-sessao="${s.id_sessao}"
              data-id-aluno="${s.aluno_id || ""}"
            >
              Cancelar
            </button>
          </div>
        </div>
      `;
    }).join("");

    // (a parte da Timeline continua como tinhas / como te passei antes)
    renderTimelineSessoes(sessoes);
  }

  function renderTimelineSessoes(sessoes) {
    if (!viewTimeline) return;

    // agrupar por data
    const grupos = {};
    (sessoes || []).forEach(s => {
      const key = s.data || "sem-data";
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(s);
    });

    const chavesOrdenadas = Object.keys(grupos).sort();

    viewTimeline.innerHTML = chavesOrdenadas.map(data => {
      const lista = grupos[data]
        .sort((a, b) => (a.hora_inicio || "").localeCompare(b.hora_inicio || ""))
        .map(s => {
          const hora = s.hora_inicio ? s.hora_inicio.slice(0, 5) : "--:--";
          const dur  = s.duracao_min != null ? `${s.duracao_min} min` : "";
          const estadoInfo = getBadgeInfoSessao(s.estado); // já existe no teu JS

          return `
            <div class="cal-timeline-ponto">
              <div class="sessao-list-item">
                <div class="sessao-list-header">
                  <span class="sessao-aluno">${s.aluno_nome || "Aluno"}</span>
                  <span class="${estadoInfo.badgeClass || estadoInfo.className}">
                    ${estadoInfo.label}
                  </span>
                </div>
                <div class="sessao-meta">
                  <span>${hora}${dur ? "  " + dur : ""}</span>
                </div>
              </div>
            </div>
          `;
        }).join("");

      const titulo = data !== "sem-data"
        ? new Date(data).toLocaleDateString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          })
        : "Sem data";

      return `
        <div class="cal-timeline-dia">
          <h4 class="cal-timeline-dia-titulo">${titulo}</h4>
          <div class="cal-timeline-lista">
            ${lista}
          </div>
        </div>
      `;
    }).join("");
  }

  // Delegação de clique na lista "Todas as explicações"
  const listaTodasSessoes = document.querySelector("#cal-view-lista");

  listaTodasSessoes?.addEventListener("click", onClickSessaoCalendario);

  async function onClickSessaoCalendario(ev) {
    const btn = ev.target.closest("[data-cal-acao]");
    if (!btn) return;

    ev.stopPropagation();

    const acao      = btn.dataset.calAcao;
    const idSessao  = btn.dataset.idSessao;
    const idAluno   = btn.dataset.idAluno;

    if (!acao || !idSessao) return;

    const sessao = (SESSOES_EXPLICADOR || []).find(
      (s) => String(s.id_sessao) === String(idSessao)
    );
    if (!sessao) {
      alert("Sessão não encontrada.");
      return;
    }

    // ---------- EDITAR ----------
    if (acao === "editar") {
      // 1) tentar obter o id do aluno da sessão
      let alunoId = sessao.aluno_id || sessao.id_aluno || idAluno;

      // 2) se ainda não tivermos, tentar encontrar pelo nome
      if (!alunoId && sessao.aluno_nome && Array.isArray(ALUNOS_CACHE)) {
        const match = ALUNOS_CACHE.find(a => {
          const nomeCompleto = [a.nome, a.apelido].filter(Boolean).join(" ").trim();
          return nomeCompleto === sessao.aluno_nome;
        });
        if (match) {
          alunoId = match.id_aluno;
        }
      }

      if (!alunoId) {
        alert("Não foi possível identificar o aluno desta sessão. Abre primeiro o aluno na secção 'Alunos' e tenta novamente.");
        return;
      }

      // 3) preencher ALUNO_ATUAL com o aluno correto
      let alunoObj = Array.isArray(ALUNOS_CACHE)
        ? ALUNOS_CACHE.find(a => String(a.id_aluno) === String(alunoId))
        : null;

      if (!alunoObj) {
        alunoObj = { id_aluno: alunoId }; // fallback mínimo
      }

      ALUNO_ATUAL = alunoObj;

      // 4) abrir o mesmo modal de sessão que já usas no perfil
      if (typeof abrirModalSessao === "function") {
        abrirModalSessao(sessao); // preenche form + mostra modal
      } else if (typeof preencherModalSessao === "function") {
        preencherModalSessao(sessao);
        openModal(modalSessao);
      } else {
        console.warn("Função de abrir modal de sessão não encontrada.");
      }
      return;
    }

    // ---------- APAGAR / CANCELAR ----------
    if (acao === "apagar") {
      const confirmar = confirm("Tens a certeza que queres cancelar/apagar esta sessão?");
      if (!confirmar) return;

      try {
        const { error } = await callExplFn("delete_sessao_aluno", {
          id_sessao: sessao.id_sessao,
        });

        if (error) {
          console.error(error);
          alert("Não foi possível apagar a sessão.");
          return;
        }

        // Recarregar calendário + listas
        await loadResumoCalendario();

        // Se o perfil desse aluno estiver aberto, atualiza também
        if (ALUNO_ATUAL && ALUNO_ATUAL.id_aluno &&
            String(ALUNO_ATUAL.id_aluno) === String(sessao.aluno_id || idAluno)) {
          await loadSessoesAluno(ALUNO_ATUAL.id_aluno);
        }
      } catch (e) {
        console.error(e);
        alert("Erro inesperado ao apagar sessão.");
      }
    }
  }

  // --------------------------------------------------------------------
  // CARREGAR RESUMO DE CALENDÁRIO
  // --------------------------------------------------------------------
  async function loadResumoCalendario() {
    const { data, error } = await callExplFn("list_sessoes_explicador", null);

    if (error) {
      console.error("Erro a carregar sessões do explicador", error);
      return;
    }

    const sessoes = data || [];
    SESSOES_EXPLICADOR = sessoes;
    atualizarResumoSemana(SESSOES_EXPLICADOR);
    renderTodasSessoes();
        // atualizar KPIs e gráfico de sessões nos Relatórios, se existirem
    if (typeof updateRelatorioKpis === "function") {
      //updateRelatorioKpis();
    }
    renderGraficoSessoesMensais();


    //Estatísticas rápidas Explicações
    function atualizarResumoSemana(sessoes) {
      const elTotal = document.querySelector("#cal-kpi-sessoes-semana");
      const elHoras = document.querySelector("#cal-kpi-horas");
      const elFat   = document.querySelector("#cal-kpi-fat-semana");
      const elProx  = document.querySelector("#cal-kpi-proxima");
      if (!elTotal || !elHoras || !elFat || !elProx) return;

      const hoje = new Date();
      hoje.setHours(0,0,0,0);
      const inicio = getInicioSemana(hoje);   // já usas esta função no calendário semanal
      const fim = new Date(inicio);
      fim.setDate(fim.getDate() + 6);

      const daSemana = (sessoes || []).filter(s => {
        if (!s.data) return false;
        const d = new Date(s.data);
        return d >= inicio && d <= fim;
      });

      const totalSessoes = daSemana.length;
      const horasTotais = daSemana.reduce((acc, s) => {
        const mins = s.duracao_min != null ? Number(s.duracao_min) : 0;
        return acc + mins / 60;
      }, 0);

      // Aqui não tens ainda um campo "valor" na sessão.
      // Se mais tarde adicionares (ex: s.preco_sessao), basta somar aqui.
      const faturacaoSemana = 0; // placeholder

      elTotal.textContent = totalSessoes.toString();
      elHoras.textContent = horasTotais ? `${horasTotais.toFixed(1)}h` : "0h";
      elFat.textContent   = faturacaoSemana ? `${faturacaoSemana.toFixed(2)}€` : "";

      // Próxima sessão (já calculas algo semelhante para "Próximas explicações")
      const agora = new Date();
      const futuras = (sessoes || [])
        .filter(s => s.data)
        .map(s => {
          const d = new Date(s.data);
          if (s.hora_inicio) {
            const [h, m] = s.hora_inicio.split(":").map(Number);
            d.setHours(h || 0, m || 0, 0, 0);
          }
          return { ...s, _dataObj: d };
        })
        .filter(s => s._dt >= agora)
        .sort((a, b) => a._dt - b._dt);

      if (!futuras.length) {
        elProx.textContent = "Sem próximas sessões";
      } else {
        const prox = futuras[0];
        const dataLabel = prox._dt.toLocaleDateString("pt-PT", {
          day: "2-digit", month: "2-digit"
        });
        const horaLabel = prox.hora_inicio ? prox.hora_inicio.slice(0,5) : "--:--";
        elProx.textContent = `${dataLabel}  ${horaLabel}`;
      }
    }

    // HOJE
    const hojeStr = new Date().toISOString().slice(0, 10);
    const sessoesHoje = sessoes.filter(s => s.data === hojeStr);

    let txtHoje = "Sem sessões registadas";
    if (sessoesHoje.length > 0) {
      const detalhes = sessoesHoje
        .map(s => `${s.hora_inicio?.slice(0, 5) || "--:--"} ${s.aluno_nome || ""}`.trim())
        .join(", ");

      txtHoje = `${sessoesHoje.length} sessão(ões) hoje  ${detalhes}`;
    }

    const elHoje = document.querySelector("#cal-resumo-hoje");
    if (elHoje) elHoje.textContent = txtHoje;

    // PRÓXIMOS 7 DIAS
    const hojeDate = new Date();
    const seteDiasDepois = new Date();
    seteDiasDepois.setDate(hojeDate.getDate() + 7);

    const sessoesSemana = sessoes.filter(s => {
      const dataSess = new Date(s.data);
      dataSess.setHours(0, 0, 0, 0);
      return dataSess >= hojeDate && dataSess <= seteDiasDepois;
    });

    let txtSemana = "Agenda em branco por agora";
    if (sessoesSemana.length > 0) {
      const alunosUnicos = new Set(sessoesSemana.map(s => s.aluno_nome));
      txtSemana =
        `${sessoesSemana.length} sessões nos próximos 7 dias  ` +
        `${alunosUnicos.size} aluno(s) diferente(s)`;
    }

    const elSemana = document.querySelector("#cal-resumo-semana");
    if (elSemana) elSemana.textContent = txtSemana;

    // ----------------------------------------------------
    // PRÓXIMAS EXPLICAÇÕES (lista à direita)
    // ----------------------------------------------------
    if (listaProximas) {
      // só sessões futuras ou de hoje com hora >= agora
      const agora = new Date();
      const futuras = (sessoes || [])
        .filter((s) => {
          if (!s.data) return false;
          const d = new Date(s.data);
          if (s.hora_inicio) {
            const [h, m] = s.hora_inicio.split(":").map(Number);
            d.setHours(h || 0, m || 0, 0, 0);
          }
          return d >= agora;
        })
        .sort((a, b) => {
          const da = new Date(a.data + "T" + (a.hora_inicio || "00:00"));
          const db = new Date(b.data + "T" + (b.hora_inicio || "00:00"));
          return da - db;
        })
        .slice(0, 10); // mostra no máximo 10

      if (!futuras.length) {
        listaProximas.innerHTML =
          '<p class="expl-section-sub">Não tens próximas explicações agendadas.</p>';
      } else {
        listaProximas.innerHTML = futuras
          .map((s) => {
            const dataLabel = s.data
              ? new Date(s.data).toLocaleDateString("pt-PT", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric"
                })
              : "";

            const horaLabel = s.hora_inicio
              ? s.hora_inicio.slice(0, 5)
              : "--:--";

            const dur = s.duracao_min != null
              ? `${s.duracao_min} min`
              : "";

            const estado = s.estado || "AGENDADA";
            const aluno  = s.aluno_nome || "Aluno";

            return `
              <div class="calendar-proxima-card">
                <div class="calendar-proxima-main">
                  <p class="calendar-proxima-aluno">${aluno}</p>
                  <span class="calendar-proxima-badge">${estado}</span>
                </div>
                <p class="calendar-proxima-meta">
                  <span>${dataLabel}</span> 
                  <span>${horaLabel}</span>
                  ${dur ? `  <span>${dur}</span>` : ""}
                </p>
              </div>
            `;
          })
          .join("");
      }
    }

    // Finalmente, atualizar grelha semanal
    renderProximasSessoes(sessoes);
  }

  // estado inicial dos tabs
  ativarScreen("dashboard");
  (function () {
  const fab    = document.getElementById("fabNav");
  const toggle = document.getElementById("fabToggle");
  const itemsWrapper = document.getElementById("fabItems");
  const items  = Array.from(document.querySelectorAll(".fab-item"));

  // raio do arco
  const RADIUS_DESKTOP = 160;
  const RADIUS_MOBILE  = 135;

  // distância das labels para fora do arco (se as estiveres a usar)
  const LABEL_OFFSET = 70;

  function getRadius() {
    return window.innerWidth < 640 ? RADIUS_MOBILE : RADIUS_DESKTOP;
  }

  function positionItems() {
    const total  = items.length;
    if (!total) return;

    const radius = getRadius();

    // CANTO INFERIOR ESQUERDO:
    // centro do arco a 315º (diagonal para cima/direita)
    // abertura de 90º -> de 270º (cima) até 360º (direita)
    const centerDeg = 315;
    const spreadDeg = 90;
    const startDeg  = centerDeg - spreadDeg / 2;
    const step      = total > 1 ? spreadDeg / (total - 1) : 0;

    items.forEach((btn, i) => {
      const angleDeg = startDeg + step * i;     // 270, 292.5, 315, 337.5, 360
      const angleRad = angleDeg * Math.PI / 180;

      const x = Math.cos(angleRad) * radius;
      const y = Math.sin(angleRad) * radius;

      // move o botão
      btn.style.setProperty("--tx", x + "px");
      btn.style.setProperty("--ty", y + "px");

      // ---- LABELS (se estiveres a usar .fab-label com --lx/--ly) ----
      const len = Math.sqrt(x * x + y * y) || 1;
      const ux = x / len;
      const uy = y / len;

      const dx = ux * LABEL_OFFSET;
      const dy = uy * LABEL_OFFSET;

      const label = btn.querySelector(".fab-label");
      if (label) {
        label.style.setProperty("--lx", dx + "px");
        label.style.setProperty("--ly", dy + "px");
      }
    });
  }

  function openFab() {
    fab.classList.add("is-open");
    itemsWrapper.hidden = false;
    itemsWrapper.setAttribute("aria-hidden", "false");
    positionItems();
  }

  function closeFab() {
    const itemsWrapper = document.getElementById("fabItems");
    items.forEach(btn => {
      btn.style.setProperty("--tx", "0px");
      btn.style.setProperty("--ty", "0px");

      const label = btn.querySelector(".fab-label");
      if (label) {
        label.style.setProperty("--lx", "0px");
        label.style.setProperty("--ly", "0px");
      }
    });
    fab.classList.remove("is-open");
    itemsWrapper.setAttribute("aria-hidden", "true");
    setTimeout(() => { itemsWrapper.hidden = true; }, 300);
  }

  // toggle abre/fecha
  toggle.addEventListener("click", () => {
    if (fab.classList.contains("is-open")) {
      closeFab();
    } else {
      openFab();
    }
  });

  // se redimensionar o ecrã com o menu aberto, recalcula posições
  window.addEventListener("resize", () => {
    if (fab.classList.contains("is-open")) {
      positionItems();
    }
  });


  // cada item navega para a secção e fecha o menu
  items.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      const original = document.querySelector(
        `.expl-nav-btn[data-target="${target}"]`
      );
      if (original) original.click();
      closeFab();
    });
  });

    // Disponibilizar no global para o HTML
  window.ativarScreen = ativarScreen;
  window.voltarParaAlunos = function () {
    ativarScreen("alunos");
  };

  window.showPerfilTab = function (tab) {
    const sec = document.getElementById("expl-sec-aluno-perfil");
    if (!sec) return;

    sec.querySelectorAll(".tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    sec.querySelectorAll(".tab-content").forEach((div) => {
      div.classList.toggle("active", div.id === `tab-${tab}`);
    });
  };

})();

// Listener global para todos os sinos da página (dashboard + lista)
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".aluno-card__bell");
    if (!btn) return;

    const idAluno =
      btn.dataset.idAluno || btn.getAttribute("data-id-aluno");
    if (!idAluno) return;

    const aluno = (ALUNOS_CACHE || []).find(
      (x) => String(x.id_aluno) === String(idAluno)
    );
    if (!aluno) return;

    const avisadoAtual = !!aluno.mensalidade_avisada;
    const novoEstado = !avisadoAtual;

    // feedback visual imediato (optimista)
    const svg = btn.querySelector("svg");
    if (svg) {
      svg.classList.toggle("aluno-bell-icon--active", novoEstado);
    }
    btn.dataset.avisado = String(novoEstado);
    btn.setAttribute("aria-pressed", novoEstado ? "true" : "false");

    try {
      const { error } = await callExplFn("set_mensalidade_avisada", {
        aluno_id: aluno.id_aluno,   //  o backend espera "aluno_id"
        avisado: novoEstado,
      });

      if (error) {
        console.error("Erro ao atualizar aviso:", error);

        // reverte se falhar
        aluno.mensalidade_avisada = avisadoAtual;
        if (svg) {
          svg.classList.toggle("aluno-bell-icon--active", avisadoAtual);
        }
        btn.dataset.avisado = String(avisadoAtual);
        btn.setAttribute("aria-pressed", avisadoAtual ? "true" : "false");
        alert("Não foi possível atualizar o estado de aviso.");
        return;
      }

      aluno.mensalidade_avisada = novoEstado;
    } catch (e) {
      console.error("Erro inesperado ao atualizar aviso:", e);
    }
  });

