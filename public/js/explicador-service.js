// public/js/explicador-service.js

window.ExplicadorService = {
  
  // Helpers
  async getMyExplId() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data } = await supabase
      .from('explicadores')
      .select('id_explicador')
      .eq('user_id', session.user.id)
      .maybeSingle();
    return data ? data.id_explicador : null;
  },

  // 1. LISTAR ALUNOS
  async listAlunos() {
    try {
      const { data, error } = await supabase.functions.invoke('expl-alunos', {
        body: { action: 'list_alunos' }
      });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn("Edge Function expl-alunos (list_alunos) falhou, tentando fallback direto:", err);
      // Fallback manual (pode ter menos dados enriquecidos se RLS for restrito)
      const explId = await this.getMyExplId();
      if (!explId) throw new Error("Explicador não encontrado.");

      const { data: alunos, error } = await supabase
        .from('alunos')
        .select('*')
        .eq('id_explicador', explId)
        .order('nome', { ascending: true });

      if (error) throw error;
      return alunos || [];
    }
  },

  // 2. CRIAR ALUNO
  async createAluno(payload) {
    // payload deve conter: nome, email, password + opcionais
    const { data, error } = await supabase.functions.invoke('expl-alunos', {
      body: { action: 'create_aluno', payload }
    });

    if (error) {
      console.error("Erro ao criar aluno via Edge Function:", error);
      throw error;
    }
    return data;
  },
  
  // 3. GET ALUNO DETAILS
  async getAluno(id) {
    const { data, error } = await supabase
      .from('alunos')
      .select('*')
      .eq('id_aluno', id)
      .single(); 
    if(error) throw error;
    return data;
  },

  // 4. CALENDÁRIO / SESSÕES
  async listSessoes(alunoId = null) {
      const action = alunoId ? 'list_sessoes_aluno' : 'list_sessoes_explicador';
      const payload = alunoId ? { aluno_id: alunoId } : {};

      const { data, error } = await supabase.functions.invoke('expl-alunos', {
        body: { action, payload }
      });
      if (error) throw error;
      return data || [];
  },

  async upsertSessao(payload) {
    // payload: { id_sessao?, id_aluno, data, hora_inicio, duracao_min, estado, notas }
    const { data, error } = await supabase.functions.invoke('expl-alunos', {
      body: { action: 'upsert_sessao_aluno', payload }
    });
    if (error) throw error;
    return data;
  },

  async deleteSessao(id_sessao) {
    const { data, error } = await supabase.functions.invoke('expl-alunos', {
      body: { action: 'delete_sessao_aluno', payload: { id_sessao } }
    });
    if (error) throw error;
    return data;
  },

  // 5. EXERCÍCIOS & STORAGE
  async listExercicios(alunoId) {
    const { data, error } = await supabase
      .from('exercicios')
      .select('*')
      .eq('id_aluno', alunoId)
      .order('data_envio', { ascending: false });
    if (error) throw error;
    return data;
  },

  async createExercicio(payload) {
    // payload: { id_aluno, id_explicador, nome, tipo, url, data_entrega_prevista }
    const { data, error } = await supabase
      .from('exercicios')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteExercicio(id) {
    const { error } = await supabase
      .from('exercicios')
      .delete()
      .eq('id_exercicio', id);
    if (error) throw error;
    return true;
  },

  async uploadFile(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data, error } = await supabase.storage
      .from('exercicios')
      .upload(filePath, file);

    if (error) throw error;

    // Obter URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('exercicios')
      .getPublicUrl(filePath);

    return { path: filePath, url: publicUrl };
  },

  // 5. FATURAÇÃO & RELATÓRIOS
  async generateMonthlyBilling(ano, mes) {
    const { data, error } = await supabase.functions.invoke('expl-alunos', {
      body: { action: 'generate_monthly_billing', payload: { ano, mes } }
    });
    
    // Se houver erro de rede/invocação
    if (error) throw error;
    
    // Se a função devolveu um erro no body (status 400+)
    if (data && data.error) {
      const err = new Error(data.error);
      if (data.details) err.details = data.details;
      throw err;
    }
    
    return data;
  },

  async getDetailedReports() {
    const { data, error } = await supabase.functions.invoke('expl-alunos', {
      body: { action: 'get_relatorios' }
    });
    if (error) throw error;
    return data;
  },

  // 6. GESTÃO DE PAGAMENTOS (CRUD)
  async upsertPagamento(payload) {
    // payload: { id_pagamento?, id_aluno, ano, mes, valor_previsto, valor_pago, data_pagamento, estado }
    const { data, error } = await supabase.functions.invoke('expl-alunos', {
      body: { action: 'upsert_pagamento_aluno', payload }
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    return data;
  },

  async deletePagamento(id_pagamento) {
    const { data, error } = await supabase.functions.invoke('expl-alunos', {
      body: { action: 'delete_pagamento_aluno', payload: { id_pagamento } }
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    return data;
  },

  // 7. SINO DE AVISO (toggle mensalidade_avisada)
  async setMensalidadeAvisada(alunoId, avisado) {
    const { data, error } = await supabase.functions.invoke('expl-alunos', {
      body: { action: 'set_mensalidade_avisada', payload: { aluno_id: alunoId, avisado } }
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    return data;
  }
};
