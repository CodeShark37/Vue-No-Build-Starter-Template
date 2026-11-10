# 08 — Security (OWASP Top 10, routes, and session audit)
> **Navigation:** [Portuguese README](../README.md) · [README english](../README.en.md) · [Previous](07-producao.en.md) · [Next](09-convencoes-de-rotas.en.md)

This security audit describes the template’s current **v12.18** state. An **ethical hacker**
performed each test against the running application;
the evidence is recorded as EXP1–EXP7 below. The identity and session lifecycle was also
validated with the **T01–T12 intrusion test matrix** against the mock API, using a Node harness
that exercises the real code. The audit confirms the template’s central rule: **the UI hides,
the API decides**. Since v12.12, the server-side session registry is authoritative for identity
and session lifecycle.

## Threat model for this template

The template is an SPA **without its own production backend**. In development, the “API” is
Mirage running inside the page (same origin and JavaScript context). In production, requests
go to the real API, which is outside the template. Therefore this document distinguishes
client-side defenses, development-only mock behavior, and controls required from the backend.
The audit therefore separates three layers:

| Layer | Description | Conclusion |
| --- | --- | --- |
| **Client** (`src/`) | route guards, CASL Ability, session, DataTable | Security UX, always reinforced by the API |
| **Mock** (dev/mock/) | development API substitute | a good model of a real API; it is not a secure backend (and cannot be) |
| **Real API** (future) | the deployment target configured through `env.js` | the authority; see the backend checklist in the final section |

## Exploit evidence (executed against the running app)

| # | attack | result | classification |
| --- | --- | --- | --- |
| EXP1 | token forged `mrg.<payload>.mock` (sub=1, roles=[admin], signature invented) attempted `GET /api/admin/stats` | **v12.11: HTTP 200** with the data — the mock checked format, user, and expiration, but not issuance. **v12.12: HTTP 401** — a token without a registry-issued `jti` is rejected (T02 of the matrix) | **fixed in v12.12** (registry of sessions; only exists when `mock: true`) |
| EXP2 | read the `mock-db-*` dump from localStorage | **Passwords in plaintext** (admin/admin123, …) | Dev-only by design (the demo seeds are text). It never reaches production because deployment removes `dev/`. |
| EXP3 | Spoof roles in an ordinary user’s `localStorage.user` (`roles:["admin"]`) and reload | The navigation shows **Admin** and `[admin]`, but `GET /api/admin/users` with that user’s token returns **HTTP 403** | **The API re-verifies (defense in depth works).** The spoof misleads the UI but never changes data. |
| EXP4 | Post created through the API with title `<img src=x onerror=…><b>bold</b>` | The cell renders escaped text (`payloadComoTexto: true`; no `<img>` or `<b>` elements are created) | **Not exploitable:** no `v-html` occurs in `src/` (grep: 0 occurrences); Vue escapes interpolation. |
| EXP5 | `GET /api/posts?per_page=9999&sort=1%3D1&order=ASC` | `META.perPage` **is clamped to 50**; sort unknown falls back to the `defaultSort`; order invalid falls back to the default | **not exploitable**: whitelist `allowedSorts` + clamp `maxPerPage` on the server |
| EXP6 | `POST /api/refresh` with a token that expired 60 seconds ago | **v12.11: HTTP 200** + a new token, indefinitely. **v12.12**: renewal occurs only when the session exists in the registry and has not been revoked; refresh also rotates the jti (the old token expires) | **fixed in v12.12** (rotation + registry; T03 of the matrix) |
| EXP7 | A sub-admin (with `update User` but not the admin role) sends `PUT /api/admin/users/1` for the ADMIN account and changes the name and **password** | **v12.15: HTTP 200** — escalation protection covered only `roles`; the sub-admin could set a password and take over the target’s account. **v12.16: HTTP 403** — accounts with the admin role may be edited only by an administrator, before validation | **Fixed in v12.16** (`users.js` `validateUpdate`; T12 of the matrix) |

## OWASP Top 10 (2021), item by item

