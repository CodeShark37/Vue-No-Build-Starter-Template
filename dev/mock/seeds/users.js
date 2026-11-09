// Seed de utilizadores do mock — DADOS puros, como as linhas de uma tabela de
// utilizadores num backend real. O mirage.js apenas cria um record por entrada
// (server.create('user', u)); para acrescentar um utilizador basta uma linha
// aqui (ou, em runtime, o CRUD do painel /admin/users) e as permissões chegam
// automaticamente pelo role (seeds/permissions.js). Um role por conta: o Feed
// exercita todos os caminhos da política.
// A ORDEM IMPORTA: os users são a 1.ª colecção semeada, por isso os ids ficam
// 1..N por esta ordem — é o que seeds/posts.js usa para distribuir a autoria
// (authorId = índice + 1). O SUB-ADMIN entra NO FIM para não mexer nesses ids:
// um gestor de contas que NÃO é admin — entra na zona admin pela PERMISSÃO
// 'read User' (meta.perm no guard, não por role), vê e edita utilizadores, mas
// não cria, não elimina e não altera roles nem contas admin (users.js).
//
// A password em claro é aceitável SÓ porque isto é um mock de desenvolvimento;
// nenhuma resposta da API a devolve (publicUser() em dev/mock/helpers.js nunca
// a inclui).
/**
 * Contas de demonstração do mock (username/password em claro só por ser mock de
 * desenvolvimento — nenhuma resposta da API devolve a password). Fonte da
 * tabela no Feed (authorRoles) e da distribuição round-robin da autoria em
 * seeds/posts.js; a ORDEM define os ids (1..N — 1.ª colecção semeada).
 * @type {Array<{username: string, password: string, name: string, roles: string[]}>}
 */
export const seedUsers = [
    { username: 'admin', password: 'admin123', name: 'Josue Andre Admin', roles: ['admin'] },
    { username: 'user', password: 'user123', name: 'Bob User', roles: ['user'] },
    { username: 'editor', password: 'editor123', name: 'Carla Editora', roles: ['editor'] },
    { username: 'viewer', password: 'viewer123', name: 'Diogo Visitante', roles: ['viewer'] },
    { username: 'subadmin', password: 'subadmin123', name: 'Sofia Sub-Admin', roles: ['subadmin'] },
];
