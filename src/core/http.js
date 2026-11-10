// Instância axios única. Disponível nos componentes como `this.$http` (ver main.js).
// Os .vue não devem importar este ficheiro: o loader compilaria uma 2ª cópia do módulo.
//
// Política de transporte (toda a app depende disto e não sabe repeti-la):
//  - pedido:  anexa 'Authorization: Bearer <access token>' lido de core/session.js
//    (o REFRESH token nunca vai nos pedidos normais — só no /refresh).
//  - 401 num pedido normal => tenta POST /refresh UMA vez (single-flight: pedidos
//    paralelos partilham a mesma promessa) COM O REFRESH TOKEN no header, repete
//    o pedido original com o access novo e só se o refresh falhar limpa a sessão
//    e navega para o login.
//  - 401 no próprio /refresh (ou no 2º try) => sessão morta (refresh expirado,
//    revogado, reutilizado — a rotação mata a família): clearSession() + navegação
//    para config.auth.redirect (router importado em baixo).
//  - 403 NUNCA limpa sessão nem navega: é "autenticado mas sem permissão".
//
// O router vem de app/router.js (importável daqui sem risco: módulos ES nativos,
// avaliados uma única vez — a regra da 2ª cópia aplica-se a .js importados por .vue).
// O app/router.js NÃO conhece as features (as rotas entram pelo main.js): assim
// core -> app -> features -> core nunca fecha um ciclo de imports.
import config from './config.js';
import auth from './session.js';
import { router } from '../app/router.js';

/**
 * @typedef {Object} ApiModule
 * Módulo de endpoints de uma feature (o que `this.$api.<feature>` expõe). Todas
 * as funções devolvem Promise do axios — o tratamento de erros/loading é da
 * vista. Os módulos canónicos CRUD nascem de makeApi(); os de domínios com
 * endpoints especiais escrevem as funções à mão (features/admin/api.js; a
 * forma didáctica alternativa vive em docs/04).
 * @property {(params?: Object) => Promise} list    GET    <path>    (?page&per_page&sort&order)
 * @property {(id: string|number) => Promise} [get] GET    <path>/:id  (o detalhe
 *                                                  canónico; os módulos à mão podem omiti-lo
 *                                                  se não o usarem)
 * @property {(data: Object) => Promise} create     POST   <path>
 * @property {(id: string|number, data: Object) => Promise} update   PUT    <path>/:id
 * @property {(id: string|number) => Promise} remove DELETE <path>/:id
 */

/**
 * Transporte HTTP único da app: axios + política de 401/refresh single-flight.
 * Disponível nos componentes como `this.$http` — os .vue NÃO importam este
 * ficheiro (o loader compilaria uma 2ª cópia do módulo).
 * @type {import('axios').AxiosInstance}
 */
const http = axios.create({
    baseURL: config.apiBase,
    // CSRF (OWASP A01/A05): a app autentica por header Bearer, NUNCA por cookie —
    // enviar cookies de sessão automaticamente (withCredentials: true) seria
    // abrir a superfície CSRF sem necessidade. LIGAR só se a API REAL usar
    // cookies de sessão — e nesse caso o backend precisa de defesa CSRF própria
    // (SameSite=Strict/Lax + token antiforgery). O mock nem vê a diferença.
    withCredentials: false,
    responseType: 'json',
});

http.interceptors.request.use(function (req) {
    // O /refresh viaja com o REFRESH token no header explícito — este
    // interceptor NÃO o toca (os tipos não se misturam; o mock recusa access
    // no /refresh). Em TODAS as outras rotas o access corrente SOBRESCREVE o
    // header — nunca preservar um Authorization já presente: o retry
    // pós-refresh reutiliza o config original do pedido falhado, que ainda
    // traria o token EXPIRADO anexado pela 1.ª passagem.
    if (req && req.__isRefresh) return req;
    if (auth.token) req.headers['Authorization'] = 'Bearer ' + auth.token;
    return req;
});

// Promessa do refresh em curso; pedidos 401 paralelos esperam por ela em vez de
// dispararem N refreshes. A pronto (null) quando termina, com sucesso ou não.
let refreshing = null;

function refreshOnce() {
    if (!refreshing) {
        // O /refresh recebe O REFRESH TOKEN (credencial de renovação, vida
        // longa), não o access — como num backend real. O header explícito
        // chega intacto: o interceptor de pedido só preenche Authorization vazio.
        refreshing = http.post('/refresh', {}, {
            __isRefresh: true,
            headers: { Authorization: 'Bearer ' + auth.refreshToken },
        })
            .then(function (res) {
                // ROTAÇÃO: a resposta traz o PAR NOVO (o refresh antigo morreu no
                // servidor). setSession guarda ambos — credencial órfã nenhuma.
                auth.setSession(res.data.token, res.data.user || auth.user, res.data.refreshToken);
                return res.data.token;
            });
    }
    return refreshing;
}

