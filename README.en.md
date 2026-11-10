<div align="center">

# Vue No-Build Starter Template

[Português](README.md) · **English**

<div align="center">

 [![Made with love in Angola](https://madewithlove.now.sh/ao?heart=true&template=for-the-badge)](#)

</div>

![Language](https://img.shields.io/badge/language-JavaScript-f7df1e?logo=javascript&logoColor=black)
![Version](https://img.shields.io/badge/version-v12.27-blue)
[![Release](https://img.shields.io/github/v/release/CodeShark37/Vue-No-Build-Starter-Template?label=release)](https://github.com/CodeShark37/Vue-No-Build-Starter-Template/releases)

**Author:** [Josué André](https://github.com/CodeShark37)

</div>

> [!NOTE]
> A Vue 2 starter without a build step: serve the folder over HTTP, open `index.html`,
> and explore sessions, permissions, CRUD, and routes with the MirageJS mock API.

## Table of Contents

- [What is this template?](#what-is-this-template)
- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Structure](#structure)
- [Documentation](#documentation)
- [Dependencies](#dependencies)
- [Showcase](#showcase)
- [Contributing](#contributing)

## What is this template?

A starter for **Vue 2.x** applications with Single File Components (`.vue`) loaded
directly in the browser. **There is no build step, Vue CLI, or Node.js requirement for
serving the application**: production vendors live in `vendor/`, and native ES modules
live in `src/`.

## Features

- server-authoritative sessions with an access/refresh pair, rotation, reuse detection,
  and family revocation;
- automatic single-flight refresh;
- server-driven RBAC/ABAC with CASL and an editable, reorderable policy;
- a seeded CRUD factory in the mock API for every seeded resource;
- a Profile route, route guards, and feature-based layouts;
- a light/dark theme with CSS tokens (Slate/Navy spec), a sticky navbar with toggle, persistence, and OS-following;
- a complete MirageJS mock API;
- `ui/DataTable.vue`, a generic table with sorting, pagination, inline editing, numeric
  columns, slots, and aggregates;
- the T01–T12 intrusion matrix and syntax checks.

## Installation

### Prerequisites

- a local HTTP server, such as VS Code Live Server or `python3 -m http.server`;
- Node.js `>=18` only for running `npm run check`.

### Clone

```bash
git clone https://github.com/CodeShark37/Vue-No-Build-Starter-Template.git
cd Vue-No-Build-Starter-Template
```

## Quick start

1. Serve the folder from the **site root**. `file://` does not work because browsers
   block `.vue` file loading.
2. Open the application in the browser.
3. Sign in with `admin / admin123` or `user / user123`. Other demo accounts are
   `editor / editor123`, `viewer / viewer123`, and `subadmin / subadmin123`.

In `history` mode, the server must fall back to `index.html`. For a sub-path, set
`<base href="/">`.

Details: [`docs/00-arranque.en.md`](docs/00-arranque.en.md) ·
[documentation portal](docs/README.en.md)

## Structure

```text
index.html  env.js    shell + vendors (defer); env.js is the ONLY deployment file
jsconfig.json          IntelliSense/JSDoc; not a build and ignored by the browser
vendor/     vendor-dev/           production libraries vs development-only mock libraries
src/
  main.js                 composition: mock -> router -> permissions -> services -> store
  app/                    App.vue, router.js, guards.js, services.js, store.js
  core/                   config, session, ability, http, loader, cache
  ui/                     layouts, Ui* components, and the shared DataTable
  features/               one folder per feature; index.js is the single registry
    site/  auth/  content/  admin/   (content = posts + books)
dev/
  mock/                   Mirage, tokens, sessions, CRUD, routes, and seeds — delete in production
docs/                     documentation, one file per topic
scripts/
  intrusion-matrix.mjs    T01–T12 matrix against the real code
  syntax-check.mjs        syntax checks for .vue/.js
```

A component used by **one feature** stays inside that feature. A component used by **two
or more features** belongs in `src/ui/`.

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/README.en.md`](docs/README.en.md) | portal and recommended path |
| [`docs/00-arranque.en.md`](docs/00-arranque.en.md) | server, debug, and demo users |
| [`docs/01-como-funciona.en.md`](docs/01-como-funciona.en.md) | tree, boot, layers, and performance |
| [`docs/02-nova-pagina.en.md`](docs/02-nova-pagina.en.md) | adding a page |
| [`docs/03-nova-feature.en.md`](docs/03-nova-feature.en.md) | feature contract and registry |
| [`docs/04-falar-com-a-api.en.md`](docs/04-falar-com-a-api.en.md) | `$api`, `$http`, and HTTP errors |
| [`docs/05-login-e-permissoes.en.md`](docs/05-login-e-permissoes.en.md) | sessions, guards, and CASL |
| [`docs/06-mock-api.en.md`](docs/06-mock-api.en.md) | MirageJS, seeds, and endpoints |
| [`docs/07-producao.en.md`](docs/07-producao.en.md) | deployment, `env.js`, and cache |
| [`docs/08-seguranca.en.md`](docs/08-seguranca.en.md) | OWASP, routes, and sessions |
| [`docs/09-convencoes-de-rotas.en.md`](docs/09-convencoes-de-rotas.en.md) | route conventions |

Every guide has a corresponding Portuguese version.

## Dependencies

- [Vue](https://github.com/vuejs/vue) `2.6.12`
- [Vue Router](https://github.com/vuejs/router) `3.0.0`
- [Vuex](https://github.com/vuejs/vuex) `3.6.2`
- [VueHead](https://github.com/ktquez/vue-head) `2.2.0`
- [vue3-sfc-loader](https://github.com/FranckFreiburger/vue3-sfc-loader) `0.9.5`
  (Vue 2 build)
- [Axios](https://github.com/axios/axios) `1.21.0`
- [CASL](https://github.com/stalniy/casl) `6.7.1`
- [MirageJS](https://github.com/miragejs/miragejs) `0.1.48`
  (development only)

Origin and SHA-256: [`vendor/VERSIONS.en.md`](vendor/VERSIONS.en.md).

## Showcase

![Login](docs/img/LoginView.png)

![Content](docs/img/PostsView.png)

![Profile](docs/img/ProfileView.png)

## Contributing

Open **issues** to propose features or send **pull requests** with improvements.
