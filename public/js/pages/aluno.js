// public/js/aluno.js (ou ./aluno.js, conforme o teu path)
(async () => {
  // 1) Garantir que o utilizador está autenticado
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    console.error("Erro a obter utilizador atual", userErr);
    location.href = "./login.html";
    return;
  }

  // A partir daqui, confias no RLS para devolver só dados desse aluno/pai.

  // 2) Agenda – próxima(s) explicações
  const { data: agenda, error: agendaErr } = await supabase
    .from("v_explicacoes_detalhe")
    .select("*")
    .order("data", { ascending: true })
    .order("hora", { ascending: true });

  const ag = document.getElementById("agenda");
  if (agendaErr) {
    console.error("Erro a carregar agenda", agendaErr);
    ag.innerHTML = "<p>Erro ao carregar agenda.</p>";
  } else {
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
  }

  // 3) Pagamentos
  const { data: pagos, error: pagosErr } = await supabase
    .from("v_pagamentos_detalhe")
    .select("*")
    .order("mes", { ascending: true });

  const tbody = document.querySelector("#tabPag tbody");
  if (pagosErr) {
    console.error("Erro a carregar pagamentos", pagosErr);
    tbody.innerHTML =
      '<tr><td colspan="4">Erro ao carregar pagamentos.</td></tr>';
  } else {
    tbody.innerHTML =
      (pagos || [])
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
        .join("") || '<tr><td colspan="4">Sem movimentos.</td></tr>';
  }

  // 4) Exercícios
  const { data: exs, error: exErr } = await supabase
    .from("exercicios")
    .select("*")
    .order("created_at", { ascending: false });

  const exList = document.getElementById("exlist");
  if (exErr) {
    console.error("Erro a carregar exercícios", exErr);
    exList.innerHTML = "<li>Erro ao carregar exercícios.</li>";
  } else {
    const items = await Promise.all(
      (exs || []).map(async (ex) => {
        let href = ex.url;
        // Se não for URL completo, assume ficheiro no Storage "exercicios"
        if (!href || /^https?:\/\//.test(href) === false) {
          const { data: s, error: sErr } = await supabase.storage
            .from("exercicios")
            .createSignedUrl(ex.url, 3600);
          if (sErr) {
            console.error("Erro a criar signed URL", sErr);
          }
          href = s?.signedUrl ?? "#";
        }
        return `<li><a href="${href}" target="_blank" rel="noopener">${
          ex.nome
        }</a> <small>(${ex.tipo || "ficheiro"})</small></li>`;
      })
    );

    exList.innerHTML = items.join("") || "<li>Sem exercícios.</li>";
  }

  // 5) Alterar password
  const fPwd = document.getElementById("fPwd");
  if (fPwd) {
    fPwd.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pwdMsg = document.getElementById("pwdMsg");
      pwdMsg.textContent = "";
      const newPwd = e.target.pwd.value;

      try {
        const { error: upErr } = await supabase.auth.updateUser({
          password: newPwd,
        });
        if (upErr) throw upErr;
        pwdMsg.style.color = "#126b3a";
        pwdMsg.textContent = "Palavra-passe atualizada.";
        e.target.reset();
      } catch (err) {
        pwdMsg.style.color = "#a92a1f";
        pwdMsg.textContent = err.message;
      }
    });
  }

  // 6) Logout
  const btnLogout = document.getElementById("logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        if (window.Auth && typeof Auth.signOut === "function") {
          await Auth.signOut("./login.html");
        } else {
          await supabase.auth.signOut();
          location.href = "./login.html";
        }
      } catch (err) {
        console.error("Erro no logout", err);
        location.href = "./login.html";
      }
    });
  }
})();
