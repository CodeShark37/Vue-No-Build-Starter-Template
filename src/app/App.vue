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
    color: var(--text);
    background: var(--bg);
}
h2 { font-size: 1.35rem; margin: 0.2rem 0 0.8rem; }
h3 { font-size: 1.05rem; margin: 0 0 0.5rem; }
code {
    background: var(--code-bg);
    border: 1px solid var(--border);
    padding: 0.1em 0.35em;
    border-radius: 4px;
    font-size: 0.92em;
}
button {
    font: inherit;
    padding: 0.4em 0.8em;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--btn-bg);
    cursor: pointer;
}
button:hover { background: var(--btn-bg-hover); }
button:disabled { opacity: 0.5; cursor: default; }
input {
    font: inherit;
    padding: 0.4em 0.6em;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--input-bg); /* poço: branco no claro, slate-950 no escuro */
    color: var(--text);
}
input::placeholder { color: var(--text-faint); opacity: 1; }
/* Selects pequenos (linhas por página, escolha de utilizador): fundo subtil,
   como os controlos inline do mockup. */
select {
    font: inherit;
    padding: 0.35em 0.5em;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--surface-sunken);
    color: var(--text);
    cursor: pointer;
}
/* Foco visível nos campos: borda primária + anel suave (mockup: ring azul). */
input:focus,
select:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--ring);
}
/* Mensagens partilhadas pelas vistas. */
.error {
    color: var(--danger);
}
.hint {
    color: var(--text-faint);
    font-size: 0.85rem;
}
/* ---------- tokens de apresentação partilhados (antes duplicados por vista) ---------- */
/* Etiqueta ao lado do h2 (.tag) e texto explicativo das vistas (.explain). */
.tag {
    font-weight: 400;
    font-size: 0.8rem;
    color: var(--text-faint);
}
.explain {
    color: var(--text-soft);
}
/* Contentor scrollável de tabelas largas (DataTable e painéis admin). */
.table-wrap {
    overflow-x: auto;
}
/* Badges de role/política: pílula base neutra + variantes da paleta do tema
   (variáveis em src/ui/theme.css). UMA fonte global — antes havia 5 cópias
   scoped (PostsView, UsersPanel, RulesPanel, UserPermissions, ProfileView). */
.badge {
    display: inline-block;
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 600;
    background: var(--badge-neutral-bg); /* neutro: role desconhecido (sem paleta própria) */
    color: var(--badge-neutral-fg);
}
.badge + .badge {
    margin-left: 0.25rem;
}
.badge-cannot {
    margin-left: 0.35rem;
    background: var(--danger-soft);
    color: var(--danger-strong);
}
.badge-admin {
    background: var(--badge-admin-bg);
    color: var(--badge-admin-fg);
}
.badge-user {
    background: var(--badge-user-bg);
    color: var(--badge-user-fg);
}
.badge-editor {
    background: var(--badge-editor-bg);
    color: var(--badge-editor-fg);
}
.badge-viewer {
    background: var(--badge-viewer-bg);
    color: var(--badge-viewer-fg);
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
}</style>
