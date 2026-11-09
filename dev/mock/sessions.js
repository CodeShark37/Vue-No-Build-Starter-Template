// REGISTRY de sessões do mock — a autoridade efectiva sobre a identidade e o
// ciclo de vida da sessão. É a BD de sessões que um backend real teria (tabela
// `sessions` ou Redis): linhas { jti, userId, type, family, payloadHash,
// createdAt, expiresAt, revoked } no model Mirage 'session', persistidas com o
// resto do dump — as sessões sobrevivem ao F5 como sobreviveriam a um restart
// num backend com store. window.__mockReset() volta ao seed (todos os tokens
// morrem).
//
// PAR access/refresh como num backend real: o login devolve DOIS tokens, cada
// um referência a UMA linha do registry:
//   - ACCESS  (curto, ttl): vai no header de TODOS os pedidos;
//   - REFRESH (longo, refreshTtl): só existe para POST /api/refresh — enviá-lo
//     a qualquer outra rota (ou um access ao /refresh) é 401 invalid_token.
// Ambos os registos partilham `family` (o jti do refresh que fundou a sessão):
// logout/revogação matam a família INTEIRA (access + refresh de uma vez).
//
// validateSession() é o ÚNICO tribunal, por ordem:
//   1. formato (payloadOf)            -> invalid_token 401
//   2. jti emitido e no registry?     -> invalid_token 401 (forjado, T02)
//   3. type é o esperado pela rota?   -> invalid_token 401 (os tipos não se misturam)
//   4. revoked?                       -> invalid_token 401 (logout T04; password
//                                        T05; rotação T03)
//   5. payload EXACTO emitido? (hash) -> invalid_token 401 (adulterado, T01)
//   6. expirado? (exp do registry)    -> token_expired 401 (só o /refresh ignora)
// A identidade sai de session.userId (registry), NUNCA de payload.sub — e os
// roles saem da BD (user record).
//
// Quem chama o quê:
//   routes/auth.js  — login: createSessionPair(); refresh: rotateSession() com
//                     DETECÇÃO DE REUTILIZAÇÃO (refresh já revogado => família
//                     morta => re-login); logout: revokeFamily() via revokeSession().
//   helpers.js      — sessionOf() delega em validateSession() e resolve o user
//                     da BD (uma só porta de entrada para TODAS as rotas).
//   routes/profile.js / routes/users.js — revokeUserSessions() na mudança de
//                     password (T05).
import { payloadOf, issueToken, hashPayload } from './token.js';

/**
 * @typedef {Object} SessionRecord
 * Linha do registry (model 'session'). userId é STRING (comparação estável com
 * os ids numéricos do Mirage, como userById). payloadHash liga o registry ao
 * payload EXACTO emitido — é o que faz qualquer adulteração do token dar 401.
 * @property {string} jti          id da sessão (128 bits aleatórios, hex)
 * @property {string} userId       id do utilizador (STRING)
 * @property {string} type         'access' (todos os pedidos) | 'refresh' (só /refresh)
 * @property {string} family       id da LINHAGEM: o jti do refresh que fundou a
 *                                 sessão; access e refresh da mesma sessão
 *                                 partilham-no — logout/revogação matam a família
 * @property {string} payloadHash  hash do payload EXACTO emitido (hashPayload)
 * @property {number} createdAt    epoch segundos
 * @property {number} expiresAt    epoch segundos — a validade REAL (registry)
 * @property {boolean} revoked     true = revogada (logout/password/rotação);
 *                                 a linha fica como evidência de denylist
 */

// Identificador de sessão: 16 bytes aleatórios em hex. crypto.getRandomValues
// está em todos os browsers modernos; o fallback (dev esotérico, WebViews muito
// antigos) mistura Math.random + tempo — suficiente para não colidir num mock.
function newJti() {
    try {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        let out = '';
        for (let i = 0; i < bytes.length; i++) {
            out += bytes[i].toString(16).padStart(2, '0');
        }
        return out;
    } catch (e) {
        return 'f' + Date.now().toString(16) + Math.floor(Math.random() * 1e15).toString(16);
    }
}

// Sessão por jti com String(): o jti do payload e o do record comparados como
// texto (mesma razão de userById em helpers.js).
function findSession(schema, jti) {
    const rows = schema.sessions.where({ jti: String(jti) }).models;
    return rows.length ? rows[0] : undefined;
}

/**
 * EMITE UMA LINHA do registry (access OU refresh) + o token que a referencia.
 * Interno: quem emite credenciais de fora é createSessionPair() — um cliente
 * nunca recebe um token sem a sua linha no registry.
 * @param {Object} schema schema Mirage
 * @param {Object} user record Mirage do utilizador autenticado
 * @param {'access'|'refresh'} type tipo do token (define ONDE pode ser usado)
 * @param {string} family id da linhagem (o jti do refresh fundador)
 * @param {number} ttlSeconds vida útil ESTA linha (ttl / refreshTtl)
 * @returns {string} token mock pronto para o header Authorization
 */
