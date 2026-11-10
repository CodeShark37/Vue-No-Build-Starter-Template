// Boot do tema — corre em <head>, ANTES da 1.ª pintura. Script CLÁSSICO
// síncrono de propósito: módulos ES são diferidos e não chegam lá. Espelho
// mínimo da política de core/theme.js — alterar um, alterar o outro:
// sem escolha guardada (localStorage 'theme'), segue o SO
// (prefers-color-scheme); valor desconhecido não é escolha, cai no SO.
(function () {
    var stored = null;
    try { stored = localStorage.getItem('theme'); } catch (e) { /* storage indisponível */ }
    var dark = stored === 'dark' || (stored !== 'light'
        && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
