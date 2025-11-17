// public/js/supabaseClient.js

// Config do teu projeto (coloca aqui os valores reais)
const SUPABASE_URL = "https://notktinqokknnbjwuuot.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdGt0aW5xb2trbm5iand1dW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NTg2ODksImV4cCI6MjA3NzEzNDY4OX0.OIfmWOwXo8iegnqPGPz82pzU4atGad_glQ1Bidi0cLE";

(function () {
  // Verificar se o bundle UMD foi carregado
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("❌ Supabase UMD ainda não está disponível.");
    return;
  }

  // Extrair a função createClient do namespace UMD
  const { createClient } = window.supabase;

  // Criar o client
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // MUITO IMPORTANTE: substituir o global 'supabase' pelo client
  window.supabase = client;

  // (Opcional) alias extra, se quiseres
  window.sb = client;

  console.log("✅ Supabase client inicializado", client);
})();
