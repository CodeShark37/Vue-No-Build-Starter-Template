// Fábrica do Mirage: regista modelos, seeds e rotas; os componentes continuam a
// usar this.$api / this.$http. A autenticação é server-side em sessions.js,
// enquanto helpers.js e routes/ implementam as respostas e políticas.

import { seedUsers, demoAccounts } from './seeds/users.js';
import { seedPosts } from './seeds/posts.js';
import { seedBooks } from './seeds/books.js';
import { roleRules } from './seeds/permissions.js';
import { register as registerAuthRoutes } from './routes/auth.js';
import { register as registerProfileRoutes } from './routes/profile.js';
import { register as registerPermissionRoutes } from './routes/permissions.js';
import { register as registerUserRoutes } from './routes/users.js';
import { register as registerPostRoutes } from './routes/posts.js';
import { register as registerBookRoutes } from './routes/books.js';

// O build UMD (vendor-dev/mirage.min.js, injetado pelo env.js) publica a API em window.MirageJS.Server.
function mirageApi() {
    if (typeof MirageJS === 'undefined') return undefined;
    return MirageJS.Server || MirageJS;
}

// O Pretender interno casa rotas por host:porta. Se apiBase for absoluto
// (ex.: 'http://localhost/api/'), as rotas têm de ser registadas nesse mesmo host,
// mesmo que a página esteja noutra porta (Live Server, etc.).
// Para apiBase relativo ('/api/') devolve '' => mesma origem da página.
function urlPrefixFrom(apiBase) {
    if (/^https?:\/\//i.test(apiBase)) {
        try { return new URL(apiBase).origin; } catch (e) { return ''; }
    }
    return '';
}

/**
 * Cria e arranca o servidor mock (idempotente e síncrono: chamar ANTES de
 * qualquer pedido — o main.js faz-no como 1.º passo do bootstrap). Com
 * cfg.mock=false (env.js) devolve null e os pedidos vão para a rede real.
 * A BD persiste entre reloads (dump em localStorage assinado pelos seeds —
 * ver bloco de persistência em baixo); window.__mockReset() volta ao seed.
 * @param {Object} cfg configuração derivada (core/config.js)
 * @returns {Object|null} servidor Mirage, ou null sem mock/vendor
 */
