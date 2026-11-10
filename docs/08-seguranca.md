# 08 — Segurança (auditoria OWASP Top 10, rotas e sessão)
> **Navegação:** [README português](../README.md) · [README english](../README.en.md) · [Anterior](07-producao.md) · [Seguinte](09-convencoes-de-rotas.md) · [English](08-seguranca.en.md)

Auditoria de segurança actual do template, feita como **hacker ético**: cada achado foi provado com um exploit executado contra a app. O ciclo de identidade/sessão é validado pela **matriz de intrusão T01–T13**, executada contra o mock com um harness Node que importa o código real. A auditoria confirma a doutrina central: **a UI esconde, a API decide**; a autoridade sobre a identidade e o ciclo de vida da sessão é o servidor (registry de sessões).

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
| EXP1 | Token forjado `mrg.<payload>.mock` chamado a `GET /api/admin/stats` | HTTP 401: um token sem `jti` emitido pelo registry é rejeitado | Não explorável no mock: identidade baseada no registry |
| EXP2 | Ler o dump `mock-db-*` do localStorage | Só contém `passwordHash` PBKDF2-HMAC-SHA256 em formato PHC; passwords em claro ficam no provisionamento e no corpo do login | Controlado no mock; um backend real deve usar argon2id/bcrypt com salt aleatório |
| EXP3 | Spoof de roles em `localStorage.user` | A UI pode mostrar Admin, mas a API responde 403 ao utilizador sem permissão | A API revalida sempre no servidor |
| EXP4 | XSS no título de um post | O texto é escapado; não são criados elementos HTML | Não explorável: não há `v-html` na app |
| EXP5 | Ordenação/paginação fora dos limites | `per_page` é limitado a 50 e `sort`/`order` usam listas brancas | Não explorável no mock |
| EXP6 | Refresh de sessão expirada | Só uma sessão existente e não revogada pode renovar; a rotação invalida o par anterior | Não explorável no mock |
| EXP7 | Sub-admin edita conta com role admin | HTTP 403 antes da validação de forma | Não explorável: contas admin só são editáveis por admin |
| EXP8 | Adulterar o token no localStorage | HTTP 401 `invalid_token` e logout imediato; o refresh não cura credenciais quebradas | Não explorável no mock |

## OWASP Top 10 (2021), item a item

### A01 — Broken Access Control

**Bom (proado no EXP3/EXP5):**
- Toda a escrita e leitura do mock passa pela cadeia única `registerCrud`
  (`dev/mock/crud.js`). A ordem de erros é POR OPERAÇÃO — o que o código faz de
  facto (ver `crud.js`):
  - LISTA: guard 401/403 → 403 se o role não tem NENHUMA regra de leitura do
    tipo → filtro ABAC por conditions nos registos → 200. Nunca há 404/422.
  - DETALHE / PUT / DELETE: guard 401/403 → procura do registo (**404** se não
    existe) → política CASL SOBRE a instância (**403** se existe mas a política
    nega — owner rule) → validação quando aplicável (422).
  - POST: guard 401/403 → permissão `create` ao nível do tipo (403) →
    validação de forma (422) → 201.
  Um PUT/DELETE sobre post alheio responde 403 mesmo com a UI contornada. Nota
  de contrato: a 403 sobre um registo existente revela que o id EXISTE — é
  deliberado (a UI nunca mostra acções que a política nega); ocultar existência
  exigiria 404 uniforme, a custo de diagnósticos piores.
- `PUT /profile` é **self-scoped por construção**: escreve sempre no user da
  SESSÃO e ignora qualquer `id` no body — não há caminho para editar outro
  utilizador.
- Listas brancas anti mass-assignment: `editable: ['title','body']` nos posts
  (autoria nunca editável), `['title','author']` nos books (`creatorId` nunca),
  `['name','password','roles']` nos users (só por admin, com self-lockout: um
  admin não muda as próprias roles nem se elimina — 422).
- **Conta alvo admin (estado actual)**: uma conta com o ROLE admin só se edita pelo
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

**Características e limites do mock:**
- O token usa um hash de detecção sobre a string completa, não uma assinatura criptográfica. Um backend real deve assinar o token (HS256/RS256) e verificar a sessão ou denylist.
- A proteção de `localStorage` antecipa a expulsão local; a API continua a ser a autoridade e revalida o token.
- O mock é exclusivo de desenvolvimento e deve ser removido do deploy.

### A02 — Cryptographic Failures

