// Edge Function: admin-users (JavaScript)
// Ações suportadas (e aliases):
// - list_explicadores
// - create_explicador
// - update_explicador
// - reset_password  (alias de update_password)
// - delete_explicador (alias de delete_user)

import { serve } from "https://deno.land/std@0.223.0/http/server.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!URL || !ANON || !SVC) {
  throw new Error(
    "Faltam SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY"
  );
}

function cors(o = "*") {
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "*";
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: cors(origin) });

  try {
    // cliente com JWT do utilizador (descobrir quem chama)
    const userClient = createClient(URL, ANON, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") || "" },
      },
    });

    const { data: me, error: meErr } = await userClient.auth.getUser();
    if (meErr || !me?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: cors(origin),
      });
    }
    const myUid = me.user.id;

    // validar ADMIN (multi-papéis → sem .single())
    const { data: roles, error: roleErr } = await userClient
      .from("app_users")
      .select("role")
      .eq("user_id", myUid)
      .eq("role", "admin")
      .limit(1);
    if (roleErr) {
      return new Response(JSON.stringify({ error: roleErr.message }), {
        status: 400,
        headers: cors(origin),
      });
    }
    if (!Array.isArray(roles) || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: cors(origin),
      });
    }

    // service client (ignora RLS + Admin API)
    const svc = createClient(URL, SVC);

    const { action, payload } = await req
      .json()
      .catch(() => ({ action: null, payload: null }));

    // ---- LIST ----
    if (action === "list_explicadores") {
      const { data, error } = await svc
        .from("explicadores")
        .select("id_explicador, user_id, nome, apelido, email, contacto, max")
        .order("nome", { ascending: true });
      if (error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: cors(origin),
        });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: cors(origin),
      });
    }

    // ---- CREATE ----
    if (action === "create_explicador") {
      const {
        nome,
        apelido = null,
        contacto = null,
        email,
        password,
        max = 0,
      } = payload || {};
      if (!nome || !email || !password) {
        return new Response(
          JSON.stringify({ error: "nome, email e password são obrigatórios" }),
          { status: 400, headers: cors(origin) }
        );
      }

      // 1) criar no Auth
      const { data: created, error: e1 } = await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (e1)
        return new Response(JSON.stringify({ error: e1.message }), {
          status: 400,
          headers: cors(origin),
        });
      const uid = created?.user?.id;
      if (!uid)
        return new Response(
          JSON.stringify({ error: "createUser não devolveu user.id" }),
          { status: 400, headers: cors(origin) }
        );

      // 2) perfil
      const { data: exp, error: e2 } = await svc
        .from("explicadores")
        .insert({ user_id: uid, nome, apelido, contacto, email, max })
        .select("id_explicador, user_id, nome, apelido, email, contacto, max")
        .single();
      if (e2)
        return new Response(JSON.stringify({ error: e2.message }), {
          status: 400,
          headers: cors(origin),
        });

      // 3) papel
      const { error: e3 } = await svc
        .from("app_users")
        .insert({
          user_id: uid,
          role: "explicador",
          id_explicador: exp.id_explicador,
        });
      if (e3)
        return new Response(JSON.stringify({ error: e3.message }), {
          status: 400,
          headers: cors(origin),
        });

      return new Response(JSON.stringify(exp), {
        status: 201,
        headers: cors(origin),
      });
    }

    // ---- UPDATE ----
    if (action === "update_explicador") {
      const {
        id_explicador,
        nome,
        apelido = null,
        contacto = null,
        email,
        max = 0,
      } = payload || {};
      if (!id_explicador || !nome || !email) {
        return new Response(
          JSON.stringify({
            error: "id_explicador, nome e email são obrigatórios",
          }),
          { status: 400, headers: cors(origin) }
        );
      }
      const { data, error } = await svc
        .from("explicadores")
        .update({ nome, apelido, contacto, email, max })
        .eq("id_explicador", id_explicador)
        .select("id_explicador, user_id, nome, apelido, email, contacto, max")
        .single();
      if (error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: cors(origin),
        });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: cors(origin),
      });
    }

    // ---- RESET PASSWORD (alias) ----
    if (action === "reset_password" || action === "update_password") {
      const { id_explicador, user_id, new_password } = payload || {};
      if (!new_password || String(new_password).length < 6) {
        return new Response(
          JSON.stringify({ error: "new_password (>=6) é obrigatório" }),
          { status: 400, headers: cors(origin) }
        );
      }
      let uid = user_id;
      if (!uid) {
        // procurar por id_explicador
        const { data: exp, error: expErr } = await svc
          .from("explicadores")
          .select("user_id")
          .eq("id_explicador", id_explicador)
          .single();
        if (expErr)
          return new Response(JSON.stringify({ error: expErr.message }), {
            status: 400,
            headers: cors(origin),
          });
        uid = exp.user_id;
      }
      const { error } = await svc.auth.admin.updateUserById(uid, {
        password: new_password,
      });
      if (error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: cors(origin),
        });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: cors(origin),
      });
    }

    // ---- DELETE (alias) ----
    if (action === "delete_explicador" || action === "delete_user") {
      const { id_explicador, user_id } = payload || {};
      let uid = user_id;

      if (!uid) {
        // obter user_id a partir de id_explicador
        const { data: exp, error: expErr } = await svc
          .from("explicadores")
          .select("user_id")
          .eq("id_explicador", id_explicador)
          .single();
        if (expErr)
          return new Response(JSON.stringify({ error: expErr.message }), {
            status: 400,
            headers: cors(origin),
          });
        uid = exp.user_id;
      }

      // (opcional) valida dependências (alunos, etc.)

      await svc
        .from("app_users")
        .delete()
        .eq("user_id", uid)
        .eq("role", "explicador");
      if (id_explicador)
        await svc
          .from("explicadores")
          .delete()
          .eq("id_explicador", id_explicador);
      else await svc.from("explicadores").delete().eq("user_id", uid);

      const { error: delErr } = await svc.auth.admin.deleteUser(uid);
      if (delErr)
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 400,
          headers: cors(origin),
        });

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: cors(origin),
      });
    }

    return new Response(JSON.stringify({ error: "ação inválida" }), {
      status: 400,
      headers: cors(origin),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: cors(origin),
    });
  }
});
