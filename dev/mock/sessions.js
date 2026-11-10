// Registry de sessões do mock. A identidade e a validade vêm destes registos,
// não dos campos de controlo do payload. Cada login cria um par access/refresh
// ligado pela mesma `family`; logout, rotação e alteração de password revogam
// os registos correspondentes. O estado é persistido com o dump do Mirage.
import { payloadOf, issueToken, hashToken } from './token.js';

/**
 * @typedef {Object} SessionRecord
 * Linha do registry (model `session`). `userId` é guardado como string para
 * manter a comparação estável com os ids numéricos do Mirage.
 * @property {string} jti          id da sessão (128 bits aleatórios, hex)
 * @property {string} userId       user id, stored as a string
 * @property {string} type         'access' (all requests) | 'refresh' (only /refresh)
 * @property {string} family       family id shared by the access and refresh records
 * @property {string} tokenHash    hash of the EXACT issued token string, wrapper included (hashToken)
 * @property {number} createdAt    epoch segundos
 * @property {number} expiresAt    expiry time in epoch seconds
 * @property {boolean} revoked     whether the record has been revoked
 */

// Identificador de sessão: 16 bytes aleatórios em hexadecimal.
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

// Compara o jti como texto, tal como os ids de utilizador em helpers.js.
function findSession(schema, jti) {
    const rows = schema.sessions.where({ jti: String(jti) }).models;
    return rows.length ? rows[0] : undefined;
}

/**
 * Cria uma linha do registry e o token que a referencia.
 * @param {Object} schema schema Mirage
 * @param {Object} user record Mirage do utilizador autenticado
 * @param {'access'|'refresh'} type token type and allowed route
 * @param {string} family session family id
 * @param {number} ttlSeconds record lifetime (ttl / refreshTtl)
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
        tokenHash: issued.tokenHash,
        createdAt: now,
        expiresAt: now + ttlSeconds,
        revoked: false,
    });
    return issued.token;
}

/**
 * Cria o par access/refresh de uma nova sessão.
 * @param {Object} schema schema Mirage
 * @param {Object} user record Mirage do utilizador autenticado
 * @param {number} accessTtlSeconds vida útil do access token (config.mirage.tokenTtl)
 * @param {number} refreshTtlSeconds vida útil do refresh token (config.mirage.refreshTtl)
 * @returns {{token: string, refreshToken: string}} par pronto a devolver ao login
 */
export function createSessionPair(schema, user, accessTtlSeconds, refreshTtlSeconds) {
    const refreshToken = createSessionRow(schema, user, 'refresh', newJti(), refreshTtlSeconds);
    // O access usa a mesma família do refresh, guardada apenas no servidor.
    const refreshRow = lastSessionRow(schema, refreshToken);
    const accessToken = createSessionRow(schema, user, 'access', refreshRow.family, accessTtlSeconds);
    return { token: accessToken, refreshToken: refreshToken };
}

// Obtém a linha do registry a partir do token emitido.
function lastSessionRow(schema, token) {
    const payload = payloadOf(token);
    return payload ? findSession(schema, payload.jti) : undefined;
}

/**
 * Valida um token contra o registry. `ignoreExpiry` é usado apenas no refresh
 * e nos endpoints de demonstração.
 * @param {Object} schema schema Mirage
 * @param {string} token token from the Authorization header (without 'Bearer ')
 * @param {boolean} [ignoreExpiry] used only by /refresh and demo endpoints
 * @param {string} [expectType] 'access'|'refresh' — type required by the route
 * @returns {{session?: SessionRecord, payload?: Object, error?: string, status?: number}}
 */
export function validateSession(schema, token, ignoreExpiry, expectType) {
    const payload = payloadOf(token);
    if (!payload || !payload.jti) return { error: 'invalid_token', status: 401 };
    const session = findSession(schema, payload.jti);
    // Token não emitido pelo servidor ou já revogado pela rotação.
    if (!session) return { error: 'invalid_token', status: 401 };
    // A rota declara o tipo de credencial que aceita.
    if (expectType && session.type !== expectType) return { error: 'invalid_token', status: 401 };
    if (session.revoked) return { error: 'invalid_token', status: 401 };
    // Adulteração: o hash é sobre a STRING COMPLETA apresentada no header —
    // qualquer byte alterado (payload OU invólucro 'mrg'/'mock') produz um hash
    // diferente do registado na emissão => 401 invalid_token (T01/T09/T13).
    if (hashToken(token) !== session.tokenHash) {
        return { error: 'invalid_token', status: 401 };
    }
    // A validade é determinada pelo registry e pelo relógio do servidor.
    if (!ignoreExpiry && (typeof session.expiresAt !== 'number' || session.expiresAt * 1000 < Date.now())) {
        return { error: 'token_expired', status: 401 };
    }
    return { session: session, payload: payload };
}

/**
 * Revoga toda a família da sessão do token.
 * @param {Object} schema schema Mirage
 * @param {string} jti id of any session in the family
 * @returns {number} número de linhas revogadas agora
 */
export function revokeSession(schema, jti) {
    const session = findSession(schema, jti);
    if (!session) return 0;
    return revokeFamily(schema, session.family);
}

/**
 * Revoga uma família inteira, incluindo access e refresh.
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
 * Obtém uma linha pelo jti sem validar o token. Usado pelo refresh para
 * detetar a reutilização de uma credencial revogada.
 * @param {Object} schema schema Mirage
 * @param {string} jti id da sessão
 * @returns {SessionRecord|undefined}
 */
export function sessionRowByJti(schema, jti) {
    return findSession(schema, jti);
}

/**
 * Revoga todas as sessões de um utilizador, incluindo a sessão atual.
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
 * Roda um refresh válido: revoga o refresh e os access antigos e emite um novo
 * par na mesma família. A reutilização de um refresh revogado invalida a família.
 * @param {Object} schema schema Mirage
 * @param {SessionRecord} session linha 'refresh' validada com ignoreExpiry=true
 * @param {Object} user session user record from the registry
 * @param {number} accessTtlSeconds lifetime of the new access token
 * @param {number} refreshTtlSeconds lifetime of the new refresh token
 * @returns {{token: string, refreshToken: string}} new token pair
 */
export function rotateSession(schema, session, user, accessTtlSeconds, refreshTtlSeconds) {
    // Revoga primeiro o refresh antigo, mantendo a família para o novo par.
    if (!session.revoked) session.update({ revoked: true });
    // A rotação substitui todos os access tokens da família.
    schema.sessions.where({ family: String(session.family), type: 'access' }).models
        .forEach(function (s) { if (!s.revoked) s.update({ revoked: true }); });
    // O novo par herda a família para permitir a revogação conjunta.
    const refreshToken = createSessionRow(schema, user, 'refresh', session.family, refreshTtlSeconds);
    const accessToken = createSessionRow(schema, user, 'access', session.family, accessTtlSeconds);
    return { token: accessToken, refreshToken: refreshToken };
}
