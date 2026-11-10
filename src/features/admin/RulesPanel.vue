<template>
    <UiPanel card title="Política de permissões (CRUD admin — /api/rules)">
        <p class="hint">CRUD sobre o model <code>rule</code> do mock via <code>/api/rules</code>
            — a tabela central que um backend real teria. Aqui está a política <strong>crua</strong>:
            as conditions mostram o placeholder <code>${user.id}</code>; é a LEITURA por
            utilizador (painel em <code>/admin/stats</code>) que o materializa. A API é a autoridade:
            <strong>401</strong> sem sessão, <strong>403</strong> sem o role admin, <strong>422</strong>
            com validação falhada (texto vazio, conditions inválidas, regra duplicada, conjunto de
            ids divergente) e na auto-protecção — nenhuma mutação deixa o role <code>admin</code>
            sem regras. Depois de cada mutação a lista volta a ser o estado REAL do servidor e a
            Ability re-sincroniza (<code>$perm.sync()</code>): botões e links acompanham sem recarregar.</p>

        <p class="hint order-hint"><strong>ORDENAR = PERMITIR (v12.5).</strong> A lista está na ordem de
            AVALIAÇÃO do CASL (<code>position</code>): quando duas regras casam o mesmo
            (<em>acção, subject</em>), a <strong>ÚLTIMA é que vence</strong> — o CASL valida com
            preferência para a regra mais recente. Arraste as linhas pela alça
            <span class="handle-legend">&#9776;</span> para reordenar (PUT <code>/rules/order</code>);
            as regras marcadas <span class="badge badge-cannot">cannot</span> NEGAM o que as
            anteriores permitiram, por isso o efeito de movê-las vê-se logo: negar
            <em>update Post</em> por cima da owner rule tranca TODOS os posts; arrastá-la
            para o fim (ou para o topo, antes da owner) devolve o acesso aos próprios.</p>

        <p v-if="loading">A carregar política… (GET /api/rules)</p>
        <div v-else class="table-wrap">
            <table class="rules-table">
                <thead>
                    <tr>
                        <th class="th-pos" title="Ordem de avaliação CASL — a última que casa vence">#</th>
                        <th>Role</th>
                        <th>Acção</th>
                        <th>Subject</th>
                        <th>Conditions (cruas)</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(r, index) in rules" :key="r.id"
                        class="rule-row" :class="{ 'dragging': draggingId === r.id, 'drag-over': overId === r.id }"
                        draggable="true"
                        @dragstart="onDragStart(r, $event)" @dragover.prevent="onDragOver(r, $event)"
                        @drop.prevent="onDrop(r, $event)" @dragend="onDragEnd">
                        <td class="td-pos">
                            <span class="handle" title="Arraste para reordenar (a última regra que casa vence)">&#9776;</span>
                            <span class="pos-num">{{ index + 1 }}</span>
                        </td>
                        <td class="td-role">
                            <template v-if="editingId === r.id">
                                <input class="edit-input" v-model="edit.role" list="rule-roles"
                                    aria-label="Editar role" @keyup.enter="saveEdit(r)">
                            </template>
                            <template v-else>
                                <span class="badge" :class="r.role === 'admin' ? 'badge-admin' : 'badge-user'">{{ r.role }}</span>
                            </template>
                        </td>
                        <td class="td-label">
                            <template v-if="editingId === r.id">
                                <input class="edit-input" v-model="edit.action" list="rule-actions"
                                    aria-label="Editar acção" @keyup.enter="saveEdit(r)">
                            </template>
                            <template v-else>
                                <strong>{{ r.action }}</strong>
                                <span v-if="r.inverted" class="badge badge-cannot" title="Regra de negação (cannot no CASL)">cannot</span>
                            </template>
                        </td>
                        <td class="td-label">
                            <template v-if="editingId === r.id">
                                <input class="edit-input" v-model="edit.subject" list="rule-subjects"
                                    aria-label="Editar subject" @keyup.enter="saveEdit(r)">
                            </template>
                            <template v-else>
                                {{ r.subject }}
                            </template>
                        </td>
                        <td class="td-conditions">
                            <template v-if="editingId === r.id">
                                <input class="edit-input edit-conditions" v-model="edit.conditions"
                                    placeholder='JSON opcional, ex.: {"authorId":"${user.id}"}'
                                    aria-label="Editar conditions (JSON opcional)" @keyup.enter="saveEdit(r)">
                            </template>
                            <template v-else>
                                <code>{{ conditionsText(r) }}</code>
                            </template>
                        </td>
                        <td class="td-actions">
                            <template v-if="editingId === r.id">
                                <UiIconBtn icon="save" label="Guardar regra" @click="saveEdit(r)" />
                                <UiIconBtn icon="cancel" label="Cancelar" @click="cancelEdit" />
                            </template>
                            <template v-else>
                                <UiIconBtn icon="edit" label="Editar regra" @click="startEdit(r)" />
                                <UiIconBtn icon="delete" label="Eliminar regra" @click="removeRule(r)" />
                            </template>
                        </td>
                    </tr>
                    <tr v-if="!rules.length && !loading">
                        <td colspan="6" class="td-empty">Política vazia — fail-closed total.</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Criação: conditions em JSON à mão (vazio = regra sem condições, vale
             para TODOS os objetos do subject); "Negar" cria um CANNOT (inverted).
             As datalists só SUGEREM valores já vistos; a fonte da verdade continua
             a ser o servidor. A regra nova nasce em ÚLTIMO lugar (a mais recente
             é a que vence) — para pô-la antes de outra, arraste depois de criar. -->
        <form class="rule-form" @submit.prevent="addRule">
            <input v-model="form.role" list="rule-roles" placeholder="role (ex.: user)"
                aria-label="Role da nova regra">
            <input v-model="form.action" list="rule-actions" placeholder="acção (ex.: read)"
                aria-label="Acção da nova regra">
            <input v-model="form.subject" list="rule-subjects" placeholder="subject (ex.: Post)"
                aria-label="Subject da nova regra">
            <input v-model="form.conditions" class="input-conditions" placeholder='conditions JSON opcional'
                aria-label="Conditions da nova regra (JSON opcional)">
            <label class="cannot-check" title="Regra de negação CASL (inverted): negam-se acções em vez de as permitir">
                <input type="checkbox" v-model="form.inverted"> negar (cannot)
            </label>
            <button type="submit" :disabled="saving">Criar regra (POST)</button>
        </form>
        <datalist id="rule-roles">
            <option v-for="r in knownRoles" :key="r" :value="r"></option>
        </datalist>
        <datalist id="rule-actions">
            <option v-for="a in knownActions" :key="a" :value="a"></option>
        </datalist>
        <datalist id="rule-subjects">
            <option v-for="s in knownSubjects" :key="s" :value="s"></option>
        </datalist>
        <p v-if="error" class="error">{{ error }}</p>
    </UiPanel>
