// @ts-nocheck
// Edge Function: admin-users
// Ações suportadas:
//  - list_explicadores
//  - set_block
//  - create_explicador
//  - update_explicador
//  - reset_password / update_password
//  - delete_explicador / delete_user

import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10?target=deno";

// ⚠️ Definir estes secrets no dashboard da Supabase (Config / Secrets)
const URL = Deno.env.get("https://notktinqokknnbjwuuot.supabase.co");
const ANON = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdGt0aW5xb2trbm5iand1dW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NTg2ODksImV4cCI6MjA3NzEzNDY4OX0.OIfmWOwXo8iegnqPGPz82pzU4atGad_glQ1Bidi0cLE");
const SVC  = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdGt0aW5xb2trbm5iand1dW90Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTU1ODY4OSwiZXhwIjoyMDc3MTM0Njg5fQ.hKAQ8_AlkLSPGFVnlo6tuhr10GBZvlxza0PScPNWN2I");

if (!URL || !ANON || !SVC) {
  throw new Error(
    "Faltam SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente."
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

  // Pré-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors(origin) });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método não suportado. Usa POST." }),
      { status: 405, headers: cors(origin) }
    );
  }

  try {
    // 1) Cliente com ANON + Authorization do utilizador → respeita RLS e permite obter o user atual
    const userClient = createClient(URL, ANON, {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") || "",
        },
      },
      auth: {
        persistSession: false,
      },
    });

    // 2) Obter utilizador autenticado
    const { data: me, error: meErr } = await userClient.auth.getUser();
    if (meErr || !me?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: cors(origin),
      });
    }
    const myUid = me.user.id;

    // 3) Verificar se é ADMIN na tabela app_users
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

    // 4) Cliente com SERVICE_ROLE → ignora RLS + permite Admin API
    const svc = createClient(URL, SVC, {
      auth: { persistSession: false },
    });

    // 5) Ler body
    const { action, payload } = await req
      .json()
      .catch(() => ({ action: null, payload: null }));

    if (!action) {
      return new Response(JSON.stringify({ error: "Ação em falta." }), {
        status: 400,
        headers: cors(origin),
      });
    }

    // ==========================
    //   AÇÃO: LISTAR EXPLICADORES
    // ==========================
    if (action === "list_explicadores") {
      const { data, error } = await svc
        .from("explicadores")
        .select(
          "id_explicador, user_id, nome, apelido, email, contacto, max, is_blocked, blocked_until"
        )
        .order("nome", { ascending: true });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      // devolve um array – é isto que o admin.js espera
      return new Response(JSON.stringify(data ?? []), {
        status: 200,
        headers: cors(origin),
      });
    }

