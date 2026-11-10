// Hash de PASSWORDS do lado SERVIDOR do mock — o que dorme na BD é o hash,
// nunca a password em claro (o dump do mock vive no localStorage do browser,
// visível a qualquer curioso no devtools; é a mesma lição dos backends reais).
//
// DIVISÃO DE RESPONSABILIDADES (a mesma de um backend real):
//   - a password em claro EXISTE em 3 lugares, todos legítimos: o campo do
//     formulário, o corpo do POST /login (ou POST/PUT que muda a credencial) e
//     o SCRIPT de provisionamento (seeds/users.js — as contas de demo). No
//     Cliente NUNCA se hasha (hashear no cliente não substitui o servidor);
//   - a BD guarda SÓ `passwordHash` (formato PHC: algoritmo$iterações$sal$hash);
//   - a VERIFICAÇÃO deriva o hash do que chegou com o MESMO sal/iterações e
//     compara em tempo constante.
//
// PORQUÊ PBKDF2-HMAC-SHA256 SÍNCRONO E EM JS PURO:
//   - o Mirage (0.1.48) tem handlers SÍNCRONOS: crypto.subtle é async e não
//     cabe (um route handler não pode esperar uma Promise). Um backend real
//     usa bcrypt/argon2id/scrypt no servidor — aqui o PBKDF2-HMAC-SHA256 é o
//     KDF padrão que cabe no modelo síncrono do mock;
//   - JS puro = zero dependências, compatível com os mesmos WebViews antigos
//     do resto do template (sem TextEncoder/BigInt — UTF-8 via
//     encodeURIComponent+unescape, como core/token.js e dev/mock/token.js);
//   - CUSTO declarado: ITERATIONS rondam as dezenas de ms por verificação em
//     desktop — invisível contra os ~400ms de latência simulada, e é o custo
//     que um KDF real impõe por desenho.
//
// SAL DETERMINÍSTICO POR UTILIZADOR: sha256(DOMINIO|username) nos primeiros
// 16 bytes. Num backend real o sal seria ALEATÓRIO por conta; aqui tem de ser
// determinístico porque os seeds são ASSINADOS (FNV-1a sobre o JSON, mirage.js
// index.js): um sal aleatório mudaria a assinatura a cada boot e nenhum dump
// jamais re-hidrataria. O username é único (validação do mock), logo o sal é
// único por conta — passwords iguais produzem hashes diferentes.
//
// ESTE CÓDIGO NÃO É UMA BIBLIOTECA DE SEGURANÇA: é a versão de estudo do
// template. A defesa real continua a ser "trocar o mock por um backend".
// Vectores de teste contra o node:crypto: scripts/hash-vectors.mjs.

// ---------- base64url (UTF-8 seguro sem TextEncoder, igual ao token.js) ----------
function b64urlFromBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesFromB64url(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// string -> bytes UTF-8 (mesma técnica de core/token.js, compatível com WebViews antigos)
function utf8Bytes(str) {
    const bin = unescape(encodeURIComponent(str));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
}

function bytesToHex(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += (bytes[i] >>> 4).toString(16) + (bytes[i] & 0x0f).toString(16);
    return s;
}

// ---------- SHA-256 (FIPS 180-4) ----------
// Estado em 8 words; mensagem em blocos de 64 bytes com padding Merkle–Damgård.
const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// Uma compressão: 64 rounds sobre o estado (H) e o bloco (em bytes, offset).
// Separação do padding fora daqui: HMAC/PBKDF2 reusam blocos crus.
// W é SCRATCH de módulo (não re-entrante — tudo aqui é síncrono): alocar 64
// words por compressão dentro das dezenas de milhares de iterações do PBKDF2
// seria o custo dominante.
const W = new Uint32Array(64);
function sha256Compress(h, block, offset) {
    let i;
    for (i = 0; i < 16; i++) {
        const j = offset + i * 4;
        W[i] = ((block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3]) >>> 0;
    }
    for (i = 16; i < 64; i++) {
        const x = W[i - 15], y = W[i - 2];
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K[i] + W[i]) >>> 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
}

const H0 = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);

