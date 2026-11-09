# 05 — Login and permissions
> **Navigation:** [Portuguese README](../README.md) · [English README](../README.en.md) · [Previous](04-falar-com-a-api.en.md) · [Next](06-mock-api.en.md)

## session: the single source

`core/session.js` is the single module that reads/writes the session (`localStorage`: keys from `config.auth`). Guard, interceptor and views all consult it; is reactive (`Vue.observable`), therefore nav and views follow login/logout/refresh without manual events.

**The server is authoritative for session identity and lifecycle.** The token references the session in the mock registry by its `jti` (`dev/mock/sessions.js`); a real backend would use the same kind of table or Redis. The client decodes the payload only for UX (who is signed in and when the token expires). The server always decides validity: an unissued, forged, or tampered token returns 401; logout and password changes revoke sessions; refresh rotates the token.

- **Login**: `POST /login` → a new access/refresh pair in the registry → `setSession(token, user, refreshToken)` → the guard returns the user to the saved `?redirect=` target.
- **Logout**: the “Sign out” button in the navbar → `POST /logout` **revokes the session on the server** (the old token returns 401 on every subsequent request) + `clearSession()` + `/login`.
- **Guest**: `META: { guest: true }` in the `/login` sends for the root who already has session.
- **Profile**: the user’s name in the navbar links to `/app/profile`, which centralizes session information (token, inactivity time, and expired/revoked simulations via `SessionPanel`) and manages the user’s own account. `PUT /profile` changes the name, username, and password (an empty value keeps the current value). The endpoint is self-scoped by construction: the server writes only to the current user’s record; other accounts remain in the admin area, and roles cannot be changed here (auto-escalation → 422). Changing the password revokes every session for the account, including the current one; the app signs out, clears the session, and returns to login.

## flow of the token (espelha the backend JWT real)

```
view ── GET /me ──▶ 401 token_expired ──▶ POST /refresh ──▶ new token (rotation: old jti revoked) ──▶ retry GET /me ──▶ 200
                                        └─▶ 401 (revoked: logout, password, rotation) ─▶ clearSession ─▶ /login?redirect=…
view ── DELETE /posts/1 (someone else’s) ──▶ 403 forbidden ──▶ inline message, session retained
```

- `401 invalid_token` (token forged, tampered, revoked, or tied to an unknown user), `401 token_expired` (the registry says it has expired), `403 forbidden` (the session is valid, but the policy or role does not allow the action, including reads).
- in the `401` the interceptor calls `POST /refresh` **once** (401 parallel share the same refresh in in progress — single-flight) and **retries the request**: the view nor note. the 401 in the own `/login` never triggers the cycle.
- **The refresh token is separate:** login returns an access/refresh pair. The access token (120s) is sent with every request; the refresh token (7 days) is used only by `POST /refresh`. Using it on another route returns 401. The two token types must never be mixed.
- **Rotation has a real security effect:** each refresh revokes the old pair and issues a new one. Reusing an already rotated refresh token revokes the entire family, detecting the classic refresh-token theft race.

## Guard: routes declare, the guard evaluates

the guard evaluates in this order: `requiresAuth`/`perm` without a session → `/login?redirect=…`; `guest` with a session → `/`; `roles` without that role → `/403` **without logging out** ("without permission" ≠ "without a session"); `perm: {action, subject}` without the **CASL ability of the server** → `/403` — the route declares the permission required (for example: `/admin/users` asks `read User`), the guard waits for synchronization (`$perm.ready()`) and decides using the rules that the server provides. This opens the door for **sub-admins**: the seeded `subadmin` role has `read` and `update` on `User`, so it can enter the admin area and manage **ordinary** accounts, but cannot create or delete them. The `roles` field is reserved for the admin role (403; see `dev/mock/routes/users.js`), and administrator accounts may be edited only by an administrator (403 before validation — T12/EXP7: without this, a sub-admin could take over an administrator account by changing its password).

`to.matched` walks the route chain. META on an area parent covers its children, so views never validate the session themselves.

## permissions: CASL, server-driven — data, not code

`GET /api/permissions` returns the rules of the user in JSON; `core/ability.js` builds the `casl.Ability` and the views ask `this.$perm.can(action, subject, object?)`. is reactive and **fail-closed**: without rules, no action visible.

the policy is the **data**: `dev/mock/seeds/permissions.js` stores `roleRules` (by role) and the mock loads-the for the database in the boot; handlers reread the database **each request** — the backend real does with its central policy table.

- `admin` → `[ { action: 'manage', subject: 'Post' } ]` — everything, without conditions.
- `user` → read + create always; update/delete with the **rule owner**:
  `{ action: 'update', subject: 'Post', conditions: { authorId: '${user.id}' } }`.

the rule owner, explained:

