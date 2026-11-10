<template>
    <div>
        <h2>Perfil <span class="tag">rota protegida · zona /app · self-service</span></h2>
        <p class="explain">A rota a que o NOME no navbar aponta (v12.6): aqui fica TUDO o que é da
            tua sessão — o token, o tempo que lhe resta e as demos dos fluxos 401 — e a gestão da
            TUA conta. O servidor só escreve no utilizador da sessão (<code>PUT /profile</code>):
            gerir as contas dos outros é a zona admin, nunca por aqui.</p>

        <!-- Sessão e token: painel auto-contido (relógio e demos 401) — as
             informações de sessão pertencem ao perfil. O logout real continua
             na navbar, junto do nome. -->
        <SessionPanel />

        <UiPanel card title="A minha conta">
            <p v-if="loading">A carregar perfil… (GET /api/profile)</p>
            <template v-else-if="profile">
                <p class="identity">
                    <strong>{{ profile.name }}</strong>
                    <small>@{{ profile.username }} · #{{ profile.id }}</small>
                </p>
                <p class="identity">Roles: <span v-for="r in profile.roles" :key="r" class="badge"
                    :class="r === 'admin' ? 'badge-admin' : 'badge-user'">{{ r }}</span>
                    — geridos na zona admin (mudar as próprias roles seria auto-escalada:
                    aqui e na API, isso é 422).</p>
            </template>

            <!-- Gestão da própria conta: nome, username e password (vazio = manter).
                 A API re-verifica tudo: 401 sem sessão, 422 em validação falhada
                 (nome vazio, username 3-24 [a-zA-Z0-9_.-] e único, password >= 4). -->
            <form class="profile-form" @submit.prevent="submit" v-if="profile">
                <label>Nome
                    <input v-model="form.name" aria-label="O meu nome">
                </label>
                <label>Username
                    <input v-model="form.username" aria-label="O meu username">
                </label>
                <label>Nova password <small>(vazio = manter)</small>
                    <input v-model="form.password" type="password" autocomplete="new-password"
                        aria-label="Nova password (opcional)">
                </label>
                <button type="submit" :disabled="saving">{{ saving ? 'A gravar…' : 'Guardar (PUT /profile)' }}</button>
            </form>
            <p v-if="ok" class="ok">{{ ok }}</p>
            <p v-if="error" class="error">{{ error }}</p>
            <p class="hint">Alterar a password REVOGA todas as sessões da conta — inclusive esta
                (v12.12: a password é uma credencial; rodá-la mata os tokens antigos, como num
                backend real) — e a app volta ao login para entrar com a nova. Renomear o username
                não quebra a política: as owner rules dos posts referem o <code>authorId</code>
                (ID), nunca o username — só a apresentação dos posts antigos fica no nome da época.</p>
        </UiPanel>
    </div>
</template>

<script>
// Vista do PERFIL — a rota do NOME no navbar: sessão + gestão da própria
// conta. Duas metades, ambas auto-contidas:
//   SessionPanel — sessão, token, relógio de expiração e demos 401;
//   formulário   — PUT /profile (nome, username, password) via this.$http directo,
//                  como o SessionPanel usa GET /me: a feature auth não tem $api
//                  (sessão é core/, ver features/auth/index.js). O servidor é
//                  self-scoped: escreve só no utilizador da sessão.
// Depois de gravar, o perfil devolvido alimenta $auth.setSession(token, user, refreshToken) —
// a cache local da sessão actualiza-se e o NOME no navbar muda à hora (reactivo),
// sem reload nem novo login. EXCEPTO quando muda a password: o servidor
// revogou TODAS as sessões da conta (inclusive esta, T05 da matriz de intrusão),
// por isso o cliente sai limpo: clearSession() + /login?redirect=/app/profile
// (adiantando-se ao 401 => refresh falhado => logout automático que viria a seguir).
import SessionPanel from './SessionPanel.vue';
import UiPanel from '../../ui/UiPanel.vue';

export default {
    components: {
        SessionPanel,
        UiPanel,
    },
    data() {
        return {
            profile: null,
            loading: false,
            saving: false,
            // password fica FORA do profile (a API nunca a devolve): buffer próprio
            // do formulário, vazio = manter a actual.
            form: { name: '', username: '', password: '' },
            ok: '',
            error: '',
        };
    },
    created() {
        this.loadProfile();
    },
    methods: {
        loadProfile() {
            const self = this;
            self.loading = true;
            self.error = '';
            self.ok = '';
            self.$http.get('/profile')
                .then(function (res) {
                    self.profile = res.data.data;
                    self.form.name = self.profile.name;
                    self.form.username = self.profile.username;
                    self.form.password = '';
                })
                .catch(function () {
                    self.error = 'GET /profile falhou — sessão sem resposta do servidor.';
                })
                .then(function () { self.loading = false; });
        },
        submit() {
            const self = this;
            const passwordChanged = !!self.form.password;
            const payload = {
                name: self.form.name,
                username: self.form.username,
            };
            if (passwordChanged) payload.password = self.form.password;
            self.saving = true;
            self.error = '';
            self.ok = '';
            self.$http.put('/profile', payload)
                .then(function (res) {
                    // T05: o servidor revogou TODAS as sessões quando a
                    // password muda — sair limpo: sessão local apagada e volta
                    // ao login com o destino guardado (o 401 do próximo pedido
                    // já faria isso, mas assim não há flash de erro).
                    if (passwordChanged) {
                        self.$auth.clearSession();
                        self.$router.push({
                            path: self.$config.auth.redirect,
                            query: { redirect: '/app/profile' },
                        });
                        return;
                    }
                    self.profile = res.data.data;
                    self.form.name = self.profile.name;
                    self.form.username = self.profile.username;
                    self.form.password = '';
                    // Cache da sessão actualizada: o nome no navbar acompanha já. 3.º
                    // argumento = refreshToken corrente — SEM ele o
                    // setSession apagava a credencial de renovação (a sessão morria
                    // no primeiro 401, sem direito a refresh).
                    self.$auth.setSession(self.$auth.token, self.profile, self.$auth.refreshToken);
                    self.ok = 'Conta actualizada (PUT /profile) — o navbar já mostra o novo nome.';
                })
                .catch(function (err) {
                    self.error = 'PUT /profile falhou' + self.$http.describe(err);
                })
                .then(function () { self.saving = false; });
        },
    },
    head: {
        //for vue-head use
        title: {
            inner: "Vue2 No Build Starter Template",
            separator: "-",
            complement: "ProfileView",
        },
    },
};
</script>

<style scoped>
.identity {
    margin: 0.2rem 0;
}
.identity strong {
    font-size: 1.05rem;
}
.identity small {
    display: block;
    color: var(--text-soft);
    font-size: 0.84rem;
}
.profile-form {
    margin-top: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-width: 26rem;
}
.profile-form label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.88rem;
    color: var(--badge-neutral-fg);
}
.profile-form label small {
    color: var(--text-faint);
}
.profile-form button {
    align-self: flex-start;
}
/* .hint e os badges (.badge/.badge-admin/.badge-user) são globais do App.vue;
   aqui só a margem local do bloco de avisos. */
.hint {
    margin-top: 0.8rem;
}
.ok {
    color: var(--ok);
    font-size: 0.9rem;
    margin: 0.4rem 0 0;
}</style>
