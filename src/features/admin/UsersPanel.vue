<template>
    <UiPanel card title="Gestão de utilizadores (CRUD admin)">
        <p class="hint">CRUD sobre o RECURSO <code>User</code> via <code>/api/admin/users</code>
            — a API é a autoridade: <strong>401</strong> sem sessão, <strong>403</strong> sem a
            regra da política (subject User, v12.14), num campo reservado (roles só por
            role admin) ou numa CONTA admin (v12.16: uma conta com o role admin só se
            edita pelo role admin — o botão de editar nem aparece para o resto),
            <strong>422</strong> com validação falhada. Os botões seguem a MESMA
            política via <code>$perm.can(action, 'User')</code>. O <code>username</code> é
            imutável (a autoria dos posts e as owner rules da política referem-no); ninguém
            elimina a própria conta nem altera as suas próprias roles (422, mesmo contornando
            a UI — esconder o botão é só UX). Um role sem regras no seed de permissões entra
            <strong>fail-closed</strong>: sem permissões até as receber.</p>

        <!-- Resumo de roles (meta.roleCounts): contagem POR ROLE sobre o
             CONJUNTO INTEIRO de utilizadores, publicada pelo SERVIDOR na meta da
             listagem (não derivável de uma página paginada). Um role novo entra
             aqui mal o 1.º utilizador o receba — e fica fail-closed (zero regras)
             até a política lhe dar acesso em /admin/permissions. -->
        <p v-if="roleCounts.length" class="hint roles-summary">
            {{ total }} utilizador(es) · roles existentes:
            <span v-for="rs in roleCounts" :key="rs.role" class="badge"
                :class="rs.role === 'admin' ? 'badge-admin' : 'badge-user'"
                :title="rs.count + ' utilizador(es) com o role ' + rs.role">{{ rs.role }} ({{ rs.count }})</span>
        </p>

        <!-- A MESMA DataTable genérica de posts/books (ui/DataTable.vue). O contrato todo
             continua a vir do SERVIDOR: meta.editable desenha os inputs
             (name/password/roles), meta.sorts as setas (id/name) e meta.roleCounts
             o resumo acima. As células de apresentação própria (nome + @username
             · #id, badges de role) são slots cell-<key>; o input de password usa
             fieldTypes (type=password) e o de roles desabilita-se com
             fieldDisabled quando é campo reservado — a API re-verifica por si
             (403/422). -->
        <DataTable
            :rows="users" :columns="userColumns" :loading="loading"
            :editing-id="editingId" :editable-fields="editable"
            :sorts-allowed="sorts.allowed" :sorts-numeric="sorts.numeric"
            :page="page" :per-page="perPage" :total="total" :total-pages="totalPages"
            :sort="sort" :order="order"
            noun="utilizadores" empty-text="Sem utilizadores."
            :field-labels="fieldLabels" :field-types="fieldTypes" :field-disabled="fieldDisabled"
            :can-edit="canEditUser" :can-remove="canRemoveUser"
            @sort="setSort" @per-page="setPerPage" @refresh="reloadUsers"
            @edit="startEdit" @cancel="cancelEdit" @save="saveEdit" @delete="removeUser">
            <template v-slot:cell-name="{ row }">
                <strong>{{ row.name }}</strong>
                <small class="user-line">@{{ row.username }} · #{{ row.id }}<span v-if="isSelf(row)"> — (tu)</span></small>
            </template>
            <template v-slot:cell-roles="{ row }">
                <span v-for="r in row.roles" :key="r" class="badge"
                    :class="r === 'admin' ? 'badge-admin' : 'badge-user'">{{ r }}</span>
            </template>
        </DataTable>
        <UiPager :page="page" :total-pages="totalPages"
            :info="'Mostrando ' + users.length + ' de ' + total" @go="goTo" />

        <!-- Criação: roles como texto livre separado por vírgulas (o datalist só
             SUGERE roles que o servidor conhece — meta.roleCounts do conjunto
             inteiro; a fonte da verdade é o seed). O formulário só
             aparece com a regra 'create User' da política (sub-admin não cria:
             nem o vê, e a API nega por si). -->
        <form class="user-form" v-if="$perm.can('create', 'User')" @submit.prevent="addUser">
            <input v-model="form.username" placeholder="username (ex.: carol)"
                aria-label="Username do novo utilizador">
            <input v-model="form.name" placeholder="nome (ex.: Carol Costa)"
                aria-label="Nome do novo utilizador">
            <input v-model="form.password" type="password" placeholder="password"
                aria-label="Password do novo utilizador">
            <input v-model="form.roles" list="known-roles" placeholder="roles: admin, user…"
                aria-label="Roles do novo utilizador (separadas por vírgula)">
            <datalist id="known-roles">
                <option v-for="r in knownRoles" :key="r" :value="r"></option>
            </datalist>
            <button type="submit" :disabled="saving">Criar utilizador (POST)</button>
        </form>
        <p v-if="error" class="error">{{ error }}</p>
    </UiPanel>
</template>

<script>
// Painel de gestão de utilizadores — CRUD sobre o RECURSO User em
// /api/admin/users:
//   GET    /api/admin/users     -> lista paginada (sem passwords; meta traz
//                                  editable/sorts/roleCounts) — regra read User
//   POST   /api/admin/users     -> cria {username, name, password, roles[]} (201) — regra create User
//   PUT    /api/admin/users/:id -> muda name / password (vazio = manter) / roles —
//                                  regra update User; o campo roles é RESERVADO ao
//                                  role admin (403 — defesa de escalada no users.js)
//   DELETE /api/admin/users/:id -> elimina (os posts dele permanecem; as sessões
//                                  dele morrem no registry: 401 => refresh falha
//                                  => logout) — regra delete User
//
// A listagem usa a DataTable genérica (ui/DataTable.vue), com paginação e
// ordenação SERVER-SIDE (?page&per_page&sort&order): o contrato de setas vem de
// meta.sorts, o de edição de meta.editable e o resumo de roles de
// meta.roleCounts. As especificidades do User ficam AQUI, na vista:
//  - PAYLOAD DO PUT: roles circulam como TEXTO na tabela (input com vírgulas,
//    preenchido pela DataTable a partir do array da linha) e como ARRAY no
//    pedido — a conversão é da vista, como no form de criação;
//  - CAMPO ROLES RESERVADO: o input desabilita-se (fieldDisabled) para a
//    própria conta (422: self-lockout) e para quem não tem o role admin (403) —
//    a API re-verifica por si;
//  - PASSWORD: type=password via fieldTypes; vazia = manter a actual;
//  - GATING dos botões: $perm.can('update'/'delete', 'User') + a própria conta
//    sem botão de eliminar (canRemoveUser); uma conta com o ROLE admin só se
//    edita pelo role admin (a API responde 403 — T12; canEditUser esconde o
//    botão na linha, UX que acompanha o servidor).
// Cada mutação é seguida de 1 GET (reloadUsers — a lista volta ao estado REAL
// do servidor, ids incluídos) e os erros mostram-se inline — a sessão nunca é
// limpa num 403 (ver core/http.js). isSelf() lê a sessão por this.$auth (nunca
// localStorage).
import UiPanel from '../../ui/UiPanel.vue';
import DataTable from '../../ui/DataTable.vue';
import UiPager from '../../ui/UiPager.vue';

export default {
    components: {
        UiPanel,
        DataTable,
        UiPager,
    },
    data() {
        return {
            users: [],
            page: 1,
            perPage: 6,
            total: 0,
            totalPages: 1,
            sort: 'id', // ?sort= activo — tem de estar em meta.sorts.allowed
            order: 'asc', // a listagem admin nasce do id menor (defaultOrder do recurso)
            loading: false,
            saving: false,
            error: '',
            editingId: null,
            // Contratos publicados pelo servidor na meta da listagem — a UI
            // segue-os sem os repetir (mudar a fábrica do mock reflecte-se
            // aqui sem tocar neste .vue).
            editable: [], // meta.editable — a lista branca do PUT
            sorts: { allowed: [], numeric: [] }, // meta.sorts — setas de ordenação
            roleCounts: [], // meta.roleCounts — contagem por role do conjunto inteiro
            // Rótulos/tipos dos inputs de edição (fieldLabels/fieldTypes da
            // DataTable): o QUE é editável vem do servidor; COMO se mostra, da
            // vista. Password vazio = manter a actual (placeholder explica).
            fieldLabels: { name: 'Nome', password: 'Nova password (vazio = manter)', roles: 'roles separadas por vírgula' },
            fieldTypes: { password: 'password' },
            // Colunas — SÓ apresentação (sortable/numeric derivam de
            // meta.sorts): 'name' tem seta (está em allowedSorts); 'roles' é
            // um array — não sorta, nem faz sentido que sorta. A coluna
            // 'Utilizador' edita name E password — dois inputs, uma célula.
            userColumns: [
                { key: 'name', label: 'Utilizador', editFields: ['name', 'password'] },
                { key: 'roles', label: 'Roles', editFields: ['roles'] },
            ],
            // Formulário de criação (fora da tabela — POST é fluxo próprio).
            form: { username: '', name: '', password: '', roles: '' },
        };
    },
    computed: {
        // Roles que o SERVIDOR conhece (meta.roleCounts — conjunto inteiro,
        // não a página): sugestões do <datalist> do form de criação.
        knownRoles() {
            return this.roleCounts.map(function (rs) { return rs.role; });
        },
    },
    created() {
        this.loadUsers(1);
    },
    methods: {
        // Sou eu? Aceita o row da linha OU o id cru (o username é editável em
        // outros utilizadores, o id não).
        isSelf(userOrId) {
            const id = userOrId && userOrId.id !== undefined ? userOrId.id : userOrId;
            const me = this.$auth.user;
            return !!me && String(me.id) === String(id);
        },
        rolesFromText(text) {
            return String(text || '').split(',')
                .map(function (r) { return r.trim(); })
                .filter(function (r) { return r; });
        },
        queryFor(page) {
            return { page: page, per_page: this.perPage, sort: this.sort, order: this.order };
        },
        applyPage(res) {
            const self = this;
            self.users = res.data.data;
            self.page = res.data.meta.page;
            self.total = res.data.meta.total;
            self.totalPages = res.data.meta.totalPages;
            // O contrato de interface chega com a lista — a UI segue o servidor.
            self.editable = res.data.meta.editable || [];
            self.sorts = res.data.meta.sorts || { allowed: [], numeric: [] };
            self.roleCounts = res.data.meta.roleCounts || [];
        },
        loadUsers(page) {
            const self = this;
            self.loading = true;
            self.error = '';
            self.$api.admin.listUsers(self.queryFor(page))
                .then(function (res) { self.applyPage(res); })
                .catch(function (err) {
                    self.error = 'GET /admin/users falhou' + self.detailOf(err);
                })
                .then(function () { self.loading = false; });
        },
        // Re-lê a página actual (depois de criar/editar/apagar). Se a página
        // deixou de existir (apagou-se o último utilizador dela), cai para a
        // última página válida da meta.
        reloadUsers() {
            const self = this;
            self.loading = true;
            self.error = '';
            return self.$api.admin.listUsers(self.queryFor(self.page))
                .then(function (res) {
                    if (!res.data.data.length && self.page > 1) {
                        return self.goTo(res.data.meta.totalPages);
                    }
                    self.applyPage(res);
                    return res;
                })
                .catch(function (err) {
                    self.error = 'GET /admin/users (reload) falhou' + self.detailOf(err);
                })
                .then(function () { self.loading = false; });
        },
        goTo(page) {
            // Clamps: entrada do "Ir para página" pode ser vazia/0/fora do intervalo.
            const target = Math.min(Math.max(1, parseInt(page, 10) || 1), Math.max(1, this.totalPages));
            if (target !== this.page || target === 1) this.loadUsers(target);
        },
        setPerPage(n) {
            this.perPage = n;
            this.loadUsers(1);
        },
        setSort(col) {
            if (this.sort === col) {
                this.order = this.order === 'asc' ? 'desc' : 'asc';
            } else {
                this.sort = col;
                this.order = 'asc';
            }
            this.loadUsers(1);
        },
        addUser() {
            const self = this;
            const roles = self.rolesFromText(self.form.roles);
            if (!roles.length) {
                self.error = 'Indica pelo menos um role (ex.: user).';
                return;
            }
            self.saving = true;
            self.error = '';
            self.$api.admin.createUser({
                username: self.form.username,
                name: self.form.name,
                password: self.form.password,
                roles: roles,
            })
                .then(function () {
                    self.form.username = '';
                    self.form.name = '';
                    self.form.password = '';
                    self.form.roles = '';
                    return self.loadUsers(1);
                })
                .catch(function (err) {
                    self.error = 'POST /admin/users falhou' + self.detailOf(err);
                })
                .then(function () { self.saving = false; });
        },
        cancelEdit() {
            this.editingId = null;
        },
        // ---------- acções por permissão (a DataTable recebe FUNÇÕES) ----------
        // Editar: a regra 'update User' gere contas COMUNS — uma conta com o
        // ROLE admin só se edita pelo role admin (a API responde 403 — T12;
        // esconder o botão na linha é a UX que acompanha o servidor).
        canEditUser(u) {
            const targetIsAdmin = Array.isArray(u && u.roles) && u.roles.indexOf('admin') !== -1;
            return this.$perm.can('update', 'User')
                && (!targetIsAdmin || this.$auth.hasRole('admin'));
        },
        // A própria conta não se elimina (a API devolveria 422 — esconder é UX).
        canRemoveUser(u) {
            return this.$perm.can('delete', 'User') && !this.isSelf(u);
        },
        // Campo roles RESERVADO (fieldDisabled da DataTable): a própria
        // conta não altera as próprias roles (422: self-lockout) e, sem o role
        // admin, o campo é do admin (403: defesa de escalada). O input fica
        // VISÍVEL mas inerte — como os botões gated por $perm.
        fieldDisabled(f, row) {
            return f === 'roles' && (this.isSelf(row) || !this.$auth.hasRole('admin'));
        },
        startEdit(row) {
            this.editingId = row.id; // o buffer preenche-se na DataTable (meta.editable)
        },
        // A DataTable emite { id, values } (só campos editáveis, aparados). O
        // PUT vive aqui: o editor só fecha quando o PUT teve sucesso (ou
        // cancelamento) — num 403/422 fica aberto com o que o utilizador
        // escreveu. Roles só vão no pedido quando quem edita pode alterá-las
        // (a API re-verifica: 422 na própria conta, 403 sem o role admin).
        saveEdit(payload) {
            const self = this;
            self.error = '';
            const body = { name: payload.values.name };
            if (payload.values.password) body.password = payload.values.password;
            if (!self.isSelf(payload.id) && self.$auth.hasRole('admin')) {
                body.roles = self.rolesFromText(payload.values.roles);
            }
            self.$api.admin.updateUser(payload.id, body)
                .then(function () {
                    self.editingId = null;
                    return self.reloadUsers();
                })
                .catch(function (err) {
                    self.error = 'PUT /admin/users/' + payload.id + ' falhou' + self.detailOf(err);
                });
        },
        removeUser(row) {
            const self = this;
            self.error = '';
            self.$api.admin.removeUser(row.id)
                .then(function () { return self.reloadUsers(); })
                .catch(function (err) {
                    self.error = 'DELETE /admin/users/' + row.id + ' falhou' + self.detailOf(err);
                });
        },
        // Mensagem curta por status: 422 mostra o campo e, se existir, a mensagem do
        // mock (ex.: "o username já existe"); 403 é "sem permissão" (sessão mantida).
        detailOf(err) {
            const res = err && err.response;
            if (!res) return '';
            const d = res.data || {};
            if (res.status === 422) {
                if (d.message) return ' (422 — ' + d.message + ')';
                if (d.field) return ' (422 validação: campo ' + d.field + ')';
            }
            return ' (HTTP ' + res.status + ')';
        },
    },
};
</script>

<style scoped>
/* Apresentação própria das células (slots cell-name/cell-roles) e do resumo —
   o resto da tabela (bordas, th uppercase, edição inline, td-actions) é CSS da
   própria DataTable: uma só fonte de estilo, como de contrato. */
.user-line {
    display: block;
    color: #667085;
    font-size: 0.82rem;
    margin-top: 0.1rem;
}
.roles-summary .badge {
    margin-left: 0.3rem;
}
.badge {
    display: inline-block;
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 600;
}
.badge-admin {
    background: #ede9fe;
    color: #6d28d9;
}
.badge-user {
    background: #e0f2fe;
    color: #0369a1;
}
.user-form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.9rem;
    align-items: center;
}
.user-form input {
    flex: 1 1 130px;
}
.user-form input[placeholder*="roles"] {
    flex: 1.5 1 170px;
}
</style>