### A01 — Broken Access Control

**Positive findings (demonstrated by EXP3 and EXP5):**
- All mock reads and writes use the single `registerCrud` chain
  (`dev/mock/crud.js`): guard 401/403 → CASL policy at the type level → instance-level
  conditions → 404 → 422. PUT and DELETE on another user’s post return 403 even when the UI is bypassed.
- `PUT /profile` is **self-scoped by design**: it always writes to the current
  session and ignores any `id` in the request body; there is no route for editing another user.
- allowlists prevent mass assignment: `editable: ['title','body']` in the posts
  (authorship is never editable), `['title','author']` in the books (`creatorId` never),
  `['name','password','roles']` in the users (only by an admin, with self-lockout: the
  admin not changes the own roles or delete their own account — 422).
- **target administrator account (v12.16)**: an account with the admin ROLE only when edited by the
  admin ROLE — 403 before validation. The same applies to anyone who only has the `update User`
  rule (EXP7/T12: without this check, a sub-admin could take over an administrator account by
  changing its password).
- `/api/admin/stats` and `/api/rules` require role `admin` on the server
  (`guard {admin:true}`), re-verified in each route. `/api/admin/users` is
  governed by the CASL policy for the `User` subject: `subadmin` can read and edit
  ordinary accounts, but cannot create or delete users, change roles, or edit administrator accounts.
- Policy is data: deleting a role’s `read Post` rule blocks that role’s `GET
  /posts` request immediately (the database is read on every request; failure is closed
  without the CASL library).
- client: single META-driven guard (`requiresAuth`/`roles`/`guest`), `403` without
  logout, catch-all last. EXP3 proved that bypassing the UI changes nothing.
- `conditions` of the CASL rules are validated (only plain objects with values
  primitives), so injected prototypes and expressions are rejected. Placeholders accept only
  `${user.<field>}` (regex `\w+`) and are materialized from the current session user.

**Limitations (documented mock design):**
- **EXP1 fixed in v12.12**: the server trusts only what it issues — the token
  references the session in the registry (`sessions.js`) and the payload contains the hash recorded
  at issuance. Forged or tampered tokens return 401. In a real backend, the token is signed
  (HS256/RS256) and verified against the session or denylist.
- The client guard reads `$auth.user` from localStorage, which is spoofable; this is a UX
  limitation by design. The API makes the decision, as EXP3 demonstrates.

### A02 — Cryptographic Failures

- Plaintext passwords in the mock (seeds + database + dump localStorage, EXP2): acceptable
  development only; [`07-producao.en.md`](07-producao.en.md) requires deleting `dev/` in the deployment. The backend
  real uses argon2id/bcrypt with salt.
- `publicUser()` is the only user-output formatter; passwords are never returned by any route
  (lists, details, login, refresh, or profile).
- FNV-1a in the dump signature and **hashPayload (FNV-1a+DJB2)** for token integrity are
  explicitly non-cryptographic. They detect changes (stale dumps or tampered payloads) but do not
  prevent deliberate 64-bit collisions. The code comment states this; the real signature belongs
  to the backend (HS256/RS256).
- No secrets are stored in client code. The client has no API keys; all sensitive material belongs
  to the real backend.
- Transport: production requires HTTPS and HSTS (see [`07-producao.en.md`](07-producao.en.md)); the token is sent in the
  `Authorization` header on every request.

### A03 — Injection

- **XSS (proof EXP4)**: zero `v-html`/`innerHTML`/`eval` in the application code
  (verified by grep); Vue 2 escapes every interpolation `{{ }}`; the slots of the
  DataTable renders components, not raw HTML.
- **Structural concern (inherent to the no-build architecture):** vue2-sfc-loader compiles
  `.vue` files in the browser with `new Function`. A CSP without `'unsafe-eval'` prevents the
  application from starting. Templates must therefore come from same-origin deployment files,
  the CSP must include `script-src 'self' 'unsafe-eval'`, and the server must not serve executable
  user-uploaded content.
