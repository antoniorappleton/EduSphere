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
      .eq('id_explicador', explId)
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
         .eq('id_aluno', al.id_aluno)
         .eq('ano', currentYear)
         .eq('mes', currentMonth)
         .maybeSingle();
       
       // Fetch Next Session
       const { data: sess } = await supabase
         .from('sessoes_explicacao') 
         .select('data, hora_inicio, estado') 
         .eq('id_aluno', al.id_aluno)
         .gte('data', today) 
         .order('data', { ascending: true })
         .limit(1)
         .maybeSingle();

       enriched.push({
         ...al,
         estado_mensalidade: pag ? pag.estado : 'PENDENTE',
         proxima_sessao: sess ? `${sess.data} ${sess.hora_inicio || ''}` : null
       });
    }

    return enriched;
  },

  // 2. CRIAR ALUNO
  async createAluno(payload) {
    const explId = await this.getMyExplId();
    if (!explId) throw new Error("Explicador não encontrado.");
    return { error: "Criação de aluno requer Backend (Edge Function). Tente usar o SQL Editor." };
  },
  
  // 3. GET ALUNO DETAILS
  async getAluno(id) {
    const { data, error } = await supabase.from('alunos').select('*').eq('id_aluno', id).single(); 
    if(error) throw error;
    return data;
  }
};
