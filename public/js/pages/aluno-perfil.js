import { supabase } from "../supabaseClient.js";
import { callExplFn } from "../api.js";

console.log("Aluno-perfil carregado com sucesso!");

const $ = (s) => document.querySelector(s);

window.showTab = function (tab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

  document.querySelector(`[onclick="showTab('${tab}')"]`).classList.add("active");
  document.getElementById(`tab-${tab}`).classList.add("active");
};

function getAlunoId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getFullYear()}`;
}

async function carregarAluno() {
  const alunoId = getAlunoId();
  if (!alunoId) return;

  // 1) Buscar todos os alunos do explicador
  const { data: alunos, error } = await callExplFn("list_alunos");
  if (error) {
    console.error(error);
    alert("Erro ao carregar aluno.");
    return;
  }

  const aluno = alunos.find(a => a.id_aluno === alunoId);
  if (!aluno) {
    alert("Aluno não encontrado.");
    return;
  }

  // 2) Preencher os campos
  $("#alunoNome").textContent = `${aluno.nome} ${aluno.apelido ?? ""}`;
  $("#alunoAno").textContent  = aluno.ano ? `${aluno.ano}º Ano` : "—";
  $("#alunoEmail").textContent = aluno.email ?? "—";
  $("#alunoTele").textContent  = aluno.telemovel ?? "—";
  $("#alunoStatus").textContent = aluno.is_active ? "Ativo" : "Inativo";

  const initials = (aluno.nome[0] + (aluno.apelido?.[0] ?? "")).toUpperCase();
  $("#alunoAvatar").textContent = initials;

  carregarSessoes(alunoId);
  carregarPagamentos(alunoId);
}

async function carregarSessoes(alunoId) {
  const { data: sessoes } = await callExplFn("list_sessoes_aluno", {
    aluno_id: alunoId
  });

  let realizadas = sessoes.filter(s => s.estado === "REALIZADA").length;
  $("#kpiAulas").textContent = `${realizadas}/${sessoes.length}`;

  const prox = sessoes
      .filter(s => s.estado === "AGENDADA")
      .sort((a,b) => a.data.localeCompare(b.data))[0];

  $("#proximaAulaTxt").textContent = prox ? formatDate(prox.data) : "Nenhuma aula agendada";

  $("#listaExplicacoes").innerHTML = sessoes.map(s => `
    <tr>
      <td>${formatDate(s.data)}</td>
      <td>${s.hora_inicio ?? "—"}</td>
      <td>—</td>
      <td>—</td>
      <td>${s.estado}</td>
      <td>${s.observacoes ?? ""}</td>
    </tr>
  `).join("");
}

async function carregarPagamentos(alunoId) {
  const user = (await supabase.auth.getSession())?.data.session.user;

  const { data: expl } = await supabase
    .from("explicadores")
    .select("id_explicador")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!expl) return;

  const { data: lista } = await supabase
    .from("v_pagamentos_detalhe")
    .select("*")
    .eq("id_aluno", alunoId)
    .eq("id_explicador", expl.id_explicador);

  let total = 0;

  $("#listaPagamentos").innerHTML = lista.map(p => {
    total += p.valor_pago ?? 0;
    return `
      <tr>
        <td>${formatDate(p.data_pagamento)}</td>
        <td>${String(p.mes).padStart(2,"0")}/${p.ano}</td>
        <td>€ ${p.valor_pago ?? 0}</td>
        <td>—</td>
        <td>${p.estado}</td>
      </tr>
    `;
  }).join("");

  $("#pagTotal").textContent = total;
}

carregarAluno();
