// public/js/supabaseClient.js

// credenciais do teu projeto
const SUPABASE_URL = "https://notktinqokknnbjwuuot.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdGt0aW5xb2trbm5iand1dW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NTg2ODksImV4cCI6MjA3NzEzNDY4OX0.OIfmWOwXo8iegnqPGPz82pzU4atGad_glQ1Bidi0cLE";

// função que aguarda a lib @supabase carregar
(function initSupabase() {
  if (typeof window.supabase === "undefined") return setTimeout(initSupabase, 50);
  window.SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("✅ Supabase client inicializado");
})();