- **Sort injection:** `?sort=` falls back to the `allowedSorts` whitelist (EXP5); `per_page` is
  clamped to `maxPerPage` (50); and `page` is normalized with `Math.max(1, …)`.
- **JSON:** request bodies use `JSON.parse`; invalid input is handled by `parseBody` as `{}`.
  Responses are never evaluated as code.
- **Prototype pollution:** `conditionsInvalid()` rejects objects whose values are not primitives;
  an object containing `__proto__` returns 422. Primitive values cannot change prototypes, and
  JSON.parse creates an own property instead of invoking a setter.

### A04 — Insecure Design

- Fail closed everywhere: without Ability (`null`) → no action; without rules
  for the role → zero permissions; without the CASL library in the mock → 403.
- 401 ≠ 403 with strict semantics: 401 ("no session") triggers refresh or logout;
  403 ("without permission") never clears the session or navigates — avoids the classic
  logout-loop.
- Policy integrity protections are automatic: `PUT /rules/order` requires every ID (422 if an ID is
  missing, extra, or duplicated, so a malformed drag cannot lose rules); the last rule for the admin
  role cannot be removed.
- Development and production are separated by one file (`env.js`) and removable folders
  (`dev/`, `vendor-dev/`). Following the checklist prevents the mock from reaching deployment.

### A05 — Security Misconfiguration

- **Fixed in v12.11:**
  - `withCredentials: false` in `core/http.js` (previously `true`; that would send cookies
    automatically to the real API and unnecessarily expand the CSRF surface; the app authenticates with Bearer).
  - Login no longer pre-fills `admin/admin123` or shows the demo hint outside
    localhost/mock.
  - buttons "simulate expired/revoked" (SessionPanel) only exist in
    `config.debug` and call the endpoints `/api/__demo/expire|revoke`
    (404 otherwise debug) — the client never rewrites tokens: the old
    `$auth.demo*()` that rewrote the session real were removed from the code.
- Vue devtools are enabled only in `config.debug` (this was already correct).
- **Security headers are not provided by default** (CSP, nosniff, X-Frame-Options,
  Referrer-Policy); the static server must send them. Configuration is documented
  in [`07-producao.en.md`](07-producao.en.md). Note that CSP requires `'unsafe-eval'` (see A03).
- The example `env.js` uses `http://localhost/api/`; the real API must use
  HTTPS. An HTTPS page calling an HTTP API is blocked as mixed content by the browser.

### A06 — Vulnerable and Outdated Components

- **Fixed in v12.11: axios 1.6.0 → 1.21.0.** Version 1.6.0 was in the affected
  range for **CVE-2025-27152** (SSRF/credential leakage through an absolute URL
  that ignores `baseURL`; fixed in 1.8.2). The attack path is narrow in this template
  because user input is never passed as an absolute Axios URL, but outdated vendored
  dependencies still accumulate risk. (The earlier CVE-2023-45857 issue was already
  fixed in 1.6.0.)
- Vue 2.6.12: **EOL since 31/12/2023**, with no security patches.
  Keeping it is a conscious template decision because of the no-build architecture and
  `vue2-sfc-loader`. Alternatives are 2.7.16 (also EOL), commercial NES support, or
  migration to Vue 3. There is no known exploitable CVE in Vue 2.6.12 for this architecture;
  the risk is abandonment, not a known exploit.
- vue-router 3.0.0 (2018) and vue-head 2.2.0 (abandoned): no known CVE;
  update them in the next maintenance pass (vue-router 3.6.8 is the final v3 release)
  and replace vue-head with minimal custom title management.
- MirageJS 0.1.48: last release of the line 0.1.x — only dev, never in production.
- Integrity process: [`vendor/VERSIONS.md`](../vendor/VERSIONS.md) with origin + SHA-256 of all
  vendored libraries (verification by `sha256sum`) — a strong pattern for
  templates vendored.

### A07 — Identification and Authentication Failures

- Login always returns `invalid_credentials` generic (without listing accounts).
- `autocomplete="username"`/`"current-password"` correct; new password uses
  `autocomplete="new-password"` (ProfileView).
