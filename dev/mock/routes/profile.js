// Rotas de PERFIL do mock — o self-service que o ProfileView consome:
//   GET /api/profile -> o próprio perfil público (mesma forma do /me; sem password)
//   PUT /api/profile -> muda name / username / password DO PRÓPRIO utilizador => 200
//
// SELF-SCOPED POR CONSTRUÇÃO — o "de acordo com permissões" do perfil: o
// handler escreve SEMPRE no utilizador da SESSÃO (g.user) e ignora qualquer id
// no body — não há forma de um utilizador editar outro por aqui. Gerir a
// PRÓPRIA conta é direito da sessão autenticada (401 sem ela); gerir as contas
// DOS OUTROS é a zona admin (/api/admin/users — routes/users.js).
// Roles NUNCA aqui: mudar as próprias roles seria auto-escalada (um user a dar
// admin a si mesmo) — só a zona admin o faz, com o self-lockout da fábrica.
//
// O username é EDITÁVEL: a política referencia os posts por authorId (ID),
// nunca por username, e as owner rules também — renomear não quebra nada; só a
// apresentação (posts.author) fica no nome da época da criação. Validações
// (422 {error:'validation', field, message}): nome obrigatório; username 3-24
// [a-zA-Z0-9_.-] e único (excepto o próprio); password >= 4 caracteres
// (vazio = manter). Mudar a password REVOGA TODAS as sessões do utilizador —
// inclusive a corrente (T05 da matriz de intrusão): é a rotação de credencial
// que um backend real faz, e o ProfileView sai limpo para o login.
import { send, parseBody, guard, publicUser, usernameTaken } from '../helpers.js';
import { revokeUserSessions } from '../sessions.js';

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

// 422 canónico do mock (igual a routes/users.js): {error, field, message?}.
function send422(Mirage, field, message) {
    const body = { error: 'validation', field: field };
    if (message) body.message = message;
    return send(Mirage, 422, body);
}

/**
 * Registra as rotas de perfil self-service (ver contrato no cabeçalho).
 * @param {Object} server servidor Mirage em configuração (routes())
 * @param {{Mirage: Object, ttl: number}} ctx contexto partilhado dos handlers
 * @returns {void}
 */
export function register(server, ctx) {
    const Mirage = ctx.Mirage;

    server.get('/api/profile', function (schema, request) {
        const g = guard(Mirage, schema, request);
        if (g.response) return g.response;
        return send(Mirage, 200, { data: publicUser(g.user) });
    });

    server.put('/api/profile', function (schema, request) {
        const g = guard(Mirage, schema, request);
        if (g.response) return g.response;
        const body = parseBody(request);
        const patch = {};

        if (body.name !== undefined) {
            const name = typeof body.name === 'string' ? body.name.trim() : '';
            if (!name) return send422(Mirage, 'name', 'o nome é obrigatório');
            patch.name = name;
        }
        if (body.username !== undefined) {
            const username = typeof body.username === 'string' ? body.username.trim() : '';
            if (!USERNAME_RE.test(username)) {
                return send422(Mirage, 'username', '3-24 caracteres: letras, números, . _ -');
            }
            if (usernameTaken(schema, username, g.user.id)) {
                return send422(Mirage, 'username', 'o username já existe');
            }
            patch.username = username;
        }
        if (body.password !== undefined && body.password !== '') {
            if (typeof body.password !== 'string' || body.password.length < 4) {
                return send422(Mirage, 'password', 'mínimo 4 caracteres');
            }
            patch.password = body.password;
        }
        // patch vazio (nada mudou) é aceite: 200 com o perfil actual.
        const passwordChanged = patch.password !== undefined;
        g.user.update(patch);
        // T05: credencial rodada => todas as sessões do utilizador
        // revogadas, inclusive a corrente. A resposta chega ao cliente (200),
        // mas o PRÓXIMO pedido deste token já dá 401 invalid_token — e o
        // /refresh falha (revogada) => logout automático. O ProfileView
        // adianta-se e vai ao login por vontade própria.
        if (passwordChanged) revokeUserSessions(schema, g.user.id);
        return send(Mirage, 200, { data: publicUser(g.user) });
    });
}
