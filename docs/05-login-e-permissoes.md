# 05 — Login e permissões
> **Navegação:** [README português](../README.md) · [README english](../README.en.md) · [Anterior](04-falar-com-a-api.md) · [Seguinte](06-mock-api.md) · [English](05-login-e-permissoes.en.md)

## Sessão: uma fonte única

`core/session.js` é o ÚNICO módulo que lê/escreve a sessão (`localStorage`: chaves de `config.auth`). Guard, interceptor e vistas perguntam todos a ele; é reactivo (`Vue.observable`), por isso nav e vistas acompanham login/logout/refresh sem eventos manuais.

**A autoridade sobre a identidade e o ciclo de vida da sessão é o SERVIDOR**: o token é uma REFERÊNCIA (`jti`) a uma sessão no registry do mock (`dev/mock/sessions.js`) — um backend real teria a mesma tabela (ou Redis). O cliente descodifica o payload SÓ para UX (quem está autenticado, quando expira); a validade decide-a sempre o servidor: 401 para tudo o que não emitiu (forjado/adulterado — o payload tem um hash registado na emissão), revogado no logout, revogado na mudança de password, rodado no refresh.

- **Login**: `POST /login` → PAR access/refresh NOVO no registry → `setSession(token, user, refreshToken)` → o guard devolve o utilizador a `?redirect=` (guardado pelo próprio guard).
- **Logout real**: botão "Sair" na navbar (junto do nome) — `POST /logout` **REVOGA a sessão no servidor** (o token antigo dá 401 em qualquer pedido seguinte) + `clearSession()` + `/login`.
- **Guest**: `meta: { guest: true }` no `/login` manda para a raiz quem já tem sessão.
- **Perfil**: o NOME do utilizador na navbar é o link para `/profile` — a rota que concentra as informações da sessão (token, tempo que falta, simular expirado/revogado — o `SessionPanel` vive aqui) e a gestão da PRÓPRIA conta: `PUT /profile` muda nome, username e password (vazio = manter). Self-scoped por construção: o servidor escreve só no utilizador da sessão; as contas dos outros continuam na zona admin, e as roles são intocáveis por aqui (auto-escalada → 422). Mudar a password REVOGA todas as sessões da conta (inclusive a corrente) — a app sai limpa para o login.

## Fluxo do token (espelha um backend JWT real)

```
view ── GET /me ──▶ 401 token_expired ──▶ POST /refresh ──▶ novo token (rotação: jti antigo revogado) ──▶ retry GET /me ──▶ 200
                                        └─▶ 401 (revogada: logout, password, rotação) ─▶ clearSession ─▶ /login?redirect=…
view ── DELETE /posts/1 (alheio) ──▶ 403 forbidden ──▶ mensagem inline, sessão mantida
```

- `401 invalid_token` (token forjado/adulterado/revogado — ou utilizador fantasma), `401 token_expired` (passou a expiração do REGISTRY), `403 forbidden` (sessão válida, mas a política/role não permite — ler incluído).
- No `401` o interceptor chama `POST /refresh` **uma vez** (401 paralelos partilham o mesmo refresh em curso — single-flight) e **repete o pedido**: a vista nem nota. Um 401 no próprio `/login` nunca despoleta o ciclo.
- **O refresh é um token SEPARADO**: o login devolve o PAR access/refresh — o access (120s) vai em todos os pedidos; o refresh (7 dias) só existe para o `POST /refresh` (o interceptor manda-o lá; usá-lo noutra rota dá 401). Os tipos não se misturam.
- **A rotação tem efeito real**: cada refresh revoga o par antigo e emite o novo — reutilizar um refresh JÁ RODADO mata a família inteira (detecção de roubo clássica de refresh tokens: um ladrão e o dono legítimo disputam, o segundo leva 401 → re-login).
- **Integridade memória ↔ localStorage (detecção imediata de adulteração)**: o token vive numa variável reactiva EM MEMÓRIA, lida do localStorage só no arranque — editar o token no DevTools com a app a correr não altera os pedidos até ao próximo F5. Para expulsar essa sessão cedo, `auth.storageIntact()` compara token, refresh e perfil da memória com o localStorage e é fail-closed: qualquer divergência → `clearSession()`. É verificada em DOIS pontos: o passo 0 do guard (cada navegação) e um watcher de 1.5s em `app/router.js` (apanha mesmo sem navegar) — redirect para `/login?redirect=<rota>` sem esperar pelo 401. O servidor continua a ser a autoridade: o token adulterado nunca seria aceite (hash do token completo no registry, T13/T01/T09).

