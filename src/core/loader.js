// Único ponto que conhece o vue2-sfc-loader.
// Uso: `lazy('src/features/content/PostsView.vue')` nas rotas, `load('src/app/App.vue')` no arranque.
// Caminhos são sempre relativos à raiz da app (config.root), nunca à rota actual.

import config from './config.js';
import { createCompiledCache } from './cache.js';

// moduleCache PARTILHADO por toda a app. O loader guarda aqui os módulos .vue já carregados
// (e as promises em curso), por isso cada .vue é pedido e compilado uma única vez, mesmo que
// seja importado por várias rotas. As chaves que não são caminhos permitem `import { mapState } from 'vuex'` dentro dos .vue.
const moduleCache = {
    vue: Vue,
    vuex: Vuex,
    'vue-router': VueRouter,
    axios: axios,
};

const compiledCache = config.compiledCache
    ? createCompiledCache({ version: config.version })
    : undefined;

const options = {
    moduleCache,
    compiledCache,

    // Resolução de caminhos sobre URLs absolutas (o resolver por omissão não trata bem "http://").
    pathResolve({ refPath, relPath }) {
        if (refPath === undefined) return relPath;                     // carga inicial
        if (relPath === '.') return refPath;
        if (relPath[0] !== '.' && relPath[0] !== '/') return relPath;  // nome de módulo (vue, vuex…)
        return new URL(relPath, refPath).href;
    },

    async getFile(url) {
        const res = await fetch(url);
        if (!res.ok) {
            throw Object.assign(new Error(res.statusText + ' ' + url), { res });
        }
        return {
            getContentData: (asBinary) => asBinary ? res.arrayBuffer() : res.text(),
        };
    },

    addStyle(styleStr) {
        const style = document.createElement('style');
        style.textContent = styleStr;
        const ref = document.head.getElementsByTagName('style')[0] || null;
        document.head.insertBefore(style, ref);
    },

    // Em produção só avisos/erros: consola é lenta em dispositivos fracos.
    log(type, ...args) {
        if (config.debug || type === 'warn' || type === 'error') {
            (console[type] || console.log).call(console, '[sfc]', ...args);
        }
    },
};

// Idempotente: chamar duas vezes com o mesmo caminho devolve o mesmo módulo.
// Pode ser chamado antecipadamente (ex.: em idle) para aquecer uma rota.
/**
 * Compila/avalia um módulo (.vue ou .js) pelo vue2-sfc-loader e devolve o módulo.
 * @param {string} path caminho RELATIVO À RAIZ da app (ex. 'src/app/App.vue')
 * @returns {Promise<Object>} o namespace do módulo compilado (componente .vue incluído)
 */
export function load(path) {
    return window['vue2-sfc-loader'].loadModule(new URL(path, config.root).href, options);
}

/**
 * Componente de rota lazy: só pede e compila o .vue QUANDO a rota é visitada.
 * @param {string} path caminho relativo à raiz (ex. 'src/features/content/PostsView.vue')
 * @returns {Function} factory aceita por `component:` no vue-router
 */
export function lazy(path) {
    return () => load(path);
}
