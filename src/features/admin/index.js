// Contrato de feature: { name, routes, api? }. A zona admin (convenção docs/09):
// meta NO PAI só o que a zona inteira exige (sessão); as exigências ESPECÍFICAS
// vivem em cada filho — é o que permite a zona MISTA:
//
//   /admin/users        -> meta.perm { read User }  — abre por POLÍTICA (sub-admin
//                          entra; admin entra; user comum não). A API re-verifica
//                          com a MESMA política (403) — subject 'User' na fábrica.
//   /admin/stats        -> meta.roles ['admin']       — contagens do sistema, role admin.
//   /admin/permissions  -> meta.roles ['admin']       — a política edita-se a si mesma:
//                          só admin (T07: a API nega com 403 a quem não for).
//   /admin (nu)         -> redirect 'users' — a secção comum a admin e sub-admin;
//                          nunca 404 nem um redirect que a 403 a um sub-admin.
//
// A API re-verifica tudo (403) — esconder links é só UX.
//
// O PAI usa o AdminLayout (navbar + SIDEBAR de secções + contentor largo)
// — toda a navegação interna da área vive no painel lateral, e o menu de topo
// fica com um único link "Admin".
import { lazy } from '../../core/loader.js';
import * as api from './api.js';

export default {
    name: 'admin',
    api: api,
    routes: [
        {
            path: '/admin',
            component: lazy('src/ui/layouts/AdminLayout.vue'),
            meta: { requiresAuth: true },
            children: [
                {
                    // /admin nu -> UTILIZADORES: a secção comum a admin e
                    // sub-admin (a 403 que um deles apanhasse num redirect
                    // para stats seria uma experiência quebrada).
                    path: '',
                    redirect: 'users',
                },
                {
                    // CRUD de utilizadores (UsersPanel): abre por PERMISSÃO —
                    // meta.perm avalia a Ability CASL do servidor;
                    // a API (/api/admin/users, subject 'User') re-verifica (403).
                    path: 'users',
                    name: 'AdminUsers',
                    meta: { perm: { action: 'read', subject: 'User' } },
                    component: lazy('src/features/admin/UsersView.vue'),
                },
                {
                    path: 'stats',
                    name: 'AdminStats',
                    meta: { roles: ['admin'] },
                    component: lazy('src/features/admin/StatsView.vue'),
                },
                {
                    // CRUD da POLÍTICA de permissões (RulesPanel): role admin —
                    // a política edita-se a si mesma (T07: API nega com 403).
                    path: 'permissions',
                    name: 'AdminPermissions',
                    meta: { roles: ['admin'] },
                    component: lazy('src/features/admin/PermissionsView.vue'),
                },
            ],
        },
    ],
};
