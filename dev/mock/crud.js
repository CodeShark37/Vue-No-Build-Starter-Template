// Fábrica de CRUD para recursos do mock — TODOS os recursos com seed passam por
// aqui: declara dados (seeds/), política (subject em seeds/permissions.js) e
// registra as 5 rotas com a MESMA cadeia de aplicação da política, escrita uma
// vez:
//
//   guard (401 sessão / 403 admin) -> nível TIPO (há alguma regra? senão 403)
//   -> nível INSTÂNCIA (as conditions filtram a lista / negam o registo)
//   -> 403 -> 404 -> 422.
//
//   posts  (routes/posts.js)   subject 'Post'  — o recurso de demonstração;
//   books  (routes/books.js)   subject 'Book'  — o caminho rápido (docs/03);
//   users  (routes/users.js)   subject 'User'  — recurso da política; o serialize
//                              corta a password e os hooks levam as validações e
//                              auto-protecções (self-lockout, contas admin).
//   O routes/permissions.js (a política em /api/rules) é escrito à mão DE
//   PROPÓSITO: não é CRUD canónico — tem endpoint de REORDENAÇÃO (PUT
//   /rules/order), nasce em ÚLTIMO lugar e tem auto-protecções próprias.
//
// opts (ver typedef abaixo): model/path, subject CASL OPCIONAL, createAttrs
// (autoria), editable (lista branca do PUT), coerce por campo,
// validate/validateUpdate/validateDelete (422; podem devolver `status`, ex. 403
// num campo reservado), serialize (forma pública), enrich (JOIN de leitura em
// tempo de serviço) e paginação/ordenação server-side (allowedSorts,
// numericSorts — campos comparados com Number).
//
// O servidor é a AUTORIDADE sobre o contrato de interface: editable,
// allowedSorts e numericSorts viajam na META da listagem (meta.editable,
// meta.sorts) e as vistas desenham a partir daí — mudar aqui reflecte-se na UI
// sem tocar em nenhum .vue, uma só fonte de verdade. Expor não é delegar: um
// ?sort= desconhecido cai no defaultSort aqui dentro e campos fora da lista
// branca nunca chegam ao record.
import { send, parseBody, guard, abilityFor, caslSubject, paginate } from './helpers.js';

/**
 * @typedef {Object} PageMeta
 * Meta da paginação das listas do mock, enriquecida com o contrato de
 * edição do recurso: editable é a MESMA lista branca aplicada no PUT. A UI
 * desenha os inputs de edição a partir daqui; o servidor re-verifica a cada
 * PUT — a lista branca nunca é política do cliente, apenas é EXPOSTA por ele.
 * @property {number} page
 * @property {number} perPage
 * @property {number} total
 * @property {number} totalPages
 * @property {boolean} hasMore
 * @property {string[]} editable       campos que o PUT aceita (lista branca do recurso)
 * @property {{allowed: string[], numeric: string[]}} sorts
 *                                     contrato de ORDENAÇÃO: allowed são os campos
 *                                     ?sort= aceites (allowedSorts do recurso); numeric os
 *                                     que comparam como NÚMERO (numericSorts). A DataTable
 *                                     deriva setas e formatação numérica daqui — a config
 *                                     das vistas nunca repete o que o servidor declara.
 */

