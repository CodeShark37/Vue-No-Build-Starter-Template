// Configuração DERIVADA da app: lê o ambiente de env.js (na raiz — o único
// ficheiro a mudar no deploy) e acrescenta o que é interno (cache, auth). Os
// restantes módulos importam daqui, nunca leem `location`/`localStorage` para
// configurar — e nada aqui se toca num deploy: isso é coisa do env.js.

const env = (typeof window !== 'undefined' && window.ENV) || {};
const host = location.hostname;
const debug = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

/**
 * Configuração derivada do ambiente — instalada como `this.$config`. Lê o env.js
 * (raiz, único ficheiro a mudar no deploy) e acrescenta o que é interno (cache,
 * auth). Os restantes módulos importam daqui; nada aqui se toca num deploy.
 * @property {boolean} debug          true em localhost/127.0.0.1/[::1]
 * @property {URL} root               raiz da app (calculada deste ficheiro: src/core -> ../../)
 * @property {string} version         bump = invalidar a cache de compilação em todos os clientes
 * @property {boolean} compiledCache  cache de .vue compilados (IndexedDB + memória)
 * @property {string} apiBase         base da API (env.js; com mock activo nem é usada)
 * @property {boolean} mock           interruptor de deploy do servidor mock (env.js)
 * @property {{timing: number, tokenTtl: number}} mirage  latência simulada (ms) e TTL do token (s)
 * @property {'history'|'hash'} routerMode  'history' precisa de fallback para index.html
 * @property {{tokenKey: string, userKey: string, redirect: string, forbiddenRedirect: string}} auth
 */
export default {
    debug,

    // Raiz da app, calculada a partir deste ficheiro (src/core -> ../../).
    // Não depende da rota actual, por isso o loader e o router funcionam em URLs profundos
    // e em sub-caminhos (ex.: /meu-repo/).
    root: new URL('../../', import.meta.url),

    // Incrementar para invalidar a cache de compilação dos .vue em todos os clientes.
    // (Editar um .vue já invalida só esse ficheiro: a chave da cache é um hash do
    // conteúdo. Bump manual só ao mover/renomear um .vue SEM mudar o conteúdo: o
    // código compilado antigo tem os URLs ABSOLUTOS dos filhos embutidos e serviria
    // caminhos que já não existem.)
    version: '11',
    // Cache de compilação DESLIGADA: com o vue2-sfc-loader 0.8.4 o get/set da
    // cache usa chaves assimétricas (o get devolve a 1.ª compilação de cada
    // ficheiro mesmo depois de o conteúdo mudar) — editores ficavam "presos" a
    // código velho. O custo de compilar em cada visita é aceitável; cache.js
    // fica no código, pronta a reactivar quando o loader corrigir o contrato.
    compiledCache: true,

    // Base da API: vem do env.js (deploy). Com o mock activo nem sequer é usada —
    // o Mirage interpreta os XHR de axios antes de saírem para a rede.
    apiBase: env.apiBase || '/api/',

    // Servidor mock (dev/mock/, vendor-dev/mirage.min.js): o interruptor de deploy
    // é o env.js (window.ENV.mock) — é ele que injeta o script e decide o arranque.
    // O timing e o TTL do token são internos de desenvolvimento e ficam aqui.
    mock: env.mock === true,
    mirage: {
        timing: 400, // latência simulada por pedido (ms) — para se verem os estados de loading
        tokenTtl: 120, // vida do ACCESS token (segundos); expirado => 401 => /refresh automático
        // Vida do REFRESH token (segundos) — a credencial de renovação, longa
        // como num backend real (aqui 7 dias; lá, days também).
        refreshTtl: 604800,
    },

    // 'history' precisa de fallback para index.html no servidor; 'hash' funciona em qualquer servidor estático.
    routerMode: 'history',

    auth: {
        tokenKey: 'token',
        refreshTokenKey: 'refreshToken', // a credencial de RENOVAÇÃO (só /refresh)
        userKey: 'user', // perfil em cache (nome, roles) — a fonte de verdade continua a ser GET /me
        // Destinos do guard e do interceptor:
        redirect: '/login',         // rota protegida sem sessão, ou 401 após refresh falhar
        forbiddenRedirect: '/403',  // sessão válida mas sem o role exigido (nunca faz logout)
    },
};
