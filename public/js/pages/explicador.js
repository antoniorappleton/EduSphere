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

ui.fNew?.addEventListener("submit", async (e) => {
  e.preventDefault();
  ui.msgNew.textContent = "";

  // bloqueio no cliente se já atingiu limite
  if (maxAlunos > 0) {
    const { count } = await s
      .from("alunos")
      .select("id_aluno", { count: "exact", head: true })
      .eq("id_explicador", myExplId);
    if ((count || 0) >= maxAlunos) {
      ui.msgNew.textContent = "Limite de alunos atingido. Fale com o Admin.";
      return;
    }
  }

  const p = {
    nome: e.target.nome.value.trim(),
    apelido: e.target.apelido.value.trim() || null,
    contacto: e.target.contacto.value.trim() || null,
    email: e.target.email.value.trim(),
    password: e.target.password.value,
    ano_escolaridade: e.target.ano.value ? Number(e.target.ano.value) : null,
  };
  const { error } = await s.functions.invoke("expl-alunos", {
    body: { action: "create_aluno", payload: p },
  });
  if (error) return (ui.msgNew.textContent = error.message);
  ui.msgNew.style.color = "#d3ffe5";
  ui.msgNew.textContent = "Aluno criado.";
  e.target.reset();
  await loadHeaderInfo();
  load();
});
