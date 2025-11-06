// Edge Function: expl-alunos (JavaScript)
// Ações: create_aluno (com verificação max_alunos), delete_aluno

import { serve } from "https://deno.land/std@0.223.0/http/server.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "*";

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  try {
    // cliente do utilizador (explicador)
    const userClient = createClient(URL, ANON, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") || "" },
      },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders(origin),
      });

    const { data: me, error: meErr } = await userClient
      .from("app_users")
      .select("role, ref_id")
      .eq("user_id", user.id)
      .single();
    if (meErr || me?.role !== "explicador") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: corsHeaders(origin),
      });
    }
    const id_explicador = me.ref_id;

    const { action, payload } = await req.json();
    const svc = createClient(URL, SVC);

    if (action === "create_aluno") {
      const {
        nome,
        apelido = null,
        contacto = null,
        email,
        password,
        ano_escolaridade = null,
      } = payload || {};
      if (!nome || !email || !password) {
        return new Response(
          JSON.stringify({ error: "nome, email e password são obrigatórios" }),
          { status: 400, headers: corsHeaders(origin) }
        );
      }

      // ---- verificar limite de alunos (max_alunos) do explicador ----
      const { data: exp, error: e0 } = await userClient
        .from("explicadores")
        .select("id_explicador, max_alunos")
        .eq("id_explicador", id_explicador)
        .single();
      if (e0)
        return new Response(JSON.stringify({ error: e0.message }), {
          status: 400,
          headers: corsHeaders(origin),
        });

      if (exp?.max_alunos && Number(exp.max_alunos) > 0) {
        const { count, error: cErr } = await userClient
          .from("alunos")
          .select("id_aluno", { count: "exact", head: true })
          .eq("id_explicador", id_explicador);
        if (cErr)
          return new Response(JSON.stringify({ error: cErr.message }), {
            status: 400,
            headers: corsHeaders(origin),
          });
        if (count >= Number(exp.max_alunos)) {
          return new Response(
            JSON.stringify({
              error: "Limite de alunos atingido para este explicador.",
            }),
            { status: 403, headers: corsHeaders(origin) }
          );
        }
      }
      // ----------------------------------------------------------------

      const { data: created, error: e1 } = await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (e1)
        return new Response(JSON.stringify({ error: e1.message }), {
          status: 400,
          headers: corsHeaders(origin),
        });
      const uid = created.user.id;

      const { data: al, error: e2 } = await svc
        .from("alunos")
        .insert({
          nome,
          apelido,
          contacto,
          email,
          ano_escolaridade,
          id_explicador,
          user_id: uid,
        })
        .select("id_aluno")
        .single();
      if (e2)
        return new Response(JSON.stringify({ error: e2.message }), {
          status: 400,
          headers: corsHeaders(origin),
        });

      const { error: e3 } = await svc
        .from("app_users")
        .insert({ user_id: uid, role: "aluno", ref_id: al.id_aluno });
      if (e3)
        return new Response(JSON.stringify({ error: e3.message }), {
          status: 400,
          headers: corsHeaders(origin),
        });

      return new Response(JSON.stringify({ ok: true }), {
        headers: corsHeaders(origin),
      });
    }

    if (action === "delete_aluno") {
      const { user_id } = payload || {};
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id obrigatório" }), {
          status: 400,
          headers: corsHeaders(origin),
        });
      }
      await svc.from("app_users").delete().eq("user_id", user_id);
      await svc.from("alunos").delete().eq("user_id", user_id);
      const { error } = await svc.auth.admin.deleteUser(user_id);
      if (error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: corsHeaders(origin),
        });
      return new Response(JSON.stringify({ ok: true }), {
        headers: corsHeaders(origin),
      });
    }

    return new Response(JSON.stringify({ error: "ação inválida" }), {
      status: 400,
      headers: corsHeaders(origin),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: corsHeaders(req.headers.get("Origin")),
    });
  }
});
