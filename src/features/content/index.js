// Contrato de feature: { name, routes, api? } — a ZONA CONTENT: posts e books
// num único sítio, como o Admin agrupa as suas secções (a convenção está em
// docs/09-convencoes-de-rotas.md).
//
// O que a zona declara TUDO aqui:
//   - path de topo '/content' + layout DA ZONA (ui/layouts/ContentLayout.vue,
//     navbar + abas) + meta no PAI (requiresAuth) — os filhos herdam pelo
//     to.matched do guard;
//   - filho vazio '' -> redirect 'posts': /content nunca dá 404;
//   - filhos 'posts' e 'books' — recursos no PLURAL (convenção docs/09);
//   - redirects de LEGADO: /app/feed e /app/books continuam a funcionar
//     (bookmarks) — declarados aqui, na zona que os absorveu;
//     /app/data -> /app/feed -> cai no redirect /content/posts.
//
// API namespace segue a feature (convenção docs/09 §4.8): this.$api.content.posts
// e this.$api.content.books — makeApi() dá os 5 verbos canónicos de cada domínio
// (docs/04). UMA pasta, DOIS recursos: é a demonstração de que o contrato de
// feature escala de 1 para N recursos sem inventar nada novo.
import { lazy } from '../../core/loader.js';
import { makeApi } from '../../core/http.js';

export default {
    name: 'content',
    api: {
        posts: makeApi('/posts'),
        books: makeApi('/books'),
    },
    routes: [
        {
            // ZONA content: pai único, layout próprio, meta herdada pelos filhos.
            path: '/content',
            component: lazy('src/ui/layouts/ContentLayout.vue'),
            meta: { requiresAuth: true },
            children: [
                {
                    // /content nu -> Posts (a secção principal da zona).
                    path: '',
                    redirect: 'posts',
                },
                {
                    path: 'posts',
                    name: 'ContentPosts',
                    component: lazy('src/features/content/PostsView.vue'),
                },
                {
                    path: 'books',
                    name: 'ContentBooks',
                    component: lazy('src/features/content/BooksView.vue'),
                },
            ],
        },
        {
            // LEGADO: os URLs antigos da zona /app redirecionam
            // para a zona nova — zero 404 em bookmarks. O pai repete o cromo
            // LayoutDefault (nunca renderiza: os filhos são redirects puros) e
            // mantém requiresAuth — o guard avalia o destino ANTES do redirect
            // completar, e os destinos exigem sessão na mesma.
            path: '/app',
            component: lazy('src/ui/layouts/LayoutDefault.vue'),
            meta: { requiresAuth: true },
            children: [
                {
                    path: 'feed',
                    redirect: '/content/posts',
                },
                {
                    path: 'books',
                    redirect: '/content/books',
                },
                {
                    // A cadeia de redirects termina em /content/posts.
                    path: 'data',
                    redirect: '/app/feed',
                },
            ],
        },
    ],
};
