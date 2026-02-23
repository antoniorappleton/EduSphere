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
});
