// Seed de utilizadores do mock — DADOS puros, como as linhas de uma tabela de
// utilizadores num backend real. Para acrescentar uma conta basta uma linha no
// demoAccounts (ou, em runtime, o CRUD do painel /admin/users) e as permissões
// chegam automaticamente pelo role (seeds/permissions.js). Um role por conta: o
// Feed exercita todos os caminhos da política.
// A ORDEM IMPORTA: os users são a 1.ª colecção semeada, por isso os ids ficam
// 1..N por esta ordem — é o que seeds/posts.js usa para distribuir a autoria
// (authorId = índice + 1). O SUB-ADMIN entra NO FIM para não mexer nesses ids:
// um gestor de contas que NÃO é admin — entra na zona admin pela PERMISSÃO
// 'read User' (meta.perm no guard, não por role), vê e edita utilizadores, mas
// não cria, não elimina e não altera roles nem contas admin (users.js).
//
// PASSWORDS: o demoAccounts abaixo é o SCRIPT DE PROVISIONAMENTO — a única
// referência à password em claro, do mesmo tipo que um .env de um backend real.
// O que entra na BD do mock é seedUsers (em baixo): rows com `passwordHash`
// (PBKDF2-HMAC-SHA256, formato PHC — ver dev/mock/password.js). Nenhum record
// no dump do localStorage guarda password em claro, e nenhuma resposta da API
// devolve o hash (publicUser() em dev/mock/helpers.js devolve só id/username/
// name/roles).
//
// O hash é DETERMINÍSTICO (sal derivado do username — dev/mock/password.js):
// é o que mantém a ASSINATURA dos seeds estável entre boots (a chave do dump
// no localStorage é FNV-1a sobre este JSON — mirage.js/index.js; com sal
// aleatório a assinatura mudaria a cada boot e o dump nunca re-hidrataria).
import { hashPassword } from '../password.js';

/**
 * Contas de demonstração (fonte, EM CLARO SÓ AQUI — script de provisionamento;
 * é também o que o console do boot imprime como dica de login). A ORDEM define
 * os ids (1..N — 1.ª colecção semeada).
 * @type {Array<{username: string, password: string, name: string, roles: string[]}>}
 */
export const demoAccounts = [
    { username: 'admin', password: 'admin123', name: 'Josue Andre Admin', roles: ['admin'] },
    { username: 'user', password: 'user123', name: 'Bob User', roles: ['user'] },
    { username: 'editor', password: 'editor123', name: 'Carla Editora', roles: ['editor'] },
    { username: 'viewer', password: 'viewer123', name: 'Diogo Visitante', roles: ['viewer'] },
    { username: 'subadmin', password: 'subadmin123', name: 'Sofia Sub-Admin', roles: ['subadmin'] },
];

/**
 * Rows que entram na BD do mock (server.create('user', row)): MESMA ordem de
 * demoAccounts (ids 1..N) com a password convertida em `passwordHash`. Sem
 * campo `password` — o que dorme na BD é só o hash PHC.
 * @type {Array<{username: string, name: string, roles: string[], passwordHash: string}>}
 */
export const seedUsers = demoAccounts.map(function (u) {
    return {
        username: u.username,
        name: u.name,
        roles: u.roles,
        passwordHash: hashPassword(u.username, u.password),
    };
});
