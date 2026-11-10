# 08 — Segurança (auditoria OWASP Top 10, rotas e sessão)
> **Navegação:** [README português](../README.md) · [README english](../README.en.md) · [Anterior](07-producao.md) · [Seguinte](09-convencoes-de-rotas.md) · [English](08-seguranca.en.md)

Auditoria de segurança do template (histórico v12.11–v12.16; estado actual
**v12.17.1**), feita como **hacker ético**: cada achado foi PROVADO com um exploit
executado contra a app a correr (as provas EXP1–EXP7 em baixo) e o ciclo de identidade/sessão passou a ser
validado por uma **matriz de testes de intrusão T01–T12** executada contra o mock
(harness em Node que importa o código real — ver secção em baixo). O template tem
uma doutrina clara que a auditoria confirmou: **a UI esconde, a API decide** — e
 desde a v12.12 a autoridade sobre a identidade e o ciclo de vida da sessão é o
SERVIDOR (registry de sessões).

## O modelo de ameaça deste template

O template é uma SPA **sem backend próprio em produção**: em dev, a "API" é o
Mirage a correr DENTRO da página (mesma origem, mesmo executor JS); em
produção, os pedidos vão para uma API real que o template NÃO fornece. Por
isso a auditoria separa três planos:

| Plano | O que é | Conclusão |
| --- | --- | --- |
| **Cliente** (src/) | guard de rotas, Ability CASL, sessão, DataTable | UX de segurança — sempre reforçado pela API |
| **Mock** (dev/mock/) | substituto da API em desenvolvimento | Bom como MODEL de API real; NÃO é um backend seguro (e não pode ser) |
| **API real** (futura) | o que o deploy liga via `env.js` | A autoridade real — o checklist de backend está na secção final |

## Provas de exploit (executadas contra a app a correr)

| # | Ataque | Resultado | Classificação |
| --- | --- | --- | --- |
| EXP1 | Token FORJADO `mrg.<payload>.mock` (sub=1, roles=[admin], assinatura inventada) chamado a `GET /api/admin/stats` | **v12.11: HTTP 200** com os dados — o mock validava formato + user + exp, nunca a emissão. **v12.12: HTTP 401** — token sem `jti` emitido pelo registry é rejeitado (T02 da matriz) | **CORRIGIDO na v12.12** (registry de sessões; só existe onde `mock: true`) |
| EXP2 | Ler o dump `mock-db-*` do localStorage | **Passwords em claro** (admin/admin123, …) | Dev-only por desenho (seeds em texto para a demo). Nunca chega a produção: deploy apaga `dev/` |
| EXP3 | Spoof de roles no `localStorage.user` de um user comum (`roles:["admin"]`) + recarregar | Nav mostra link **Admin** e badge `[admin]`… mas `GET /api/admin/users` com o token do user responde **HTTP 403** | **A API re-verifica (defesa em profundidade funciona)**. O spoof engana a UX, nunca os dados |
| EXP4 | Post criado por API com título `<img src=x onerror=…><b>bold</b>` | Célula renderiza o texto ESCAPADO (`payloadComoTexto: true`, zero elementos `<img>`/`<b>` criados) | **Não explorável**: sem `v-html` em todo o `src/` (grep 0 ocorrências); Vue escapa a interpolação |
| EXP5 | `GET /api/posts?per_page=9999&sort=1%3D1&order=ASC` | `meta.perPage` **clamp a 50**; sort desconhecido cai no `defaultSort`; order inválido cai no default | **Não explorável**: whitelist `allowedSorts` + clamp `maxPerPage` no servidor |
| EXP6 | `POST /api/refresh` com token EXPIRADO há 60s | **v12.11: HTTP 200** + token novo, indefinidamente. **v12.12**: renova SÓ se a sessão existe no registry e não está revogada — e o refresh RODA o jti (o token antigo morre) | **CORRIGIDO na v12.12** (rotação + registry; T03 da matriz) |
| EXP7 | Sub-admin (regra `update User`, sem o role admin) faz `PUT /api/admin/users/1` (a conta ADMIN) mudando nome e **password** | **v12.15: HTTP 200** — a defesa de escalada cobria só o campo `roles`; a password nova é uma credencial que o SUB-ADMIN conhece (e as sessões do alvo morrem logo a seguir). **v12.16: HTTP 403** — conta com o role admin só se edita pelo role admin, 403 antes de qualquer validação de forma | **CORRIGIDO na v12.16** (`users.js` validateUpdate; T12 da matriz) |

