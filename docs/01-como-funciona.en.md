# 01 — How It Works

> **Navigation:** [Portuguese README](../README.md) · [README english](../README.en.md) · [Previous](00-arranque.en.md) · [Next](02-nova-pagina.en.md)

## Project tree

```text
├── index.html
├── env.js                Environment configuration; the only deployment file
├── vendor/               Production libraries
├── vendor-dev/           Development-only libraries
├── dev/
│   └── mock/             Mirage, tokens, sessions, CRUD, routes, and seeds
├── src/
│   ├── main.js           Composition: mock -> router -> permissions -> services
│   ├── app/              App.vue, router.js, guards.js, services.js, and store.js
│   ├── core/             Configuration, session, permissions, HTTP, loader, and cache
│   ├── ui/               Layouts and generic components
│   └── features/         One folder per feature; index.js is the single registry
│       ├── site/
│       ├── auth/
│       ├── content/      Posts and books
│       └── admin/
├── docs/                 Documentation, one file per topic
└── scripts/              Checks and the T01–T12 intrusion matrix
```

## Boot sequence

1. `theme-boot.js` (a synchronous classic script in `<head>`) applies the stored or
   system theme before the first paint.
2. `env.js` decides which Vue build to load (`vue.min.js` or `vue.dev.js`) and whether
   to include MirageJS, using `document.write` at its own position.
3. Deferred vendors download in parallel and execute in written order. The `main.js`
   module runs after them and completes the bootstrap in this sequence:

   ```text
   main.js
       │
       ├── theme.init()
       ├── startMirage(config)
       │   └── Intercepts XHR before the first request
       ├── createRouter(routes)
       │   └── Routes from features/index.js
       ├── ability.sync()
       │   └── First permissions load
       ├── installServices()
       ├── createStore()
       ├── load('src/app/App.vue')
       └── $mount('#app')
   ```
4. In production, set `mock: false`; the same client then sends requests to `apiBase`.

## Architectural principles

- **`core/` knows no business domain.** It does not import features. The only navigation
  edge is `core/http.js -> app/router.js` for logout; routes enter through `main.js`.
- **`app/` is the composition layer:** router, services, and store.
- **`features/` owns business behavior.** Each feature declares its route area and optional
  API module. Use `makeApi('/<path>')` for canonical CRUD (posts, books), and a custom
  `api.js` only for non-canonical domains such as admin. See [`04-falar-com-a-api.en.md`](04-falar-com-a-api.en.md).
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
