# 06 — Mock API (MirageJS)
> **Navegação:** [README português](../README.md) · [README english](../README.en.md) · [Anterior](05-login-e-permissoes.md) · [Seguinte](07-producao.md) · [English](06-mock-api.en.md)

Com `mock: true` no `env.js` a app arranca um servidor falso que **interpreta os XHR do axios antes de chegarem à rede** — `this.$api` / `this.$http` desenvolvem-se e testam-se de ponta a ponta sem backend, e o resto da app não distingue. (`vendor-dev/mirage.min.js` é injectado pelo `env.js`; a fábrica vive em `dev/mock/index.js` — o único módulo que conhece o MirageJS, tal como `core/loader.js` é o único que conhece o sfc-loader.)

Organização:

```text
├── dev/
│   └── mock/
│       ├── index.js        Mirage, modelos, seeds, rotas e persistência da BD
│       ├── token.js        Codec do fake-JWT e integridade do payload
│       ├── sessions.js     Registry de sessões, rotação, revogação e validação
│       ├── helpers.js      Respostas, autenticação, paginação e política CASL
│       ├── crud.js         Fábrica CRUD e metadados server-driven
│       ├── routes/         Endpoints de auth, perfil, permissões e recursos
│       └── seeds/          Dados determinísticos de users, posts, books e regras
```

- **Seeds**: 15 posts (3 páginas de 6, autores em round-robin pelos 5 users — todos os roles aparecem na tabela), 7 livros (2 páginas de 6), 5 contas (admin, user, editor, viewer, subadmin — um role por conta), e a política `roleRules` carregada para a BD (model `rule`).
- **A política é lida da BD a cada pedido** — mudar o seed e recarregar muda as permissões; nada de política hardcoded em handlers. As rotas de posts aplicam-na a **CADA pedido, ler incluído**: remover a regra `read Post` do role `user` tranca `GET /posts` com **403** no pedido seguinte (e uma regra `read` com `conditions` filtra a lista — ABAC no servidor).
- **A BD do mock PERSISTE entre reloads** (dev): cada pedido respondido despeja a BD para `localStorage` (hook `handledRequest` do Pretender) e o boot seguinte re-hidrata o dump da mesma assinatura de seeds — mudanças feitas em runtime (revogar uma regra no painel, criar posts/utilizadores) sobrevivem ao F5 e ao acesso directo por URL. A chave do dump inclui a assinatura dos seeds (FNV-1a): **editar um ficheiro de seed muda a assinatura, o dump é descartado e a BD volta ao novo seed** — nunca um dump stale a esconder mudanças. `window.__mockReset()` (no console) apaga o dump e recarrega: voltar ao estado inicial. localStorage indisponível/cheio ⇒ degrada para efémero (re-semeia).
- **Latência** `config.mirage.timing` (ms) por pedido; **TTLs** `config.mirage.tokenTtl` (access, 120s) e `refreshTtl` (refresh, 7 dias): access expirado → 401 → `/refresh` automático (com rotação).
- **Sessões**: o token é uma REFERÊNCIA (`jti`) a uma linha do model `session` no registry (`sessions.js`) — emite-se só no login (PAR access/refresh, mesma `family`) e no refresh (rotação), revoga-se no logout (família inteira) e na mudança de password, e o payload do token tem um hash registado na emissão: qualquer adulteração (roles, sub, exp, typ) dá 401. As sessões persistem no dump como o resto da BD.
- **`meta.editable`**: a listagem de TODOS os recursos da fábrica publica a lista branca do PUT — o servidor é a autoridade sobre o que é editável e a UI (`ui/DataTable.vue`) desenha os inputs a partir daí; mudar `editable` em `routes/<recurso>.js` reflecte-se nas vistas sem tocar em nenhum `.vue` (o PUT continua a re-verificar a lista branca de qualquer forma — expor não é delegar).
- **`meta.sorts`**: o MESMO princípio para a ordenação e o formato numérico — a listagem publica `sorts: {allowed, numeric}` (os `allowedSorts`/`numericSorts` da fábrica) e a DataTable deriva daí as setas de ordenação e a formatação pt-PT das colunas numéricas; a config de colunas das vistas passou a ser SÓ apresentação (`key/label/width/sub/editFields`). Um `?sort=` fora de `allowed` continua a cair no `defaultSort` no servidor — expor não é delegar, aqui também.
- **`meta.roleCounts` (opção `extraMeta` da fábrica)**: agregados do CONJUNTO inteiro que uma página paginada não consegue derivar, publicados na meta da listagem — o users publica a contagem de utilizadores por role (o resumo "roles existentes" do UsersPanel). A fábrica aceita `extraMeta(schema)` em qualquer recurso: o agregado é do servidor, a vista só desenha.
- **Passthrough**: tudo o que não é `/api` (incluindo o `fetch` dos `.vue` do loader) passa para a rede.

