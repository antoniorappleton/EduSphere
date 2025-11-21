// public/js/aluno.js
// Script principal do painel do ALUNO

(async () => {
  // -------------------------------------------------------------
  // 1) Verificar autenticação do utilizador
  // -------------------------------------------------------------
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    console.error("Erro a obter utilizador atual", userErr);
    location.href = "./login.html";
    return;
  }

  // -------------------------------------------------------------
  // 2) Helpers de UI (toast / feedback visual)
  // -------------------------------------------------------------
  const toastEl = document.getElementById("toast");

  /**
   * Mostra uma mensagem flutuante (toast) no ecrã
   * @param {string} msg - texto da mensagem
   * @param {"info"|"success"|"error"} type - tipo de feedback (classe CSS)
   */
  function showToast(msg, type = "info") {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = `toast toast--${type}`;
    toastEl.style.opacity = "1";
    setTimeout(() => {
      toastEl.style.opacity = "0";
    }, 3000);
  }

  // -------------------------------------------------------------
  // 3) Agenda – próximas explicações (lista rápida)
  //    Fonte: view v_explicacoes_detalhe (RLS filtra por aluno)
  // -------------------------------------------------------------
  const { data: agenda, error: agendaErr } = await supabase
    .from("v_explicacoes_detalhe")
    .select("*")
    .order("data", { ascending: true })
    .order("hora", { ascending: true });

  const ag = document.getElementById("agenda");
  const agendaData = agenda || [];

  if (ag) {
    if (agendaErr) {
      console.error("Erro a carregar agenda", agendaErr);
      ag.innerHTML = "<p>Erro ao carregar agenda.</p>";
    } else {
      ag.innerHTML =
        agendaData
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
  }

  // -------------------------------------------------------------
  // 4) Calendário interativo de explicações (semana/mês)
  //    Usa os mesmos dados de agenda (agendaData)
  // -------------------------------------------------------------
  const calMesTitulo = document.getElementById("calMesTitulo");
  const calList = document.getElementById("calList");
  const calPrev = document.getElementById("calPrev");
  const calNext = document.getElementById("calNext");

  let currentMonthOffset = 0; // 0 = mês atual, -1 = mês anterior, +1 = próximo mês

  /**
   * Devolve a chave "YYYY-MM" a partir da string de data (x.data)
   */
  function getMonthKey(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  /**
   * Renderiza o calendário para o mês em currentMonthOffset
   */
  function renderCalendario() {
    if (!calList || !calMesTitulo) return;

    const hoje = new Date();
    const target = new Date(
      hoje.getFullYear(),
      hoje.getMonth() + currentMonthOffset,
      1
    );
    const key = `${target.getFullYear()}-${String(
      target.getMonth() + 1
    ).padStart(2, "0")}`;

    const intl = new Intl.DateTimeFormat("pt-PT", {
      month: "long",
      year: "numeric",
    });
    calMesTitulo.textContent = intl.format(target);

    const items = agendaData.filter((x) => getMonthKey(x.data) === key);

    if (!items.length) {
      calList.innerHTML = "<li>Sem explicações neste mês.</li>";
      return;
    }

    calList.innerHTML = items
      .map((x) => {
        const dataISO = `${x.data}T${x.hora}`;
        const dataSessao = new Date(dataISO);
        const passada = dataSessao < new Date();

        return `
        <li class="cal-item">
          <div class="cal-item-main">
            <strong>${x.data}</strong> • ${x.hora} • ${x.local ?? ""}
          </div>
          <div class="cal-item-actions">
            <button
              class="button small btn-presenca"
              data-id="${x.id}"
              ${passada ? "disabled" : ""}
            >
              ${passada ? "Sessão passada" : "✅ Confirmar presença"}
            </button>
          </div>
        </li>
      `;
      })
      .join("");

    // Ligar botão de confirmação de presença
    calList.querySelectorAll(".btn-presenca").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const idExplicacao = e.currentTarget.dataset.id;
        if (!idExplicacao) return;

        try {
          // Atualiza a explicação para indicar confirmação de presença
          // NOTA: RLS deve garantir que o aluno só atualiza as suas explicações
          const { error } = await supabase
            .from("explicacoes")
            .update({ presenca_confirmada: true })
            .eq("id", idExplicacao);

          if (error) throw error;

          showToast("Presença confirmada!", "success");
          e.currentTarget.disabled = true;
          e.currentTarget.textContent = "Confirmado";
        } catch (err) {
          console.error(err);
          showToast("Não foi possível confirmar a presença.", "error");
        }
      });
    });
  }

  if (calPrev && calNext) {
    calPrev.addEventListener("click", () => {
      currentMonthOffset -= 1;
      renderCalendario();
    });

    calNext.addEventListener("click", () => {
      currentMonthOffset += 1;
      renderCalendario();
    });
  }

  // Primeiro render do calendário
  renderCalendario();

  // 5) Pagamentos + Resumo rápido (próxima mensalidade)
  const { data: pagos, error: pagosErr } = await supabase
    .from("v_pagamentos_detalhe")
    .select("*")
    .order("ano", { ascending: true })
    .order("mes", { ascending: true });

  const tbody = document.querySelector("#tabPag tbody");

  // Elementos do "Resumo rápido"
  const resumoMesLabel = document.getElementById("resumoMesLabel");
  const resumoEstado = document.getElementById("resumoEstado");
  const resumoValor = document.getElementById("resumoValor");
  const resumoHint = document.getElementById("resumoHint");
  const btnFat = document.getElementById("btnDownloadFatura");

  let ultimoPagamentoSelecionado = null; // será usado para o botão de fatura

  if (tbody) {
    if (pagosErr) {
      console.error("Erro a carregar pagamentos", pagosErr);
      tbody.innerHTML =
        '<tr><td colspan="4">Erro ao carregar pagamentos.</td></tr>';
    } else {
      const lista = pagos || [];

      // Tabela de movimentos
      tbody.innerHTML =
        lista
          .map(
            (p) => `
          <tr data-ano="${p.ano}" data-mes="${p.mes}">
            <td>${String(p.mes).padStart(2, "0")}/${p.ano}</td>
            <td>${Number(p.valor_previsto).toFixed(2)} €</td>
            <td>${Number(p.valor_pago).toFixed(2)} €</td>
            <td><span class="badge ${p.estado}">${p.estado}</span></td>
          </tr>
        `
          )
          .join("") || '<tr><td colspan="4">Sem movimentos.</td></tr>';

      // ------- Cálculo do "próximo" pagamento e total em falta -------

      // Prioridade: 1) EM_ATRASO  2) PARCIAL  3) último mês registado
      const emAtraso = lista.filter((p) => p.estado === "EM_ATRASO");
      const parcial = lista.filter((p) => p.estado === "PARCIAL");
      let alvo = null;

      // Total global em falta (todas as mensalidades)
      let totalEmFalta = 0;
      lista.forEach((p) => {
        const previsto = Number(p.valor_previsto) || 0;
        const pago = Number(p.valor_pago) || 0;
        const falta = Math.max(previsto - pago, 0);
        totalEmFalta += falta;
      });

      const ordenar = (a, b) => {
        if (a.ano === b.ano) return a.mes - b.mes;
        return a.ano - b.ano;
      };

      if (emAtraso.length) {
        alvo = emAtraso.sort(ordenar)[0];
        if (resumoHint) {
          resumoHint.textContent = `Tens mensalidades em atraso. Em falta: € ${totalEmFalta.toFixed(
            2
          )}.`;
        }
      } else if (parcial.length) {
        alvo = parcial.sort(ordenar)[0];
        if (resumoHint) {
          resumoHint.textContent = `Tens uma mensalidade paga parcialmente. Em falta: € ${totalEmFalta.toFixed(
            2
          )}.`;
        }
      } else if (lista.length) {
        alvo = lista.sort(ordenar)[lista.length - 1];
        if (resumoHint) {
          if (totalEmFalta > 0) {
            resumoHint.textContent = `Todas as mensalidades estão registadas, mas ainda há € ${totalEmFalta.toFixed(
              2
            )} por pagar.`;
          } else {
            resumoHint.textContent = "Todas as mensalidades estão em dia. ✅";
          }
        }
      } else {
        if (resumoHint) {
          resumoHint.textContent =
            "Ainda não existem mensalidades registadas para a tua conta.";
        }
      }

      if (alvo) {
        if (resumoMesLabel) {
          resumoMesLabel.textContent = `${String(alvo.mes).padStart(2, "0")}/${
            alvo.ano
          }`;
        }
        if (resumoEstado) {
          resumoEstado.textContent = alvo.estado;
          resumoEstado.className = `resumo-badge badge ${alvo.estado}`;
        }
        if (resumoValor) {
          resumoValor.textContent = `${Number(alvo.valor_previsto).toFixed(
            2
          )} €`;
        }

        ultimoPagamentoSelecionado = alvo;
        if (btnFat) btnFat.disabled = false;
      } else {
        if (resumoMesLabel) resumoMesLabel.textContent = "—";
        if (resumoEstado) resumoEstado.textContent = "—";
        if (resumoValor) resumoValor.textContent = "—";
        if (btnFat) btnFat.disabled = true;
      }
    }
  }

  // -------------------------------------------------------------
  // 5.1) Botão de download de fatura (stub)
  //      Aqui só mostramos UI e feedback; a lógica real depende
  //      de como as faturas forem guardadas no Storage/BD.
  // -------------------------------------------------------------
  if (btnFat) {
    btnFat.addEventListener("click", () => {
      if (!ultimoPagamentoSelecionado) {
        showToast("Não há mensalidade selecionada.", "info");
        return;
      }

      // TODO: Implementar integração com Storage / tabela de faturas
      // Exemplo futuro:
      // - Criar signed URL no bucket "faturas"
      // - Abrir a fatura correspondente a (ano, mes, aluno)
      showToast(
        "Download de faturas ainda não se encontra disponível.",
        "info"
      );
    });
  }

  // -------------------------------------------------------------
  // 6) Exercícios – lista de ficheiros/links enviados pelo explicador
  //    Fonte: tabela exercicios (RLS filtra só do aluno atual)
  // -------------------------------------------------------------
  const { data: exs, error: exErr } = await supabase
    .from("exercicios")
    .select("*")
    .order("created_at", { ascending: false });

  const exList = document.getElementById("exlist");

  if (exList) {
    if (exErr) {
      console.error("Erro a carregar exercícios", exErr);
      exList.innerHTML = "<li>Erro ao carregar exercícios.</li>";
    } else {
      const items = await Promise.all(
        (exs || []).map(async (ex) => {
          let href = ex.url;

          // Se não for URL completo, assume ficheiro no Storage "exercicios"
          if (!href || /^https?:\/\//.test(href) === false) {
            try {
              const { data: s, error: sErr } = await supabase.storage
                .from("exercicios")
                .createSignedUrl(ex.url, 3600);

              if (sErr) {
                console.error("Erro a criar signed URL", sErr);
              }
              href = s?.signedUrl ?? "#";
            } catch (e) {
              console.error("Erro inesperado ao gerar link de exercício", e);
              href = "#";
            }
          }

          return `<li>
            <a href="${href}" target="_blank" rel="noopener">
              ${ex.nome}
            </a>
            <small>(${ex.tipo || "ficheiro"})</small>
          </li>`;
        })
      );

      exList.innerHTML = items.join("") || "<li>Sem exercícios.</li>";
    }
  }

  // -------------------------------------------------------------
  // 7) Área de mensagens – chat simples com o explicador
  //    Fonte: tabela mensagens (RLS só devolve mensagens deste aluno)
  // -------------------------------------------------------------
  const msgList = document.getElementById("msgList");
  const fMsg = document.getElementById("fMsg");
  const msgStatus = document.getElementById("msgStatus");

  /**
   * Carrega o histórico de mensagens aluno ⇄ explicador
   */
  async function loadMensagens() {
    if (!msgList) return;

    try {
      const { data, error } = await supabase
        .from("mensagens")
        .select("*")
        .order("criado_em", { ascending: true });

      if (error) throw error;

      if (!data || !data.length) {
        msgList.innerHTML =
          "<p>Sem mensagens ainda👋</p>";
        return;
      }

      msgList.innerHTML = data
        .map(
          (m) => `
        <div class="msg-item msg-item--${
          m.enviado_por === "ALUNO" ? "self" : "other"
        }">
          <p class="msg-body">${m.corpo}</p>
          <span class="msg-meta">
            ${m.enviado_por === "ALUNO" ? "Tu" : "Explicador"} • ${new Date(
            m.criado_em
          ).toLocaleString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
          </span>
        </div>
      `
        )
        .join("");
    } catch (err) {
      console.error(err);
      msgList.innerHTML = "<p>Erro ao carregar mensagens.</p>";
    }
  }

  // Envio de nova mensagem
  if (fMsg) {
    fMsg.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (msgStatus) msgStatus.textContent = "";

      const texto = e.target.msg.value.trim();
      if (!texto) return;

      try {
        // Insere uma nova mensagem enviada pelo ALUNO.
        // NOTA: idealmente a BD preenche aluno_id/explicador_id
        // via RLS/trigger, usando auth.uid().
        const { error } = await supabase.from("mensagens").insert({
          corpo: texto,
          enviado_por: "ALUNO",
        });

        if (error) throw error;

        e.target.reset();
        if (msgStatus) {
          msgStatus.style.color = "#126b3a";
          msgStatus.textContent = "Mensagem enviada.";
        }
        showToast("Mensagem enviada ao explicador.", "success");
        await loadMensagens();
      } catch (err) {
        console.error(err);
        if (msgStatus) {
          msgStatus.style.color = "#a92a1f";
          msgStatus.textContent = "Não foi possível enviar a mensagem.";
        }
        showToast("Erro ao enviar mensagem.", "error");
      }
    });
  }

  // Carregar mensagens na entrada
  await loadMensagens();

  // -------------------------------------------------------------
  // 8) Preferências de notificações (email)
  //    Guarda preferência numa tabela notificacoes_aluno (RLS por user_id)
  // -------------------------------------------------------------
  const chkEmailNotif = document.getElementById("chkEmailNotif");

  if (chkEmailNotif) {
    // Opcional: carregar o estado inicial das notificações
    try {
      const { data: notifData, error: notifErr } = await supabase
        .from("notificacoes_aluno")
        .select("email_enabled")
        .single();

      if (!notifErr && notifData) {
        chkEmailNotif.checked = !!notifData.email_enabled;
      }
    } catch (err) {
      console.warn(
        "Não foi possível carregar preferências de notificações.",
        err
      );
    }

    // Ao alterar o toggle, guardar preferência
    chkEmailNotif.addEventListener("change", async (e) => {
      try {
        const enabled = e.target.checked;

        const { error } = await supabase.from("notificacoes_aluno").upsert(
          {
            user_id: user.id,
            email_enabled: enabled,
          },
          { onConflict: "user_id" }
        );

        if (error) throw error;

        showToast(
          enabled
            ? "Notificações por email ativas."
            : "Notificações por email desativadas.",
          "success"
        );
      } catch (err) {
        console.error(err);
        showToast("Não foi possível atualizar as notificações.", "error");
        // reverter estado do checkbox
        e.target.checked = !e.target.checked;
      }
    });
  }

  // -------------------------------------------------------------
  // 9) Alterar palavra-passe (aluno)
  // -------------------------------------------------------------
  const fPwd = document.getElementById("fPwd");

  if (fPwd) {
    fPwd.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pwdMsg = document.getElementById("pwdMsg");
      if (pwdMsg) pwdMsg.textContent = "";

      const newPwd = e.target.pwd.value;

      try {
        const { error: upErr } = await supabase.auth.updateUser({
          password: newPwd,
        });
        if (upErr) throw upErr;

        if (pwdMsg) {
          pwdMsg.style.color = "#126b3a";
          pwdMsg.textContent = "Palavra-passe atualizada.";
        }
        e.target.reset();
        showToast("Palavra-passe atualizada com sucesso.", "success");
      } catch (err) {
        if (pwdMsg) {
          pwdMsg.style.color = "#a92a1f";
          pwdMsg.textContent = err.message;
        }
        showToast("Erro ao atualizar palavra-passe.", "error");
      }
    });
  }

  // -------------------------------------------------------------
  // 10) Logout do aluno
  // -------------------------------------------------------------
  const btnLogout = document.getElementById("logout");

  if (btnLogout) {
    btnLogout.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        // Compatibilidade com helper Auth (se existir)
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