## OWASP Top 10 (2021), item a item

### A01 — Broken Access Control

**Bom (proado no EXP3/EXP5):**
- Toda a escrita e leitura do mock passa pela cadeia única `registerCrud`
  (`dev/mock/crud.js`): guard 401/403 → política CASL ao nível do TIPO → ao
  nível da INSTÂNCIA (conditions) → 404 → 422. Um PUT/DELETE sobre post alheio
  responde 403 mesmo com a UI contornada.
- `PUT /profile` é **self-scoped por construção**: escreve sempre no user da
  SESSÃO e ignora qualquer `id` no body — não há caminho para editar outro
  utilizador.
- Listas brancas anti mass-assignment: `editable: ['title','body']` nos posts
  (autoria nunca editável), `['title','author']` nos books (`creatorId` nunca),
  `['name','password','roles']` nos users (só por admin, com self-lockout: um
  admin não muda as próprias roles nem se elimina — 422).
- **Conta alvo admin (v12.16)**: uma conta com o ROLE admin só se edita pelo
  ROLE admin — 403 antes de qualquer validação de forma, mesmo para quem tem a
  regra `update User` (EXP7/T12: sem isto, o sub-admin tomava a conta do admin
  pela password nova).
- `/api/admin/stats` e `/api/rules` exigem role `admin` no servidor
  (`guard {admin:true}`), re-verificado em cada rota. `/api/admin/users` é
  governado pela política CASL do subject `User`: `subadmin` pode ler e editar
  contas comuns, mas não criar, eliminar, alterar roles ou editar contas admin.
- Política como DADO: apagar a regra `read Post` de um role tranca o `GET
  /posts` desse role no pedido seguinte (lida da BD a cada pedido, fail-closed
  sem vendor CASL).
- Cliente: guard único por meta (`requiresAuth`/`roles`/`guest`), `403` sem
  logout, catch-all por último. EXP3 provou que contornar a UI não dá nada.
- `conditions` das regras CASL são validadas (só objecto plano com valores
  primitivos) — sem protótipos injectados, sem expressões; placeholders só
  aceitam `${user.<campo>}` (regex `\w+`) materializados com dados do PRÓPRIO
  user da sessão.

**Limitações (desenho do mock, documentadas):**
- ~~EXP1: sem verificação de assinatura, qualquer JS da página se faz passar por
  admin.~~ **CORRIGIDO na v12.12**: o servidor só confia no que EMITE — o token
  referencia uma sessão no registry (`sessions.js`) e o payload tem um hash
  registado na emissão; forjado/adulterado = 401. Num backend real, o token é
  assinado (HS256/RS256) E verificado contra a sessão/denylist.
- O guard do cliente lê `$auth.user` do localStorage (spoofável) — é UX por
  desenho; a API é quem decide (prova EXP3).

### A02 — Cryptographic Failures

- Passwords em claro no mock (seeds + BD + dump localStorage, EXP2): aceitável
  SÓ em desenvolvimento; `docs/07` obriga a apagar `dev/` no deploy. Um backend
  real usa argon2id/bcrypt com salt.
- `publicUser()` é a única forma de saída do user: a password NUNCA sai por
  nenhuma rota (listas, detalhes, login, refresh, profile).
- FNV-1a na assinatura do dump e o **hashPayload (FNV-1a+DJB2)** da integridade
  do token (v12.12) são explicitamente NÃO-criptográficos: detectam alteração
  (dump stale / payload adulterado), não impedem colisão deliberada de
  64 bits — o comentário no código diz-o. A assinatura REAL é do backend
  (HS256/RS256).
- Sem segredos no código cliente (nada para vazare): a app não tem chaves de
  API; tudo o que é sensível pertence ao backend real.
- Transporte: em produção exige HTTPS + HSTS (`docs/07`); o token anda no
  header `Authorization` de todos os pedidos.

### A03 — Injection

- **XSS (prova EXP4)**: zero `v-html`/`innerHTML`/`eval` no código da app
  (verificado por grep); Vue 2 escapa toda a interpolação `{{ }}`; os slots da
  DataTable renderizam componentes, não HTML cru.