/**
 * @typedef {Object} CrudOptions
 * @property {string} model                      modelo Mirage singular ('book')…
 * @property {string} path                       …e path da API ('/books' -> /api/books)
 * @property {string} [subject]                  subject CASL ('Book') — o que as regras da política declaram.
 *                                               OPCIONAL: sem subject, as rotas aplicam só o guard (ex.: users,
 *                                               zona admin por ROLE) — a política CASL não é consultada
 * @property {string} [collection]               nome PLURAL da colecção no schema (omissão: model + 's')
 * @property {function(Object, Object): Object} createAttrs  (body, user) -> attrs do POST; é aqui que a autoria é gravada (creatorId/authorId = user.id)
 * @property {string[]} [editable]               lista branca do PUT (String()-coercidos, salvo coerce) — nunca um merge arbitrário do body
 * @property {Object.<string, function>} [coerce] coercão POR CAMPO no PUT: fn(value) -> valor gravado; undefined = não grava (ex.: password vazia = manter)
 * @property {function(Object, Object): {field: string, message?: string}|null} [validate]          (body, schema) -> 422 no POST
 * @property {function(Object, Object, Object): {field: string, message?: string}|null} [validateUpdate]  (body, record, user) -> 422 no PUT (ex.: self-lockout)
 * @property {function(Object, Object): {field: string, message?: string}|null} [validateDelete]  (record, user) -> 422 no DELETE (ex.: não eliminar a própria conta)
 * @property {function(Object, Object, Object, Object): void} [afterUpdate]  (record, user, body, schema) efeitos colaterais
 *                                     APÓS o PUT gravar e ANTES da resposta (ex.: users.js revoga as sessões do
 *                                     alvo quando a password muda — T05). Não devolve nada; para mudar a
 *                                     forma da resposta, use serialize/enrich.
 * @property {function(Object): Object} [serialize] forma PÚBLICA dos attrs (omissão: identidade) — ex.: publicUser corta a password
 * @property {function(Object, Object): Object} [enrich] (attrs publicados, schema) -> attrs finais — junta dados de OUTRAS colecções
 *                                               em TEMPO DE SERVIÇO, sobre cada resposta (lista, detalhe, POST, PUT). É o
 *                                               sitio certo para um JOIN de leitura (ex.: roles do autor do post): esses
 *                                               dados mudam em runtime e NUNCA deviam ser congelados no record.
 * @property {GuardOpts} [guardOpts]             extra exigências do guard (ex.: {admin: true} — 403 sem o role)
 * @property {function(Object): Object} [extraMeta] (schema) -> objecto fundido na META da
 *                                     listagem (ex. users publica meta.roleCounts, a
 *                                     contagem de utilizadores por role do CONJUNTO inteiro —
 *                                     agregado que uma página paginada não consegue derivar).
 *                                     Sem isto, meta = página + editable + sorts.
 * @property {string[]} [allowedSorts]           campos de ordenação aceites em ?sort=
 * @property {string[]} [numericSorts]           campos de allowedSorts comparados com NUMBER
 *                                               no ?sort= (ex. 'pages'); sem isto ordenavam por texto
 * @property {string} [defaultSort]              omissão: 'id'
 * @property {string} [defaultOrder]             omissão: 'desc' ('asc' para listas que nascem do id menor)
 * @property {number} [defaultPerPage]           omissão: 6
 */

// 403 canónico quando a política não permite — ability null (vendor CASL ausente)
// conta como "nada é permitido": fail-closed.
function forbidden(Mirage) {
    return send(Mirage, 403, { error: 'forbidden' });
}

// Procura por id com String(id): compara igual venha o id do URL ou do record
// (mesma razão de userById/postById em helpers.js).
function recordById(schema, model, id) {
    const all = schema[model].all().models;
    for (let i = 0; i < all.length; i++) {
        if (String(all[i].id) === String(id)) return all[i];
    }
    return undefined;
}

/**
 * Registra as 5 rotas CRUD canónicas de um recurso no servidor mock, com a MESMA
 * cadeia de aplicação da política do posts.js (escrita uma vez, ver cabeçalho):
 * guard (401/403 admin) -> nível TIPO -> nível INSTÂNCIA -> 404 -> 422.
 * @param {Object} server servidor Mirage em configuração (routes())
 * @param {{Mirage: Object, ttl: number}} ctx contexto partilhado dos handlers
 * @param {CrudOptions} opts
 * @returns {void}
 */
