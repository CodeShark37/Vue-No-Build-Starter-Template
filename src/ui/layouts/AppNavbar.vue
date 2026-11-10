<template>
    <header class="topbar">
        <nav class="nav">
            <span class="brand">Vue No-Build</span>
            <!-- A visibilidade do que é de SESSÃO vem de $auth (core/session.js) e de
                 $perm (core/ability.js); a UI nunca pergunta ao localStorage directamente.
                 POSTS e LIVROS fundem num ÚNICO link "Recursos" — uma entrada de topo
                 por ZONA, não por secção: aponta a /content (redirige para a secção
                 principal) e a sub-navegação Posts/Livros vive nas ABAS do
                 ContentLayout (o mesmo padrão da zona admin: UM link de topo, secções
                 no cromo da zona). active-class em vez do exact: /content é PREFIXO de
                 ambas as abas — o link fica destacado dentro da zona inteira. ADMIN
                 idem por POLÍTICA ($perm.can('read', 'User'), não hasRole — o
                 sub-admin também o vê): a sub-navegação da zona vive na SIDEBAR do
                 AdminLayout. -->
            <router-link to="/">Início</router-link>
            <router-link to="/content" active-class="zone-active">Recursos</router-link>
            <router-link to="/admin" v-if="$perm.can('read', 'User')">Admin</router-link>
            <span class="spacer"></span>
            <!-- Tema claro/escuro: alterna data-theme em <html> ($theme, core/theme.js).
                 O ícone aponta para onde se VAI: lua no claro, sol no escuro. -->
            <button type="button" class="theme-toggle"
                :title="$theme.current === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'"
                :aria-label="$theme.current === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'"
                @click="$theme.toggle()">{{ $theme.current === 'dark' ? '\u2600' : '\u263E' }}</button>
            <!-- O NOME do utilizador é o link para o PERFIL: sessão (token,
                 expiração, simular expirado) + gestão da própria conta (nome, username,
                 password — PUT /profile). O guard da rota /app exige sessão: sem ela,
                 este link nem aparece. -->
            <router-link v-if="$auth.isLoggedIn()" to="/app/profile" class="whoami"
                title="Abrir o meu perfil">
                {{ $auth.user ? $auth.user.name : '…' }}
                <em v-if="$auth.user && $auth.user.roles">[{{ $auth.user.roles.join(', ') }}]</em>
            </router-link>
            <!-- Logout junto do nome do utilizador: POST /logout tolerante +
                 clearSession() + navegação para config.auth.redirect. -->
            <button v-if="$auth.isLoggedIn()" class="logout" @click="logout">Sair</button>
            <router-link to="/login" v-if="!$auth.isLoggedIn()">Login</router-link>
        </nav>
    </header>
</template>

<script>
// Barra de navegação. EXCEPÇÃO DOCUMENTADA à regra "ui/ = componentes genéricos
// sem lógica de negócio": consome this.$auth para decidir o link Admin e o link
// do perfil — é o cromo dos layouts, não um widget. Reactivo (links e whoami
// acompanham login/logout/refresh) e sem estado próprio. O ÚNICO pedido que
// faz é o do seu próprio botão: "Sair", o logout real da app (junto do nome do
// utilizador) — POST /logout + clearSession() + /login. Quem o coloca na página
// é o LayoutDefault e o AdminLayout (ui/layouts/), pais das zonas que os
// escolhem em features/*/index.js.
export default {
    methods: {
        logout() {
            const self = this;
            self.$http.post('/logout')
                .catch(function () { /* tolerante: o logout mock nunca falha */ })
                .then(function () {
                    self.$auth.clearSession();
                    self.$router.push({ path: self.$config.auth.redirect });
                });
        },
    },
}
</script>

<style scoped>
/* Presa ao topo: position sticky mantém a navbar visível ao rolar, em todas
   as zonas (os 3 layouts usam este mesmo componente). A sombra separa-a do
   conteúdo que passa por baixo. */
.topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    box-shadow: 0 1px 2px var(--shadow-color);
}
.nav {
    max-width: 760px;
    margin: 0 auto;
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
}
.brand {
    font-weight: 700;
    margin-right: 0.5rem;
}
.spacer {
    flex: 1;
}
.whoami {
    color: var(--text);
    text-decoration: none;
}
.whoami:hover {
    color: var(--primary);
}
.whoami em {
    font-style: normal;
    color: var(--text-faint);
    font-size: 0.85em;
}
button.logout {
    padding: 0.15rem 0.6rem;
    font-size: 0.85rem;
    color: var(--danger);
    border-color: var(--danger-border);
    background: var(--danger-soft);
}
button.logout:hover {
    background: var(--danger-soft-hover);
}
/* Tema: botão circular discreto (mockup: ícone redondo em fundo subtil). */
button.theme-toggle {
    width: 2rem;
    height: 2rem;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    font-size: 0.95rem;
    line-height: 1;
    color: var(--text-soft);
    border-color: var(--border);
    background: var(--surface-sunken);
}
button.theme-toggle:hover {
    background: var(--surface-hover);
    color: var(--text);
}
.nav a {
    text-decoration: none;
    color: var(--text-soft); /* inactivo em muted, como no mockup */
    padding: 0.2rem 0;
    border-bottom: 2px solid transparent;
}
.nav a:hover {
    color: var(--primary-hover);
}
.nav a.router-link-exact-active {
    color: var(--primary);
    border-bottom-color: var(--primary);
}
/* ZONA activa: o "Recursos" usa active-class PRÓPRIO (zone-active) —
   o active do router-link é por PREFIXO (h(n,w) no vendor 3.0.0), por isso o
   link acende dentro das duas abas da zona (/content/posts, /content/books);
   o exact-active do resto mantém-se (Início '/' nunca acende por prefixo). */
.nav a.zone-active {
    color: var(--primary);
    border-bottom-color: var(--primary);
}</style>