- token mock: access TTL short (120s) + refresh (7 days), single-flight in the interceptor (the only
  POST /refresh for N requests parallel; retry single by request).
- **Fixed in v12.12 (the server is authoritative for sessions):**
  - Registry of sessions (`dev/mock/sessions.js`): only ISSUED sessions open the
    API — forged or tampered tokens return 401 (EXP1/T01/T02 closed).
  - Logout revokes the session (T04), and changing the password revokes all sessions
    of the user (T05, `PUT /profile` and `PUT /admin/users/:id` through hook
    `afterUpdate`).
  - Refresh with rotation: only an issued, non-revoked session renews; the old jti
    is revoked (T03, EXP6 closed — and reusing a refresh token locks out the owner).
  - `role`/`sub`/`exp` in the payload are for UX only; the client decides nothing.
    Roles come from the database on every request, while validity comes from the registry.
- **remaining mock limitations (responsibility of the real backend):** without rate
  limiting/lockout in the `/login`; minimum password of 4 and in plaintext (A02); without MFA.
- demo credentials are not suggested outside development (v12.11).
- Logout has been **server-side** since v12.12 (revocation); the client clears its local
  session at the same time. `POST /logout` tolerates an already-revoked token.

### A08 — Software and Data Integrity Failures

- Vendors with SHA-256 manifest (VERSIONS.md) — verifies each clone/deployment.
- The mock dump is signed using the seeds (changing a seed rejects the dump and
  triggers reseeding; stale state cannot hide changes) — development integrity.
- The permission policy is data read on every request, not copied into client code;
  client-side permission state can therefore become stale.
- `PUT /rules/order` with verification of set complete (422 for a mismatched set) —
  atomic reordering.

### A09 — Security Logging and Monitoring Failures

- Dev: clear diagnostic console (`[mirage]`, `[boot]`, `window.__bootStep`,
  error visible in the shell of startup) — adequate for the template.
- The mock does not audit-log administrator actions (policy changes or user CRUD).
  The real backend must record who changed the policy, when, and the old and new values;
  this is included in the backend checklist.
- There are no client-side security logs in production (correctly: the console is not a
  secure log); the real backend must log 401/403/422 with context.

### A10 — Server-Side Request Forgery (SSRF)

- not applicable to the client: the app does not receive user-supplied URLs for fetch; the loader
  only loads paths declared in code (features/index.js, routes) the start
  of the root of the app (`config.root`), same-origin.
- the API mock makes no outbound requests. (the CVE-2025-27152 of the axios old was
  SSRF by absolute URL — deleted by the update v12.11.)

## Route security and retry behavior

**client (UX):**
1. Each feature declares requirements on its area parent (`META.requiresAuth`,
   `META.roles`, `META.guest`) — the children inherit by the chain `to.matched`.
2. The global guard (`app/guards.js`) evaluates: 401 → `/login?redirect=…`
   (and stores the destination); a guest with a session → `/`; insufficient roles → `/403` without
   logout.
3. Login uses `router.push` for `?redirect=` (internal SPA navigation). External origins are
   not accepted, and `push` never assigns `location.href`.
4. The catch-all `*` is always last (`features/index.js` ensures by code).

**Mock/API (authority):**
1. All protected routes use `guard()` (401) + `guardOpts {admin:true}`
   when the route is administrative (403); the checks are defined once and reused.
2. CASL policy is applied on every request: type-level checks return 403 without a rule,
   and instance conditions filter lists or deny individual records.
3. The canonical error order is 401 → 403 → 404 → 422 (never hide a 403 behind a 404).
4. `registerCrud` is the single CRUD path; the policy chain is not rewritten per resource.

## Security of session (current state and limitations)

