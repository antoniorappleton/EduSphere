// Edge Function: admin-users (JavaScript)
// Ações: create_explicador, update_explicador, update_password, delete_user

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

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  try {
    // cliente autenticado (quem chama)
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

    // permitir só ADMIN
    const { data: roleRow, error: roleErr } = await userClient
      .from("app_users")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (roleErr || roleRow?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: corsHeaders(origin),
      });
    }

    const { action, payload } = await req.json();
    const svc = createClient(URL, SVC);

    // CREATE EXPLICADOR
    if (action === "create_explicador") {
      const {
        nome,
        apelido = null,
        contacto = null,
        email,
        password,
        max_alunos = 0,
      } = payload || {};
      if (!nome || !email || !password) {
        return new Response(
          JSON.stringify({ error: "nome, email e password são obrigatórios" }),
          { status: 400, headers: corsHeaders(origin) }
        );
      }

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

      const { data: exp, error: e2 } = await svc
        .from("explicadores")
        .insert({ nome, apelido, contacto, email, max_alunos, user_id: uid })
        .select("id_explicador")
        .single();
      if (e2)
        return new Response(JSON.stringify({ error: e2.message }), {
          status: 400,
          headers: corsHeaders(origin),
        });

      const { error: e3 } = await svc
        .from("app_users")
        .insert({
          user_id: uid,
          role: "explicador",
          ref_id: exp.id_explicador,
        });
      if (e3)
        return new Response(JSON.stringify({ error: e3.message }), {
          status: 400,
          headers: corsHeaders(origin),
        });

      return new Response(JSON.stringify({ ok: true }), {
        headers: corsHeaders(origin),
      });
    }

    // UPDATE EXPLICADOR
    if (action === "update_explicador") {
      const {
        id_explicador,
        nome,
        apelido = null,
        contacto = null,
        email,
        max_alunos = 0,
      } = payload || {};
      if (!id_explicador) {
        return new Response(
          JSON.stringify({ error: "id_explicador obrigatório" }),
          { status: 400, headers: corsHeaders(origin) }
        );
      }
      const { error } = await svc
        .from("explicadores")
        .update({ nome, apelido, contacto, email, max_alunos })
        .eq("id_explicador", id_explicador);
      if (error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: corsHeaders(origin),
        });

      return new Response(JSON.stringify({ ok: true }), {
        headers: corsHeaders(origin),
      });
    }

    // UPDATE PASSWORD (qualquer utilizador pelo user_id)
    if (action === "update_password") {
      const { user_id, new_password } = payload || {};
      if (!user_id || !new_password || String(new_password).length < 6) {
        return new Response(
          JSON.stringify({
            error: "user_id e new_password (>=6) são obrigatórios",
          }),
          { status: 400, headers: corsHeaders(origin) }
        );
      }
      const { error } = await svc.auth.admin.updateUserById(user_id, {
        password: new_password,
      });
      if (error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: corsHeaders(origin),
        });
      return new Response(JSON.stringify({ ok: true }), {
        headers: corsHeaders(origin),
      });
    }

    // DELETE USER (limpa mapeamentos/linhas conhecidas e remove da Auth)
    if (action === "delete_user") {
      const { user_id } = payload || {};
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id obrigatório" }), {
          status: 400,
          headers: corsHeaders(origin),
        });
      }
      await svc.from("app_users").delete().eq("user_id", user_id);
      await svc.from("explicadores").delete().eq("user_id", user_id);
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
