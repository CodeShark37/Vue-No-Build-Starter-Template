<template>
    <div>
        <h2>Permissões <span class="tag">zona /admin · roles: ['admin']</span></h2>
        <p class="explain">CRUD completo sobre a <strong>política</strong> de permissões — a tabela
            de regras CASL que o servidor entrega a cada sessão (aqui em forma <em>crua</em>, com os
            placeholders intactos). Toda a apresentação vive no painel; a API
            (<code>/api/rules</code>) é a autoridade e re-verifica tudo o que a UI esconde:
            role admin (403), validações (422) e a auto-protecção do role
            <code>admin</code> (nunca fica sem regras).</p>

        <!-- Painel auto-contido: estado e chamadas à API vivem no componente,
             como no UsersPanel. Depois de cada mutação, $perm.sync() reconstrói
             a Ability — as mudanças sentem-se na UI sem recarregar. -->
        <RulesPanel />
    </div>
</template>

<script>
// Vista orquestradora da zona /admin/permissions (features/admin/index.js: filha
// de /admin — o pai exige só requiresAuth; o roles ['admin'] é desta filha). Título + painel; sem
// lógica de dados — quem fala com a API é o RulesPanel. O contraste didáctico
// fica em /admin/stats: lá vê-se a MESMA política materializada por utilizador
// (UserPermissions), aqui edita-se a tabela crua.
import RulesPanel from './RulesPanel.vue';

export default {
    components: {
        RulesPanel,
    },
    head: {
        //for vue-head use
        title: {
            inner: "Vue2 No Build Starter Template",
            separator: "-",
            complement: "PermissionsView",
        },
    },
};
</script>