| Aspecto | template state | security note |
| --- | --- | --- |
| Storage | Access token, refresh token, and profile in `localStorage` (only `core/session.js` accesses them; the refresh token is sent only to `POST /refresh`) | readable by any XSS. In production, use `httpOnly; Secure; SameSite` cookies or short-TTL `sessionStorage`, according to the backend |
| Issuance | `POST /login` → **new access/refresh pair in the registry** (`sessions.js`, same `family`) whose tokens reference them by `jti` | the server trusts only what it issues; a real backend uses a signed JWT and server-side verification |
| Credential types | **access** (short, all the requests) and **refresh** (long, only `/refresh`) — the types must not be mixed on any route (`validateSession` expectType; omission = access) | Refresh used in an route common = 401; access in the `/refresh` = 401 (T03) |
| Payload integrity | hash recorded in the Issuance (`hashPayload`); any byte changed = 401 | T01/T09: adulterar roles/sub/exp not changes nothing — 401 |
| Expiration | Access 120s; refresh 7 days (`refreshTtl`); actual validity lives in the registry and uses the server clock; the client calculates access `exp` only for UX | `isExpired()` is a UX indicator; the server always makes the decision (401) |
| Renewal | Interceptor: 401 → `POST /refresh` with the REFRESH token, single-flight → retries the request with the new access token; failure → logout + redirect | pair rotation — the old refresh token and the family access token are revoked; reuse the refresh already rotated kills the entire family (detection of theft, T03) |
| Revocation | **Implemented:** logout revokes the family (access + refresh together, T04); change of password revokes all the sessions of the user (T05); the registry remains the denylist in the registry | unlike the previous stateless behavior (EXP6); now the lifecycle is server-controlled |
| Account deletion | Deleting a user invalidates the token on the next request (`userById` failure → 401 → refresh failure → logout); the user’s sessions remain revoked | This behavior is demonstrated by the mock |
| Fixation | Login always issues a new session (jti new, without reuse) | OK |
| Spoof of profile | `localStorage.user` spoofable (EXP3) — UI misleads, API not | by design; “the UI hides, the API decides” is the security boundary |

## intrusion test matrix T01–T12

Before each change, the identity/session lifecycle was measured with the intrusion
matrix against the real code (a Node harness that exercises `dev/mock/`, loads the
vendored CASL library, and builds Mirage/schema stubs).

**Run the matrix** from the template root; it is part of the contract —
run after each change in `dev/mock/` or `src/core/`, must remain 12/12):

```bash
node scripts/intrusion-matrix.mjs
```

It requires only Node >= 18; it does not start a server or browser. The harness copies
`dev/mock/` to a temporary directory, stubs Mirage/schema, and sends requests directly to
the real handlers (the same logic that Mirage executes in the page).

**Baseline (v12.11, before the fix): 5/10 passed.** Authorization was server-side (T06–T10),
but identity and session lifecycle were not (T01–T05): the token itself was treated as the
credential, and the mock did not maintain session state.

| id | Test | Acceptance criterion | Baseline v12.11 | current state |
| --- | --- | --- | --- | --- |
| T01 | tampered token (elevated roles / extended exp) | 401 | **failure** — 200 (payload accepted without issuance) | **passes** — 401 (payload hash recorded at issuance) |
| T02 | token with an administrator’s ID (forged from scratch) | 401 | **failure** — 200 (ADMIN granted by forged token) | **passes** — 401 (jti not issued) |
| T03 | Refresh: access/refresh pair, rotation, and reuse | forged or wrong-type token → 401 · real expired token renews · reuse revokes the family | **failure** — 200 (a new admin session was issued from the forged token) | **passes** — forged token 401 · access token on `/refresh` 401 · refresh token on a normal route 401 · real token renews with pair rotation · reuse of a rotated refresh token revokes the family |
| T04 | old token after logout | 401 (access and refresh) | **failure** — 200 (logout was stateless) | **passes** — both return 401 (family revoked) |
| T05 | old token after password change | 401 | **failure** — 200 (own account and admin update) | **passes** — 401 (all sessions revoked) |
| T06 | Invalid login with an existing session | does not start refresh; the existing session remains intact | passes (`canRefresh` excludes login/refresh) | passes (same validation) |
| T07 | administrative API with insufficient role | 403 | passes (guard `{admin:true}`) | passes (the same validation) |
| T08 | Redirect external after login | never sign out of the origin | passes (code review: `router.push` never does `location.href`; pushState cross-origin is blocked by the browser; destination strange falls back to the catch-all `*`) | passes (the same validation) |
| T09 | elevated roles in the token or localStorage | no API access (401/403) | passes — 403 (roles come from the database) | passes — 401 (tampering detected by the hash) |
| T10 | changing the ID for someone else’s resource | 403/404 + body ignored | passes (owner rule + allowlists + self-scoped profile) | passes (same validation) |
| T11 | Sub-admin: policy governs the `User` resource | read/update 200 · create/delete 403 · roles 403 · stats/rules 403 · ordinary user 403 | — (did not exist) | **passes** — `User` is enforced by the factory; the `roles` field is reserved for the admin role |
| T12 | target administrator account edited by someone without the admin role | 403/403 · record intact · admin edits admin 200 · sub-admin edits ordinary user 200 | — (did not exist; **v12.15 returned 200** — credential escalation, EXP7) | **passes** — 403 before validation (`users.js` validateUpdate) |

