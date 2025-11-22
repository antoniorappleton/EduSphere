if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => {
        console.log('SW registado:', reg.scope);
      })
      .catch((err) => {
        console.error('Erro ao registar SW:', err);
      });
  });
}
