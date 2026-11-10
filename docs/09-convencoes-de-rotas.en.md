# 09 — Route conventions: areas, META, and names
> **Navigation:** [Portuguese README](../README.md) · [README english](../README.en.md) · [Previous](08-seguranca.en.md)

This convention organizes the template’s areas, route metadata, and route names. Its goal is to
keep authorization centralized, avoid collisions, and let features grow without scattering
configuration.

## 1. Current inventory

| area | Path | Layout | Parent META | children |
| --- | --- | --- | --- | --- |
| site | `/` | LayoutDefault | — (public) | Home, 403; catch-all `*` (404) |
| auth | `/login` | LayoutAuth | `guest` | Login |
| auth | `/profile` | LayoutDefault | `requiresAuth` | Profile |
| content | `/content` | **ContentLayout** | `requiresAuth` | posts, books (`''` → posts) |
| admin | `/admin` | AdminLayout | `requiresAuth` | users (`perm`), stats (`roles`), permissions (`roles`); `''` → users |

## 2. Evaluation criteria

- **C1 — Localized knowledge:** the entire area must be readable in one place (the feature’s
  `index.js`), without searching for META across files.
- **C2 — Collisions and order:** paths never collide, and no rule depends on registration order
  except the catch-all `*`, which is always last.
- **C3 — Inherited META:** `requiresAuth`, `roles`, and `perm` on the parent cover children
  through `to.matched`; never repeat META on every child. For `roles` the inheritance is
  restrictive: every level that declares `roles` must be satisfied (AND across levels;
  a level’s array is an OR of alternatives) — the child tightens, never loosens.
- **C4 — URL stability:** current paths are explicit and stable, with one declaration point
  for each area.
- **C5 — Addition cost:** a new page is one child in an existing area; a new domain is one new
  feature (folder plus one registration in `features/index.js`).
- **C6 — Readability:** the URL describes the area and resource; avoid abbreviations.

## 3. Options considered

| option | description | C1 | C2 | C3 | C4 | C5 | C6 | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A. Separate parents per feature** | posts and books each declared their own parent | medium (META scattered across two `index.js` files) | risk of child collisions and duplicate parents | okay | okay | new page okay; new area duplicates the parent | the area remains implicit | **rejected** — configuration is duplicated |
| **B. Area per feature with a top-level path** (**adopted**) | one feature = one top-level path (`/content`, `/admin`) + one layout + parent META | high — everything is in `index.js` | zero collisions (one path per area) | high | stable paths | page = one child; domain = one folder | `/content/posts` | **adopted** |
| **C. Single `/app` shell with a shared parent** | one `/app` parent with LayoutDefault and all children inside it | low — feature `index.js` files would no longer be the source of truth | different features share one parent (registration/import order matters) | high | okay | every feature writes to the same parent; the central registry grows | okay | **rejected** — violates “one folder per feature; the registry is the single contact point” |
| **D. Resource routes with parameters** (`/posts/:id`, `/books/:id`) | detail pages by ID | high | okay | okay | okay | okay | high | **reserved for when detail pages exist** — DataTable currently covers the use cases without detail pages; `api.get(id)` already exists for that future need |

## 4. The convention

1. **One primary area per feature:** one top-level path, one layout in `ui/layouts/`, and one
   `index.js` declaring everything. Areas with several sections provide navigation in their layout
   (AdminLayout uses a sidebar; ContentLayout uses tabs).
2. **Put META on the area parent.** A child declares META only for an exception inside the area
   (for example, `/admin/users` uses `perm` while sibling routes require `roles`). The guard
   walks `to.matched`, so the parent covers its children.
3. **Guard requirements** (evaluation order in `app/guards.js`): `requiresAuth` → session;
   `roles: [...]` → static area role; `perm: { action, subject }` → the server-synchronized
   **CASL ability**.
   This is dynamic: anyone who can read `User` may enter user management, regardless of role.
   A 403 does not log the user out: “forbidden” is not “unauthenticated.”
4. **Paths:** area paths are lowercase (`/content`, `/admin`); resources use plural kebab-case
   (`posts`, `books`); sections use kebab-case (`stats`, `users`, `permissions`). An empty child
   path `''` redirects to the area’s main section, so `/content` and `/admin` never return 404.
5. **Route names** (for `router.push` by name): PascalCase with the area prefix — `Home`, `Login`,
   `Profile`, `ContentPosts`, `ContentBooks`, `AdminStats`, `AdminUsers`, `AdminPermissions`.
6. **Catch-all `*`:** always last; `features/index.js` enforces this order.
7. **API namespace follows the feature:** `$api.content.posts`, `$api.content.books`, and
   `$api.admin.*`; data-domain code belongs beside the UI that consumes it.

## 5. Maintenance checklist

- **New page in an area:** add one child to the feature’s `index.js` and one link in the area
  layout. Nothing else.
- **New domain:** add `features/<name>/` with `{ name, routes, api? }` and register it in
  `features/index.js`. If it shares a layout with another feature (for example, `/profile`),
  declare the complete parent/children pair and keep paths collision-free.
- **New permission-restricted area:** add `META.perm` to the parent and add rules to the policy
  (`/admin/permissions` edits the policy at runtime). Do not modify the guard code.
