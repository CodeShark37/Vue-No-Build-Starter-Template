# 09 — Convenção de rotas: zonas, meta e nomes
> **Navegação:** [README português](../README.md) · [README english](../README.en.md) · [Anterior](08-seguranca.md) · [English](09-convencoes-de-rotas.en.md)

Esta convenção organiza as zonas, os metadados e os nomes das rotas do template.
O objetivo é manter a autorização centralizada, evitar colisões e permitir que
as features cresçam sem espalhar a configuração.

## 1. Inventário actual

| Zona | Path | Layout | Meta do PAI | Filhos |
| --- | --- | --- | --- | --- |
| site | `/` | LayoutDefault | — (pública) | Home, 403; catch-all `*` (404) |
| auth | `/login` | LayoutAuth | `guest` | Login |
| auth | `/app/profile` | LayoutDefault | `requiresAuth` | Profile |
| content | `/content` | **ContentLayout** | `requiresAuth` | posts, books (`''` → posts) |
| admin | `/admin` | AdminLayout | `requiresAuth` | users (`perm`), stats (`roles`), permissions (`roles`); `''` → users |

## 2. Critérios de avaliação

- **C1 — Localização do conhecimento**: uma zona inteira deve ser legível num
  sítio só (o `index.js` da feature), sem caçar meta por ficheiros.
- **C2 — Colisões e ordem**: caminhos nunca colidem; nenhuma regra depende de
  ordem de registo (excepto o catch-all `*`, sempre último).
- **C3 — Meta herdada**: `requiresAuth`/`roles`/`perm` no PAI cobrem os filhos
  por `to.matched` — nunca repetir meta em cada filho. Em `roles` a herdação é
  restritiva: cada nível que declarar `roles` tem de ficar satisfeito (AND entre
  níveis; o array de um nível é OR de alternativas) — o filho aperta, nunca
  afrouxa.
- **C4 — Estabilidade de URL**: os caminhos actuais são explícitos e estáveis,
  com um único ponto de declaração por zona.
- **C5 — Custo de acrescentar**: uma página nova = 1 filho na zona existente;
  um domínio novo = 1 feature nova (pasta + registo em `features/index.js`).
- **C6 — Legibilidade**: URL descreve a zona e o recurso; nada de abreviações.

## 3. Opções consideradas

| Opção | Descrição | C1 | C2 | C3 | C4 | C5 | C6 | Veredicto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A. Vários pais por feature** | posts e books declaravam cada um o seu pai | média (meta espalhada por 2 index.js) | risco de colisão de filhos e pais duplicados | ok | ok | página nova ok; zona nova duplica o pai | a zona fica implícita | **rejeitada** — a configuração duplica-se |
| **B. Zona por feature com path de topo** (**adoptada**) | 1 feature = 1 path de topo (`/content`, `/admin`) + 1 layout próprio + meta no pai | alta — tudo num index.js | zero colisões (um path por zona) | alta | paths estáveis | página = 1 filho; domínio = 1 pasta | `/content/posts` | **ADOPTADA** |
| **C. Shell único `/app` com pai comum** | um único pai `/app` com LayoutDefault e TODOS os filhos lá dentro | baixa — o index.js das features deixaria de ser a fonte | filhos de features diferentes partilham o mesmo pai (ordem/import) | alta | ok | cada feature escreve no MESMO pai — registo central inchado | ok | rejeitada — viola "UMA pasta por funcionalidade; o registo é o único ponto de contacto" |
| **D. Rotas de recurso com params** (`/posts/:id`, `/books/:id`) | páginas de detalhe por id | alta | ok | ok | ok | ok | alta | **reservada para quando existir detalhe** — a DataTable já serve os casos actuais sem página de detalhe; o contrato `api.get(id)` já existe para o dia em que fizer sentido |

## 4. A convenção (o que o template segue)

1. **Uma zona principal por feature**: 1 path de topo, 1 layout de
   `ui/layouts/` e 1 `index.js` que declara tudo. Zonas com várias secções
   ganham navegação no layout (AdminLayout: sidebar; ContentLayout: abas).
2. **Meta no PAI da zona**; filho declara meta só para EXCEÇÕES dentro da zona
   (ex.: `/admin/users` abre por `perm` enquanto os irmãos exigem `roles`).
   O guard percorre `to.matched` — o pai cobre os filhos.
3. **Exigências do guard** (ordem de avaliação em `app/guards.js`):
   `requiresAuth` → sessão; `roles: [...]` → role (zona estática);
   `perm: { action, subject }` → **abilidade CASL sincronizada com o servidor** — zona
   dinâmica: quem pode ler `User` entra na gestão de utilizadores, seja qual
   for o role. 403 sem logout ("sem permissão" ≠ "sem sessão").
4. **Paths**: zona em minúsculas de uma palavra (`/content`, `/admin`); recursos
   no PLURAL kebab-case (`posts`, `books`); secções kebab-case (`stats`,
   `users`, `permissions`). Filho vazio `''` redireciona à secção principal da
   zona — `/content` e `/admin` nunca dão 404.
5. **Nomes de rota** (para `router.push` por nome): PascalCase com prefixo da
   zona — `Home`, `Login`, `Profile`, `ContentPosts`, `ContentBooks`,
   `AdminStats`, `AdminUsers`, `AdminPermissions`.
6. **Catch-all `*`** sempre último — `features/index.js` garante a ordem.
7. **API namespace segue a feature**: `$api.content.posts`, `$api.content.books`,
   `$api.admin.*` — o domínio de dados mora onde a UI dele mora.

## 5. Como aplicar (checklist de manutenção)

- Nova página numa zona: acrescentar 1 filho ao `index.js` da feature + link no
  layout da zona. Nada mais.
- Novo domínio: nova pasta `features/<nome>/` com `{ name, routes, api? }` +
  registo em `features/index.js`. Se partilha o layout com outra feature
  (como `/app/profile`), declarar o par pai/filhos completo e manter os paths
  sem colisões.
- Nova zona restrita por permissão: `meta.perm` no pai + regras na política
  (`/admin/permissions` edita em runtime) — sem tocar no código do guard.