// URLs/estados que nunca devem despoletar refresh. SEM TOKEN na sessão, um 401
// é só "o pedido saiu sem credenciais" (ou a sessão acabou de ser limpa): um
// POST /refresh sem Authorization devolve 401 e o catch dele fazia
// clearSession()+redirect — podendo APAGAR uma sessão que nascia logo a seguir
// (logout -> re-login rápido: o 401 tardio de um pedido solto vencia o
// setSession do login). Sem token => rejeita seco, sem tocar na sessão.
function canRefresh(reqConfig) {
    return !!(auth.token) && reqConfig && !reqConfig.__isRefresh && !reqConfig.__retried
        && reqConfig.url !== 'login' && reqConfig.url !== 'refresh';
}

// Sessão morta: sai da página actual para o login, levando o destino em ?redirect=
// para o login poder devolver o utilizador. Ignorado se já estamos no login.
function redirectToLogin() {
    // `router` é um live binding e nasce null: só preenche quando o main.js chama
    // createRouter(). O arranque cria o router ANTES do 1º pedido, por isto é
    // defesa (401 impossível antes disso), não o caminho normal.
    if (!router) return;
    if (router.currentRoute.path !== config.auth.redirect) {
        router.push({
            path: config.auth.redirect,
            query: { redirect: router.currentRoute.fullPath },
        });
    }
}

http.interceptors.response.use(
    function (res) { return res; },
    function (err) {
        const res = err.response;
        if (!res || res.status !== 401 || !canRefresh(err.config)) {
            // 401 no próprio refresh, no login, no 2º try — ou qualquer 4xx/5xx
            // (incluindo 403, que é "sem permissão", não "sem sessão").
            return Promise.reject(err);
        }

        const request = err.config;
        request.__retried = true; // no máximo 1 refresh + retry por pedido

        return refreshOnce()
            .then(function () {
                return http(request); // repete: o interceptor de pedido põe o token novo
            })
            .catch(function () {
                // Refresh falhou (token revogado/utilizador já não existe): logout.
                auth.clearSession();
                redirectToLogin();
                return Promise.reject(err);
            })
            .then(function (r) {
                refreshing = null;
                return r;
            }, function (e) {
                refreshing = null;
                throw e;
            });
    }
);

// Sufixo de mensagem de erro por status, UMA vez para toda a app (antes
// duplicado como detailOf() em 4 painéis e como '(HTTP n)' à mão em cada catch).
// Devolve SÓ o sufixo — quem chama acrescenta o prefixo ('GET /posts falhou'):
//   sem resposta ................ ''                     (rede, cancelamento)
//   422 com message ............. ' (422 — <message>)'   (validação do mock)
//   422 com field ............... ' (422 validação: campo <field>)'
//   qualquer outro .............. ' (HTTP <status>)'     (403 incluído — a
//     política "sem permissão" a escrever é da vista; aqui é só o formato)
http.describe = function (err) {
    const res = err && err.response;
    if (!res) return '';
    const d = res.data || {};
    if (res.status === 422) {
        if (d.message) return ' (422 — ' + d.message + ')';
        if (d.field) return ' (422 validação: campo ' + d.field + ')';
    }
    return ' (HTTP ' + res.status + ')';
};

/**
 * Fábrica de módulos api.js para domínios CRUD canónicos: os 5 verbos finos
 * sobre ESTE axios (mesma política de 401/refresh — é só isto que as funções
 * de um api.js fazem). É a forma PADRÃO do template: posts e books nascem
 * daqui; o domínio com endpoints especiais escreve as funções à mão —
 * features/admin/api.js é o exemplo vivo. Formas alternativas e quando as
 * usar: docs/04 (o demo vivo do get(id) é o botão Detalhe da BooksView).
 * @param {string} path caminho da API, sem '/api' (ex. '/books' -> GET /api/books)
 * @returns {ApiModule}
 */
export function makeApi(path) {
    return {
        list: function (params) { return http.get(path, { params: params }); },
        get: function (id) { return http.get(path + '/' + id); },
        create: function (data) { return http.post(path, data); },
        update: function (id, data) { return http.put(path + '/' + id, data); },
        remove: function (id) { return http.delete(path + '/' + id); },
    };
}

export default http;
