<template>
    <div>
        <h2>Utilizadores <span class="tag">rota /admin/users · meta.perm: read User</span></h2>
        <p class="explain">CRUD sobre o RECURSO <code>User</code> da política CASL (v12.14) —
            criar, editar (nome, password, roles) e eliminar, cada botão guiado pela
            abilidade da sessão (<code>$perm.can(...)</code>) e a API
            (<code>/api/admin/users</code>) re-verifica tudo: a política por verbo
            (403), validações (422) e as reservas — o campo <code>roles</code> só muda
            por role admin (403), a própria conta não se elimina nem muda de roles.</p>

        <!-- Painel auto-contido: estado e chamadas à API vivem no componente,
             como nos restantes painéis admin (UserPermissions, SessionPanel). -->
        <UsersPanel />
    </div>
</template>

<script>
// Vista orquestradora da zona /admin/users (features/admin/index.js: filha de
// /admin com meta.perm { read User } — abre por POLÍTICA, não por role; um
// sub-admin com a regra read User entra aqui na mesma). Título + painel; sem
// lógica de dados — quem fala com a API é o UsersPanel.
import UsersPanel from './UsersPanel.vue';

export default {
    components: {
        UsersPanel,
    },
    head: {
        //for vue-head use
        title: {
            inner: "Vue2 No Build Starter Template",
            separator: "-",
            complement: "UsersView",
        },
    },
};
</script>
