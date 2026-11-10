<template>
    <div>
        <!-- Navbar e abas ficam fixas em conjunto; as abas são apenas navegação. -->
        <header class="pinned">
            <AppNavbar />
            <div class="tabs-holder">
                <nav class="content-tabs" aria-label="Secções do conteúdo">
                    <router-link to="/content/posts">Posts</router-link>
                    <router-link to="/content/books">Livros</router-link>
                </nav>
            </div>
        </header>

        <!-- Transição das vistas dentro do layout. -->
        <main class="container-content">
            <section class="content-main">
                <transition name="page" mode="out-in">
                    <router-view></router-view>
                </transition>
            </section>
        </main>
    </div>
</template>

<script>
// Layout da zona content: navbar, tabs e transição das vistas.
import AppNavbar from './AppNavbar.vue';

export default {
    components: {
        AppNavbar,
    },
};
</script>

<style scoped>
/* Mantém a navbar e as abas fixas como uma unidade. */
.pinned {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg);
}
.tabs-holder {
    /* Mantém as abas alinhadas com o conteúdo. */
    max-width: 860px;
    margin: 0 auto;
    padding: 1.25rem 1rem 0;
}
.container-content {
    max-width: 860px;
    margin: 0 auto;
    padding: 1.25rem 1rem 3rem;
}
.content-tabs {
    display: flex;
    gap: 0.25rem;
    background: var(--surface-sunken); /* segmented control em bg-subtle (spec) */
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.35rem;
}
.content-tabs a {
    flex: 1;
    text-align: center;
    padding: 0.45rem 0.9rem;
    border-radius: 6px;
    color: var(--text-soft);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.92rem;
}
.content-tabs a:hover {
    background: var(--surface-hover);
}
.content-tabs a.router-link-active {
    /* Aba activa: branco+azul no claro, azul sólido no escuro (mockup). */
    background: var(--tab-active-bg);
    color: var(--tab-active-fg);
    box-shadow: 0 1px 2px var(--shadow-color);
}</style>
