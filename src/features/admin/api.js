// Cliente HTTP da zona admin. A API é a autoridade e re-verifica o que a UI
// esconde: 401 sem sessão, 403 sem o role admin, 422 em validação falhada.
// permissionsOf() inspeciona a política já materializada de um UTILIZADOR
// (GET /permissions/:id — :id é o ID DO UTILIZADOR, não de uma regra; também
// admin-only). As funções *Rule fazem o CRUD da POLÍTICA CRUA em /api/rules
// (com os placeholders intactos — o contrário do permissionsOf). Registado em
// features/index.js como this.$api.admin.
import http from '../../core/http.js';

/**
 * Contagens da zona admin (users, posts, generatedAt). 403 sem role admin.
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function stats() {
    return http.get('/admin/stats');
}

/**
 * Lista paginada de utilizadores (sem passwords) — alimenta a tabela do
 * UsersPanel (DataTable: paginação/ordenação server-side
 * ?page&per_page&sort&order; a meta traz editable/sorts/roleCounts) e o select
 * do UserPermissions (conjunto inteiro: per_page até ao máximo que o mock
 * aceita, 50). Ordenação aceite: id, name — meta.sorts publica a lista real.
 * @param {{page?: number, per_page?: number, sort?: string, order?: string}} [params]
 * @returns {Promise<import('axios').AxiosResponse>} { data: PublicUser[], meta }
 */
export function listUsers(params) {
    return http.get('/admin/users', { params: params });
}

/**
 * Cria utilizador {username, name, password, roles[]} => 201. 422 validação
 * (username 3-24 [a-zA-Z0-9_.-] e único, nome, password >= 4, roles não vazias).
 * @param {{username: string, name: string, password: string, roles: string[]}} data
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function createUser(data) {
    return http.post('/admin/users', data);
}

/**
 * Muda name / password (vazio = manter) / roles. Username imutável; a própria
 * conta não pode alterar as próprias roles nem eliminar-se (422).
 * @param {string|number} id
 * @param {{name?: string, password?: string, roles?: string[]}} data
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function updateUser(id, data) {
    return http.put('/admin/users/' + id, data);
}

/**
 * Elimina utilizador (204; os posts dele permanecem, o token dele morre no
 * próximo pedido => 401 => refresh falha => logout automático). A própria conta
 * é intocável (422).
 * @param {string|number} id
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function removeUser(id) {
    return http.delete('/admin/users/' + id);
}

// Regras efectivas de um utilizador, já com os placeholders '${user.<campo>}'
// resolvidos com os dados dele — exactamente o que o servidor lhe entregaria no
// próximo sync. O painel UserPermissions é a prova visual desta rota.
/**
 * Regras efectivas de um UTILIZADOR, já materializadas com os dados dele
 * (GET /permissions/:id — :id é o ID DO UTILIZADOR; também admin-only). É o
 * que o painel UserPermissions mostra, na ordem de avaliação (a última vence).
 * @param {string|number} userId
 * @returns {Promise<import('axios').AxiosResponse>} { data: { user, rules } }
 */
export function permissionsOf(userId) {
    return http.get('/permissions/' + userId);
}

// ---------- CRUD da política crua (só admin): /api/rules ----------

/**
 * Política CRUA (placeholders intactos), por position — a ordem de avaliação
 * CASL (a última regra que casa sobre o mesmo (action, subject) vence).
 * @returns {Promise<import('axios').AxiosResponse>} { data: RuleSpec[] }
 */
export function listRules() {
    return http.get('/rules');
}

/**
 * Cria regra {role, action, subject, conditions?, inverted?} => 201; nasce em
 * ÚLTIMO lugar (position = max+1) — a mais recente é a que vence.
 * @param {{role: string, action: string, subject: string, conditions?: Object|null, inverted?: boolean}} data
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function createRule(data) {
    return http.post('/rules', data);
}

/**
 * Muda qualquer campo da regra (incl. inverted). 422 validações + regra
 * duplicada + auto-protecção do role admin.
 * @param {string|number} id
 * @param {{role?: string, action?: string, subject?: string, conditions?: Object|null, inverted?: boolean}} data
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function updateRule(id, data) {
    return http.put('/rules/' + id, data);
}

// REORDENA a política: o body é { ids } com TODOS os ids na nova ordem
// de avaliação — no CASL a ÚLTIMA regra que casa sobre o mesmo (action, subject)
// vence, por isso a ordem é permissão efectiva. O servidor valida o conjunto
// (422 se faltar/sobrar id) e devolve a política já reordenada.
/**
 * REORDENA a política (PUT /rules/order): body { ids } com TODOS os ids na nova
 * ordem de avaliação — a última regra que casa sobre o mesmo (action, subject)
 * vence, por isso a ordem é permissão efectiva. O servidor valida o conjunto
 * (422 se faltar/sobrar/duplicar id) e devolve a política já reordenada.
 * @param {Array<string|number>} ids todos os ids das regras, na nova ordem
 * @returns {Promise<import('axios').AxiosResponse>} { data: RuleSpec[] reordenadas }
 */
export function reorderRules(ids) {
    return http.put('/rules/order', { ids: ids });
}

/**
 * Elimina regra (204). A última regra do role admin é intocável (422).
 * @param {string|number} id
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function removeRule(id) {
    return http.delete('/rules/' + id);
}