- **Atenção estrutural (inerente ao no-build)**: o vue2-sfc-loader COMPILA os
  `.vue` no browser (usa `new Function`). Uma CSP sem `'unsafe-eval'` impede a
  app de arrancar — mitigação: os templates vêm SEMPRE de ficheiros same-origin
  do próprio deploy; exigir CSP `script-src 'self' 'unsafe-eval'` e manter o
  servidor sem conteúdo user-uploaded executável.
- **Sort injection**: `?sort=` cai na whitelist `allowedSorts` (EXP5); `per_page`
  clamp a `maxPerPage` (50); `page` a `Math.max(1, …)`.
- **JSON**: corpos são `JSON.parse` tolerante a lixo (`parseBody` → `{}`); nada
  de eval de respostas.
- **Prototype pollution**: `conditionsInvalid()` rejeita objectos com valores
  não primitivos — `__proto__` como objecto é 422; como primitivo nunca altera
  protótipos (JSON.parse cria propriedade própria e o setter é ignorado).

### A04 — Insecure Design

- Fail-closed em todo o lado: sem Ability (`null`) → nenhuma acção; sem regras
  para um role → zero permissões; sem vendor CASL no mock → 403.
- 401 ≠ 403 com semântica rígida: 401 ("sem sessão") despoleta refresh/logout;
  403 ("sem permissão") NUNCA limpa sessão nem navega — evita os clássicos
  logout-loop.
- Auto-protecções de integridade de política: `PUT /rules/order` exige TODOS os
  ids (422 se faltar/sobrar/duplicar — um drag mal feito não perde regras); a
  última regra do role admin é intocável.
- Separação dev/prod por ficheiro único (`env.js`) + pastas apagáveis (`dev/`,
  `vendor-dev/`) — o deploy não pode levar o mock por engano se o checklist for
  seguido.

### A05 — Security Misconfiguration

- **Corrigido na v12.11:**
  - `withCredentials: false` em `core/http.js` (antes `true` — enviaria cookies
    automaticamente para a API real e alargava a superfície CSRF sem
    necessidade; a app autentica por Bearer).
  - Login não pré-preenche `admin/admin123` nem mostra a pista de demo fora de
    localhost/mock.
  - Botões "Simular expirado/revogado" (SessionPanel) só existem em
    `config.debug` e falam com os endpoints `/api/__demo/expire|revoke`
    (404 fora de debug) — o cliente nunca reescreve tokens: os antigos
    `$auth.demo*()` que reescreviam a sessão REAL saíram do código.
- `devtools` do Vue: só em `config.debug` (já estava correcto).
- **Sem cabeçalhos de segurança por omissão** (CSP, nosniff, X-Frame-Options,
  Referrer-Policy): é o servidor estático quem os envia — configuração
  documentada em `docs/07`. Nota CSP: precisa `'unsafe-eval'` (ver A03).
- `env.js` de exemplo usa `http://localhost/api/` — documentado que o real deve
  ser HTTPS; página HTTPS + API HTTP dá mixed-content bloqueado pelo browser
  (falha visível, não silenciosa).

### A06 — Vulnerable and Outdated Components

- **Corrigido na v12.11: axios 1.6.0 → 1.21.0.** A 1.6.0 estava dentro do
  intervalo afectado por **CVE-2025-27152** (SSRF/credencial leak via URL
  absoluta que ignora `baseURL`; corrigida em 1.8.2). Na prática deste template
  o caminho de ataque é estreito (ninguém passa URL absoluto de user input ao
  axios), mas vendoring desatualizado acumula risco. (A anterior 1.6.0 já não
  tinha CVE-2023-45857 — essa foi corrigida precisamente em 1.6.0.)
- Vue 2.6.12: linha **EOL desde 31/12/2023** — sem patches de segurança.
  Manter é uma decisão consciente do template (no-build com
  vue2-sfc-loader); alternativas: 2.7.16 (última da linha, mesmo assim EOL),
  NES comercial, ou migração a Vue 3. Não há CVE conhecido explorável na 2.6.12
  para esta arquitectura; o risco é de abandono, não de exploit conhecido.
- vue-router 3.0.0 (2018) e vue-head 2.2.0 (abandonado): sem CVE conhecidos;
  recomenda-se actualizar na próxima passagem de manutenção (vue-router 3.6.8
  é a última da linha v3) e substituir o vue-head por gestão de título mínima
  própria.
- MirageJS 0.1.48: última release da linha 0.1.x — só dev, nunca em produção.
- Processo de integridade: [`vendor/VERSIONS.md`](../vendor/VERSIONS.md) com origem + SHA-256 de TODOS
  os vendors (verificação por `sha256sum`) — padrão acima da média para
  templates vendored.

