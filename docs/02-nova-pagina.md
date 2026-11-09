# 02 — Nova página (numa feature existente)
> **Navegação:** [README português](../README.md) · [README inglês](../README.en.md) · [Anterior](01-como-funciona.md) · [Seguinte](03-nova-feature.md) · [English](02-nova-pagina.en.md)

Para acrescentar uma página a um domínio que já existe, só se toca na pasta da feature.

## Passos

1. Criar a vista em `src/features/<feature>/XView.vue` (vista fina: estado + chamadas por `this.$api.<feature>`; apresentação em componentes — reutilizar os que já existem antes de escrever markup novo).
2. Registá-la como FILHA da zona certa no `src/features/<feature>/index.js`:

```js
children: [
    { path: 'posts', name: 'ContentPosts', component: lazy('src/features/content/PostsView.vue') },
    { path: 'arquivo', name: 'ContentArquivo', component: lazy('src/features/content/ArchiveView.vue') }, // novo
],
```

## Porquê isto chega

- **Meta no PAI cobre os filhos**: o guard percorre `to.matched`, por isso uma página dentro de `/content` ou `/admin` não precisa de meta própria (excepção: `meta: { guest: true }` para páginas só-de-guest como o login).
- **Cada vista só se pede e compila quando visitada** (`lazy()`), e o URL na tabela continua a ser relativo à zona.
- **Título da página**: as vistas usam `vue-head` — bloco `head: { title: { inner, separator, complement } }`.
- **Nomes de rota**: PascalCase com prefixo da zona (`ContentPosts`, `AdminUsers` — convenção completa em `09-convencoes-de-rotas.md`).

## Regras de ouro

- O **catch-all `*`** (404) tem de ficar EM ÚLTIMO na tabela — é o `fallback` do site, concatenado por último em `features/index.js`. Nunca acrescentar rotas depois dele.
- Se a página precisa de um componente novo usado **só por esta feature**, ele fica na pasta dela. Se for usado por **2 ou mais features**, sobe para `src/ui/` (ver `01-como-funciona.md`).
- Sem sessão/permissões à mão: `this.$auth.isLoggedIn()`, `this.$perm.can(action, subject, object?)` — ver `05-login-e-permissoes.md`.