/** SHA-256 de bytes -> hash (32 bytes). */
export function sha256(bytes) {
    const h = H0.slice();
    const len = bytes.length;
    const bitLenHi = Math.floor(len / 0x20000000);
    const bitLenLo = (len << 3) >>> 0;
    // padding: mensagem + 0x80 + zeros + comprimento em bits (64-bit big-endian)
    const paddedLen = (len + 9 + 63) & ~63;
    const buf = new Uint8Array(paddedLen);
    buf.set(bytes);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(paddedLen - 8, bitLenHi);
    dv.setUint32(paddedLen - 4, bitLenLo);
    for (let off = 0; off < paddedLen; off += 64) sha256Compress(h, buf, off);
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, h[i]);
    return out;
}

// ---------- HMAC-SHA256 (RFC 2104) ----------
// H(K^opad || H(K^ipad || m)). A chave (a password) é constante durante o
// PBKDF2: os estados APÓS o bloco ipad e o bloco opad precomputam-se UMA vez
// e cada iteração custa só 2 compressões (1 por metade), não 4.
//
// Mensagens CURTAS (<= 55 bytes — sempre o caso aqui: sal||INT(1) tem 20
// bytes e U tem 32) cabem, com o padding, num ÚNICO bloco de fecho: o
// comprimento total já inclui o bloco ipad/opad (64 bytes).
// Bloco de fecho de 64 bytes é SCRATCH de módulo (mesma razão de W):
// hmacShort preenche-o do zero a cada chamada (fill(0) — o comprimento da msg
// varia e zeros ao resto são parte do padding).
const HMAC_BUF = new Uint8Array(64);
function hmacShort(hState, msg) {
    const buf = HMAC_BUF;
    buf.fill(0);
    buf.set(msg);
    buf[msg.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(60, (64 + msg.length) * 8); // bit-length total (bloco base + msg)
    const h = hState.slice();
    sha256Compress(h, buf, 0);
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, h[i]);
    return out;
}

// Caminho GENÉRICO (msg longa, hoje não usada mas o helper é correcto para
// qualquer comprimento): compressões a partir do estado pós-bloco-base, com o
// padding do comprimento TOTAL (64 + msg.length) nos blocos seguintes.
function hmacLong(hState, msg) {
    const len = 64 + msg.length;
    const paddedLen = (len + 9 + 63) & ~63;
    const buf = new Uint8Array(paddedLen);
    buf.set(msg, 64);
    buf[64 + msg.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(paddedLen - 8, Math.floor(len / 0x20000000));
    dv.setUint32(paddedLen - 4, (len << 3) >>> 0);
    const h = hState.slice();
    for (let off = 64; off < paddedLen; off += 64) sha256Compress(h, buf, off);
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, h[i]);
    return out;
}

// Estados iniciais do HMAC para uma chave (a password, <= 64 bytes; mais que
// isso a chave pré-hasha, como manda o RFC). Devolve os estados APÓS o bloco
// ipad e o bloco opad.
function hmacStates(key) {
    const k = key.length > 64 ? sha256(key) : key;
    const ipad = new Uint8Array(64);
    const opad = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
        const b = i < k.length ? k[i] : 0;
        ipad[i] = b ^ 0x36;
        opad[i] = b ^ 0x5c;
    }
    const ih = H0.slice();
    sha256Compress(ih, ipad, 0);
    const oh = H0.slice();
    sha256Compress(oh, opad, 0);
    return { ih: ih, oh: oh };
}

// HMAC completo: H(K^opad || H(K^ipad || msg)). O inner sai sempre com 32
// bytes (o sha-256 inteiro), logo o outer usa sempre o atalho curto.
function hmacBytes(states, msg) {
    const inner = msg.length <= 55 ? hmacShort(states.ih, msg) : hmacLong(states.ih, msg);
    return hmacShort(states.oh, inner);
}

