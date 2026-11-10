// Política inicial por role. Os placeholders, como '${user.id}', são
// materializados pelo mock antes da resposta; roles desconhecidos ficam sem
// regras (fail-closed). Depois do boot, a verdade vive na BD do mock.
/**
 * Política INICIAL por role (o ESTADO INICIAL apenas): o que o seed escreve na
 * BD (model 'rule', com position pela ordem do ficheiro). Depois do boot a
 * verdade vive na BD — o painel /admin/permissions (CRUD + drag & drop) edita-a
 * em runtime e os handlers leem-na a cada pedido, nunca esta constante.
 * @type {Object.<string, Array<{action: string, subject: string, conditions?: Object, inverted?: boolean}>>}
 */
export const roleRules = {
    admin: [
        // manage = TODAS as acções (read/create/update/delete/...) sobre todos os posts.
        { action: 'manage', subject: 'Post' },
        // 2.º recurso (demo da fábrica registerCrud): catálogo comum, o admin gere.
        { action: 'manage', subject: 'Book' },
        // 'User' também é RECURSO da política — o admin gere contas por
        // REGRAS (podem viver em /admin/permissions), não por um if de role no
        // código. O campo `roles` de uma conta continua reservado ao ROLE admin
        // (defesa de escalada no users.js — por cima da política).
        { action: 'manage', subject: 'User' },
    ],
    user: [
        { action: 'read', subject: 'Post' },
        { action: 'create', subject: 'Post' },
        // Owner rules por ID: update/delete só nos PRÓPRIOS posts — a condição
        // avalia o atributo real de cada objeto (post.authorId === id da sessão).
        { action: 'update', subject: 'Post', conditions: { authorId: '${user.id}' } },
        { action: 'delete', subject: 'Post', conditions: { authorId: '${user.id}' } },
        // Livros: catálogo de leitura comum (servido pela fábrica registerCrud).
        { action: 'read', subject: 'Book' },
    ],
    // Editor: a comissão editorial — edita posts de TODOS os autores
    // (update SEM conditions vale para qualquer instância) mas NÃO apaga: é o
    // contraste que mostra que 'update sem conditions' não é owner rule. Um
    // role novo aqui aparece no Feed sem tocar na UI — o badge da tabela segue
    // o role real do autor (authorRoles, juntado em routes/posts.js).
    editor: [
        { action: 'read', subject: 'Post' },
        { action: 'create', subject: 'Post' },
        { action: 'update', subject: 'Post' },
        { action: 'read', subject: 'Book' },
    ],
    // Viewer: só leitura — nenhum botão, nenhum formulário de criação;
    // a API nega por si (PUT/DELETE -> 403) se a UI for contornada.
    viewer: [
        { action: 'read', subject: 'Post' },
        { action: 'read', subject: 'Book' },
    ],
    // Sub-admin: um "admin com/sem alguma permissão" feito SÓ de dados —
    // Lê e edita utilizadores (não cria, não elimina) mas o campo `roles` é
    // reservado ao admin (defesa de escalada no users.js). Lê posts/livros para
    // navegar. A zona /admin abre-lhe pela meta.perm (guard avalia a Ability do
    // SERVIDOR), não por role — adicionar um role destas é DADOS, não código.
    subadmin: [
        { action: 'read', subject: 'User' },
        { action: 'update', subject: 'User' },
        { action: 'read', subject: 'Post' },
        { action: 'read', subject: 'Book' },
    ],
};
