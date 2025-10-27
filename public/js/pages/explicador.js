(async () => {
  const me = await getAppUser();
  if (!me || me.role !== "explicador") {
    location.href = "./login.html";
    return;
  }

  // KPIs previsto/realizado
  const { data: prevs } = await supabase
    .from("v_previsto_explicador")
    .select("*")
    .eq("id_explicador", me.explicador_id);
  const now = new Date();
  const mesAtual =
    String(now.getMonth() + 1).padStart(2, "0") + "/" + now.getFullYear();
  const mesProxD = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const mesProx =
    String(mesProxD.getMonth() + 1).padStart(2, "0") +
    "/" +
    mesProxD.getFullYear();
  const prevAtual =
    (prevs || []).find((x) => x.mes === mesAtual)?.previsto ?? 0;
  const prevProx = (prevs || []).find((x) => x.mes === mesProx)?.previsto ?? 0;
  const { data: reals } = await supabase
    .from("v_realizado_explicador")
    .select("*")
    .eq("id_explicador", me.explicador_id)
    .eq("mes", mesAtual);

  document.getElementById("prevAtual").textContent =
    Number(prevAtual).toFixed(2);
  document.getElementById("prevProx").textContent = Number(prevProx).toFixed(2);
  document.getElementById("realAtual").textContent = Number(
    reals?.[0]?.realizado ?? 0
  ).toFixed(2);

  // Meus alunos
  const { data: meus } = await supabase
    .from("v_meus_alunos")
    .select("*")
    .eq("id_explicador", me.explicador_id)
    .order("nome", { ascending: true });

  const tbody = document.querySelector("#tabAlunos tbody");
  tbody.innerHTML =
    (meus || [])
      .map(
        (a) => `
  <tr>
    <td>${a.nome} ${a.apelido ?? ""}</td>
    <td>${a.idade ?? ""}</td>
    <td>${a.ano_escolaridade ?? ""}</td>
    <td>${a.dia_semana_preferido ?? ""}</td>
    <td>${a.valor_explicacao ?? ""}</td>
    <td>${a.sessoes_mes ?? ""}</td>
    <td>${a.pai_nome ?? a.nome_pai_cache ?? ""}</td>
    <td>${a.pai_contacto ?? a.contacto_pai_cache ?? ""}</td>
    <td>${a.email ?? ""}</td>
  </tr>
`
      )
      .join("") || '<tr><td colspan="9">Sem explicandos.</td></tr>';


  // Criar novo aluno + associar a mim
  document.getElementById("fNovo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("novoMsg");
    msg.textContent = "";
    const f = Object.fromEntries(new FormData(e.target).entries());
    try {
      // 1) cria aluno (AGORA com email)
      const { data: aIns, error: aErr } = await supabase
        .from("alunos")
        .insert([
          {
            nome: f.nome,
            apelido: f.apelido || null,
            idade: f.idade ? Number(f.idade) : null,
            ano_escolaridade: f.ano ? Number(f.ano) : null,
            telemovel: f.contacto || null,
            email: f.email?.trim().toLowerCase(), // <<<<< AQUI
            dia_semana_preferido: f.dia || null,
            valor_explicacao: f.valor ? Number(f.valor) : null,
            sessoes_mes: f.sessoes ? Number(f.sessoes) : null,
            nome_pai_cache: f.pai || null,
            contacto_pai_cache: f.cpai || null,
          },
        ])
        .select("id_aluno")
        .single();
      if (aErr) throw aErr;

      // 2) ligar ao meu explicador_id (mantém)
      const { error: rErr } = await supabase
        .from("relacoes_aluno_explicador")
        .insert([
          {
            id_aluno: aIns.id_aluno,
            id_explicador: me.explicador_id,
          },
        ]);
      if (rErr) throw rErr;

      msg.style.color = "#126b3a";
      msg.textContent =
        "Explicando criado e associado. O aluno poderá registar-se e entra automaticamente.";
      e.target.reset();
    } catch (err) {
      msg.style.color = "#a92a1f";
      msg.textContent = err.message;
    }
  });


  // Agendar extra
  document.getElementById("fExtra").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("extraMsg");
    msg.textContent = "";
    const f = Object.fromEntries(new FormData(e.target).entries());
    try {
      const { error } = await supabase.from("explicacoes").insert([
        {
          id_aluno: f.aluno_id,
          data: f.data,
          hora: f.hora,
          local: f.local || null,
          detalhes: f.detalhes || null,
          preco: f.preco ? Number(f.preco) : 0,
        },
      ]);
      if (error) throw error;
      msg.style.color = "#126b3a";
      msg.textContent = "Explicação extra agendada.";
      e.target.reset();
    } catch (err) {
      msg.style.color = "#a92a1f";
      msg.textContent = err.message;
    }
  });

  // Enviar exercício
  document.getElementById("fEx").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("exMsg");
    msg.textContent = "";
    const fd = new FormData(e.target);
    const aluno_id = fd.get("aluno_id");
    const nome = fd.get("nome");
    const file = fd.get("ficheiro");
    try {
      const id_exercicio = crypto.randomUUID();
      const safe = file.name.replace(/\s+/g, "_");
      const path = `${aluno_id}/${id_exercicio}/${safe}`;

      const { error: upErr } = await supabase.storage
        .from("exercicios")
        .upload(path, file);
      if (upErr) throw upErr;

      const pub = supabase.storage.from("exercicios").getPublicUrl(path);
      const url = pub?.data?.publicUrl || path;

      const { error: insErr } = await supabase
        .from("exercicios")
        .insert([{ id_aluno: aluno_id, nome, tipo: file.type || "file", url }]);
      if (insErr) throw insErr;

      msg.style.color = "#126b3a";
      msg.textContent = "Exercício enviado.";
      e.target.reset();
    } catch (err) {
      msg.style.color = "#a92a1f";
      msg.textContent = err.message;
    }
  });

  document.getElementById("logout").addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut();
    location.href = "./login.html";
  });
})();
