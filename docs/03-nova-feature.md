# 03 — Nova feature
> **Navegação:** [README português](../README.md) · [README english](../README.en.md) · [Anterior](02-nova-pagina.md) · [Seguinte](04-falar-com-a-api.md) · [English](03-nova-feature.en.md)

Uma feature é UMA pasta com um contrato pequeno:

```js
export default {
    name: 'posts',                                       // namespace do $api
    api: makeApi('/posts'),                              // só para features com dados
    routes: [ /* zona(s) completa(s), rota-pai incluída */ ],
};
```

> **Política do template: no código fica só a MELHOR forma.** Para um domínio
> CRUD canónico, `api: makeApi('/<path>')` é a melhor forma (uma linha, zero funções)
> e é o que a zona content usa para posts e books. A alternativa — funções finas à mão num
> `api.js` — não existe no código como exemplo; está documentada em [`04-falar-com-a-api.md`](04-falar-com-a-api.md)
> e só se escreve quando o domínio REALMENTE não é canónico (o `features/admin/api.js`
> é o exemplo vivo, porque `/admin` tem stats, `/permissions/:id` e `/rules/order`).

## Passos (o exemplo completo é `features/content/` — posts e books numa zona)

1. **Pasta** `src/features/<nome>/` com:
   - `index.js` — o contrato acima (com `api: makeApi('/<path>')` se o domínio for CRUD canónico);
   - `api.js` (só para domínios não canónicos — ver [`04-falar-com-a-api.md`](04-falar-com-a-api.md)) — funções finas sobre o `core/http.js`:

     ```js
     import http from '../../core/http.js';
     export function reorderRules(ids) { return http.put('/rules/order', { ids: ids }); }
     ```

   - as vistas/painéis da feature (tabelas: usar a genérica `ui/DataTable.vue`).
2. **Zona de rotas** no `index.js` da feature — a feature escolhe o seu LAYOUT como rota-pai:

```js
import { lazy } from '../../core/loader.js';
import { makeApi } from '../../core/http.js';

export default {
    name: 'content',
    api: { posts: makeApi('/posts'), books: makeApi('/books') },
    routes: [
        {
            path: '/content',
            component: lazy('src/ui/layouts/ContentLayout.vue'), // o layout é a navegação DA zona
            meta: { requiresAuth: true },                        // meta no PAI cobre os filhos
            children: [
                { path: 'posts', name: 'ContentPosts', component: lazy('src/features/content/PostsView.vue') },
            ],
        },
    ],
};
```

3. **Registar** em `src/features/index.js` (o ÚNICO ficheiro a tocar):

```js
import content from './content/index.js';
const features = [site, auth, content, admin];
```

É tudo: as rotas chegam ao router pelo `main.js`, e `this.$api.<name>` nasce daqui — não existe registo de `$api` fora deste ficheiro.

## O caminho rápido (2.º recurso de dados em diante)

Não há "caminho didáctico" vs. "caminho rápido" no código — posts e books seguem o MESMO: `registerCrud` no mock, `makeApi` no cliente, `ui/DataTable.vue` na vista. Para UM recurso novo basta (o exemplo completo é `features/content/` — o livro entrou na mesma zona):

1. **Mock** — em vez de copiar a cadeia de política em N ficheiros (TODOS os recursos com seed passam pela fábrica: posts, books e users), regista as 5 rotas com a fábrica `registerCrud` (`dev/mock/crud.js`), que aplica a MESMA cadeia (guard → 404 da procura → política por tipo/instância → 403 → validação 422 → paginação; ordem por operação, ver docs/08):

   ```js
   // dev/mock/routes/books.js — EXEMPLO SIMPLIFICADO inspirado no ficheiro real
   // (o real inclui 'pages' em allowedSorts, numericSorts: ['pages'] e a coerção
   // Number(body.pages) — ver dev/mock/routes/books.js)
   import { registerCrud } from '../crud.js';
   export function register(server, ctx) {
       registerCrud(server, ctx, {
           model: 'book', path: '/books', subject: 'Book',
           allowedSorts: ['id', 'title', 'author'], editable: ['title', 'author'],
           validate: function (body) { return body.title ? null : { field: 'title' }; },
           createAttrs: function (body, user) {
               return { title: String(body.title), author: String(body.author || '—'),
                        year: String(body.year || ''), creatorId: user.id };
           },
       });
   }
   ```

   Mais: o modelo e o seed em `dev/mock/index.js` (1 linha cada) e a política do subject novo em `seeds/permissions.js` — política é DADO, não código.

