<template>
    <transition name="page" mode="out-in">
        <router-view></router-view>
    </transition>
</template>

<script>
// Raiz mínima: <transition> + <router-view> + os estilos BASE globais. O CROMO
// (navbar, contentor, cartão de login) vive nos layouts (ui/layouts/), que são os
// PAIS das zonas declaradas pelas features (features/*/index.js) — a raiz não
// conhece a app: troca de layout sem a tocar.
//
// A navegação animada tem DOIS níveis: este <transition name="page"> cobre a
// troca de LAYOUT (login ⇄ app); o 2º nível, troca de VISTA dentro do cromo,
// vive em cada layout (ui/layouts/). O CSS .page-* é global e fica AQUI — com
// mais de um layout, a raiz é o único sítio comum a todos. mode="out-in": a
// vista velha sai ANTES de a nova entrar — sem sobreposição nem salto de altura;
// <transition> é abstracto (não renderiza elemento), por isso a raiz continua a
// ser o layout roteado, e todas as vistas têm raiz única (exigência do Vue 2).
//
// Os estilos base ficam AQUI (e não num layout) porque há MAIS DO QUE UM layout
// (LayoutDefault, LayoutAuth): tipografia, botões e campos têm de chegar a todos.
// A raiz é o único componente que sempre monta — e o router só confirma a
// navegação depois de o resolver, por isso os estilos chegam sempre antes do
// primeiro render de qualquer vista.
</script>

<!-- Base visual comum a todos os layouts (NÃO scoped): tipografia, botões e
     campos num só sítio, para todas as vistas partilharem o mesmo aspecto. -->
<style>
body {
    margin: 0;
    font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
    color: #222;
    background: #fafafa;
}
h2 { font-size: 1.35rem; margin: 0.2rem 0 0.8rem; }
h3 { font-size: 1.05rem; margin: 0 0 0.5rem; }
code {
    background: #f0f0f0;
    padding: 0.1em 0.35em;
    border-radius: 4px;
    font-size: 0.92em;
}
button {
    font: inherit;
    padding: 0.4em 0.8em;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
}
button:hover { background: #f2f2f2; }
button:disabled { opacity: 0.5; cursor: default; }
input {
    font: inherit;
    padding: 0.4em 0.6em;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #fff;
}
/* Mensagens partilhadas por todas as vistas. */
.error {
    color: #c0392b;
}
.hint {
    color: #98a2b3;
    font-size: 0.85rem;
}
/* Transição de página (.page-*): aplicada à raiz do componente roteado em ambos
   os níveis (App.vue troca LAYOUT; layouts trocam VISTA). O deslize vertical
   mínimo dá direcção à troca sem a transformar em espectáculo; 180ms é curto
   suficiente para não atrapalhar cliques em sequência. prefers-reduced-motion:
   quem pede menos animação ao SO recebe a troca seca, sem fade. */
.page-enter-active,
.page-leave-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
}
.page-enter {
    opacity: 0;
    transform: translateY(8px);
}
.page-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
    .page-enter-active,
    .page-leave-active {
        transition: none;
    }
}
</style>
