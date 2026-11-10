// Rotas de GESTÃO de utilizadores do mock — o CRUD passa pela FÁBRICA
// registerCrud (dev/mock/crud.js) como posts e books, e 'User' é um RECURSO DA
// POLÍTICA (subject CASL, como Post/Book):
//
//   GET    /api/admin/stats     -> contagens da zona admin (users, posts) — role admin
//   GET    /api/admin/users     -> lista SEM passwords (nunca saem do mock) — regra read User
//   POST   /api/admin/users     -> cria {username, name, password, roles[]} => 201 — regra create User
//   PUT    /api/admin/users/:id -> muda name / password / roles => 200 — regra update User
//   GET    /api/admin/users/:id -> detalhe público de um utilizador (da fábrica)
//   DELETE /api/admin/users/:id -> elimina => 204 — regra delete User
//
// A POLÍTICA GOVERNA: cada verbo pergunta à Ability CASL da sessão (lida da BD
// a cada pedido) — o seed dá ao role admin 'manage User' e ao SUB-ADMIN
// 'read + update User'. Assim, /admin/users não é admin-only: um subadmin vê
// e edita contas COMUNS; criar/eliminar dão 403 por não terem regra. Stats e
// regras continuam reservados ao role admin nas rotas próprias.
//
// DEFESAS por cima da política (no validateUpdate/validateDelete):
//   - alterar o campo `roles` de QUALQUER conta exige o ROLE admin (403) — um
//     subadmin edita nome/password, mas não promove ninguém;
//   - uma conta com o ROLE admin só se edita pelo ROLE admin (403, T12) — a
//     regra 'update User' gere contas comuns, nunca sequestra administradores
//     (a password nova seria uma credencial que o editor conhece);
//   - auto-protecções (422): não eliminar a própria conta nem alterar as
//     próprias roles.
//
// Efeitos colaterais realistas:
//  - eliminar um utilizador mantém os posts dele (o autor é um campo texto) e
//    mata as SESSÕES dele no registry: o próximo pedido dá 401, o /refresh
//    falha => logout automático;
//  - mudar a PASSWORD de alguém (PUT) REVOGA as sessões dele (afterUpdate ->
//    sessions.revokeUserSessions — T05 da matriz de intrusão): um token antigo
//    morre à primeira;
//  - roles desconhecidos são ACEITES: sem regras no seed => zero permissões
//    (fail-closed), como um role novo num backend real antes de lhe darem regras.
// Validações (422): username 3-24 [a-zA-Z0-9_.-] e único; nome obrigatório;
// password >= 4 caracteres; roles = array com pelo menos um role não vazio.
import { send, parseBody, guard, publicUser, usernameTaken, hasRole } from '../helpers.js';
import { revokeUserSessions } from '../sessions.js';
import { hashPassword } from '../password.js';
import { registerCrud } from '../crud.js';

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

function rolesInvalid(roles) {
    if (!Array.isArray(roles) || !roles.length) return true;
    for (let i = 0; i < roles.length; i++) {
        if (typeof roles[i] !== 'string' || !roles[i].trim()) return true;
    }
    return false;
}

/**
 * Registra a zona admin: stats (à mão) + CRUD de utilizadores (fábrica; ver
 * validações e auto-protecções no cabeçalho).
 * @param {Object} server servidor Mirage em configuração (routes())
 * @param {{Mirage: Object, ttl: number}} ctx contexto partilhado dos handlers
 * @returns {void}
 */
