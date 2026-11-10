// Seed determinístico de 15 posts, distribuídos em round-robin pelos utilizadores
// do seed. A data fixa mantém a assinatura de persistência estável.
import { seedUsers } from './users.js';
/**
 * Gera os posts de demonstração com autoria round-robin e data determinística.
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
    // A data fixa mantém a ordenação previsível entre reloads.
    const base = new Date('2026-01-01T10:00:00Z').getTime();
    return titles.map(function (title, i) {
        // authorId é usado pelas owner rules; os roles são associados em runtime
        // para refletir alterações feitas no painel de utilizadores.
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
