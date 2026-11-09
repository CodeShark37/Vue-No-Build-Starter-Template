// Fábrica do router. Este módulo é ES nativo: avaliado UMA única vez, por isso
// main.js e core/http.js partilham exactamente esta instância — sem 2ª cópia. (A
// regra "não importes .js locais dentro de .vue" existe por causa do loader; os
// módulos de core/ e app/ nunca são duplicados.)
//
// As rotas vêm de features/index.js VIA main.js, e não por import directo aqui:
// core/http.js importa este módulo (para navegar no logout), e se este conhecesse
// as features, core -> app -> features -> core fechava um CICLO. Com a factory, o
// ciclo não existe.
//
// O guard global é registado aqui. As rotas DECLARAM exigências em meta
// (requiresAuth/roles/guest) e o guard AVALIA — as vistas nunca verificam sessão.

import config from '../core/config.js';
import { requireAuth } from './guards.js';

/**
 * Instância corrente do router. Live binding: quem importa `router` vê o valor
 * actualizado depois de o main.js chamar createRouter() (ninguém o lê antes).
 * @type {import('vue-router').VueRouter|null}
 */
export let router = null;

/**
 * Cria o router (vue-router 3) com o modo/base de config.js, scrollBehavior da
 * navegação animada e o guard global. A instância fica no live binding `router`
 * deste módulo (core/http.js navega com ela no logout).
 * @param {Array<Object>} routes rotas de features/index.js (o catch-all '*' em último)
 * @returns {Object} instância do router criada
 */
export function createRouter(routes) {
    router = new VueRouter({
        mode: config.routerMode,
        base: config.root.pathname, // funciona na raiz e em sub-caminhos
        routes: routes,
        // Repõe o topo em cada navegação — enquanto a tela está em fade
        // (transition "page", App.vue/layouts) o salto é invisível e a nova
        // vista começa sempre de cima. Back/forward mantêm a posição guardada
        // pelo browser (savedPosition), como se espera de uma navegação real.
        scrollBehavior: function (to, from, savedPosition) {
            if (savedPosition) return savedPosition;
            return { x: 0, y: 0 };
        },
    });
    router.beforeEach(requireAuth);
    router.onError(function (err) { console.error('[router]', err); });
    return router;
}
