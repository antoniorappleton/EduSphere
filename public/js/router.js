const APP_VERSION = window.APP_VERSION || '2026.09.21';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`/service-worker.js?v=${APP_VERSION}`)
      .then((reg) => {
        console.log('SW registado:', reg.scope);
      })
      .catch((err) => {
        console.error('Erro ao registar SW:', err);
      });
  });
}
