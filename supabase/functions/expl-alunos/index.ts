// @ts-nocheck
// Edge Function: expl-alunos
// Ações: list_alunos | create_aluno

import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10?target=deno";

const URL = Deno.env.get("https://notktinqokknnbjwuuot.supabase.co");
const ANON = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdGt0aW5xb2trbm5iand1dW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NTg2ODksImV4cCI6MjA3NzEzNDY4OX0.OIfmWOwXo8iegnqPGPz82pzU4atGad_glQ1Bidi0cLE");
const SVC  = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdGt0aW5xb2trbm5iand1dW90Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTU1ODY4OSwiZXhwIjoyMDc3MTM0Njg5fQ.hKAQ8_AlkLSPGFVnlo6tuhr10GBZvlxza0PScPNWN2I");

if (!URL || !ANON || !SVC) {
  throw new Error(
    "Faltam SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY nas env vars."
  );
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

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors(origin) });
  }

  try {
    // 1) Cliente autenticado (JWT do explicador)
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: cors(origin),
      });
    }
    const myUid = me.user.id;

    // 2) Confirmar role = explicador + obter ref_id (id_explicador)
    const { data: roleRow, error: roleErr } = await userClient
      .from("app_users")
      .select("role, ref_id")
      .eq("user_id", myUid)
      .limit(1)
      .single();

    if (roleErr) {
      return new Response(JSON.stringify({ error: roleErr.message }), {
        status: 400,
        headers: cors(origin),
      });
    }

    if (!roleRow || roleRow.role !== "explicador") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: cors(origin),
      });
    }

    const myExplId = roleRow.ref_id;

    // 3) Service client (ignora RLS)
    const svc = createClient(URL, SVC, { auth: { persistSession: false } });

    // 4) Ler ação/payload
    const { action, payload } = await req.json().catch(() => ({
      action: null,
      payload: null,
    }));

    /* =======================
       LISTAR ALUNOS
       ======================= */
    if (action === "list_alunos") {
      const { data, error } = await svc
        .from("alunos")
        .select("id_aluno, nome, apelido, email, ano, ano_escolaridade")
        .eq("id_explicador", myExplId) // ou .eq("explicador_id", myExplId) se esse for o nome
        .order("nome", { ascending: true });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

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
      const aluno = {
        nome: (p.nome || "").trim(),
        apelido: p.apelido ? String(p.apelido).trim() : null,
        contacto: p.contacto ? String(p.contacto).trim() : null,
        ano: p.ano != null && p.ano !== "" ? Number(p.ano) : null,
        email: (p.email || "").trim(),
        password: String(p.password || ""),
      };

      if (!aluno.nome || !aluno.email || !aluno.password) {
        return new Response(
          JSON.stringify({
            error: "nome, email e password são obrigatórios",
          }),
          { status: 400, headers: cors(origin) },
        );
      }

      // 6) Criar utilizador Auth
      const { data: au, error: authErr } = await svc.auth.admin.createUser({
        email: aluno.email,
        password: aluno.password,
        email_confirm: true,
      });

      if (authErr) {
        return new Response(JSON.stringify({ error: authErr.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      const alunoUid = au?.user?.id;
      if (!alunoUid) {
        return new Response(
          JSON.stringify({ error: "createUser não devolveu user.id" }),
          { status: 400, headers: cors(origin) },
        );
      }

      // 7) Inserir em "alunos"
      const { data: row, error: insErr } = await svc
        .from("alunos")
        .insert({
          id_explicador: myExplId,       // ou explicador_id: myExplId
          user_id: alunoUid,
          nome: aluno.nome,
          apelido: aluno.apelido,
          contacto: aluno.contacto,
          ano: aluno.ano,              // ou ano_escolaridade: aluno.ano
          email: aluno.email,
        })
        .select("id_aluno")
        .single();

      if (insErr) {
        await svc.auth.admin.deleteUser(alunoUid).catch(() => {});
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      // 8) Registo em app_users
      const { error: roleInsErr } = await svc.from("app_users").insert({
        user_id: alunoUid,
        role: "aluno",
        ref_id: row.id_aluno,
      });

      if (roleInsErr) {
        await svc.from("alunos").delete().eq("id_aluno", row.id_aluno).catch(
          () => {},
        );
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
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: cors(origin),
    });
  }
});
