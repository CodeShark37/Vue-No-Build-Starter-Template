# 05 — Login and permissions
> **Navigation:** [Portuguese README](../README.md) · [English README](../README.en.md) · [Previous](04-falar-com-a-api.en.md) · [Next](06-mock-api.en.md)

## Session: the single source

`core/session.js` is the single module that reads and writes the session (`localStorage`, using the keys from `config.auth`). The guard, interceptor, and views all consult it. Because it is reactive (`Vue.observable`), navigation and views follow login, logout, and refresh without manual events.

**The server is authoritative for session identity and lifecycle.** The token references the session in the mock registry by its `jti` (`dev/mock/sessions.js`); a real backend would use the same kind of table or Redis. The client decodes the payload only for UX (who is signed in and when the token expires). The server always decides validity: an unissued, forged, or tampered token returns 401; logout and password changes revoke sessions; refresh rotates the token.

- **Login**: `POST /login` → a new access/refresh pair in the registry → `setSession(token, user, refreshToken)` → the guard returns the user to the saved `?redirect=` target.
- **Logout**: the “Sign out” button in the navbar → `POST /logout` **revokes the session on the server** (the old token returns 401 on every subsequent request) + `clearSession()` + `/login`.
- **Guest**: `meta: { guest: true }` on `/login` redirects users with an active session to `/`.
- **Profile**: the user’s name in the navbar links to `/app/profile`, which centralizes session information (token, inactivity time, and expired/revoked simulations via `SessionPanel`) and manages the user’s own account. `PUT /profile` changes the name, username, and password (an empty value keeps the current value). The endpoint is self-scoped by construction: the server writes only to the current user’s record; other accounts remain in the admin area, and roles cannot be changed here (auto-escalation → 422). Changing the password revokes every session for the account, including the current one; the app signs out, clears the session, and returns to login.

## Token flow (like a real JWT backend)

```
view ── GET /me ──▶ 401 token_expired ──▶ POST /refresh ──▶ new token (rotation: old jti revoked) ──▶ retry GET /me ──▶ 200
                                        └─▶ 401 (revoked: logout, password, rotation) ─▶ clearSession ─▶ /login?redirect=…
view ── DELETE /posts/1 (someone else’s) ──▶ 403 forbidden ──▶ inline message, session retained
```

- `401 invalid_token` (token forged, tampered, revoked, or tied to an unknown user), `401 token_expired` (the registry says it has expired), `403 forbidden` (the session is valid, but the policy or role does not allow the action, including reads).
- On `401`, the interceptor calls `POST /refresh` **once** (parallel 401 responses share the same in-flight refresh) and **retries the request**. The view does not need to know about the refresh cycle; a 401 from `/login` never triggers it.
- **The refresh token is separate:** login returns an access/refresh pair. The access token (120s) is sent with every request; the refresh token (7 days) is used only by `POST /refresh`. Using it on another route returns 401. The two token types must never be mixed.
- **Rotation has a real security effect:** each refresh revokes the old pair and issues a new one. Reusing an already rotated refresh token revokes the entire family, detecting the classic refresh-token theft race.

## Guard: routes declare, the guard evaluates

The guard evaluates in this order: `requiresAuth`/`perm` without a session → `/login?redirect=…`; `guest` with a session → `/`; `roles` without that role → `/403` **without logging out** ("without permission" ≠ "without a session"); `perm: {action, subject}` without the **CASL ability of the server** → `/403` — the route declares the permission required (for example: `/admin/users` asks `read User`), the guard waits for synchronization (`$perm.ready()`) and decides using the rules that the server provides. This opens the door for **sub-admins**: the seeded `subadmin` role has `read` and `update` on `User`, so it can enter the admin area and manage **ordinary** accounts, but cannot create or delete them. The `roles` field is reserved for the admin role (403; see `dev/mock/routes/users.js`), and administrator accounts may be edited only by an administrator (403 before validation — T12/EXP7: without this, a sub-admin could take over an administrator account by changing its password).

`to.matched` walks the route chain. META on an area parent covers its children, so views never validate the session themselves.

## Permissions: CASL, server-driven — data, not code

`GET /api/permissions` returns the user’s rules as JSON. `core/ability.js` builds the `casl.Ability`, and views call `this.$perm.can(action, subject, object?)`. The ability is reactive and **fail-closed**: without rules, no action is allowed.

The policy is **data**: `dev/mock/seeds/permissions.js` stores `roleRules` by role, and the mock loads them into its database at boot. Handlers reread that database **on every request**, as a real backend would read its central policy table.

