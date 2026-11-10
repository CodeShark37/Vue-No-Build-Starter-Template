# 08 — Security (OWASP Top 10, routes, and session audit)
> **Navigation:** [Portuguese README](../README.md) · [English README](../README.en.md) · [Previous](07-producao.en.md) · [Next](09-convencoes-de-rotas.en.md)

This is the template’s current security audit. An **ethical hacker** executed the documented exploit checks against the running application. Identity and session lifecycle are validated by the **T01–T13 intrusion matrix** against the mock API using a Node harness that imports the real code. The central rule is: **the UI hides, the API decides**; the server-side session registry is authoritative.

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

## exploit evidence (executed against the running app)

| # | Attack | Result | Classification |
| --- | --- | --- | --- |
| EXP1 | Forge `mrg.<payload>.mock` and call `GET /api/admin/stats` | HTTP 401: a token without a registry-issued `jti` is rejected | Not exploitable in the mock: registry-backed identity |
| EXP2 | Read the `mock-db-*` localStorage dump | It contains only `passwordHash` values in PHC PBKDF2-HMAC-SHA256 format; plaintext exists only in provisioning and the login body | Controlled in the mock; a real backend must use argon2id/bcrypt with a random salt |
| EXP3 | Spoof roles in `localStorage.user` | The UI may show Admin, but the API returns 403 without permission | The API revalidates server-side |
| EXP4 | Put XSS markup in a post title | Text is escaped and no HTML element is created | Not exploitable: the app has no `v-html` |
| EXP5 | Send out-of-range pagination and sorting parameters | `per_page` is capped at 50 and `sort`/`order` use allowlists | Not exploitable in the mock |
| EXP6 | Refresh an expired session | Only an existing, non-revoked session renews; rotation invalidates the old pair | Not exploitable in the mock |
| EXP7 | Sub-admin edits an administrator account | HTTP 403 before shape validation | Not exploitable: administrator accounts require an administrator |
| EXP8 | Tamper with the token in localStorage | HTTP 401 `invalid_token` and immediate logout; broken credentials are never silently refreshed | Not exploitable in the mock |

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
- **target administrator account (current state)**: an account with the admin ROLE only when edited by the
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

**Mock characteristics and limits:**
- The token uses a detection hash over the complete string, not a cryptographic signature. A real backend must sign tokens (HS256/RS256) and verify them against a session or denylist.
- localStorage integrity checks trigger early local logout; the API remains authoritative and revalidates the token.
- The mock is development-only and must be removed from deployment.

### A02 — Cryptographic Failures

- Passwords: the database/dump stores ONLY `passwordHash` (PBKDF2-HMAC-SHA256,
  PHC format `algo$iter$salt$hash`, current state — `dev/mock/password.js`); the plaintext
  password exists only in the form field, the `POST /login` body and the provisioning
  script (`seeds/users.js` `demoAccounts`, the equivalent of a `.env`). Accepted mock
  limitations: synchronous PBKDF2 (Mirage handlers are synchronous — argon2id would
  need async/WASM) and a deterministic per-account salt (the seeds are signed; a random
  salt would break the dump persistence). A real backend uses argon2id/bcrypt with a
  random salt.
- `publicUser()` is the only user-output formatter; the password and its hash
  are never returned by any route (lists, details, login, refresh, or profile).
- FNV-1a in the dump signature and **hashToken (FNV-1a+DJB2)** for token integrity are
  explicitly non-cryptographic. They detect changes (stale dumps or a tampered token in
  ANY segment) but do not prevent deliberate 64-bit collisions. The code comment states
  this; the real signature belongs to the backend (HS256/RS256).
- No secrets are stored in client code. The client has no API keys; all sensitive material belongs
  to the real backend.
- Transport: production requires HTTPS and HSTS (`docs/07`); the token is sent in the
  `Authorization` header on every request.

### A03 — Injection

- **XSS (proof EXP4)**: zero `v-html`/`innerHTML`/`eval` in the application code
  (verified by grep); Vue 2 escapes every interpolation `{{ }}`; the slots of the
  DataTable renders components, not raw HTML.- **Structural concern (inherent to the no-build architecture):** vue2-sfc-loader compiles
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

- **Fixed in earlier state:**
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
  in `docs/07`. Note that CSP requires `'unsafe-eval'` (see A03).
- The example `env.js` uses `http://localhost/api/`; the real API must use
  HTTPS. An HTTPS page calling an HTTP API is blocked as mixed content by the browser.

### A06 — Vulnerable and Outdated Components

- **Fixed in earlier state: axios 1.6.0 → 1.21.0.** Version 1.6.0 was in the affected
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
- Integrity process: `vendor/VERSIONS.md` with origin + SHA-256 of all
  vendored libraries (verification by `sha256sum`) — a strong pattern for
  templates vendored.

### A07 — Identification and Authentication Failures

- Login always returns `invalid_credentials` generic (without listing accounts).
- `autocomplete="username"`/`"current-password"` correct; new password uses
  `autocomplete="new-password"` (ProfileView).
- token mock: access TTL short (120s) + refresh (7 days), single-flight in the interceptor (the only
  POST /refresh for N requests parallel; retry single by request).
