<template>
    <div>
        <h2>403 — Sem permissão</h2>
        <p>Estás autenticado, mas o teu role não permite abrir
            <code v-if="from">{{ from }}</code><span v-else>a página pedida</span>.</p>
        <p class="hint">403 é diferente de 401: 401 = "não sei quem és" (limpa sessão e manda para
            o login); 403 = "sei quem és, mas não podes" (sessão mantida, só se mostra o aviso).
            O guard nunca faz logout por falta de role.</p>
        <p>
            <router-link to="/">Voltar ao início</router-link>
            <router-link to="/content/posts" v-if="$auth.isLoggedIn()">Posts</router-link>
        </p>
    </div>
</template>

<script>
// Destino de config.auth.forbiddenRedirect: chega aqui por redirect do guard
// (meta.roles insuficiente), com o caminho pedido em ?from=.
export default {
    data() {
        return { from: '' };
    },
    created() {
        this.from = this.$route.query.from || '';
    },
    head: {
        //for vue-head use
        title: {
            inner: "Vue2 No Build Starter Template",
            separator: "-",
            complement: "ForbiddenView",
        },
    },
};
</script>
