// Contrato de feature: { name, routes, api? }.
//
// A feature auth NÃO tem api.js: login/refresh/logout/me são ciclo de SESSÃO e
// vivem em core/session.js (com o interceptor de core/http.js). Se aqui houvesse
// um $api.auth, o core teria de importar features — violando a doutrina "core
// não conhece nada". As vistas de sessão usam this.$auth (e o $http directo nas
// chamadas de ciclo de vida: POST /login, GET /me, GET/PUT /profile — igual ao
// SessionPanel com GET /me).
//
// DUAS zonas: o login (LayoutAuth, centrado, SEM navbar; meta.guest no PAI:
// com sessão, o guard nem deixa chegar aqui) e o PERFIL (/app/profile), a rota
// a que o NOME do utilizador no navbar aponta. O perfil partilha o cromo
// LayoutDefault (como books faz com posts): duas rotas-pai '/app' coexistem —
// cada feature declara o seu par rota-pai/filhos e os caminhos filhos completos
// nunca colidem. meta.requiresAuth no PAI: sem sessão, o guard manda ao login.
import { lazy } from '../../core/loader.js';

export default {
    name: 'auth',
    routes: [
        {
            path: '/login',
            component: lazy('src/ui/layouts/LayoutAuth.vue'),
            meta: { guest: true },
            children: [
                {
                    path: '',
                    name: 'Login',
                    component: lazy('src/features/auth/LoginView.vue'),
                },
            ],
        },
        {
            // Zona do perfil: sessão (token, expiração, demos 401) +
            // gestão da própria conta (nome, username, password -> PUT /profile).
            path: '/app',
            component: lazy('src/ui/layouts/LayoutDefault.vue'),
            meta: { requiresAuth: true },
            children: [
                {
                    path: 'profile',
                    name: 'Profile',
                    component: lazy('src/features/auth/ProfileView.vue'),
                },
            ],
        },
    ],
};
