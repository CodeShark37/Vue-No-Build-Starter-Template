// Guard global: as rotas declaram requisitos em meta e este módulo decide.
// A ability vem do servidor e o acesso sem sessão/permissão termina em /login
// ou /403, sem limpar uma sessão válida.

import config from '../core/config.js';
import auth from '../core/session.js';
import ability from '../core/ability.js';

// Todos os roles declarados na cadeia da rota (pais + filhos). [] se nenhum.
function requiredRoles(to) {
    const all = [];
    to.matched.forEach(function (r) {
        const roles = r.meta && r.meta.roles;
        if (roles) all.push.apply(all, roles);
    });
    return all;
}

/**
 * Guard global ÚNICO (registrado em app/router.js). As rotas DECLARAM exigências
 * em meta; este guard AVALIA — as vistas nunca verificam sessão.
 *   1. requiresAuth + sem sessão  -> /login?redirect=<destino>   (401-equivalente)
 *   2. guest + com sessão         -> /                            (não mostrar login a quem já entrou)
 *   3. roles + sem o role exigido -> /403 (SEM logout: "sem permissão" ≠ "sem sessão")
 * @param {import('vue-router').Route} to
 * @param {import('vue-router').Route} from
 * @param {Function} next  callback do vue-router 3
 * @returns {void}
 */
export function requireAuth(to, from, next) {
    const needsAuth = to.matched.some(function (r) { return r.meta && r.meta.requiresAuth; });
    const guestOnly = to.matched.some(function (r) { return r.meta && r.meta.guest; });
    const roles = requiredRoles(to);
    // O requisito do filho mais profundo prevalece sobre o do pai.
    let perm = null;
    to.matched.forEach(function (r) {
        if (r.meta && r.meta.perm) perm = r.meta.perm;
    });

    if ((needsAuth || perm) && !auth.isLoggedIn()) {
        next({ path: config.auth.redirect, query: { redirect: to.fullPath }, replace: true });
    } else if (guestOnly && auth.isLoggedIn()) {
        next({ path: '/', replace: true });
    } else if (roles.length && !roles.some(function (role) { return auth.hasRole(role); })) {
        // Sessão válida, permissão insuficiente: manter sessão e mostrar 403.
        next({ path: config.auth.forbiddenRedirect, query: { from: to.fullPath }, replace: true });
    } else if (perm) {
        // Espera pelo sync para não rejeitar falsamente durante o boot; falhas
        // permanecem fail-closed.
        ability.ready().then(function () {
            if (ability.can(perm.action, perm.subject)) next();
            else {
                // O guard é UX; a API continua a revalidar o acesso.
                next({ path: config.auth.forbiddenRedirect, query: { from: to.fullPath }, replace: true });
            }
        });
    } else {
        next();
    }
}
