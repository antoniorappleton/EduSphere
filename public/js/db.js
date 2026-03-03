// public/js/db.js
// Gestão de Base de Dados Local usando Dexie.js

const db = new Dexie("EduSphereDB");

// Definição do Schema
db.version(1).stores({
  alunos: "id_aluno, nome, id_explicador, updated_at",
  sessoes: "id_sessao, id_aluno, data, id_explicador, updated_at, pending_sync",
  pagamentos: "id_pagamento, id_aluno, ano, mes, updated_at",
  outbox: "++id, operation_id, action, entity_type, entity_id, status, created_at"
});

window.EduSphereDB = db;

// Funções Utilitárias para Outbox
window.OutboxManager = {
  async enqueue(action, entityType, entityId, payload) {
    const operation_id = crypto.randomUUID();
    const entry = {
      operation_id,
      action, // 'insert', 'update', 'delete'
      entity_type: entityType, // 'sessao', 'aluno', 'pagamento'
      entity_id: entityId,
      payload: JSON.parse(JSON.stringify(payload)),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'pending',
      attempts: 0,
      last_error: null
    };
    await db.outbox.add(entry);
    return operation_id;
  },

  async getPending() {
    return await db.outbox
      .where('status')
      .equals('pending')
      .sortBy('created_at');
  },

  async markSuccess(id) {
    await db.outbox.delete(id);
  },

  async markFailure(id, errorMsg) {
    const entry = await db.outbox.get(id);
    if (!entry) return;
    await db.outbox.update(id, {
      attempts: (entry.attempts || 0) + 1,
      last_error: errorMsg,
      status: entry.attempts >= 5 ? 'failed' : 'pending' // Retry up to 5 times
    });
  }
};

console.log("📦 Dexie DB Initialized");
