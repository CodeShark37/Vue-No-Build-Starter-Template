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
//   this.$theme   — tema claro/escuro reactivo (core/theme.js)
//
// Além dos $-serviços de instância, AQUI se registra a ÚNICA fábrica de mixin
// da app: Vue.listPage (ui/list-page.js) — a máquina de leitura das vistas de
// lista (PostsView, BooksView, UsersPanel), consumida nos .vue como
// `mixins: [Vue.listPage({ fetch, label, ... })]`. Tem de ser no construtor
// (mixins avaliam-se antes de existir `this`) e via registo nativo (regra da
// 2.ª cópia: os .vue nunca importam .js locais).
//
// O $api NÃO se registra ficheiro a ficheiro aqui: nasce do registo de features.
// Adicionar uma feature é 1 linha em features/index.js — nunca neste ficheiro.

import http from '../core/http.js';
import config from '../core/config.js';
import session from '../core/session.js';
import ability from '../core/ability.js';
import { theme } from '../core/theme.js';
import { listPage } from '../ui/list-page.js';
import { api } from '../features/index.js';

/**
 * Instala os serviços no prototype do Vue (chamado UMA vez pelo main.js, após os
 * Vue.use). A partir daqui, qualquer .vue usa sem importar módulos locais:
 *   this.$http  — axios + política 401/refresh (core/http.js)
 *   this.$config— configuração derivada (core/config.js)
 *   this.$auth  — sessão reactiva (core/session.js)
 *   this.$perm  — Ability CASL (core/ability.js)
 *   this.$api   — { <feature>: ApiModule } composto em features/index.js
 *   this.$theme — tema claro/escuro reactivo (core/theme.js)
 * @returns {void}
 */
export function installServices() {
    Vue.prototype.$http = http;
    Vue.prototype.$config = config;
    Vue.prototype.$auth = session; // reactivo (Vue.observable): nav/vistas acompanham login/logout
    Vue.prototype.$perm = ability; // reactivo: acções acompanham as regras de GET /permissions
    Vue.prototype.$api = api;
    Vue.prototype.$theme = theme;  // reactivo: o ícone do toggle acompanha data-theme

    // Fábrica do mixin das vistas de lista (ui/list-page.js): no CONSTRUTOR e
    // não no prototype — `mixins: [Vue.listPage({ ... })]` avalia-se na
    // definição do componente, antes de existir instância. Corre no arranque,
    // portanto ANTES de qualquer .vue compilar: nenhuma vista o usa a null.
    Vue.listPage = listPage;
}
