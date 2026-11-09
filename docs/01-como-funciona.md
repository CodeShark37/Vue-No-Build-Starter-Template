# 01 — Como funciona

## Árvore

```
index.html            shell + <script src="env.js"> + vendors (defer) + src/main.js
env.js                configuração por ambiente (apiBase, mock, vueDebug) — ÚNICO
                      ficheiro a mudar no deploy; injecta vue e mirage dinamicamente
vendor/               libs de PRODUÇÃO (clássicas, expõem globals) + VERSIONS.md
vendor-dev/           libs só de desenvolvimento (mirage.min.js, vue.dev.js) — não deploy
dev/                  só carregado com env.mock; apagar em produção
  mock/
    index.js          fábrica do servidor Mirage (modelos + seeds + registo de rotas)
                      + persistência da BD entre reloads (dump em localStorage)
    token.js          codec do fake-JWT 'mrg.<payload>.mock'
    sessions.js       REGISTRY de sessões — a autoridade sobre identidade e ciclo de vida:
                      createSessionPair (login: PAR access/refresh, mesma family),
                      rotateSession (refresh com rotação e detecção de reutilização),
                      revokeSession/revokeFamily (logout e demos), revokeUserSessions
                      (password nova), validateSession (o tribunal de TODOS os pedidos)
    helpers.js        respostas, sessionOf/tokenOf (401, delega no registry), guard (403),
                      paginação server-side e o MOTOR da política (rulesForUser/
                      materializeRules/abilityFor — o CASL do cliente, no mock)
    crud.js           fábrica registerCrud: as 5 rotas de um recurso canónico com a
                      cadeia de política escrita UMA vez — TODOS os recursos com
                      seed passam por ela (posts, books, users), com hooks para
                      validações/auto-protecções (ver routes/users.js)
    routes/           a API mock, um ficheiro por domínio (auth, profile, permissions,
                      users, posts, books)
    seeds/            DADOS: users, posts, books, roleRules (política inicial)
src/
  main.js             raiz de composição: mock -> router -> permissões -> serviços -> store
  app/
    App.vue           <transition> de página + <router-view> + estilos base globais
                      (comuns a todos os layouts; aqui vive o CSS .page-*)
    router.js         factory createRouter(routes) — recebe as rotas de features/
    guards.js         UM guard global que avalia requiresAuth / guest / roles
    services.js       regista this.$http $config $auth $perm $api
    store.js          Vuex no arranque base (módulo demo 'base')
  core/               infra, sem conhecimento de negócio
    config.js         valores derivados (lê window.ENV; root da app, cache, auth)
    session.js        fonte única da sessão (token + user + roles, reactivo)
    ability.js        fonte única das permissões no cliente (CASL) — this.$perm
    http.js           axios (this.$http) + Bearer + 401/refresh single-flight
    loader.js         o único que conhece o vue2-sfc-loader: load() / lazy()
    cache.js          cache de código compilado (memória + IndexedDB)
  ui/                 componentes genéricos, sem lógica de negócio
    layouts/          LayoutDefault (navbar+contentor), LayoutAuth (centrado, sem
                      navbar), AdminLayout (navbar+SIDEBAR de secções admin),
                      ContentLayout (navbar+ABAS da zona content),
                      AppNavbar (excepção documentada: lê $auth)
    UiPanel.vue  UiIconBtn.vue  UiPager.vue  DataTable.vue (tabela genérica das
                 listas: colunas por config, edição inline por meta.editable)
  features/           UMA pasta por funcionalidade
    index.js          ÚNICO sítio de registo (rotas + $api)
    site/             Home, 403, 404 + BaseComponent (o catch-all fica aqui, por último)
    auth/             LoginView (com link para a página inicial), ProfileView
                      (PERFIL /app/profile — o clique no nome no navbar),
                      SessionPanel (sessão/token — vive no Perfil)
                      (sem api.js: sessão é core/session.js; /profile usa $http directo)
    content/          index.js (zona /content: api { posts: makeApi('/posts'),
                      books: makeApi('/books') }), PostsView (rota /content/posts
                      sobre a ui/DataTable; /app/feed é redirect de legado),
                      BooksView, PostForm
    admin/            index.js (zona /admin com AdminLayout+sidebar; '' → users),
                      api.js (com reorderRules), StatsView, UsersView (com resumo
                      de roles), UsersPanel (sobre a DataTable), UserPermissions,
                      PermissionsView, RulesPanel (drag & drop)
```

## Boot, por ordem

1. `env.js` (script clássico) decide QUE vue entra na fila (`vue.min.js` ou `vue.dev.js`) e se `vendor-dev/mirage.min.js` vem para produção — via `document.write` na própria posição, por isso a ordem dos `defer` fica garantida.
2. Vendors `defer` executam pela ordem escrita; o `main.js` (módulo) corre por último.
3. `main.js`: `startMirage(config)` intercepta XHR antes de qualquer pedido → `createRouter(routes)` (rotas de `features/index.js`) → `ability.sync()` (1º fetch de permissões) → `installServices()` → `createStore()` → `load('src/app/App.vue')` → `$mount('#app')`.

## Camadas e doutrinas

