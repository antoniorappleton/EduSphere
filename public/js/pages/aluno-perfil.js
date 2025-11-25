import { supabase } from "../supabaseClient.js";

function getIdAluno() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

async function carregarAluno() {
  const id = getIdAluno();
  if (!id) return;

  // Buscar aluno
  const { data: aluno } = await supabase.rpc("expl-alunos", {
    action: "list_alunos",
    payload: {},
  });

  const info = aluno.find((a) => a.id_aluno === id);
  if (!info) return;

  document.getElementById("alunoNome").textContent =
    info.nome + " " + (info.apelido || "");
  document.getElementById("alunoAno").textContent = info.ano + "º Ano";
  document.getElementById("alunoEmail").textContent = info.email || "—";
  document.getElementById("alunoTele").textContent = info.telemovel || "—";
  document.getElementById("alunoStatus").textContent = info.is_active
    ? "Ativo"
    : "Inativo";

  const iniciais = (info.nome[0] + (info.apelido?.[0] || "")).toUpperCase();
  document.getElementById("alunoAvatar").textContent = iniciais;
}

/* TABS */
window.showTab = function (tab) {
  document
    .querySelectorAll(".tab")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.remove("active"));

  document
    .querySelector(`[onclick="showTab('${tab}')"]`)
    .classList.add("active");
  document.getElementById(`tab-${tab}`).classList.add("active");
};

carregarAluno();
