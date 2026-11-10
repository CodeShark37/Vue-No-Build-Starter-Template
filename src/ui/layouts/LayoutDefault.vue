<template>
    <div>
        <AppNavbar />
        <main class="container">
            <!-- Transição das vistas dentro do layout. -->
            <transition name="page" mode="out-in">
                <router-view></router-view>
            </transition>
        </main>
    </div>
</template>

<script>
// Layout padrão com navbar e contentor. Os estilos globais ficam no App.vue.
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
}</style>
