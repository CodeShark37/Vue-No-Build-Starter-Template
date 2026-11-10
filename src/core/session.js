// Fonte única e reactiva da sessão. A validade dos tokens pertence ao registry
// do servidor; o cliente lê o payload apenas para UX e nunca decide autorização.
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

// Compatível com WebViews sem TextEncoder/BigInt; só descodifica tokens emitidos
// pelo servidor.
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

// localStorage pode estar indisponível em modo privado ou bloqueado.
function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* indisponível */ }
}
function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* indisponível */ }
}

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

/**
 * API reactiva instalada como `this.$auth`.
 */
const auth = {
    /** ACCESS token corrente. @type {string} */
    get token() { return state.token; },

    /** REFRESH token corrente, usado apenas pelo POST /refresh. @type {string} */
    get refreshToken() { return state.refreshToken; },

    /** Perfil em cache do utilizador autenticado (reactivo). @type {SessionUser|null} */
    get user() { return state.user; },

    /** @returns {boolean} true com token em sessão (não valida exp — isso é do servidor). */
    isLoggedIn() { return !!state.token; },

    /** @returns {TokenPayload|null} payload do token corrente, ou null. */
    payload() { return payloadOf(state.token); },

    // Indicador de UX; a decisão real continua no servidor.
    isExpired() {
        const p = payloadOf(state.token);
        return !p || (typeof p.exp === 'number' && p.exp * 1000 < Date.now());
    },

    // Timestamp em milissegundos para os componentes de UX.
    expiresAt() {
        const p = payloadOf(state.token);
        return p && typeof p.exp === 'number' ? p.exp * 1000 : null;
    },

    // Segundos até expirar, para mostrar na UI.
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
