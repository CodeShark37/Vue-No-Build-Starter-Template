<template>
    <div>
        <h2>404 — Página não encontrada</h2>
        <p>O endereço <code>{{ path }}</code> não corresponde a nenhuma rota. As rotas vivem em
            <code>src/features/index.js</code>, agrupadas por features (site, auth, content, admin).</p>
        <p class="hint">Esta é a rota catch-all (<code>path: '*'</code>) — tem de permanecer a última
            da tabela. Rotas com <code>meta: { requiresAuth: true }</code> sem sessão caem antes no
            guard, que manda para o login.</p>
        <p><router-link to="/">Voltar ao início</router-link></p>
    </div>
</template>

<script>
// Rota catch-all: qualquer URL não registado cai aqui.
export default {
    data() {
        return { path: '' };
    },
    created() {
        this.path = this.$route.fullPath;
    },
    head: {
        //for vue-head use
        title: {
            inner: "Vue2 No Build Starter Template",
            separator: "-",
            complement: "NotFoundView",
        },
    },
};
</script>
