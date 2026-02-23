// public/js/auth.js
// Gestão centralizada de autenticação e permissões

(function initAuth() {
  // Se o supabase ainda não estiver pronto, aguardar
  if (!window.supabase || !window.supabase.auth) {
    return setTimeout(initAuth, 50);
  }

  /**
   * Retorna o utilizador da sessão atual, se existir.
   */
  async function getSessionUser() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user || null;
    } catch (e) {
      console.error("Auth helper: getSessionUser error", e);
      return null;
    }
  }

  /**
   * Verifica se o utilizador atual tem o papel (role) necessário.
   * Suporta hierarquia: 'admin' tem acesso a tudo.
   *
   * @param {string} roleRequired - O papel mínimo necessário ('admin', 'explicador', 'aluno')
   * @param {string} redirect - URL para onde redirecionar se falhar (opcional)
   */
  async function requireRole(roleRequired, redirect = null) {
    const user = await getSessionUser();

    const fail = (reason) => {
      console.warn(`Auth check failed: ${reason}`);
      if (redirect) {
        console.log(`Redirecting to: ${redirect}`);
        window.location.href = redirect;
      }
      return null;
    };

    if (!user) return fail("No session found");

    // Mudança: selecionamos todos os perfis (evita PGRST116 se houver duplicados)
    const { data: profiles, error } = await supabase
      .from("app_users")
      .select("role")
      .eq("user_id", user.id);

    if (error) return fail(`Error fetching profile: ${error.message}`);
    if (!profiles || profiles.length === 0)
      return fail("No profile found in app_users");

    const roles = profiles.map((p) => p.role);

    // HIERARQUIA: Admin pode tudo.
    if (roles.includes("admin")) return user;

    // Se o papel pedido estiver na lista, OK.
    if (roles.includes(roleRequired)) return user;

    // Caso contrário, barrar acesso.
    return fail(
      `User roles [${roles.join(", ")}] do not satisfy '${roleRequired}'`,
    );
  }

  async function signOut(to = "../index.html") {
    await supabase.auth.signOut();
    window.location.href = to;
  }

  // Expor globalmente
  window.Auth = {
    getSessionUser,
    requireRole,
    signOut,
    isReady: true, // Sinal para ecrãs que esperam pelo helper
  };

  // Disparar evento para scripts que carregam 'defer' e precisam do Auth
  window.dispatchEvent(new Event("auth-ready"));
  console.log("✅ Auth helper inicializado (suporta hierarquia)");
})();