## Guard: rotas declaram, um guard avalia

O guard avalia, por ordem: `requiresAuth`/`perm` sem sessão → `/login?redirect=…`; `guest` com sessão → `/`; `roles` sem o role → `/403` **sem logout** ("sem permissão" ≠ "sem sessão"); `perm: {action, subject}` sem a **abilidade CASL do servidor** → `/403` — a rota declara a PERMISSÃO exigida (ex.: `/admin/users` pede `read User`), o guard espera pelo sync (`$perm.ready()`) e decide com as regras que o servidor serve. É o que abre a porta a **sub-admins**: o role `subadmin` do seed tem `read`+`update` sobre `User` — entra na zona admin e gere contas **comuns**, mas não cria/elimina, o campo `roles` é reservado ao role admin (403, defesa de escalada em `dev/mock/routes/users.js`) e uma CONTA admin só se edita pelo role admin (403 antes da forma — T12/EXP7: sem isto, o sub-admin tomava a conta do admin pela password nova).

`to.matched` percorre a cadeia: a meta do PAI da zona cobre os filhos — vistas nunca verificam sessão.

## Permissões: CASL, server-driven — DADO, não código

`GET /api/permissions` devolve as regras do utilizador em JSON; `core/ability.js` constrói a `casl.Ability` e as vistas perguntam `this.$perm.can(action, subject, object?)`. É reactivo e **fail-closed**: sem regras, nenhuma acção visível.

A política é um **dado**: `dev/mock/seeds/permissions.js` guarda `roleRules` (por role) e o mock carrega-a para a BD no boot; os handlers re-leem a BD **a cada pedido** — como um backend real faz com a sua tabela central de política.

- `admin` → `[ { action: 'manage', subject: 'Post' } ]` — tudo, sem condições.
- `user` → read + create sempre; update/delete com a **regra owner**:
  `{ action: 'update', subject: 'Post', conditions: { authorId: '${user.id}' } }`.

A regra owner, explicada:

- Regra **sem** `conditions` vale para todos os objetos do subject; **com** `conditions`, só para os que casam — "só posts cujo `authorId` sou eu".
- **Por id, não por username**: o id é único e imutável; um username podia ser renomeado — e é (rota `/api/profile`): não parte nada, porque a política referencia o `authorId`. O post guarda ambos — `author` (nome, para mostrar) e `authorId` (para a política, gravado na criação pela fábrica `crud.js`).
- `'${user.id}'` é um **placeholder**: o mock resolve-o com a sessão antes de responder (`materializeRules()` em `dev/mock/helpers.js`, que aceita qualquer campo `user.*`) — cada utilizador recebe regras concretas e o seed fica genérico: novas contas ganham owner rules com zero código. Campo desconhecido → `undefined` → a condição nunca casa (fail-closed).
- Contornar a UI não muda nada: a política vale NO SERVIDOR — PUT/DELETE num post alheio continua **403**, e sem regra `read` nem `GET /posts` passa (o mock constrói a mesma Ability CASL do cliente, em `helpers.abilityFor`). Os botões são UX; a API é a autoridade.
- **Zonas vs CASL a propósito**: rotas usam `meta.roles` (declarativo); CASL governa acções de objecto (`update Post #7`). Duas camadas, cada uma no seu sítio.
- **Navbar: o link é navegação, não política** — `Recursos` (posts e livros) é SEMPRE visível (até a guest: clicar nele sem sessão cai no login com `?redirect=`). O que a política governa é o RECURSO: a tabela mostra/esconde acções por `$perm.can(...)` e a API responde 403 — esconder o link seria esconder a rota inteira, e é o recurso que tem permissão.
- **A própria conta é self-service**: `GET/PUT /api/profile` — gerir a TUA conta é direito da sessão autenticada (401 sem ela); gerir as contas DOS OUTROS é a zona admin (`/api/admin/users` — a regra sobre `User` decide: o admin gere tudo, o sub-admin gere contas comuns). Roles nunca no perfil: dar-se admin a si próprio seria auto-escalada (422).

