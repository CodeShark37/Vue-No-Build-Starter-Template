// Rotas de POSTS do mock — o recurso de demonstração do template. As 5 rotas
// passam pela FÁBRICA registerCrud (dev/mock/crud.js), tal como books e users —
// a cadeia de política (guard -> nível TIPO -> nível INSTÂNCIA -> 403 -> 404 ->
// 422) está no cabeçalho da fábrica e aplica-se igual a todos os recursos com
// seed. enrich() junta authorRoles (os roles do autor, lidos da colecção users)
// a CADA resposta — o Feed mostra o role real do autor. O que distingue o posts
// é só o DOMÍNIO:
//
//   GET    /api/posts     -> lista paginada (?page&per_page&sort&order — ver
//                            paginate()); 403 sem NENHUMA regra 'read' sobre Post.
//                            Regra 'read' COM conditions (ABAC): filtra a lista —
//                            só os posts que casam chegam à paginação (a meta
//                            conta só o visível; o cliente re-pagina sobre o real).
//   GET    /api/posts/:id -> detalhe; 404 desconhecido; 403 sem 'read' SOBRE o post
//                            (LER também é permissão).
//   POST   /api/posts     -> cria com author/authorId = sessão; 403 sem 'create'; 422 sem título.
//   PUT    /api/posts/:id -> 403 se a política não der 'update' SOBRE O POST (a owner
//                            rule autoriza o autor; o admin entra pelo 'manage').
//   DELETE /api/posts/:id -> idem com 'delete'.
//
// Assim, no painel /admin/permissions, apagar a regra 'read Post' do role user
// tranca a leitura DE VERDADE: o próximo GET desse utilizador responde 403 (e a
// UI esconde a tabela quando a Ability dele re-sincroniza — UX aqui, segurança lá).
// A política é lida da BD a cada pedido (rulesForUser em helpers.js): a autoria
// NÃO está hardcoded — é a owner rule (conditions authorId) do seed que a
// exprime, POR ID (o id é único e imutável; o username é renomeável no
// /api/profile).
import { registerCrud } from '../crud.js';
import { userById } from '../helpers.js';

/**
 * Registra as 5 rotas de posts VIA A FÁBRICA registerCrud — a política
 * é aplicada por CASL a CADA pedido pela cadeia única da fábrica. O enrich
 * junta authorRoles em tempo de serviço: roles mudam em runtime no
 * painel /admin/users, por isso NUNCA se congelam no record do post — a
 * junção corre em cada resposta, sobre o estado actual da BD.
 * @param {Object} server servidor Mirage em configuração (routes())
 * @param {{Mirage: Object, ttl: number}} ctx contexto partilhado dos handlers
 * @returns {void}
 */
export function register(server, ctx) {
    registerCrud(server, ctx, {
        model: 'post',
        path: '/posts',
        subject: 'Post',
        allowedSorts: ['id', 'createdAt', 'title', 'author'],
        defaultSort: 'id',
        defaultPerPage: 6,
        // Lista branca do PUT: título e corpo. A autoria (author/authorId) nunca
        // é editável — é política, não conteúdo. Publicada na meta da
        // listagem (meta.editable) — a UI desenha os inputs de edição daqui.
        editable: ['title', 'body'],
        validate: function (body) {
            if (!body.title) return { field: 'title' };
            return null;
        },
        createAttrs: function (body, user) {
            return {
                title: String(body.title),
                body: body.body !== undefined ? String(body.body) : '',
                author: user.username, // o NOME, para mostrar na tabela
                authorId: user.id,     // o ID, para a POLÍTICA (owner rule por authorId)
                createdAt: new Date().toISOString(),
            };
        },
        // authorRoles: os roles ACTUAIS do autor, juntados pelo userById
        // (String(id): o authorId chega às vezes como número, às vezes como
        // texto — origem: seed, POST, token). Autor eliminado => [] (o post
        // sobrevive sem badges; nunca 500 por um join). É LEITURA: o POST/PUT
        // continuam a gravar só author/authorId — o role não é editável aqui,
        // quem muda roles é o painel de users (e a política segue-o sozinha).
        enrich: function (attrs, schema) {
            const user = userById(schema, attrs.authorId);
            return Object.assign({}, attrs, {
                authorRoles: user && user.roles ? user.roles : [],
            });
        },
    });
}
