// @ts-nocheck
// Edge Function: expl-alunos
// Ações suportadas:
//   - list_alunos
//   - create_aluno
//   - update_aluno
//   - iniciar_faturacao_aluno
//   - registar_pagamento_aluno
//   - update_pagamento_aluno
//   - list_sessoes_aluno
//   - list_sessoes_explicador
//   - upsert_sessao_aluno
//   - delete_sessao_aluno
//   - upsert_pagamento_aluno
//   - delete_pagamento_aluno
//   - set_mensalidade_avisada
//   - get_relatorios
//   - generate_monthly_billing
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10?target=deno";
const URL = Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!URL || !ANON || !SVC) {
  throw new Error("Faltam SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
}
function cors(origin = "*") {
  const o = origin || "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Vary": "Origin",
    // Deixa passar todos os headers pedidos no preflight
    "Access-Control-Allow-Headers": "*",
    // Podes permitir também GET se um dia usares
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };
}
serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "*";
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: cors(origin)
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Método não suportado. Usa POST."
    }), {
      status: 405,
      headers: cors(origin)
    });
  }
  try {
    // 1) Extrair token do header Authorization
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    if (!token) {
      console.error("Authorization header em falta ou sem Bearer token");
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: cors(origin)
      });
    }
    // 2) Cliente autenticado (usa ANON + token)
    const userClient = createClient(URL, ANON, {
      auth: {
        persistSession: false
      }
    });
    const { data: { user: me }, error: meErr } = await userClient.auth.getUser(token);
    if (meErr || !me) {
      console.error("auth.getUser error", meErr);
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: cors(origin)
      });
    }
    const myUid = me.id;
    // 3) Service client (ignora RLS)
    const svc = createClient(URL, SVC, {
      auth: {
        persistSession: false
      }
    });
    // 4) Encontrar o explicador na tabela "explicadores"
    const { data: explRow, error: explErr } = await svc.from("explicadores").select("id_explicador").eq("user_id", myUid).maybeSingle();
    if (explErr) {
      console.error("Erro a carregar explicador", explErr);
      return new Response(JSON.stringify({
        error: explErr.message
      }), {
        status: 400,
        headers: cors(origin)
      });
    }
    if (!explRow) {
      console.error("Nenhum explicador associado a este user_id", myUid);
      return new Response(JSON.stringify({
        error: "Explicador não encontrado para este utilizador"
      }), {
        status: 403,
        headers: cors(origin)
      });
    }
    const myExplId = explRow.id_explicador;
    // 5) Ler ação/payload do body
    const { action, payload } = await req.json().catch((e) => {
      console.error("Body JSON inválido", e);
      return { action: null, payload: null };
    });

    console.log(`Action: ${action}`, payload);

    if (!action) {
      return new Response(JSON.stringify({ error: "Campo 'action' em falta" }), {
        status: 400,
        headers: cors(origin),
      });
    }
    // ---------- Helpers de datas para gerar sessões recorrentes ----------
    function toISODate(d) {
      return d.toISOString().slice(0, 10); // YYYY-MM-DD
    }
    function addDays(d, days) {
      const nd = new Date(d);
      nd.setDate(nd.getDate() + days);
      return nd;
    }
    // mapeia "Segunda", "Terça", "Seg", "Ter", ... → 0..6 (JS getDay)
    function mapDiaSemanaToJsIndex(dia) {
      if (!dia) return null;
      const v = dia.trim().toLowerCase();
      if (v.startsWith("seg")) return 1;
      if (v.startsWith("ter")) return 2;
      if (v.startsWith("qua")) return 3;
      if (v.startsWith("qui")) return 4;
      if (v.startsWith("sex")) return 5;
      if (v.startsWith("sáb") || v.startsWith("sab")) return 6;
      if (v.startsWith("dom")) return 0;
      return null;
    }
    // dado um dia de início e o índice JS do dia-semana alvo (0..6),
    // devolve a primeira data >= inicio que calhe nesse dia-semana
    function proximaDataDoDiaSemana(inicio, targetDow) {
      const d = new Date(inicio);
      const currentDow = d.getDay(); // 0..6
      let diff = targetDow - currentDow;
      if (diff < 0) diff += 7; // salta para a próxima semana se já passou
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    /* ======================================================
   HELPER: carregar aluno do explicador
   ====================================================== */ async function getAlunoDoExpl(alunoId) {
      const { data, error } = await svc.from("alunos").select(`
          id_aluno,
          id_explicador,
          user_id,
          nome,
          apelido,
          valor_explicacao,
          sessoes_mes,
          faturacao_ativa,
          faturacao_inicio,
          dia_pagamento,
          dia_semana_preferido
        `).eq("id_aluno", alunoId).eq("id_explicador", myExplId).maybeSingle();
      if (error) {
        console.error("Erro a carregar aluno", error);
        throw new Error(error.message);
      }
      if (!data) {
        throw new Error("Aluno não encontrado para este explicador.");
      }
      return data;
    }
    /* =======================
     LISTAR ALUNOS
     ======================= */
    if (action === "list_alunos") {
      // 1) Buscar alunos base
      const { data: alunos, error } = await svc
        .from("alunos")
        .select(`
          id_aluno,
          nome,
          apelido,
          telemovel,
          ano,
          idade,
          dia_semana_preferido,
          valor_explicacao,
          sessoes_mes,
          nome_pai_cache,
          contacto_pai_cache,
          email,
          id_explicador,
          user_id,
          is_active,
          username,
          faturacao_ativa,
          faturacao_inicio,
          dia_pagamento,
          mensalidade_avisada
        `)
        .eq("id_explicador", myExplId)
        .order("nome", { ascending: true });

      if (error) {
        console.error("Erro em list_alunos", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: cors(origin) },
        );
      }

      const lista = alunos ?? [];
      if (!lista.length) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: cors(origin),
        });
      }

      const idsAlunos = lista
        .map((a) => a.id_aluno)
        .filter((v) => v != null);

      const agora = new Date();
      const anoAtual = agora.getFullYear();
      const mesAtual = agora.getMonth() + 1;

      // -------------------------------------------------
      // 2) Pagamentos do mês atual (estado_mensalidade)
      // -------------------------------------------------
      const pagamentosPorAluno = new Map<string, any>();

      if (idsAlunos.length) {
        const { data: pags, error: pagErr } = await svc
          .from("v_pagamentos_detalhe")
          .select("id_aluno, ano, mes, estado")
          .eq("id_explicador", myExplId)
          .eq("ano", anoAtual)
          .eq("mes", mesAtual)
          .in("id_aluno", idsAlunos);

        if (pagErr) {
          console.error("list_alunos / v_pagamentos_detalhe", pagErr);
        } else if (pags) {
          for (const p of pags) {
            const key = String(p.id_aluno);
            // assumimos 1 registo por mês/aluno; se houver vários, fica o último que passar aqui
            pagamentosPorAluno.set(key, p);
          }
        }
      }

      // -------------------------------------------------
      // 3) Próxima sessão de cada aluno (proxima_sessao_*)
      // -------------------------------------------------
      const proxSessaoPorAluno = new Map<string, any>();

      if (idsAlunos.length) {
        const hojeIso = new Date().toISOString().slice(0, 10);

        const { data: sessoes, error: sesErr } = await svc
          .from("v_sessoes_detalhe")
          .select("id_aluno, data, hora_inicio, estado")
          .eq("id_explicador", myExplId)
          .gte("data", hojeIso);

        if (sesErr) {
          console.error("list_alunos / v_sessoes_detalhe", sesErr);
        } else if (sessoes) {
          for (const s of sessoes) {
            const key = String(s.id_aluno);
            const d = new Date(s.data);
            if (!d || isNaN(d.getTime())) continue;
            if (s.estado === "CANCELADA") continue;

            const atual = proxSessaoPorAluno.get(key);
            if (!atual) {
              proxSessaoPorAluno.set(key, s);
            } else {
              const dAtual = new Date(atual.data);
              // fica a sessão mais próxima (mais cedo)
              if (
                d < dAtual ||
                (d.getTime() === dAtual.getTime() &&
                  (s.hora_inicio || "") < (atual.hora_inicio || ""))
              ) {
                proxSessaoPorAluno.set(key, s);
              }
            }
          }
        }
      }

      // -------------------------------------------------
      // 4) Enriquecer alunos com:
      //    - estado_mensalidade
      //    - proxima_mensalidade
      //    - proxima_sessao_data / proxima_sessao_hora
      // -------------------------------------------------
      const enriquecidos = lista.map((a: any) => {
        const key = String(a.id_aluno);

        const pag = pagamentosPorAluno.get(key);
        const sess = proxSessaoPorAluno.get(key) || null;

        // Data da mensalidade deste mês (ex: dia_pagamento = 10 → 10/mesAtual)
        const diaPag = a.dia_pagamento || 1;
        const dataMensal = new Date(anoAtual, mesAtual - 1, diaPag);
        const dataMensalIso = isNaN(dataMensal.getTime())
          ? null
          : dataMensal.toISOString().slice(0, 10);

        return {
          ...a,
          estado_mensalidade: pag?.estado ?? "PENDENTE",
          proxima_mensalidade: dataMensalIso,
          proxima_sessao_data: sess?.data ?? null,
          proxima_sessao_hora: sess?.hora_inicio ?? null,
        };
      });

      return new Response(JSON.stringify(enriquecidos), {
        status: 200,
        headers: cors(origin),
      });
    }

    /* =======================
       SET MENSALIDADE AVISADA
       payload: { aluno_id, avisado }
       ======================= */ if (action === "set_mensalidade_avisada") {
      const p = payload || {};
      const alunoId = String(p.aluno_id || "").trim();
      const avisado = !!p.avisado;

      if (!alunoId) {
        return new Response(
          JSON.stringify({ error: "aluno_id em falta" }),
          { status: 400, headers: cors(origin) },
        );
      }

      // garantir que o aluno pertence ao explicador autenticado
      await getAlunoDoExpl(alunoId);

      const { error: upErr } = await svc
        .from("alunos")
        .update({ mensalidade_avisada: avisado })
        .eq("id_aluno", alunoId)
        .eq("id_explicador", myExplId);

      if (upErr) {
        console.error("Erro em set_mensalidade_avisada", upErr);
        return new Response(
          JSON.stringify({ error: upErr.message }),
          { status: 400, headers: cors(origin) },
        );
      }

      return new Response(
        JSON.stringify({ ok: true, aluno_id: alunoId, avisado }),
        { status: 200, headers: cors(origin) },
      );
    }

    /* =======================
  Eliminar aluno
   ======================= */ if (action === "delete_aluno") {
      const p = payload || {};
      const alunoId = String(p.id_aluno || "").trim();
      if (!alunoId) {
        return new Response(JSON.stringify({
          error: "id_aluno em falta"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      // 1) garantir que este aluno é mesmo deste explicador
      const aluno = await getAlunoDoExpl(alunoId);
      // 2) apagar dependências (pagamentos, sessões, app_users)
      await svc.from("pagamentos").delete().eq("id_aluno", alunoId).eq("id_explicador", myExplId);
      await svc.from("sessoes_explicacao").delete().eq("id_aluno", alunoId).eq("id_explicador", myExplId);
      await svc.from("app_users").delete().eq("user_id", aluno.user_id).eq("role", "aluno");
      // 3) apagar aluno
      await svc.from("alunos").delete().eq("id_aluno", alunoId).eq("id_explicador", myExplId);
      // 4) apagar utilizador AUTH (para o email poder ser reutilizado)
      const { error: delErr } = await svc.auth.admin.deleteUser(aluno.user_id);
      if (delErr) {
        console.error("delete_aluno: erro ao apagar user auth", delErr);
        return new Response(JSON.stringify({
          error: delErr.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      // ✅ FECHO DO BLOCO delete_aluno
      return new Response(JSON.stringify({
        ok: true
      }), {
        status: 200,
        headers: cors(origin)
      });
    }
    /* =======================
       CRIAR ALUNO
       ======================= */ if (action === "create_aluno") {
      const p = payload || {};
      const nome = (p.nome || "").trim();
      const email = (p.email || "").trim();
      const password = String(p.password || "");
      if (!nome || !email || !password) {
        return new Response(JSON.stringify({
          error: "nome, email e password são obrigatórios"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      // 1) Criar utilizador Auth para o aluno
      const { data: au, error: authErr } = await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (authErr) {
        console.error("Erro em createUser (aluno)", authErr);
        return new Response(JSON.stringify({
          error: authErr.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      const alunoUid = au?.user?.id;
      if (!alunoUid) {
        console.error("createUser não devolveu user.id");
        return new Response(JSON.stringify({
          error: "createUser não devolveu user.id"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      // 2) Inserir em "alunos"
      const { data: row, error: insErr } = await svc.from("alunos").insert({
        id_explicador: myExplId,
        user_id: alunoUid,
        nome,
        apelido: p.apelido?.trim() || null,
        telemovel: p.telemovel?.trim() || null,
        ano: p.ano != null && p.ano !== "" ? Number(p.ano) : null,
        idade: p.idade != null && p.idade !== "" ? Number(p.idade) : null,
        dia_semana_preferido: p.dia_semana_preferido?.trim() || null,
        valor_explicacao: p.valor_explicacao != null && p.valor_explicacao !== "" ? Number(p.valor_explicacao) : null,
        sessoes_mes: p.sessoes_mes != null && p.sessoes_mes !== "" ? Number(p.sessoes_mes) : null,
        nome_pai_cache: p.nome_pai_cache?.trim() || null,
        contacto_pai_cache: p.contacto_pai_cache?.trim() || null,
        email,
        username: p.username?.trim() || null,
        is_active: p.is_active ?? true,
        faturacao_ativa: false,
        faturacao_inicio: null,
        dia_pagamento: null
      }).select("id_aluno").single();
      if (insErr) {
        console.error("Erro ao inserir em alunos", insErr);
        await svc.auth.admin.deleteUser(alunoUid).catch(() => { });
        return new Response(JSON.stringify({
          error: insErr.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      // 3) Registo em app_users (role = aluno)
      const { error: roleInsErr } = await svc.from("app_users").insert({
        user_id: alunoUid,
        role: "aluno",
        ref_id: row.id_aluno
      });
      if (roleInsErr) {
        console.error("Erro ao inserir em app_users (aluno)", roleInsErr);
        await svc.from("alunos").delete().eq("id_aluno", row.id_aluno).catch(() => { });
        await svc.auth.admin.deleteUser(alunoUid).catch(() => { });
        return new Response(JSON.stringify({
          error: roleInsErr.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      return new Response(JSON.stringify({
        id_aluno: row.id_aluno
      }), {
        status: 201,
        headers: cors(origin)
      });
    }
    /* =======================
       ATUALIZAR ALUNO
       ======================= */ if (action === "update_aluno") {
      const p = payload || {};
      const id_aluno = p.id_aluno;
      // 1) validar id_aluno (UUID string)
      if (!id_aluno || typeof id_aluno !== "string") {
        return new Response(JSON.stringify({
          error: "id_aluno em falta ou inválido"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      // 2) garantir que o aluno existe e pertence a ESTE explicador
      const { data: alunoRow, error: alunoErr } = await svc.from("alunos").select("id_aluno, id_explicador, user_id, email").eq("id_aluno", id_aluno).maybeSingle();
      if (alunoErr) {
        console.error("update_aluno: erro ao carregar aluno", alunoErr);
        return new Response(JSON.stringify({
          error: alunoErr.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      if (!alunoRow) {
        return new Response(JSON.stringify({
          error: "Aluno não encontrado"
        }), {
          status: 404,
          headers: cors(origin)
        });
      }
      if (alunoRow.id_explicador !== myExplId) {
        return new Response(JSON.stringify({
          error: "Forbidden"
        }), {
          status: 403,
          headers: cors(origin)
        });
      }
      // 3) preparar dados para UPDATE na tabela alunos
      const updates = {};
      const trimOrNull = (v) => typeof v === "string" ? v.trim() || null : v === "" ? null : v;
      if (typeof p.nome !== "undefined") updates.nome = trimOrNull(p.nome);
      if (typeof p.apelido !== "undefined") updates.apelido = trimOrNull(p.apelido);
      if (typeof p.telemovel !== "undefined") updates.telemovel = trimOrNull(p.telemovel);
      if (typeof p.ano !== "undefined") {
        updates.ano = p.ano === null || p.ano === "" ? null : Number(p.ano);
      }
      if (typeof p.idade !== "undefined") {
        updates.idade = p.idade === null || p.idade === "" ? null : Number(p.idade);
      }
      if (typeof p.dia_semana_preferido !== "undefined") {
        updates.dia_semana_preferido = trimOrNull(p.dia_semana_preferido);
      }
      if (typeof p.valor_explicacao !== "undefined") {
        updates.valor_explicacao = p.valor_explicacao === null || p.valor_explicacao === "" ? null : Number(p.valor_explicacao);
      }
      if (typeof p.sessoes_mes !== "undefined") {
        updates.sessoes_mes = p.sessoes_mes === null || p.sessoes_mes === "" ? null : Number(p.sessoes_mes);
      }
      if (typeof p.nome_pai_cache !== "undefined") {
        updates.nome_pai_cache = trimOrNull(p.nome_pai_cache);
      }
      if (typeof p.contacto_pai_cache !== "undefined") {
        updates.contacto_pai_cache = trimOrNull(p.contacto_pai_cache);
      }
      if (typeof p.username !== "undefined") {
        updates.username = trimOrNull(p.username);
      }
      if (typeof p.is_active !== "undefined") {
        updates.is_active = !!p.is_active;
      }
      // 4) tratar email / password também na AUTH se for preciso
      let newEmail;
      if (typeof p.email !== "undefined") {
        const e = String(p.email || "").trim();
        updates.email = e || null;
        if (e && e !== alunoRow.email) {
          newEmail = e;
        }
      }
      const newPassword = typeof p.password === "string" && p.password.trim().length >= 6 ? p.password.trim() : undefined;
      // 5) UPDATE na tabela alunos
      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await svc.from("alunos").update(updates).eq("id_aluno", id_aluno);
        if (updErr) {
          console.error("update_aluno: erro no update alunos", updErr);
          return new Response(JSON.stringify({
            error: updErr.message
          }), {
            status: 400,
            headers: cors(origin)
          });
        }
      }
      // 6) Atualizar utilizador AUTH (email e/ou password)
      if (newEmail || newPassword) {
        const authUpdate = {};
        if (newEmail) authUpdate.email = newEmail;
        if (newPassword) authUpdate.password = newPassword;
        const { error: authUpdErr } = await svc.auth.admin.updateUserById(alunoRow.user_id, authUpdate);
        if (authUpdErr) {
          console.error("update_aluno: erro ao atualizar Auth", authUpdErr);
          return new Response(JSON.stringify({
            error: authUpdErr.message
          }), {
            status: 400,
            headers: cors(origin)
          });
        }
      }
      return new Response(JSON.stringify({
        id_aluno
      }), {
        status: 200,
        headers: cors(origin)
      });
    }
    /* =======================
        INICIAR FATURAÇÃO DO ALUNO
        payload: { aluno_id, ano, mes, dia_pagamento }
        ======================= */ if (action === "iniciar_faturacao_aluno") {
      const p = payload || {};
      const alunoId = String(p.aluno_id || "").trim();
      const ano1 = Number(p.ano);
      const mes1 = Number(p.mes);
      const diaPag = p.dia_pagamento != null ? Number(p.dia_pagamento) : 1;
      // validações básicas
      if (!alunoId || !ano1 || !mes1 || mes1 < 1 || mes1 > 12) {
        return new Response(JSON.stringify({
          error: "aluno_id, ano e mes (1-12) são obrigatórios"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      if (isNaN(diaPag) || diaPag < 1 || diaPag > 31) {
        return new Response(JSON.stringify({
          error: "dia_pagamento deve ser entre 1 e 31"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      // garante que o aluno é mesmo deste explicador + lê dados base
      const aluno = await getAlunoDoExpl(alunoId);
      const valorExp = Number(aluno.valor_explicacao) || 0;
      const sessoesMes = Number(aluno.sessoes_mes) || 0;
      const valorPrevDefault = valorExp * sessoesMes; // pode ser 0
      // primeiro dia do mês/ano escolhidos (YYYY-MM-DD)
      const inicio = new Date(ano1, mes1 - 1, 1).toISOString().slice(0, 10);
      // 1) Atualizar o aluno para marcar faturação ativa
      const { error: upAlunoErr } = await svc.from("alunos").update({
        faturacao_ativa: true,
        faturacao_inicio: inicio,
        dia_pagamento: diaPag
      }).eq("id_aluno", alunoId).eq("id_explicador", myExplId);
      if (upAlunoErr) {
        console.error("Erro ao atualizar aluno (faturacao_ativa)", upAlunoErr);
        return new Response(JSON.stringify({
          error: upAlunoErr.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      // 2) Criar/ajustar o registo de pagamentos desse mês
      const { data: pagRow, error: pagErr } = await svc.from("pagamentos").select("valor_previsto, valor_pago").eq("id_aluno", alunoId).eq("id_explicador", myExplId).eq("ano", ano1).eq("mes", mes1).maybeSingle();
      if (pagErr) {
        console.error("Erro ao ler pagamentos em iniciar_faturacao_aluno", pagErr);
        return new Response(JSON.stringify({
          error: pagErr.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      if (!pagRow) {
        // ainda não havia registo para esse mês -> criar
        const estadoInicial = valorPrevDefault <= 0 ? "PAGO" : "PENDENTE"; // se não há valor previsto, considera “sem dívida”
        const { error: insPagErr } = await svc.from("pagamentos").insert({
          id_aluno: alunoId,
          id_explicador: myExplId,
          ano: ano1,
          mes: mes1,
          valor_previsto: valorPrevDefault,
          valor_pago: 0,
          data_pagamento: null,
          estado: estadoInicial
        });
        if (insPagErr) {
          console.error("Erro a criar pagamento inicial", insPagErr);
          return new Response(JSON.stringify({
            error: insPagErr.message
          }), {
            status: 400,
            headers: cors(origin)
          });
        }
      } else {
        // já existe registo para esse mês -> atualizar valor_previsto e estado
        const atualPago = Number(pagRow.valor_pago) || 0;
        const novoPrevisto = valorPrevDefault || Number(pagRow.valor_previsto) || 0;
        let novoEstado = "PENDENTE";
        if (atualPago > 0 && atualPago < novoPrevisto) {
          novoEstado = "PARCIAL";
        }
        if (novoPrevisto > 0 && atualPago >= novoPrevisto) {
          novoEstado = "PAGO";
        }
        if (novoPrevisto === 0 && atualPago === 0) {
          novoEstado = "PAGO"; // sem valor a pagar
        }
        const { error: updPagErr } = await svc.from("pagamentos").update({
          valor_previsto: novoPrevisto,
          estado: novoEstado
        }).eq("id_aluno", alunoId).eq("id_explicador", myExplId).eq("ano", ano1).eq("mes", mes1);
        if (updPagErr) {
          console.error("Erro a atualizar pagamento inicial", updPagErr);
          return new Response(JSON.stringify({
            error: updPagErr.message
          }), {
            status: 400,
            headers: cors(origin)
          });
        }
      }
      // 3) Gerar sessões recorrentes para o calendário
      try {
        const targetDow = mapDiaSemanaToJsIndex(aluno.dia_semana_preferido ?? null);
        if (targetDow !== null) {
          // base: máximo entre hoje e 1º dia do mês escolhido
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          const inicioMes = new Date(ano1, mes1 - 1, 1);
          inicioMes.setHours(0, 0, 0, 0);
          const baseInicio = hoje > inicioMes ? hoje : inicioMes;
          // primeira sessão >= baseInicio no dia da semana preferido
          const primeiroDiaSessao = proximaDataDoDiaSemana(baseInicio, targetDow);
          const sessoes = [];
          let dataSessao = primeiroDiaSessao;
          const NUM_SEMANAS = 8; // podes ajustar mais tarde
          for (let i = 0; i < NUM_SEMANAS; i++) {
            sessoes.push({
              id_explicador: myExplId,
              id_aluno: alunoId,
              data: toISODate(dataSessao),
              hora_inicio: null,
              estado: "AGENDADA"
            });
            dataSessao = addDays(dataSessao, 7);
          }
          if (sessoes.length) {
            const { error: sessErr } = await svc.from("sessoes_explicacao").insert(sessoes);
            if (sessErr) {
              console.error("Erro a criar sessões recorrentes em iniciar_faturacao_aluno", sessErr);
              // não fazemos return de erro para não estragar a faturação
            }
          }
        } else {
          console.log("Aluno sem dia_semana_preferido válido, não foram geradas sessões recorrentes.");
        }
      } catch (e) {
        console.error("Erro inesperado ao gerar sessões recorrentes", e);
      }
      // resposta final
      return new Response(JSON.stringify({
        ok: true
      }), {
        status: 200,
        headers: cors(origin)
      });
    }
    /* =======================
       REGISTAR PAGAMENTO
       payload: { aluno_id, ano, mes, valor, data_pagamento? }
       ======================= */ if (action === "registar_pagamento_aluno") {
      const p = payload || {};
      const alunoId = String(p.aluno_id || "").trim();
      const ano1 = Number(p.ano);
      const mes1 = Number(p.mes);
      const valor = Number(p.valor);
      const dataPag = p.data_pagamento ? String(p.data_pagamento) : new Date().toISOString().slice(0, 10);
      if (!alunoId || !ano1 || !mes1 || !valor || valor <= 0) {
        return new Response(JSON.stringify({
          error: "aluno_id, ano, mes e valor (>0) são obrigatórios"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      const aluno = await getAlunoDoExpl(alunoId);
      const valorExp = Number(aluno.valor_explicacao) || 0;
      const sessoesMes = Number(aluno.sessoes_mes) || 0;
      const valorPrevDefault1 = valorExp * sessoesMes;
      const { data: pagRow, error: pagErr } = await svc.from("pagamentos").select("valor_previsto, valor_pago, estado").eq("id_aluno", alunoId).eq("id_explicador", myExplId).eq("ano", ano1).eq("mes", mes1).maybeSingle();
      if (pagErr) {
        console.error("Erro ao ler pagamentos", pagErr);
        return new Response(JSON.stringify({
          error: pagErr.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      let atualPrev = valorPrevDefault1;
      let atualPago = 0;
      if (!pagRow) {
        const { error: insPagErr } = await svc.from("pagamentos").insert({
          id_aluno: alunoId,
          id_explicador: myExplId,
          ano: ano1,
          mes: mes1,
          valor_previsto: valorPrevDefault1,
          valor_pago: 0,
          data_pagamento: null,
          estado: "PARCIAL"
        });
        if (insPagErr) {
          console.error("Erro a criar pagamento no registar_pagamento", insPagErr);
          return new Response(JSON.stringify({
            error: insPagErr.message
          }), {
            status: 400,
            headers: cors(origin)
          });
        }
      } else {
        atualPrev = Number(pagRow.valor_previsto) || valorPrevDefault1;
        atualPago = Number(pagRow.valor_pago) || 0;
      }
      const novoPago = atualPago + valor;
      let novoEstado = "PENDENTE"; // ou o nome que tiveres no enum para “não pago totalmente”
      if (novoPago >= atualPrev && atualPrev > 0) {
        novoEstado = "PAGO";
      }
      const { error: updErr } = await svc.from("pagamentos").update({
        valor_previsto: atualPrev,
        valor_pago: novoPago,
        data_pagamento: dataPag,
        estado: novoEstado
      }).eq("id_aluno", alunoId).eq("id_explicador", myExplId).eq("ano", ano1).eq("mes", mes1);
      if (updErr) {
        console.error("Erro a atualizar pagamento", updErr);
        return new Response(JSON.stringify({
          error: updErr.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        valor_previsto: atualPrev,
        valor_pago: novoPago,
        estado: novoEstado
      }), {
        status: 200,
        headers: cors(origin)
      });
    }
    /* =======================
       ATUALIZAR PAGAMENTO (valor pago)
       payload: { aluno_id, ano, mes, valor_pago }
       ======================= */ if (action === "update_pagamento_aluno") {
      const p = payload || {};
      const alunoId = String(p.aluno_id || "").trim();
      const ano1 = Number(p.ano);
      const mes1 = Number(p.mes);
      const valorPago = p.valor_pago !== null && p.valor_pago !== undefined && p.valor_pago !== "" ? Number(p.valor_pago) : null;
      if (!alunoId || !ano1 || !mes1 || mes1 < 1 || mes1 > 12) {
        return new Response(JSON.stringify({
          error: "aluno_id, ano e mes (1-12) são obrigatórios"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      if (valorPago === null || isNaN(valorPago) || valorPago < 0) {
        return new Response(JSON.stringify({
          error: "valor_pago inválido"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      const aluno = await getAlunoDoExpl(alunoId);
      if (aluno.id_explicador !== myExplId) {
        return new Response(JSON.stringify({
          error: "Forbidden"
        }), {
          status: 403,
          headers: cors(origin)
        });
      }
      const { error: updErr } = await svc.from("pagamentos").update({
        valor_pago: valorPago
      }).eq("id_aluno", alunoId).eq("id_explicador", myExplId).eq("ano", ano1).eq("mes", mes1);
      if (updErr) {
        console.error("update_pagamento_aluno: erro no update", updErr);
        return new Response(JSON.stringify({
          error: updErr.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      return new Response(JSON.stringify({
        ok: true
      }), {
        status: 200,
        headers: cors(origin)
      });
    }
    /* =======================
       GERAR MENSALIDADES (BULK)
       payload: { ano, mes }
       ======================= */
    if (action === "generate_monthly_billing") {
      const p = payload || {};
      const ano = Number(p.ano) || new Date().getFullYear();
      const mes = Number(p.mes) || (new Date().getMonth() + 1);

      console.log(`Generating billing for ${mes}/${ano} (myExplId: ${myExplId})`);

      // 1. Obter todos os alunos ativos deste explicador
      const { data: alunos, error: alErr } = await svc
        .from("alunos")
        .select("id_aluno, valor_explicacao, sessoes_mes")
        .eq("id_explicador", myExplId)
        .eq("is_active", true);

      if (alErr) {
        console.error("Erro ao buscar alunos para faturação:", alErr);
        return new Response(JSON.stringify({ error: alErr.message, details: alErr }), {
          status: 400,
          headers: cors(origin)
        });
      }

      // 2. Para cada aluno, verificar se já existe pagamento para esse mês
      const results = [];
      const errors = [];

      for (const al of (alunos || [])) {
        try {
          const { data: existing, error: checkErr } = await svc
            .from("pagamentos")
            .select("id_pagamento")
            .eq("id_aluno", al.id_aluno)
            .eq("id_explicador", myExplId)
            .eq("ano", ano)
            .eq("mes", mes)
            .maybeSingle();

          if (checkErr) {
            console.error(`Erro ao verificar pagamento para aluno ${al.id_aluno}:`, checkErr);
            errors.push({ aluno: al.id_aluno, error: checkErr.message });
            continue;
          }

          if (!existing) {
            let valorPrev = (Number(al.valor_explicacao) || 0) * (Number(al.sessoes_mes) || 0);

            // Garantir que não enviamos NaN para a BD (causa 400)
            if (isNaN(valorPrev) || !isFinite(valorPrev)) {
              console.warn(`Valor previsto inválido para aluno ${al.id_aluno}: ${valorPrev}`);
              valorPrev = 0;
            }

            const { error: insErr } = await svc.from("pagamentos").insert({
              id_aluno: al.id_aluno,
              id_explicador: myExplId,
              ano: ano,
              mes: mes,
              valor_previsto: valorPrev,
              valor_pago: 0,
              estado: "PENDENTE"
            });

            if (insErr) {
              console.error(`Erro ao inserir pagamento para aluno ${al.id_aluno}:`, insErr);
              errors.push({ aluno: al.id_aluno, error: insErr.message });
            } else {
              results.push(al.id_aluno);
            }
          }
        } catch (innerErr) {
          console.error(`Exceção ao processar aluno ${al.id_aluno}:`, innerErr);
          errors.push({ aluno: al.id_aluno, error: innerErr.message });
        }
      }

      console.log(`Geradas ${results.length} mensalidades. Erros: ${errors.length}`);

      return new Response(JSON.stringify({
        ok: true,
        generated_count: results.length,
        errors: errors.length > 0 ? errors : undefined
      }), {
        status: 200,
        headers: cors(origin)
      });
    }
    /* =======================
       LISTAR TODAS AS SESSÕES DO EXPLICADOR
   (para o calendário / resumos)
   ======================= */ if (action === "list_sessoes_explicador") {
      // Todas as sessões deste explicador,
      // opcionalmente já enriquecidas com nome do aluno numa VIEW
      const { data, error } = await svc.from("v_sessoes_detalhe") // ou "sessoes_explicacao" se não tiveres view
        .select(`
      id_sessao,
      id_explicador,
      id_aluno,
      aluno_nome,
      data,
      hora_inicio,
      hora_fim,
      duracao_min,
      estado
    `).eq("id_explicador", myExplId).order("data", {
          ascending: true
        }).order("hora_inicio", {
          ascending: true
        });
      if (error) {
        console.error("list_sessoes_explicador error", error);
        return new Response(JSON.stringify({
          error: error.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      return new Response(JSON.stringify(data ?? []), {
        status: 200,
        headers: cors(origin)
      });
    }
    /* =======================
       LISTAR SESSÕES DE UM ALUNO
       payload: { aluno_id }
       ======================= */ if (action === "list_sessoes_aluno") {
      const p = payload || {};
      const alunoId = String(p.aluno_id || "").trim();
      if (!alunoId) {
        return new Response(JSON.stringify({
          error: "aluno_id em falta ou inválido"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      const aluno = await getAlunoDoExpl(alunoId);
      if (aluno.id_explicador !== myExplId) {
        return new Response(JSON.stringify({
          error: "Aluno não encontrado ou forbidden"
        }), {
          status: 403,
          headers: cors(origin)
        });
      }
      const { data, error } = await svc.from("sessoes_explicacao").select("id_sessao, data, hora_inicio, hora_fim, duracao_min, estado, observacoes").eq("id_explicador", myExplId).eq("id_aluno", alunoId).order("data", {
        ascending: true
      });
      if (error) {
        console.error("list_sessoes_aluno error", error);
        return new Response(JSON.stringify({
          error: error.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      return new Response(JSON.stringify(data ?? []), {
        status: 200,
        headers: cors(origin)
      });
    }
    /* =======================
       CRIAR / EDITAR SESSÃO (UPSERT)
       payload:
         criar:  { aluno_id, data, hora_inicio?, hora_fim?, duracao_min?, estado?, observacoes? }
         editar: { id_sessao, aluno_id, data, ... }
       ======================= */ if (action === "upsert_sessao_aluno") {
      const p = payload || {};
      const idSessao = p.id_sessao || null;
      const alunoId = String(p.aluno_id || "").trim();
      const dataStr = p.data;
      const horaIni = p.hora_inicio;
      const horaFim = p.hora_fim;
      const dur = p.duracao_min;
      const estado = p.estado || "AGENDADA";
      const obs = p.observacoes || null;
      if (!alunoId || !dataStr) {
        return new Response(JSON.stringify({
          error: "aluno_id e data são obrigatórios"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      const aluno = await getAlunoDoExpl(alunoId);
      if (aluno.id_explicador !== myExplId) {
        return new Response(JSON.stringify({
          error: "Aluno não encontrado ou forbidden"
        }), {
          status: 403,
          headers: cors(origin)
        });
      }
      const payloadSessao = {
        id_explicador: myExplId,
        id_aluno: alunoId,
        data: dataStr,
        estado
      };
      if (horaIni) payloadSessao.hora_inicio = horaIni;
      if (horaFim) payloadSessao.hora_fim = horaFim;
      if (dur !== undefined && dur !== null && dur !== "") {
        payloadSessao.duracao_min = Number(dur);
      }
      if (obs) payloadSessao.observacoes = obs;
      if (!idSessao) {
        const { data, error } = await svc.from("sessoes_explicacao").insert(payloadSessao).select("id_sessao").single();
        if (error) {
          console.error("upsert_sessao_aluno (insert) error", error);
          return new Response(JSON.stringify({
            error: error.message
          }), {
            status: 400,
            headers: cors(origin)
          });
        }
        return new Response(JSON.stringify({
          id_sessao: data.id_sessao
        }), {
          status: 201,
          headers: cors(origin)
        });
      } else {
        const { error } = await svc.from("sessoes_explicacao").update(payloadSessao).eq("id_sessao", idSessao).eq("id_explicador", myExplId).eq("id_aluno", alunoId);
        if (error) {
          console.error("upsert_sessao_aluno (update) error", error);
          return new Response(JSON.stringify({
            error: error.message
          }), {
            status: 400,
            headers: cors(origin)
          });
        }
        return new Response(JSON.stringify({
          id_sessao: idSessao
        }), {
          status: 200,
          headers: cors(origin)
        });
      }
    }
    /* =======================
   RELATÓRIOS (dashboard)
   ======================= */
    if (action === "get_relatorios") {
      const anoAtual = new Date().getFullYear();
      const mesAtual = new Date().getMonth() + 1;

      /* ============================
        1. Evolução da faturação
        ============================ */
      const { data: fat, error: fatErr } = await svc
        .rpc("expl_relatorio_faturacao", {
          expl_id: myExplId,
          ano: anoAtual
        });

      if (fatErr) {
        console.error("RPC faturacao", fatErr);
      }

      /* ============================
        2. Evolução de alunos ativos
        ============================ */
      const { data: alunosMes, error: alMesErr } = await svc
        .rpc("expl_relatorio_alunos_mes", {
          expl_id: myExplId,
          ano: anoAtual
        });

      if (alMesErr) {
        console.error("RPC alunos_mes", alMesErr);
      }

      /* ============================
        3. Sessões mensais
        ============================ */
      const { data: sessoes, error: sessErr } = await svc
        .rpc("expl_relatorio_sessoes_mes", {
          expl_id: myExplId,
          ano: anoAtual
        });

      if (sessErr) {
        console.error("RPC sessoes_mes", sessErr);
      }

      /* ============================
        4. Distribuição por disciplina
        ============================ */
      const { data: dist, error: distErr } = await svc
        .rpc("expl_relatorio_disciplinas", {
          expl_id: myExplId
        });

      if (distErr) {
        console.error("RPC dist", distErr);
      }

      return new Response(
        JSON.stringify({
          faturacao: fat ?? [],
          alunos_mes: alunosMes ?? [],
          sessoes_mes: sessoes ?? [],
          disciplinas: dist ?? []
        }),
        { status: 200, headers: cors(origin) }
      );
    }

    /* =======================
       APAGAR SESSÃO
       payload: { id_sessao }
       ======================= */ if (action === "delete_sessao_aluno") {
      const p = payload || {};
      const idSessao = String(p.id_sessao || "").trim();
      if (!idSessao) {
        return new Response(JSON.stringify({
          error: "id_sessao em falta ou inválido"
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      const { error } = await svc.from("sessoes_explicacao").delete().eq("id_sessao", idSessao).eq("id_explicador", myExplId);
      if (error) {
        console.error("delete_sessao_aluno error", error);
        return new Response(JSON.stringify({
          error: error.message
        }), {
          status: 400,
          headers: cors(origin)
        });
      }
      return new Response(JSON.stringify({
        ok: true
      }), {
        status: 200,
        headers: cors(origin)
      });
    }

    /* =======================
       UPSERT PAGAMENTO ALUNO
       payload: { id_pagamento?, id_aluno, ano, mes, valor_previsto, valor_pago, data_pagamento, estado }
       ======================= */
    if (action === "upsert_pagamento_aluno") {
      const p = payload || {};
      const idPagamento = p.id_pagamento || null;
      const idAluno = p.id_aluno;
      const ano = Number(p.ano);
      const mes = Number(p.mes);
      const valorPrev = Number(p.valor_previsto) || 0;
      const valorPago = Number(p.valor_pago) || 0;
      const dataPag = p.data_pagamento || null;
      const estado = p.estado || "PENDENTE";

      if (!idAluno || !ano || !mes) {
        return new Response(JSON.stringify({ error: "id_aluno, ano e mes são obrigatórios" }), {
          status: 400,
          headers: cors(origin)
        });
      }

      // Validar acesso
      const aluno = await getAlunoDoExpl(idAluno);
      if (aluno.id_explicador !== myExplId) {
        return new Response(JSON.stringify({ error: "Proibido" }), { status: 403, headers: cors(origin) });
      }

      const row = {
        id_aluno: idAluno,
        id_explicador: myExplId,
        ano,
        mes,
        valor_previsto: valorPrev,
        valor_pago: valorPago,
        data_pagamento: dataPag,
        estado
      };

      let result;
      if (idPagamento) {
        // Editar pagamento existente por ID
        result = await svc.from("pagamentos").update(row).eq("id_pagamento", idPagamento).eq("id_explicador", myExplId);
      } else {
        // Verificar se já existe registo para este aluno/mês/ano
        const { data: existing, error: checkErr } = await svc
          .from("pagamentos")
          .select("id_pagamento")
          .eq("id_aluno", idAluno)
          .eq("id_explicador", myExplId)
          .eq("ano", ano)
          .eq("mes", mes)
          .maybeSingle();

        if (checkErr) {
          console.error("Erro ao verificar pagamento existente", checkErr);
          return new Response(JSON.stringify({ error: checkErr.message }), { status: 400, headers: cors(origin) });
        }

        if (existing) {
          // Já existe → atualizar
          result = await svc.from("pagamentos").update(row).eq("id_pagamento", existing.id_pagamento).eq("id_explicador", myExplId);
        } else {
          // Não existe → inserir
          result = await svc.from("pagamentos").insert(row);
        }
      }

      if (result.error) {
        console.error("error upserting pagamento", result.error);
        return new Response(JSON.stringify({ error: result.error.message }), { status: 400, headers: cors(origin) });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors(origin) });
    }

    /* =======================
       DELETE PAGAMENTO ALUNO
       payload: { id_pagamento }
       ======================= */
    if (action === "delete_pagamento_aluno") {
      const p = payload || {};
      const idPagamento = p.id_pagamento;
      if (!idPagamento) {
        return new Response(JSON.stringify({ error: "id_pagamento é obrigatório" }), { status: 400, headers: cors(origin) });
      }

      const { error } = await svc.from("pagamentos").delete().eq("id_pagamento", idPagamento).eq("id_explicador", myExplId);
      if (error) {
        console.error("error deleting pagamento", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors(origin) });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors(origin) });
    }

    /* =======================
       LISTAR SESSÕES DO EXPLICADOR (todas)
       ======================= */
    if (action === "list_sessoes_explicador") {
      // Buscar todas as sessões deste explicador, com nome do aluno
      const { data: sessoes, error } = await svc
        .from("sessoes")
        .select("*, alunos!inner(nome, apelido)")
        .eq("id_explicador", myExplId)
        .order("data", { ascending: true });

      if (error) {
        console.error("Erro list_sessoes_explicador", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors(origin) });
      }

      // Flatten aluno name into each session
      const result = (sessoes || []).map(s => ({
        ...s,
        aluno_nome: s.alunos ? `${s.alunos.nome} ${s.alunos.apelido || ''}`.trim() : 'Aluno',
        alunos: undefined
      }));

      return new Response(JSON.stringify(result), { status: 200, headers: cors(origin) });
    }

    /* =======================
       SET MENSALIDADE AVISADA (sino)
       payload: { aluno_id, avisado: boolean }
       ======================= */
    if (action === "set_mensalidade_avisada") {
      const p = payload || {};
      const alunoId = p.aluno_id;
      const avisado = p.avisado;

      if (!alunoId) {
        return new Response(JSON.stringify({ error: "aluno_id é obrigatório" }), { status: 400, headers: cors(origin) });
      }

      const { error } = await svc
        .from("alunos")
        .update({ mensalidade_avisada: !!avisado })
        .eq("id_aluno", alunoId)
        .eq("id_explicador", myExplId);

      if (error) {
        console.error("Erro set_mensalidade_avisada", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors(origin) });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors(origin) });
    }

    /* =======================
       GET RELATÓRIOS
       Dados agregados para gráficos e KPIs
       ======================= */
    if (action === "get_relatorios") {
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth() + 1;

      // 1. Faturação por mês (últimos 12 meses)
      const { data: fatData, error: fatErr } = await svc
        .from("pagamentos")
        .select("ano, mes, valor_previsto, valor_pago, estado")
        .eq("id_explicador", myExplId)
        .gte("ano", curYear - 1)
        .order("ano", { ascending: true })
        .order("mes", { ascending: true });

      if (fatErr) {
        console.error("Erro get_relatorios faturacao", fatErr);
        return new Response(JSON.stringify({ error: fatErr.message }), { status: 400, headers: cors(origin) });
      }

      // Agrupar faturação por mês
      const fatByMonth: Record<string, { ano: number; mes: number; total_previsto: number; total_pago: number }> = {};
      (fatData || []).forEach((p: any) => {
        const key = `${p.ano}-${String(p.mes).padStart(2, '0')}`;
        if (!fatByMonth[key]) fatByMonth[key] = { ano: p.ano, mes: p.mes, total_previsto: 0, total_pago: 0 };
        fatByMonth[key].total_previsto += Number(p.valor_previsto || 0);
        fatByMonth[key].total_pago += Number(p.valor_pago || 0);
      });
      const faturacao = Object.values(fatByMonth).sort((a, b) => (a.ano * 100 + a.mes) - (b.ano * 100 + b.mes)).slice(-12);

      // 2. Sessões por mês (últimos 12 meses)
      const oneYearAgo = `${curYear - 1}-${String(curMonth).padStart(2, '0')}-01`;
      const { data: sessoesData, error: sessErr } = await svc
        .from("sessoes")
        .select("data, estado")
        .eq("id_explicador", myExplId)
        .gte("data", oneYearAgo);

      if (sessErr) {
        console.error("Erro get_relatorios sessoes", sessErr);
      }

      const sessByMonth: Record<string, { ano: number; mes: number; total_sessoes: number }> = {};
      (sessoesData || []).forEach((s: any) => {
        if (!s.data) return;
        const d = new Date(s.data);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const key = `${y}-${String(m).padStart(2, '0')}`;
        if (!sessByMonth[key]) sessByMonth[key] = { ano: y, mes: m, total_sessoes: 0 };
        sessByMonth[key].total_sessoes += 1;
      });
      const sessoes_mes = Object.values(sessByMonth).sort((a, b) => (a.ano * 100 + a.mes) - (b.ano * 100 + b.mes)).slice(-12);

      // 3. Alunos ativos por mês (a partir dos pagamentos como proxy)
      const alunosByMonth: Record<string, { ano: number; mes: number; total_alunos: number }> = {};
      (fatData || []).forEach((p: any) => {
        const key = `${p.ano}-${String(p.mes).padStart(2, '0')}`;
        if (!alunosByMonth[key]) alunosByMonth[key] = { ano: p.ano, mes: p.mes, total_alunos: 0 };
        alunosByMonth[key].total_alunos += 1;
      });
      const alunos_mes = Object.values(alunosByMonth).sort((a, b) => (a.ano * 100 + a.mes) - (b.ano * 100 + b.mes)).slice(-12);

      // 4. Disciplinas (distribuição de alunos por disciplina/matéria)
      const { data: alunosDisc } = await svc
        .from("alunos")
        .select("disciplina")
        .eq("id_explicador", myExplId)
        .eq("is_active", true);

      const discCount: Record<string, number> = {};
      (alunosDisc || []).forEach((a: any) => {
        const disc = a.disciplina || 'Outra';
        discCount[disc] = (discCount[disc] || 0) + 1;
      });
      const disciplinas = Object.entries(discCount).map(([disciplina, total]) => ({ disciplina, total }));

      return new Response(JSON.stringify({
        faturacao,
        sessoes_mes,
        alunos_mes,
        disciplinas
      }), { status: 200, headers: cors(origin) });
    }

    // ação desconhecida
    return new Response(JSON.stringify({
      error: "ação inválida"
    }), {
      status: 400,
      headers: cors(origin)
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
    console.error("Erro inesperado na função expl-alunos", msg);
    return new Response(JSON.stringify({
      error: msg
    }), {
      status: 500,
      headers: cors(origin)
    });
  }
});