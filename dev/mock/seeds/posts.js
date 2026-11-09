// Seed de posts do mock — DADOS de exemplo, como uma tabela de posts num backend
// real. O mirage.js chama seedPosts() no boot e cria um record por entrada.
//
// São 15 posts a propósito: 3 páginas de 6 na paginação do GET /api/posts
// (?per_page=6), com AUTORES EM ROUND-ROBIN por TODOS os users do seed — cada
// role do seed aparece no Feed, e a regra owner continua exercitada: o 'user'
// só gere os próprios posts, o 'admin' gere todos, o 'editor' edita os de
// todos e o 'viewer' só lê.
//
// DETERMINÍSTICO por desenho: nada aqui lê o relógio (a data de criação é
// calculada a partir de uma base FIXA). A persistência da BD do mock
// (dev/mock/index.js) assina os seeds — seeds estáveis => assinatura estável =>
// o dump de uma sessão anterior é re-hidratado; se um seed mudar, a assinatura
// muda e a BD volta ao novo seed (nunca um dump stale a esconder a mudança).
import { seedUsers } from './users.js';
/**
 * Gera os posts de demonstração (15 — 3 páginas de 6) com AUTORIA round-robin
 * por TODOS os seedUsers. DETERMINÍSTICO por desenho (data-base fixa, nada lê o
 * relógio): a persistência da BD assina os seeds e só re-hidrata dumps da
 * MESMA assinatura (ver dev/mock/index.js).
 * @returns {Array<{title: string, body: string, author: string, authorId: string, createdAt: string}>}
 */
export function seedPosts() {
    const titles = [
        'Bem-vindo ao MirageJS',
        'Como funciona o token',
        'O interceptor do axios',
        'Latência simulada',
        'Paginação no servidor mock',
        'CRUD completo de posts',
        'Erros úteis: 401, 403, 404 e 422',
        'Guardar o token em localStorage',
        'Rotas protegidas e meta.requiresAuth',
        'O guard do vue-router',
        'Cache de compilação dos .vue',
        'IndexedDB em dispositivos fracos',
        'Módulos ES nativos sem build',
        'Vendor scripts e o atributo defer',
        'Para que serve o passthrough',
    ];
    // Base fixa: os desfasos de 45 min mantêm-se — o mais novo tem o id maior,
    // por isso a ordenação por createdAt e por id coincide.
    const base = new Date('2026-01-01T10:00:00Z').getTime();
    return titles.map(function (title, i) {
        // Autor round-robin por TODOS os users do seed. O USERNAME serve à
        // tabela (author, para mostrar) e o ID serve à POLÍTICA (authorId — as
        // owner rules fazem conditions { authorId: '${user.id}' }); o ROLE não
        // é guardado aqui: chega em tempo de serviço (authorRoles, juntado em
        // routes/posts.js pelo userById), porque roles mudam em runtime no
        // painel /admin/users e um role congelado no post mentiria depois.
        // O id assume só uma coisa: users são a 1.ª colecção semeada e os ids
        // ficam 1..N pela ordem de seeds/users.js (server.create sem id).
        const u = i % seedUsers.length;
        return {
            title: title,
            body: 'Conteúdo de exemplo do post ' + (i + 1) + ' de ' + titles.length + ' — servido pela API mock.',
            author: seedUsers[u].username,
            authorId: String(u + 1),
            createdAt: new Date(base - (titles.length - i) * 45 * 60 * 1000).toISOString(),
        };
    });
}