</template>

<script>
// Painel admin da política de permissões. A ordem da lista é a ordem de
// avaliação CASL; PUT /rules/order exige o conjunto completo de ids.
import UiPanel from '../../ui/UiPanel.vue';
import UiIconBtn from '../../ui/UiIconBtn.vue';

export default {
    components: {
        UiPanel,
        UiIconBtn,
    },
    data() {
        return {
            rules: [],
            loading: false,
            saving: false,
            error: '',
            editingId: null,
            // Estado do drag & drop.
            draggingId: null,
            overId: null,
            // Buffer da edição inline; a linha só muda via PUT.
            edit: { role: '', action: '', subject: '', conditions: '', inverted: false },
            form: { role: '', action: '', subject: '', conditions: '', inverted: false },
        };
    },
    computed: {
        knownRoles() { return this.uniq(this.rules, 'role'); },
        knownSubjects() { return this.uniq(this.rules, 'subject'); },
        // Acções CASL sugeridas; texto livre continua aceite.
        knownActions() {
            const seen = this.uniq(this.rules, 'action');
            ['manage', 'read', 'create', 'update', 'delete'].forEach(function (a) {
                if (seen.indexOf(a) === -1) seen.push(a);
            });
            return seen;
        },
    },
    created() {
        this.loadAll();
    },
    methods: {
        uniq(list, field) {
            const seen = [];
            list.forEach(function (r) {
                if (r[field] && seen.indexOf(r[field]) === -1) seen.push(r[field]);
            });
            return seen;
        },
        conditionsText(rule) {
            return rule.conditions ? JSON.stringify(rule.conditions) : '—';
        },
        // Texto -> objecto|null; o servidor revalida o resultado.
        parseConditions(text) {
            const t = String(text || '').trim();
            if (!t) return null;
            const value = JSON.parse(t); // lança SyntaxError -> apanhado abaixo
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                throw new Error('conditions têm de ser um objecto JSON (ex.: {"authorId":"${user.id}"})');
            }
            return value;
        },
        loadAll() {
            const self = this;
            self.loading = true;
            self.error = '';
            self.$api.admin.listRules()
                .then(function (res) { self.rules = res.data.data || []; })
                .catch(function (err) {
                    self.error = 'GET /rules falhou' + self.$http.describe(err);
                })
                .then(function () { self.loading = false; });
        },
        // Reconsulta as permissões depois de alterar a política.
        syncPerm() {
            if (this.$perm && this.$perm.sync) this.$perm.sync();
        },
        addRule() {
            const self = this;
            let conditions;
            try {
                conditions = self.parseConditions(self.form.conditions);
            } catch (e) {
                self.error = 'Conditions: ' + e.message;
                return;
            }
            self.saving = true;
            self.error = '';
            self.$api.admin.createRule({
                role: self.form.role,
                action: self.form.action,
                subject: self.form.subject,
                conditions: conditions,
                inverted: self.form.inverted === true,
            })
                .then(function () {
                    self.form.role = '';
                    self.form.action = '';
                    self.form.subject = '';
                    self.form.conditions = '';
                    self.form.inverted = false;
                    self.syncPerm();
                    return self.loadAll();
                })
                .catch(function (err) {
                    self.error = 'POST /rules falhou' + self.$http.describe(err);
                })
                .then(function () { self.saving = false; });
        },
        // ---------- drag & drop da ordem de avaliação ----------
        onDragStart(rule, ev) {
            // Não arrastar durante edição inline.
            if (this.editingId !== null) { ev.preventDefault(); return; }
            this.draggingId = rule.id;
            // Necessário para iniciar o gesto no Firefox.
            try {
                ev.dataTransfer.effectAllowed = 'move';
                ev.dataTransfer.setData('text/plain', String(rule.id));
            } catch (e) { /* WebView sem DataTransfer: os handlers internos bastam */ }
        },
        onDragOver(rule) {
            if (this.draggingId === null || this.draggingId === rule.id) return;
            this.overId = rule.id;
        },
        onDrop(rule) {
            const self = this;
            if (self.draggingId === null || self.draggingId === rule.id) { self.onDragEnd(); return; }
            const from = self.rules.findIndex(function (r) { return r.id === self.draggingId; });
            const to = self.rules.findIndex(function (r) { return r.id === rule.id; });
            self.onDragEnd();
            if (from === -1 || to === -1) return;
            // Atualiza localmente antes de persistir.
            const moved = self.rules.splice(from, 1)[0];
            self.rules.splice(to, 0, moved);
            // O servidor exige o conjunto completo e continua a ser a autoridade.
            const ids = self.rules.map(function (r) { return r.id; });
            self.error = '';
            self.$api.admin.reorderRules(ids)
                .then(function (res) {
                    self.rules = (res.data && res.data.data) || self.rules;
                    self.syncPerm();
                })
                .catch(function (err) {
                    self.error = 'PUT /rules/order falhou' + self.$http.describe(err);
                    return self.loadAll(); // rollback: volta à ordem real do servidor
                });
        },
        onDragEnd() {
            this.draggingId = null;
            this.overId = null;
        },
        startEdit(r) {
            this.editingId = r.id;
            this.edit.role = r.role;
            this.edit.action = r.action;
            this.edit.subject = r.subject;
            this.edit.conditions = r.conditions ? JSON.stringify(r.conditions) : '';
            this.edit.inverted = !!r.inverted;
        },
        cancelEdit() {
            this.editingId = null;
        },
        saveEdit(r) {
            const self = this;
            let conditions;
            try {
                conditions = self.parseConditions(self.edit.conditions);
            } catch (e) {
                self.error = 'Conditions: ' + e.message;
                return;
            }
            self.error = '';
            self.$api.admin.updateRule(r.id, {
                role: self.edit.role,
                action: self.edit.action,
                subject: self.edit.subject,
                conditions: conditions,
                inverted: self.edit.inverted === true,
            })
                .then(function () {
                    self.editingId = null;
                    self.syncPerm();
                    return self.loadAll();
                })
                .catch(function (err) {
                    self.error = 'PUT /rules/' + r.id + ' falhou' + self.$http.describe(err);
                });
        },
        removeRule(r) {
            const self = this;
            self.error = '';
            self.$api.admin.removeRule(r.id)
                .then(function () {
                    self.syncPerm();
                    return self.loadAll();
                })
                .catch(function (err) {
                    self.error = 'DELETE /rules/' + r.id + ' falhou' + self.$http.describe(err);
                });
        },
    },
};
</script>

