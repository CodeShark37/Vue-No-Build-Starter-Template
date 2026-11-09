<template>
    <div>
        <AppNavbar />
        <main class="container-content">
            <!-- ABAS da zona content: a sub-navegação da área vive no
                 CROMO da zona (o mesmo padrão da sidebar do AdminLayout, em
                 versão leve para duas secções). router-link-active destaca a
                 secção corrente (prefixo /content/...). Nada aqui decide
                 permissões: quem chega a /content já passou no guard
                 (requiresAuth no pai) e a API re-verifica — abas são navegação,
                 não segurança. -->
            <nav class="content-tabs" aria-label="Secções do conteúdo">
                <router-link to="/content/posts">Posts</router-link>
                <router-link to="/content/books">Livros</router-link>
            </nav>

            <!-- Conteúdo da secção: mesmo <transition name="page"> dos restantes
                 layouts — troca de VISTA dentro do cromo (a troca de LAYOUT vive
                 no App.vue). -->
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
.container-content {
    max-width: 860px;
    margin: 0 auto;
    padding: 1.25rem 1rem 3rem;
}
.content-tabs {
    display: flex;
    gap: 0.25rem;
    background: #fff;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    padding: 0.35rem;
    margin-bottom: 1.25rem;
}
.content-tabs a {
    flex: 1;
    text-align: center;
    padding: 0.45rem 0.9rem;
    border-radius: 6px;
    color: #555;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.92rem;
}
.content-tabs a:hover {
    background: #f2f2f2;
}
.content-tabs a.router-link-active {
    background: #1a73e8;
    color: #fff;
}
</style>
