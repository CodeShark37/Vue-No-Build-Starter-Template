# Vue No-Build Starter Template

**Versão:** v12.17.1

Starter template para apps **Vue 2.x** com Single File Components (`.vue`) carregados
directamente no browser. **Sem build step, sem Vue-CLI, sem Node.js** — só vendors UMD
em `vendor/` e módulos ES nativos em `src/`.

Inclui de origem: **sessão com autoridade no servidor e PAR access/refresh**
(registry de sessões: token como referência `jti` + hash de integridade; o access
curto vai em todos os pedidos e o refresh longo só no `/refresh`, com ROTAÇÃO e
detecção de reutilização; revogação no logout (família inteira) e na mudança de
password — matriz de intrusão T01–T12 verde,
re-runnable com `node scripts/intrusion-matrix.mjs`), refresh
automático single-flight, RBAC/ABAC server-driven (CASL) com política **editável
e reordenável** (drag & drop — a última regra que casa vence), CRUD factory no
mock para TODOS os recursos com seed, rota de
**Perfil** (o clique no nome na navbar: token, tempo de sessão, simular expirado e
gestão da própria conta), zonas de rotas com guard único, layout por feature (com
sidebar própria na zona admin), mock API completa (MirageJS) e uma **tabela genérica**
(`ui/DataTable.vue` — a ÚNICA tabela de listas do template: posts, books E o
painel de utilizadores do admin; ordenação/paginação server-side, edição inline guiada por
`meta.editable` e colunas ordenáveis/numéricas guiadas por `meta.sorts` — o
contrato todo vem do servidor —, tipos e reservas de input (`fieldTypes`/
`fieldDisabled`), slots para células/acções à medida e `meta.roleCounts` para
agregados do conjunto inteiro). Navbar com UM link por zona (`Recursos`
funde posts+books — as abas da zona fazem a sub-navegação) e a conta alvo ADMIN
só se edita pelo role admin (T12 — 403 antes da forma; a regra `update User`
gere contas comuns, não toma credenciais de administradores).
JSDoc nos módulos + `jsconfig.json`: IntelliSense no VSCode sem build nem TypeScript.

## Arranque em 3 passos

1. Clonar o repositório.
2. Servir a pasta por HTTP desde a **raiz do site** (ex.: Live Server). `file://` não funciona.
3. Abrir e entrar com `admin / admin123` ou `user / user123` (demo: também `editor / editor123`, `viewer / viewer123` e `subadmin / subadmin123` — o sub-admin gere utilizadores pela POLÍTICA, sem ser admin).

Para `history` é preciso *fallback* para `index.html`; em sub-caminho, `<base href="/">`.
Detalhes: [`docs/00-arranque.md`](docs/00-arranque.md)

## Estrutura (mapa)

```
index.html  env.js    shell + vendors (defer); env.js é o ÚNICO ficheiro do deploy
jsconfig.json          IntelliSense/JSDoc no editor — não é build, o browser ignora-o
vendor/     vendor-dev/           libs de produção vs libs/mock só de desenvolvimento
src/
  main.js                 raiz de composição: mock -> router -> permissões -> serviços -> store
  app/                    App.vue (<router-view> + estilos base), router.js, guards.js,
                          services.js ($http/$config/$auth/$perm/$api), store.js
  core/                   infra sem negócio: config, session, ability, http, loader, cache
  ui/                     genéricos: layouts/ (LayoutDefault, LayoutAuth, AdminLayout,
                          AppNavbar) + Ui* + DataTable (tabela genérica das listas)
  features/               UMA pasta por funcionalidade; index.js é o ÚNICO registo
    site/  auth/  content/  admin/   (content = posts + books numa zona)
dev/
  mock/                   servidor Mirage (index, token, sessions, helpers, crud, routes/, seeds/) — apagar em produção
docs/                     a documentação, um ficheiro por assunto
scripts/
  intrusion-matrix.mjs    matriz T01–T12 contra o código real (correr após cada mudança — doc 08)
  syntax-check.mjs        verificação de sintaxe dos .vue/.js (npm run check corre os dois)
```

Regra de colocação de componentes: usado por **1 feature** → vive dentro dela;
usado por **2 ou mais** → sobe para `src/ui/`.

## Documentação

| Doc | Assunto |
| --- | --- |
| [`00-arranque.md`](docs/00-arranque.md) | 3 passos, servidor, debug, utilizadores demo |
| [`01-como-funciona.md`](docs/01-como-funciona.md) | árvore, boot, camadas, doutrinas, desempenho |
| [`02-nova-pagina.md`](docs/02-nova-pagina.md) | acrescentar uma página a uma feature |
| [`03-nova-feature.md`](docs/03-nova-feature.md) | o contrato de feature e o registo único |
| [`04-falar-com-a-api.md`](docs/04-falar-com-a-api.md) | `$api` por feature, `$http`, 401/403/422 |
| [`05-login-e-permissoes.md`](docs/05-login-e-permissoes.md) | sessão, guard, política CASL como dado |
| [`06-mock-api.md`](docs/06-mock-api.md) | MirageJS, seeds, tabela completa de endpoints |
| [`07-producao.md`](docs/07-producao.md) | deploy: `env.js`, o que apagar, cache, VERSIONS |
| [`08-seguranca.md`](docs/08-seguranca.md) | auditoria OWASP Top 10, segurança de rotas e de sessão |
| [`09-convencoes-de-rotas.md`](docs/09-convencoes-de-rotas.md) | convenção de zonas/rotas/meta e o estudo por trás |

## Dependências (vendored)

Vue 2.6.12 · VueRouter 3.0.0 · Vuex 3.6.2 · VueHead 2.2.0 · vue2-sfc-loader 0.9.5 ·
Axios 1.21.0 (CVE-2025-27152 corrigida) · CASL 6.7.1 · MirageJS 0.1.48 (dev). Origem + SHA-256: [`vendor/VERSIONS.md`](vendor/VERSIONS.md).

## Showcase

![login view](docs/img/LoginView.png)

![content view](docs/img/PostsView.png)

![profile view](docs/img/ProfileView.png)


## Contribution

Be free to **open issues** for requesting *new features*, or **pull requests** to add *new features*.
