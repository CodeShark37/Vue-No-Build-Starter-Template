// Caixa de ferramentas dos handlers do mock (routes/*): respostas, sessão,
// guard de autorização, procuras e paginação. Nada aqui conhece rotas — cada
// domínio vive no seu routes/<domínio>.js e o index.js é só a fábrica que
// os registra. Os handlers recebem sempre (schema, request), como o Mirage manda.

/**
 * @typedef {Object} RuleSpec
 * Regra da política TAL COMO VIVE NA BD do mock (model 'rule').
 * @property {string} role
 * @property {string} action            ex. 'read', 'update', 'manage'
 * @property {string} subject           ex. 'Post', 'Book'
 * @property {Object|null} conditions   placeholders cruos ex. {authorId: '${user.id}'}, ou null
 * @property {boolean} [inverted]       true = CANNOT (a regra NEGA)
 * @property {number} [position]        ordem de AVALIAÇÃO: a última que casa vence
 */

/**
 * @typedef {Object} PublicUser
 * Forma pública canónica do perfil — o que TODAS as rotas devolvem
 * (me, login, refresh, admin/users). Nunca inclui password nem o seu hash.
 * @property {string} id
 * @property {string} username
 * @property {string} name
 * @property {string[]} roles
 */

/**
 * @typedef {Object} Paginated<T>
 * Envelope das listas do mock (paginate()): meta é o que as vistas usam para
 * paginação numerada (total/páginas reais, nunca adivinhadas no cliente).
 * @template T
 * @property {T[]} data
 * @property {{page: number, perPage: number, total: number, totalPages: number, hasMore: boolean}} meta
 */

/**
 * @typedef {Object} GuardResult
 * Resultado de guard(): ou a sessão autenticada, ou a resposta pronta a devolver.
 * @property {Object} [user]     record Mirage do utilizador autenticado
 * @property {Object} [response] Mirage.Response de 401/403 já montado
 */

/**
 * @typedef {Object} GuardOpts
 * @property {boolean} [admin] exigir role admin (403 fora disso)
 */

import { validateSession } from './sessions.js';

/**
 * Corpo JSON de resposta do mock.
 * @param {Object} Mirage namespace global MirageJS
 * @param {number} status HTTP status
 * @param {Object} [body] ausente => resposta vazia (204, etc.)
 * @returns {Object} Mirage.Response
 */
export function send(Mirage, status, body) {
    return body === undefined ? new Mirage.Response(status) : new Mirage.Response(status, {}, body);
}

/**
 * Corpo JSON do pedido (axios envia texto; tolerante a corpo vazio/inválido).
 * @param {Object} request request do Pretender (Mirage)
 * @returns {Object} body descodificado, ou {} se vazio/inválido
 */
export function parseBody(request) {
    try { return JSON.parse(request.requestBody) || {}; } catch (e) { return {}; }
}

// Token do cabeçalho 'Authorization: Bearer …' (anexado pelo interceptor em http.js).
// Exportado para o /refresh: a detecção de reutilização precisa de
// reler o token BRUTO quando a sessão já não valida.
export function tokenOf(request) {
    const headers = request.requestHeaders || {};
    const auth = headers['Authorization'] || headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/.exec(auth);
    return m ? m[1].trim() : '';
}

/**
 * Sessão do pedido a partir do header 'Authorization: Bearer …'. A
 * validade vive no REGISTRY de sessões (sessions.validateSession): formato ->
 * jti emitido? -> revogado? -> payload intacto (hash) -> expirado? Depois a
 * identidade resolve-se contra a BD pelo session.userId do registry (NUNCA
 * payload.sub — um payload adulterado não muda quem é a sessão). Sem sessão/
 * token revogado/utilizador fantasma => { error: 'invalid_token', status: 401 };
 * exp no REGISTRY no passado => { error: 'token_expired', status: 401 } (o
 * /refresh ignora a expiração; todas as outras rotas não).
 * @param {Object} schema schema Mirage
 * @param {Object} request request do Pretender
 * @param {boolean} [ignoreExpiry] true só no /refresh e nos endpoints de demo
 * @param {string} [expectType] 'access'|'refresh': o TIPO de credencial
 *        que a rota aceita — access numa rota comum, refresh SÓ no /refresh.
 *        Divergência => invalid_token 401 (os tipos não se misturam).
 * @returns {{user?: Object, payload?: Object, session?: Object, error?: string, status?: number}}
 */