export function startMirage(cfg) {
    const Mirage = mirageApi();
    if (!cfg.mock) return null;                  // interruptor de deploy: env.js (window.ENV.mock)
    if (!Mirage) {
        console.warn('[mirage] vendor-dev/mirage.min.js não carregado — os pedidos vão para ' + cfg.apiBase);
        return null;
    }
    const mirageCfg = cfg.mirage || {};
    if (mirageCfg.enabled === false) return null;
    const ttl = typeof mirageCfg.tokenTtl === 'number' ? mirageCfg.tokenTtl : 120;
    // Vida do REFRESH token (a credencial de renovação) — longa, como o
    // refresh de um backend real; o access continua curto (ttl acima).
    const refreshTtl = typeof mirageCfg.refreshTtl === 'number' ? mirageCfg.refreshTtl : 604800;

    // Dados dos seeds calculados UMA vez (fora do callback de seeds): servem o
    // boot e a ASSINATURA da persistência lá em baixo. seedPosts() é
    // determinístico (ver seeds/posts.js) — senão, a assinatura mudaria a cada
    // boot e nenhum dump jamais re-hidrataria.
    const postRows = seedPosts();

    // ----- Persistência da BD do mock (só dev) — ler o dump ANTES do servidor -----
    // Sem isto, cada reload re-semeava a BD e as mudanças feitas em runtime
    // (revogar uma regra, criar post/utilizador) morriam no primeiro F5. Como
    // funciona:
    //   1. a BD despeja-se para localStorage a CADA pedido respondido (hook
    //      handledRequest do Pretender, que o Mirage traz lá dentro);
    //   2. no boot seguinte, o dump da MESMA assinatura de seeds VENCE sobre o
    //      seed: os seeds são SALTADOS e a BD nasce já do dump (loadData) —
    //      sem seeds não há colisão de ids (o Mirage não esvazia as colecções
    //      no loadData: inserir por cima do seed rebenta "ID already used");
    //   3. a chave do dump inclui a assinatura dos seeds (FNV-1a sobre o JSON
    //      dos seeds): editar um ficheiro de seed muda a assinatura, o dump
    //      antigo é apagado e a BD volta ao NOVO seed — nunca um dump stale a
    //      esconder mudanças no seed.
    // localStorage indisponível/cheio/corrompido => degrada para efémero (seed).
    // window.__mockReset() apaga o dump e recarrega: voltar ao estado inicial.
    const DUMP_PREFIX = 'mock-db-';
    function seedSignature() {
        const json = JSON.stringify({ users: seedUsers, posts: postRows, books: seedBooks, rules: roleRules });
        let h = 0x811c9dc5; // FNV-1a 32-bit — só para detectar mudança, não é criptografia
        for (let i = 0; i < json.length; i++) {
            h ^= json.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h.toString(16) + '-' + json.length;
    }
    const dumpKey = DUMP_PREFIX + seedSignature();
    let dumpToLoad = null;
    try {
        // Dumps de assinaturas antigas são lixo (seeds mudaram): apagá-los.
        const stale = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf(DUMP_PREFIX) === 0 && k !== dumpKey) stale.push(k);
        }
        stale.forEach(function (k) { localStorage.removeItem(k); });

        const raw = localStorage.getItem(dumpKey);
        if (raw) {
            const d = JSON.parse(raw);
            if (d && d.users && d.posts && d.rules) {
                // Dumps de modelos antigos do mock (sem type/family/tokenHash nas
                // sessões): linhas inválidas fora — os tokens antigos não
                // validam de qualquer forma (a current behavior passou a fazer o hash do
                // TOKEN COMPLETO; linhas com o hash só do payload morrem aqui).
                if (!d.sessions) d.sessions = [];
                d.sessions = d.sessions.filter(function (s) { return s && s.type && s.family && s.tokenHash; });
                dumpToLoad = d;
            }
        }
    } catch (e) { /* localStorage indisponível => seed normal */ }

    const mirage = Mirage.createServer({
        environment: 'development',

        models: {
            user: Mirage.Model.extend({}),
            post: Mirage.Model.extend({}),
            book: Mirage.Model.extend({}), // 2.º recurso (fábrica registerCrud)
            rule: Mirage.Model.extend({}), // a política de permissões, como linhas de BD
            // O REGISTRY de sessões (sessions.js): a autoridade sobre identidade
            // e ciclo de vida da sessão. Persiste com o dump: os tokens
            // sobrevivem ao F5 como sobreviveriam a um restart num backend
            // com store.
            session: Mirage.Model.extend({}),
        },

        seeds(server) {
            // Dump da sessão anterior => VENCE sobre o seed: os seeds são
            // saltados (senão os ids colidiam no loadData) e a BD nasce do dump
            // logo a seguir ao createServer.
            if (dumpToLoad) return;
            seedUsers.forEach(function (u) { server.create('user', u); });
            postRows.forEach(function (p) { server.create('post', p); });
            seedBooks.forEach(function (b) { server.create('book', b); });

            // A política de permissões também é seed — vai para a BD do mock
            // (model 'rule') e não fica numa constante: os handlers de
            // permissions.js leem-na A CADA pedido, como um backend real lê a
            // sua tabela central. roleRules é só o ESTADO INICIAL.
            // position: a ORDEM de avaliação CASL é um dado da regra —
            // nas regras CASL a ÚLTIMA que casa vence, por isso reordenar as
            // linhas muda permissões efectivas (drag & drop no RulesPanel).
            // Seeds: position pela ordem do ficheiro (admin primeiro, depois user).
            let rulePosition = 0;
            Object.keys(roleRules).forEach(function (role) {
                roleRules[role].forEach(function (r) {
                    rulePosition += 1;
                    server.create('rule', {
                        role: role,
                        action: r.action,
                        subject: r.subject,
                        conditions: r.conditions || null,
                        inverted: r.inverted || false,
                        position: rulePosition,
                    });
                });
            });
        },

        routes() {
            // Regista as rotas no host do apiBase (ver urlPrefixFrom acima).
            const prefix = urlPrefixFrom(cfg.apiBase);
            if (prefix) this.urlPrefix = prefix;

            // Mirage (0.1.48) intercepta XHR e fetch de TODOS os URLs; o loader dos
            // .vue usa fetch, por isso tudo o que não é a API passa para a rede real.
            // (O predicado corre antes do matching de rotas; URL sem /api => rede.)
            this.passthrough(function (request) {
                return request.url.indexOf('/api') === -1;
            });

            this.timing = typeof mirageCfg.timing === 'number' ? mirageCfg.timing : 400;

            // Contexto partilhado dos handlers: a API do Mirage (para montar
            // Response), os ttl dos tokens (login/refresh emitem) e o modo debug
            // (localhost/dev — registra os endpoints de demo __demo/* nas rotas
            // de auth; fora de dev respondem 404).
            const ctx = { Mirage: Mirage, ttl: ttl, refreshTtl: refreshTtl, debug: !!cfg.debug };
            registerAuthRoutes(this, ctx);
            registerProfileRoutes(this, ctx);
            registerPermissionRoutes(this, ctx);
            registerUserRoutes(this, ctx);
            registerPostRoutes(this, ctx);
            registerBookRoutes(this, ctx);
        },
    });

    // Hidratação (seeds já saltados: os ids do dump entram numa BD vazia) e os
    // hooks de persistência — SEMPRE definidos, mesmo que o dump seja rejeitado
    // (aí corre o seed e a persistência volta a funcionar a partir dele).
    let restoredRecords = 0;
    if (dumpToLoad) {
        try {
            mirage.db.loadData(dumpToLoad);
            restoredRecords = dumpToLoad.users.length + dumpToLoad.posts.length
                + (dumpToLoad.books ? dumpToLoad.books.length : 0) + dumpToLoad.rules.length
                + (dumpToLoad.sessions ? dumpToLoad.sessions.length : 0);
        } catch (e) {
            console.warn('[mirage] dump rejeitado (' + (e && e.message ? e.message : e) + ') — BD do seed');
        }
    }
    try {
        mirage.pretender.handledRequest = function () {
            try { localStorage.setItem(dumpKey, JSON.stringify(mirage.db.dump())); } catch (e) { /* cheio/indisponível */ }
        };
        window.__mockReset = function () {
            try { localStorage.removeItem(dumpKey); } catch (e) { /* idem */ }
            location.reload();
        };
    } catch (e) {
        console.warn('[mirage] persistência da BD indisponível (' + (e && e.message ? e.message : e) + ') — mock efémero');
    }

    console.info('[mirage] mock API activa (' + mirageCfg.timing + 'ms de latência, token '
        + ttl + 's) — utilizadores: ' + demoAccounts.map(function (u) {
            return u.username + '/' + u.password;
        }).join(', ')
        + (restoredRecords ? ' | BD RESTAURADA do dump (' + restoredRecords + ' records)' : ' | BD do seed')
        + ' | persiste entre reloads — window.__mockReset() volta ao seed');
    return mirage;
}
