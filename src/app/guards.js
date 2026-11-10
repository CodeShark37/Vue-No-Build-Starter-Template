// Guard global: as rotas declaram requisitos em meta e este módulo decide.
// A ability vem do servidor e o acesso sem sessão/permissão termina em /login
// ou /403, sem limpar uma sessão válida.
// Fusão da cadeia (matched): requiresAuth/guest = basta um nível (ANY); perm =
// o filho mais profundo SUBSTITUI o pai; roles = AND entre níveis, OR dentro
// do nível (o filho aperta o pai, nunca afrouxa).

import config from '../core/config.js';
import auth from '../core/session.js';
import ability from '../core/ability.js';

// RECOLHA — um passe pela cadeia (pais + filhos) normaliza os requisitos, cada
// campo com a sua estratégia de fusão (ver cabeçalho): roleGroups guarda um
// GRUPO por registo que declare meta.roles; perm fica com o mais profundo.
function requirementsOf(to) {
    const req = { needsAuth: false, guestOnly: false, roleGroups: [], perm: null };
    to.matched.forEach(function (r) {
        const meta = r.meta || {};
        if (meta.requiresAuth) req.needsAuth = true;
        if (meta.guest) req.guestOnly = true;
        if (Array.isArray(meta.roles) && meta.roles.length) req.roleGroups.push(meta.roles);
        if (meta.perm) req.perm = meta.perm;
    });
    return req;
}

// AND entre níveis; o some() no grupo é o OR de alternativas do nível.
function rolesSatisfied(groups) {
    return groups.every(function (group) {
        return group.some(function (role) { return auth.hasRole(role); });
    });
}

function toLogin(to, next) {
    next({ path: config.auth.redirect, query: { redirect: to.fullPath }, replace: true });
}

function toForbidden(to, next) {
    next({ path: config.auth.forbiddenRedirect, query: { from: to.fullPath }, replace: true });
}

/**
 * Guard global ÚNICO (registrado em app/router.js). As rotas DECLARAM exigências
 * em meta; este guard AVALIA — as vistas nunca verificam sessão. Decisão em 4
 * passos, pela ordem dos comentários no corpo:
 *   1. sessão exigida + sem sessão -> /login?redirect=<destino> (401-equivalente)
 *   2. guest + com sessão          -> /      (não mostrar login a quem já entrou)
 *   3. roles por satisfazer        -> /403   (SEM logout: "sem permissão" ≠ "sem sessão")
 *   4. perm sem a abilidade        -> /403   (espera o sync; falha fail-closed)
 * @param {import('vue-router').Route} to
 * @param {import('vue-router').Route} from
 * @param {Function} next  callback do vue-router 3
 * @returns {void}
 */
export function requireAuth(to, from, next) {
    const req = requirementsOf(to);

    // 1. Sem sessão onde a sessão é exigida (roles exigem, logo também entram aqui).
    if ((req.needsAuth || req.perm) && !auth.isLoggedIn()) return toLogin(to, next);
    // 2. Guest com sessão: nada para fazer no login.
    if (req.guestOnly && auth.isLoggedIn()) return next({ path: '/', replace: true });
    // 3. Sessão válida, role insuficiente: manter sessão e mostrar 403.
    if (req.roleGroups.length && !rolesSatisfied(req.roleGroups)) return toForbidden(to, next);
    // 4. Sessão válida, decide a POLÍTICA do servidor (espera o sync para não
    // rejeitar falsamente durante o boot).
    if (!req.perm) return next();
    // O guard é UX; a API continua a revalidar o acesso.
    ability.ready().then(function () {
        if (ability.can(req.perm.action, req.perm.subject)) next();
        else toForbidden(to, next);
    });
}
