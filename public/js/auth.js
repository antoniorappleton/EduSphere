// =============================
// Helpers de autenticação e perfil (app_users)
// =============================

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await supabase.auth.signOut();
}

// -----------------------------
// Sessão e Utilizador
// -----------------------------

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function getAppUser() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) return null;
  return data; // { user_id, role, aluno_id, pai_id, explicador_id, ... }
}

// -----------------------------
// Redirecionamento seguro por role
// -----------------------------
async function routeByRole() {
  const session = await getSession();
  if (!session) {
    location.href = "./login.html";
    return;
  }

  const appUser = await getAppUser();

  // Caso ainda não tenha perfil criado em app_users
  if (!appUser || !appUser.role) {
    console.log(
      "Sessão válida mas app_user ainda não criado — permanece na página atual."
    );
    return; // NÃO redireciona, evita loop
  }

  // Redireciona conforme papel
  switch (appUser.role) {
    case "admin":
      if (!location.pathname.endsWith("/admin.html"))
        location.href = "./admin.html";
      break;
    case "explicador":
      if (!location.pathname.endsWith("/explicador.html"))
        location.href = "./explicador.html";
      break;
    default:
      if (!location.pathname.endsWith("/aluno.html"))
        location.href = "./aluno.html";
      break;
  }
}
