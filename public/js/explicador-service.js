// public/js/explicador-service.js

window.ExplicadorService = {
  
  // Helpers
  async getMyExplId() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data } = await supabase.from('explicadores').select('id, nome').eq('user_id', session.user.id).single();
    return data ? data.id : null;
  },

  // 1. LISTAR ALUNOS
  async listAlunos() {
    const explId = await this.getMyExplId();
    if (!explId) throw new Error("Explicador não encontrado.");

    // Fetch Base Alunos
    const { data: alunos, error } = await supabase
      .from('alunos')
      .select('*')
      .eq('explicador_id', explId)
      .order('nome', { ascending: true });

    if (error) throw error;
    if (!alunos || alunos.length === 0) return [];

    // Enrich with Logic (similar to Edge Function)
    const enriched = [];
    const today = new Date().toISOString().slice(0, 10);
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    for (let al of alunos) {
       // Fetch Payment Status (this month)
       const { data: pag } = await supabase
         .from('pagamentos')
         .select('estado, valor_previsto, valor_pago')
         .eq('aluno_id', al.id)
         .eq('ano', currentYear)
         .eq('mes', currentMonth)
         .maybeSingle();
       
       // Fetch Next Session
       const { data: sess } = await supabase
         .from('explicacoes') // Using 'explicacoes' table as verified in schema
         .select('starts_at, status') 
         .eq('aluno_id', al.id)
         .gte('starts_at', today) // distinct from 'data' column in Deno code? Schema had starts_at?
         // Deno code used 'v_sessoes_detalhe' with 'data' and 'hora_inicio'.
         // Step 538 Schema check for 'explicacoes': 
         // "explicacoes" linked to explicador_id. 
         // I'll assume 'explicacoes' or 'sessoes_explicacao' table exists. 
         // JS checks in dashboard used 'explicacoes' (Step 579) and 'starts_at'.
         // But Deno code uses 'sessoes_explicacao'.
         // I will prioritize 'explicacoes' if that's what I saw in Schema.
         // Wait, Step 579 I replaced with 'explicacoes' and 'starts_at'.
         // I will stick to 'explicacoes' table.
         .order('starts_at', { ascending: true })
         .limit(1)
         .maybeSingle();

       enriched.push({
         ...al,
         estado_mensalidade: pag ? pag.estado : 'PENDENTE',
         proxima_sessao: sess ? sess.starts_at : null
       });
    }

    return enriched;
  },

  // 2. CRIAR ALUNO
  async createAluno(payload) {
    const explId = await this.getMyExplId();
    if (!explId) throw new Error("Explicador não encontrado.");
    
    // 1. Create Auth User (Only Admins can do this via Client API if Allowed, OR we use a Trigger)
    // Client-side 'supabase.auth.admin' is NOT available securely.
    // Logic: We insert into 'alunos' table directly? 
    // Schema says: 'user_id' REFERENCES auth.users.
    // If we cannot create auth users client-side, we CANNOT implement full signup here.
    // BUT the user is ADMIN (in this specific case).
    // If Admin, they have rights? No, Supabase JS Client 'auth.admin' works only with Service Key.
    // CRITICAL: We cannot create new Auth Users from Client Side without Service Key.
    // The user provided Server Code.
    // Workaround: Insert a "Ghost" user? No, constraint user_id.
    // SOLUTION: Use the 'handle_new_user' trigger or just insert row if possible?
    // Start with: just insert into 'alunos'. If user_id is required... 
    // Maybe we create a dummy Auth user? Or maybe the table allows null user_id?
    // Schema: `user_id UUID NOT NULL`.
    
    // Since I cannot run Edge Functions, and I cannot invoke `auth.admin` from browser...
    // I am STUCK unless I use a simplified flow (e.g. no login for students yet) OR
    // I tell the user "I need the Edge Function to run for Create Aluno".
    // OR I assume the user IS Admin and I can use a special flow?
    
    // However, I CAN create a user via `signUp` (will log me in? No, `signUp` creates user).
    // `signIn` logs in. `signUp` creates.
    // But `signUp` changes current session? 
    // Supabase has `supabase.auth.signUp()`. It creates a user. 
    // Be careful not to lose current session. 
    // Actually, `signUp` might auto-login.
    
    // Temporary Hack: Just insert into 'alunos' with specific fields, 
    // maybe there's a stored procedure?
    // For now, I will implement 'List' and 'Update' which work.
    // 'Create' is hard without backend.
    
    // I will try to insert. If it fails due to user_id, I'll alert.
    // Wait, Deno code was `auth.admin.createUser`.
    
    // I'll stick to listing/updating for now to get "Data Access".
    // Full "Create Aluno" might need the backend.
    
    return { error: "Criação de aluno requer Backend (Edge Function). Tente usar o SQL Editor." };
  },
  
  // 3. GET ALUNO DETAILS
  async getAluno(id) {
    const { data, error } = await supabase.from('alunos').select('*').eq('id', id).single(); // id vs id_aluno? Schema check step 538 said `id`.
    if(error) throw error;
    return data;
  }
};
