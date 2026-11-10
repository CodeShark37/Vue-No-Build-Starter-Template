<template>
    <div>
        <!-- Cabeçalho da zona PINADO COMO UNIDADE (navbar + abas): sticky no
             wrapper e não nas peças — a altura da navbar varia (as linhas
             empilham no ecrã estreito) e medir-lha em JS é custo que o CSS
             evita. O fundo --bg mascara o conteúdo que passa por baixo.
             ABAS: a sub-navegação da área vive no CROMO da zona (o mesmo
             padrão da sidebar do AdminLayout, em versão leve para duas
             secções). router-link-active destaca a secção corrente (prefixo
             /content/...). Nada aqui decide permissões: quem chega a
             /content já passou no guard (requiresAuth no pai) e a API
             re-verifica — abas são navegação, não segurança. -->
        <header class="pinned">
            <AppNavbar />
            <div class="tabs-holder">
                <nav class="content-tabs" aria-label="Secções do conteúdo">
                    <router-link to="/content/posts">Posts</router-link>
                    <router-link to="/content/books">Livros</router-link>
                </nav>
            </div>
        </header>

        <!-- Conteúdo da secção: mesmo <transition name="page"> dos restantes
             layouts — troca de VISTA dentro do cromo (a troca de LAYOUT vive
             no App.vue). -->
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
// Layout da ZONA CONTENT — navbar + abas de secções. É o PAI das rotas
// /content/* (features/content/index.js): o cromo mostra em QUE zona a vista
// está (a convenção completa está em docs/09-convencoes-de-rotas.md).
//
// Segue o padrão do AdminLayout: os links das abas apontam para rotas concretas
// da zona — terceira EXCEPÇÃO DOCUMENTADA à regra "ui/ = genéricos" (as outras
// duas são o AppNavbar e a sidebar do Admin). Se a zona crescer (3+ secções),
// o upgrade natural é adoptar a sidebar do Admin — o layout é o sítio da troca,
// nunca as vistas.
import AppNavbar from './AppNavbar.vue';

export default {
    components: {
        AppNavbar,
    },
};
</script>

<style scoped>
/* Cabeçalho da zona (navbar + abas) preso ao topo: sticky na UNIDADE — o
   topbar do AppNavbar já é sticky, mas dentro deste header o seu sticky fica
   inerte (o wrapper nunca rola internamente); quem prende aqui é o .pinned. */
.pinned {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg);
}
.tabs-holder {
    /* Mesma largura do container-content: as abas alinham com o conteúdo. */
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
