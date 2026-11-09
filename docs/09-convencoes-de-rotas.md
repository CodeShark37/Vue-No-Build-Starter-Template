# 09 — Convenção de rotas: zonas, meta e nomes
> **Navegação:** [README português](../README.md) · [README inglês](../README.en.md) · [Anterior](08-seguranca.md) · [English](09-convencoes-de-rotas.en.md)

Estudo feito na v12.14, quando o template ganhou três pressões ao mesmo tempo:
juntar posts e books numa zona única (como o Admin), tornar `User` um recurso da
política CASL (sub-admins — quem pode entrar na zona admin passa a ser uma
PERMISSÃO do servidor, não só um role) e manter a manutenibilidade quando as
features crescem. A convenção abaixo é o resultado — o que o template segue daqui
para a frente.

## 1. Inventário (antes → depois da v12.14)

| Zona | Path | Layout | Meta do PAI | Filhos |
| --- | --- | --- | --- | --- |
| site | `/` | LayoutDefault | — (pública) | Home, 403; catch-all `*` (404) |
| auth | `/login` | LayoutAuth | `guest` | Login |
| auth | `/app/profile` | LayoutDefault | `requiresAuth` | Profile |
| content (v12.14) | `/content` | **ContentLayout** | `requiresAuth` | posts, books (`''` → posts) |
| admin | `/admin` | AdminLayout | `requiresAuth` | users (`perm`), stats (`roles`), permissions (`roles`); `''` → users |
| legado | `/app/feed`, `/app/books` | — | `requiresAuth` | redirects para `/content/…` (v12.5 e v12.14) |

## 2. Critérios de avaliação

- **C1 — Localização do conhecimento**: uma zona inteira deve ser legível num
  sítio só (o `index.js` da feature), sem caçar meta por ficheiros.
- **C2 — Colisões e ordem**: caminhos nunca colidem; nenhuma regra depende de
  ordem de registo (excepto o catch-all `*`, sempre último).
- **C3 — Meta herdada**: `requiresAuth`/`roles`/`perm` no PAI cobrem os filhos
  por `to.matched` — nunca repetir meta em cada filho.
- **C4 — Estabilidade de URL**: bookmarks sobrevivem a reorganizações via
  redirects de legado declarados NA zona antiga (precedente `/app/data` → `/app/feed`).
- **C5 — Custo de acrescentar**: uma página nova = 1 filho na zona existente;
  um domínio novo = 1 feature nova (pasta + registo em `features/index.js`).
- **C6 — Legibilidade**: URL descreve a zona e o recurso; nada de abreviações.

## 3. Opções consideradas

| Opção | Descrição | C1 | C2 | C3 | C4 | C5 | C6 | Veredicto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A. Vários pais `/app` por feature** (estado até v12.13) | posts e books declaravam cada um o seu pai `/app` | média (meta espalhada por 2 index.js) | risco de colisão de filhos e pais duplicados | ok | ok | página nova ok; zona nova duplica o pai | `/app/feed` esconde a zona | **rejeitada** — funciona, mas a zona "aplicação" não existe como conceito; foi o que motivou o merge |
| **B. Zona por feature com path de topo** (**adoptada**) | 1 feature = 1 path de topo (`/content`, `/admin`) + 1 layout próprio + meta no pai | alta — tudo num index.js | zero colisões (um path por zona) | alta | redirects de legado | página = 1 filho; domínio = 1 pasta | `/content/posts` | **ADOPTADA** |
| **C. Shell único `/app` com pai comum** | um único pai `/app` com LayoutDefault e TODOS os filhos lá dentro | baixa — o index.js das features deixaria de ser a fonte | filhos de features diferentes partilham o mesmo pai (ordem/import) | alta | ok | cada feature escreve no MESMO pai — registo central inchado | ok | rejeitada — viola "UMA pasta por funcionalidade; o registo é o único ponto de contacto" |
| **D. Rotas de recurso com params** (`/posts/:id`, `/books/:id`) | páginas de detalhe por id | alta | ok | ok | ok | ok | alta | **reservada para quando existir detalhe** — a DataTable já serve os casos actuais sem página de detalhe; o contrato `api.get(id)` (v12.9) já existe para o dia em que fizer sentido |

## 4. A convenção (o que o template segue)

1. **Uma ZONA por feature**: 1 path de topo, 1 layout de `ui/layouts/`, 1
   `index.js` que declara tudo. Zonas com várias secções ganham navegação da
   zona no layout (AdminLayout: sidebar; ContentLayout: abas).
2. **Meta no PAI da zona**; filho declara meta só para EXCEÇÕES dentro da zona
   (ex.: `/admin/users` abre por `perm` enquanto os irmãos exigem `roles`).
   O guard percorre `to.matched` — o pai cobre os filhos.
3. **Exigências do guard** (ordem de avaliação em `app/guards.js`):
   `requiresAuth` → sessão; `roles: [...]` → role (zona estática);
   `perm: { action, subject }` → **abilidade CASL do servidor** (v12.14) — zona
   dinâmica: quem pode ler `User` entra na gestão de utilizadores, seja qual
   for o role. 403 sem logout ("sem permissão" ≠ "sem sessão").
4. **Paths**: zona em minúsculas de uma palavra (`/content`, `/admin`); recursos
   no PLURAL kebab-case (`posts`, `books`); secções kebab-case (`stats`,
   `users`, `permissions`). Filho vazio `''` redireciona à secção principal da
   zona — `/content` e `/admin` nunca dão 404.
5. **Nomes de rota** (para `router.push` por nome): PascalCase com prefixo da
   zona — `Home`, `Login`, `Profile`, `ContentPosts`, `ContentBooks`,
   `AdminStats`, `AdminUsers`, `AdminPermissions`.
6. **Legacy URLs**: redirects declarados na zona antiga (`/app/feed` →
   `/content/posts`; `/app/books` → `/content/books`; `/app/data` → `/app/feed`
   → cai no primeiro redirect). Nada de 404 em upgrades.
7. **Catch-all `*`** sempre último — `features/index.js` garante a ordem.
8. **API namespace segue a feature**: `$api.content.posts`, `$api.content.books`,
   `$api.admin.*` — o domínio de dados mora onde a UI dele mora.

## 5. Como aplicar (checklist de manutenção)

- Nova página numa zona: acrescentar 1 filho ao `index.js` da feature + link no
  layout da zona. Nada mais.
- Novo domínio: nova pasta `features/<nome>/` com `{ name, routes, api? }` +
  registo em `features/index.js`. Se partilha cromo com outra feature (como
  `/app/profile` partilha LayoutDefault), declarar o par pai/filhos completo —
  filhos nunca colidem.
- Nova zona restrita por permissão: `meta.perm` no pai + regras na política
  (`/admin/permissions` edita em runtime) — sem tocar no código do guard.
