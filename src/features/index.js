// ÚNICO sítio de registo. Para acrescentar uma feature:
//   1. criar features/<nome>/ com index.js ({ name, routes, api? }) — e nada mais;
//   2. importar aqui e entrar no array `features`.
// Nada mais se toca: o router recebe estas rotas (main.js), o $api nasce daqui
// (this.$api.<name>) e a navbar continua a decidir os seus links por $auth/$perm.
//
// $api só para features com domínio de DADOS (posts, books, admin). auth não tem —
// sessão é core/session.js; site não tem — não fala com a API.
//
// ORDEM IMPORTA: o catch-all '*' (fallback do site) tem de ser a última rota,
// senão engole todas as outras. features/index.js garante-o em baixo.
/**
 * @typedef {Object} Feature
 * Contrato de feature. `routes` é a zona COMPLETA (rota-pai com layout de
 * ui/layouts/ + meta + filhos); `api` é um ApiModule de core/http.js (makeApi
 * ou funções à mão em features/<nome>/api.js).
 * @property {string} name
 * @property {Array<Object>} routes
 * @property {import('../../core/http.js').ApiModule} [api]  só features com domínio de DADOS
 */

import site from './site/index.js';
import auth from './auth/index.js';
import content from './content/index.js';
import admin from './admin/index.js';

const features = [site, auth, content, admin];

/**
 * Rotas de TODAS as features, na ordem de registo (o catch-all '*' do site
 * SEMPRE em último — senão engole todas as outras).
 * @type {Array<Object>}
 */
export const routes = features
    .reduce(function (all, f) { return all.concat(f.routes); }, [])
    .concat([site.fallback]); // '*' SEMPRE em último

// Namespace por feature: this.$api.content.posts.list(...), this.$api.admin.stats()...
/**
 * Namespace de API por feature: features com UM domínio expõem as funções
 * directamente (this.$api.admin.stats()); features com VÁRIOS recursos expõem
 * um sub-namespace por recurso (this.$api.content.posts / .books).
 * @type {Object.<string, import('../core/http.js').ApiModule>}
 */
export const api = features.reduce(function (all, f) {
    if (f.api) all[f.name] = f.api;
    return all;
}, {});