- `admin` → `[ { action: 'manage', subject: 'Post' } ]` — everything, without conditions.
- `user` → read + create always; update/delete with the **rule owner**:
  `{ action: 'update', subject: 'Post', conditions: { authorId: '${user.id}' } }`.

The owner rule, explained:

- rule **without** `conditions` applies to every object of the subject; **with** `conditions`, it applies only to matching objects — “only posts whose `authorId` is mine”.
- **by id, not by username**: the id is stable and immutable; the username may be renamed (see `/api/profile`). It is not part of the policy because the policy references `authorId`. Each post stores both `author` (display name) and `authorId` (used by the policy and assigned on creation by `crud.js`).
- `'${user.id}'` is the **placeholder**: the mock resolves it from the session before responding (`materializeRules()` in `dev/mock/helpers.js`, which accepts any `user.*` field). Each user receives concrete rules while the seed remains generic; new accounts gain owner rules without code changes. An unknown field becomes `undefined`, so the condition never matches (fail-closed).
- Bypassing the UI changes nothing: the policy applies on the server. PUT/DELETE requests for another user’s post still return **403**, and without the `read` rule even `GET /posts` is denied. The mock builds the same CASL Ability as the client through `helpers.abilityFor`. Buttons are UX; the API is authoritative.
- **Areas versus CASL: different purposes**: routes use declarative `META.roles`, while CASL governs object actions such as `update Post #7`. Each layer stays in its proper place.
- **Navbar: the link is navigation, not policy** — `Resources` (posts and books) remains visible. A guest who clicks it is sent to login with `?redirect=`. The policy governs the resource: the table shows or hides actions with `$perm.can(...)`, while the API remains authoritative and returns 403 when required.
- **The user’s own account is self-service**: `GET/PUT /api/profile` manages the authenticated user’s account. Managing other accounts belongs to `/api/admin/users`; the `User` policy distinguishes administrators from sub-admins. Roles are never editable through the profile because that would allow self-escalation.

## Inspecting and editing the policy (admin only)

- The admin area uses its own chrome (`AdminLayout`): a navbar and **sidebar** with overview (`/admin/stats`), users (`/admin/users`), and permissions (`/admin/permissions`). The top menu has one `Admin` link, and `/admin` redirects to `/admin/users`. `UsersPanel` lists all users with their roles and role counts.
- `/admin/stats` shows `UserPermissions`: select a user to view the rules the server delivers, already materialized (`GET /api/permissions/:id`, where `:id` is the **user ID**; 403 for non-admins, 404 for an unknown ID). The list follows evaluation order and displays the `cannot` badge.
- `/admin/permissions` (`PermissionsView` + `RulesPanel`) provides CRUD for the raw policy in `/api/rules`, with placeholders intact. After each mutation, the panel resynchronizes the Ability (`$perm.sync()`), so buttons and links update without a reload.

## Rule order is effective permission (drag & drop)

In CASL, when **two rules match the same (action, subject), the last matching rule wins**. The policy therefore has a `position` field, and `RulesPanel` supports native HTML5 drag and drop. On drop it sends `PUT /rules/order` with every rule ID; the server validates the complete set and returns 422 without changing anything if an ID is missing or extra.

To make the order visible, use a denial rule: `inverted: true` (CASL’s `cannot`, shown with a red badge and a “deny (cannot)” checkbox).

```
policy for the user role (evaluation order, # ascending)
  3. update Post  conditions { authorId: '${user.id}' }   <- owner rule
  8. update Post  inverted: true                          <- cannot, without conditions
=> the eighth entry is also the last and therefore wins. The user loses update access to all posts.

the same `cannot` rule moved before the owner rule
  3. update Post  inverted: true
  4. update Post  conditions { authorId: '${user.id}' }
=> now the owner rule is last, so it wins. The user can edit their own posts again.
```

As a practical rule, a new rule is created in **last place**. Creating a `cannot` therefore denies access immediately unless it is moved. Moving it to the top weakens it because later rules can override it. Denial conditions work the same way: `cannot update Post` with `{ authorId: '${user.id}' }` denies updates only for the user’s own posts.

- Changing the policy means changing data. There are two ways to do it: the `roleRules` seed (the **initial state** loaded by the mock at startup) or the admin CRUD above. Both write to the same place, the mock database, which is read again on every request. Validation (422) and the `admin` role's auto-protection (it must never be left without rules) live in the API, not the UI. The effect is immediate on the posts routes: removing the `read Post` rule from the `user` role makes its `GET /posts` return **403** on the next request. A logged-in user's Ability is refreshed on reload or re-login, while the API never relies on the client-side copy.
