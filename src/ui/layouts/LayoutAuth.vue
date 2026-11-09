<template>
    <div class="auth-layout">
        <main class="auth-box">
            <!-- 2º nível da navegação animada (CSS .page-* global, no App.vue);
                 a troca de layout (guest ⇄ app) é animada pelo App.vue. -->
            <transition name="page" mode="out-in">
                <router-view></router-view>
            </transition>
        </main>
    </div>
</template>

<script>
// Layout de autenticação: SEM navbar, conteúdo centrado num cartão. É escolhido
// pela feature auth como rota-pai de /login (features/auth/index.js) — um guest
// não deve ver o cromo de utilizador autenticado (links, whoami, "Sair"). A
// troca de cromo por zona acontece na ÁRVORE DE ROTAS: as vistas e o guard não
// mudam. Para outra variante (ex.: com logo), criar LayoutX.vue em ui/layouts/
// e usá-lo como `component` da zona — as vistas não mudam.
//
// Os estilos base (tipografia, botões, campos, .error/.hint) são GLOBALS e vivem
// no App.vue (raiz, comum a todos os layouts) — não aqui. Este ficheiro só
// acrescenta o seu próprio cromo.
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
