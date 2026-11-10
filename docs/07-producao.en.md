# 07 — Production
> **Navigation:** [Portuguese README](../README.md) · [English README](../README.en.md) · [Previous](06-mock-api.en.md) · [Next](08-seguranca.en.md)


## The only file to change: `env.js`

```js
window.ENV = {
    apiBase: 'http://localhost/api/',  // point to the real API ('' or '/api/' = same origin)
    mock: false,                       // without Mirage: requests go to apiBase
    vueDebug: false,                   // vendor/vue.min.js (not the development build)
};
```

`env.js` is the classic script that runs before the vendors. It injects `vue.min.js` (or
`vue.dev.js`) and `vendor-dev/mirage.min.js` with `document.write` at its own position,
which preserves the `defer` ordering. `src/core/config.js` reads `window.ENV` and derives
the remaining settings (root, cache, and auth). No other file needs to change for deployment.

## What to delete (or not copy) into the deployment

```
vendor-dev/   mirage.min.js + vue.dev.js   (development only)
dev/          complete mock server        (development only)
```

With `mock: false`, `env.js` does not inject the Mirage script. Still, not copying these
directories is the physical safeguard and the only way to keep `index.html` identical
between development and production.

`package.json` records upstream provenance; it is not an installation manifest for the
application. It is not required on the server, and `npm install` is not part of deployment.

## Library provenance: [`vendor/VERSIONS.md`](../vendor/VERSIONS.md)

Every vendored library has the recorded origin and SHA-256 hash. Verify the files after
downloading or cloning:

```bash
sha256sum vendor/*.js vendor-dev/*.js
```

To update a library, replace the file and update its corresponding line in [`VERSIONS.md`](../vendor/VERSIONS.md)
in the same commit.

## Compilation cache: the bump rule

The IndexedDB cache uses `version: '11'` in `src/core/config.js`. Editing the `.vue` file
invalidates that file’s entry because its key is the content hash. **Moving or renaming the
`.vue` file without changing its content requires the manual version bump**: compiled code
contains the embedded absolute URLs of child components and would otherwise request paths
that no longer exist. When in doubt, increase `version`.

## Router and sub-paths

- `routerMode: 'history'` requires an `index.html` fallback for unknown paths. `hash`
  mode works with any static server.
- When served from the sub-path, set `<base href="/sub-path/">` in `index.html`. The loader
  and router resolve the rest through `config.root`.

## Deployment checklist

1. Set the real `apiBase`, `mock: false`, and `vueDebug: false` in `env.js`.
2. Do not copy `vendor-dev/` or `dev/`.
3. Verify [`VERSIONS.md`](../vendor/VERSIONS.md) with `sha256sum`.
4. Bump `config.version` if any `.vue` file was moved or renamed since the previous deployment.
5. Enable the `history` fallback on the server, or use `routerMode: 'hash'`.
6. **Security** (see [`08-seguranca.en.md`](08-seguranca.en.md)):
   - provides over **HTTPS** with HSTS enabled. The token is sent in the `Authorization` header.
   - Send `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
     `Referrer-Policy: strict-origin-when-cross-origin`, and the CSP. The CSP must include
     `script-src 'self' 'unsafe-eval'`: vue2-sfc-loader compiles `.vue` files in the browser
     with `new Function`. Without `'unsafe-eval'`, this in this no-build architecture cannot start.
   - Confirm that `mock: false` is set and that `dev/` and `vendor-dev/` are absent from the
     server; those directories contain demo passwords in plaintext.
   - The login form no longer suggests demo credentials outside localhost. If the real API
     uses session cookies, enable `withCredentials` in `core/http.js` and require CSRF
     protection in the backend.
