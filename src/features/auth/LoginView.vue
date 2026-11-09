<template>
    <div>
        <h2>Entrar</h2>
        <p>O token é emitido pela API mock (MirageJS) via <code>POST /api/login</code> e a sessão
            fica em <code>core/session.js</code> (token + perfil em <code>localStorage</code>).
            Com sessão iniciada, o guard (meta <code>guest</code>) nem deixa chegar aqui.</p>
        <form @submit.prevent="submit">
            <p><input v-model="username" placeholder="Utilizador" autocomplete="username"></p>
            <p><input v-model="password" type="password" placeholder="Palavra-passe" autocomplete="current-password"></p>
            <button type="submit" :disabled="loading">{{ loading ? 'A entrar…' : 'Entrar' }}</button>
        </form>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="showDemoHint" class="hint">Utilizadores demo: <code>admin / admin123</code>, <code>editor / editor123</code>,
            <code>viewer / viewer123</code> e <code>user / user123</code> — um role por conta
            (ver docs/00-arranque.md).</p>
        <!-- Saída pública do login: quem cai aqui por acidente (link de um
             e-mail, bookmark do /login) não fica preso ao formulário — a página
             inicial é pública (site), o guard `guest` é o que a devolve ao login se
             já houver sessão. router-link, não <a href>: navegação SPA sem reload. -->
        <p class="home-link"><router-link to="/">&#8592; Ir para a página inicial</router-link></p>
    </div>
</template>

<script>
export default {
    data() {
        return {
            // Credenciais demo PRÉ-PREENCHIDAS SÓ no desenvolvimento (mock activo
            // ou localhost — segurança A07: um deploy real não pode sugerir
            // credenciais de administrador no formulário de login).
            username: this.$config.mock || this.$config.debug ? 'admin' : '',
            password: this.$config.mock || this.$config.debug ? 'admin123' : '',
            loading: false,
            error: '',
        };
    },
    computed: {
        // A pista de credenciais demo só existe onde existe o mock (ver data()).
        showDemoHint() {
            return this.$config.mock || this.$config.debug;
        },
    },
    methods: {
        submit() {
            const self = this;
            self.loading = true;
            self.error = '';
            self.$http.post('/login', { username: self.username, password: self.password })
                .then(function (res) {
                    // Sessão única em core/session.js: guard, interceptor e nav leem daqui.
                    // A resposta traz o PAR access/refresh — os dois entram
                    // na sessão (o refresh é usado SÓ pelo interceptor no /refresh).
                    self.$auth.setSession(res.data.token, res.data.user, res.data.refreshToken);
                    // guards.js guardou o destino pedido em ?redirect=
                    self.$router.push(self.$route.query.redirect || '/');
                })
                .catch(function () {
                    // 401 do login NÃO despoleta refresh nem logout (ver core/http.js).
                    self.error = 'Credenciais inválidas.';
                })
                .then(function () {
                    self.loading = false;
                });
        },
    },
    head: {
        //for vue-head use
        title: {
            inner: "Vue2 No Build Starter Template",
            separator: "-",
            complement: "LoginView",
        },
    },
};
</script>

<style scoped>
.home-link {
    margin-top: 0.9rem;
    font-size: 0.9rem;
}
.home-link a {
    color: #0a58ca;
    text-decoration: none;
}
.home-link a:hover {
    text-decoration: underline;
}
</style>
