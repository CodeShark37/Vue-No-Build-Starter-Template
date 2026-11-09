<template>
    <UiPanel title="Permissões por utilizador (GET /api/permissions/:id)">
        <p class="hint">Escolhe um utilizador e vê as regras que o SERVIDOR lhe entrega, já
            <strong>materializadas com os dados dele</strong>: o seed guarda o placeholder
            <code>${user.username}</code> e a mesma linha chega a cada um com o SEU valor
            (aqui o <code>author</code> já é o username real). A política é um DADO que o
            servidor resolve por utilizador — este painel é a prova, sem nada de editável:
            para MUDAR as regras há CRUD próprio em <code>/admin/permissions</code>
            (o seed <code>dev/mock/seeds/permissions.js</code> é só o estado inicial).</p>

        <p v-if="loadingUsers">A carregar utilizadores… (GET /api/admin/users)</p>
        <template v-else>
            <p class="picker">
                <label for="userperm-select">Utilizador:</label>
                <select id="userperm-select" class="userperm-select" v-model="selectedId" @change="loadUser">
                    <option v-for="u in users" :key="u.id" :value="u.id">
                        {{ u.username }} — {{ u.name }} [{{ u.roles.join(', ') }}]
                    </option>
                </select>
            </p>

            <p v-if="loading">A obter permissões… (GET /api/permissions/:id)</p>
            <div v-else-if="target" class="table-wrap">
                <p class="target-line">
                    Permissões efectivas de <strong>@{{ target.user.username }}</strong>
                    <span v-if="!target.rules.length"> — <em>nenhuma regra (fail-closed: nada visível, tudo 403).</em></span>
                </p>
                <table v-if="target.rules.length" class="userperm-table">
                    <thead>
                        <tr>
                            <th title="Ordem de avaliação CASL: a última regra que casa sobre o mesmo (acção, subject) vence">#</th>
                            <th>Acção</th>
                            <th>Subject</th>
                            <th>Conditions (já materializadas)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(r, i) in target.rules" :key="i">
                            <td class="td-pos">{{ i + 1 }}</td>
                            <td><strong>{{ r.action }}</strong>
                                <span v-if="r.inverted" class="badge-cannot" title="Regra de negação (cannot no CASL)">cannot</span></td>
                            <td>{{ r.subject }}</td>
                            <td class="td-conditions"><code>{{ conditionsText(r) }}</code></td>
                        </tr>
                    </tbody>
                </table>
                <p class="hint">Estas regras constróem a Ability que <code>this.$perm.can(...)</code> usa
                    — idênticas às que <code>GET /api/permissions</code> devolveria a este utilizador
                    autenticado. <span v-if="hasBoundConditions">Repara: nas regras owner o
                    <code>authorId</code> é o id DELE, não o placeholder.</span>
                    A ORDEM importa: a última regra que casa sobre o mesmo
                    (acção, subject) é a que vence — quem ordena é a política
                    (<code>PUT /rules/order</code>), arrastável em <code>/admin/permissions</code>.</p>
            </div>
            <p v-else-if="error" class="error">{{ error }}</p>
        </template>
    </UiPanel>
</template>

<script>
// Inspecção da política pelos olhos de um utilizador (só admin): consome
//   GET /api/admin/users        -> lista (sem passwords) para o select
//   GET /api/permissions/:id    -> as regras efectivas DELE (:id = ID DO UTILIZADOR)
// O seed guarda a política com placeholders; aqui está o RESULTADO já materializado
// por sessão — a mesma diferença que há entre a tabela de política de um backend e
// o payload que ele envia a cada user. O GET é sempre feito, sem cache local: trocar
// de utilizador (ou recarregar) volta a falar com o servidor.
import UiPanel from '../../ui/UiPanel.vue';

export default {
    components: {
        UiPanel,
    },
    data() {
        return {
            users: [],
            selectedId: '',
            target: null, // resposta do GET /permissions/:id: { user, rules }
            loadingUsers: false,
            loading: false,
            error: '',
        };
    },
    computed: {
        // Há condições já resolvidas para mostrar? (nota didáctica do rodapé)
        hasBoundConditions() {
            const t = this.target;
            if (!t) return false;
            return t.rules.some(function (r) { return !!r.conditions; });
        },
    },
    created() {
        this.loadUsers();
    },
    methods: {
        conditionsText(rule) {
            return rule.conditions ? JSON.stringify(rule.conditions) : '—';
        },
        loadUsers() {
            const self = this;
            self.loadingUsers = true;
            self.error = '';
            // per_page 50 (máximo do mock): o select precisa do CONJUNTO
            // inteiro de contas — a omissão (6) trunca a lista sem aviso assim
            // que haja mais utilizadores do que uma página.
            self.$api.admin.listUsers({ per_page: 50 })
                .then(function (res) {
                    self.users = res.data.data || [];
                    // Primeiro utilizador seleccionado por omissão: o painel nunca
                    // fica vazio a esperar por uma escolha.
                    if (self.users.length) {
                        self.selectedId = self.users[0].id;
                        return self.loadUser();
                    }
                })
                .catch(function (err) {
                    self.error = 'GET /admin/users falhou' + self.detailOf(err);
                })
                .then(function () { self.loadingUsers = false; });
        },
        loadUser() {
            const self = this;
            if (!self.selectedId) return;
            self.loading = true;
            self.error = '';
            self.$api.admin.permissionsOf(self.selectedId)
                .then(function (res) { self.target = res.data.data; })
                .catch(function (err) {
                    self.target = null;
                    self.error = 'GET /permissions/' + self.selectedId + ' falhou' + self.detailOf(err);
                })
                .then(function () { self.loading = false; });
        },
        // Mensagem curta por status (mesmo formato dos restantes painéis): 403 é
        // "sem permissão" — a sessão NUNCA é limpa pelo interceptor.
        detailOf(err) {
            const res = err && err.response;
            if (!res) return '';
            return ' (HTTP ' + res.status + ')';
        },
    },
};
</script>

<style scoped>
.picker {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.3rem 0 0.8rem;
}
.td-pos {
    color: #98a2b3;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    width: 2rem;
}
.badge-cannot {
    display: inline-block;
    margin-left: 0.35rem;
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 600;
    background: #fee2e2;
    color: #b91c1c;
}
.picker label {
    color: #667085;
    font-size: 0.9rem;
}
.userperm-select {
    max-width: 100%;
}
.target-line {
    margin: 0.2rem 0 0.5rem;
}
.table-wrap {
    overflow-x: auto;
}
.userperm-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
}
.userperm-table th {
    text-align: left;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #98a2b3;
    padding: 0.45rem 0.5rem;
    border-bottom: 1px solid #e5e7eb;
}
.userperm-table td {
    padding: 0.5rem;
    border-bottom: 1px solid #f0f1f3;
    vertical-align: middle;
}
.td-conditions code {
    font-size: 0.8rem;
    color: #555;
    word-break: break-all;
}
</style>