function createSessionRow(schema, user, type, family, ttlSeconds) {
    const jti = newJti();
    const issued = issueToken(user, ttlSeconds, jti, type);
    const now = Math.floor(Date.now() / 1000);
    schema.sessions.create({
        jti: jti,
        userId: String(user.id),
        type: type,
        family: family,
        payloadHash: issued.payloadHash,
        createdAt: now,
        expiresAt: now + ttlSeconds,
        revoked: false,
    });
    return issued.token;
}

/**
 * EMITE O PAR access/refresh de uma sessão nova (login — T02/T03). Duas linhas
 * no registry, MESMA family (o jti do refresh fundador):
 *   - refresh (vida refreshTtl — longa): a credencial de RENOVAÇÃO;
 *   - access  (vida ttl — curta):        a credencial de USO DIÁRIO.
 * É exactamente o par que um backend real emite (JWT curto + refresh opaco em
 * store) — por isso "apagar dev/ e apontar à API real" não muda o contrato.
 * @param {Object} schema schema Mirage
 * @param {Object} user record Mirage do utilizador autenticado
 * @param {number} accessTtlSeconds vida útil do access token (config.mirage.tokenTtl)
 * @param {number} refreshTtlSeconds vida útil do refresh token (config.mirage.refreshTtl)
 * @returns {{token: string, refreshToken: string}} par pronto a devolver ao login
 */
export function createSessionPair(schema, user, accessTtlSeconds, refreshTtlSeconds) {
    const refreshToken = createSessionRow(schema, user, 'refresh', newJti(), refreshTtlSeconds);
    // family do access = o jti do refresh fundador — é o que o payload do
    // refresh carrega? NÃO: family vive SÓ no registry (o payload não o precisa;
    // a family é estado do SERVIDOR, invisível ao cliente).
    const refreshRow = lastSessionRow(schema, refreshToken);
    const accessToken = createSessionRow(schema, user, 'access', refreshRow.family, accessTtlSeconds);
    return { token: accessToken, refreshToken: refreshToken };
}

// Linha do registry a partir do TOKEN devolvido (payloadOf só para UX do
// servidor: o jti é o que liga token -> linha).
function lastSessionRow(schema, token) {
    const payload = payloadOf(token);
    return payload ? findSession(schema, payload.jti) : undefined;
}

/**
 * O tribunal da sessão — valida um token contra o REGISTRY (não contra o
 * payload). Ordem dos veredictos: formato -> jti emitido? -> tipo esperado? ->
 * revogado? -> payload intacto? -> expirado? O parâmetro ignoreExpiry é true SÓ
 * no /refresh (renovar é precisamente renovar) e nos endpoints de demo/revogação
 * — os erros são sempre { error, status } com 401: "sem sessão válida".
 * @param {Object} schema schema Mirage
 * @param {string} token token do header Authorization (sem 'Bearer ')
 * @param {boolean} [ignoreExpiry] true só no /refresh e nos demos
 * @param {string} [expectType] 'access'|'refresh' — a rota declara QUE tipo aceita
 *        (todas as rotas comuns são 'access' via sessionOf/guard; o
 *        /refresh é 'refresh'). Divergência = invalid_token: os tipos não se misturam.
 * @returns {{session?: SessionRecord, payload?: Object, error?: string, status?: number}}
 */
export function validateSession(schema, token, ignoreExpiry, expectType) {
    const payload = payloadOf(token);
    if (!payload || !payload.jti) return { error: 'invalid_token', status: 401 };
    const session = findSession(schema, payload.jti);
    // Token que o servidor nunca emitiu (forjado de raiz — T02) ou já rodado
    // fora pelo refresh (rotação revoga o jti antigo — T03):
    if (!session) return { error: 'invalid_token', status: 401 };
    // O TIPO tem de casar com o que a rota espera — access numa rota
    // de refresh (ou refresh numa rota comum) é uso indevido de credencial:
    if (expectType && session.type !== expectType) return { error: 'invalid_token', status: 401 };
    if (session.revoked) return { error: 'invalid_token', status: 401 };
    // O payload recebido tem de ser BYTE A BYTE o que foi emitido (T01):
    // roles, sub ou exp adulterados => hash diferente => 401.
    if (hashPayload(JSON.stringify(payload)) !== session.payloadHash) {
        return { error: 'invalid_token', status: 401 };
    }
    // A validade REAL é do registry (relógio do servidor), não do payload:
    if (!ignoreExpiry && (typeof session.expiresAt !== 'number' || session.expiresAt * 1000 < Date.now())) {
        return { error: 'token_expired', status: 401 };
    }
    return { session: session, payload: payload };
}

