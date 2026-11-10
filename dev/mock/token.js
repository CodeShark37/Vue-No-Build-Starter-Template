// Codec do token mock — o ÚNICO sítio que sabe o formato 'mrg.<payload>.mock'.
// O token é uma REFERÊNCIA (jti) a uma sessão do registry (sessions.js): a
// validade vive lá, não aqui nem no payload. O payload existe só por duas
// razões:
//   1. UX do cliente: core/session.js descodifica (sub/username/roles/exp) sem
//      ir à rede;
//   2. integridade: cada sessão guarda o hash do TOKEN EXACTO emitido
//      (hashToken sobre a STRING COMPLETA — invólucro 'mrg', payload e sufixo
//      'mock') — QUALQUER byte alterado em QUALQUER segmento já não casa com o
//      registry => 401 invalid_token (T01/T09/T13 da matriz de intrusão).
//      O hash é sobre o token inteiro e não só sobre o payload porque o
//      payloadOf ignora o segmento-3: um hash só do payload deixaria passar um
//      token com o sufixo trocado — exactamente a adulteração "inofensiva" que
//      seria aceite sem esta validação.
// A assinatura é fixa ('mock') por ser um mock; num backend real seria assinado
// (HS256/RS256) E verificado contra a sessão/denylist. Base64url no padrão
// clássico (compatível com WebViews antigos sem TextEncoder).

function b64urlEncode(str) {
    return btoa(unescape(encodeURIComponent(str)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Descodifica o payload de um token do formato 'mrg.<payload>.mock' (só o
 * FORMATO é validado aqui; a validade — jti emitido, revogação, exp — é
 * avaliada no registry, validateSession() em sessions.js).
 * @param {string} token
 * @returns {{sub: string, username: string, roles: string[], jti: string, iat: number, exp: number}|null}
 *          payload descodificado, ou null se o formato não for reconhecido.
 */
export function payloadOf(token) {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'mrg') return null;
    try {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) {
        return null;
    }
}

/**
 * Hash de integridade de uma STRING (FNV-1a + DJB2 combinados, 2x32 bits):
 * DETECÇÃO de adulteração, NÃO é criptografia — qualquer byte alterado muda o
 * hash; forçar colisão de 64 bits é impraticável para um intruso de página. É
 * o equivalente dev de "o servidor só confia no token que emitiu": um backend
 * real usa HS256/RS256 sobre o mesmo princípio. Aplica-se ao TOKEN COMPLETO
 * ('mrg.<payload>.mock') e não só ao payload: o payloadOf ignora o segmento-3,
 * logo um hash só do payload deixaria passar um token com o sufixo trocado —
 * a adulteração "inofensiva" que seria aceite sem esta validação.
 * @param {string} s a string exacta a proteger (o token na forma emitida)
 * @returns {string} hash hex 'h1:h2'
 */
export function hashToken(s) {
    let h1 = 0x811c9dc5; // FNV-1a 32-bit
    let h2 = 5381;       // DJB2 32-bit
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = (Math.imul(h2, 33) + c) >>> 0;
    }
    return h1.toString(16) + ':' + h2.toString(16);
}

/**
 * Emite 'mrg.<payload base64url>.mock' com sub/username/roles/jti/typ/iat/exp.
 * sub é o ID do utilizador em string (UX; a identidade REAL é session.userId
 * no registry). typ declara o tipo — 'access'|'refresh' — é só UX legível:
 * a validade do TIPO é do registry (validateSession expectType).
 * NÃO registra a sessão: isso é sessions.createSessionRow() — quem
 * emite credenciais é o registry, nunca o codec.
 * @param {Object} user record Mirage do utilizador autenticado
 * @param {number} ttlSeconds vida útil do token (config.mirage.tokenTtl / refreshTtl)
 * @param {string} jti identificador da sessão (gerado por sessions.js)
 * @param {string} [type] 'access'|'refresh' — vai no payload como typ
 * @returns {{token: string, tokenHash: string}} token pronto para o header
 *          Authorization + hash do TOKEN EXACTO, invólucro incluído (guardar no registry)
 */
export function issueToken(user, ttlSeconds, jti, type) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: String(user.id),
        username: user.username,
        roles: user.roles || ['user'],
        jti: jti,
        typ: type || 'access',
        iat: now,
        exp: now + ttlSeconds,
    };
    const json = JSON.stringify(payload);
    // O hash cobre a STRING COMPLETA do token: qualquer byte alterado no
    // payload OU no invólucro ('mrg'/'mock') invalida a sessão no registry.
    const token = 'mrg.' + b64urlEncode(json) + '.mock';
    return { token: token, tokenHash: hashToken(token) };
}