### A07 — Identification and Authentication Failures

- Login devolve sempre `invalid_credentials` genérico (sem enumerar contas).
- `autocomplete="username"`/`"current-password"` correctos; nova password com
  `autocomplete="new-password"` (ProfileView).
- Token mock: access TTL curto (120s) + refresh (7 dias), single-flight no interceptor (um só
  POST /refresh para N pedidos paralelos; retry único por pedido).
- **Corrigido na v12.12 (o servidor é a autoridade da sessão):**
  - Registry de sessões (`dev/mock/sessions.js`): só sessões EMITIDAS abrem a
    API — token forjado/adulterado = 401 (EXP1/T01/T02 fechados).
  - Logout REVOGA a sessão (T04) e mudança de password REVOGA todas as sessões
    do utilizador (T05, `PUT /profile` e `PUT /admin/users/:id` via hook
    `afterUpdate`).
  - Refresh com ROTAÇÃO: só sessão emitida e não revogada renova; o jti antigo
    revoga-se (T03, EXP6 fechado — e reutilização de refresh tranca o dono).
  - Os `role`/`sub`/`exp` do payload são SÓ UX (o cliente não decide nada) —
    os roles vêm da BD a cada pedido e a validade vem do registry.
- **Limitações do mock restantes (responsabilidade do backend real):** sem rate
  limiting/lockout no `/login`; password mínima de 4 e em claro (A02); sem MFA.
- Credenciais demo não se sugerem mais fora de dev (v12.11).
- Logout: **server-side** desde a v12.12 (revogação); o cliente limpa a sessão
  local na mesma (o `POST /logout` é tolerante a token já morto).

### A08 — Software and Data Integrity Failures

- Vendors com SHA-256 manifest (VERSIONS.md) — verifica-se a cada clone/deploy.
- O dump do mock assina-se pelos SEEDS (mudar seed → dump rejeitado e
  re-semeado; nunca estado stale a esconder mudanças) — integridade de
  desenvolvimento.
- A política de permissões é DADO lido a cada pedido (não copiada em código
  cliente) — não há estado de permissões que envelheça mal.
- `PUT /rules/order` com verificação de conjunto completa (422 divergente) —
  reordenação atómica.

### A09 — Security Logging and Monitoring Failures

- Dev: consola diagnóstica clara (`[mirage]`, `[boot]`, `window.__bootStep`,
  erro visível no shell de arranque) — adequado a um template.
- O mock NÃO faz audit log de acções admin (mudanças de política, CRUD de
  users) — num backend real isso é obrigatório (quem mudou a política, quando,
  e de que valor para que valor). Registado no checklist de backend.
- Sem logs de segurança no cliente em produção (correcto: consola não é log
  seguro); o backend real deve logar 401/403/422 com contexto.

### A10 — Server-Side Request Forgery (SSRF)

- Não aplicável ao cliente: a app não recebe URLs de input para fetch; o loader
  só carrega caminhos declarados em código (features/index.js, rotas) a partir
  da raiz da app (`config.root`), same-origin.
- A API mock não faz pedidos de saída. (O CVE-2025-27152 do axios antigo era
  SSRF por URL absoluta — eliminado pela actualização v12.11.)

## Segurança de ROTAS (o que está bem e como se repete)

**Cliente (UX):**
1. Cada feature declara exigências no PAI da zona (`meta.requiresAuth`,
   `meta.roles`, `meta.guest`) — os filhos herdam pela cadeia `to.matched`.
2. Um ÚNICO guard global (`app/guards.js`) avalia: 401 → `/login?redirect=…`
   (guarda o destino); guest+sessão → `/`; roles insuficientes → `/403` sem
   logout.
3. O `?redirect=` do login navega por `router.push` (SPA interna — sem
   redirect aberto para origens externas; `push` nunca faz `location.href`).
4. Catch-all `*` sempre em último (`features/index.js` garante por código).

**Mock/API (autoridade):**
1. TODAS as rotas protegidas usam `guard()` (401) + `guardOpts {admin:true}`
   quando é zona admin (403) — escritas uma vez, chamadas em todas.
2. Política CASL aplicada por pedido: tipo (403 sem regra nenhuma) e instância
   (conditions filtram lista/negam registo).