- Passwords: o que dorme na BD/dump é SÓ `passwordHash` (PBKDF2-HMAC-SHA256,
  formato PHC `algo$iter$sal$hash`, estado actual — `dev/mock/password.js`); a password
  em claro existe apenas no campo do formulário, no corpo do `POST /login` e no
  script de provisionamento (`seeds/users.js` `demoAccounts`, o equivalente do
  `.env`). Limitações assumidas do mock: PBKDF2 síncrono (o Mirage tem handlers
  síncronos — argon2id precisa de async/WASM) e sal determinístico por conta
  (os seeds são assinados; sal aleatório quebraria a persistência do dump). Um
  backend real usa argon2id/bcrypt com sal aleatório.
- `publicUser()` é a única forma de saída do user: a password e o seu hash
  NUNCA saem por nenhuma rota (listas, detalhes, login, refresh, profile).
- FNV-1a na assinatura do dump e o **hashToken (FNV-1a+DJB2)** da integridade
  do token sobre o TOKEN COMPLETO são explicitamente
  NÃO-criptográficos: detectam alteração (dump stale / token adulterado em
  QUALQUER segmento), não impedem colisão deliberada de 64 bits — o comentário
  no código diz-o. A assinatura REAL é do backend (HS256/RS256).
- Sem segredos no código cliente (nada para vazare): a app não tem chaves de
  API; tudo o que é sensível pertence ao backend real.
- Transporte: em produção exige HTTPS + HSTS (`docs/07`); o token anda no
  header `Authorization` de todos os pedidos.

### A03 — Injection

- **XSS (prova EXP4)**: zero `v-html`/`innerHTML`/`eval` no código da app em
  `src/` e nos templates Vue (verificado por grep); Vue 2 escapa toda a
  interpolação `{{ }}`; os slots da DataTable renderizam componentes, não HTML
  cru. O fallback estático do `index.html` para browsers sem módulos usa
  `textContent` (nada de HTML construído em lado nenhum).
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

- **Corrigido na estado anterior:**
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

- **Corrigido na estado anterior: axios 1.6.0 → 1.21.0.** A 1.6.0 estava dentro do
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
- Processo de integridade: `vendor/VERSIONS.md` com origem + SHA-256 de TODOS
  os vendors (verificação por `sha256sum`) — padrão acima da média para
  templates vendored.

### A07 — Identification and Authentication Failures

- Login devolve sempre `invalid_credentials` genérico (sem enumerar contas).
- `autocomplete="username"`/`"current-password"` correctos; nova password com
  `autocomplete="new-password"` (ProfileView).
- Token mock: access TTL curto (120s) + refresh (7 dias), single-flight no interceptor (um só
  POST /refresh para N pedidos paralelos; retry único por pedido).
- **Corrigido na estado anterior (o servidor é a autoridade da sessão):**
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
- Credenciais demo não se sugerem mais fora de dev (estado anterior).
- Logout: **server-side** desde a estado anterior (revogação); o cliente limpa a sessão
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
  SSRF por URL absoluta — eliminado pela actualização estado anterior.)

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
1. TODAS as rotas protegidas usam `guard()` (401) — escrito uma vez, chamado
   em todas. `guardOpts {admin:true}` (403 por ROLE) só onde a zona é
   reservada ao role admin: `/api/admin/stats` e `/api/rules`. A gestão de
   utilizadores (`/api/admin/users`) NÃO é admin-only: é governada pela
   política CASL do subject `User` (subadmin lê/edita contas comuns; criar,
   eliminar, alterar roles e editar contas admin ficam fora — EXP7/T12).
2. Política CASL aplicada por pedido: tipo (403 sem regra nenhuma) e instância
   (conditions filtram lista/negam registo).
3. Ordem de erros POR OPERAÇÃO (detalhe no A01): LISTA 401 → 403 → 200;
   DETALHE/PUT/DELETE 401 → 404 → 403 → 422; POST 401 → 403 → 422. A 403 de
   instância revela existência do registo — decisão deliberada de contrato.
4. `registerCrud` é o único caminho de CRUD — a cadeia não se reescreve por
   recurso (uma só implementação a auditar).

## Segurança de SESSÃO (estado actual e limitações)

