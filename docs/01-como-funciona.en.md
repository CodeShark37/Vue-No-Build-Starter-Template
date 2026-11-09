# 01 — How It Works

> **Navigation:** [Portuguese README](../README.md) · [English README](../README.en.md) · [Previous](00-arranque.en.md) · [Next](02-nova-pagina.en.md)

## Project tree

```text
index.html            shell + <script src="env.js"> + deferred vendors + src/main.js
env.js                environment configuration (apiBase, mock, vueDebug); the ONLY deployment file
vendor/               production libraries (classic scripts exposing globals) + VERSIONS.md
vendor-dev/           development-only libraries (mirage.min.js, vue.dev.js); do not deploy
dev/                  loaded only when env.mock is enabled; delete in production
  mock/
    index.js          Mirage server factory (models + seeds + route registration)
                      + database persistence across reloads (localStorage dump)
    token.js          fake-JWT codec 'mrg.<payload>.mock'
    sessions.js       session REGISTRY — authority for identity and lifecycle:
                      createSessionPair (login: access/refresh pair, same family),
                      rotateSession (refresh rotation and reuse detection),
                      revokeSession/revokeFamily (logout and demos), revokeUserSessions
                      (new password), validateSession (arbiter for EVERY request)
    helpers.js        responses, sessionOf/tokenOf (401; delegates to registry), guard (403),
                      server-side pagination, and the policy ENGINE (rulesForUser/
                      materializeRules/abilityFor — the mock’s CASL implementation)
    crud.js           registerCrud factory: five canonical resource routes with the policy
                      chain written ONCE; every seeded resource (posts, books, users) passes
                      through it, with validation and self-protection hooks
    routes/           mock API, one file per domain (auth, profile, permissions,
                      users, posts, books)
    seeds/            DATA: users, posts, books, roleRules (initial policy)
src/
  main.js             composition root: mock -> router -> permissions -> services -> store
  app/                App.vue, router.js, guards.js, services.js, and store.js
  core/               infrastructure with no business knowledge
  ui/                 generic layouts, Ui* components, and the shared DataTable
  features/           one folder per feature; index.js is the ONLY registry
    site/  auth/  content/  admin/   (content = posts + books in one area)
docs/                 documentation, one file per topic
scripts/              checks and the T01–T12 intrusion matrix
```

## Boot sequence

1. `env.js` decides which Vue build to load and whether to inject
   `vendor-dev/mirage.min.js`, using `document.write` at its own position so deferred
   scripts retain their order.
2. `main.js` calls `startMirage(config)` when enabled, then creates the router, synchronizes
   permissions, installs services, creates the store, loads `src/app/App.vue`, and mounts
   `#app`.
3. In production, set `mock: false`; the same client then sends requests to `apiBase`.

## Architectural principles

- **`core/` knows no business domain.** It does not import features. The only navigation
  edge is `core/http.js -> app/router.js` for logout; routes enter through `main.js`.
- **`app/` is the composition layer:** router, services, and store.
- **`features/` owns business behavior.** Each feature declares its route area and optional
  API module. Use `makeApi('/<path>')` for canonical CRUD (posts, books), and a custom
  `api.js` only for non-canonical domains such as admin.
- **`ui/` is generic.** A component used by one feature stays there; a component shared by
  two or more features belongs in `src/ui/`. AppNavbar and AdminLayout are documented
  exceptions because they form layout chrome; they never provide security.
- **Navigation is not authorization.** `resources` is visible to authenticated users, but
  actions are controlled by `$perm.can(...)` and enforced again by the API. The Admin link
  follows the CASL ability, so a `subadmin` can enter through `read User` without having
  the `admin` role.
- **JSDoc is part of the developer experience.** `jsconfig.json` provides IntelliSense and
  “Go to Definition” in VS Code without a build step or TypeScript.
- **`.vue` files do not import local `.js` modules.** The loader would compile a second copy
  of the module and split singletons. Access shared services through
  `this.$http`, `this.$config`, `this.$auth`, `this.$perm`, `this.$api`, and `this.$store`.
- **`load()` and `lazy()` paths are relative to the application root**, not the current route.
  Deep URLs and sub-path deployments therefore work.
- **The page transition has two levels.** The root transition changes layouts (login ⇄ app),
  while each layout transition changes its view. `prefers-reduced-motion` disables motion;
  router `scrollBehavior` restores the top while keeping back/forward positions.
- **The no-build trade-off is deliberate.** `vue2-sfc-loader.js` must be parsed on each
  load; this is the cost of compiling `.vue` files in the browser.

## Performance

- Compiled `.vue` files are cached in memory and IndexedDB when
  `config.compiledCache = true`.
- The cache key includes `config.version`. Bump it when moving or renaming a `.vue` file
  without changing its content, because compiled code contains child-component URLs.
- Each `.vue` file is fetched and compiled once per page, even when several routes import it.
