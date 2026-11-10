# 07 — Produção
> **Navegação:** [README português](../README.md) · [README inglês](../README.en.md) · [Anterior](06-mock-api.md) · [Seguinte](08-seguranca.md) · [English](07-producao.en.md)

## O único ficheiro a mudar: `env.js`

```js
window.ENV = {
    apiBase: 'http://localhost/api/',  // apontar para a API real ('' ou '/api/' = mesma origem)
    mock: false,                       // sem Mirage: os pedidos vão para apiBase
    vueDebug: false,                   // vendor/vue.min.js (não o dev)
};
```

`env.js` é um script clássico que corre ANTES dos vendors: injecta `vue.min.js` (ou `vue.dev.js`) e `vendor-dev/mirage.min.js` por `document.write` na própria posição — a ordem dos `defer` fica garantida. O `src/core/config.js` lê `window.ENV` e acrescenta o resto (root, cache, auth) — nada disso se toca no deploy.

## O que apagar (ou não copiar) no deploy

```
vendor-dev/   mirage.min.js + vue.dev.js   (só desenvolvimento)
dev/          servidor mock completo       (só desenvolvimento)
```

Com `mock: false` o `env.js` nem injecta o script do Mirage — mas **não copiar** estas pastas é a garantia física (e é a única forma de o `index.html` ficar exactamente igual entre dev e produção).

O `package.json` é PROVENIÊNCIA, não instalação (versões upstream para conferência; ver nota `x-vendor`) — não é preciso no servidor e `npm install` não faz parte do deploy.

## Procedência das libs: [`vendor/VERSIONS.md`](../vendor/VERSIONS.md)

Cada lib vendored tem origem + SHA-256 registados. Para verificar após download:

```bash
sha256sum vendor/*.js vendor-dev/*.js
```

Atualizar uma lib = substituir o ficheiro, atualizar a linha correspondente no [`VERSIONS.md`](../vendor/VERSIONS.md).

## Cache de compilação: a regra do bump

A cache IndexedDB usa `version: '11'` (em `src/core/config.js`). Editar um `.vue` invalida só esse ficheiro (chave = hash do conteúdo); **mover/renomear um `.vue` sem mudar o conteúdo exige bump manual** — o código compilado antigo tem os URLs ABSOLUTOS dos filhos embutidos e serviria caminhos que já não existem. Na dúvida, sobe a `version`.

## Router e sub-caminhos

- `routerMode: 'history'` precisa de *fallback* para `index.html` nos caminhos desconhecidos; `hash` funciona em qualquer servidor estático.
- Servida num sub-caminho: `<base href="/sub-caminho/">` no `index.html` — o resto (loader, router) segue-a via `config.root`.

## Checklist de deploy

1. `env.js`: `apiBase` real, `mock: false`, `vueDebug: false`.
2. Não copiar `vendor-dev/` nem `dev/`.
3. [`VERSIONS.md`](../vendor/VERSIONS.md) verificado (`sha256sum`).
4. Bump de `config.version` se algum `.vue` moveu/renomeou desde o último deploy.
5. Fallback do `history` activo no servidor (ou `routerMode: 'hash'`).
6. **Segurança** (detalhes em [`08-seguranca.md`](08-seguranca.md)):
   - Servir por **HTTPS** (HSTS activo) — o token anda no header `Authorization`.
   - Cabeçalhos de resposta: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
     `Referrer-Policy: strict-origin-when-cross-origin` e uma CSP. A CSP precisa de
     `script-src 'self' 'unsafe-eval'` — o vue2-sfc-loader compila os `.vue` no browser
     com `new Function` (arquitectura no-build; sem `unsafe-eval` a app não arranca).
   - Confirmar que `mock: false` e que `dev/`/`vendor-dev/` NÃO estão no servidor
     (é onde vivem as passwords de demo em claro).
   - O formulário de login já não sugere credenciais fora de localhost;
     se a API real usar **cookies** de sessão, ligar `withCredentials` em
     `core/http.js` e exigir defesa CSRF no backend.