/**
 * REVOGA a FAMÍLIA da sessão do token (logout — T04, demo de revogação).
 * Matar SÓ o jti do access deixaria o refresh vivo — logout teria de saber
 * os dois. A `family` resolve: TODAS as linhas da
 * linhagem (access actual, refresh actual) morrem de uma vez. A linha fica com
 * revoked=true: denylist permanente até ao próximo __mockReset/seed.
 * @param {Object} schema schema Mirage
 * @param {string} jti id de QUALQUER sessão da família (access ou refresh)
 * @returns {number} número de linhas revogadas agora
 */
export function revokeSession(schema, jti) {
    const session = findSession(schema, jti);
    if (!session) return 0;
    return revokeFamily(schema, session.family);
}

/**
 * REVOGA uma linhagem inteira (logout, demos, DETECÇÃO DE REUTILIZAÇÃO do
 * refresh — T03). Todas as linhas com family (access + refresh) => revoked.
 * @param {Object} schema schema Mirage
 * @param {string} family id da linhagem
 * @returns {number} número de linhas revogadas agora
 */
export function revokeFamily(schema, family) {
    let count = 0;
    schema.sessions.where({ family: String(family) }).models.forEach(function (s) {
        if (!s.revoked) {
            s.update({ revoked: true });
            count += 1;
        }
    });
    return count;
}

/**
 * Linha do registry pelo jti (sem validar nada) — para o /refresh decidir se
 * um refresh RECUSADO era uma linha conhecida REVOGADA (reutilização de refresh
 * rodado => comprometimento da família => revokeFamily — T03).
 * @param {Object} schema schema Mirage
 * @param {string} jti id da sessão
 * @returns {SessionRecord|undefined}
 */
export function sessionRowByJti(schema, jti) {
    return findSession(schema, jti);
}

/**
 * REVOGA TODAS as sessões de um utilizador (mudança de password — T05). Inclui
 * a sessão corrente: mudar a password mata os tokens antigos POR CONSTRUÇÃO —
 * é o que um backend real faz (rotação de credencial => sessões revogadas),
 * e por isso o cliente volta ao login (ProfileView cuida do fluxo).
 * @param {Object} schema schema Mirage
 * @param {string|number} userId id do utilizador (String()-comparado)
 * @returns {number} número de sessões revogadas agora
 */
export function revokeUserSessions(schema, userId) {
    let count = 0;
    schema.sessions.where({ userId: String(userId) }).models.forEach(function (s) {
        if (!s.revoked) {
            s.update({ revoked: true });
            count += 1;
        }
    });
    return count;
}

/**
 * ROTAÇÃO no refresh (T03): só um refresh EMITIDO e não revogado renova (mesmo
 * com o access expirado — é exactamente para isso que ele existe). A rotação:
 *   1. revoga o refresh ANTIGO (morre já — um segundo uso dele é reutilização);
 *   2. revoga os access da família (expirados ou não — a partir de agora só o
 *      par novo vale);
 *   3. emite o par NOVO (mesma family).
 * Um refresh roubado e usado para refresh KILLS a linhagem: ou o dono legítimo
 * ou o ladrão roda primeiro — o segundo leva 401 => re-login (detecção de
 * roubo clássica de rotação de refresh tokens).
 * @param {Object} schema schema Mirage
 * @param {SessionRecord} session linha 'refresh' validada com ignoreExpiry=true
 * @param {Object} user record Mirage do utilizador da SESSÃO (registry)
 * @param {number} accessTtlSeconds vida útil do access novo
 * @param {number} refreshTtlSeconds vida útil do refresh novo
 * @returns {{token: string, refreshToken: string}} par NOVO
 */
export function rotateSession(schema, session, user, accessTtlSeconds, refreshTtlSeconds) {
    // 1. o refresh antigo morre de forma ALVO (sem revokeFamily: mataria a
    //    própria família que vamos re-emitir já a seguir):
    if (!session.revoked) session.update({ revoked: true });
    // 2. access antigos da família: mortos — a rotação substitui o par inteiro.
    schema.sessions.where({ family: String(session.family), type: 'access' }).models
        .forEach(function (s) { if (!s.revoked) s.update({ revoked: true }); });
    // 3. o par novo herda a family (logout futuro mata tudo de uma vez).
    const refreshToken = createSessionRow(schema, user, 'refresh', session.family, refreshTtlSeconds);
    const accessToken = createSessionRow(schema, user, 'access', session.family, accessTtlSeconds);
    return { token: accessToken, refreshToken: refreshToken };
}
