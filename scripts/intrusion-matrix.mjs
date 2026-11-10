// Matriz de testes de intrusão T01–T13 — estado actual do Vue-No-Build-Starter-Template.
//
// CORRER A CADA MUDANÇA em dev/mock/ ou src/core/ (o verde 13/13 é parte do
// contrato do template). Resolve a raiz do template a partir do PRÓPRIO
// ficheiro — funciona onde o template estiver, sem configuração.
//
// Executa a matriz CONTRA O CÓDIGO REAL, sem o modificar:
//   1. copia dev/mock/ para /tmp/vnb-under-test/ (package.json {"type":"module"} para
//      o Node aceitar os módulos ES nativos do template);
//   2. carrega o CASL real vendored (vendor/casl.min.js) no global — o mock usa o
//      MESMO casl que o cliente (helpers.js caslApi());
//   3. monta stubs mínimos de Mirage (Response), Pretender (server) e schema (BD),
//      registra as rotas reais (routes/*.js + crud.js) e dispara pedidos contra elas;
//   4. imprime a matriz: esperado vs. obtido vs. veredicto.
//
// Os testes do lado SERVIDOR são executados (T01–T07, T09–T13); T08 é de navegação
// cliente (vue-router) e fica marcado como "code review" com a justificação.
//
// Uso:  node scripts/intrusion-matrix.mjs   (a partir da raiz do template)
//       Node >= 18 (fetch nativo não é preciso; só fs/vm/imports ESM)

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Raiz do template = pai do directório deste script (<raiz>/scripts/…).
const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKDIR = '/tmp/vnb-under-test';

// ---------- 1. cópia fresca do código real ----------
fs.rmSync(WORKDIR, { recursive: true, force: true });
fs.mkdirSync(path.join(WORKDIR, 'dev'), { recursive: true });
fs.cpSync(path.join(TEMPLATE, 'dev/mock'), path.join(WORKDIR, 'dev/mock'), { recursive: true });
fs.writeFileSync(path.join(WORKDIR, 'package.json'), JSON.stringify({ type: 'module' }));

// ---------- 2. CASL real (vendor UMD -> global `casl`) ----------
vm.runInThisContext(
    fs.readFileSync(path.join(TEMPLATE, 'vendor/casl.min.js'), 'utf8'),
    { filename: 'vendor/casl.min.js' },
);
if (typeof globalThis.casl === 'undefined') throw new Error('casl vendor não carregou no global');

// ---------- 3. stubs de Mirage/Pretender/schema ----------
const Mirage = {
    Response: class {
        constructor(status, headers, body) {
            this.status = status;
            this.headers = headers || {};
            this.body = body;
        }
    },
};

// Schema Mirage-like: colecções com all()/where()/create(); records com
// .id, .attrs (snapshot, inclui id), .update(), .destroy() — exactamente o que
// helpers.js/crud.js consomem.
function makeSchema() {
    const collections = Object.create(null);
    function collection(name) {
        if (collections[name]) return collections[name];
        const rows = [];
        let nextId = 1;
        const col = {
            all() { return { models: rows.slice(), length: rows.length }; },
            where(pred) {
                const keys = Object.keys(pred);
                const models = rows.filter(function (r) {
                    return keys.every(function (k) {
                        return String(r._data[k]) === String(pred[k]);
                    });
                });
                return { models: models, length: models.length };
            },
            find(id) {
                return rows.find(function (r) { return String(r.id) === String(id); }) || null;
            },
            create(attrs) {
                const id = attrs && attrs.id !== undefined ? String(attrs.id) : String(nextId++);
                const data = Object.assign({}, attrs, { id: id });
                const rec = { id: id };
                Object.defineProperty(rec, 'attrs', { get: function () { return Object.assign({}, data); } });
                Object.keys(data).forEach(function (k) { rec[k] = data[k]; });
                rec._data = data;
                rec.update = function (patch) {
                    Object.assign(data, patch);
                    Object.keys(patch).forEach(function (k) { rec[k] = patch[k]; });
                };
                rec.destroy = function () {
                    const i = rows.indexOf(rec);
                    if (i >= 0) rows.splice(i, 1);
                };
                rec.save = function () {};
                rows.push(rec);
                if (attrs && attrs.id !== undefined) nextId = Math.max(nextId, Number(attrs.id) + 1);
                return rec;
            },
        };
        collections[name] = col;
        return col;
    }
    return new Proxy({}, { get: function (_, name) { return collection(String(name)); } });
}

