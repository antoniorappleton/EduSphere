// Helpers de autenticação e perfil (app_users)

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
  if (error) throw error;
  return data; // { user_id, role, aluno_id, pai_id, ... }
}

// Redireciona conforme role em app_users
async function routeByRole() {
  const appUser = await getAppUser();
  if (!appUser) {
    // Sem mapeamento ainda => vai para login
    location.href = "./login.html";
    return;
  }
  if (appUser.role === "admin") location.href = "./admin.html";
  else location.href = "./aluno.html";
}
