<template>
    <div>
        <AppNavbar />
        <main class="container">
            <!-- 2º nível da navegação animada: troca de VISTA dentro do cromo
                 (a 1ª, troca de LAYOUT, vive no App.vue). O CSS .page-* é global
                 (App.vue) — aqui só o modo, sem estilos duplicados. -->
            <transition name="page" mode="out-in">
                <router-view></router-view>
            </transition>
        </main>
    </div>
</template>

<script>
// Layout padrão: navbar + contentor. É o PAI das zonas que o escolhem — cada
// feature declara-o como `component` da sua zona em features/<nome>/index.js
// (site, perfil, content); a feature auth escolhe o LayoutAuth para o login.
// Qualquer vista renderiza dentro do seu <router-view> (envolto num <transition
// name="page">: a vista velha faz fade-out ANTES de a nova entrar), com a mesma
// barra de navegação e o mesmo contentor. Para uma zona com cromo diferente (ex.: com
// sidebar), criar LayoutX.vue em ui/layouts/ e usá-lo como `component` dessa
// zona — as vistas e os guards não mudam.
//
// Os estilos GLOBAIS (tipografia, botões, campos) vivem no App.vue: com mais do
// que um layout, a raiz é o único sítio comum a todos. Aqui fica só o cromo
// deste layout.
import AppNavbar from './AppNavbar.vue';

export default {
    components: {
        AppNavbar,
    },
};
</script>

<style scoped>
.container {
    max-width: 760px;
    margin: 0 auto;
    padding: 1.25rem 1rem 3rem;
}
</style>