const schema = makeSchema();

// Server stub: captura os handlers registados (ordem de registo = ordem de matching).
const handlers = [];
const server = {
    get(url, h) { handlers.push({ method: 'GET', url: url, h: h }); },
    post(url, h) { handlers.push({ method: 'POST', url: url, h: h }); },
    put(url, h) { handlers.push({ method: 'PUT', url: url, h: h }); },
    del(url, h) { handlers.push({ method: 'DELETE', url: url, h: h }); },
    urlPrefix: '',
    timing: 0,
    passthrough() {},
};

// Dispatch: casa URL contra os padrões registados (':id' captura segmento).
function dispatch(method, url, opts) {
    const o = opts || {};
    const parts = url.split('?');
    const segs = parts[0].split('/').filter(Boolean);
    for (const h of handlers) {
        if (h.method !== method) continue;
        const psegs = h.url.split('/').filter(Boolean);
        if (psegs.length !== segs.length) continue;
        const params = {};
        let ok = true;
        for (let i = 0; i < psegs.length; i++) {
            if (psegs[i].charAt(0) === ':') params[psegs[i].slice(1)] = segs[i];
            else if (psegs[i] !== segs[i]) { ok = false; break; }
        }
        if (!ok) continue;
        const queryParams = Object.fromEntries(new URLSearchParams(parts[1] || ''));
        const request = {
            requestHeaders: o.token ? { Authorization: 'Bearer ' + o.token } : {},
            requestBody: o.body === undefined ? '' : JSON.stringify(o.body),
            queryParams: queryParams,
            params: params,
        };
        return h.h(schema, request);
    }
    throw new Error('handler não encontrado: ' + method + ' ' + url);
}

// ---------- 4. módulos REAIS do mock (cópia fresca) + seeds ----------
const B = pathToFileURL(WORKDIR + '/').href;
const { register: registerAuth } = await import(B + 'dev/mock/routes/auth.js');
const { register: registerProfile } = await import(B + 'dev/mock/routes/profile.js');
const { register: registerPermissions } = await import(B + 'dev/mock/routes/permissions.js');
const { register: registerUsers } = await import(B + 'dev/mock/routes/users.js');
const { register: registerPosts } = await import(B + 'dev/mock/routes/posts.js');
const { register: registerBooks } = await import(B + 'dev/mock/routes/books.js');
const { payloadOf } = await import(B + 'dev/mock/token.js');
const { seedUsers } = await import(B + 'dev/mock/seeds/users.js');
const { seedPosts } = await import(B + 'dev/mock/seeds/posts.js');
const { seedBooks } = await import(B + 'dev/mock/seeds/books.js');
const { roleRules } = await import(B + 'dev/mock/seeds/permissions.js');

const ctx = { Mirage: Mirage, ttl: 120, refreshTtl: 900, debug: true };
registerAuth(server, ctx);
registerProfile(server, ctx);
registerPermissions(server, ctx);
registerUsers(server, ctx);
registerPosts(server, ctx);
registerBooks(server, ctx);

// Seeds (mesma sequência do index.js: users -> posts -> books -> rules)
seedUsers.forEach(function (u) { schema.users.create(u); });
seedPosts().forEach(function (p) { schema.posts.create(p); });
seedBooks.forEach(function (b) { schema.books.create(b); });
let rulePos = 0;
Object.keys(roleRules).forEach(function (role) {
    roleRules[role].forEach(function (r) {
        rulePos += 1;
        schema.rules.create({
            role: role, action: r.action, subject: r.subject,
            conditions: r.conditions || null, inverted: r.inverted || false, position: rulePos,
        });
    });
});

