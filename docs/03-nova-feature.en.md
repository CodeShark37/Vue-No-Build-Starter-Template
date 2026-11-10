# 03 — New feature
> **Navigation:** [Portuguese README](../README.md) · [README english](../README.en.md) · [Previous](02-nova-pagina.en.md) · [Next](04-falar-com-a-api.en.md)

A feature is a folder with a small contract:

```js
export default {
    name: 'posts',                                       // $api namespace
    api: makeApi('/posts'),                              // only for data-bearing features
    routes: [ /* complete area route(s), including the parent route */ ],
};
```

> **Template policy: the code shows only the preferred form.** For canonical CRUD domains,
> `api: makeApi('/<path>')` is the preferred form: one line and zero handwritten functions.
> The content area uses it for posts and books. The alternative—handwritten thin functions in
> `api.js`—is not needed by the example code; it is documented in
> [04 — Talking to the API](04-falar-com-a-api.en.md) for domains that are genuinely not canonical
> (`features/admin/api.js` is the live example because `/admin` has stats, `/permissions/:id`,
> and `/rules/order`).

## Steps (the complete example is `features/content/`, which contains posts and books)

1. **Create** `src/features/<name>/` with:
   - `index.js` — the contract above, using `api: makeApi('/<path>')` for canonical CRUD;
   - `api.js` — only for non-canonical domains (see [04](04-falar-com-a-api.en.md)); these are
     thin functions around `core/http.js`:

     ```js
     import http from '../../core/http.js';
     export function reorderRules(ids) { return http.put('/rules/order', { ids: ids }); }
     ```

   - the feature’s views and panels. For tables, use the generic `ui/DataTable.vue`.
2. **Declare the route area** in the feature’s `index.js`. The feature chooses the layout for
   its route parent:

```js
import { lazy } from '../../core/loader.js';
import { makeApi } from '../../core/http.js';

export default {
    name: 'content',
    api: { posts: makeApi('/posts'), books: makeApi('/books') },
    routes: [
        {
            path: '/content',
            component: lazy('src/ui/layouts/ContentLayout.vue'), // the layout provides area navigation
            meta: { requiresAuth: true },                        // parent metadata covers the children
            children: [
                { path: 'posts', name: 'ContentPosts', component: lazy('src/features/content/PostsView.vue') },
            ],
        },
    ],
};
```

3. **Register it** in `src/features/index.js`, the only registry file to edit:

```js
import content from './content/index.js';
const features = [site, auth, content, admin];
```

That is all: `main.js` passes the routes to the router, and `this.$api.<name>` is created
here. No other file registers `$api` entries.

## Adding a second data resource

Posts and books use the same chain: `registerCrud` in the mock, `makeApi` on the client, and `ui/DataTable.vue` in the
view. To add a resource:

1. **Mock.** Instead of copying the policy chain into several files, register the five routes
   with `registerCrud` (`dev/mock/crud.js`). It applies the same sequence—guard, record
   lookup 404, type/instance policy 403, shape validation 422, and pagination—to every
   seeded resource (order per operation; see docs/08):

   ```js
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

   Also add the model and seed in `dev/mock/index.js` (one line each), and add the new
   subject’s policy in `seeds/permissions.js`. Policy is data, not code.
2. **Client.** Add the resource to the feature namespace. In the content area, add one key
   (`this.$api.content.books`); in a single-resource feature, use `api: makeApi('/books')`.
   `makeApi` provides the five canonical verbs (see [04](04-falar-com-a-api.en.md)):

   ```js
   import { makeApi } from '../../core/http.js';
   api: {
       posts: makeApi('/posts'),
       books: makeApi('/books'), // new resource: one more namespace key
   },
   ```

3. Use the same generic components for the views. Record the feature in
   `src/features/index.js`. The area link remains visible: policy governs the resource (the
   table shows or hides actions with `$perm.can`, and the API returns 403), not navigation.

## When not to use the shortcuts

Use a handwritten API for non-CRUD domains with their own semantics: `/api/rules` (rule
reordering and automatic protections) is the intentional handwritten mock example, and
`features/admin/api.js` is the client example. For canonical resources with validation and
automatic protections, the factory accepts `validate`, `validateUpdate`, `validateDelete`,
`coerce`, `serialize`, `enrich`, and `guardOpts` hooks (see `routes/users.js`). It registers
`User` as the policy subject and applies the hooks: a sub-admin manages ordinary accounts,
`roles` is reserved for the admin role, and an admin account can be edited only by an admin.

## Rules

- **Routes:** put metadata on the area parent (`requiresAuth`, `roles: ['admin']`, `guest`); the
  guard evaluates everything (see [05](05-login-e-permissoes.en.md)).
- **Domain API:** canonical CRUD ⇒ `makeApi('/<path>')` in `index.js`; non-canonical domains ⇒
  handwritten `api.js` (see [04](04-falar-com-a-api.en.md)). Session operations (login, refresh,
  logout, and `me`) are not `api.js`: they belong to `core/session.js`. An `$api.auth` would
  make core import features, which is forbidden.
- **Tables:** use `ui/DataTable.vue`. Columns come from `{ key, label, width?, sub?, editFields? }`;
  sortable and numeric behavior comes from `META.sorts` and the mock factory’s
  `allowedSorts`/`numericSorts`; editing comes from `META.editable`. The server is authoritative,
  so changing the factory updates the UI without editing `.vue`. Use `cell-<key>` for custom
  cells and `actions` for row actions. `UsersPanel` demonstrates `fieldTypes`, `fieldDisabled`,
  and `META.roleCounts`. Aggregates that a paginated page cannot derive belong in listing
  metadata via `extraMeta(schema)` in the mock factory.
- **Read machine for list views:** use the `Vue.listPage` mixin (`ui/list-page.js`, registered in
  `app/services.js`): pagination/sort state, `loadRows`/`reloadRows` (post-mutation reload with
  empty-page fallback), `goTo`/`setPerPage`/`setSort`, and the inline-edit session (`editingId`)
  written once for every list (PostsView, BooksView, and UsersPanel use it). A view declares
  `mixins: [Vue.listPage({ fetch, label })]` (plus `apply` for metadata extras, e.g. `roleCounts`)
  and keeps only its domain: columns, mutations, and its own 403 texts (override `readError`).
  It is never an `import` inside `.vue` (second-module-copy rule): registration happens at boot,
  on the native module graph.
- **Components:** used by one feature → keep them there; used by two or more → `src/ui/`.
  Never import local `.js` modules from `.vue`; that would create a second module copy.
- **Core:** `core/` does not know features. Features import `core/http.js` and `core/loader.js`,
  never the reverse.
- **Shared state:** if a feature needs global state, copy the demo Vuex module and register it
  in `app/store.js`. First check whether the state is local (`data()`) or session state
  (`core/session.js`, already reactive).
