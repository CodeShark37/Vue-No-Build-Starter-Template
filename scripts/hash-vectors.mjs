// Vectores de teste do hash de passwords do mock — corre SÓ em Node:
//   node scripts/hash-vectors.mjs   (a partir da raiz do template)
//
// Compara a implementação JS pura de dev/mock/password.js contra a NATIVA do
// Node (node:crypto) — SHA-256, HMAC-PBKDF2 e a API pública do mock — além de
// medir o custo real de uma verificação. Faz parte do contrato do template:
// alterou password.js? Corre isto junto com a matriz de intrusão.
//
// Node >= 18 (node:crypto; ESM via package.json {"type":"module"}).

import crypto from 'node:crypto';
import { sha256, pbkdf2, hashPassword, verifyPassword, ITERATIONS, toHex } from '../dev/mock/password.js';

let failures = 0;
function check(label, got, expected) {
    const ok = String(got) === String(expected);
    if (!ok) failures++;
    console.log((ok ? 'OK   ' : 'FALHA') + ' ' + label + (ok ? '' : '\n       obtido   : ' + got + '\n       esperado : ' + expected));
}

function bytes(str) {
    return new Uint8Array(Buffer.from(str, 'utf8'));
}

// ---------- 1. SHA-256 contra o node:crypto (fixos + comprimentos de borda) ----------
const shaCases = [
    '', 'abc', 'The quick brown fox jumps over the lazy dog',
    'a', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64),
    'a'.repeat(65), 'a'.repeat(127), 'a'.repeat(128), 'a'.repeat(1000),
    'utf8 ✓ ção 🔐', // multibyte: UTF-8 do template (encodeURIComponent+unescape)
];
shaCases.forEach(function (s) {
    const expected = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    check('sha256(' + JSON.stringify(s.length > 30 ? s.slice(0, 12) + '…(' + s.length + 'B)' : s) + ')',
        toHex(sha256(bytes(s))), expected);
});

// ---------- 2. PBKDF2-HMAC-SHA256 contra o node:crypto (fixos + aleatórios) ----------
const pbCases = [
    { p: 'password', s: 'salt', c: 1 },
    { p: 'password', s: 'salt', c: 2 },
    { p: 'password', s: 'salt', c: 4096 },
    { p: 'passwordALTERADA♫', s: 'salT$com-simbolos', c: 1000 },
    { p: 'x'.repeat(64), s: 'chave-exatamente-64', c: 5 },   // borda: chave = bloco inteiro
    { p: 'x'.repeat(65), s: 'chave-maior-que-o-bloco', c: 5 }, // borda: chave > 64B => pré-hash
];
for (let i = 0; i < 10; i++) {
    pbCases.push({
        p: crypto.randomBytes(4 + (i % 40)).toString('hex'),
        s: crypto.randomBytes(16).toString('hex'),
        c: 1 + (i * 137) % 500,
    });
}
pbCases.forEach(function (tc) {
    const expected = crypto.pbkdf2Sync(tc.p, tc.s, tc.c, 32, 'sha256').toString('hex');
    check('pbkdf2(P=' + JSON.stringify(tc.p.length > 20 ? '…' + tc.p.length + 'B' : tc.p)
        + ',S=' + JSON.stringify(tc.s) + ',c=' + tc.c + ')', toHex(pbkdf2(bytes(tc.p), bytes(tc.s), tc.c)), expected);
});

// ---------- 3. API pública do mock ----------
const h1 = hashPassword('admin', 'admin123');
check('formato PHC', /^pbkdf2-sha256\$\d+\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(h1) ? 'sim' : 'não', 'sim');
check('determinístico', hashPassword('admin', 'admin123'), h1);
check('sal por conta (mesma password, users diferentes)',
    hashPassword('admin', 'admin123') === hashPassword('user', 'admin123') ? 'iguais' : 'diferentes', 'diferentes');
check('verify aceita a certa', verifyPassword('admin123', h1), true);
check('verify recusa a errada', verifyPassword('admin124', h1), false);
check('verify recusa password de OUTRA conta', verifyPassword('admin123', hashPassword('user', 'user123')), false);
['', null, undefined, 'pbkdf2-sha256', 'pbkdf2-sha256$x$y$z', 'bcrypt$1$a$b',
 'pbkdf2-sha256$0$AAA$' + 'A'.repeat(43), 'pbkdf2-sha256$9999999$AAA$' + 'A'.repeat(43),
 'pbkdf2-sha256$20000$@@@$$$'].forEach(function (bad) {
    check('verify recusa string malformada ' + JSON.stringify(String(bad).slice(0, 30)), verifyPassword('admin123', bad), false);
});
check('verify tolera plain não-string (coerção String())', verifyPassword(12345, hashPassword('n', '12345')), true);
check('ITERATIONS plausível (>= 5k para ser KDF, <= 200k para o mock ser rápido)',
    ITERATIONS >= 5000 && ITERATIONS <= 200000 ? 'sim (' + ITERATIONS + ')' : 'não', 'sim (' + ITERATIONS + ')');

// ---------- 4. Custo real de uma verificação ----------
const times = [];
for (let i = 0; i < 7; i++) {
    const t0 = process.hrtime.bigint();
    verifyPassword('admin123', h1);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
}
times.sort(function (a, b) { return a - b; });
const median = times[Math.floor(times.length / 2)];
console.log('TEMPO verifyPassword: mediana ' + median.toFixed(1) + 'ms (' + ITERATIONS + ' iterações)');
if (median > 150) { failures++; console.log('FALHA custo > 150ms — baixe ITERATIONS'); }

console.log('');
console.log(failures === 0 ? 'VECTORES: tudo OK (' + (shaCases.length + pbCases.length + 14) + ' comparações)'
    : 'VECTORES: ' + failures + ' FALHA(S)');
process.exit(failures === 0 ? 0 : 1);