// ---------- 5. utilidades do intruso ----------
function forgeToken(payload) {
    // O intruso NÃO usa o issueToken do servidor: monta o token do zero
    // (qualquer JS da página consegue — base64url é público).
    return 'mrg.' + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url') + '.mock';
}
function tamper(token, mutate) {
    const p = payloadOf(token);
    mutate(p);
    return forgeToken(p);
}
function call(method, url, opts) {
    const res = dispatch(method, url, opts);
    return { status: res.status, body: res.body };
}
function login(username, password) {
    const res = call('POST', '/api/login', { body: { username: username, password: password } });
    return {
        status: res.status,
        token: res.body && res.body.token,             // ACCESS (curto)
        refreshToken: res.body && res.body.refreshToken, // REFRESH (longo)
        user: res.body && res.body.user,
    };
}
// Relógio deslocável (para testar expiração REAL pós-correcção, sem adulterar tokens).
let clockShiftMs = 0;
const realDateNow = Date.now;
Date.now = function () { return realDateNow() + clockShiftMs; };

// ---------- 6. a matriz T01–T13 ----------
const results = [];
function record(id, test, expected, actual, verdict, detail) {
    results.push({ id: id, test: test, expected: expected, actual: actual, verdict: verdict, detail: detail || '' });
}
const PASS = 'PASSA', FAIL = 'FALHA', REVIEW = 'REVIEW';

// Utilizador comum: id 2 ('user'); admin: id 1.
const adminLogin = login('admin', 'admin123');
const userLogin = login('user', 'user123');
if (!adminLogin.token || !userLogin.token) throw new Error('setup: login demo falhou');

// T01 — Token adulterado -> 401
(function () {
    // variante A: roles elevadas no payload
    const tA = tamper(userLogin.token, function (p) { p.roles = ['admin']; });
    const rA = call('GET', '/api/posts', { token: tA });
    // variante B: exp prolongada (roubo de sessão ao vivo)
    const tB = tamper(userLogin.token, function (p) { p.exp = p.exp + 86400 * 365; });
    const rB = call('GET', '/api/posts', { token: tB });
    const statuses = rA.status + '/' + rB.status;
    const pass = rA.status === 401 && rB.status === 401;
    record('T01', 'Token adulterado (roles elevadas / exp prolongada)', '401 / 401',
        statuses + (rA.status === 200 || rB.status === 200 ? ' (pedido ACEITE)' : ''),
        pass ? PASS : FAIL,
        pass ? 'integridade do token verificada pelo servidor' : 'servidor aceita token que não emitiu');
})();

// T02 — Token com ID de administrador -> 401
(function () {
    const t = forgeToken({ sub: '1', username: 'admin', roles: ['admin'], iat: 1, exp: Math.floor(Date.now() / 1000) + 9999 });
    const rStats = call('GET', '/api/admin/stats', { token: t });
    const rMe = call('GET', '/api/me', { token: t });
    const pass = rStats.status === 401 && rMe.status === 401;
    record('T02', 'Token com ID de administrador (forjado do zero)', '401 / 401',
        rStats.status + '/' + rMe.status + (rStats.status === 200 ? ' (ADMIN por token forjado!)' : ''),
        pass ? PASS : FAIL,
        pass ? 'identidade só de sessões emitidas pelo servidor' : 'sub do payload confiada sem emissão');
})();

