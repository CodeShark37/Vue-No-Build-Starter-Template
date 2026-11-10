<template>
    <transition name="page" mode="out-in">
        <router-view></router-view>
    </transition>
</template>

<script>
// Componente raiz: transição entre layouts, router-view e estilos globais.
// Os layouts são definidos pelas features; os estilos comuns ficam aqui para
// serem partilhados por todas as vistas.
</script>

<!-- Estilos globais partilhados por todos os layouts e vistas. -->
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
/* Mensagens partilhadas pelas vistas. */
.error {
    color: #c0392b;
}
.hint {
    color: #98a2b3;
    font-size: 0.85rem;
}
/* Transição curta entre layouts e vistas, respeitando a preferência do sistema. */
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