export function registerCrud(server, ctx, opts) {
    const Mirage = ctx.Mirage;
    const subject = opts.subject; // OPCIONAL: sem subject, só o guard protege
    const model = opts.model;
    // A SCHEMA do Mirage acede-se pelo nome PLURAL da colecção (schema.books,
    // como o schema.posts) — o model singular serve só ao server.create.
    const collection = opts.collection || (model + 's');
    const editable = opts.editable || [];
    const coerce = opts.coerce || {};
    const serialize = opts.serialize || function (attrs) { return attrs; };
    // Junção opcional em tempo de serviço (ex.: authorRoles do post).
    // Corre DEPOIS do serialize, sobre attrs publicados, com o schema à mão —
    // pode ler outras colecções (schema.users, schema.rules, ...). Omissão:
    // identidade (recursos sem join pagam zero).
    const enrich = opts.enrich || function (attrs) { return attrs; };

    // Envelope paginado com a forma PÚBLICA de cada linha (serialize) + enrich.
    function sendPage(schema, visible, request) {
        const page = paginate(visible, request.queryParams || {}, {
            allowedSorts: opts.allowedSorts,
            numericSorts: opts.numericSorts,
            defaultSort: opts.defaultSort || 'id',
            defaultOrder: opts.defaultOrder || 'desc',
            defaultPerPage: opts.defaultPerPage || 6,
        });
        // O contrato de INTERFACE do recurso viaja na meta da listagem:
        // meta.editable é a lista branca do PUT; meta.sorts publica
        // allowedSorts/numericSorts; meta EXTRA do recurso (opts.extraMeta —
        // ex.: users publica meta.roleCounts, a contagem de roles do CONJUNTO
        // inteiro). A UI desenha a partir do que o servidor
        // declara — e o servidor re-verifica tudo a cada pedido (expor não é
        // delegar: ?sort= desconhecido continua a cair no defaultSort aqui
        // dentro, e campos fora da lista branca nunca chegam ao record).
        const meta = Object.assign({}, page.meta, {
            editable: opts.editable || [],
            sorts: {
                allowed: opts.allowedSorts || ['id'],
                numeric: opts.numericSorts || [],
            },
        });
        if (opts.extraMeta) Object.assign(meta, opts.extraMeta(schema));
        return send(Mirage, 200, {
            data: page.data.map(function (attrs) { return enrich(serialize(attrs), schema); }),
            meta: meta,
        });
    }

    // LISTA — com subject, dois níveis como sempre: sem NENHUMA regra de
    // leitura => 403 sem sequer filtrar; com regra (mesmo com conditions), a
    // lista FILTRA. Sem subject (zona role-guardada), a lista sai inteira.
    server.get('/api' + opts.path, function (schema, request) {
        const g = guard(Mirage, schema, request, opts.guardOpts);
        if (g.response) return g.response;
        let visible;
        if (subject) {
            const ability = abilityFor(schema, g.user);
            if (!ability || !ability.can('read', subject)) return forbidden(Mirage);
            visible = schema[collection].all().models.filter(function (r) {
                return ability.can('read', caslSubject(subject, r.attrs));
            });
        } else {
            visible = schema[collection].all().models;
        }
        return sendPage(schema, visible, request);
    });

    // DETALHE — 404 desconhecido; com subject, 403 sem 'read' SOBRE o registo
    // (conditions). Sem subject, o guard chega (401/403-role) e devolve.
    server.get('/api' + opts.path + '/:id', function (schema, request) {
        const g = guard(Mirage, schema, request, opts.guardOpts);
        if (g.response) return g.response;
        const record = recordById(schema, collection, request.params.id);
        if (!record) return send(Mirage, 404, { error: 'not_found' });
        if (subject) {
            const ability = abilityFor(schema, g.user);
            if (!ability || !ability.can('read', caslSubject(subject, record.attrs))) {
                return forbidden(Mirage);
            }
        }
        return send(Mirage, 200, { data: enrich(serialize(record.attrs), schema) });
    });

    // CRIAÇÃO — com subject, 'create' ao nível do TIPO (as conditions não têm
    // objeto ainda); quem pode criar grava a autoria em createAttrs (o registo
    // nasce casando com a própria owner rule do criador, quando ela existir).
    server.post('/api' + opts.path, function (schema, request) {
        const g = guard(Mirage, schema, request, opts.guardOpts);
        if (g.response) return g.response;
        if (subject) {
            const ability = abilityFor(schema, g.user);
            if (!ability || !ability.can('create', subject)) return forbidden(Mirage);
        }
        const body = parseBody(request);
        if (opts.validate) {
            const bad = opts.validate(body, schema);
            if (bad) {
                // Os hooks de validação podem devolver `status` (ex.: 403
                // para um campo reservado a um role — roles de contas) — 422 na
                // omissão, que é uma validação de FORMA.
                return send(Mirage, bad.status || 422, { error: 'validation', field: bad.field, message: bad.message });
            }
        }
        const record = schema[collection].create(opts.createAttrs(body, g.user));
        return send(Mirage, 201, { data: enrich(serialize(record.attrs), schema) });
    });

    // EDIÇÃO — com subject, 'update' SOBRE o registo (owner rule decide); o
    // body entra só pelos campos da lista branca `editable`, com a coercão por
    // campo (coerce) à frente da String() por omissão. validateUpdate leva as
    // validações que precisam do registo/sessão (ex.: self-lockout das roles).
    server.put('/api' + opts.path + '/:id', function (schema, request) {
        const g = guard(Mirage, schema, request, opts.guardOpts);
        if (g.response) return g.response;
        const record = recordById(schema, collection, request.params.id);
        if (!record) return send(Mirage, 404, { error: 'not_found' });
        if (subject) {
            const ability = abilityFor(schema, g.user);
            if (!ability || !ability.can('update', caslSubject(subject, record.attrs))) {
                return forbidden(Mirage);
            }
        }
        const body = parseBody(request);
        if (opts.validateUpdate) {
            const bad = opts.validateUpdate(body, record, g.user);
            if (bad) {
                // `status` opcional (403 = campo reservado, ex. roles);
                // 422 na omissão (validação de forma).
                return send(Mirage, bad.status || 422, { error: 'validation', field: bad.field, message: bad.message });
            }
        }
        const patch = {};
        editable.forEach(function (k) {
            if (body[k] === undefined) return;
            const value = coerce[k] ? coerce[k](body[k]) : String(body[k]);
            if (value !== undefined) patch[k] = value;
        });
        record.update(patch);
        // Hook de efeitos colaterais: corre com o record JÁ gravado e
        // o schema à mão — ex.: users.js revoga as sessões do alvo quando a
        // password muda (o registry de sessões é quem faz isso, ver sessions.js).
        if (opts.afterUpdate) opts.afterUpdate(record, g.user, body, schema);
        return send(Mirage, 200, { data: enrich(serialize(record.attrs), schema) });
    });

    // REMOÇÃO — com subject, 'delete' SOBRE o registo; validateDelete leva as
    // auto-protecções (ex.: a própria conta); 204 sem corpo.
    server.del('/api' + opts.path + '/:id', function (schema, request) {
        const g = guard(Mirage, schema, request, opts.guardOpts);
        if (g.response) return g.response;
        const record = recordById(schema, collection, request.params.id);
        if (!record) return send(Mirage, 404, { error: 'not_found' });
        if (subject) {
            const ability = abilityFor(schema, g.user);
            if (!ability || !ability.can('delete', caslSubject(subject, record.attrs))) {
                return forbidden(Mirage);
            }
        }
        if (opts.validateDelete) {
            const bad = opts.validateDelete(record, g.user);
            if (bad) {
                return send(Mirage, bad.status || 422, { error: 'validation', field: bad.field, message: bad.message });
            }
        }
        record.destroy();
        return send(Mirage, 204);
    });
}
