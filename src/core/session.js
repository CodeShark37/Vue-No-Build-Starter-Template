// Fonte única da sessão. O guard (app/guards.js), o interceptor (core/http.js)
// e as vistas perguntam TODOS a este módulo — ninguém mais toca no localStorage.
// Quando a app crescer (cookies, JWT real), só este ficheiro muda.
//
// O estado é reactivo (Vue.observable): a UI — nav com links condicionais,
// vistas — reage a setSession()/clearSession() sem eventos manuais nem Vuex.
//
// Formato dos tokens: "fake JWT" mrg.<payload>.mock (base64url) — PAR
// access/refresh como um backend real:
//   token        = ACCESS (vida curta, tokenTtl) — vai no header de TODOS os pedidos;
//   refreshToken = REFRESH (vida longa, refreshTtl) — SÓ existe para POST /refresh
//                  (o interceptor do http.js que o usa; nenhuma vista o toca).
// Ambos são REFERÊNCIAS a sessões do servidor (jti): a validade REAL vive no
// registry do servidor (dev/mock/sessions.js) — revogação no logout/mudança de
// password, rotação no refresh, 401 para tudo o que não foi emitido. O cliente
// descodifica o payload SÓ para UX: quem está autenticado e quando o access
// expira. As demos de expiração/revogação (SessionPanel) também passam por
// endpoints do mock (POST /__demo/expire, /__demo/revoke) — reescrever o
// payload no cliente não muda o que o servidor decide.
import config from './config.js';

/**
 * @typedef {Object} TokenPayload
 * Conteúdo do token mock (descodificável pelo cliente SÓ para UX; a validação
 * real é sempre do servidor).
 * @property {string} sub    id do utilizador (em string — é o que as rotas /:id comparam)
 * @property {string} username
 * @property {string[]} roles
 * @property {number} iat    emitido a (epoch segundos)
 * @property {number} exp    expira a (epoch segundos)
 */

/**
 * @typedef {Object} SessionUser
 * Perfil público do utilizador autenticado (nunca inclui password).
 * @property {string} id
 * @property {string} username
 * @property {string} name
 * @property {string[]} roles
 */

// ---------- base64url ----------
// Padrão clássico compatível com WebViews antigos (sem TextEncoder/BigInt):
// decodeURIComponent+escape depois do atob, para UTF-8 seguro (só DESCODIFICAÇÃO:
// emitir tokens é do servidor — dev/mock/sessions.js + token.js).
function b64urlDecode(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) s += '=';
    return decodeURIComponent(escape(atob(s)));
}

/**
 * Descodifica o payload de um token do formato 'mrg.<payload>.mock'.
 * @param {string} token
 * @returns {TokenPayload|null} null se o formato não for reconhecido.
 */
function payloadOf(token) {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'mrg') return null;
    try { return JSON.parse(b64urlDecode(parts[1])); } catch (e) { return null; }
}

// ---------- localStorage tolerante (modo privado / bloqueado) ----------
function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* indisponível */ }
}
function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* indisponível */ }
}

// ---------- estado reactivo ----------
const state = Vue.observable({
    token: storageGet(config.auth.tokenKey),
    refreshToken: storageGet(config.auth.refreshTokenKey),
    user: (function () {
        try { return JSON.parse(storageGet(config.auth.userKey)) || null; } catch (e) { return null; }
    }()),
});

function setToken(token) {
    state.token = token;
    if (token) storageSet(config.auth.tokenKey, token); else storageRemove(config.auth.tokenKey);
}

// O refresh token tem a sua própria chave de storage (nunca viaja nos
// pedidos normais — o interceptor só o usa no POST /refresh).
function setRefreshToken(token) {
    state.refreshToken = token;
    if (token) storageSet(config.auth.refreshTokenKey, token); else storageRemove(config.auth.refreshTokenKey);
}

function setUser(user) {
    state.user = user;
    if (user) storageSet(config.auth.userKey, JSON.stringify(user)); else storageRemove(config.auth.userKey);
}

// ---------- API pública ----------
/**
 * Fonte única da sessão, REACTIVA (Vue.observable) — instalada como `this.$auth`
 * em app/services.js. O guard (app/guards.js), o interceptor (core/http.js) e as
 * vistas perguntam TODOS a este módulo; ninguém mais toca no localStorage.
 */
const auth = {
    /** ACCESS token corrente (reactivo: usar em computed/render). Vai em TODOS os pedidos. @type {string} */
    get token() { return state.token; },

    /** REFRESH token corrente (reactivo). SÓ para o POST /refresh — http.js. @type {string} */
    get refreshToken() { return state.refreshToken; },

    /** Perfil em cache do utilizador autenticado (reactivo). @type {SessionUser|null} */
    get user() { return state.user; },

    /** @returns {boolean} true com token em sessão (não valida exp — isso é do servidor). */
    isLoggedIn() { return !!state.token; },

    /** @returns {TokenPayload|null} payload do token corrente, ou null. */
    payload() { return payloadOf(state.token); },

    // Expirado segundo o payload. Token sem payload conta como expirado
    // (o servidor é quem decide; aqui é só para puder avisar na UI).
    isExpired() {
        const p = payloadOf(state.token);
        return !p || (typeof p.exp === 'number' && p.exp * 1000 < Date.now());
    },

    // Timestamp (ms) em que o token expira; null se o formato não for reconhecido.
    // Base para computed reactivos: "expira em Ns" recalcula sozinho quando um
    // relógio externo (ex.: o SessionPanel) faz avançar o tempo segundo a segundo.
    expiresAt() {
        const p = payloadOf(state.token);
        return p && typeof p.exp === 'number' ? p.exp * 1000 : null;
    },

    // Segundos até expirar (negativo = já expirou). Para mostrar na UI.
    expiresIn() {
        const p = payloadOf(state.token);
        if (!p || typeof p.exp !== 'number') return null;
        return Math.round(p.exp * 1000 - Date.now()) / 1000;
    },

    hasRole(role) {
        const u = state.user;
        return !!(u && u.roles && u.roles.indexOf(role) !== -1);
    },

    /**
     * Guarda sessão nova (PAR access/refresh + perfil). Reactiva:
     * nav/vistas acompanham já.
     * @param {string} token access token (todos os pedidos)
     * @param {SessionUser} [user] sem user, deriva um do payload (suficiente para a UI).
     * @param {string} [refreshToken] credencial de renovação (POST /refresh);
     *        ausente => o refresh anterior é REMOVIDO (sem credencial órfã).
     * @returns {void}
     */
    setSession(token, user, refreshToken) {
        setToken(token);
        setRefreshToken(refreshToken || null);
        // Sem user na resposta, deriva-o do payload (suficiente para a UI).
        const p = payloadOf(token);
        setUser(user || (p ? { id: p.sub, username: p.username, roles: p.roles || [] } : null));
    },

    /** Limpa tokens + perfil (logout ou sessão morta pós-refresh falhado). @returns {void} */
    clearSession() {
        setToken(null);
        setRefreshToken(null);
        setUser(null);
    },
};

export default auth;