3. Ordem de erros canónica 401 → 403 → 404 → 422 (nunca 404 a esconder 403).
4. `registerCrud` é o único caminho de CRUD — a cadeia não se reescreve por
   recurso (uma só implementação a auditar).

## Segurança de SESSÃO (estado actual e limitações)

| Aspecto | Estado no template | Nota de segurança |
| --- | --- | --- |
| Armazenamento | Access token + refresh token + perfil em `localStorage` (único módulo que os toca: `core/session.js`; o refresh NUNCA viaja nos pedidos normais — só no `POST /refresh`) | Legível por qualquer XSS. Para produção: cookies `httpOnly; Secure; SameSite` OU `sessionStorage` + TTL curto, conforme o backend |
| Emissão | `POST /login` → **PAR access/refresh NOVO no registry** (`sessions.js`, mesma `family`) + tokens que os referenciam (`jti`) | O servidor só confia no que EMITE; backend real: JWT assinado + verificação server-side |
| Tipos de credencial | **access** (curto, todos os pedidos) e **refresh** (longo, só `/refresh`) — os TIPOS não se misturam em nenhuma rota (`validateSession` expectType; omissão = access) | Refresh usado numa rota comum = 401; access no `/refresh` = 401 (T03) |
| Integridade do payload | Hash registado na emissão (`hashPayload`); qualquer byte alterado = 401 | T01/T09: adulterar roles/sub/exp não muda nada — 401 |
| Expiração | Access 120s; refresh 7 dias (`refreshTtl`); a validade REAL vive no REGISTRY (relógio do servidor); cliente calcula `exp` do access para UX | `isExpired()` é indicador de UX; a decisão é sempre do servidor (401) |
| Renovação | Interceptor: 401 → `POST /refresh` COM O REFRESH TOKEN, single-flight → repete o pedido com o access novo; falha → logout + redirect | ROTAÇÃO do PAR — o refresh antigo e os access da família revogam-se; REUTILIZAR um refresh já rodado mata a FAMÍLIA inteira (detecção de roubo, T03) |
| Revogação | **Existe**: logout revoga a FAMÍLIA (access + refresh juntos, T04); mudança de password revoga TODAS as sessões do utilizador (T05); linha fica como denylist no registry | Antes stateless (EXP6); agora o ciclo de vida é do servidor |
| Morte da conta | Apagar o user mata o token no pedido seguinte (userById falha → 401 → refresh falha → logout) — e as sessões ficam revogadas | Comportamento correcto e demonstrado no mock |
| Fixação | Login emite SEMPRE sessão nova (jti novo, sem reutilização) | OK |
| Spoof de perfil | `localStorage.user` spoofável (EXP3) — UI engana-se, API não | Por desenho; a regra "a UI esconde, a API decide" é o que mantém isto seguro |

## Matriz de testes de intrusão T01–T12

Antes de qualquer alteração, o ciclo de identidade/sessão foi medido com uma
matriz de intrusão contra o código REAL (harness Node que importa `dev/mock/`,
carrega o CASL vendored e monta stubs de Mirage/schema).

**Correr a matriz** (a partir da raiz do template; faz parte do contrato —
correr após CADA mudança em `dev/mock/` ou `src/core/`, tem de ficar 12/12):

```bash
node scripts/intrusion-matrix.mjs
```

Só precisa de Node >= 18 — não arranca servidor nem browser: o harness copia
`dev/mock/` para um directório temporário, stuba Mirage/schema e dispara os
pedidos directamente contra os handlers reais (a mesma lógica que o Mirage
executa na página).

**Baseline (v12.11, antes da correcção): 5/10 passam** — a AUTORIZAÇÃO era do
servidor (T06–T10), mas a IDENTIDADE e o CICLO DE VIDA DA SESSÃO não (T01–T05):
o token era a própria credencial e o mock não mantinha estado de sessão.

