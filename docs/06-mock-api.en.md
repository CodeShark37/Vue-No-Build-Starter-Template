# 06 — Mock API (MirageJS)
> **Navigation:** [Portuguese README](../README.md) · [English README](../README.en.md) · [Previous](05-login-e-permissoes.en.md) · [Next](07-producao.en.md)

With `mock: true` in `env.js`, the app starts a server that **intercepts Axios XHRs before they reach the network**. `this.$api` and `this.$http` behave the same way and can be tested end to end without a backend; the rest of the app does not distinguish the mock from a real API. (`vendor-dev/mirage.min.js` is injected by `env.js`; the factory lives in `dev/mock/index.js`, the only module that knows about MirageJS, just as `core/loader.js` is the only module that knows about the sfc-loader.)

Organization:

```
dev/mock/
  index.js           thin factory: models (user, post, book, rule, session) + seeds + registration of routes
                     + DATABASE PERSISTENCE across reloads (localStorage dump; see below)
  token.js           codec of the fake-JWT 'mrg.<payload>.mock': issueToken (with jti and typ
                     access/refresh) / payloadOf / hashToken (COMPLETE-token integrity
                     — wrapper included — recorded at issuance, current behavior)
  sessions.js        session REGISTRY — authority for identity and lifecycle:
                     createSessionPair (login: access/refresh pair, same family),
                     rotateSession (refresh with rotation and detection of reuse),
                     revokeSession/revokeFamily (logout and demos), revokeUserSessions
                     (new password) and validateSession (the arbiter for every request:
                     format? issued jti? expected type? revoked? intact payload?
                     expired?)
  helpers.js         send/parseBody, tokenOf, sessionOf (401, delegates to the registry), guard
                     (403), userById/postById, paginate (?page&per_page&sort&order,
                     server-side) and the policy ENGINE (rulesForUser/materializeRules/
                     abilityFor — the client CASL implementation, in the mock)
  crud.js            factory registerCrud: the five routes for a canonical resource with one policy chain
                     of policy written once — all the resources with seed pass by
                     it (posts, books, and users), with hooks (validate, validateUpdate/
                     validateDelete, coerce, serialize, guardOpts, extraMeta, afterUpdate);
                     publishes the interface contract in listing META — editable (a UI
                     draws the editor from it) and sorts {allowed, numeric} (arrows of
                     sorting and columns numeric also)
  routes/            auth.js  profile.js  permissions.js  users.js  posts.js  books.js
  seeds/             users.js  posts.js  books.js  permissions.js   (pure, deterministic data)
```

- **Seeds**: 15 posts (3 pages of 6, authors in round-robin by the 5 users — all the roles appear in the table), 7 books (2 pages of 6), 5 accounts (admin, user, editor, viewer, subadmin — the account role), and the policy `roleRules` loaded for the database (model `rule`).
- **the policy is read from the database on every request** — changing the seed and reloading changes permissions; no policy is hard-coded in handlers. post routes enforce this on **every request, including reads**: removing the rule `read Post` of the role `user` locks `GET /posts` with **403** on the next request (and the rule `read` with `conditions` filters the list — ABAC on the server).
- **The mock database persists across reloads** (development): each handled request dumps the database to `localStorage` through Pretender’s `handledRequest` hook, and the next boot restores the dump when its seed signature matches. Runtime changes (revoking a rule, creating posts or users) survive refreshes and direct URL access. Editing a seed file changes the FNV-1a signature, so the dump is discarded and the database resets to the new seed. `window.__mockReset()` deletes the dump and reloads the initial state. If localStorage is unavailable or full, the mock falls back to ephemeral data.
- **latency** `config.mirage.timing` (ms) by request; **TTLs** `config.mirage.tokenTtl` (access, 120s) and `refreshTtl` (refresh, 7 days): access expired → 401 → `/refresh` automatic (with rotation).
- **sessions**: the token is the reference (`jti`) the line of the model `session` in the registry (`sessions.js`) — issues-if only in the login (pair access/refresh, same `family`) and in the refresh (rotation), revokes in the logout (family whole) and in the change of password, and the token payload contains the hash recorded in the issuance: any tampering (roles, sub, exp, typ) gives 401. sessions persist in the dump with the rest of the database.
- **Passwords sleep HASHED**: the mock database stores only `passwordHash` in PHC format (`pbkdf2-sha256$<iterations>$<salt>$<hash>` — `dev/mock/password.js`, synchronous pure-JS PBKDF2-HMAC-SHA256, per-username deterministic salt). The plaintext exists only in the request body and in the provisioning script (`seeds/users.js`, `demoAccounts`); login verifies against the hash in constant time and no endpoint returns the password or the hash. On a real backend: bcrypt/argon2id with a random salt — the PHC format is the same concept.
- **`META.editable`**: the factory publishes allowlist of the PUT — the server is authoritative for what is editable and the UI (`ui/DataTable.vue`) renders inputs from that list; change `editable` in `routes/<resource>.js` is reflected in the views without touching no `.vue` (the PUT re-verifies allowlist of any form — exposing it is not delegation).
- **`META.sorts`**: the same principle for the sorting and the format numeric — the list publishes `sorts: {allowed, numeric}` (the `allowedSorts`/`numericSorts` of the factory) and the DataTable derives of it the arrows of sorting and the numeric formatting of the columns numeric; the config of columns of the view column config is presentation only (`key/label/width/sub/editFields`). the `?sort=` otherwise `allowed` falls back in the `defaultSort` on the server — exposing it is not delegation, here also.
- **`META.roleCounts` (option `extraMeta` of the factory)**: aggregates of the full-set aggregates that a paginated page cannot derive, published in the META of the list — the users resource publishes counts of users by role (the summary "roles existentes" of the UsersPanel). the factory accepts `extraMeta(schema)` in any resource: the server computes the aggregate, the view only renders.
- **Passthrough**: everything outside `/api` (including the loader’s `fetch` of `.vue` files) goes to the network.

