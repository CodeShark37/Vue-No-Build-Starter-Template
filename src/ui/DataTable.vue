<template>
    <div>
        <div class="toolbar">
            <p v-if="total > 0" class="meta">Página {{ page }} de {{ totalPages }} · {{ total }} {{ noun }} no total ·
                mostrando {{ rows.length }}</p>
            <p v-else class="meta">Sem {{ noun }}.</p>
            <div class="toolbar-chips">
                <label class="chip rows-chip">Mostrar
                    <select :value="perPage" @change="onPerPage" aria-label="Linhas por página">
                        <option :value="4">4</option>
                        <option :value="6">6</option>
                        <option :value="8">8</option>
                        <option :value="12">12</option>
                    </select>
                </label>
                <button class="chip chip-btn" @click="$emit('refresh')">Actualizar (GET)</button>
            </div>
        </div>

        <p v-if="loading" class="dt-loading">A carregar…</p>
        <div class="table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th v-for="col in resolvedColumns" :key="col.key" :class="{ sortable: col.sortable }"
                            :style="col.width ? { width: col.width } : null" @click="col.sortable && $emit('sort', col.key)">
                            {{ col.label }}
                            <span v-if="col.sortable" class="sort-arrow" :class="{ on: sort === col.key }">{{ sortArrow(col.key) }}</span>
                        </th>
                        <th class="col-actions"><span class="visually-hidden">Acções</span></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in rows" :key="row.id">
                        <td v-for="col in resolvedColumns" :key="col.key" :class="{ 'td-numeric': col.numeric }">
                            <template v-if="isEditing(row) && col.edits.length">
                                <input v-for="f in col.edits" :key="f" class="edit-input"
                                    :class="{ 'edit-next': col.edits.length > 1 && f !== col.edits[0] }"
                                    v-model="editValues[f]" :type="fieldTypes[f] || 'text'"
                                    :placeholder="fieldTitle(col, f)" :aria-label="'Editar ' + fieldTitle(col, f)"
                                    :disabled="fieldDisabledFor(f, row)" @keyup.enter="save">
                            </template>
                            <template v-else>
                                <template v-if="hasCellSlot(col)">
                                    <slot :name="'cell-' + col.key" :row="row"></slot>
                                </template>
                                <template v-else>
                                    <span v-if="col.sub" class="cell-stack">
                                        <strong>{{ row[col.key] }}</strong>
                                        <small>{{ row[col.sub] }}</small>
                                    </span>
                                    <span v-else>{{ renderCell(col, row[col.key]) }}</span>
                                </template>
                            </template>
                        </td>
                        <td class="td-actions">
                            <template v-if="isEditing(row)">
                                <UiIconBtn icon="save" label="Guardar" @click="save" />
                                <UiIconBtn icon="cancel" label="Cancelar" @click="$emit('cancel')" />
                            </template>
                            <template v-else>
                                <UiIconBtn v-if="canEditRow(row)" icon="edit" label="Editar" @click="startEdit(row)" />
                                <UiIconBtn v-if="canRemoveRow(row)" icon="delete" label="Apagar" @click="$emit('delete', row)" />
                                <slot name="actions" :row="row"></slot>
                            </template>
                        </td>
                    </tr>
                    <tr v-if="!rows.length && !loading">
                        <td :colspan="columns.length + 1" class="td-empty">{{ emptyText }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script>
// DataTable — a tabela GENÉRICA de listas do template (ui/: regra de colocação,
// 2+ features). Usada por PostsView (slot cell-author com badges de role),
// BooksView (coluna numérica 'Páginas' + slot de acções extra com o Detalhe) e
// pelo UsersPanel do admin (slots cell-name/cell-roles, fieldTypes,
// fieldDisabled). Nada de User, Post ou Book aqui dentro: o domínio é sempre
// da vista.
//
// REGRAS DE COMPILADOR (vue2-sfc-loader 0.9.5) — respeitar SEMPRE:
//  1. Comentário HTML ENTRE v-if e v-else -> componente inteiro sem render.
//     Toda a documentação vive neste <script>; o <template> fica sem comentários.
//  2. <template v-else> dentro do fallback de um <slot> -> o compilador do
//     loader devolve um ARRAY e o patch despeja um texto "undefined" na célula.
//     Fallback usa ramos de elemento real (<span v-else>).
//  3. O renderSlot (_t) do loader NÃO INVOCa o fallback de um <slot>: devolve
//     um vnode vazio e o patch escreve "undefined" na célula. Por isso a
//     célula NUNCA confia no fallback: hasCellSlot() consulta $scopedSlots e
//     decide entre <slot> SEM fallback (o caminho que funciona — o actions
//     prova-o) e o render por omissão daqui.
//  (O mesmo princípio do UiIconBtn: dentro de <svg> nem <template v-if> nem
//  comentários. A classe 1 tem verificador fora do template; 2 e 3 são
//  convenção documentada aqui.)
//
// Repartição de responsabilidades:
//  - DADOS (lista, página, ordenação, loading): props — o dono é a vista, que
//    fala com a API; a tabela só emite intenções (sort/per-page/refresh/delete).
//  - EDIÇÃO: os campos editáveis são SEMPRE os publicados pelo SERVIDOR
//    (meta.editable, prop editableFields) — a lista branca do PUT é política
//    do recurso, não da vista; o buffer local (editValues) é o único estado
//    visual daqui. A sessão de edição (editingId) é CONTROLADA pelo pai: o
//    editor só fecha quando o PUT teve sucesso (ou cancelamento); num 403
//    fica aberto com o que o utilizador escreveu.
//  - ORDENAÇÃO/FORMATO: idem — sortable e numeric de cada coluna derivam das
//    props sortsAllowed/sortsNumeric (meta.sorts da listagem, ao lado do
//    meta.editable). Coluna só tem seta se o servidor aceitar ?sort= dela; só
//    formata como número o que o servidor compara como número. col.sortable/
//    col.numeric na config da vista sobrevivem SÓ como fallback de
//    compatibilidade (props a null) — nenhuma vista do template usa esse
//    caminho.
//  - APRESENTAÇÃO por célula: slots nomeados `cell-<key>` com `{ row }` — a
//    vista sobrepõe o que for domínio dela (ex.: badges de role); sem slot,
//    renderiza o campo (e col.sub como 2.ª linha, para pares título/corpo).
//  - PERMISSÕES: chegam como FUNÇÕES (canEdit/canRemove) — este componente
//    não conhece CASL, subjects nem roles; a vista decide com $perm.can.
//
// Colunas: { key, label, width?, sub?, editFields? } — key é o campo exibido E
// o campo de ordenação pedido ao servidor (?sort=); editFields lista os campos
// que a coluna edita (omissão: [key]; a coluna 'Post' dos posts edita title E
// body — dois inputs, uma célula). 'numeric' formata o valor com
// Intl.NumberFormat('pt-PT') e alinha a coluna à direita com dígitos
// tabulares — SÓ na leitura: em edição a célula continua a mostrar os inputs
// de texto.
//
// Slots: cell-<key> com { row } para APRESENTAÇÃO própria de uma célula;
// actions com { row } para ACÇÕES EXTRA da vista, a seguir aos botões padrão
// de editar/apagar (o gating $perm fica na vista).
//
// Em save() emite { id, values } com os campos editáveis aparados — quem
// valida é o servidor (422); a vista pode aparar antes por UX.
import UiIconBtn from './UiIconBtn.vue';

// Formatador pt-PT partilhado por todas as DataTables da página: UMA
// instância (Intl em cada render seria desperdício). Sem Intl (WebView
// antigo), renderCell devolve o número tal e qual.
const numberFmt = (typeof Intl !== 'undefined' && Intl.NumberFormat)
    ? new Intl.NumberFormat('pt-PT')
    : null;

export default {
    components: {
        UiIconBtn,
    },
    props: {
        rows: { type: Array, required: true },
        // Configuração de colunas (ver cabeçalho): { key, label, sortable?, width?, sub?, editFields? }
        columns: { type: Array, required: true },
        loading: { type: Boolean, default: false },
        // Sessão de edição: prop CONTROLADA pelo pai (null = nenhuma linha aberta).
        editingId: { type: [Number, String], default: null },
        // Campos editáveis publicados pelo servidor (meta.editable). Vazio => a
        // tabela nem oferece o botão de editar.
        editableFields: { type: Array, default: function () { return []; } },
        // meta.sorts: os campos ?sort= que o servidor ACEITA e os que compara
        // como NÚMERO — a fonte de sortable/numeric das colunas. null
        // (omissão) = cai para col.sortable/col.numeric da config (caminho de
        // compatibilidade; as vistas do template passam SEMPRE estes props).
        sortsAllowed: { type: Array, default: null },
        sortsNumeric: { type: Array, default: null },
        page: { type: Number, required: true },
        perPage: { type: Number, required: true },
        total: { type: Number, default: 0 },
        totalPages: { type: Number, default: 1 },
        sort: { type: String, default: 'id' },
        order: { type: String, default: 'desc' },
        // Textos: substantivo no plural ('posts', 'livros') e linha de tabela vazia.
        noun: { type: String, default: 'registos' },
        emptyText: { type: String, default: 'Sem registos.' },
        // Rótulos humanos dos campos para os inputs de edição (omissão: o nome do campo).
        fieldLabels: { type: Object, default: function () { return {}; } },
        // Tipo HTML do input de edição por campo: ex. { password: 'password' }.
        // Omissão 'text'. Apresentação pura — o que É editável vem de meta.editable.
        fieldTypes: { type: Object, default: function () { return {}; } },
        // Função do pai: (campo, row) => boolean — desabilita UM input da
        // sessão de edição (ex.: campo reservado a um role). Como
        // canEdit/canRemove: o gating é da vista, a tabela continua genérica.
        fieldDisabled: { type: Function, default: null },
        // Funções do pai: (row) => boolean — gating de acções por política ($perm).
        canEdit: { type: Function, default: null },
        canRemove: { type: Function, default: null },
    },
    data() {
        return {
            // Buffer de edição: { <campo>: valor } só dos campos editáveis —
            // preenchido ao clicar em editar, limpo quando o pai fecha a sessão.
            editValues: {},
        };
    },
    computed: {
        // Colunas RESOLVIDAS: a config da vista (key/label/width/sub/editFields)
        // cruzada com o contrato do servidor — sortable/numeric vêm de
        // sortsAllowed/sortsNumeric (meta.sorts) quando publicados; só na
        // ausência de meta caem para a flag antiga da coluna; edits já traz os
        // campos editáveis DESTA coluna cruzados com editableFields (o template
        // lê col.edits — sem recalcular o filtro em cada passo do render).
        // É ESTE array que o template percorre (cabeça e corpo).
        resolvedColumns() {
            const self = this;
            return this.columns.map(function (col) {
                const fields = col.editFields || [col.key];
                return Object.assign({}, col, {
                    sortable: self.sortsAllowed ? self.sortsAllowed.indexOf(col.key) !== -1 : !!col.sortable,
                    numeric: self.sortsNumeric ? self.sortsNumeric.indexOf(col.key) !== -1 : !!col.numeric,
                    edits: fields.filter(function (f) { return self.editableFields.indexOf(f) !== -1; }),
                });
            });
        },
    },
    watch: {
        // O pai fechou a edição (guardou ou cancelou): limpar o buffer local.
        editingId: function (v) {
            if (v === null) this.editValues = {};
        },
        // A lista mudou (reload/ordenação/página/apagar): se a linha em edição já
        // não existe, pedir ao pai para fechar a sessão de edição.
        rows: function (list) {
            if (this.editingId === null) return;
            const self = this;
            const stillThere = list.some(function (r) { return String(r.id) === String(self.editingId); });
            if (!stillThere) this.$emit('cancel');
        },
    },
    methods: {
        onPerPage(e) {
            this.$emit('per-page', parseInt(e.target.value, 10) || 6);
        },
        sortArrow(col) {
            if (this.sort !== col) return '↕';
            return this.order === 'asc' ? '↑' : '↓';
        },
        // Valor por omissão de uma célula (sem slot da vista): col.numeric
        // formata NÚMEROS com as regras pt-PT do Intl; strings passam
        // intactas (o year é texto histórico — anos sem formatação numérica,
        // de propósito).
        renderCell(col, value) {
            if (col.numeric && typeof value === 'number' && isFinite(value)) {
                return numberFmt ? numberFmt.format(value) : String(value);
            }
            return value;
        },
        // A vista fornece apresentação própria para esta coluna? (ex.: badges
        // de role no Feed). Testamos $scopedSlots À MÃO e nunca confiamos no
        // fallback do <slot> — terceira regra de compilador do cabeçalho.
        hasCellSlot(col) {
            return !!this.$scopedSlots['cell-' + col.key];
        },
        isEditing(row) {
            return this.editingId !== null && String(row.id) === String(this.editingId);
        },
        // Os campos editáveis DESTA coluna já vêm resolvidos no col.edits do
        // computed resolvedColumns (editFields ou [key], cruzados com o que o
        // servidor publica). Coluna sem campo editável => exibe em modo leitura
        // mesmo durante a edição (ex.: 'Ano' do livro, 'Autor' do post).
        canEditRow(row) {
            return !!(this.editableFields.length && this.canEdit && this.canEdit(row));
        },
        canRemoveRow(row) {
            return !!(this.canRemove && this.canRemove(row));
        },
        // Rótulo humano do campo no input: fieldLabels (da vista) > rótulo da
        // coluna (quando ela só edita um campo) > o nome do campo.
        fieldTitle(col, f) {
            if (this.fieldLabels[f]) return this.fieldLabels[f];
            const fields = col.editFields || [col.key];
            return fields.length === 1 ? col.label : f;
        },
        // Input de edição desabilitado para este campo/linha? (fieldDisabled do
        // pai — ex.: o campo roles no UsersPanel é reservado ao role admin e
        // fixo na própria conta: a API responde 403/422; a UI mostra-o inerte.)
        fieldDisabledFor(f, row) {
            return !!(this.fieldDisabled && this.fieldDisabled(f, row));
        },
        startEdit(row) {
            const buf = {};
            this.editableFields.forEach(function (f) {
                buf[f] = row[f] === undefined || row[f] === null ? '' : String(row[f]);
            });
            this.editValues = buf;
            this.$emit('edit', row);
        },
        // Emite a INTENÇÃO de guardar — o PUT vive na vista. Os valores saem
        // aparados e só dos campos editáveis (o servidor ignora os restantes
        // de qualquer forma: lista branca).
        save() {
            const self = this;
            const values = {};
            this.editableFields.forEach(function (f) {
                const v = self.editValues[f];
                values[f] = typeof v === 'string' ? v.trim() : v;
            });
            this.$emit('save', { id: this.editingId, values: values });
        },
    },
};
</script>

<style scoped>
.meta {
    color: var(--text-faint);
    font-size: 0.88rem;
    margin: 0.15rem 0;
}

/* ---------- barra da tabela ---------- */
.toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.6rem;
}
.toolbar-chips {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
}
.chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface-sunken); /* toolbar do mockup: controlos em bg-subtle */
    color: var(--badge-neutral-fg);
    font-size: 0.85rem;
    padding: 0.35rem 0.65rem;
}
.chip select {
    border: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    padding: 0 0.15rem;
    cursor: pointer;
}
.chip-btn {
    cursor: pointer;
}
.chip-btn:hover {
    background: var(--surface-hover);
}
.dt-loading {
    color: var(--text-faint);
}

