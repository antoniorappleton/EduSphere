(async () => {
  const appUser = await getAppUser();
  if (!appUser || (appUser.role !== "aluno" && appUser.role !== "pai")) {
    location.href = "./login.html";
    return;
  }

  // Agenda
  const { data: agenda } = await supabase
    .from("v_explicacoes_detalhe")
    .select("*")
    .order("data", { ascending: true })
    .order("hora", { ascending: true });

  const ag = document.getElementById("agenda");
  ag.innerHTML =
    (agenda || [])
      .map(
        (x) => `
    <article class="card">
      <div><strong>${x.aluno_nome ?? ""}</strong></div>
      <div>${x.data} • ${x.hora} • ${x.local ?? ""}</div>
      <p>${x.detalhes ?? ""}</p>
      <span class="badge">${Number(x.preco).toFixed(2)} €</span>
    </article>
  `
      )
      .join("") || "<p>Sem explicações.</p>";

  // Pagamentos
  const { data: pagos } = await supabase
    .from("v_pagamentos_detalhe")
    .select("*")
    .order("mes", { ascending: true });
  const tbody = document.querySelector("#tabPag tbody");
  tbody.innerHTML = (pagos || [])
    .map(
      (p) => `
    <tr>
      <td>${p.mes}</td>
      <td>${Number(p.valor_previsto).toFixed(2)} €</td>
      <td>${Number(p.valor_pago).toFixed(2)} €</td>
      <td><span class="badge ${p.estado}">${p.estado}</span></td>
    </tr>
  `
    )
    .join("");

  // Exercícios (público ou com signed URL)
  const { data: exs } = await supabase
    .from("exercicios")
    .select("*")
    .order("created_at", { ascending: false });
  const items = await Promise.all(
    (exs || []).map(async (ex) => {
      let href = ex.url;
      if (!href || /^https?:\/\//.test(href) === false) {
        const { data: s } = await supabase.storage
          .from("exercicios")
          .createSignedUrl(ex.url, 3600);
        href = s?.signedUrl ?? "#";
      }
      return `<li><a href="${href}" target="_blank" rel="noopener">${
        ex.nome
      }</a> <small>(${ex.tipo || "ficheiro"})</small></li>`;
    })
  );
  document.getElementById("exlist").innerHTML =
    items.join("") || "<li>Sem exercícios.</li>";

  // Alterar password
  document.getElementById("fPwd").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pwdMsg = document.getElementById("pwdMsg");
    pwdMsg.textContent = "";
    const newPwd = e.target.pwd.value;
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      pwdMsg.style.color = "#126b3a";
      pwdMsg.textContent = "Palavra-passe atualizada.";
      e.target.reset();
    } catch (err) {
      pwdMsg.style.color = "#a92a1f";
      pwdMsg.textContent = err.message;
    }
  });

  document.getElementById("logout").addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut();
    location.href = "./login.html";
  });
})();
