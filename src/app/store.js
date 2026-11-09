// Vuex fica no ARRANQUE BASE (não há store por feature): um módulo de exemplo,
// namespaced, para mostrar o caminho do estado partilhado. Para acrescentar
// estado global: copiar o padrão `base`, registar AQUI e usar nos .vue com
// mapState('base', ['record']) / this.$store.dispatch('base/updateRecord', ...).
//
// O que merece Vuex é o estado que ATRAVESSA features. Estado local de vista fica
// em data(); sessão e permissões ficam em core/ (session.js e ability.js), que já
// são reactivos por si — não duplicar aqui o que lá já reage.

import config from '../core/config.js';

// Módulo de exemplo (namespaced) — usado pela Home (features/site/BaseComponent.vue).
const base = {
    namespaced: true,
    state: function () {
        return { record: null };
    },
    mutations: {
        setRecord(state, data) {
            state.record = data;
        },
    },
    actions: {
        updateRecord(context, data) {
            context.commit('setRecord', data);
        },
    },
    getters: {
        // modificadores / filtros do state
    },
};

/**
 * Cria o store Vuex da app (chamado UMA vez pelo main.js). Para estado global
 * novo: copiar o padrão `base`, registar em modules e usar nos .vue com
 * mapState('base', [...]) / this.$store.dispatch('base/updateRecord', ...).
 * @returns {Object} store Vuex (strict apenas em config.debug)
 */
export function createStore() {
    return new Vuex.Store({
        // O modo estrito faz observação profunda do state: só em desenvolvimento.
        strict: config.debug,
        modules: {
            base: base,
        },
    });
}