// T03 — Token expirado -> refresh (PAR access/refresh + detecção de reutilização)
(function () {
    const s = login('user', 'user123'); // sessão FRESCA
    // A) REFRESH forjado de raiz: NUNCA pode refresh
    const forged = forgeToken({ sub: '2', username: 'user', roles: ['user'], jti: 'forged', typ: 'refresh', iat: 1, exp: Math.floor(Date.now() / 1000) + 9999 });
    const rForged = call('POST', '/api/refresh', { token: forged });
    // B) ACCESS token no /refresh: os TIPOS não se misturam
    const rAccess = call('POST', '/api/refresh', { token: s.token });
    // C) REFRESH numa rota comum: idem (recíproco)
    const rWrongRoute = call('GET', '/api/me', { token: s.refreshToken });
    // D) sessão REAL com access EXPIRADO (relógio avançado, tokens intocados):
    //    o refresh é exactamente para isto — roda e devolve o PAR novo
    clockShiftMs = 150 * 1000; // access ttl 120s já passou; refresh ttl 900s ainda não
    const rLegit = call('POST', '/api/refresh', { token: s.refreshToken });
    clockShiftMs = 0;
    const newPair = rLegit.body || {};
    const newAccessOk = newPair.token && call('GET', '/api/me', { token: newPair.token }).status === 200;
    const oldAccessDead = call('GET', '/api/me', { token: s.token }).status === 401;
    // E) DETECÇÃO DE REUTILIZAÇÃO: usar o refresh ANTIGO de novo (rodado no D)
    //    mata a FAMÍLIA — o par novo do D também morre => re-login
    const rReuse = call('POST', '/api/refresh', { token: s.refreshToken });
    const newRefreshDead = newPair.refreshToken
        ? call('POST', '/api/refresh', { token: newPair.refreshToken }).status === 401
        : false;
    const pass = rForged.status === 401 && rAccess.status === 401 && rWrongRoute.status === 401
        && rLegit.status === 200 && newAccessOk && oldAccessDead
        && rReuse.status === 401 && newRefreshDead;
    record('T03', 'Refresh: par access/refresh, rotação e reutilização',
        'forjado/tipo errado 401 · real expirado renova · reutilização mata a família',
        'forjado ' + rForged.status + ' · access no /refresh ' + rAccess.status
        + ' · refresh em rota comum ' + rWrongRoute.status
        + ' · real: ' + rLegit.status + (newAccessOk ? ' par novo OK' : '')
        + ' · access antigo ' + (oldAccessDead ? 'morto' : 'VIVO!')
        + ' · reutilização ' + rReuse.status + (newRefreshDead ? ' => família morta' : ' => família VIVA!'),
        pass ? PASS : FAIL,
        pass ? 'só o refresh emitido renova; rotação revoga o par antigo; reutilizar refresh rodado mata a linhagem' : 'refresh concede sessões a credenciais que o servidor não emitiu / não revoga a rotação');
})();

// T04 — Token antigo após logout -> 401 (access E refresh morrem juntos)
(function () {
    const s = login('editor', 'editor123');
    call('POST', '/api/logout', { token: s.token });
    const rAccess = call('GET', '/api/me', { token: s.token });
    const rRefresh = call('POST', '/api/refresh', { token: s.refreshToken });
    const pass = rAccess.status === 401 && rRefresh.status === 401;
    record('T04', 'Token antigo após logout', '401 (access e refresh)',
        'access ' + rAccess.status + (rAccess.status === 200 ? ' (sessão viva depois de logout!)' : '')
        + ' · refresh ' + rRefresh.status + (rRefresh.status === 200 ? ' (RENVOVA depois de logout!)' : ''),
        pass ? PASS : FAIL,
        pass ? 'logout revoga a FAMÍLIA no servidor (access + refresh juntos)' : 'logout é stateless — alguma credencial continua a abrir a API');
})();

// T05 — Token antigo após alteração de password -> 401 (access e refresh)
(function () {
    // A) auto-serviço (PUT /profile)
    const s = login('viewer', 'viewer123');
    const rPut = call('PUT', '/api/profile', { token: s.token, body: { name: 'Diogo Visitante', password: 'n0v4-s3nh4' } });
    const rA = call('GET', '/api/me', { token: s.token });
    const rAR = call('POST', '/api/refresh', { token: s.refreshToken });
    // B) reset por admin sobre um utilizador TEMPORÁRIO (não perturba os outros testes)
    const rNew = call('POST', '/api/admin/users', { token: adminLogin.token, body: { username: 'victima', password: 'temp-123', name: 'Vítima Temp', roles: ['user'] } });
    const victimId = rNew.body && rNew.body.data && rNew.body.data.id;
    const vLogin = victimId ? login('victima', 'temp-123') : {};
    const rAdmin = victimId ? call('PUT', '/api/admin/users/' + victimId, { token: adminLogin.token, body: { password: 'reset-99' } }) : { status: 0 };
    const rB = call('GET', '/api/me', { token: vLogin.token });
    const aOk = rPut.status === 200 && rA.status === 401 && rAR.status === 401;
    const bOk = rNew.status === 201 && rAdmin.status === 200 && rB.status === 401;
    record('T05', 'Token antigo após alteração de password', '401 (próprio e por admin; access e refresh)',
        'próprio: PUT ' + rPut.status + ' -> GET ' + rA.status + ' / refresh ' + rAR.status
        + ' · admin: PUT ' + rAdmin.status + ' -> GET ' + rB.status,
        aOk && bOk ? PASS : FAIL,
        aOk && bOk ? 'mudança de password revoga TODAS as sessões do utilizador (access e refresh)' : 'password mudou mas credenciais antigas continuam válidas');
})();

