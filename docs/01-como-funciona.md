# 01 — Como funciona
> **Navegação:** [README português](../README.md) · [README inglês](../README.en.md) · [Anterior](00-arranque.md) · [Seguinte](02-nova-pagina.md) · [English](01-como-funciona.en.md)

## Árvore

```text
├── index.html
├── env.js                Configuração de ambiente; único ficheiro a mudar no deploy
├── vendor/               Bibliotecas de produção
├── vendor-dev/           Bibliotecas apenas de desenvolvimento
├── dev/
│   └── mock/             Mirage, tokens, sessões, CRUD, rotas e seeds
├── src/
│   ├── main.js           Composição: mock -> router -> permissões -> serviços
│   ├── app/              App.vue, router.js, guards.js, services.js e store.js
│   ├── core/             Configuração, sessão, permissões, HTTP, loader e cache
│   ├── ui/               Layouts e componentes genéricos
│   └── features/         Uma pasta por funcionalidade; index.js é o registo único
│       ├── site/
│       ├── auth/
│       ├── content/      Posts e books
│       └── admin/
├── docs/                 Documentação, um ficheiro por assunto
└── scripts/              Matriz T01–T12 e verificação de sintaxe
```

## Boot, por ordem

1. `theme-boot.js` (script clássico e síncrono no `<head>`) aplica o tema guardado ou o
   tema do sistema antes da primeira pintura.
2. `env.js` decide qual build do Vue carregar (`vue.min.js` ou `vue.dev.js`) e se deve
   incluir o MirageJS, usando `document.write` na sua própria posição.
3. Os vendors `defer` descarregam em paralelo e executam pela ordem escrita. O módulo
   `main.js` corre depois deles e conclui o arranque nesta sequência:

   ```text
   main.js
       │
       ├── theme.init()
       ├── startMirage(config)
       │   └── Intercepta XHR antes do primeiro pedido
       ├── createRouter(routes)
       │   └── Rotas de features/index.js
       ├── ability.sync()
       │   └── Primeiro carregamento das permissões
       ├── installServices()
       ├── createStore()
       ├── load('src/app/App.vue')
       └── $mount('#app')
   ```

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
