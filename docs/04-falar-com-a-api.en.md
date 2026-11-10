# 04 — Talking to the API
> **Navigation:** [Portuguese README](../README.md) · [README english](../README.en.md) · [Previous](03-nova-feature.en.md) · [Next](05-login-e-permissoes.en.md)

## The only access pattern in components

`.vue` files do not import local `.js` modules; the loader would compile a second copy of the
module. Everything is available through `this`:

| service | module | typical use |
| --- | --- | --- |
| `this.$api.content.posts.list(...)` | `makeApi('/posts')` in `features/content/index.js` | canonical CRUD endpoints |
| `this.$api.content.books.remove(id)` | `makeApi('/books')` in `features/content/index.js` | same |
| `this.$api.admin.updateRule(...)` | `features/admin/api.js` | admin area, non-canonical domain |
| `this.$http` | `core/http.js` | calls outside `$api` (for example, `/profile`) |
| `this.$auth` | `core/session.js` | `isLoggedIn()`, `user`, `hasRole()`, `setSession()`, `clearSession()` |
| `this.$perm` | `core/ability.js` | `can(action, subject, object?)` |
| `this.$config` | `core/config.js` | derived values, including guard destinations |
| `this.$theme` | `core/theme.js` | reactive theme: `current`, `set(value)`, `toggle()` |
| `this.$store` | `app/store.js` | shared namespaced Vuex state |

## Domain API: `makeApi` is the standard

**The code keeps only the preferred form.** For canonical CRUD (list, detail, create, update,
and delete), create the API module with one line—`api: makeApi('/posts')` in the feature’s
`index.js`—instead of writing functions by hand:

```js
// features/content/index.js — in the area, each domain is a namespace key
import { makeApi } from '../../core/http.js';
export default {
    name: 'content',
    api: { posts: makeApi('/posts'), books: makeApi('/books') }, // list/get/create/update/remove for /api/posts and /api/books
    routes: [ /* … */ ],
};
```

`makeApi` creates five thin functions over the same Axios instance in `core/http.js`, so they
share the same session policy (401 → single-flight refresh → retry):

| Function | request |
| --- | --- |
| `list(params?)` | `GET <path>` with `?page&per_page&sort&order` |
| `get(id)` | `GET <path>/:id` |
| `create(data)` | `POST <path>` |
| `update(id, data)` | `PUT <path>/:id` |
| `remove(id)` | `DELETE <path>/:id` |

- **URLs live in one place:** changing `/posts` means changing the `makeApi` line.
- **Registration:** `features/index.js` combines feature APIs under their names. Adding a
  feature is one line; `$api` has no second registry.
- **`auth` is not part of `$api`:** login, refresh, logout, and `me` are session operations in
  `core/session.js`; the `core/http.js` interceptor calls them directly. `$api.auth` would make
  core import features, violating the architecture rule.

## Non-canonical domains: handwritten `api.js`

`makeApi` covers only `list/get/create/update/remove` for one path. Domains with a different
shape define their own `api.js` with thin functions. Typical signs include:

- endpoints outside the five verbs, such as `POST /posts/:id/publish`, `GET /posts/search?q=`,
  collection operations such as `PUT /rules/order`, or aggregates such as `GET /admin/stats`;
- multiple resources in one domain (`/admin/users`, `/permissions/:id`, and `/rules` all live
  in the admin API);
- response contracts that differ from the paginated envelope expected by the views.

Each function simply returns the Axios promise; the view owns loading and error presentation:

```js
// features/admin/api.js (live code example — required there, not merely didactic)
import http from '../../core/http.js';

/** Raw policy, ordered by position — CASL evaluation order (the last match wins). */
export function listRules() { return http.get('/rules'); }

/** Reorder the policy: { ids } with ALL IDs in the new order. */
export function reorderRules(ids) { return http.put('/rules/order', { ids: ids }); }

/** Effective rules for a USER, already materialized with that user’s data. */
export function permissionsOf(userId) { return http.get('/permissions/' + userId); }
```

Rules for handwritten `api.js` files:

1. Keep functions thin and purposeful: no state and no `.then`; the caller decides how to handle
   success and failure.
2. Document the contract with JSDoc, including expected errors (403 for rule X, 422 for field Y)
   and the response shape.
3. Name functions by domain intent, not HTTP verb: `reorderRules(ids)` is clearer than
   `putRulesOrder`.
4. Never import `core/http.js` inside `.vue`; `api.js` imports it once and views consume
   `this.$api.<feature>`.

> **Why this policy?** The code keeps the best form for each case. The documentation explains
> the alternatives and when they apply, without imposing duplicate maintenance on production code.

## Errors: who is authoritative

- **401** — the server cannot identify the caller. The interceptor sends the refresh token to
  `POST /refresh` once (parallel 401s share the same refresh), retries with the new access token,
  and clears the session and redirects to `/login?redirect=…` if refresh fails. Views do none of this.
- **403** — the server knows the caller but the action is forbidden. Never clear the session or
  navigate; show an inline message.
- **422** — validation failed. The body contains `{error, field, message?}`; panels show it inline.
- **Server-driven editing:** the listing returns `META.editable`, the fields accepted by PUT.
  `ui/DataTable.vue` renders forms from that list. Hiding a button with `$perm.can(...)` is UX;
  the API still returns 403 for unauthorized users (defense in depth; see [05](05-login-e-permissoes.en.md)).

## Complete endpoint list

See [06 — Mock API](06-mock-api.en.md) for the table of authentication, responses, and validation.
