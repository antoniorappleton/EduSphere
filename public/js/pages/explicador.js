// ... mantém o topo do ficheiro como já tens

let myExplId = null;
let maxAlunos = 0;

async function guard() {
  const {
    data: { user },
  } = await s.auth.getUser();
  if (!user) return;
  const { data } = await s
    .from("app_users")
    .select("role,ref_id")
    .eq("user_id", user.id)
    .single();
  if (data?.role !== "explicador") {
    ui.msg.textContent = "Acesso restrito a explicadores.";
    return;
  }
  myExplId = data.ref_id;
  ui.login.style.display = "none";
  ui.panel.style.display = "block";
  await loadHeaderInfo();
  await load();
}

async function loadHeaderInfo() {
  // busca limite e contagem
  const { data: exp } = await s
    .from("explicadores")
    .select("max_alunos")
    .eq("id_explicador", myExplId)
    .single();
  const { count } = await s
    .from("alunos")
    .select("id_aluno", { count: "exact", head: true })
    .eq("id_explicador", myExplId);
  maxAlunos = exp?.max_alunos ?? 0;

  // injeta um badge acima do formulário
  let badge = document.getElementById("slotsBadge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "slotsBadge";
    badge.style = "margin:6px 0 10px; font-weight:600;";
    ui.panel.querySelector("h1").after(badge);
  }
  const livre =
    maxAlunos === 0
      ? "Sem limite"
      : `${Math.max(maxAlunos - (count || 0), 0)} livres de ${maxAlunos}`;
  badge.textContent = `Capacidade: ${livre}`;
}

formNew?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  msgNewAluno.textContent = "";

  if (!EXPLICADOR.id_explicador) {
    msgNewAluno.textContent = "Perfil de explicador inválido.";
    return;
  }

  const f = ev.target;

  const payload = {
    nome: f.nome.value.trim(),
    apelido: f.apelido.value.trim() || null,
    telemovel: f.telemovel.value.trim() || null,
    ano: f.ano.value ? Number(f.ano.value) : null,
    idade: f.idade.value ? Number(f.idade.value) : null,
    dia_semana_preferido: f.dia_semana_preferido.value.trim() || null,
    valor_explicacao: f.valor_explicacao.value
      ? Number(f.valor_explicacao.value)
      : null,
    sessoes_mes: f.sessoes_mes.value ? Number(f.sessoes_mes.value) : null,
    nome_pai_cache: f.nome_pai_cache.value.trim() || null,
    contacto_pai_cache: f.contacto_pai_cache.value.trim() || null,
    email: f.email.value.trim(),
    username: f.username.value.trim() || null,
    password: f.password.value,
    is_active: true, // por agora sempre ativo ao criar
  };

  if (!payload.nome || !payload.email || !payload.password) {
    msgNewAluno.textContent = "Preenche pelo menos Nome, Email e Password.";
    return;
  }

  btnCreate.disabled = true;
  msgNewAluno.textContent = "A criar aluno...";

  const { data, error } = await supabase.functions.invoke("expl-alunos", {
    body: { action: "create_aluno", payload },
  });

  if (error) {
    console.error(error);
    msgNewAluno.textContent = "Não foi possível criar o aluno.";
    btnCreate.disabled = false;
    return;
  }

  msgNewAluno.style.color = "#126b3a";
  msgNewAluno.textContent = "Aluno criado com sucesso!";
  f.reset();
  await loadAlunos();
  btnCreate.disabled = false;
});

