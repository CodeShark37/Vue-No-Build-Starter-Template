// Tema claro/escuro — DONO da política: sem escolha guardada (localStorage
// 'theme') segue o SO (prefers-color-scheme) e reage em directo a mudanças
// dele; depois de o utilizador escolher, a escolha manda. O espelho desta
// política ANTES da 1.ª pintura é core/theme-boot.js (script clássico no
// <head>; módulos ES são diferidos, não chegam lá) — alterar um, alterar o
// outro.
//
// Fonte de verdade: o atributo data-theme em <html> ('light'|'dark'),
// partilhado com o CSS (src/ui/theme.css). A UI não lê o DOM nem o
// localStorage: consome this.$theme (serviço reactivo registado em
// app/services.js) — o mesmo padrão de $auth/$perm.

const KEY = 'theme';

// Aceita só os dois valores do contrato; lixo/ausência caem em 'light'.
function normalise(value) {
    return value === 'dark' ? 'dark' : 'light';
}

// Espelho reactivo do atributo (o ícone do toggle acompanha o tema sem
// watchers manuais — mesma técnica do $auth, Vue.observable). O valor inicial
// já foi escrito em <html> pelo core/theme-boot.js.
const state = Vue.observable({ theme: normalise(document.documentElement.dataset.theme) });

// Aplica ao DOM SEM persistir (a escolha continua a ser do SO).
function paint(value) {
    document.documentElement.dataset.theme = value;
    state.theme = value;
}

/**
 * Serviço de tema para os componentes (this.$theme).
 */
export const theme = {
    /** Tema actual. @returns {string} 'light' | 'dark' */
    get current() { return state.theme; },
    /** Escolha EXPLÍCITA do utilizador: aplica e grava. */
    set(next) {
        const value = normalise(next);
        paint(value);
        try {
            localStorage.setItem(KEY, value);
        } catch (e) { /* storage indisponível: aplica sem persistir */ }
    },
    /** Alterna light <-> dark e grava a escolha do utilizador. */
    toggle() {
        theme.set(state.theme === 'dark' ? 'light' : 'dark');
    },
    /** 1× no arranque (main.js): segue o SO enquanto não houver escolha. */
    init() {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
            let stored = null;
            try { stored = localStorage.getItem(KEY); } catch (err) { /* idem */ }
            if (!stored) paint(e.matches ? 'dark' : 'light');
        });
    },
};