export function sessionOf(schema, request, ignoreExpiry, expectType) {
    // SEM tipo explícito, uma rota é de ACCESS por defeito — um REFRESH
    // token nunca é aceito fora do /refresh (que passa 'refresh'): os tipos não
    // se misturam em NENHUMA rota, mesmo nas que esquecerem de declarar.
    const result = validateSession(schema, tokenOf(request), ignoreExpiry, expectType || 'access');
    if (result.error) return result;
    // Identidade do REGISTRY (session.userId): o payload do token é só UX —
    // adulterá-lo já dá 401 no validateSession, mas a regra mantém-se por
    // defeito de desenho: a BD é quem diz quem é a sessão (e os seus roles).
    const user = userById(schema, result.session.userId);
    if (!user) return { error: 'invalid_token', status: 401 };
    return { user: user, payload: result.payload, session: result.session };
}

/**
 * Préambulo comum a quase todos os handlers, condensado: sessão válida? (401) e,
 * quando exigido, role admin? (403 — "autenticado mas sem permissão": o
 * interceptor do http.js NUNCA desloga nem navega num 403). Uso:
 *   const g = guard(Mirage, schema, request, { admin: true });
 *   if (g.response) return g.response;   // 401/403 já montado
 *   // … g.user é a sessão autenticada
 * @param {Object} Mirage namespace global MirageJS
 * @param {Object} schema schema Mirage
 * @param {Object} request request do Pretender
 * @param {GuardOpts} [opts]
 * @returns {GuardResult}
 */
export function guard(Mirage, schema, request, opts) {
    const session = sessionOf(schema, request, false);
    if (session.error) {
        return { response: send(Mirage, session.status, { error: session.error }) };
    }
    if (opts && opts.admin && !hasRole(session.user, 'admin')) {
        return { response: send(Mirage, 403, { error: 'forbidden' }) };
    }
    return { user: session.user };
}

/**
 * Forma pública canónica do perfil — NUNCA devolver attrs do user: exclui o
 * passwordHash (fica na BD e nunca sai nas respostas).
 * É o que TODAS as rotas devolvem (me, login, refresh, admin/users…).
 * @param {Object} user record Mirage do utilizador
 * @returns {PublicUser}
 */
export function publicUser(user) {
    return { id: user.id, username: user.username, name: user.name, roles: user.roles || ['user'] };
}

/**
 * O utilizador tem o role? (roles é array no record; role ausente => false.)
 * @param {Object} user record Mirage
 * @param {string} role
 * @returns {boolean}
 */
export function hasRole(user, role) {
    return !!(user.roles && user.roles.indexOf(role) !== -1);
}

// ---------- Política de permissões (a tabela que GET /api/permissions serve) ----------
// O mock corre na própria página da app, por isso usa o MESMO CASL do cliente
// (global `casl`, vendor/casl.min.js — ver core/ability.js): UMA só semântica de
// regras nos dois lados. Sem o vendor (não deve acontecer: o index.html carrega-o
// sempre), fail-closed — abilityFor devolve null e as rotas respondem 403.
function caslApi() {
    return typeof casl !== 'undefined' ? casl : undefined;
}

