# 02 — New page (in an existing feature)
> **Navigation:** [Portuguese README](../README.md) · [English README](../README.en.md) · [Previous](01-como-funciona.en.md) · [Next](03-nova-feature.en.md)

To add a page to an existing domain, work only in that feature’s folder.

## Steps

1. Create the view at `src/features/<feature>/XView.vue`. Keep the view thin: state and calls
   through `this.$api.<feature>`; put presentation in components and reuse existing components
   before writing new markup.
2. Register it as a child of the correct area in `src/features/<feature>/index.js`:

```js
children: [
    { path: 'posts', name: 'ContentPosts', component: lazy('src/features/content/PostsView.vue') },
    { path: 'arquivo', name: 'ContentArquivo', component: lazy('src/features/content/ArchiveView.vue') }, // new
],
```

## Why this is enough

- **Parent metadata covers children:** the guard walks `to.matched`, so a page under `/content`
  or `/admin` does not need its own metadata. The exception is `META: { guest: true }` for
  guest-only pages such as login.
- **Views load on demand:** each view is requested and compiled only when visited (`lazy()`), and
  the URL in the table remains relative to the area.
- **Page title:** views use `vue-head` with `head: { title: { inner, separator, complement } }`.
- **Route names:** use PascalCase with the area prefix (`ContentPosts`, `AdminUsers`); see the
  complete convention in `09-convencoes-de-rotas.en.md`.

## Golden rules

- Keep the **catch-all `*`** (404) last in the route table. It is the site fallback and is
  appended last in `features/index.js`; never add routes after it.
- A component used by **one feature** stays in that feature. A component used by **two or more**
  features belongs in `src/ui/` (see `01-como-funciona.en.md`).
- Do not implement authorization by hand: use `this.$auth.isLoggedIn()` and
  `this.$perm.can(action, subject, object?)` as appropriate; see `05-login-e-permissoes.en.md`.