// ---------- PBKDF2-HMAC-SHA256 (RFC 2898/8018) ----------
// dkLen fixo de 32 bytes (1 bloco T): U1 = HMAC(P, S||INT(1)); U_{i+1} =
// HMAC(P, U_i); T = U_1 ^ ... ^ U_c. Estados do HMAC precomputados uma vez.
// Exportado para os vectores de teste (scripts/hash-vectors.mjs compara-o
// contra o node:crypto) — as rotas do mock usam só hashPassword/verifyPassword.
/**
 * PBKDF2-HMAC-SHA256, dkLen fixo de 32 bytes.
 * @param {Uint8Array} password chave (bytes)
 * @param {Uint8Array} salt sal (bytes)
 * @param {number} iterations custo
 * @returns {Uint8Array} 32 bytes derivados
 */
export function pbkdf2(password, salt, iterations) {
    const st = hmacStates(password);
    const saltBlock = new Uint8Array(salt.length + 4);
    saltBlock.set(salt);
    saltBlock[salt.length] = 0; saltBlock[salt.length + 1] = 0;
    saltBlock[salt.length + 2] = 0; saltBlock[salt.length + 3] = 1; // INT_32_BE(1)
    // A cadeia É a definição: U_{i+1} = HMAC(P, U_i) — cada iteração parte do
    // U ANTERIOR (o 1.º da cadeia parte de S||INT(1)). T acumula os XOR.
    let prev = hmacBytes(st, saltBlock);
    const t = prev.slice();
    for (let i = 1; i < iterations; i++) {
        prev = hmacBytes(st, prev);
        for (let j = 0; j < 32; j++) t[j] ^= prev[j];
    }
    return t;
}

// ---------- API pública do mock ----------
const ALGO = 'pbkdf2-sha256';
export const ITERATIONS = 20000;      // dezenas de ms por verificação (medido em scripts/hash-vectors.mjs)
const SALT_DOMAIN = 'mrg.password-salt.v1';
const SALT_BYTES = 16;                // 128 bits de sal, como recomenda a prática
const HASH_BYTES = 32;                // saída do SHA-256 inteira

// Sal determinístico por conta (ver justificação no cabeçalho): os 16 primeiros
// bytes de sha256(DOMINIO|username).
function saltFor(username) {
    return sha256(utf8Bytes(SALT_DOMAIN + '|' + String(username))).slice(0, SALT_BYTES);
}

/**
 * Hash PHC-like de uma password: 'pbkdf2-sha256$<iter>$<sal b64url>$<hash b64url>'.
 * Determinístico (mesma entrada -> mesma string) — é o que os seeds exigem.
 * @param {string} username nome da conta (entra no sal determinístico)
 * @param {string} plain password em claro (do formulário ou do provisioning)
 * @returns {string} string PHC pronta a guardar em `passwordHash`
 */
export function hashPassword(username, plain) {
    const salt = saltFor(username);
    const dk = pbkdf2(utf8Bytes(String(plain)), salt, ITERATIONS);
    return ALGO + '$' + ITERATIONS + '$' + b64urlFromBytes(salt) + '$' + b64urlFromBytes(dk);
}

/**
 * Verifica uma password contra o hash guardado: deriva com os PARÂMETROS da
 * própria string PHC (algoritmo/iterações/sal) e compara byte a byte com
 * acumulador XOR (tempo constante prático). String malformada/outra versão =>
 * false (fail-closed), nunca excepção.
 * @param {string} plain password em claro a testar
 * @param {string} stored campo `passwordHash` do record (ou null/undefined)
 * @returns {boolean}
 */
export function verifyPassword(plain, stored) {
    if (typeof stored !== 'string' || stored.indexOf(ALGO + '$') !== 0) return false;
    const parts = stored.split('$');
    if (parts.length !== 4) return false;
    const iter = parseInt(parts[1], 10);
    if (!isFinite(iter) || iter < 1 || iter > 1000000) return false;
    let salt, expected;
    try {
        salt = bytesFromB64url(parts[2]);
        expected = bytesFromB64url(parts[3]);
    } catch (e) { return false; }
    if (!salt.length || expected.length !== HASH_BYTES) return false;
    const got = pbkdf2(utf8Bytes(String(plain === undefined || plain === null ? '' : plain)), salt, iter);
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= got[i] ^ expected[i];
    return diff === 0;
}

/** Hex de um hash (para os vectores de teste e depuração). */
export function toHex(bytes) {
    return bytesToHex(bytes);
}