| ID | Teste | Critério de aprovação | Baseline v12.11 | Estado actual |
| --- | --- | --- | --- | --- |
| T01 | Token adulterado (roles elevadas / exp prolongada) | 401 | **FALHA** — 200 (payload aceito sem emissão) | **PASSA** — 401 (hash do payload registado na emissão) |
| T02 | Token com ID de administrador (forjado do zero) | 401 | **FALHA** — 200 (ADMIN por token forjado!) | **PASSA** — 401 (jti não emitido) |
| T03 | Refresh: par access/refresh, rotação e reutilização | forjado/tipo errado 401 · real expirado renova · reutilização mata a família | **FALHA** — 200 (emitiu sessão nova de admin a partir de um forjado) | **PASSA** — forjado 401 · access no /refresh 401 · refresh em rota comum 401 · real renova com ROTAÇÃO do par · reutilizar refresh rodado mata a FAMÍLIA |
| T04 | Token antigo após logout | 401 (access e refresh) | **FALHA** — 200 (logout stateless) | **PASSA** — 401 nos dois (família revogada) |
| T05 | Token antigo após alteração de password | 401 | **FALHA** — 200 (próprio e por admin) | **PASSA** — 401 (todas as sessões revogadas) |
| T06 | Login inválido com sessão anterior | não inicia refresh; sessão anterior intacta | PASSA (canRefresh exclui login/refresh) | PASSA (idem) |
| T07 | API administrativa com role insuficiente | 403 | PASSA (guard `{admin:true}`) | PASSA (idem) |
| T08 | Redirect externo após login | nunca sair da origem | PASSA (code review: `router.push` nunca faz `location.href`; pushState cross-origin é bloqueado pelo browser; destino estranho cai no catch-all `*`) | PASSA (idem) |
| T09 | Roles elevadas no token/localStorage | sem acesso à API (401/403) | PASSA — 403 (roles vêm da BD) | PASSA — 401 (adulteração detectada pelo hash) |
| T10 | Alteração de ID em recursos alheios | 403/404 + body ignorado | PASSA (owner rule + listas brancas + profile self-scoped) | PASSA (idem) |
| T11 | Sub-admin: política governa o recurso User | read/update 200 · create/delete 403 · roles 403 · stats/rules 403 · user comum 403 | — (não existia) | **PASSA** — subject `User` na fábrica; campo roles reservado ao role admin |
| T12 | Conta ALVO admin editada por quem não tem o role admin | 403/403 · registo intacto · admin edita admin 200 · sub-admin edita comum 200 | — (não existia; **v12.15 deixava 200** — escalada de credencial, EXP7) | **PASSA** — 403 antes da forma (`users.js` validateUpdate) |

**Resultado actual: 12/12 passam** (T08 por revisão de código — é navegação de
cliente, fora do alcance do harness server-side). T11 (sub-admin pela política)
e T12 (conta alvo admin) entraram na matriz à medida que a superfície cresceu.

O que a matriz FECHOU (e como):

1. **Identidade** — o token deixou de ser a credencial: é uma REFERÊNCIA (`jti`)
   a uma sessão do registry (`dev/mock/sessions.js`). Quem não passou por
   login/refresh não tem `jti`; quem altera o payload quebra o hash guardado na
   emissão (`hashPayload` em `token.js`). A identidade sai de `session.userId`
   (registry), NUNCA de `payload.sub`.
2. **Ciclo de vida** — login emite sessão nova; refresh RODA (revoga o jti
   antigo, emite outro); logout REVOGA; mudança de password REVOGA todas as
   sessões do utilizador (`PUT /profile` e `PUT /admin/users/:id`, via hook
   `afterUpdate` da fábrica `crud.js`).
3. **Validação única** — `sessions.validateSession()` é o tribunal de TODOS os
   pedidos (formato → jti emitido? → revogado? → payload intacto? → expirado?),
   chamado por `sessionOf()` em `helpers.js`: nenhuma rota valida sessão por
   conta própria. Expiração no relógio do SERVIDOR (registry), não no payload.
4. **Demos coerentes** — os `POST /api/__demo/expire|revoke` (só `debug`)
   mudam o estado da sessão NO SERVIDOR; os `$auth.demo*()` que reescreviam o
   token no cliente saíram (eram a única porta por onde o cliente falsificava
   uma sessão).

## Checklist do backend REAL (o que o template não pode dar)

1. **Tokens**: assinatura verificada no servidor (HS256/RS256); `sub`/`roles`
   do payload só confiáveis APÓS verificação; TTL curto.
2. **Refresh token separado** do access token, com rotação e revogação
   (denylist por jti ou versão de sessão por user); logout revoga. *(O mock
   já demonstra o ciclo completo: par access/refresh com TTLs próprios,
   rotação, revogação de família e detecção de reutilização.)*
3. **Passwords**: argon2id/bcrypt + salt; política real (comprimento,
   haveibeenpwned); rate limiting + lockout progressivo no `/login`; MFA onde
   fizer sentido.