// Ordem de AVALIAÇÃO das regras de um utilizador: position ascendente
// (empate -> id, para dumps antigos sem position). É a ordem do ARRAY que entra
// no `new Ability(...)`, e no CASL a ÚLTIMA regra que casa sobre o mesmo
// (action, subject) VENCE — por isso mover uma linha na política muda permissões
// efectivas (drag & drop no RulesPanel, PUT /rules/order). Regras de TODOS os
// roles entram na mesma ordem global: sem isso, "a mais recente" não teria sentido
// entre roles diferentes.
function rulesInEvaluationOrder(schema, user) {
    const rows = [];
    (user.roles || []).forEach(function (role) {
        schema.rules.where({ role: role }).models.forEach(function (m) {
            rows.push(m);
        });
    });
    return rows.sort(function (a, b) {
        const pa = typeof a.position === 'number' ? a.position : Number(a.id);
        const pb = typeof b.position === 'number' ? b.position : Number(b.id);
        return pa - pb || (Number(a.id) - Number(b.id));
    });
}

/**
 * Regras CASL MATERIALIZADAS do utilizador (placeholders '${user.<campo>}'
 * substituídos pelos dados DELE), NA ORDEM DE AVALIAÇÃO (position ascendente;
 * no CASL a última regra que casa vence). Lê a BD a cada chamada: a
 * política é DADO, não código. Usado por GET /api/permissions, GET
 * /api/permissions/:id E por todas as rotas que aplicam a política (posts, books).
 * @param {Object} schema schema Mirage
 * @param {Object} user record Mirage do utilizador (roles => regras)
 * @returns {CaslRule[]}
 */
export function rulesForUser(schema, user) {
    const rules = [];
    rulesInEvaluationOrder(schema, user).forEach(function (m) {
        rules.push({
            action: m.action,
            subject: m.subject,
            conditions: m.conditions || undefined,
            inverted: !!m.inverted,
        });
    });
    return materializeRules(rules, user);
}

// Substitui '${user.<campo>}' pelo valor real (ex.: username). Valores que não
// são placeholder passam intactos; placeholder de campo inexistente fica
// undefined => a condição nunca casa => fail-closed.
function materializeRules(rules, user) {
    function bind(value) {
        const m = /^\$\{user\.(\w+)\}$/.exec(value);
        return m ? user[m[1]] : value;
    }
    return rules.map(function (rule) {
        if (!rule.conditions) return rule;
        const conditions = {};
        Object.keys(rule.conditions).forEach(function (key) {
            const v = rule.conditions[key];
            conditions[key] = typeof v === 'string' ? bind(v) : v;
        });
        return Object.assign({}, rule, { conditions: conditions });
    });
}

/**
 * A Ability da sessão — o mesmo objecto conceptual que o cliente tem em $perm,
 * construída das regras JÁ MATERIALIZADAS, na ordem de avaliação (a última que
 * casa vence). null = fail-closed: quem consulta trata como "nada é permitido".
 * @param {Object} schema schema Mirage
 * @param {Object} user record Mirage do utilizador
 * @returns {Object|null} Ability CASL, ou null sem vendor/regras inválidas
 */
export function abilityFor(schema, user) {
    const casl = caslApi();
    if (!casl || !casl.Ability) return null;
    try {
        return new casl.Ability(rulesForUser(schema, user));
    } catch (e) {
        return null;
    }
}

/**
 * Etiqueta uma INSTÂNCIA com o tipo (propriedade não-enumerável, como faz o
 * cliente) para o CASL avaliar as conditions contra os atributos reais
 * (ex.: post.authorId — a owner rule). Sem instância, passa-se o TIPO em texto
 * (ability.can('read', 'Post')): aí o CASL ignora conditions e responde
 * "há regra que permita isto?".
 * @param {string} type subject CASL (ex. 'Post')
 * @param {Object} [object] atributos reais do registo
 * @returns {Object|string} instância etiquetada, ou o próprio tipo em texto
 */
export function caslSubject(type, object) {
    const casl = caslApi();
    return casl && casl.subject ? casl.subject(type, object) : object;
}

