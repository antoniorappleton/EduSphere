// login do aluno
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("msg");
  msg.textContent = "";

  const email = e.target.email.value.trim();
  const password = e.target.password.value;

  const { error } = await window.supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    msg.textContent = error.message;
    return;
  }

  const {
    data: { user },
  } = await window.supabase.auth.getUser();
  const { data: profile, error: pErr } = await window.supabase
    .from("app_users")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (pErr || !profile) {
    msg.textContent = "Conta sem perfil associado.";
    return;
  }
  if (profile.role !== "aluno") {
    msg.textContent = "Esta página é só para Aluno.";
    return;
  }

  location.href = "./aluno.html";
});