- rule **without** `conditions` applies to every object of the subject; **with** `conditions`, it applies only to matching objects — “only posts whose `authorId` is mine”.
- **by id, not by username**: the id is stable and immutable; the username may be renamed (see `/api/profile`). It is not part of the policy because the policy references `authorId`. Each post stores both `author` (display name) and `authorId` (used by the policy and assigned on creation by `crud.js`).
- `'${user.id}'` is the **placeholder**: the mock resolves it from the session before responding (`materializeRules()` in `dev/mock/helpers.js`, which accepts any `user.*` field). Each user receives concrete rules while the seed remains generic; new accounts gain owner rules without code changes. An unknown field becomes `undefined`, so the condition never matches (fail-closed).
- Bypassing the UI changes nothing: the policy applies on the server. PUT/DELETE requests for another user’s post still return **403**, and without the `read` rule even `GET /posts` is denied. The mock builds the same CASL Ability as the client through `helpers.abilityFor`. Buttons are UX; the API is authoritative.
- **Areas versus CASL: different purposes**: routes use declarative `META.roles`, while CASL governs object actions such as `update Post #7`. Each layer stays in its proper place.
- **Navbar: the link is navigation, not policy** — `resources` (posts and books) is always visible (until the guest: click it without a session falls back to the login with `?redirect=`). that the policy governs is the resource: the table shows/hides actions by `$perm.can(...)` and the API responds 403 — hide the link would be hide the route whole, and is the resource that has permission.
- **the user’s own account is self-service**: `GET/PUT /api/profile` — manage the YOUR account is right of the authenticated session (401 without it); manage other users’ accounts is the area admin (`/api/admin/users` — the rule about `User` decide: the admin manages everything, the sub-admin manages ordinary accounts). roles never in the profile: give-if admin their own would be auto-escalation (422).

## Inspection and editing of the policy (only admin)

- the entire admin area uses its own chrome (`AdminLayout`): navbar + **sidebar** with the three sections — overview (`/admin/stats`), users (`/admin/users`), permissions (`/admin/permissions`). the menu of top has the single link "Admin"; ``/admin` redirects to `/admin/users`. the UsersPanel list all the users with their roles (badges by line + summary "existing roles: admin (1), user (1)" — how many exist).
- `/admin/stats` shows `UserPermissions`: chooses-if the user and sees-if the rules that the server IT delivers, already materialized (`GET /api/permissions/:id`, in that `:id` is the **id of the user**; 403 for not-admin, 404 for id unknown). the list comes in the order of evaluation (with number and badge `cannot`).
- `/admin/permissions` (`PermissionsView` + `RulesPanel`) does the **CRUD of the policy raw** in `/api/rules`: the same table, but with the placeholders intact — edit here is edit the table that the backend real teria. after each mutation, the panel re-sincroniza the Ability (`$perm.sync()`): buttons and links follow without reload.

## the order of the rules is permission efectiva (drag & drop)

in the CASL, when **two rules match the same (action, subject), the last matching rule wins** — the validation gives preference to the rule more recent. therefore the policy has the field `position` (order of evaluation) and the RulesPanel leaves **reorder by drag & drop** (HTML5 native, without vendor new): drag by the handle `☰`; in the drop does-if `PUT /rules/order` with all the ids (the server validates the set complete — 422 and nothing changes if be missing/be extra id).

for see the order the ACTUAR provides the rule of denial: `inverted: true` (the `cannot` of the CASL, badge vermelho in the table; checkbox "deny (cannot)" in the form).

```
policy for the user role (evaluation order, # ascending)
  3. update Post  conditions { authorId: '${user.id}' }   <- owner rule
  8. update Post  inverted: true                          <- cannot, without conditions
=> a eighth entry is also the last and therefore wins. The user loses update access to all posts.

the same `cannot` rule moved before the owner rule
  3. update Post  inverted: true
  4. update Post  conditions { authorId: '${user.id}' }
=> now the owner rule is last, so it wins. The user can edit their own posts again.
```

rules of experience: the rule new is created in **last place** (create the `cannot` and not the move = denied therefore); move the `cannot` for the top weakens-the (remains behind of everything and rarely wins); conditions of denial exist at the same time — `cannot update Post` with conditions `{ authorId: '${user.id}' }` removes to the user only the own posts.

- change the policy = change the data. two forms: the seed `roleRules` (the **state initial** that the mock loads in the boot) or the CRUD admin above — the two write at the same time place, the database of the mock, that is reread each request. validations (422) and the auto-protection of the role `admin` (never remains without rules) vivem in the API, not in the UI. the effect is immediate in the routes of posts: remove the rule `read Post` to the role `user` locks the `GET /posts` of it with **403** already on the next request (the Ability of who was logged in only re-sincroniza in the reload/re-login — the UI follows; the API never depended dela).