/* ---------- tabela ---------- */
/* .table-wrap (overflow-x) é global do App.vue; aqui só a margem própria. */
.table-wrap {
    margin: 0.3rem 0 0;
}
.data-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.93rem;
}
.data-table th {
    background: var(--surface-sunken);
    text-align: left;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    padding: 0.65rem 0.9rem;
    white-space: nowrap;
}
.data-table th:first-child {
    border-radius: 8px 0 0 8px;
}
.data-table th:last-child {
    border-radius: 0 8px 8px 0;
}
.data-table th.sortable {
    cursor: pointer;
    user-select: none;
}
.data-table th.sortable:hover {
    color: var(--badge-neutral-fg);
}
.sort-arrow {
    color: var(--text-disabled);
    font-size: 0.78rem;
    margin-left: 0.25rem;
}
.sort-arrow.on {
    color: var(--badge-neutral-fg);
}
.data-table td {
    padding: 0.85rem 0.9rem;
    vertical-align: middle;
    color: var(--text);
    overflow-wrap: break-word;
}
.data-table tbody tr:hover {
    background: var(--surface-tint);
}
.cell-stack strong {
    display: block;
    font-weight: 600;
}
.cell-stack small {
    display: block;
    color: var(--text-soft);
    font-size: 0.84rem;
    margin-top: 0.12rem;
    line-height: 1.35;
}
.col-actions {
    width: 4.5rem;
}
.td-actions {
    text-align: right;
    white-space: nowrap;
}
/* Coluna numérica (col.numeric): alinhada à direita, dígitos tabulares —
   milhares alinham verticalmente e comparar-se olhos, como numa folha. */
.td-numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.td-empty {
    color: var(--text-faint);
    text-align: center;
    padding: 1.4rem 0.9rem;
}

/* ---------- edição inline ---------- */
.edit-input {
    width: 100%;
    max-width: 30rem;
    padding: 0.35rem 0.55rem;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    font-size: 0.9rem;
    color: var(--text);
}
.edit-input.edit-next {
    margin-top: 0.4rem;
    color: var(--badge-neutral-fg);
}
.edit-input:focus {
    outline: none;
    border-color: var(--primary);
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
}</style>
