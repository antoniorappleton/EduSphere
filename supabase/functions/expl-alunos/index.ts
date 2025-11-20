// @ts-nocheck
// Edge Function: expl-alunos
// Ações suportadas: list_alunos | create_aluno

import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10?target=deno";

const URL  = Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const SVC  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!URL || !ANON || !SVC) {
  throw new Error("Faltam SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
}

function cors(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "*";

  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors(origin) });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método não suportado. Usa POST." }),
      { status: 405, headers: cors(origin) },
    );
  }

  try {
    // 1) Cliente autenticado (JWT do explicador) – usa ANON
    const userClient = createClient(URL, ANON, {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") || "",
        },
      },
      auth: { persistSession: false },
    });

    const { data: me, error: meErr } = await userClient.auth.getUser();
    if (meErr || !me?.user) {
      console.error("auth.getUser error", meErr);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: cors(origin),
      });
    }
    const myUid = me.user.id;

    // 2) Service client (ignora RLS) – usa SERVICE_ROLE
    const svc = createClient(URL, SVC, { auth: { persistSession: false } });

    // 3) Confirmar role = explicador + obter ref_id (id_explicador) em app_users
    const { data: roleRow, error: roleErr } = await svc
      .from("app_users")
      .select("role, ref_id")
      .eq("user_id", myUid)
      .maybeSingle();

    if (roleErr) {
      console.error("Erro a ler app_users", roleErr);
      return new Response(JSON.stringify({ error: roleErr.message }), {
        status: 400,
        headers: cors(origin),
      });
    }

    if (!roleRow || roleRow.role !== "explicador") {
      console.error("Utilizador sem role de explicador", myUid, roleRow);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: cors(origin),
      });
    }

    const myExplId = roleRow.ref_id; // deve apontar para explicadores.id_explicador

    // 4) Ler ação/payload do body
    const { action, payload } = await req.json().catch((e) => {
      console.error("Body JSON inválido", e);
      return { action: null, payload: null };
    });

    if (!action) {
      return new Response(JSON.stringify({ error: "Campo 'action' em falta" }), {
        status: 400,
        headers: cors(origin),
      });
    }

    /* =======================
       LISTAR ALUNOS
       ======================= */
    if (action === "list_alunos") {
      const { data, error } = await svc
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
          username
        `)
        .eq("id_explicador", myExplId)
        .order("nome", { ascending: true });

      if (error) {
        console.error("Erro em list_alunos", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      // O frontend já espera exatamente estes campos
      return new Response(JSON.stringify(data ?? []), {
        status: 200,
        headers: cors(origin),
      });
    }

    /* =======================
       CRIAR ALUNO
       ======================= */
    if (action === "create_aluno") {
      const p = payload || {};

      // Normalizar/limpar campos
      const aluno = {
        nome: (p.nome || "").trim(),
        apelido: p.apelido ? String(p.apelido).trim() : null,
        telemovel: p.telemovel ? String(p.telemovel).trim() : null,
        ano: p.ano != null && p.ano !== "" ? Number(p.ano) : null,
        idade: p.idade != null && p.idade !== "" ? Number(p.idade) : null,
        dia_semana_preferido: p.dia_semana_preferido
          ? String(p.dia_semana_preferido).trim()
          : null,
        valor_explicacao:
          p.valor_explicacao != null && p.valor_explicacao !== ""
            ? Number(p.valor_explicacao)
            : null,
        sessoes_mes:
          p.sessoes_mes != null && p.sessoes_mes !== ""
            ? Number(p.sessoes_mes)
            : null,
        nome_pai_cache: p.nome_pai_cache
          ? String(p.nome_pai_cache).trim()
          : null,
        contacto_pai_cache: p.contacto_pai_cache
          ? String(p.contacto_pai_cache).trim()
          : null,
        email: (p.email || "").trim(),
        username: p.username ? String(p.username).trim() : null,
        password: String(p.password || ""),
        is_active: typeof p.is_active === "boolean" ? p.is_active : true,
      };

      if (!aluno.nome || !aluno.email || !aluno.password) {
        return new Response(
          JSON.stringify({
            error: "nome, email e password são obrigatórios",
          }),
          { status: 400, headers: cors(origin) },
        );
      }

      // 1) Criar utilizador Auth (aluno)
      const { data: au, error: authErr } = await svc.auth.admin.createUser({
        email: aluno.email,
        password: aluno.password,
        email_confirm: true,
      });

      if (authErr) {
        console.error("Erro em createUser (aluno)", authErr);
        return new Response(JSON.stringify({ error: authErr.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      const alunoUid = au?.user?.id;
      if (!alunoUid) {
        console.error("createUser não devolveu user.id");
        return new Response(
          JSON.stringify({ error: "createUser não devolveu user.id" }),
          { status: 400, headers: cors(origin) },
        );
      }

      // 2) Inserir em "alunos"
      const { data: row, error: insErr } = await svc
        .from("alunos")
        .insert({
          id_explicador: myExplId,
          user_id: alunoUid,
          nome: aluno.nome,
          apelido: aluno.apelido,
          telemovel: aluno.telemovel,
          ano: aluno.ano,
          idade: aluno.idade,
          dia_semana_preferido: aluno.dia_semana_preferido,
          valor_explicacao: aluno.valor_explicacao,
          sessoes_mes: aluno.sessoes_mes,
          nome_pai_cache: aluno.nome_pai_cache,
          contacto_pai_cache: aluno.contacto_pai_cache,
          email: aluno.email,
          is_active: aluno.is_active,
          username: aluno.username,
        })
        .select("id_aluno")
        .single();

      if (insErr) {
        console.error("Erro ao inserir em alunos", insErr);
        await svc.auth.admin.deleteUser(alunoUid).catch(() => {});
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      // 3) Registo em app_users (role = aluno)
      const { error: roleInsErr } = await svc.from("app_users").insert({
        user_id: alunoUid,
        role: "aluno",
        ref_id: row.id_aluno,
      });

      if (roleInsErr) {
        console.error("Erro ao inserir em app_users (aluno)", roleInsErr);
        await svc.from("alunos").delete().eq("id_aluno", row.id_aluno).catch(() => {});
        await svc.auth.admin.deleteUser(alunoUid).catch(() => {});
        return new Response(JSON.stringify({ error: roleInsErr.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      return new Response(JSON.stringify({ id_aluno: row.id_aluno }), {
        status: 201,
        headers: cors(origin),
      });
    }

    // ação desconhecida
    return new Response(JSON.stringify({ error: "ação inválida" }), {
      status: 400,
      headers: cors(origin),
    });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : JSON.stringify(e);
    console.error("Erro inesperado na função expl-alunos", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: cors(origin),
    });
  }
});
