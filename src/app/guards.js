// Guard global único. As rotas DECLARAM exigências em meta e este guard AVALIA —
// as vistas nunca verificam sessão. Regras, por ordem:
//   1. requiresAuth/perm + sem sessão  -> /login?redirect=<destino> (401-equivalente)
//   2. guest + com sessão              -> /        (não mostrar login a quem já entrou)
//   3. roles + sem o role exigido      -> config.auth.forbiddenRedirect (/403, SEM logout:
//                                         é "sem permissão", não "sem sessão")
//   4. perm {action, subject} + sem a ABILIDADE CASL do servidor -> /403 —
//                                         zona dinâmica: quem tem a regra na política
//                                         entra, seja qual for o role (sub-admin). A
//                                         ability vem de GET /permissions (server-driven),
//                                         fail-closed enquanto não sincroniza.
// `to.matched.some/every` percorre a cadeia de rotas aninhadas, por isso a meta
// declarada no PAI da zona cobre automaticamente todos os filhos.
// As EXCECÇÕES por filho (meta no filho sobrepõe-se à herança do pai) são
// avaliadas por filho: roles e perm declarados em rotas distintas da mesma zona
// têm de ser mutuamente exclusivos (ver /admin: users por perm; stats/permissions
// por roles — docs/09).

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
    // meta.perm {action, subject} — a rota declara a ABILIDADE exigida;
    // toma do filho MAIS PROFUNDO que a declare (o pai pode declarar um mínimo,
    // um filho pode exigir outra — regra por rota concreta).
    let perm = null;
    to.matched.forEach(function (r) {
        if (r.meta && r.meta.perm) perm = r.meta.perm;
    });

    if ((needsAuth || perm) && !auth.isLoggedIn()) {
        next({ path: config.auth.redirect, query: { redirect: to.fullPath }, replace: true });
    } else if (guestOnly && auth.isLoggedIn()) {
        next({ path: '/', replace: true });
    } else if (roles.length && !roles.some(function (role) { return auth.hasRole(role); })) {
        // Sessão válida, permissão insuficiente: página 403, sessão mantida.
        next({ path: config.auth.forbiddenRedirect, query: { from: to.fullPath }, replace: true });
    } else if (perm) {
        // Espera pelo sync de permissões ANTES de decidir — no BOOT (F5
        // numa rota admin) ou logo a seguir ao login, a ability ainda pode estar
        // a caminho (GET /permissions é assíncrono); decidir aí dava um 403 FALSO
        // (prova em browser: SPA ok, F5 -> /403). ready() resolve sempre — falha
        // de sync = fail-closed no can() = /403, como deve ser.
        ability.ready().then(function () {
            if (ability.can(perm.action, perm.subject)) next();
            else {
                // Sem a regra na POLÍTICA do servidor (a mesma que a API aplica):
                // /403 sem logout. A API re-verifica sempre (403) — o guard é UX.
                next({ path: config.auth.forbiddenRedirect, query: { from: to.fullPath }, replace: true });
            }
        });
    } else {
        next();
    }
}
