// Guard: se já tem sessão, roteia por role
getSession().then((s) => {
  if (s) routeByRole();
});

const form = document.getElementById("loginForm");
const msg = document.getElementById("msg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  const email = e.target.email.value.trim();
  const password = e.target.password.value;
  try {
    await signIn(email, password);
    await routeByRole();
  } catch (err) {
    msg.textContent = err.message;
  }
});

document.getElementById("demoSignup").addEventListener("click", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  const email = `demo+${Date.now()}@example.com`;
  const password = "12345678";
  try {
    await signUp(email, password);
    msg.style.color = "#126b3a";
    msg.textContent = `Conta criada: ${email}. Faz login (e mapeia em app_users).`;
  } catch (err) {
    msg.style.color = "#a92a1f";
    msg.textContent = err.message;
  }
});
// Registo como Explicador (sign up -> cria explicador -> mapeia em app_users -> entra)
document.getElementById('fSignupExpl')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const m = document.getElementById('signupExplMsg');
  m.textContent = ''; m.style.color = '';

  const fd = new FormData(e.target);
  const nome = fd.get('nome').toString().trim();
  const contacto = (fd.get('contacto')||'').toString().trim() || null;
  const email = fd.get('email').toString().trim();
  const password = fd.get('password').toString();

  try {
    // 1) Sign up
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) throw signUpErr;

    // Algumas configs exigem verificação por email → avisar e parar aqui
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      m.style.color = '#126b3a';
      m.textContent = 'Conta criada. Verifique o seu email para confirmar e depois faça login.';
      return;
    }

    // 2) Criar perfil de explicador (RLS permite inserir se o email for o do próprio user)
    const { data: eIns, error: eErr } = await supabase
      .from('explicadores')
      .insert([{ nome, contacto, email }])
      .select('id_explicador')
      .single();
    if (eErr) throw eErr;

    // 3) Mapear em app_users como explicador
    const { error: mapErr } = await supabase
      .from('app_users')
      .upsert({ user_id: sess.session.user.id, role: 'explicador', explicador_id: eIns.id_explicador }, { onConflict: 'user_id' });
    if (mapErr) throw mapErr;

    // 4) Entrar e redirecionar
    m.style.color = '#126b3a';
    m.textContent = 'Conta criada com sucesso! A redirecionar…';
    await routeByRole();
  } catch (err) {
    m.style.color = '#a92a1f';
    m.textContent = err.message;
  }
});
// Auto-claim: se há sessão mas ainda não há app_user, tentar ligar como ALUNO por email
(async ()=>{
  const s = await getSession();
  if (!s) return;

  const existing = await getAppUser();
  if (existing) return; // já tem perfil

  const myEmail = s.user?.email;
  if (!myEmail) return;

  try {
    // 1) Procurar um aluno com o meu email
    const { data: aluno, error: aErr } = await supabase
      .from('alunos')
      .select('id_aluno')
      .eq('email', myEmail)
      .maybeSingle();
    if (aErr || !aluno) {
      console.log('Sem aluno com este email. Se for explicador, use o formulário de explicador.');
      return;
    }

    // 2) Ligar-me como role 'aluno'
    const { error: uErr } = await supabase
      .from('app_users')
      .upsert({
        user_id: s.user.id,
        role: 'aluno',
        aluno_id: aluno.id_aluno
      }, { onConflict: 'user_id' });
    if (uErr) throw uErr;

    // 3) Redirecionar
    await routeByRole();
  } catch (e) {
    console.warn('Auto-claim falhou:', e.message);
  }
})();