## Inspecção e edição da política (só admin)

- A zona admin inteira vive num cromo próprio (`AdminLayout`): navbar + **sidebar** com as três secções — Visão geral (`/admin/stats`), Utilizadores (`/admin/users`), Permissões (`/admin/permissions`). O menu de topo tem um único link "Admin"; `/admin` nu redireciona para `/admin/users`. O UsersPanel lista TODOS os utilizadores com as suas roles (badges por linha + resumo "roles existentes: admin (1), user (1)" — quantos existirem).
- `/admin/stats` mostra `UserPermissions`: escolhe-se um utilizador e vê-se as regras que o servidor LHE entrega, já materializadas (`GET /api/permissions/:id`, em que `:id` é o **ID do utilizador**; 403 para não-admin, 404 para id desconhecido). A listagem vem NA ORDEM DE AVALIAÇÃO (com número e badge `cannot`).
- `/admin/permissions` (`PermissionsView` + `RulesPanel`) faz o **CRUD da política crua** em `/api/rules`: a mesma tabela, mas com os placeholders intactos — editar aqui é editar a tabela que um backend real teria. Depois de cada mutação, o painel re-sincroniza a Ability (`$perm.sync()`): botões e links acompanham sem recarregar.

## A ordem das regras é permissão efectiva (drag & drop)

No CASL, quando **duas regras casam o mesmo (acção, subject), a ÚLTIMA é que vence** — a validação dá preferência à regra mais recente. Por isso a política tem um campo `position` (ordem de avaliação) e o RulesPanel deixa **reordenar por drag & drop** (HTML5 nativo, sem vendor novo): arraste pela alça `☰`; no drop faz-se `PUT /rules/order` com TODOS os ids (o servidor valida o conjunto completo — 422 e nada muda se faltar/sobrar id).

Para ver a ordem a ACTUAR serve uma regra de negação: `inverted: true` (o `cannot` do CASL, badge vermelho na tabela; checkbox "negar (cannot)" no formulário).

```
política do role user (ordem de avaliação, # crescente)
  3. update Post  conditions { authorId: '${user.id}' }   <- owner rule
  8. update Post  inverted: true                          <- cannot, sem condições
=> a 8.ª casa TAMBÉM e é a última: vence. O user perde update em TODOS os posts.

o mesmo cannot arrastado para ANTES da owner rule
  3. update Post  inverted: true
  4. update Post  conditions { authorId: '${user.id}' }
=> agora a owner é a última: vence. O user volta a editar os PRÓPRIOS posts.
```

Regras de experiência: uma regra nova nasce em **último lugar** (criar um `cannot` e não o mover = negou logo); mover um `cannot` para o TOPO enfraquece-o (fica atrás de tudo e raramente vence); conditions de negação existem na mesma — `cannot update Post` com conditions `{ authorId: '${user.id}' }` tira ao utilizador só os PRÓPRIOS posts.

- Mudar a política = mudar o DADO. Duas formas: o seed `roleRules` (o **estado inicial** que o mock carrega no boot) ou o CRUD admin acima — as duas escrevem no mesmo sítio, a BD do mock, que é relida a cada pedido. Validações (422) e a auto-protecção do role `admin` (nunca fica sem regras) vivem na API, não na UI. O efeito é imediato nas rotas de posts: tirar a regra `read Post` ao role `user` tranca o `GET /posts` dele com **403** já no pedido seguinte (a Ability de quem estava logado só re-sincroniza no reload/re-login — a UI acompanha; a API nunca dependeu dela).
