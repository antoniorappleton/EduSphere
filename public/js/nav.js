/**
 * public/js/nav.js
 * Lógica partilhada para a barra de navegação footer
 */

document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.app-nav-item');
    const currentPath = window.location.pathname;

    // 1. Identificar item ativo baseada no URL
    navItems.forEach(item => {
        const href = item.getAttribute('href') || item.getAttribute('onclick');
        
        // Verifica se o href está contido no path atual ou vice-versa
        if (href && (currentPath.endsWith(href) || href.includes(currentPath.split('/').pop()))) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // 2. Adicionar classe de compensação ao body
    if (document.querySelector('.app-footer-nav')) {
        document.body.classList.add('has-footer-nav');
    }

    // 3. Lógica de Logout Centralizada
    async function handleLogout() {
        if (typeof supabase !== 'undefined') {
            await supabase.auth.signOut();
        }
        // Redirecionar para a index (raiz)
        const pathParts = window.location.pathname.split('/');
        // Se estivermos em pages/explicador/, precisamos subir dois níveis
        if (window.location.pathname.includes('/pages/explicador/')) {
            window.location.href = '../../index.html';
        } else {
            window.location.href = 'index.html';
        }
    }

    document.getElementById('btnLogoutNav')?.addEventListener('click', handleLogout);
    document.getElementById('btnLogoutHeader')?.addEventListener('click', handleLogout);
});