**Current result: 12/12 passed.** T08 was verified by code review because it concerns client-side
navigation; the remaining tests run server-side in the harness. T11 (policy-controlled sub-admin)
and T12 (administrator-account protection) were added as the surface grew.

The matrix closed the following gaps:

1. **Identity** — the token is no longer the credential by itself; its reference (`jti`)
   identifies a registry session (`dev/mock/sessions.js`). A token not created by login or refresh has no valid `jti`; changing its payload breaks the issuance hash
   (`hashPayload` in `token.js`). Identity comes from `session.userId` in the registry, never from `payload.sub`.
2. **Lifecycle** — login issues a session; refresh rotates it (revokes the old jti
   and issues another); logout revokes it; a password change revokes all sessions
   for the user (`PUT /profile` and `PUT /admin/users/:id`, through the
   `afterUpdate` hook in `crud.js`).
3. **Single validation** — `sessions.validateSession()` is the arbiter for every
   request (format → jti issued? → revoked? → payload intact? → expired?).
   `helpers.js` calls it through `sessionOf()`; no route validates sessions independently.
   Expiration follows the registry’s server clock, not the payload.
4. **Consistent demos** — the `POST /api/__demo/expire|revoke` endpoints (debug only)
   change session state on the server; the `$auth.demo*()` methods that rewrote the
   token on the client were removed (they were the only way the client could forge
   the session).

## Checklist of the real backend (that the template cannot give)

1. **Tokens:** verify the signature on the server (HS256/RS256); `sub`/`roles`
   trust payload roles only after verification; TTL short.
2. **Separate refresh token** from the access token, with rotation and revocation
   (denylist by jti or session version per user); logout revokes it. *(The mock
   already demonstrates the complete cycle: access/refresh pair with separate TTLs,
   rotation, family revocation, and reuse detection.)*
3. **Passwords**: argon2id/bcrypt + salt; a real password policy (length and Have I Been Pwned checks); rate limiting + progressive lockout in `/login`; MFA where
   appropriate.
4. **Authorization**: replicate the `registerCrud` chain (401 → 403 role → 403
   policy → 404 → 422) and enforce `editable` allowlists per resource; never
   trust authorship or role fields supplied in the request body.
5. **Audit log** of actions admin (policy of permissions, users) and of
   401/403/422 by IP/user.
6. **Transport**: HTTPS + HSTS; headers [`07-producao.en.md`](07-producao.en.md); CORS minimal (if the app and API use different origins: origin exact, without wildcard, with
   credentials only when strictly required).
7. **Cookies** (if used for session): `httpOnly; Secure; SameSite=Lax` (or
   Strict) + an anti-forgery token in forms and requests.
8. **dependencies**: keep the process [`VERSIONS.md`](../vendor/VERSIONS.md) (replace file +
   SHA-256 at the same time commit) and review CVEs for every library update.
