// Rotas de autenticação server-side: login, refresh, logout e me.
//   POST /api/login    -> credenciais válidas => NOVO PAR access/refresh no
//                         registry => {token, refreshToken, user};
//                         401 invalid_credentials
//   POST /api/refresh  -> aceita SÓ um REFRESH token EMITIDO e não revogado
//                         (mesmo com o access expirado — renovar é isso).
//                         ROTAÇÃO: par novo, refresh antigo morre, access
//                         antigos da família morrem; reutilizar um refresh JÁ
//                         RODADO mata a família INTEIRA (detecção de roubo).
//                         Forjado/adulterado/revogado/utilizador fantasma/token
//                         tipo errado => 401 => o interceptor do http.js limpa
//                         a sessão e manda para o login
//   POST /api/logout   -> REVOGA a FAMÍLIA (access E refresh morrem juntos — T04).
//                         Tolerante: sem/reconhecido => {ok:true} na mesma (o
//                         cliente limpa a sessão local de qualquer forma)
//   GET  /api/me       -> sessão válida => utilizador público (401 fora disso)
//
// 401 aqui significa sempre "sem sessão válida" (ausente/forjada/adulterada/
// revogada/expirada) — nunca "sem permissão" (isso é 403, ver guard em helpers.js).
//
// Os endpoints de demo, quando activos, alteram o registry para testar
// expiração e revogação no servidor.
//   POST /api/__demo/expire  -> marca a sessão corrente como expirada (expiresAt
//                               no passado): o próximo pedido dá 401
//                               token_expired => interceptor faz /refresh e repete.
//   POST /api/__demo/revoke  -> revoga a sessão corrente: o próximo pedido dá 401
//                               invalid_token, o /refresh também falha (revogada)
//                               => clearSession + redirect ao login.
// Até os helpers de demo respeitam "o servidor é a autoridade".
import { send, parseBody, sessionOf, guard, publicUser, tokenOf } from '../helpers.js';
import {
    createSessionPair, rotateSession, revokeSession, revokeFamily,
    sessionRowByJti,
} from '../sessions.js';
import { payloadOf } from '../token.js';

/**
 * Registra as rotas de autenticação (ver contrato no cabeçalho) e, com
 * ctx.debug, os endpoints de demo dos fluxos 401.
 * @param {Object} server servidor Mirage em configuração (routes())
 * @param {{Mirage: Object, ttl: number, refreshTtl: number, debug: boolean}} ctx contexto partilhado dos handlers
 * @returns {void}
 */
export function register(server, ctx) {
    const Mirage = ctx.Mirage;
    const ttl = ctx.ttl;              // access
    const refreshTtl = ctx.refreshTtl; // refresh

    server.post('/api/login', function (schema, request) {
        const body = parseBody(request);
        const users = schema.users.all().models;
        let user = null;
        for (let i = 0; i < users.length; i++) {
            if (users[i].username === body.username) { user = users[i]; break; }
        }
        if (!user || user.password !== body.password) {
            return send(Mirage, 401, { error: 'invalid_credentials' });
        }
        // Cada login cria uma sessão e um novo par de tokens.
        const pair = createSessionPair(schema, user, ttl, refreshTtl);
        return send(Mirage, 200, {
            token: pair.token,
            refreshToken: pair.refreshToken,
            user: publicUser(user),
        });
    });

    // Só um refresh emitido e não revogado pode renovar a sessão.
    server.post('/api/refresh', function (schema, request) {
        const session = sessionOf(schema, request, true, 'refresh');
        if (session.error) {
            // Reutilização de refresh revogado mata a família.
            const payload = payloadOf(tokenOf(request));
            const row = payload && payload.jti ? sessionRowByJti(schema, payload.jti) : null;
            if (row && row.type === 'refresh' && row.revoked) {
                revokeFamily(schema, row.family);
            }
            return send(Mirage, 401, { error: session.error });
        }
        const pair = rotateSession(schema, session.session, session.user, ttl, refreshTtl);
        return send(Mirage, 200, {
            token: pair.token,
            refreshToken: pair.refreshToken,
            user: publicUser(session.user),
        });
    });

    server.get('/api/me', function (schema, request) {
        const g = guard(Mirage, schema, request);
        if (g.response) return g.response;
        return send(Mirage, 200, { user: publicUser(g.user) });
    });

    // Logout revoga a família e aceita qualquer das credenciais.
    server.post('/api/logout', function (schema, request) {
        let s = sessionOf(schema, request, true, 'access'); // revoga mesmo expirado
        if (s.error) s = sessionOf(schema, request, true, 'refresh');
        if (!s.error) revokeSession(schema, s.session.jti);
        return send(Mirage, 200, { ok: true });
    });

    // ---------- Demo dos fluxos 401 (só com ctx.debug = localhost/dev) ----------
    // Agem sobre o ESTADO DA SESSÃO no registry — o cliente nunca reescreve
    // tokens: o servidor é a autoridade também para as demos.

    server.post('/api/__demo/expire', function (schema, request) {
        if (!ctx.debug) return send(Mirage, 404, { error: 'not_found' });
        const s = sessionOf(schema, request, true, 'access');
        if (s.error) return send(Mirage, 401, { error: s.error });
        // Expira apenas o access; o refresh continua disponível para renovação.
        s.session.update({ expiresAt: Math.floor(Date.now() / 1000) - 10 });
        return send(Mirage, 200, { ok: true });
    });

    server.post('/api/__demo/revoke', function (schema, request) {
        if (!ctx.debug) return send(Mirage, 404, { error: 'not_found' });
        let s = sessionOf(schema, request, true, 'access');
        if (s.error) s = sessionOf(schema, request, true, 'refresh');
        if (!s.error) revokeSession(schema, s.session.jti); // família inteira
        // Idempotente: sessão já morta/fora do registry => ok na mesma (o fluxo
        // cliente é o mesmo: o próximo /me dá 401 e o refresh falha).
        return send(Mirage, 200, { ok: true });
    });
}
