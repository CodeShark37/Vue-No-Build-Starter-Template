// Arranque da app — a RAIZ DE COMPOSIÇÃO: junta features -> router -> serviços
// -> store -> montar. Nenhuma política vive aqui: a sessão é de core/session.js,
// o transport (401/refresh) é de core/http.js, as rotas vivem em features/
// (registo único: features/index.js) e os layouts em ui/layouts/.
//
// Tudo vive dentro de bootstrap(): passos sequenciais e UM único caminho de
// erro — o .catch no fim cobre desde o import do mock até à montagem.

import config from './core/config.js';
import { load } from './core/loader.js';
import ability from './core/ability.js';
import { routes } from './features/index.js';
import { createRouter } from './app/router.js';
import { installServices } from './app/services.js';
import { createStore } from './app/store.js';

/**
 * Arranque sequencial da app: mock (condicional) -> router -> permissões ->
 * serviços -> store -> montar o shell. Cada passo marca window.__bootStep
 * (diagnóstico do arranque no console e nos E2E).
 * @returns {Promise<void>}
 */
async function bootstrap() {
    // Marcador de progresso do arranque: numa app sem build, o "A carregar…"
    // eterno é difícil de diagnosticar — window.__bootStep diz EXACTAMENTE onde
    // parou (útil no console e nos E2E). Cada passo sobrescreve o anterior.
    window.__bootStep = '0-bootstrap';
    // 1. Servidor mock — import() DINÂMICO e condicional. Com env.mock=false o
    //    ramo nem resolve o módulo, por isso o deploy pode APAGAR dev/ (e
    //    vendor-dev/) sem partir o arranque: um import estático aqui falharia
    //    a app inteira, porque o módulo era resolvido mesmo sem ser usado.
    //    Primeiro passo: tem de interceptar o XHR do axios antes de qualquer
    //    pedido. O startMirage continua com o seu próprio guard (!cfg.mock).
    if (config.mock) {
        window.__bootStep = '1-mock-import';
        const { startMirage } = await import('../dev/mock/index.js');
        window.__bootStep = '1-mock-start';
        startMirage(config);
        window.__bootStep = '1-mock-ok';
    }

    // 2. Router ANTES do 1º pedido de permissões: se a sessão guardada (F5 com
    //    token) morrer no arranque, o interceptor de core/http.js precisa do
    //    router para navegar para o login.
    window.__bootStep = '2-router';
    const router = createRouter(routes);

    // 3. 1ª sincronização de permissões: precisa do mock activo para apanhar
    //    GET /permissions (e da sessão guardada, se houver token em cache).
    //    As mudanças seguintes (login/refresh/logout) o ability.js trata sozinho.
    ability.sync();

    Vue.config.productionTip = false;
    Vue.config.devtools = config.debug;

    Vue.use(Vuex);
    Vue.use(VueHead);
    Vue.use(VueRouter);

    installServices();

    const store = createStore();

    // 4. Shell: compilado pelo loader e montado no fim — a app só aparece
    //    quando toda a cadeia acima ficou pronta.
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
    // A mensagem fica VISÍVEL (não só no console): num template sem build, o
    // "página em branco" é o pior amigo — ver o erro poupa minutos de adivinha.
    console.error('[boot]', err);
    document.getElementById('app').textContent = 'Falha ao arrancar a aplicação. '
        + (err && err.message ? err.message : String(err));
    window.__bootStep = 'x-erro: ' + (err && err.message ? err.message : String(err));
});