## Endpoints

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/login` | – | `{username, password}` → PAR access/refresh NOVO no registry + `{token, refreshToken, user}` ou 401 |
| POST | `/api/refresh` | refresh EMITIDO e não revogado (expired ok) | ROTAÇÃO: novo PAR `{token, refreshToken, user}`; o refresh antigo e os access da família ficam revogados; REUTILIZAR um refresh já rodado mata a FAMÍLIA inteira (detecção de roubo); 401 para forjado/adulterado/revogado, access no `/refresh` (tipo errado) ou utilizador fantasma |
| GET | `/api/me` | token | utilizador corrente ou 401 |
| POST | `/api/logout` | token (tolerante) | **REVOGA a FAMÍLIA** (access E refresh morrem juntos): o token antigo dá 401 em qualquer pedido seguinte; `{ok: true}` sempre |
| POST | `/api/__demo/expire` | token · só `debug` | demo do fluxo 401→refresh: marca a sessão corrente como expirada NO REGISTRY → próximo pedido 401 `token_expired` → refresh roda o par; 404 fora de `debug` |
| POST | `/api/__demo/revoke` | token · só `debug` | demo do fluxo 401→logout: revoga a FAMÍLIA da sessão corrente NO REGISTRY → 401 `invalid_token` → refresh falha → logout; 404 fora de `debug` |
| GET | `/api/profile` | token | perfil público da própria sessão (mesma forma do `/me`) — a rota do Perfil (`/profile`) |
| PUT | `/api/profile` | token | self-service da própria conta: muda `name` / `username` / `password` (vazio = manter) → 200 com o perfil actualizado; 422 nome vazio, username 3-24 `[a-zA-Z0-9_.-]` + único, password < 4. Self-scoped: escreve SEMPRE no utilizador da sessão (ids no body são ignorados); roles nunca (auto-escalada) |
| GET | `/api/permissions` | token | regras CASL do utilizador da sessão, lidas da mock DB a cada pedido (seed `seeds/permissions.js`): admin → `manage Post` + `manage Book` + `manage User`; user → `read/create Post` + `read Book` + `update/delete` com conditions `{authorId}`; subadmin → `read User` + `update User` + `read Post` + `read Book` |
| GET | `/api/permissions/:id` | token + `admin` | **`:id` = ID de UTILIZADOR**: perfil público + regras efectivas já materializadas com os dados dele (o que `GET /api/permissions` lhe serviria); 404 desconhecido, **403** sem admin |
| GET | `/api/rules` | token + `admin` | política **crua** (placeholders intactos): `{data: [{id, role, action, subject, conditions, inverted, position}]}` ordenada por `position` — a ordem de AVALIAÇÃO CASL, a última regra que casa sobre o mesmo (action, subject) vence |
| POST | `/api/rules` | token + `admin` | cria regra `{role, action, subject, conditions?, inverted?}` → 201 (nasce em ÚLTIMO lugar, position = max+1 — "a mais recente vence"); 422 texto vazio/>40, conditions inválidas (não-objecto/valores não primitivos), `inverted` não-booleano ou regra duplicada |
| PUT | `/api/rules/order` | token + `admin` | REORDENA a política (o endpoint do drag & drop): body `{ids: [...]}` com **TODOS** os ids na nova ordem de avaliação → 200 com a política reordenada; 422 se faltar/sobrar/duplicar id ou id desconhecido — nada muda (um drag mal feito nunca perde regras) |
| PUT | `/api/rules/:id` | token + `admin` | muda qualquer campo (incl. `inverted`) → 200; 422 idem + ao deixar o role `admin` sem regras (self-lockout da política); 404 |
| DELETE | `/api/rules/:id` | token + `admin` | elimina → 204; 422 na última regra do role `admin`; 404 |
| GET | `/api/admin/stats` | token + `admin` | `{data: {users, posts, generatedAt}}` ou **403** |
| GET | `/api/admin/users` | token + regra `read User` | lista **paginada/ordenada** (`?page&per_page&sort&order`; `sort`: id, name) de `{id, username, name, roles}` — **nunca passwords** — com meta `editable/sorts/roleCounts`; **403** sem a regra (o SUB-ADMIN entra só com `read User`) |
| GET | `/api/admin/users/:id` | token + regra `read User` | detalhe público de um utilizador (da fábrica, sem password); 404 desconhecido |
| POST | `/api/admin/users` | token + regra `create User` | cria `{username, name, password, roles[]}` → 201; 422 `{error:'validation', field, message?}` (username 3-24 `[a-zA-Z0-9_.-]` + único, nome obrigatório, password ≥ 4, ≥ 1 role) |
| PUT | `/api/admin/users/:id` | token + regra `update User` + defesas | muda name / password (vazio = manter) / roles → 200; **conta com o ROLE admin só se edita pelo role admin (403 antes da forma — T12)**; campo `roles` reservado ao role admin (403); username imutável aqui (o próprio utilizador renomeia-se no `/api/profile`); 422 nas próprias roles (self-lockout); 404. Password nova REVOGA as sessões do alvo |
| DELETE | `/api/admin/users/:id` | token + regra `delete User` | elimina a conta → 204; 422 a eliminar-se a si próprio; 404. Os posts dele ficam; o token dele morre no pedido seguinte (401 → refresh falha → logout automático) |
| GET | `/api/posts` | token + regra `read` | paginado + ordenado: `?page=1&per_page=6&sort=id&order=desc` (`sort`: id, createdAt, title, author) → `{data, meta: {page, perPage, total, totalPages, hasMore, editable, sorts}}` — `meta.editable` é a lista branca do PUT e `meta.sorts` o contrato de ordenação, publicados para a UI; **403** sem nenhuma regra `read Post` (política lida a cada pedido); regra `read` com `conditions` filtra a lista (ABAC); token expirado → auto refresh + retry |
| GET | `/api/posts/:id` | token + regra `read` sobre o post | `{data: {...}}`; 404 desconhecido; **403** sem `read` sobre o post (não é público: ler também é permissão) |
| POST | `/api/posts` | token + regra `create` | cria post (`author`/`authorId` = sessão) → 201; **403** sem `create`; 422 sem `title` |
| PUT | `/api/posts/:id` | token + regra `update` sobre o post | 200; **403** fora — decide a owner rule (`conditions {authorId}`), o admin entra pelo `manage` |
| DELETE | `/api/posts/:id` | token + regra `delete` sobre o post | 204; **403** fora, idem |
| GET | `/api/books` | token + regra `read` | 2.º recurso, servido pela fábrica `crud.js`: paginado + ordenado (`sort`: id, title, author, pages — `pages` com `numericSorts`, comparação por NÚMERO) → `{data, meta}` (com `meta.editable` e `meta.sorts`); **403** sem nenhuma regra `read Book` (política a cada pedido); regra com `conditions` filtra a lista (ABAC) |
| GET | `/api/books/:id` | token + regra `read` sobre o livro | `{data: {...}}`; 404 desconhecido; **403** sem `read` sobre o livro |
| POST | `/api/books` | token + regra `create` | cria livro (`creatorId` = sessão) → 201; **403** sem `create`; 422 sem `title` |
| PUT | `/api/books/:id` | token + regra `update` sobre o livro | 200 — só os campos da lista branca `editable`; **403** fora |
| DELETE | `/api/books/:id` | token + regra `delete` sobre o livro | 204; **403** fora, idem |

Auto-protecções que a API re-verifica mesmo com a UI contornada: ninguém elimina a própria conta nem muda as próprias roles (`422`, sem self-lockout do último admin) e uma conta com o ROLE admin só se edita pelo role admin (403 — T12). Um role desconhecido é aceite mas nasce com **zero permissões** — fail-closed até o seed lhe dar regras. E a política governa também a leitura de posts: o mock constrói a Ability da sessão com o MESMO CASL do cliente (`helpers.abilityFor`) e nega 403 o que ela não permitir.

## Ordem das regras e regras cannot

No CASL, a **última regra que casa** sobre o mesmo (action, subject) **vence**. Para isso ser observável (e editável), a política ganhou:

- **`position`** — a ordem de avaliação é um dado da regra; `GET /api/rules`, `PUT /rules/order` e o motor da política (`rulesForUser` em `helpers.js`) ordenam sempre por `position` (empate → id). Seeds: position = ordem do ficheiro; regra nova: max+1 (nasce a vencer).
- **`inverted`** — o `cannot` do CASL: `{action:'update', subject:'Post', inverted:true}` NEGA em vez de permitir. Com conditions funciona igual (`cannot` só nos posts alheios, por exemplo). O painel mostra-os com badge vermelho `cannot`.

Combinação de exemplo (o cenário canónico do drag & drop — ver [`05-login-e-permissoes.md`](05-login-e-permissoes.md)): um `cannot update Post` por cima da owner rule tranca todos os updates do user; arrastado para o topo, a owner rule volta a ser a última e o user volta a editar os próprios posts.
