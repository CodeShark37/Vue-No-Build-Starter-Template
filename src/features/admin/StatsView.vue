<template>
    <div>
        <h2>Admin (rota com roles)</h2>
        <p>Esta vista declara <code>meta: { roles: ['admin'] }</code> no <strong>filho</strong>
            (<code>/admin/stats</code> em <code>features/admin/index.js</code>) — o pai <code>/admin</code>
            só exige sessão (<code>requiresAuth</code>); <code>/admin/users</code> abre por
            <code>meta.perm</code> (política CASL). Sem o role, o guard redirige para
            <code>/403</code> <strong>sem fazer logout</strong>.</p>
        <p v-if="loading">A carregar estatísticas… (GET /api/admin/stats)</p>
        <div v-else-if="stats">
            <p><strong>{{ stats.users }}</strong> utilizadores registados</p>
            <p><strong>{{ stats.posts }}</strong> posts publicados</p>
            <p class="hint">gerado em {{ stats.generatedAt }} via <code>GET /api/admin/stats</code>
                — no servidor, quem não tem <code>role: admin</code> leva 403.</p>
        </div>
        <p v-else-if="error" class="error">{{ error }}</p>

        <!-- Inspecção da política pelos olhos de cada utilizador: GET /api/permissions/:id
             (aqui :id é o ID do UTILIZADOR) devolve as regras JÁ materializadas com os
             dados dele — exactamente o que o servidor lhe entregaria no próximo sync. -->
        <UserPermissions />

        <p class="hint">A gestão de UTILIZADORES (CRUD) tem painel próprio:
            <router-link to="/admin/users">/admin/users</router-link>; a POLÍTICA de
            permissões também: <router-link to="/admin/permissions">/admin/permissions</router-link>
            (o seed <code>dev/mock/seeds/permissions.js</code> é o estado inicial do mock).</p>
    </div>
</template>

<script>
// Demonstração de roles: a rota já exige ['admin'] no guard; o pedido de stats
// prova que a API também verifica (defesa em profundidade — UI esconde o link,
// API bloqueia). O painel UserPermissions mostra a política DADO através dos
// olhos de cada utilizador (regras já materializadas com os dados dele); o CRUD
// de utilizadores vive em /admin/users (UsersView + UsersPanel) e o da política
// em /admin/permissions (PermissionsView + RulesPanel).
import UserPermissions from './UserPermissions.vue';

export default {
    components: {
        UserPermissions,
    },
    data() {
        return { stats: null, loading: false, error: '' };
    },
    created() {
        this.loadStats();
    },
    methods: {
        loadStats() {
            const self = this;
            self.loading = true;
            self.error = '';
            self.$api.admin.stats()
                .then(function (res) { self.stats = res.data.data; })
                .catch(function (err) {
                    // Não devia acontecer (o guard já filtrou), mas a API é a autoridade.
                    self.error = 'GET /admin/stats falhou' + self.$http.describe(err);
                })
                .then(function () { self.loading = false; });
        },
    },
    head: {
        //for vue-head use
        title: {
            inner: "Vue2 No Build Starter Template",
            separator: "-",
            complement: "StatsView",
        },
    },
};
</script>
