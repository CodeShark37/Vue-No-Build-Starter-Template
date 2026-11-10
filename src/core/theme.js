// Tema claro/escuro. Sem escolha guardada, segue prefers-color-scheme; uma
// escolha explícita fica em localStorage. theme-boot.js aplica o mesmo contrato
// antes da primeira pintura. A fonte de verdade é data-theme em <html>.

const KEY = 'theme';

// Aceita apenas os dois valores do contrato.
function normalise(value) {
    return value === 'dark' ? 'dark' : 'light';
}

// O valor inicial já foi escrito em <html> por theme-boot.js.
const state = Vue.observable({ theme: normalise(document.documentElement.dataset.theme) });

// Aplica ao DOM sem persistir.
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