// T06 — Login inválido com sessão anterior -> não inicia refresh, sessão anterior intacta
(function () {
    const s = login('user', 'user123'); // sessão FRESCA (testes anteriores podem ter revogado as antigas)
    const r = call('POST', '/api/login', { token: s.token, body: { username: 'user', password: 'errada' } });
    const after = call('GET', '/api/me', { token: s.token });
    const pass = r.status === 401 && after.status === 200;
    record('T06', 'Login inválido com sessão anterior', '401 + sessão anterior intacta',
        'login ' + r.status + ' · /me depois ' + after.status,
        pass ? PASS : FAIL,
        pass ? '401 no /login nunca despoleta refresh (canRefresh exclui login/refresh em core/http.js)' : '');
})();

// T07 — Navegação administrativa com role insuficiente -> 403
(function () {
    const s = login('user', 'user123'); // sessão FRESCA (testes anteriores podem ter revogado as antigas)
    const rStats = call('GET', '/api/admin/stats', { token: s.token });
    const rRules = call('GET', '/api/rules', { token: s.token });
    const pass = rStats.status === 403 && rRules.status === 403;
    record('T07', 'API administrativa com role insuficiente', '403 / 403',
        rStats.status + '/' + rRules.status,
        pass ? PASS : FAIL,
        pass ? 'guard {admin:true} no servidor; no cliente o guard de rotas manda a /403 (meta roles)' : '');
})();

// T08 — Redirect externo após login -> nunca sair da origem (code review)
(function () {
    // T08 é navegação cliente: LoginView faz router.push($route.query.redirect || '/')
    // com vue-router 3 — push trata a string como CAMINHO interno (match -> catch-all
    // '*'); history.pushState com URL cross-origin lança SecurityError (a origem não
    // muda) e o router.onError/log do submit apanham o resto. Nenhum
    // location.href/window.open em src/ (grep). Conclusão: não há escape de origem.
    record('T08', 'Redirect externo após login (?redirect=https://evil.com)', 'nunca sair da origem',
        'code review', REVIEW,
        'router.push nunca faz location.href; pushState cross-origin é bloqueado pelo browser; destino estranho cai no catch-all *');
})();

// T09 — Alteração de roles no localStorage -> não concede acesso à API
(function () {
    // O intruso forja o token com roles=['admin'] (equivale ao spoof do localStorage:
    // o que a API vê é o payload do token, não a UI).
    const s = login('user', 'user123'); // sessão FRESCA (testes anteriores podem ter revogado as antigas)
    const t = tamper(s.token, function (p) { p.roles = ['admin']; });
    const r = call('GET', '/api/admin/stats', { token: t });
    const denied = r.status === 401 || r.status === 403;
    record('T09', 'Roles elevadas no token/localStorage', 'sem acesso à API (401/403)',
        String(r.status) + (r.status === 200 ? ' (ESCALADA!)' : ''),
        denied ? PASS : FAIL,
        denied ? 'roles vêm SEMPRE da BD (sessionOf -> userById -> user.roles), nunca do payload' : '');
})();

// T10 — Alteração de ID em recursos alheios -> 403 ou 404
(function () {
    // A) PUT num post alheio (post 1 é do admin) com authorId falsificado no body
    const s = login('user', 'user123');   // sessão FRESCA (testes anteriores podem ter revogado as antigas)
    const rPut = call('PUT', '/api/posts/1', { token: s.token, body: { title: 'sequestrado', authorId: '2' } });
    // B) DELETE alheio
    const rDel = call('DELETE', '/api/posts/1', { token: s.token });
    // C) mass-assignment na CRIAÇÃO (authorId do body tem de ser ignorado)
    const rPost = call('POST', '/api/posts', { token: s.token, body: { title: 'meu', authorId: '1' } });
    const newId = rPost.body && rPost.body.data && rPost.body.data.id;
    const rec = newId && schema.posts.find(newId);
    const authorUntouched = rec && String(rec.authorId) === '2';
    // D) PUT /profile com id de outro utilizador no body
    const rProf = call('PUT', '/api/profile', { token: s.token, body: { id: '1', name: 'Hijack' } });
    const adminName = schema.users.find('1').name;
    const pass = rPut.status === 403 && rDel.status === 403 && authorUntouched
        && rProf.status === 200 && adminName === 'Josue Andre Admin' && String(schema.users.find('2').name) === 'Hijack';
    record('T10', 'Alteração de ID em recursos alheios', '403/404 + body ignorado',
        'PUT alheio ' + rPut.status + ' · DELETE alheio ' + rDel.status +
        ' · POST authorId=' + (authorUntouched ? 'da sessão ✓' : 'do body ✗') +
        ' · profile id no body ' + (rProf.status === 200 && adminName === 'Josue Andre Admin' ? 'ignorado ✓' : 'aplicado ✗'),
        pass ? PASS : FAIL,
        pass ? 'owner rule (403) + listas brancas editable + profile self-scoped' : '');
})();

