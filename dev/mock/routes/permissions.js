// Rotas de PERMISSÕES do mock. A política é DADO: vive na BD do mock (model
// 'rule', semeada de seeds/permissions.js) e é LIDA A CADA PEDIDO — não há
// regras em código nem cache. É o ÚNICO domínio que NÃO passa pela fábrica
// registerCrud: não é CRUD canónico — tem endpoint de REORDENAÇÃO (PUT
// /rules/order, a semântica "a última regra que casa vence"), validações
// próprias (duplicadas, conditions cruas) e auto-protecções (a última regra do
// role admin é intocável). Leitura, em duas variantes:
//
//   GET /api/permissions      -> regras CASL do utilizador autenticado, em JSON
//                                plain. É o que core/ability.js consome para
//                                construir a Ability que $perm.can() consulta.
//   GET /api/permissions/:id  -> permissões EFECTIVAS de um utilizador (só
//                                admin): aqui :id é o ID DO UTILIZADOR — devolve
//                                o perfil público + as regras JÁ MATERIALIZADAS
//                                com os dados DELE, exactamente o que o GET
//                                acima lhe serviria no próximo sync. 404 se o
//                                utilizador não existir; 403 sem o role admin.
//
// E CRUD da PRÓPRIA política (só admin) — a tabela central que um backend real
// teria. Em /api/rules (NUNCA em /permissions/:id, que é id de UTILIZADOR):
//
//   GET    /api/rules      -> a política CRUA, com os placeholders intactos
//                             ('${user.username}') — o contrário didáctico do
//                             GET /permissions/:id, que materializa. Ordenada
//                             por POSITION: é a ordem de AVALIAÇÃO CASL — a
//                             ÚLTIMA regra que casa sobre o mesmo (action,
//                             subject) vence (drag & drop no painel).
//   POST   /api/rules      -> cria {role, action, subject, conditions?,
//                             inverted?} => 201. inverted=true é um CANNOT:
//                             a regra NEGA o que as anteriores permitiam (e,
//                             sendo a última, nega mesmo). Nasce em ÚLTIMO
//                             lugar (position = max+1): "a mais recente vence".
//   PUT    /api/rules/:id  -> muda qualquer campo da regra (incl. inverted).
//   PUT    /api/rules/order-> REORDENA a política: body {ids:[...]} com TODOS
//                             os ids na nova ordem (position = índice+1).
//                             422 se faltar/sobrar id (nunca perder regras por
//                             um drag mal feito).
//   DELETE /api/rules/:id  -> elimina => 204
//
// TODAS exigem role admin (403 fora disso). Validações (422 {error:'validation',
// field, message}): role/action/subject = texto 1-40; conditions = null ou
// objecto plano com valores primitivos; regra duplicada (mesmos 4 campos)
// rejeitada. Auto-protecção (como o self-guard dos users): nenhuma mutação pode
// deixar o role 'admin' SEM regras — a política ficava fail-closed para quem
// a administra. O seed (roleRules) é só o ESTADO INICIAL: as mudanças aqui
// valem já nos próximos GET /permissions (a BD é relida a cada pedido) e o
// cliente re-sincroniza a Ability ($perm.sync() após cada mutação no painel).
// O handler nunca decide nada:
//  1. junta as regras de TODOS os roles do utilizador (role sem entrada no seed
//     => zero regras => fail-closed);
//  2. materializa os placeholders '${user.<campo>}' com os dados da sessão
//     (ou do utilizador alvo, no :id).
// Esse motor (rulesForUser/materializeRules/abilityFor) vive em helpers.js e é o
// MESMO que as rotas de posts usam para aplicar a política a CADA pedido — ler
// incluído: apagar a regra 'read Post' de um role tranca GET /posts com 403 no
// pedido seguinte. Esconder botões é UX, não segurança.
import { send, parseBody, guard, publicUser, userById, rulesForUser } from '../helpers.js';

// Resposta 422 canónica do mock (igual a routes/users.js): {error, field, message?}.
function send422(Mirage, field, message) {
    const body = { error: 'validation', field: field };
    if (message) body.message = message;
    return send(Mirage, 422, body);
}

// Forma pública de uma regra da política: o que /api/rules devolve — CRUA,
// com o placeholder '${user.username}' intacto (a materialização é feita na
// LEITURA por utilizador, nunca na tabela). position/inverted: a ordem
// de avaliação e o interruptor cannot — ambos parte da identidade da regra.
function publicRule(m) {
    return {
        id: m.id,
        role: m.role,
        action: m.action,
        subject: m.subject,
        conditions: m.conditions || null,
        inverted: !!m.inverted,
        position: typeof m.position === 'number' ? m.position : Number(m.id),
    };
}

function ruleById(schema, id) {
    const rules = schema.rules.all().models;
    for (let i = 0; i < rules.length; i++) {
        if (String(rules[i].id) === String(id)) return rules[i];
    }
    return undefined;
}

function countRulesForRole(schema, role) {
    return schema.rules.where({ role: role }).length;
}