## Endpoints

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/login` | – | `{username, password}` → pair access/refresh new in the registry + `{token, refreshToken, user}` or 401 |
| POST | `/api/refresh` | refresh issued and not revoked (expired ok) | rotation: new pair `{token, refreshToken, user}`; the refresh old and the access of the family remain revoked; reuse the refresh already rotated kills the family whole (detection of theft); 401 for forged or tampered/revoked, access in the `/refresh` (wrong type) or unknown user |
| GET | `/api/me` | token | user current or 401 |
| POST | `/api/logout` | token (tolerante) | **revokes the family** (access and refresh die together): the token old gives 401 in any request next; `{ok: true}` always |
| POST | `/api/__demo/expire` | token · only `debug` | demo of the flow 401→refresh: marks the current session session expired in the REGISTRY → next request 401 `token_expired` → refresh rotates the pair; 404 otherwise `debug` |
| POST | `/api/__demo/revoke` | token · only `debug` | demo of the flow 401→logout: revokes the family of the current session in the REGISTRY → 401 `invalid_token` → refresh failure → logout; 404 otherwise `debug` |
| GET | `/api/profile` | token | public profile of the current session (same shape of the `/me`) — the route of the profile (`/profile`) |
| PUT | `/api/profile` | token | self-service of the user’s own account: changes `name` / `username` / `password` (empty = keep) → 200 with the profile updated; 422 name empty, username 3-24 `[a-zA-Z0-9_.-]` + single, password < 4. Self-scoped: writes always in the user of the session (ids in the body are ignored); roles never (auto-escalation) |
| GET | `/api/permissions` | token | CASL rules of the session user, read from the mock DB on every request (seed `seeds/permissions.js` — the complete source of the policy, 5 roles): admin → `manage Post` + `manage Book` + `manage User`; user → `read/create Post` + `read Book` + `update/delete` with conditions `{authorId}`; editor → `read/create/update Post` + `read Book`; viewer → `read Post` + `read Book`; subadmin → `read User` + `update User` + `read Post` + `read Book` |
| GET | `/api/permissions/:id` | token + `admin` | **`:id` = id of user**: public profile + effective rules already materialized with the data of it (that `GET /api/permissions` would provide); 404 unknown, **403** without admin |
| GET | `/api/rules` | token + `admin` | policy **raw** (placeholders intact): `{data: [{id, role, action, subject, conditions, inverted, position}]}` sorted by `position` — the order of evaluation CASL, the last rule that matches about the same (action, subject) wins |
| POST | `/api/rules` | token + `admin` | creates rule `{role, action, subject, conditions?, inverted?}` → 201 (is created in last place, position = max+1 — "the more recent wins"); 422 text empty/>40, conditions invalid (not-object/values not primitives), `inverted` not-boolean or rule duplicate |
| PUT | `/api/rules/order` | token + `admin` | REORDER the policy (the endpoint of the drag & drop): body `{ids: [...]}` with **all** the ids in the new order of evaluation → 200 with the policy reordered; 422 if an ID is missing, extra, duplicated, or unknown or id unknown — nothing changes (a malformed drag operation never loses rules) |
| PUT | `/api/rules/:id` | token + `admin` | updates any field (incl. `inverted`) → 200; 422 the same applies + that would leave the role `admin` without rules (self-lockout of the policy); 404 |
| DELETE | `/api/rules/:id` | token + `admin` | deletes → 204; 422 in the last rule of the role `admin`; 404 |
| GET | `/api/admin/stats` | token + `admin` | `{data: {users, posts, generatedAt}}` or **403** |
| GET | `/api/admin/users` | token + rule `read User` | list **paginated/sorted** (`?page&per_page&sort&order`; `sort`: id, name) of `{id, username, name, roles}` — **never passwords** — with META `editable/sorts/roleCounts`; **403** without the rule (the SUB-ADMIN enter only with `read User`) |
| GET | `/api/admin/users/:id` | token + rule `read User` | detail public of the user (of the factory, without password); 404 unknown |
| POST | `/api/admin/users` | token + rule `create User` | creates `{username, name, password, roles[]}` → 201; 422 `{error:'validation', field, message?}` (username 3-24 `[a-zA-Z0-9_.-]` + single, name required, password ≥ 4, ≥ 1 role) |
| PUT | `/api/admin/users/:id` | token + rule `update User` + protections | changes name / password (empty = keep) / roles → 200; **account with the ROLE admin only when edited by the admin role (403 before validation — T12)**; field `roles` reserved to the admin role (403); username immutable here (the user renames themselves in the `/api/profile`); 422 in the own roles (self-lockout); 404. new password revokes the sessions of the target |
| DELETE | `/api/admin/users/:id` | token + rule `delete User` | deletes the account → 204; 422 the delete-if their own; 404. their posts remain; the token of it dies on the next request (401 → refresh failure → logout automatic) |
| GET | `/api/posts` | token + rule `read` | paginated + sorted: `?page=1&per_page=6&sort=id&order=desc` (`sort`: id, createdAt, title, author) → `{data, META: {page, perPage, total, totalPages, hasMore, editable, sorts}}` — `META.editable` is allowlist of the PUT and `META.sorts` the contract of sorting, published for the UI; **403** without any rule `read Post` (policy read each request); rule `read` with `conditions` filters the list (ABAC); token expired → auto refresh + retry |
| GET | `/api/posts/:id` | token + rule `read` about the post | `{data: {...}}`; 404 unknown; **403** without `read` about the post (is not public: read also is permission) |
| POST | `/api/posts` | token + rule `create` | creates post (`author`/`authorId` = session) → 201; **403** without `create`; 422 without `title` |
| PUT | `/api/posts/:id` | token + rule `update` about the post | 200; **403** otherwise — the owner rule decides the owner rule (`conditions {authorId}`), an admin uses the `manage` |
| DELETE | `/api/posts/:id` | token + rule `delete` about the post | 204; **403** otherwise, the same applies |
| GET | `/api/books` | token + rule `read` | second resource, served by the factory `crud.js`: paginated + sorted (`sort`: id, title, author, pages — `pages` with `numericSorts`, comparison by number) → `{data, META}` (with `META.editable` and `META.sorts`); **403** without any rule `read Book` (policy on every request); rule with `conditions` filters the list (ABAC) |
| GET | `/api/books/:id` | token + rule `read` about the book | `{data: {...}}`; 404 unknown; **403** without `read` about the book |
| POST | `/api/books` | token + rule `create` | creates book (`creatorId` = session) → 201; **403** without `create`; 422 without `title` |
| PUT | `/api/books/:id` | token + rule `update` about the book | 200 — only the fields of allowlist `editable`; **403** otherwise |
| DELETE | `/api/books/:id` | token + rule `delete` about the book | 204; **403** otherwise, the same applies |

The API re-verifies these protections even when the UI is bypassed: users cannot delete their own account or change their own roles (`422`, preventing self-lockout of the last administrator), and an account with the `admin` role can only be edited by an administrator (`403` — T12). An unknown role is accepted but created with **zero permissions**, failing closed until the seed provides rules. The policy also governs post reads: the mock builds the session Ability with the same CASL rules as the client (`helpers.abilityFor`) and returns `403` whenever the policy denies access.

## order of the rules and rules cannot

in the CASL, the **last rule that matches** about the same (action, subject) **wins**. to make this observable (and editable), the policy now includes:

- **`position`** — the order of evaluation is the data of the rule; `GET /api/rules`, `PUT /rules/order` and the engine of the policy (`rulesForUser` in `helpers.js`) ordenam always by `position` (empate → id). Seeds: position = order of the file; rule new: max+1 (is created the winsr).
- **`inverted`** — the `cannot` of the CASL: `{action:'update', subject:'Post', inverted:true}` denies instead of allowing. conditions work the same way (`cannot` only in someone else’s posts, by example). the panel shows-the with badge vermelho `cannot`.

Combination of example (the scenario canonical of the drag & drop — see `05-login-e-permissoes.en.md`): the `cannot update Post` above the owner rule locks all the updates of the user; dragged for the top, the owner rule becomes the last rule and the user can edit their own posts.
