# 04 — Falar com a API
> **Navegação:** [README português](../README.md) · [README inglês](../README.en.md) · [Anterior](03-nova-feature.md) · [Seguinte](05-login-e-permissoes.md) · [English](04-falar-com-a-api.en.md)

## Um só padrão de acesso nos componentes

Nos `.vue` NÃO se importam `.js` locais (o loader compilaria uma 2ª cópia do módulo). Tudo chega por `this`:

| Serviço | Módulo | Uso típico |
| --- | --- | --- |
| `this.$api.content.posts.list(...)` | `makeApi('/posts')` em `features/content/index.js` | endpoints do domínio (CRUD canónico) |
| `this.$api.content.books.remove(id)` | `makeApi('/books')` em `features/content/index.js` | idem |
| `this.$api.admin.updateRule(...)` | `features/admin/api.js` | zona admin (domínio não canónico — funções à mão) |
| `this.$http` | `core/http.js` | só chamadas fora do `$api` (ex.: `/profile` usa `$http` directo) |
| `this.$auth` | `core/session.js` | `isLoggedIn()`, `user`, `hasRole()`, `setSession()`, `clearSession()` |
| `this.$perm` | `core/ability.js` | `can(action, subject, object?)` |
| `this.$config` | `core/config.js` | valores derivados (destinos do guard, etc.) |
| `this.$store` | `app/store.js` | estado global partilhado (módulos namespaced) |

## API do domínio: `makeApi` é o padrão

**No código fica só a melhor forma.** Para um domínio CRUD canónico (lista/detalhe/criar/editar/apagar sobre um path), o módulo de API nasce de uma linha — `api: makeApi('/posts')` no `index.js` da feature — e nada se escreve à mão:

```js
// features/content/index.js — na zona, cada domínio é uma chave do namespace
import { makeApi } from '../../core/http.js';
export default {
    name: 'content',
    api: { posts: makeApi('/posts'), books: makeApi('/books') }, // list/get/create/update/remove sobre /api/posts e /api/books
    routes: [ /* … */ ],
};
```

O `makeApi` gera os 5 verbos finos sobre o MESMO axios de `core/http.js` — logo com a mesma política de sessão (Bearer anexado, 401 → refresh single-flight → retry). As funções geradas (o `get` incluído — o demo vivo é o botão Detalhe da BooksView, via slot `actions` da DataTable):

| Função | Pedido |
| --- | --- |
| `list(params?)` | `GET <path>` com `?page&per_page&sort&order` |
| `get(id)` | `GET <path>/:id` |
| `create(data)` | `POST <path>` |
| `update(id, data)` | `PUT <path>/:id` |
| `remove(id)` | `DELETE <path>/:id` |

- **URLs vivem num sítio só**: mudar `/posts` é mudar a linha do `makeApi`.
- **Registo**: `features/index.js` junta as `api` das features num objecto por nome — `this.$api.posts`, `this.$api.admin`. Adicionar uma feature é 1 linha; não há `$api` registado em mais nenhum sítio.
- **`auth` não entra no `$api`**: login/refresh/logout/me são ciclo de SESSÃO — vivem em `core/session.js` e o interceptor do `core/http.js` usa-os directamente. Se houvesse `$api.auth`, o core teria de importar features (doutrina: core não conhece nada).

## Quando o domínio NÃO é canónico: `api.js` à mão

O `makeApi` só cobre o padrão `list/get/create/update/remove` sobre um path. **Não força** domínios com outra forma — esses escrevem um `api.js` próprio com funções finas à mão. Sinais de que precisa de um:

- **Endpoints que não caem nos 4 verbos**: acções de sub-recurso (`POST /posts/:id/publish`), pesquisa (`GET /posts/search?q=`), operações sobre a COLECÇÃO (`PUT /rules/order` — o drag & drop da política), agregações (`GET /admin/stats`);
- **Dois recursos no mesmo domínio** (`/admin/users` + `/permissions/:id` + `/rules` vivem todos no `api.js` do admin);
- **Contratos de resposta diferentes** do envelope paginado que as vistas esperam.

A forma é sempre a mesma — funções de UMA linha que devolvem a promessa do axios e nada mais; erros/loading são da vista (o `catch` decide: 403 "sem permissão" mantém a sessão, ver `05`):

```js
// features/admin/api.js (exemplo vivo no código — lá é NECESSÁRIO, não didáctico)
import http from '../../core/http.js';

/** Política CRUA, por position — a ordem de avaliação CASL (a última vence). */
export function listRules() { return http.get('/rules'); }

/** REORDENA a política: { ids } com TODOS os ids na nova ordem. */
export function reorderRules(ids) { return http.put('/rules/order', { ids: ids }); }

/** Regras efectivas de um UTILIZADOR, já materializadas com os dados dele. */
export function permissionsOf(userId) { return http.get('/permissions/' + userId); }
```

Regras do api.js à mão:

1. **Funções finas de propósito** — sem estado, sem `.then` dentro; quem chama decide o que fazer com o sucesso/erro.
2. **JSDoc com o contrato** — códigos de erro esperados (403 sem a regra X, 422 validação Y) e forma da resposta; é a documentação que o editor mostra.
3. **Nomes por domínio, não por verbo HTTP** — `reorderRules(ids)` diz mais que `putRulesOrder`.
4. **Nunca importar `core/http.js` dentro de `.vue`** — o api.js é `.js`, importa-o uma vez; a vista consome `this.$api.<feature>`.

> **Porquê esta política (código enxuto, didáctica nos docs)?** O código guarda UMA forma — a melhor para cada caso; as alternativas ficam AQUI, com a explicação de quando valem. Um exemplo didáctico em código de produção é custo permanente (manutenção dupla, duas formas de fazer a mesma coisa sem critério claro de escolha).

## Erros: quem é a autoridade

- **401** — "não sei quem és": o interceptor tenta `POST /refresh` UMA vez COM O REFRESH TOKEN (single-flight: 401 paralelos partilham o mesmo refresh), repete o pedido com o access novo; se falhar, limpa a sessão e vai para `/login?redirect=…`. Nada disto é código da vista.
- **403** — "sei quem és, mas não podes": **nunca** limpa sessão nem navega; a vista mostra mensagem inline.
- **422** — validação: o corpo traz `{error, field, message?}`; os painéis mostram-no inline.
- **Edição server-driven**: a listagem traz `meta.editable` — os campos que o PUT aceita. A UI desenha os formulários a partir daí (`ui/DataTable.vue`); mudar a lista branca no mock muda a UI sem tocar em vistas. Esconder um botão com `$perm.can(...)` é **UX**; a API continua a responder 403 a quem não pode — defesa em profundidade (ver `05-login-e-permissoes.md`).

## Lista completa de endpoints

Ver `06-mock-api.md` (tabela com auth, respostas e validações).
