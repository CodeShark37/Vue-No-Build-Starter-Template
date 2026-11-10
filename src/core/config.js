// Configuração derivada de env.js e dos valores internos da aplicação.

const env = (typeof window !== 'undefined' && window.ENV) || {};
const host = location.hostname;
const debug = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

/**
 * Configuração derivada do ambiente, exposta como `this.$config`.
 * @property {boolean} debug          true em localhost/127.0.0.1/[::1]
 * @property {URL} root               application root
 * @property {string} version         compilation-cache version
 * @property {boolean} compiledCache  compiled `.vue` cache (IndexedDB + memory)
 * @property {string} apiBase         API base URL from env.js
 * @property {boolean} mock           whether the mock server is enabled
 * @property {{timing: number, tokenTtl: number}} mirage  mock timing and token TTL
 * @property {'history'|'hash'} routerMode  router mode
 * @property {{tokenKey: string, userKey: string, redirect: string, forbiddenRedirect: string}} auth
 */
export default {
    debug,

    // Raiz da aplicação, independente da rota atual.
    root: new URL('../../', import.meta.url),

    // Incrementar ao mover ou renomear componentes sem alterar o seu conteúdo.
    // Alterações de conteúdo já invalidam a entrada correspondente por hash.
    version: '11',
    // Cache de componentes compilados em memória e IndexedDB.
    compiledCache: true,

    // Com o mock ativo, o Mirage intercepta os pedidos antes da rede.
    apiBase: env.apiBase || '/api/',

    // O mock é ativado por env.js; estes valores controlam a latência e os tokens.
    mock: env.mock === true,
    mirage: {
        timing: 400, // latência simulada por pedido, em ms
        tokenTtl: 120, // duração do access token, em segundos
        // Duração do refresh token, em segundos.
        refreshTtl: 604800,
    },

    // history requer fallback do servidor para index.html.
    routerMode: 'history',

    auth: {
        tokenKey: 'token',
        refreshTokenKey: 'refreshToken', // usado apenas em /refresh
        userKey: 'user', // perfil em cache; a fonte de verdade é GET /me
        redirect: '/login', // sessão ausente ou refresh sem sucesso
        forbiddenRedirect: '/403', // sessão válida sem permissão
    },
};
