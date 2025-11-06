// Espera pelo supabase global e expõe helpers
(function initAuth() {
  if (!window.supabase || !window.supabase.auth)
    return setTimeout(initAuth, 25);

  async function getSessionUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user || null;
  }

  async function requireRole(role, redirect = "./login.html") {
    const user = await getSessionUser();
    if (!user) {
      location.href = redirect;
      return null;
    }
    const { data, error } = await supabase
      .from("app_users")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (error || !data || data.role !== role) {
      location.href = redirect;
      return null;
    }
    return user; // autorizado
  }

  async function signOut(to = "./index.html") {
    await supabase.auth.signOut();
    location.href = to;
  }

  // expor
  window.Auth = { getSessionUser, requireRole, signOut };
})();
