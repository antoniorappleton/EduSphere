(async () => {
  const me = await getAppUser();
  if (!me || me.role !== "admin") {
    location.href = "./login.html";
    return;
  }
  document.getElementById("logout").addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut();
    location.href = "./login.html";
  });
  // aqui iremos ligar CRUD global (alunos/pais/explicadores/etc.)
})();
