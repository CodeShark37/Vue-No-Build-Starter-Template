<template>
    <!-- NOTA: dentro de <svg> NÃO se usam <template v-if> nem comentários HTML —
         o compilador de templates do vue2-sfc-loader devolve um render vazio.
         O v-if vai directamente em cada elemento SVG. -->
    <button class="icon-btn" :class="icon" type="button" :title="label" :aria-label="label" @click="$emit('click')">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline v-if="icon === 'save'" points="20 6 9 17 4 12"></polyline>
            <line v-if="icon === 'cancel'" x1="18" y1="6" x2="6" y2="18"></line>
            <line v-if="icon === 'cancel'" x1="6" y1="6" x2="18" y2="18"></line>
            <path v-if="icon === 'edit'" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path v-if="icon === 'edit'" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            <polyline v-if="icon === 'delete'" points="3 6 5 6 21 6"></polyline>
            <path v-if="icon === 'delete'" d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path v-if="icon === 'delete'" d="M10 11v6"></path>
            <path v-if="icon === 'delete'" d="M14 11v6"></path>
            <path v-if="icon === 'delete'" d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
            <path v-if="icon === 'view'" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle v-if="icon === 'view'" cx="12" cy="12" r="3"></circle>
        </svg>
    </button>
</template>

<script>
// Botão de acção só-ícone: os ícones (save/cancel/edit/delete/view) vivem
// aqui UMA vez e a classe .icon-btn.<icon> mantém as cores de hover (ex.:
// .icon-btn.delete vermelho). `label` alimenta title e aria-label — o botão
// não tem texto visível, por isso o rótulo é obrigatório. 'view' serve às
// acções EXTRA do slot actions da DataTable (ex.: o Detalhe do livro na
// BooksView).
export default {
    props: {
        icon: { type: String, required: true }, // 'save' | 'cancel' | 'edit' | 'delete' | 'view'
        label: { type: String, required: true },
    },
};
</script>

<style scoped>
.icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    margin-left: 0.2rem;
    transition: background 0.15s ease, color 0.15s ease;
}
.icon-btn.edit:hover,
.icon-btn.edit:focus-visible {
    color: var(--primary);
    background: var(--primary-soft);
    outline: none;
}
.icon-btn.view:hover,
.icon-btn.view:focus-visible {
    color: var(--accent);
    background: var(--accent-soft);
    outline: none;
}
.icon-btn.delete:hover,
.icon-btn.delete:focus-visible {
    color: var(--danger-strong);
    background: var(--danger-soft);
    outline: none;
}
.icon-btn.save:hover,
.icon-btn.save:focus-visible {
    color: var(--ok);
    background: var(--ok-soft);
    outline: none;
}
.icon-btn:hover:not(.edit):not(.delete):not(.save),
.icon-btn:focus-visible:not(.edit):not(.delete):not(.save) {
    color: var(--badge-neutral-fg);
    background: var(--surface-sunken);
    outline: none;
}</style>