export function register(server, ctx) {
    const Mirage = ctx.Mirage;

    server.get('/api/admin/stats', function (schema, request) {
        const g = guard(Mirage, schema, request, { admin: true });
        if (g.response) return g.response;
        return send(Mirage, 200, {
            data: {
                users: schema.users.all().length,
                posts: schema.posts.all().length,
                generatedAt: new Date().toISOString(),
            },
        });
    });

    registerCrud(server, ctx, {
        model: 'user',
        path: '/admin/users',
        collection: 'users',
        // 'User' é RECURSO da política (como Post/Book) — cada verbo
        // pergunta à Ability da sessão (subadmin: read+update; admin: manage).
        // SEM guardOpts de role: é a política que decide, e o guard da ZONA
        // (/admin/users, meta.perm) já filtrou no cliente — a API re-verifica
        // com a MESMA política: defesa em profundidade por regras, não por if.
        subject: 'User',
        // Forma pública: a password NUNCA sai daqui, nem de lado nenhum do mock.
        serialize: publicUser,
        // Lista por id ASC (omissão do paginate seria 'desc'): a listagem admin
        // nasce do id menor, estável entre reloads. 'name' também sorta
        // (a seta do Utilizador na DataTable; localeCompare no
        // paginate, acentos e maiúsculas ordenam como se espera).
        defaultOrder: 'asc',
        allowedSorts: ['id', 'name'],
        // meta.roleCounts: contagem de utilizadores POR ROLE sobre o
        // CONJUNTO INTEIRO da colecção (não sobre a página devolvida). O
        // resumo do UsersPanel ("roles existentes: admin (1) …") é analítica do
        // conjunto todo — como meta.editable/meta.sorts, é o SERVIDOR quem
        // publica o agregado e a vista só desenha: paginar a lista (DataTable)
        // nunca esconde um role que ficou noutra página. Um role novo entra
        // aqui mal o 1.º utilizador o receba.
        extraMeta: function (schema) {
            const counts = {};
            const order = [];
            schema.users.all().models.forEach(function (m) {
                (m.attrs.roles || []).forEach(function (r) {
                    if (!counts[r]) { counts[r] = 0; order.push(r); }
                    counts[r] += 1;
                });
            });
            return { roleCounts: order.map(function (role) { return { role: role, count: counts[role] }; }) };
        },
        validate: function (body, schema) {
            const username = typeof body.username === 'string' ? body.username.trim() : '';
            const name = typeof body.name === 'string' ? body.name.trim() : '';
            if (!USERNAME_RE.test(username)) {
                return { field: 'username', message: '3-24 caracteres: letras, números, . _ -' };
            }
            if (usernameTaken(schema, username)) {
                return { field: 'username', message: 'o username já existe' };
            }
            if (!name) return { field: 'name', message: 'o nome é obrigatório' };
            if (typeof body.password !== 'string' || body.password.length < 4) {
                return { field: 'password', message: 'mínimo 4 caracteres' };
            }
            if (rolesInvalid(body.roles)) return { field: 'roles', message: 'indica pelo menos um role' };
            return null;
        },
        createAttrs: function (body) {
            return {
                username: body.username.trim(),
                name: body.name.trim(),
                // SÓ o hash dorme na BD (PBKDF2, sal derivado do username —
                // dev/mock/password.js): a password em claro existiu apenas no
                // corpo do POST e morre aqui.
                passwordHash: hashPassword(body.username.trim(), body.password),
                roles: body.roles.map(function (r) { return r.trim(); }),
            };
        },
        // Lista branca publicada na meta (contrato da UI: o PUT aceita estes
        // campos do BODY). A transformação password -> passwordHash vive no
        // updateAttrs em baixo — meta.editable fala de campos do pedido, nunca
        // de colunas da BD.
        editable: ['name', 'password', 'roles'],
        updateAttrs: function (body, record) {
            const patch = {};
            if (body.name !== undefined) patch.name = String(body.name);
            if (body.roles !== undefined && Array.isArray(body.roles)) {
                patch.roles = body.roles.map(function (r) { return String(r).trim(); });
            }
            // password vazia/ausente = manter o hash actual (nada a gravar);
            // password nova = credencial rodada: hash novo (sal do username do
            // ALVO) e as sessões dele morrem no afterUpdate em baixo (T05).
            if (body.password !== undefined && body.password !== '') {
                patch.passwordHash = hashPassword(record.attrs.username, String(body.password));
            }
            return patch;
        },
        validateUpdate: function (body, record, user) {
            // DEFESA DA CONTA ALVO ADMIN (T12): o ALVO tem o role admin e quem
            // edita não tem? 403 ANTES de qualquer validação de forma — é
            // permissão, não forma (nome, password — o golpe real: credencial
            // nova que o editor conhece — e roles). O admin continua a editar
            // admins — pares incluídos — e o sub-admin mantém o update sobre
            // contas comuns (T11), que é a função do seu cargo.
            const targetRoles = (record.attrs && record.attrs.roles) || [];
            if (targetRoles.indexOf('admin') !== -1 && !hasRole(user, 'admin')) {
                return { field: 'target', status: 403, message: 'contas admin só são editadas pelo role admin' };
            }
            if (body.name !== undefined) {
                const name = typeof body.name === 'string' ? body.name.trim() : '';
                if (!name) return { field: 'name', message: 'o nome é obrigatório' };
            }
            if (body.password !== undefined && body.password !== '') {
                if (typeof body.password !== 'string' || body.password.length < 4) {
                    return { field: 'password', message: 'mínimo 4 caracteres' };
                }
            }
            if (body.roles !== undefined) {
                // Self-lockout: as próprias roles são fixas (só outro admin as
                // mudaria — e num mock de 1 admin, ninguém).
                if (String(record.id) === String(user.id)) {
                    return { field: 'roles', message: 'não pode alterar as suas próprias roles' };
                }
                // DEFESA DE ESCALADA: o campo `roles` é reservado ao
                // ROLE admin (403, não 422 — é permissão, não forma). Um
                // subadmin (regra update User) edita nome/password, mas não
                // promove ninguém — nem por cima de outra conta.
                if (!hasRole(user, 'admin')) {
                    return { field: 'roles', status: 403, message: 'só o role admin altera roles de contas' };
                }
                if (rolesInvalid(body.roles)) return { field: 'roles', message: 'indica pelo menos um role' };
            }
            return null;
        },
        validateDelete: function (record, user) {
            if (String(record.id) === String(user.id)) {
                return { field: 'self', message: 'não pode eliminar a sua própria conta' };
            }
            return null;
        },
        // T05: password nova = credencial rodada => as sessões do alvo
        // morrem (inclusive se o admin muda a PRÓPRIA password — coerente com o
        // PUT /profile). Schema vem do hook (ver typedef afterUpdate em crud.js).
        afterUpdate: function (record, user, body, schema) {
            if (body.password !== undefined && body.password !== '') {
                revokeUserSessions(schema, record.id);
            }
        },
    });
}
