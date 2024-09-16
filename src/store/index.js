 
const stores = {
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
            commit('baseMutation',data);
        }
    },
    getters: {
        /** modificadores , filtros dos state*/

    },
};

export default stores;