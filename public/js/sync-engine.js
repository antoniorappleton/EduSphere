// public/js/sync-engine.js
// Motor de Sincronização Híbrido para EduSphere

window.SyncEngine = {
  syncInProgress: false,

  async requestSync() {
    console.log("🔄 Sync request received");
    
    // 1. Tentar Background Sync se disponível (Service Worker)
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-outbox');
        console.log("✅ Background Sync registered");
      } catch (e) {
        console.warn("⚠️ Background Sync registration failed, falling back to manual sync", e);
        this.syncNow();
      }
    } else {
      // 2. Fallback para Sync Manual
      this.syncNow();
    }
  },

  async syncNow() {
    if (this.syncInProgress) {
      console.log("⏳ Sync already in progress, skipping...");
      return;
    }
    
    if (!navigator.onLine) {
      console.log("🚫 Offline, cannot sync now.");
      return;
    }

    const pending = await OutboxManager.getPending();
    if (pending.length === 0) {
      console.log("✅ Nothing to sync.");
      return;
    }

    this.syncInProgress = true;
    console.log(`🚀 Starting sync of ${pending.length} items...`);

    for (const item of pending) {
      try {
        await this.processItem(item);
        await OutboxManager.markSuccess(item.id);
        console.log(`✅ Item ${item.operation_id} synced successfully`);
      } catch (err) {
        console.error(`❌ Failed to sync item ${item.operation_id}:`, err);
        await OutboxManager.markFailure(item.id, err.message);
        // Se houver erro de rede, paramos o processamento do resto da fila
        if (!navigator.onLine) break;
      }
    }

    this.syncInProgress = false;
    // Disparar evento global para atualizar UI se necessário
    window.dispatchEvent(new CustomEvent('edusphere-sync-completed'));
    window.dispatchEvent(new CustomEvent('sync-status-updated'));
  },

  initOfflineUI() {
    const statusEl = document.getElementById('connectionStatus');
    const syncEl = document.getElementById('syncIndicator');

    const updateStatus = () => {
      if (!statusEl) return;
      const isOnline = navigator.onLine;
      statusEl.className = `connection-badge ${isOnline ? 'online' : 'offline'}`;
      statusEl.querySelector('.label').textContent = isOnline ? 'Online' : 'Offline';
    };

    const updateSyncCounter = async () => {
      if (!syncEl || typeof EduSphereDB === 'undefined') return;
      const count = await EduSphereDB.outbox.where('status').equals('pending').count();
      if (count > 0) {
        syncEl.classList.remove('hidden');
        syncEl.querySelector('.count').textContent = count;
      } else {
        syncEl.classList.add('hidden');
      }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    window.addEventListener('sync-status-updated', updateSyncCounter);
    window.addEventListener('edusphere-sync-completed', () => {
      updateSyncCounter();
    });

    updateStatus();
    updateSyncCounter();
  },

  async processItem(item) {
    // Aqui invocamos o serviço real
    const { action, entity_type, payload } = item;

    if (entity_type === 'sessao') {
      if (action === 'update' || action === 'insert') {
        // Usar o serviço real, mas garantir que ele NÃO entra em loop infinito de cache
        // Passamos um flag p/ o serviço saber que é um sync
        await ExplicadorService.upsertSessao(payload, { isSync: true });
      } else if (action === 'delete') {
        await ExplicadorService.deleteSessao(item.entity_id, { isSync: true });
      }
    }
    // Adicionar outros types aqui conforme necessário (alunos, pagamentos)
  }
};

// --- GATILHOS ---

// 1. Quando o browser volta a ficar online
window.addEventListener('online', () => {
  console.log("🌐 Online event detected!");
  SyncEngine.syncNow();
});

// 2. Polling de segurança (cada 60 segundos se houver pendentes)
setInterval(async () => {
  const count = await EduSphereDB.outbox.where('status').equals('pending').count();
  if (count > 0 && navigator.onLine) {
    SyncEngine.syncNow();
  }
}, 60000);

// 3. Ao carregar a página
window.addEventListener('load', () => {
  if (navigator.onLine) SyncEngine.syncNow();
});

// 4. Mensagens do Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SYNC_NOW') {
      console.log("📨 Sync message from Service Worker received");
      SyncEngine.syncNow();
    }
  });
}