| Aspecto | Estado no template | Nota de segurança |
| --- | --- | --- |
| Armazenamento | Access token + refresh token + perfil em `localStorage` (único módulo que os toca: `core/session.js`; o refresh NUNCA viaja nos pedidos normais — só no `POST /refresh`) | Legível por qualquer XSS. Para produção: cookies `httpOnly; Secure; SameSite` OU `sessionStorage` + TTL curto, conforme o backend |
| Emissão | `POST /login` → **PAR access/refresh NOVO no registry** (`sessions.js`, mesma `family`) + tokens que os referenciam (`jti`) | O servidor só confia no que EMITE; backend real: JWT assinado + verificação server-side |
| Tipos de credencial | **access** (curto, todos os pedidos) e **refresh** (longo, só `/refresh`) — os TIPOS não se misturam em nenhuma rota (`validateSession` expectType; omissão = access) | Refresh usado numa rota comum = 401; access no `/refresh` = 401 (T03) |
| Integridade do token | Hash do TOKEN COMPLETO registado na emissão (`hashToken`); qualquer byte alterado, payload OU invólucro, = 401 | T01/T09/T13: adulterar roles/sub/exp, trocar o sufixo `.mock` ou re-codificar o b64 não muda nada — 401 `invalid_token` |
| Expiração | Access 120s; refresh 7 dias (`refreshTtl`); a validade REAL vive no REGISTRY (relógio do servidor); cliente calcula `exp` do access para UX | `isExpired()` é indicador de UX; a decisão é sempre do servidor (401) |
| Renovação | Interceptor: 401 `token_expired` → `POST /refresh` COM O REFRESH TOKEN, single-flight → repete o pedido com o access novo; falha → logout + redirect. **401 `invalid_token` NÃO despoleta refresh: logout imediato** (fail-closed) | ROTAÇÃO do PAR — o refresh antigo e os access da família revogam-se; REUTILIZAR um refresh já rodado mata a FAMÍLIA inteira (detecção de roubo, T03); uma credencial QUEBRADA (adulterada/forjada/revogada) expulsa em vez de ser "curada" |
| Revogação | **Existe**: logout revoga a FAMÍLIA (access + refresh juntos, T04); mudança de password revoga TODAS as sessões do utilizador (T05); linha fica como denylist no registry | o ciclo de vida é controlado pelo servidor |
| Morte da conta | Apagar o user mata o token no pedido seguinte (userById falha → 401 `invalid_token` → logout imediato no cliente) — e as sessões ficam revogadas | Comportamento correcto e demonstrado no mock |
| Fixação | Login emite SEMPRE sessão nova (jti novo, sem reutilização) | OK |
| Spoof de perfil | `localStorage.user` spoofável (EXP3) — UI engana-se, API não | Por desenho; a regra "a UI esconde, a API decide" é o que mantém isto seguro |

## Matriz de testes de intrusão T01–T13

| ID | Teste | Critério de aprovação | Estado actual |
| --- | --- | --- | --- |
| T01 | Token adulterado (roles elevadas / exp prolongada) | 401 | PASSA — hash do token completo |
| T02 | Token com ID de administrador forjado | 401 | PASSA — `jti` não emitido |
| T03 | Refresh, rotação e reutilização | forjado/tipo errado 401; expirado renova; reutilização mata a família | PASSA |
| T04 | Token antigo após logout | 401 para access e refresh | PASSA — família revogada |
| T05 | Token antigo após alteração de password | 401 | PASSA — todas as sessões revogadas |
| T06 | Login inválido com sessão anterior | sessão anterior intacta | PASSA |
| T07 | API administrativa com role insuficiente | 403 | PASSA |
| T08 | Redirect externo após login | nunca sair da origem | PASSA por revisão de código |
| T09 | Roles elevadas no token/localStorage | sem acesso à API | PASSA — 401 |
| T10 | Alteração de ID em recursos alheios | 403/404 e body ignorado | PASSA |
| T11 | Sub-admin no recurso `User` | política read/update sem criação, eliminação ou alteração de roles | PASSA |
| T12 | Conta admin editada por não-admin | 403 e registo intacto | PASSA |
| T13 | Adulteração do invólucro do token | 401 `invalid_token` | PASSA — hash sobre o token completo |

**Resultado actual: 13/13 passam.** T08 é validado por revisão de código; os restantes testes executam o código real do mock no harness Node.

A matriz confirma que a identidade vem de `session.userId` no registry, que a validade é decidida pelo relógio do servidor, que a rotação e a revogação são server-side e que `401 invalid_token` não desencadeia refresh.

## Checklist do backend REAL

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
8. **Dependências**: manter o ritual `VERSIONS.md` (substituir ficheiro +
   SHA-256 no mesmo commit) e rever CVEs por lib a cada actualização.
