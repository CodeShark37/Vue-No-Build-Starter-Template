<template>
    <UiPanel title="Sessão">
        <p class="token">
            <span v-if="me">Sessão iniciada como <strong>{{ me.name }}</strong> (@{{ me.username }}) via <code>GET /api/me</code>.</span>
            <span v-else>A identificar…</span>
        </p>
        <p class="token">Token: <code>{{ tokenPreview }}</code>
            <span v-if="expiresIn !== null && !isExpired">· expira em {{ expiresIn }}s</span>
            <span v-if="expiresIn !== null && !isExpired && expiresIn <= 15">· <strong>a expirar!</strong></span>
            <span v-if="isExpired"> · <strong>expirado</strong> — o próximo pedido renova-o automaticamente (POST /refresh)</span>
        </p>
        <div v-if="$config.debug" class="actions">
            <button @click="simulateExpired">Simular expirado (401 → refresh)</button>
            <button @click="simulateRevoked">Simular revogado (401 → logout)</button>
        </div>
    </UiPanel>
</template>

<script>
// Painel de sessão auto-contido: mostra quem está autenticado (GET /me), o token em
// uso e a contagem decrescente até expirar. É o DONO do relógio de 1s (`now`) que
// alimenta os computed expiresIn/isExpired — as vistas já não precisam de nenhum
// código de sessão: basta <SessionPanel />. Vive na rota PERFIL (/app/profile —
// o clique no nome no navbar): as informações de sessão pertencem ao perfil, não
// às vistas de dados.
//
// Botões de demo dos fluxos 401 — agem sobre o SERVIDOR, não sobre o
// token: o token é uma REFERÊNCIA a uma sessão no registry do mock
// (jti + hash), por isso reescrever o payload no cliente não muda o que o
// servidor decide. Os demos pedem ao mock para mudar o estado DA SESSÃO:
//  - "Simular expirado": POST /__demo/expire marca a sessão corrente como
//    expirada no REGISTRY; o próximo pedido (loadMe) leva 401 token_expired,
//    o interceptor faz POST /refresh (rotação: jti novo) e REPETE o pedido —
//    invisível para a vista.
//  - "Simular revogado": POST /__demo/revoke revoga a sessão corrente; o
//    próximo pedido leva 401 invalid_token e o /refresh também falha (sessão
//    revogada) => core/http.js limpa a sessão e navega ele próprio para
//    /login?redirect=….
//  - Os endpoints existem só em dev (ctx.debug no mock; os handlers recusam
//    404 fora de debug).
//  - O logout REAL (POST /logout revoga a sessão no servidor + clearSession)
//    está na navbar, no botão "Sair" junto do nome (ui/layouts/AppNavbar.vue).
import UiPanel from '../../ui/UiPanel.vue';

export default {
    components: {
        UiPanel,
    },
    data() {
        return {
            me: null,
            now: Date.now(), // alimentado pelo relógio (created); reacciona os computed de expiração
        };
    },
    computed: {
        // Derivado de $auth.token (reactivo): troca de token actualiza a pré-visualização sozinho.
        tokenPreview() {
            const token = this.$auth.token || '';
            return token ? token.slice(0, 24) + '…' : '(nenhum)';
        },
        // Segundos até expirar; recalcula a cada tique de `now` e a cada refresh.
        expiresIn() {
            const expiry = this.$auth.expiresAt();
            if (expiry === null) return null;
            return Math.max(0, Math.round((expiry - this.now) / 1000));
        },
        isExpired() {
            if (!this.$auth.token) return false;
            const expiry = this.$auth.expiresAt();
            return expiry === null || expiry <= this.now;
        },
    },
    watch: {
        // A conta mudou (ProfileView gravou PUT /profile e refrescou a cache da
        // sessão): re-identifica — o painel passa a mostrar o novo nome/username
        // sem recarregar a rota. COM GUARDA: no logout o user passa a null e este
        // watcher dispara — um GET /me sem token devolvia 401, o interceptor
        // tentava /refresh (sem token) e o catch dele fazia clearSession()+
        // redirect — podendo APAGAR uma sessão que acabava de nascer (re-login
        // logo após logout). Sem sessão, nada a carregar.
        '$auth.user': function () { if (this.$auth.isLoggedIn()) this.loadMe(); },
    },
    created() {
        const self = this;
        this.loadMe();
        // Relógio da sessão: avança `now` 1x por segundo. É o único "motor" de que
        // a contagem decrescente precisa — o resto é computed reactivo.
        this.clockTimer = setInterval(function () { self.now = Date.now(); }, 1000);
    },
    beforeDestroy() {
        clearInterval(this.clockTimer);
    },
    methods: {
        loadMe() {
            const self = this;
            self.$http.get('/me')
                .then(function (res) { self.me = res.data.user; })
                .catch(function () { self.me = null; });
        },
        simulateExpired() {
            const self = this;
            // O demo pede ao SERVIDOR para expirar a sessão corrente no
            // registry; o loadMe() a seguir leva 401 token_expired => refresh
            // automático (rotação) => pedido repetido => 200 com token novo.
            self.$http.post('/__demo/expire')
                .then(function () { self.loadMe(); })
                .catch(function () { self.loadMe(); });
        },
        simulateRevoked() {
            const self = this;
            // Revoga a sessão corrente NO REGISTRY. O loadMe() leva 401
            // invalid_token, o /refresh falha (revogada) => o interceptor limpa
            // a sessão e manda para o login (fluxo real de revogação).
            self.$http.post('/__demo/revoke')
                .then(function () { self.loadMe(); })
                .catch(function () { self.loadMe(); });
        },
    },
};
</script>

<style scoped>
.token {
    margin: 0.2rem 0;
    color: var(--text-soft);
}
.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.4rem 0;
}</style>
