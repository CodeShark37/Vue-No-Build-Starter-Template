<template>
    <div class="auth-layout">
        <main class="auth-box">
            <!-- Transição das vistas de autenticação. -->
            <transition name="page" mode="out-in">
                <router-view></router-view>
            </transition>
        </main>
    </div>
</template>

<script>
// Layout de autenticação sem navbar, com conteúdo centrado. Os estilos base
// ficam no App.vue.
</script>

<style scoped>
.auth-layout {
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 12vh 1rem 3rem;
    box-sizing: border-box;
}
.auth-box {
    width: 100%;
    max-width: 430px;
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    padding: 1.5rem 1.6rem 1.3rem;
    box-shadow: 0 2px 12px rgba(16, 24, 40, 0.09);
}
</style>
