// Ability da aplicação (RBAC/ABAC) — o ÚNICO módulo que conhece o CASL
// (vendor/casl.min.js, global `casl`). Tal como session.js é a fonte única da sessão,
// este módulo é a fonte única das permissões NO CLIENTE: vistas e futuros guards
// perguntam tudo por aqui com `this.$perm.can(action, subject, object?)`.
// (Chama-se ability.js e não permissions.js para não colidir com o SEED de
// permissões em dev/mock/seeds/permissions.js — aquele ficheiro é o dado que o
// servidor serve; este é o runtime que o consome.)
//
// De onde vêm as regras? Do SERVIDOR: GET /api/permissions devolve as regras do
// utilizador autenticado (no mock: política em dados, editável em runtime no
// painel admin; num backend real, seria a política central serializada em JSON).
// O cliente NÃO decide permissões — só as consome para UX (mostrar/esconder
// acções). A autoridade continua a ser a API: se o cliente se enganar, o servidor
// responde 403.
//
// Fail-closed: sem sessão ou sem resposta do servidor não há ability => can()
// devolve false. A UI esconde as acções em vez de as mostrar "por omissão".
//
// Sincronização automática: um watcher reage às mudanças do token da sessão
// (login, refresh, logout, revogação) e volta a pedir as regras — ninguém tem de
// chamar sync() manualmente.
//
// `ready()` expõe a promessa do ÚLTIMO sync para quem precisa de decidir
// COM as regras já carregadas — o guard de rotas (app/guards.js) espera por
// ela quando a rota exige meta.perm: sem isto, a navegação no BOOT (F5 numa
// rota admin) corria à frente do GET /permissions e a ability null levava a
// um 403 falso.
//
// Reactividade: `state` é Vue.observable — substituir `state.ability` re-renderiza
// automaticamente as vistas que chamam can() em templates/computed.

import auth from './session.js';
import http from './http.js';

/**
 * @typedef {Object} CaslRule
 * Regra CASL em JSON plain — é o formato que GET /api/permissions devolve e o
 * que `new casl.Ability(rules)` consome (client E mock usam o mesmo vendor).
 * @property {string} action              ex. 'read', 'update', 'manage' (wildcard)
 * @property {string} subject             ex. 'Post', 'Book'
 * @property {Object} [conditions]        ex. { authorId: '2' } — ABAC sobre o objecto
 * @property {boolean} [inverted]         true = CANNOT: a regra NEGA em vez de permitir
 */

// O bundle IIFE (vendor/casl.min.js) publica a API em window.casl.
function caslApi() {
    return typeof casl !== 'undefined' ? casl : undefined;
}

// Estado reactivo partilhado: as vistas que chamam can() ficam dependentes dele.
const state = Vue.observable({ ability: null });

// Só o ÚLTIMO pedido de /permissions pode aplicar regras (latest-wins): o token
// pode mudar (login/logout/refresh) enquanto uma resposta velha está a caminho.
let syncSeq = 0;
// A promessa do sync mais recente — ready() devolve-a ao guard.
let lastSync = Promise.resolve();

/**
 * Constrói a Ability CASL a partir das regras do servidor.
 * @param {CaslRule[]} [rules]
 * @returns {Object|null} Ability CASL, ou null (fail-closed) com vendor ausente/regras inválidas.
 */
function buildAbility(rules) {
    const casl = caslApi();
    if (!casl) return null;
    try {
        return new casl.Ability(Array.isArray(rules) ? rules : []);
    } catch (e) {
        console.error('[ability] regras inválidas vindas do servidor:', e);
        return null;
    }
}

/**
 * Re-consulta GET /api/permissions e reconstrói a Ability. Chamado sozinho pelo
 * watcher do token (login/refresh/logout/revogação) e manualmente pelos painéis
 * admin depois de mudar a política. Latest-wins: só o último pedido aplica.
 * @returns {Promise<void>}
 */
function sync() {
    const casl = caslApi();
    if (!casl) {
        console.warn('[ability] vendor/casl.min.js não carregado — can() devolve sempre false');
        return Promise.resolve();
    }
    const seq = ++syncSeq;
    if (!auth.isLoggedIn()) {
        state.ability = null; // logout/revogação: remove as permissões à vista
        lastSync = Promise.resolve();
        return lastSync;
    }
    const p = http.get('/permissions')
        .then(function (res) {
            if (seq !== syncSeq) return; // resposta velha: a sessão já mudou entretanto
            state.ability = buildAbility(res.data && res.data.rules);
        })
        .catch(function () {
            // Falhou a obter regras (401 após refresh falhado, rede, ...):
            // mantém fail-closed (ability null => nenhuma acção visível).
            if (seq !== syncSeq) return;
            state.ability = null;
        });
    lastSync = p;
    return p;
}

// Observa a sessão e re-sincroniza sozinho NAS MUDANÇAS de token (login, refresh,
// logout, revogação). Vue 2.6 não tem Vue.watch isolado, por isso uma mini-instância
// faz de ponte: lê auth.token (reactivo) num computed e dispara sync(). Tem NOME
// próprio (sessionWatcher) — é uma instância Vue utilitária, sem template nem $el,
// que existe só para vigiar a sessão com os watchers de sempre do Vue.
//
// NOTA: sem `immediate` — no ARRANQUE quem chama sync() é o main.js, DEPOIS de
// startMirage(): este módulo é avaliado durante os imports, antes do body do
// main.js, e um pedido feito nesse instante escaparia ao mock (404 na rede real).
const sessionWatcher = new Vue({
    computed: {
        token() { return auth.token; },
    },
    watch: {
        token: function () { sync(); },
    },
});

// ---------- API pública ----------
// O singleton chama-se ability (como o ficheiro): é a Ability CASL da app + a API
// que a consulta. O main.js instala-o como this.$perm — as vistas perguntam $perm.can(...).
const ability = {
    /** Ability corrente (reactiva) — para debugging/integrações; o uso normal é can(). @type {Object|null} */
    get ability() { return state.ability; },

    /**
     * Consulta de permissão, reactiva (lê state.ability no render: os botões
     * acompanham login/logout/sync sem código extra nas vistas).
     *   can('read', 'Post')          — por TIPO: há alguma regra que permita? (conditions ignoradas)
     *   can('update', 'Post', post)  — por INSTÂNCIA: as conditions avaliam os atributos reais
     * @param {string} action
     * @param {string} subjectType
     * @param {Object} [object] instância concreta (activa o nível ABAC)
     * @returns {boolean} false sem ability (fail-closed).
     */
    can(action, subjectType, object) {
        const current = state.ability; // a Ability CASL do momento (null = fail-closed)
        if (!current) return false;
        const casl = caslApi();
        if (!casl) return false;
        // subject() etiqueta o objeto com o tipo (propriedade não-enumerável) para
        // o CASL o tratar como 'Post' e avaliar as condições contra os atributos.
        const subject = object ? casl.subject(subjectType, object) : subjectType;
        return current.can(action, subject);
    },

    // Manual, para testes/casos especiais — o normal é o watcher chamar sozinho.
    sync: sync,

    /**
     * Promessa do ÚLTIMO sync de permissões: o guard de rotas espera
     * por ela antes de decidir meta.perm — garante que um F5 numa rota admin
     * decide com as regras já carregadas, não com a ability null do arranque.
     * Resolve sempre (sucesso ou falha — falha = fail-closed no can()).
     * @returns {Promise<void>}
     */
    ready() { return lastSync; },
};

export default ability;
