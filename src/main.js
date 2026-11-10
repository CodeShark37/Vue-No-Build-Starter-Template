// Ponto de composição da aplicação: mock, router, serviços, store e montagem.
// A lógica de sessão, transporte, rotas e layouts permanece nos respetivos módulos.

import config from './core/config.js';
import { load } from './core/loader.js';
import ability from './core/ability.js';
import { routes } from './features/index.js';
import { createRouter } from './app/router.js';
import { installServices } from './app/services.js';
import { createStore } from './app/store.js';

/**
 * Inicia a aplicação na ordem necessária e regista o progresso em `__bootStep`.
 * @returns {Promise<void>}
 */
async function bootstrap() {
    // Permite identificar no console em que fase o arranque parou.
    window.__bootStep = '0-bootstrap';
    // Importação dinâmica para que o mock possa ser removido do deploy.
    // Deve arrancar antes de qualquer pedido HTTP.
    if (config.mock) {
        window.__bootStep = '1-mock-import';
        const { startMirage } = await import('../dev/mock/index.js');
        window.__bootStep = '1-mock-start';
        startMirage(config);
        window.__bootStep = '1-mock-ok';
    }

    // O router deve existir antes da sincronização de permissões.
    window.__bootStep = '2-router';
    const router = createRouter(routes);

    // Sincroniza as permissões iniciais antes da montagem.
    ability.sync();

    Vue.config.productionTip = false;
    Vue.config.devtools = config.debug;

    Vue.use(Vuex);
    Vue.use(VueHead);
    Vue.use(VueRouter);

    installServices();

    const store = createStore();

    // Compila e monta o shell apenas depois de concluir a inicialização.
    window.__bootStep = '4-app';
    const App = await load('src/app/App.vue');
    window.__bootStep = '5-mount';
    new Vue({
        render: function (h) { return h(App); },
        store: store,
        router: router,
    }).$mount('#app');
    window.__bootStep = '6-montada';
}

bootstrap().catch(function (err) {
    // Mostra o erro na página para evitar uma falha silenciosa.
    console.error('[boot]', err);
    document.getElementById('app').textContent = 'Falha ao arrancar a aplicação. '
        + (err && err.message ? err.message : String(err));
    window.__bootStep = 'x-erro: ' + (err && err.message ? err.message : String(err));
});