4. **Autorização**: replicar a cadeia do `registerCrud` (401 → 403 role → 403
   política → 404 → 422) e as listas brancas `editable` por recurso; nunca
   confiar em campos de autoria/roles vindos do body.
5. **Audit log** de acções admin (política de permissões, users) e de
   401/403/422 por IP/user.
6. **Transporte**: HTTPS + HSTS; cabeçalhos `docs/07`; CORS mínimo (se a app
   e a API forem origens diferentes: origem exacta, sem wildcard, com
   credenciais só se estritamente necessário).
7. **Cookies** (se usados para sessão): `httpOnly; Secure; SameSite=Lax` (ou
   Strict) + token antiforgery em formulários/pedidos mutantes.
8. **Dependências**: manter o ritual [`VERSIONS.md`](../vendor/VERSIONS.md) (substituir ficheiro +
   SHA-256 no mesmo commit) e rever CVEs por lib a cada actualização.

## O que a v12.11 mudou (resumo do hardening)

| Mudança | Ficheiro | Risco que fecha |
| --- | --- | --- |
| `withCredentials: false` (antes `true`) | `src/core/http.js` | A05/A01 — superfície CSRF sem necessidade |
| Login sem credenciais demo fora de dev | `src/features/auth/LoginView.vue` | A07 — sugestão de credenciais em produção |
| Botões demo 401 só em `config.debug` | `src/features/auth/SessionPanel.vue` | A05 — UI de demo em produção |
| `$auth.demoExpireToken/demoRevokeToken` recusam fora de localhost | `src/core/session.js` | A05/A07 — sobrescrever sessão real com token de demo |
| axios 1.6.0 → 1.21.0 + SHA-256 em VERSIONS.md | `vendor/` | A06 — CVE-2025-27152 |
| Checklist de segurança no deploy | [`docs/07-producao.md`](07-producao.md) | A05 — cabeçalhos/HTTPS/mock no deploy |

## O que a v12.12 mudou (o servidor como autoridade da sessão)

| Mudança | Ficheiro | Teste/risco que fecha |
| --- | --- | --- |
| **Registry de sessões** (novo módulo): createSession/rotateSession/revokeSession/revokeUserSessions/validateSession | `dev/mock/sessions.js` (novo) | T01–T05 — identidade e ciclo de vida no SERVIDOR |
| Token = REFERÊNCIA (`jti`) + hash de integridade do payload na emissão | `dev/mock/token.js` | T01/T02/T09 — forjado/adulterado = 401 |
| `sessionOf()` valida contra o registry (identidade = `session.userId`, expiração do servidor) | `dev/mock/helpers.js` | validação ÚNICA para todas as rotas |
| Login emite sessão; refresh com ROTAÇÃO; logout REVOGA | `dev/mock/routes/auth.js` | T03/T04 — EXP6 fechado |
| Password nova revoga TODAS as sessões do utilizador | `dev/mock/routes/profile.js` + hook `afterUpdate` em `crud.js` usado por `routes/users.js` | T05 (próprio e por admin) |
| Model `session` + persistência das sessões no dump | `dev/mock/index.js` | sessões sobrevivem ao F5 (como um restart de backend com store) |
| Demos 401 via endpoints `POST /api/__demo/expire|revoke` (só `debug`) | `dev/mock/routes/auth.js` | demos agem sobre o estado REAL da sessão |
| `$auth.demo*()` removidos (o cliente já não reescreve tokens) | `src/core/session.js` | última porta de falsificação de sessão no cliente |
| SessionPanel pede expiração/revogação ao servidor; ProfileView sai para o login quando a password muda | `src/features/auth/SessionPanel.vue`, `src/features/auth/ProfileView.vue` | UX coerente com o ciclo de vida do servidor |
| Matriz de intrusão T01–T12 (baseline histórico 5/10 → estado actual 12/12) | harness Node contra `dev/mock/` | prova executável, re-runnable a cada mudança |

Conclusão histórica (v12.12): **não há vulnerabilidade explorável no plano cliente** (XSS,
sort, paginação, CSRF de Bearer, contorno de guard — todos provados seguros) e o
ciclo de identidade/sessão passou a ser **autoridade do servidor**, provado nessa
fase pela matriz T01–T10 (forjar, adulterar, reviver sessões mortas — tudo 401). O que
resta são (1) limitações de desenho do mock que só existem em dev (passwords em
claro, sem rate limiting) e (2) requisitos do backend real, documentados com
checklist em cima.

