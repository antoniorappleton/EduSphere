// public/js/explicador-service.js

window.ExplicadorService = {
  // Helpers
  async getMyExplId() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;
    const { data } = await supabase
      .from("explicadores")
      .select("id_explicador")
      .eq("user_id", session.user.id)
      .maybeSingle();
    return data ? data.id_explicador : null;
  },

  // 1. LISTAR ALUNOS
  async listAlunos() {
    try {
      const { data, error } = await supabase.functions.invoke("expl-alunos", {
        body: { action: "list_alunos" },
      });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn(
        "Edge Function expl-alunos (list_alunos) falhou, tentando fallback direto:",
        err,
      );
      // Fallback manual (pode ter menos dados enriquecidos se RLS for restrito)
      const explId = await this.getMyExplId();
      if (!explId) throw new Error("Explicador não encontrado.");

      const { data: alunos, error } = await supabase
        .from("alunos")
        .select("*")
        .eq("id_explicador", explId)
        .order("nome", { ascending: true });

      if (error) throw error;
      return alunos || [];
    }
  },

  // 2. CRIAR ALUNO
  async createAluno(payload) {
    // payload deve conter: nome, email, password + opcionais
    const { data, error } = await supabase.functions.invoke("expl-alunos", {
      body: { action: "create_aluno", payload },
    });

    if (error) {
      console.error("Erro ao criar aluno via Edge Function:", error);
      // Tentar extrair erro detalhado do corpo da resposta se for um FunctionsHttpError
      try {
        if (error.context && typeof error.context.json === "function") {
          const body = await error.context.json();
          if (body && body.error) {
            const detailedErr = new Error(body.error);
            if (body.details) detailedErr.details = body.details;
            throw detailedErr;
          }
        }
      } catch (e) {
        if (e.message !== error.message) throw e;
      }
      throw error;
    }
    return data;
  },

  // 2b. ATUALIZAR ALUNO
  async updateAluno(payload) {
    const { data, error } = await supabase.functions.invoke("expl-alunos", {
      body: { action: "update_aluno", payload },
    });
    if (error) {
      console.error("Erro ao atualizar aluno via Edge Function:", error);
      try {
        if (error.context && typeof error.context.json === "function") {
          const body = await error.context.json();
          if (body && body.error) {
            const detailedErr = new Error(body.error);
            if (body.details) detailedErr.details = body.details;
            throw detailedErr;
          }
        }
      } catch (e) {
        if (e.message !== error.message) throw e;
      }
      throw error;
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  },

  // 2c. ELIMINAR ALUNO
  async deleteAluno(id_aluno) {
    const { data, error } = await supabase.functions.invoke("expl-alunos", {
      body: { action: "delete_aluno", payload: { id_aluno } },
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    return data;
  },

  // 3. GET ALUNO DETAILS
  async getAluno(id) {
    const { data, error } = await supabase
      .from("alunos")
      .select("*")
      .eq("id_aluno", id)
      .single();
    if (error) throw error;
    return data;
  },

  // 4. CALENDÁRIO / SESSÕES
  async listSessoes(alunoId = null) {
    const action = alunoId ? "list_sessoes_aluno" : "list_sessoes_explicador";
    const payload = alunoId ? { id_aluno: alunoId } : {};

    try {
      const { data, error } = await supabase.functions.invoke("expl-alunos", {
        body: { action, payload },
      });
      if (error) throw error;

      const sessoes = data || [];
      // ATUALIZAR CACHE LOCAL (Optimistic/Background)
      if (typeof db !== "undefined") {
        db.sessoes.bulkPut(sessoes.map((s) => ({ ...s, pending_sync: false })));
      }
      return sessoes;
    } catch (err) {
      console.warn("listSessoes falhou (offline?), usando cache local:", err);
      if (typeof db !== "undefined") {
        if (alunoId) {
          return await db.sessoes.where("id_aluno").equals(alunoId).toArray();
        } else {
          return await db.sessoes.toArray();
        }
      }
      throw err;
    }
  },

  async upsertSessao(payload, options = {}) {
    // 1. ADICIONAR METADADOS DE CONFLITO
    if (!payload.operation_id) payload.operation_id = crypto.randomUUID();
    payload.updated_at = new Date().toISOString();

    // Se for um Sync, não fazemos cache recursivo
    if (!options.isSync && typeof db !== "undefined") {
      // CACHE OPTIMISTIC
      await db.sessoes.put({ ...payload, pending_sync: true });
    }

    try {
      const { data, error } = await supabase.functions.invoke("expl-alunos", {
        body: { action: "upsert_sessao_aluno", payload },
      });
      if (error) throw error;

      // Sucesso: marcar como sincronizado no local
      if (typeof db !== "undefined") {
        await db.sessoes.update(payload.id_sessao || data.id_sessao, {
          pending_sync: false,
        });
      }
      return data;
    } catch (err) {
      if (options.isSync) throw err; // Repassar erro se for o SyncEngine a tentar

      console.warn("upsertSessao falhou (offline), guardando na Outbox:", err);
      if (typeof OutboxManager !== "undefined") {
        await OutboxManager.enqueue(
          "update",
          "sessao",
          payload.id_sessao || "new",
          payload,
        );
        // Tentar registar sync automático
        if (typeof SyncEngine !== "undefined") SyncEngine.requestSync();
        return { ...payload, offline: true };
      }
      throw err;
    }
  },

  async deleteSessao(id_sessao) {
    const { data, error } = await supabase.functions.invoke("expl-alunos", {
      body: { action: "delete_sessao_aluno", payload: { id_sessao } },
    });
    if (error) throw error;
    return data;
  },

  // 5. EXERCÍCIOS & STORAGE
  async listExercicios(alunoId) {
    const { data, error } = await supabase
      .from("exercicios")
      .select("*")
      .eq("id_aluno", alunoId)
      .order("data_envio", { ascending: false });
    if (error) throw error;
    return data;
  },

  async createExercicio(payload) {
    // payload: { id_aluno, nome, tipo, url, data_entrega_prevista }
    const { data, error } = await supabase.functions.invoke("expl-alunos", {
      body: { action: "create_exercicio", payload },
    });
    if (error) throw error;
    return data;
  },

  async deleteExercicio(id_exercicio) {
    const { data, error } = await supabase.functions.invoke("expl-alunos", {
      body: { action: "delete_exercicio", payload: { id_exercicio } },
    });
    if (error) throw error;
    return data;
  },

  async uploadFile(file) {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data, error } = await supabase.storage
      .from("exercicios")
      .upload(filePath, file);

    if (error) throw error;

    // Obter URL pública
    const {
      data: { publicUrl },
    } = supabase.storage.from("exercicios").getPublicUrl(filePath);

    return { path: filePath, url: publicUrl };
  },

  // 5. FATURAÇÃO & RELATÓRIOS
  async generateMonthlyBilling(ano, mes) {
    const { data, error } = await supabase.functions.invoke("expl-alunos", {
      body: { action: "generate_monthly_billing", payload: { ano, mes } },
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
    const { data, error } = await supabase.functions.invoke("expl-alunos", {
      body: { action: "get_relatorios" },
    });
    if (error) throw error;
    return data;
  },

  // 6. GESTÃO DE PAGAMENTOS (CRUD)
  async upsertPagamento(payload) {
    // payload: { id_pagamento?, id_aluno, ano, mes, valor_previsto, valor_pago, data_pagamento, estado }
    const { data, error } = await supabase.functions.invoke("expl-alunos", {
      body: { action: "upsert_pagamento_aluno", payload },
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    return data;
  },

  async deletePagamento(id_pagamento) {
    const { data, error } = await supabase.functions.invoke("expl-alunos", {
      body: { action: "delete_pagamento_aluno", payload: { id_pagamento } },
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    return data;
  },

  // 7. SINO DE AVISO (toggle mensalidade_avisada)
  async setMensalidadeAvisada(alunoId, avisado) {
    const { data, error } = await supabase.functions.invoke("expl-alunos", {
      body: {
        action: "set_mensalidade_avisada",
        payload: { aluno_id: alunoId, avisado },
      },
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    return data;
  },
};