- **Fixed in earlier state (the server is authoritative for sessions):**
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
- demo credentials are not suggested outside development (earlier state).
- Logout has been **server-side** since earlier state (revocation); the client clears its local
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
  SSRF by absolute URL — deleted by the update earlier state.)

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
3. Error order PER OPERATION (details in A01): LIST 401 → 403 → 200;
   DETAIL/PUT/DELETE 401 → 404 → 403 → 422; POST 401 → 403 → 422. An instance
   403 reveals the record exists — a deliberate contract decision.
4. `registerCrud` is the single CRUD path; the policy chain is not rewritten per resource.

## Security of session (current state and limitations)

| Aspecto | template state | security note |
| --- | --- | --- |
| Storage | Access token, refresh token, and profile in `localStorage` (only `core/session.js` accesses them; the refresh token is sent only to `POST /refresh`) | readable by any XSS. In production, use `httpOnly; Secure; SameSite` cookies or short-TTL `sessionStorage`, according to the backend |
| Issuance | `POST /login` → **new access/refresh pair in the registry** (`sessions.js`, same `family`) whose tokens reference them by `jti` | the server trusts only what it issues; a real backend uses a signed JWT and server-side verification |
| Credential types | **access** (short, all the requests) and **refresh** (long, only `/refresh`) — the types must not be mixed on any route (`validateSession` expectType; omission = access) | Refresh used in an route common = 401; access in the `/refresh` = 401 (T03) |
| Token integrity | hash of the COMPLETE token recorded at issuance (`hashToken`, current state); any byte changed, payload OR wrapper, = 401 | T01/T09/T13: altering roles/sub/exp, changing the `.mock` suffix or re-encoding the b64 changes nothing — 401 `invalid_token` |
| Expiration | Access 120s; refresh 7 days (`refreshTtl`); actual validity lives in the registry and uses the server clock; the client calculates access `exp` only for UX | `isExpired()` is a UX indicator; the server always makes the decision (401) |
| Renewal | Interceptor: 401 `token_expired` → `POST /refresh` with the REFRESH token, single-flight → retries the request with the new access token; failure → logout + redirect. **401 `invalid_token` does NOT trigger refresh: immediate logout** (fail-closed, current state — EXP8) | pair rotation — the old refresh token and the family access tokens are revoked; reusing a rotated refresh token kills the entire family (theft detection, T03); a BROKEN credential (tampered/forged/revoked) logs out instead of being “healed” |
| Revocation | **Implemented:** logout revokes the family (access + refresh together, T04); change of password revokes all the sessions of the user (T05); the registry remains the denylist in the registry | the lifecycle is server-controlled |
| Account deletion | Deleting a user invalidates the token on the next request (`userById` failure → 401 `invalid_token` → immediate client logout); the user’s sessions remain revoked | This behavior is demonstrated by the mock |
| Fixation | Login always issues a new session (jti new, without reuse) | OK |
| Spoof of profile | `localStorage.user` spoofable (EXP3) — UI misleads, API not | by design; “the UI hides, the API decides” is the security boundary |

## Intrusion test matrix T01–T13

| ID | Test | Acceptance criterion | Current state |
| --- | --- | --- | --- |
| T01 | Tampered token (elevated roles / extended exp) | 401 | PASS — complete-token hash |
| T02 | Forged administrator ID | 401 | PASS — unissued `jti` |
| T03 | Refresh, rotation, and reuse | forged/wrong type 401; expired renews; reuse revokes family | PASS |
| T04 | Old token after logout | 401 for access and refresh | PASS — family revoked |
| T05 | Old token after password change | 401 | PASS — all sessions revoked |
| T06 | Invalid login with an existing session | existing session remains intact | PASS |
| T07 | Administrative API with insufficient role | 403 | PASS |
| T08 | External redirect after login | never leave the origin | PASS by code review |
| T09 | Elevated roles in token/localStorage | no API access | PASS — 401 |
| T10 | Changing another resource’s ID | 403/404 and body ignored | PASS |
| T11 | Sub-admin access to `User` | policy allows read/update only; no create/delete/role changes | PASS |
| T12 | Administrator account edited by non-admin | 403 and record intact | PASS |
| T13 | Token wrapper tampering | 401 `invalid_token` | PASS — complete-token hash |

**Current result: 13/13 passed.** T08 is validated by code review; the remaining tests execute the real mock code in the Node harness.

The matrix confirms that identity comes from `session.userId` in the registry, expiry is decided by the server clock, rotation and revocation are server-side, and `401 invalid_token` never triggers refresh.

## Checklist of the real backend

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
6. **Transport**: HTTPS + HSTS; headers `docs/07`; CORS minimal (if the app and API use different origins: origin exact, without wildcard, with
   credentials only when strictly required).
7. **Cookies** (if used for session): `httpOnly; Secure; SameSite=Lax` (or
   Strict) + an anti-forgery token in forms and requests.
8. **dependencies**: keep the process `VERSIONS.md` (replace file +
   SHA-256 at the same time commit) and review CVEs for every library update.