// T11 — Sub-admin: 'User' é recurso da POLÍTICA — read/update pela regra;
// sem create/delete; o campo roles é RESERVADO ao role admin (defesa de escalada)
(function () {
    const s = login('subadmin', 'subadmin123');
    const rList = call('GET', '/api/admin/users', { token: s.token });
    const rEdit = call('PUT', '/api/admin/users/4', { token: s.token, body: { name: 'Diogo Visitante' } });
    const rCreate = call('POST', '/api/admin/users', { token: s.token, body: { username: 'intruso', password: 'temp-123', name: 'Intruso', roles: ['admin'] } });
    const rDel = call('DELETE', '/api/admin/users/4', { token: s.token });
    // ESCALADA: tentar promover outra conta a admin pelo campo roles -> 403 e o
    // record fica intacto (roles só saem do role admin — users.js validateUpdate)
    const rRoles = call('PUT', '/api/admin/users/4', { token: s.token, body: { name: 'Diogo Visitante', roles: ['admin'] } });
    const viewerRoles = schema.users.find('4').roles;
    const rStats = call('GET', '/api/admin/stats', { token: s.token });
    const rRules = call('GET', '/api/rules', { token: s.token });
    // Um user comum (sem regras User) continua sem nada:
    const u = login('user', 'user123');
    const rUserList = call('GET', '/api/admin/users', { token: u.token });
    const pass = rList.status === 200 && rEdit.status === 200 && rCreate.status === 403
        && rDel.status === 403 && rRoles.status === 403
        && String(viewerRoles) === String(['viewer'])
        && rStats.status === 403 && rRules.status === 403 && rUserList.status === 403;
    record('T11', 'Sub-admin: política governa o recurso User',
        'read/update 200 · create/delete 403 · roles 403 · stats/rules 403 · user comum 403',
        'lista ' + rList.status + ' · editar ' + rEdit.status + ' · criar ' + rCreate.status
        + ' · eliminar ' + rDel.status + ' · promover por roles ' + rRoles.status
        + (String(viewerRoles) === String(['viewer']) ? ' (roles intactos ✓)' : ' (ROLES ALTERADOS ✗)')
        + ' · stats ' + rStats.status + ' · rules ' + rRules.status + ' · user comum lista ' + rUserList.status,
        pass ? PASS : FAIL,
        pass ? 'subject User na fábrica: a MESMA política aplica API e guard (meta.perm); campo roles reservado ao role admin (403)' : '');
})();

// T12 — Escalada via CONTA ALVO admin: o sub-admin tem a regra
// 'update User', mas uma conta com o ROLE admin só se edita pelo ROLE admin.
// Sem a defesa, mudava a PASSWORD de um admin e tomava-lhe a conta (a
// credencial nova é do conhecimento do EDITOR; as sessões do alvo morrem logo
// a seguir — afterUpdate). O admin mantém o poder sobre contas admin (a
// própria incluída) e o sub-admin mantém o update sobre contas COMUNS (T11).
(function () {
    const s = login('subadmin', 'subadmin123');
    const adminBefore = schema.users.find('1');
    const nameBefore = adminBefore.name;
    const hashBefore = adminBefore.passwordHash; // hash PHC — a BD não guarda password
    const rName = call('PUT', '/api/admin/users/1', { token: s.token, body: { name: 'Hijacked Admin' } });
    const rPass = call('PUT', '/api/admin/users/1', { token: s.token, body: { password: 'sub-owned-99' } });
    const admin = schema.users.find('1');
    const intact = admin.name === nameBefore && admin.passwordHash === hashBefore;
    // O ADMIN continua a poder editar uma conta admin (a própria incluída):
    const a = login('admin', 'admin123');
    const rAdminSelf = call('PUT', '/api/admin/users/1', { token: a.token, body: { name: nameBefore } });
    // ...e o sub-admin mantém o update sobre contas COMUNS (a sua função):
    const rCommon = call('PUT', '/api/admin/users/4', { token: s.token, body: { name: 'Diogo Visitante' } });
    const pass = rName.status === 403 && rPass.status === 403 && intact
        && rAdminSelf.status === 200 && rCommon.status === 200;
    record('T12', 'Conta ALVO admin editada por quem não tem o role admin',
        '403 / 403 · registo intacto · admin edita admin 200 · sub-admin edita comum 200',
        'nome ' + rName.status + ' · password ' + rPass.status
        + (intact ? ' (registo intacto ✓)' : ' (REGISTO ALTERADO ✗)')
        + ' · admin self ' + rAdminSelf.status + ' · sub-admin em comum ' + rCommon.status,
        pass ? PASS : FAIL,
        pass ? 'conta com o role admin só se edita pelo role admin (users.js validateUpdate, 403 antes da forma)' : 'sub-admin toma contas admin pela password nova (escalada de credencial)');
})();