// Texto 1-40 (depois de trim) para role/action/subject — o resto é livre:
// subjects/acções CASL são convenções da app, não do mock.
function labelInvalid(value) {
    return typeof value !== 'string' || !value.trim() || value.trim().length > 40;
}

// conditions: ausente => null; caso contrário objecto PLANO (não array) com
// valores primitivos — é um DADO de condição CASL, não expressão arbitrária.
function conditionsInvalid(value) {
    if (value === undefined || value === null) return false;
    if (typeof value !== 'object' || Array.isArray(value)) return true;
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = value[k];
        if (!k || typeof k !== 'string') return true;
        const t = typeof v;
        if (v === null || (t !== 'string' && t !== 'number' && t !== 'boolean')) return true;
    }
    return false;
}

function normalizeConditions(value) {
    if (value === undefined || value === null) return null;
    const out = {};
    Object.keys(value).forEach(function (k) { out[k] = value[k]; });
    return out;
}

// Regra idêntica (os 4 campos + inverted) já existe? Na PUT, exceptuando a própria.
function duplicateRule(schema, rule, exceptId) {
    const key = JSON.stringify([rule.role, rule.action, rule.subject, rule.conditions || null, !!rule.inverted]);
    const rules = schema.rules.all().models;
    for (let i = 0; i < rules.length; i++) {
        if (exceptId !== undefined && String(rules[i].id) === String(exceptId)) continue;
        const m = rules[i];
        if (JSON.stringify([m.role, m.action, m.subject, m.conditions || null, !!m.inverted]) === key) return true;
    }
    return false;
}

/**
 * Registra as rotas de permissões: leitura da política (sessão e por utilizador)
 * + CRUD/reordenação da política crua (ver contrato no cabeçalho).
 * @param {Object} server servidor Mirage em configuração (routes())
 * @param {{Mirage: Object, ttl: number}} ctx contexto partilhado dos handlers
 * @returns {void}
 */
