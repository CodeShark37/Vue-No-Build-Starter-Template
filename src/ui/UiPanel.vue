<template>
    <section class="panel" :class="{ card: card }">
        <h3 v-if="$slots.title"><slot name="title"></slot></h3>
        <h3 v-else-if="title">{{ title }}</h3>
        <slot></slot>
    </section>
</template>

<script>
// Painel padrão da app: caixa branca arredondada com padding. `card` dá o estilo
// "dashboard" (sombra, sem borda). O título é texto simples (prop `title`) ou HTML
// livre pelo slot "title" (ex.: <template #title>Novo post <code>POST /posts</code></template>)
// — o CSS vive aqui uma vez.
export default {
    props: {
        title: { type: String, default: '' },
        card: { type: Boolean, default: false },
    },
};
</script>

<style scoped>
.panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.9rem 1.1rem;
    margin: 0 0 1rem;
}
/* Cartão estilo "dashboard": borda suave fora, sombra leve. */
.card {
    border: none;
    border-radius: 14px;
    box-shadow: 0 2px 12px var(--shadow-color);
    padding: 1.1rem 1.25rem 1rem;
}</style>
