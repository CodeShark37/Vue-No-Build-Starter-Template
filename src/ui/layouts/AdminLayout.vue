<template>
    <div>
        <AppNavbar />
        <main class="container-admin">
            <!-- SIDEBAR da zona admin: toda a sub-navegação da área vive
                 aqui — o menu de topo passa a ter UM link "Admin" e não duplica
                 o que o painel lateral mostra. router-link-active destaca a
                 secção corrente (prefixo /admin/..., por isso funciona nas três
                 rotas sem estado próprio). -->
            <aside class="admin-side">
                <h3 class="side-title">Administração</h3>
                <nav class="side-nav" aria-label="Secções da administração">
                    <!-- A sidebar segue a MESMA política que o guard e a
                         API: Utilizadores abre por abilidade (sub-admin entra);
                         stats/permissões ficam por role. Nada aqui é segurança —
                         o guard (/403) e a API (403) é que decidem. -->
                    <router-link to="/admin/users" v-if="$perm.can('read', 'User')">Utilizadores</router-link>
                    <router-link to="/admin/stats" v-if="$auth.hasRole('admin')">Visão geral</router-link>
                    <router-link to="/admin/permissions" v-if="$auth.hasRole('admin')">Permissões</router-link>
                </nav>
                <p class="side-hint">Zona protegida: o guard avalia sessão + meta de cada
                    secção (roles OU perm — docs/09). Sem permissão: <code>/403</code>, sem
                    logout. A API re-verifica tudo com <strong>403</strong> — esconder links é
                    só UX.</p>
            </aside>

            <!-- Conteúdo da secção: mesmo <transition name="page"> dos restantes
                 layouts — troca de VISTA dentro do cromo (a troca de LAYOUT vive
                 no App.vue). O CSS .page-* é global, aqui só o modo. -->
            <section class="admin-main">
                <transition name="page" mode="out-in">
                    <router-view></router-view>
                </transition>
            </section>
        </main>
    </div>
</template>

<script>
// Layout da ZONA ADMIN — navbar + sidebar de secções + contentor. É o PAI das
// rotas /admin/* (features/admin/index.js): as vistas não mudam, só o cromo que
// as envolve ganhou o painel lateral.
//
// Segunda EXCEPÇÃO DOCUMENTADA à regra "ui/ = componentes genéricos" (a primeira
// é o AppNavbar): os links da sidebar apontam para rotas admin concretas. O
// padrão foi o próprio LayoutDefault: "para uma zona com cromo diferente (ex.:
// com sidebar), criar LayoutX.vue em ui/layouts/ e usá-lo como component dessa
// zona — as vistas e os guards não mudam". Nada aqui decide permissões: quem
// chega a /admin já passou no guard (roles ['admin'] na meta do pai) e a API
// re-verifica — a sidebar não é segurança, é navegação.
//
// Contentor MAIS LARGO que o padrão (1000px vs 760px): sidebar + painéis
// admin lado a lado, sem espremer as tabelas.
import AppNavbar from './AppNavbar.vue';

export default {
    components: {
        AppNavbar,
    },
};
</script>

<style scoped>
.container-admin {
    max-width: 1000px;
    margin: 0 auto;
    padding: 1.25rem 1rem 3rem;
    display: flex;
    gap: 1.25rem;
    align-items: flex-start;
}
/* Sticky POR BAIXO da navbar: a navbar é sticky top: 0 (z-index 20, fundo
   opaco) — um top: 1rem "puro" fazia o painel colar AOS 16px e deslizar SOB
   a navbar, escondendo o título e o 1.º link (medido no browser: 41px
   tapados). O offset certo é a altura real da navbar (--topbar-h, theme.css)
   mais o folgo de 1rem. ≤720px o painel volta a static: a navbar pode
   empilhar linhas e o offset fixo deixaria de ser verdade. */
.admin-side {
    flex: 0 0 200px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.9rem 0.9rem 0.7rem;
    position: sticky;
    top: calc(var(--topbar-h) + 1rem);
}
.side-title {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin: 0 0 0.6rem;
}
.side-nav {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
}
.side-nav a {
    display: block;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    text-decoration: none;
    color: var(--text);
    font-size: 0.95rem;
}
.side-nav a:hover {
    background: var(--surface-sunken);
    color: var(--text);
}
/* Secção corrente: fundo suave + barra à esquerda (router-link-active cobre os
   prefixos /admin/stats, /admin/users, /admin/permissions). */
.side-nav a.router-link-active {
    background: var(--primary-soft);
    color: var(--primary);
    font-weight: 600;
    box-shadow: inset 3px 0 0 var(--primary);
}
.side-hint {
    margin: 0.8rem 0 0;
    border-top: 1px solid var(--border-soft);
    padding-top: 0.6rem;
    color: var(--text-faint);
    font-size: 0.78rem;
}
.admin-main {
    flex: 1 1 auto;
    min-width: 0;
}
@media (max-width: 720px) {
    .container-admin {
        flex-direction: column;
    }
    .admin-side {
        position: static;
        flex: none;
        width: 100%;
        box-sizing: border-box;
    }
}</style>