// -------- CREATE_EXPLICADOR --------
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
    return new Response(JSON.stringify({
      error: "nome, email e password são obrigatórios",
    }), {
      status: 400,
      headers: cors(origin),
    });
  }

  // 1) cria user de Auth
  const { data: created, error: e1 } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (e1) {
    return new Response(JSON.stringify({ error: e1.message }), {
      status: 400,
      headers: cors(origin),
    });
  }

  const uid = created?.user?.id;
  if (!uid) {
    return new Response(JSON.stringify({
      error: "createUser não devolveu user.id",
    }), {
      status: 400,
      headers: cors(origin),
    });
  }

  // 2) registo na tabela explicadores
  const { data: exp, error: e2 } = await svc
    .from("explicadores")
    .insert({
      user_id: uid,
      nome,
      apelido,
      contacto,
      email,
      max,
      is_blocked: false,
      blocked_until: null,
    })
    .select(
      "id_explicador, user_id, nome, apelido, email, contacto, max, is_blocked, blocked_until"
    )
    .single();

  if (e2) {
    return new Response(JSON.stringify({ error: e2.message }), {
      status: 400,
      headers: cors(origin),
    });
  }

  // 3) ligação em app_users
  const { error: e3 } = await svc.from("app_users").insert({
    user_id: uid,
    role: "explicador",
    ref_id: exp.id_explicador,
  });

  if (e3) {
    return new Response(JSON.stringify({ error: e3.message }), {
      status: 400,
      headers: cors(origin),
    });
  }

  return new Response(JSON.stringify(exp), {
    status: 201,
    headers: cors(origin),
  });
}


    // ==========================
    //   AÇÃO: BLOQUEAR / DESBLOQUEAR EXPLICADOR
    // ==========================
    if (action === "set_block") {
      const { id_explicador, is_blocked, blocked_until } = payload || {};

      if (!id_explicador || typeof is_blocked !== "boolean") {
        return new Response(
          JSON.stringify({
            error: "id_explicador e is_blocked são obrigatórios",
          }),
          { status: 400, headers: cors(origin) }
        );
      }

      const { data, error } = await svc
        .from("explicadores")
        .update({ is_blocked, blocked_until })
        .eq("id_explicador", id_explicador)
        .select(
          "id_explicador, user_id, nome, apelido, email, contacto, max, is_blocked, blocked_until"
        )
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: cors(origin),
      });
    }

    // ==========================
    //   AÇÃO: CRIAR EXPLICADOR
    // ==========================
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
    return new Response(JSON.stringify({
      error: "nome, email e password são obrigatórios",
    }), {
      status: 400,
      headers: cors(origin),
    });
  }

  // 1) cria utilizador no Auth
  const { data: created, error: e1 } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (e1) {
    return new Response(JSON.stringify({ error: e1.message }), {
      status: 400,
      headers: cors(origin),
    });
  }

  const uid = created?.user?.id;
  if (!uid) {
    return new Response(JSON.stringify({
      error: "createUser não devolveu user.id",
    }), {
      status: 400,
      headers: cors(origin),
    });
  }

  // 2) registo em 'explicadores'
  const { data: exp, error: e2 } = await svc
    .from("explicadores")
    .insert({
      user_id: uid,
      nome,
      apelido,
      contacto,
      email,
      max,
      is_blocked: false,
      blocked_until: null,
    })
    .select(
      "id_explicador, user_id, nome, apelido, email, contacto, max, is_blocked, blocked_until"
    )
    .single();

  if (e2) {
    return new Response(JSON.stringify({ error: e2.message }), {
      status: 400,
      headers: cors(origin),
    });
  }

  // 3) ligação em 'app_users'
  const { error: e3 } = await svc.from("app_users").insert({
    user_id: uid,
    role: "explicador",
    ref_id: exp.id_explicador,
  });
  if (e3) {
    return new Response(JSON.stringify({ error: e3.message }), {
      status: 400,
      headers: cors(origin),
    });
  }

  return new Response(JSON.stringify(exp), {
    status: 201,
    headers: cors(origin),
  });
    }


    // ==========================
    //   AÇÃO: ATUALIZAR EXPLICADOR
    // ==========================
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

      // Obter user_id + email atual para sincronizar com Auth se necessário
      const { data: current, error: findErr } = await svc
        .from("explicadores")
        .select("user_id, email")
        .eq("id_explicador", id_explicador)
        .single();

      if (findErr) {
        return new Response(JSON.stringify({ error: findErr.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      // Se o email mudou, atualizar também no Auth
      if (current?.email && email && current.email !== email) {
        const { error: authErr } = await svc.auth.admin.updateUserById(
          current.user_id,
          { email }
        );
        if (authErr) {
          return new Response(JSON.stringify({ error: authErr.message }), {
            status: 400,
            headers: cors(origin),
          });
        }
      }

      const { data, error } = await svc
        .from("explicadores")
        .update({ nome, apelido, contacto, email, max })
        .eq("id_explicador", id_explicador)
        .select(
          "id_explicador, user_id, nome, apelido, email, contacto, max, is_blocked, blocked_until"
        )
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: cors(origin),
      });
    }

    // ==========================
    //   AÇÃO: RESET / UPDATE PASSWORD DE EXPLICADOR
    // ==========================
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
        const { data: exp, error: expErr } = await svc
          .from("explicadores")
          .select("user_id")
          .eq("id_explicador", id_explicador)
          .single();

        if (expErr) {
          return new Response(JSON.stringify({ error: expErr.message }), {
            status: 400,
            headers: cors(origin),
          });
        }
        uid = exp.user_id;
      }

      const { error } = await svc.auth.admin.updateUserById(uid, {
        password: new_password,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: cors(origin),
      });
    }

    // ==========================
    //   AÇÃO: ELIMINAR EXPLICADOR
    // ==========================
    if (action === "delete_explicador" || action === "delete_user") {
      const { id_explicador, user_id } = payload || {};
      let uid = user_id;

      if (!uid) {
        const { data: exp, error: expErr } = await svc
          .from("explicadores")
          .select("user_id")
          .eq("id_explicador", id_explicador)
          .single();

        if (expErr) {
          return new Response(JSON.stringify({ error: expErr.message }), {
            status: 400,
            headers: cors(origin),
          });
        }
        uid = exp.user_id;
      }

      // Remover papel em app_users
      await svc
        .from("app_users")
        .delete()
        .eq("user_id", uid)
        .eq("role", "explicador");

      // Remover da tabela explicadores
      if (id_explicador) {
        await svc
          .from("explicadores")
          .delete()
          .eq("id_explicador", id_explicador);
      } else {
        await svc.from("explicadores").delete().eq("user_id", uid);
      }

      // Remover do Auth
      const { error: delErr } = await svc.auth.admin.deleteUser(uid);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 400,
          headers: cors(origin),
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: cors(origin),
      });
    }

    // ==========================
    //   AÇÃO INVÁLIDA
    // ==========================
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
