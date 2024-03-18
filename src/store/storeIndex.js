Vue.use(Vuex);

const store = new Vuex.Store({
    devtools: true,
    state: {
        baseRecord: null
    },
    mutations: {
        baseMutation(state, data) {
            state.baseRecord = data;
        }
    },
    actions: {
        baseAction({ commit }, data) {
            commit('baseMutation');
        }
    },
    getters: {
        /** modificadores , filtros dos state*/

    }
});

export default store;