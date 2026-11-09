// Páginas que não pertencem a um domínio de dados: Home (demo de componente +
// Vuex), 403 e 404. A zona pública não declara exigências (o guard só actua com
// meta); "guest" no login (features/auth) faz o inverso.
//
// O catch-all '*' é exportado À PARTE (fallback): features/index.js concatena-o
// SEMPRE em último — é a única regra de ordem da tabela de rotas.
import { lazy } from '../../core/loader.js';

export default {
    name: 'site',
    routes: [
        {
            path: '/',
            component: lazy('src/ui/layouts/LayoutDefault.vue'),
            children: [
                {
                    path: '',
                    name: 'Home',
                    component: lazy('src/features/site/HomeView.vue'),
                },
                {
                    // Chega aqui por redirect do guard (roles): sessão válida,
                    // permissão insuficiente. Sessão mantida, sem logout.
                    path: '403',
                    name: 'Forbidden',
                    component: lazy('src/features/site/ForbiddenView.vue'),
                },
            ],
        },
    ],
    // Catch-all: tem de ser a ÚLTIMA rota (features/index.js garante a ordem).
    // Renderiza também dentro do layout padrão — senão o 404 apareceria sem navbar.
    fallback: {
        path: '*',
        component: lazy('src/ui/layouts/LayoutDefault.vue'),
        children: [
            {
                path: '',
                name: 'NotFound',
                component: lazy('src/features/site/NotFoundView.vue'),
            },
        ],
    },
};