// T13 — Adulteração do INVÓLUCRO: bytes FORA do payload.
// O payloadOf só lê o segmento-2 do 'mrg.<payload>.mock': com o hash limitado
// ao payload (earlier behavior e antes), um token com o sufixo trocado ou o payload
// re-codificado em base64 padrão era ACEITE (mesmas afirmações, bytes
// diferentes) — a adulteração "inofensiva" que o devtools deixava passar.
// O hashToken cobre a STRING COMPLETA do token: qualquer byte fora do
// lugar já não casa com o registry => 401 invalid_token.
(function () {
    const s = login('user', 'user123'); // sessão FRESCA
    // A) sufixo alterado ('.mock' -> '.moCK'): payload intacto
    const tSuffix = s.token.replace(/\.mock$/, '.moCK');
    const rSuffix = call('GET', '/api/me', { token: tSuffix });
    // B) payload re-codificado em base64 PADRÃO (+/ e padding =): a
    //    descodificação devolve o MESMO objecto — só os bytes mudam
    let seg = s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (seg.length % 4 !== 0) seg += '=';
    const tB64 = 'mrg.' + seg + '.mock';
    const rB64 = call('GET', '/api/me', { token: tB64 });
    const denied = function (r) { return r.status === 401 && r.body && r.body.error === 'invalid_token'; };
    const pass = denied(rSuffix) && denied(rB64);
    record('T13', 'Adulteração do invólucro (sufixo / re-codificação b64)', '401 invalid_token nos dois',
        'sufixo ' + rSuffix.status + (rSuffix.status === 200 ? ' (ACEITE — invólucro não verificado!)' : '')
        + ' · b64 re-codificado ' + rB64.status + (rB64.status === 200 ? ' (ACEITE — hash só do payload!)' : ''),
        pass ? PASS : FAIL,
        pass ? 'hashToken cobre o TOKEN COMPLETO (invólucro incluído): qualquer byte alterado invalida a sessão' : 'servidor só verifica o payload — o invólucro altera-se à vontade');
})();

// ---------- 7. relatório ----------
const width = 108;
const line = '-'.repeat(width);
console.log(line);
console.log('MATRIZ DE TESTES DE INTRUSÃO T01–T13 — estado actual (' + new Date().toISOString() + ')');
console.log('Código sob teste: dev/mock/ (cópia fresca de ' + TEMPLATE + ')');
console.log(line);
for (const r of results) {
    console.log(r.id + '  ' + r.test);
    console.log('    esperado: ' + r.expected);
    console.log('    obtido  : ' + r.actual);
    console.log('    veredicto: ' + (r.verdict === PASS ? '[PASSA] ' : r.verdict === FAIL ? '[FALHA] ' : '[REVIEW] ') + r.detail);
    console.log('');
}
const fails = results.filter(function (r) { return r.verdict === FAIL; }).length;
console.log(line);
console.log('RESULTADO: ' + (results.length - fails) + '/' + results.length + ' passam · ' + fails + ' falham' +
    (fails ? ' — o servidor NÃO é (ainda) a autoridade sobre identidade/sessão nos testes marcados' : ''));
console.log(line);