export function register(server, ctx) {
    const Mirage = ctx.Mirage;

    // Regras da SESSÃO (o cliente re-sincroniza em cada mudança de token —
    // watcher em core/ability.js).
    server.get('/api/permissions', function (schema, request) {
        const g = guard(Mirage, schema, request);
        if (g.response) return g.response;
        return send(Mirage, 200, { rules: rulesForUser(schema, g.user) });
    });

    // As MESMAS regras, vistas pela sessão de OUTRO utilizador (só admin). É o
    // espelho da política por utilizador: a mesma tabela, resolvida com os
    // dados dele — o que o painel UserPermissions mostra em /admin/stats.
    server.get('/api/permissions/:id', function (schema, request) {
        const g = guard(Mirage, schema, request, { admin: true });
        if (g.response) return g.response;
        const target = userById(schema, request.params.id);
        if (!target) return send(Mirage, 404, { error: 'not_found' });
        return send(Mirage, 200, { data: { user: publicUser(target), rules: rulesForUser(schema, target) } });
    });

    // ---------- CRUD da política (só admin): a tabela central ----------

    // A política CRUA (placeholders intactos) — é o que o painel da
    // /admin/permissions edita e REORDENA por drag & drop. Ordenada por
    // position: a ordem de AVALIAÇÃO CASL — a última regra que casa
    // sobre o mesmo (action, subject) vence, por isso a listagem TEM de mostrar
    // a ordem real, e não a de criação.
    server.get('/api/rules', function (schema, request) {
        const g = guard(Mirage, schema, request, { admin: true });
        if (g.response) return g.response;
        const rows = schema.rules.all().models.slice().sort(function (a, b) {
            const pa = typeof a.position === 'number' ? a.position : Number(a.id);
            const pb = typeof b.position === 'number' ? b.position : Number(b.id);
            return pa - pb || (Number(a.id) - Number(b.id));
        });
        return send(Mirage, 200, { data: rows.map(publicRule) });
    });

    server.post('/api/rules', function (schema, request) {
        const g = guard(Mirage, schema, request, { admin: true });
        if (g.response) return g.response;
        const body = parseBody(request);
        const role = typeof body.role === 'string' ? body.role.trim() : '';
        const action = typeof body.action === 'string' ? body.action.trim() : '';
        const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
        if (labelInvalid(role)) return send422(Mirage, 'role', '1-40 caracteres');
        if (labelInvalid(action)) return send422(Mirage, 'action', '1-40 caracteres');
        if (labelInvalid(subject)) return send422(Mirage, 'subject', '1-40 caracteres');
        if (conditionsInvalid(body.conditions)) {
            return send422(Mirage, 'conditions', 'null ou objecto com valores primitivos');
        }
        if (body.inverted !== undefined && typeof body.inverted !== 'boolean') {
            return send422(Mirage, 'inverted', 'booleano (true = cannot)');
        }
        const conditions = normalizeConditions(body.conditions);
        const inverted = body.inverted === true;
        if (duplicateRule(schema, { role: role, action: action, subject: subject, conditions: conditions, inverted: inverted })) {
            return send422(Mirage, 'rule', 'a regra já existe');
        }
        // Nasce EM ÚLTIMO LUGAR (max position + 1): no CASL a última regra que
        // casa vence — criar um cannot agora e não o mover é o cenário natural
        // de "neguei e ele perdeu logo o acesso".
        const maxPos = schema.rules.all().models.reduce(function (max, m) {
            const p = typeof m.position === 'number' ? m.position : Number(m.id);
            return Math.max(max, isNaN(p) ? 0 : p);
        }, 0);
        const rule = schema.rules.create({
            role: role,
            action: action,
            subject: subject,
            conditions: conditions,
            inverted: inverted,
            position: maxPos + 1,
        });
        return send(Mirage, 201, { data: publicRule(rule) });
    });

    // REORDENAÇÃO da política (o endpoint do drag & drop). Body:
    // { ids: [id, id, ...] } com TODOS os ids existentes, na nova ordem de
    // avaliação (position = índice + 1). Conjunto divergente (falta/sobra/
    // duplicado/404) => 422 e NADA muda — um drag mal feito nunca apaga nem
    // duplica regras. 200 devolve a política já reordenada.
    server.put('/api/rules/order', function (schema, request) {
        const g = guard(Mirage, schema, request, { admin: true });
        if (g.response) return g.response;
        const body = parseBody(request);
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;
        if (!ids || !ids.length) return send422(Mirage, 'ids', 'array com todos os ids das regras');
        const all = schema.rules.all().models;
        if (ids.length !== all.length) return send422(Mirage, 'ids', 'tem de vir TODOS os ids (' + all.length + ' regras)');
        const seen = {};
        for (let i = 0; i < ids.length; i++) {
            if (seen[ids[i]]) return send422(Mirage, 'ids', 'id repetido: ' + ids[i]);
            seen[ids[i]] = true;
            if (!ruleById(schema, ids[i])) return send422(Mirage, 'ids', 'id desconhecido: ' + ids[i]);
        }
        ids.forEach(function (id, index) {
            ruleById(schema, id).update({ position: index + 1 });
        });
        const rows = schema.rules.all().models.slice().sort(function (a, b) {
            const pa = typeof a.position === 'number' ? a.position : Number(a.id);
            const pb = typeof b.position === 'number' ? b.position : Number(b.id);
            return pa - pb || (Number(a.id) - Number(b.id));
        });
        return send(Mirage, 200, { data: rows.map(publicRule) });
    });

    server.put('/api/rules/:id', function (schema, request) {
        const g = guard(Mirage, schema, request, { admin: true });
        if (g.response) return g.response;
        const rule = ruleById(schema, request.params.id);
        if (!rule) return send(Mirage, 404, { error: 'not_found' });
        const body = parseBody(request);
        const patch = {};

        if (body.role !== undefined) {
            const role = typeof body.role === 'string' ? body.role.trim() : '';
            if (labelInvalid(role)) return send422(Mirage, 'role', '1-40 caracteres');
            // Auto-protecção: tirar a ÚLTIMA regra ao role 'admin' trancava a
            // política (fail-closed para quem a administra).
            if (rule.role === 'admin' && role !== 'admin' && countRulesForRole(schema, 'admin') === 1) {
                return send422(Mirage, 'role', 'o role admin tem de manter pelo menos uma regra');
            }
            patch.role = role;
        }
        if (body.action !== undefined) {
            const action = typeof body.action === 'string' ? body.action.trim() : '';
            if (labelInvalid(action)) return send422(Mirage, 'action', '1-40 caracteres');
            patch.action = action;
        }
        if (body.subject !== undefined) {
            const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
            if (labelInvalid(subject)) return send422(Mirage, 'subject', '1-40 caracteres');
            patch.subject = subject;
        }
        if (body.conditions !== undefined) {
            if (conditionsInvalid(body.conditions)) {
                return send422(Mirage, 'conditions', 'null ou objecto com valores primitivos');
            }
            patch.conditions = normalizeConditions(body.conditions);
        }
        if (body.inverted !== undefined) {
            if (typeof body.inverted !== 'boolean') {
                return send422(Mirage, 'inverted', 'booleano (true = cannot)');
            }
            patch.inverted = body.inverted;
        }

        const merged = {
            role: patch.role !== undefined ? patch.role : rule.role,
            action: patch.action !== undefined ? patch.action : rule.action,
            subject: patch.subject !== undefined ? patch.subject : rule.subject,
            conditions: patch.conditions !== undefined ? patch.conditions : (rule.conditions || null),
            inverted: patch.inverted !== undefined ? patch.inverted : !!rule.inverted,
        };
        if (duplicateRule(schema, merged, rule.id)) {
            return send422(Mirage, 'rule', 'a regra já existe');
        }
        rule.update(patch);
        return send(Mirage, 200, { data: publicRule(rule) });
    });

    server.del('/api/rules/:id', function (schema, request) {
        const g = guard(Mirage, schema, request, { admin: true });
        if (g.response) return g.response;
        const rule = ruleById(schema, request.params.id);
        if (!rule) return send(Mirage, 404, { error: 'not_found' });
        if (rule.role === 'admin' && countRulesForRole(schema, 'admin') === 1) {
            return send422(Mirage, 'role', 'o role admin tem de manter pelo menos uma regra');
        }
        rule.destroy();
        return send(Mirage, 204);
    });
}