## O que a v12.13 mudou (par access/refresh fiel ao backend real)

O objectivo do mock é reproduzir com FIDELIDADE o servidor de produção — "apagar
`dev/` e apontar à API real" não deve mudar o contrato. Por isso o single-token
da v12.12 evoluiu para o PAR access/refresh que um backend real emite:

| Mudança | Ficheiro | O que fecha |
| --- | --- | --- |
| `createSessionPair()`: login devolve `{token, refreshToken, user}` — duas linhas no registry, MESMA `family` | `dev/mock/sessions.js` | par como num backend real (JWT curto + refresh opaco em store) |
| Linhas com `type` ('access'/'refresh') e `family`; `validateSession(schema, token, ignoreExpiry, expectType)` | `dev/mock/sessions.js` | os TIPOS não se misturam: refresh em rota comum = 401; access no `/refresh` = 401 (T03) |
| `sessionOf()`/`guard()` exigem access POR OMISSÃO — nenhuma rota esquecida aceita refresh | `dev/mock/helpers.js` | separação de credenciais mesmo em rotas futuras |
| `/refresh` só aceita REFRESH; ROTAÇÃO do par + **detecção de reutilização** (refresh rodado usado de novo => família morta => re-login) | `dev/mock/routes/auth.js` | T03 com detecção de roubo clássica |
| Logout revoga a FAMÍLIA (access + refresh de uma vez) | `dev/mock/routes/auth.js`, `sessions.js revokeSession/revokeFamily` | T04 com o par — nenhuma credencial sobrevive ao logout |
| Cliente guarda o par (`core/session.js`, chave `refreshToken`), interceptor manda o refresh no `/refresh` e sobrescreve SEMPRE o access nas rotas normais | `src/core/session.js`, `src/core/http.js`, `src/core/config.js` (chave `auth.refreshTokenKey`) | refresh single-flight fiel; fix do retry com header stale (refresh 200 + retry 401 provado em browser antes do fix) |
| `refreshTtl` no config (7 dias; access continua 120s) | `src/core/config.js`, `dev/mock/index.js` | TTLs separados como em produção |
| Matriz T03 reescrita (5 cenários de refresh); T04/T05 validam access E refresh | `scripts/intrusion-matrix.mjs` | prova executável do par nessa fase — 10/10 |

Verificação em browser real: access expirado naturalmente (120s) → `GET /books` 401
→ `POST /refresh` 200 (par rodado) → retry 200 — localStorage com access e refresh
NOVOS, sem logout nem flash de erro.

Conclusão (v12.13): o contrato de sessão do mock é o de um backend com **par
access/refresh, rotação, revogação de família e detecção de reutilização** —
apenas `dev/` sai no deploy; o fluxo cliente fica idêntico.

## O que a v12.16 mudou (a conta alvo admin)

A superfície da v12.14 (sub-admin pela política) deixou um caminho aberto que
EXP7 provou: a defesa de escalada da v12.14 cobria só o CAMPO `roles` — um
sub-admin (regra `update User`, sem o role admin) continuava a poder mudar o
NOME e a **PASSWORD** de uma conta ADMIN. O golpe é concreto: a password nova é
uma credencial que o EDITOR conhece, e o `afterUpdate` da fábrica revoga as
sessões do alvo — o admin perde a conta no pedido seguinte.

| Mudança | Ficheiro | Teste/risco que fecha |
| --- | --- | --- |
| **Defesa da conta alvo admin**: alvo com o role admin + editor sem o role? 403 (campo `target`) ANTES de qualquer validação de forma — cobre nome, password e roles | `dev/mock/routes/users.js` (validateUpdate) | T12 / EXP7 |
| UX que acompanha o servidor: a linha de uma conta admin fica SEM botão de editar para quem não tem o role admin (`canEditUser(u)` passa a ser função por linha) | `src/features/admin/UsersPanel.vue` | coerência UI/API (esconder é UX; a API nega por si) |
| T12 entra na matriz (12/12) | `scripts/intrusion-matrix.mjs` | regressão executável da defesa |

A regra de negócio que fica documentada: **a regra `update User` gere contas
COMUNS** — não é credencial sobre administradores. O admin mantém o poder sobre
contas admin (pares incluídos); o sub-admin mantém o update sobre contas comuns,
que é a função do seu cargo.