- **core/ não conhece nada de negócio** — e nunca importa features. A única seta para baixo é `core/http.js -> app/router.js` (navegação no logout); o `app/router.js` não conhece as features (as rotas entram pelo `main.js`), por isso não há ciclo: `features/api.js -> core/http.js -> app/router.js` é uma linha aberta.
- **app/ é a única que conhece tudo** — composição: router, serviços, store.
- **features/ é o negócio** — cada feature declara a PRÓPRIA zona de rotas com o layout-pai que escolher (`ui/layouts/`) e, se falar com a API, um módulo de API: `makeApi('/<path>')` para CRUD canónico (posts, books), `api.js` à mão só para domínios não canónicos (admin) — política e critérios em `04-falar-com-a-api.md`.
- **ui/ é genérico** — regra de colocação: componente usado por **1 feature** vive dentro dela; usado por **2 ou mais** sobe para `ui/`. (AppNavbar e AdminLayout são excepções documentadas: são o cromo dos layouts e o AdminLayout aponta para as rotas admin — navegação, nunca segurança.)
- **A zona admin tem UM cromo próprio** — o `AdminLayout` é o pai de todas as rotas `/admin/*`: navbar + sidebar com as três secções (Visão geral, Utilizadores, Permissões) + contentor largo. O menu de topo fica com um único link "Admin"; `/admin` nu redireciona para `/admin/users` (a secção comum a admin e sub-admin).
- **Navbar: o link é navegação, não política** — `Recursos` (posts e books) é SEMPRE visível (até a guest); o que a política governa é o RECURSO: a tabela mostra/esconde por `$perm.can(...)` e a API responde 403. O link Admin segue a ABILIDADE (`$perm.can('read', 'User')` — um sub-admin entra pela política, não por role), e o NOME do utilizador é o link para o Perfil (`/app/profile`).
- **JSDoc nos módulos JS** — core/, app/, mock e api.js estão documentados com JSDoc (typedefs `User`, `RuleSpec`, `Paginated`, `ApiModule`, `CrudOptions`…), e um `jsconfig.json` dá a um editor (VSCode) IntelliSense e "Go to Definition" sem build nem TypeScript. `checkJs` fica desligado: a documentação enriquece, não pune.
- **No código fica só a melhor forma** — as formas alternativas/didácticas vivem nos docs com explicação detalhada (ex.: o api.js à mão, que saiu do código, está em `04-falar-com-a-api.md`). Um exemplo didáctico em código de produção é custo permanente de manutenção dupla.
- **Nos .vue não se importam `.js` locais** — só outros `.vue` e `vue`, `vuex`, `vue-router`, `axios`. Importar `.js` local compilaria uma **2ª cópia** do módulo (singletons partidos). O acesso é por `this.$http / $config / $auth / $perm / $api / $store`.
- **Caminhos de `load()`/`lazy()` são relativos à raiz** da app (`config.root`), nunca à rota actual — por isso URLs profundos e sub-caminhos funcionam.
- **A transição de página tem dois níveis** — `<transition name="page" mode="out-in">` envolve o `<router-view>` da raiz (troca de LAYOUT: login ⇄ app) e o de cada layout (troca de VISTA dentro do cromo). O CSS `.page-*` é global, no App.vue; `prefers-reduced-motion` desliga-a; `scrollBehavior` do router repõe o topo enquanto a tela está em fade (back/forward mantêm a posição guardada). Exigência do Vue 2: toda a vista roteada tem raiz única.
- **Dentro de `<svg>`** não se usam `<template v-if>` nem comentários HTML: o compilador do loader devolve um **render vazio** (silencioso). `v-if` directo em cada elemento (ver `ui/UiIconBtn.vue`).
- **Três regras do compilador do sfc-loader nas tabelas** (documentadas no cabeçalho de `ui/DataTable.vue`): (1) comentário HTML entre `v-if` e `v-else` quebra a adjacência — o componente inteiro deixa de renderizar; (2) `<template v-else>` dentro do fallback de um `<slot>` compila para um array que o patch transforma em texto `"undefined"`; (3) o `_t` do loader **não chega a invocar o fallback** de um `<slot>` — devolve vnode vazio. Por isso a DataTable não tem comentários no template e decide o render da célula por `$scopedSlots` (`hasCellSlot`), em vez de confiar no fallback.

## Desempenho em dispositivos fracos

- **Cache de compilação** (`core/cache.js`) — **LIGADA por omissão** (`config.compiledCache = true`) com o loader vendored 0.9.5. Ao actualizar o loader, revalidar o contrato da cache antes de manter esta opção activa. O `config.version` (agora `'11'`) é a chave da cache: bump manual ao mover/renomear um `.vue` sem mudar o conteúdo (o código compilado antigo tem os URLs absolutos dos filhos embutidos).
- **Cache de módulos partilhada**: cada `.vue` é pedido e compilado 1× por página, mesmo importado por várias rotas.
- **Rotas lazy**: uma vista só se pede/compila quando visitada.
- **`defer` em tudo**: o shell HTML pinta imediatamente; devtools/strict/logging só em `localhost` (`config.debug`).

Não resolvido por desenho (precisa de build): `vue2-sfc-loader.js` ~1.6 MB (~430 KB gzip) continua a ser *parsed* em cada carga — é o preço de não haver build step.