/**
 * Procura um utilizador por id com String(id): compara igual venha o id do sub
 * do token ou o :id das rotas (os ids numéricos do Mirage chegam às vezes como
 * número, às vezes como texto, conforme a origem).
 * @param {Object} schema schema Mirage
 * @param {string|number} id
 * @returns {Object|undefined} record Mirage, ou undefined
 */
export function userById(schema, id) {
    const users = schema.users.all().models;
    for (let i = 0; i < users.length; i++) {
        if (String(users[i].id) === String(id)) return users[i];
    }
    return undefined;
}

/**
 * Procura um post por id com String(id) (mesma razão de userById).
 * @param {Object} schema schema Mirage
 * @param {string|number} id
 * @returns {Object|undefined} record Mirage, ou undefined
 */
export function postById(schema, id) {
    const all = schema.posts.all().models;
    for (let i = 0; i < all.length; i++) {
        if (String(all[i].id) === String(id)) return all[i];
    }
    return undefined;
}

/**
 * O username já está ocupado por OUTRO utilizador? (exceptId exclui a própria
 * conta — é o que torna "manter o meu username" possível no PUT.) Compara com
 * String(): os ids numéricos do Mirage chegam às vezes como número, às vezes
 * como texto, conforme a origem (body, params, token).
 * @param {Object} schema schema Mirage
 * @param {string} username
 * @param {string|number} [exceptId] id a ignorar (a própria conta)
 * @returns {boolean}
 */
export function usernameTaken(schema, username, exceptId) {
    const users = schema.users.all().models;
    for (let i = 0; i < users.length; i++) {
        if (String(users[i].id) === String(exceptId)) continue;
        if (users[i].username === username) return true;
    }
    return false;
}

/**
 * Paginação + ordenação SERVER-SIDE, a mesma convenção para qualquer lista:
 *   ?page=1&per_page=6&sort=id&order=desc
 * 'id' compara numericamente; os restantes campos com localeCompare (acentos e
 * maiúsculas ordenam como se espera, não por código de carácter) — SALVO os
 * campos listados em numericSorts (ex. 'pages' dos livros, comparados
 * com Number; sem isso '1008' ficava antes de '272' por ordem de texto).
 * @param {Object[]} models records Mirage a paginar
 * @param {Object} query request.queryParams
 * @param {{allowedSorts?: string[], defaultSort?: string, defaultOrder?: string, defaultPerPage?: number, maxPerPage?: number, numericSorts?: string[]}} [opts]
 * @returns {Paginated<Object>} { data, meta } pronto a enviar
 */
export function paginate(models, query, opts) {
    const o = opts || {};
    const allowed = o.allowedSorts || ['id'];
    const numericSorts = o.numericSorts || [];
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const perPage = Math.max(1, Math.min(o.maxPerPage || 50, parseInt(query.per_page, 10) || (o.defaultPerPage || 6)));
    const sortKey = allowed.indexOf(query.sort) !== -1 ? query.sort : (o.defaultSort || 'id');
    // Omitido no pedido => o OMISSO do recurso (defaultOrder; ex.: users nasce
    // 'asc' — a lista admin sempre por id menor primeiro). 'desc' é o padrão
    // geral (feed: o mais recente primeiro).
    const order = (query.order || o.defaultOrder) === 'asc' ? 1 : -1;
    // Campos NUMÉRICOS de sort: Number() em vez de localeCompare.
    // 'id' mantém a via rápida própria — é o campo que todas as listas têm.
    const numeric = sortKey === 'id' || numericSorts.indexOf(sortKey) !== -1;

    const all = models.slice().sort(function (a, b) {
        if (numeric) return (Number(a[sortKey]) - Number(b[sortKey])) * order;
        return String(a[sortKey] || '').localeCompare(String(b[sortKey] || '')) * order;
    });
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const start = (page - 1) * perPage;
    return {
        data: all.slice(start, start + perPage).map(function (m) { return m.attrs; }),
        meta: {
            page: page,
            perPage: perPage,
            total: total,
            totalPages: totalPages,
            hasMore: page < totalPages,
        },
    };
}
