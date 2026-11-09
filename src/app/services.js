// Registo dos serviços partilhados: os .vue acedem-lhes por `this`, SEM importar
// .js locais (o loader compilaria uma 2ª cópia do módulo). Um único padrão de
// acesso nos componentes:
//
//   this.$http    — axios + política de 401/refresh (core/http.js)
//   this.$config  — valores derivados do ambiente (core/config.js)
//   this.$auth    — sessão reactiva (core/session.js)
//   this.$perm    — Ability CASL (core/ability.js)
//   this.$api     — endpoints por domínio de dados, COMPOSTOS em features/index.js
//                   (this.$api.content.posts.list(...), this.$api.admin.stats()...)
//
// O $api NÃO se registra ficheiro a ficheiro aqui: nasce do registo de features.
// Adicionar uma feature é 1 linha em features/index.js — nunca neste ficheiro.

import http from '../core/http.js';
import config from '../core/config.js';
import session from '../core/session.js';
import ability from '../core/ability.js';
import { api } from '../features/index.js';

/**
 * Instala os serviços no prototype do Vue (chamado UMA vez pelo main.js, após os
 * Vue.use). A partir daqui, qualquer .vue usa sem importar módulos locais:
 *   this.$http  — axios + política 401/refresh (core/http.js)
 *   this.$config— configuração derivada (core/config.js)
 *   this.$auth  — sessão reactiva (core/session.js)
 *   this.$perm  — Ability CASL (core/ability.js)
 *   this.$api   — { <feature>: ApiModule } composto em features/index.js
 * @returns {void}
 */
export function installServices() {
    Vue.prototype.$http = http;
    Vue.prototype.$config = config;
    Vue.prototype.$auth = session; // reactivo (Vue.observable): nav/vistas acompanham login/logout
    Vue.prototype.$perm = ability; // reactivo: acções acompanham as regras de GET /permissions
    Vue.prototype.$api = api;
}