<style scoped>
/* Tabela própria do painel (drag & drop); o .table-wrap e os badges são
   globais do App.vue. */
.rules-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
}
.rules-table th {
    text-align: left;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-faint);
    padding: 0.45rem 0.5rem;
    border-bottom: 1px solid var(--border);
}
.rules-table td {
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-soft);
    vertical-align: middle;
}
.th-pos {
    width: 3.2rem;
}
/* Linhas arrastáveis: a alça diz ao utilizador ONDE se pega; a linha em
   movimento fica translúcida e a de destino ganha uma barra superior. */
.rule-row[draggable="true"] {
    cursor: move;
}
.rule-row.dragging {
    opacity: 0.45;
}
.rule-row.drag-over td {
    border-top: 2px solid var(--primary);
}
.td-pos {
    white-space: nowrap;
}
.handle {
    color: var(--text-disabled);
    font-size: 1rem;
    margin-right: 0.3rem;
    user-select: none;
}
.pos-num {
    color: var(--text-faint);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
}
.handle-legend {
    color: var(--text-disabled);
    font-size: 1rem;
}
.order-hint {
    background: var(--info-soft);
    border: 1px solid var(--info-border);
    border-radius: 6px;
    padding: 0.5rem 0.6rem;
    color: var(--text-soft);
}
.td-role {
    white-space: nowrap;
}
.td-label {
    white-space: nowrap;
}
.td-conditions code {
    font-size: 0.8rem;
    color: var(--text-soft);
    word-break: break-all;
}
.td-actions {
    white-space: nowrap;
    text-align: right;
}
.td-empty {
    color: var(--text-faint);
    text-align: center;
    padding: 1rem 0;
}
.edit-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.35em 0.5em;
}
.edit-conditions {
    min-width: 220px;
}
/* Regra cannot (inverted): vermelho — NEGA o que as anteriores permitiram
   (a pílula .badge e a variante .badge-cannot são globais do App.vue). */
.rule-form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.9rem;
    align-items: center;
}
.rule-form input {
    flex: 1 1 120px;
}
.rule-form .input-conditions {
    flex: 1.6 1 200px;
}
.cannot-check {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.9rem;
    color: var(--text-soft);
    white-space: nowrap;
}
.cannot-check input {
    flex: none;
}</style>
