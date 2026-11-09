// Rotas de BOOKS — o 2.º recurso do mock e a DEMO do caminho canónico: um
// domínio novo NÃO copia o posts.js. Declara dados (seeds/books.js), política
// (subject 'Book' em seeds/permissions.js: admin gere, user lê) e registra as
// 5 rotas com a fábrica registerCrud (dev/mock/crud.js) — a política de
// permissões é aplicada exactamente como nos posts, escrita uma vez.
// Ver docs/03 e docs/06.
import { registerCrud } from '../crud.js';

/**
 * Registra as 5 rotas de books VIA A FÁBRICA registerCrud — a demo do caminho
 * rápido (docs/03): dados no seed, política no subject 'Book', zero handlers.
 * @param {Object} server servidor Mirage em configuração (routes())
 * @param {{Mirage: Object, ttl: number}} ctx contexto partilhado dos handlers
 * @returns {void}
 */
export function register(server, ctx) {
    registerCrud(server, ctx, {
        model: 'book',
        path: '/books',
        subject: 'Book',
        allowedSorts: ['id', 'title', 'author', 'pages'],
        // pages compara como NÚMERO (não por texto: '1008' viria antes de
        // '272' por ordem alfabética). title/author continuam por localeCompare.
        numericSorts: ['pages'],
        defaultSort: 'id',
        defaultPerPage: 6,
        // Lista branca do PUT: título e autor do LIVRO (metadados). year fica
        // fora (é histórico), pages também (a edição física não muda), e o
        // criador (creatorId) nunca é editável.
        // Esta lista viaja na meta da listagem (meta.editable) — a UI
        // desenha o formulário de edição a partir daqui; mudá-la reflecte-se
        // nas vistas sem tocar em nenhum .vue.
        editable: ['title', 'author'],
        validate: function (body) {
            if (!body.title) return { field: 'title' };
            return null;
        },
        createAttrs: function (body, user) {
            return {
                title: String(body.title),
                author: body.author !== undefined ? String(body.author) : '—',
                year: body.year !== undefined ? String(body.year) : '',
                // Número de verdade (ver seeds/books.js): Number() com fallback
                // a 0 para o que não converta — o Intl da DataTable exige typeof number.
                pages: Number(body.pages) || 0,
                // O mesmo princípio do authorId dos posts: quem criou, por ID.
                creatorId: user.id,
            };
        },
    });
}