2. **Cliente** — o recurso entra no namespace da feature: dentro da zona content é só mais uma chave (`this.$api.content.books`); numa feature de recurso único seria `api: makeApi('/books')`. `makeApi` dá os 5 verbos canónicos de cada domínio (docs/04). A parte do books em `features/content/index.js`:

   ```js
   import { makeApi } from '../../core/http.js';
   api: {
       posts: makeApi('/posts'),
       books: makeApi('/books'), // o recurso novo: mais uma chave do namespace
   },
   ```

3. O resto é igual: vistas à medida sobre os componentes genéricos de `ui/` (tabelas: `ui/DataTable.vue` — colunas por config, edição inline guiada por `meta.editable`), registo em `features/index.js`. O link da ZONA no navbar fica SEMPRE visível: a política governa o RECURSO (a tabela mostra/esconde por `$perm.can`, a API responde 403), não o link de navegação.

## Quando não usar os atalhos

Domínios não-CRUD com semântica própria — a política em `/api/rules` (reordenação,
auto-protecções) é o exemplo deliberado de rota escrita à mão no mock, e
`features/admin/api.js` o de cliente. Para recursos canónicos com validações e
auto-protecções, a fábrica aceita hooks (`validate`, `validateUpdate`, `validateDelete`,
`coerce`, `serialize`, `enrich`, `guardOpts` — ver `routes/users.js`, que passa pela
fábrica com o subject `User` na política e as defesas em hooks: sub-admin gere contas
comuns, `roles` reservado ao role admin, conta admin só se edita pelo role admin).

## Regras

- **Rotas**: a meta vive no PAI da zona (`requiresAuth`, `roles: ['admin']`, `guest`); o guard avalia tudo (ver [`05-login-e-permissoes.md`](05-login-e-permissoes.md)).
- **API do domínio**: CRUD canónico ⇒ `makeApi('/<path>')` no `index.js`; só domínio não canónico ⇒ `api.js` à mão (forma e critérios em [`04-falar-com-a-api.md`](04-falar-com-a-api.md)). Sessão (login/refresh/logout/me) **não** é `api.js`: é ciclo de sessão e vive em `core/session.js` — se houvesse `$api.auth`, o core teria de importar features (proibido).
- **Tabelas**: usar `ui/DataTable.vue` — colunas por config (`{ key, label, width?, sub?, editFields? }`; **sortable/numeric NÃO se declaram na vista**: derivam de `meta.sorts` — os `allowedSorts`/`numericSorts` da fábrica do mock — tal como a edição deriva de `meta.editable`; o servidor é a autoridade, mudar a fábrica reflecte-se na UI sem tocar em `.vue`), ordenação/paginação server-side, edição inline guiada por `meta.editable`, células custom por slot `cell-<key>` (o PostsView é a referência com slot; o BooksView é a referência de coluna numérica e do slot `actions` para acções extra por linha — ex.: o botão Detalhe, que consome o `get(id)` do `makeApi`; o UsersPanel é a referência de edição com `fieldTypes`/`fieldDisabled` — tipo do input, ex. `password`, e um input desabilitado para campo reservado — e de `meta.roleCounts`, agregados do conjunto inteiro). Agregados que uma página paginada não consegue derivar (ex.: contagens por role) NÃO se calculam na vista: publica-os na meta da listagem com `extraMeta(schema)` na fábrica do mock.
- **Máquina de leitura das vistas de lista**: usar o mixin `Vue.listPage` (`ui/list-page.js`, registado em `app/services.js`): estado de paginação/ordenação, `loadRows`/`reloadRows` (recarga pós-mutação com fallback de página vazia), `goTo`/`setPerPage`/`setSort` e a sessão de edição (`editingId`) escritos UMA vez para todas as listas (PostsView, BooksView e UsersPanel usam-no). A vista declara `mixins: [Vue.listPage({ fetch, label })]` (+ `apply` para extras da meta, ex.: `roleCounts`) e fica só com o domínio: colunas, mutações e os textos 403 próprios (sobreponha `readError`). Não é `import` nos `.vue` (regra da 2.ª cópia): o registo é feito no arranque, no grafo nativo de módulos.
- **Componentes**: usados por 1 feature → dentro dela; por 2 ou mais → `src/ui/`. Nunca importar `.js` locais dentro de `.vue` (2ª cópia do módulo).
- **core/ não conhece features**: a feature importa do core (`core/http.js`, `core/loader.js`), nunca o contrário.
- Se a feature precisa de estado global partilhado, padrão Vuex: copiar o módulo demo e registar em `app/store.js` — mas primeiro perguntar se o estado não é só local (`data()`) ou de sessão (`core/session.js`, já reactivo).
