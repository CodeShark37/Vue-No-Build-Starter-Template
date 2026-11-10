<template>
    <div>
        <h2>Livros <span class="tag">2.º recurso · via fábrica registerCrud</span></h2>
        <p class="explain">O domínio de demonstração do caminho rápido (docs/03): as 5 rotas de
            CRUD (<code>GET /api/books</code> paginado, detalhe, POST, PUT, DELETE) vêm de
            <code>dev/mock/crud.js</code> — a mesma cadeia de política dos posts, escrita uma vez.
            A leitura também aqui é permissão: <code>read Book</code> vem de
            <code>GET /api/permissions</code> via <code>this.$perm.can(...)</code>.</p>

        <!-- A MESMA DataTable genérica do Feed (ui/DataTable.vue). Os campos
             editáveis chegam do SERVIDOR (meta.editable — a lista branca do PUT em
             dev/mock/routes/books.js): a DataTable desenha os inputs a partir daqui.
             A PRÓPRIA LEITURA é governada pela política (padrão do PostsView): enquanto a
             Ability não sincronizou (null) o painel fica; sem regra 'read Book', a tabela dá
             lugar ao painel .no-read — e a API nega por si (GET /books -> 403). O v-else tem de
             ficar COLADO ao v-if (só whitespace entre eles): um comentário no meio quebra a
             adjacência no compilador do sfc-loader e a vista deixa de renderizar. -->
        <UiPanel v-if="!$perm.ability || $perm.can('read', 'Book')" card>
            <DataTable
                :rows="rows" :columns="bookColumns" :loading="loading"
                :editing-id="editingId" :editable-fields="editable"
                :sorts-allowed="sorts.allowed" :sorts-numeric="sorts.numeric"
                :page="page" :per-page="perPage" :total="total" :total-pages="totalPages"
                :sort="sort" :order="order"
                noun="livros" empty-text="Sem livros no catálogo."
                :can-edit="canEditBook" :can-remove="canRemoveBook"
                @sort="setSort" @per-page="setPerPage" @refresh="reloadRows"
                @edit="startEdit" @cancel="cancelEdit" @save="saveEdit" @delete="removeBook">
                <!-- Acção EXTRA (slot actions da DataTable): o Detalhe — o
                     5.º verbo canónico (GET /books/:id). O gating fica
                     AQUI, na vista ($perm.can sobre a linha); a tabela continua
                     sem conhecer CASL nem o domínio. -->
                <template v-slot:actions="{ row }">
                    <UiIconBtn icon="view" label="Detalhe" @click="showDetail(row)" />
                </template>
            </DataTable>
            <!-- Resultado do último Detalhe (slot actions): leitura pontual,
                 inline, sem modal — o padrão “mutação segue-se de 1 GET” daqui
                 não se aplica: isto É um GET, o resultado mostra-se logo. -->
            <p v-if="detailText" class="detail-line" :class="{ 'detail-error': detailError }">{{ detailText }}</p>
            <UiPager :page="page" :total-pages="totalPages"
                :info="'Mostrando ' + rows.length + ' de ' + total" @go="goTo" />
            <p class="hint">Política (seed + painel <code>/admin/permissions</code>): o admin gere
                livros (<code>manage Book</code> — por isso vê os botões de editar/apagar); o user lê
                o catálogo (<code>read Book</code> — nenhuma edição, só o Detalhe). Os CAMPOS do
                formulário de edição vêm do servidor (<code>meta.editable</code>: title/author —
                year/pages são históricos). A coluna <em>Páginas</em> é o demo numérico da
                DataTable: formatação <code>Intl</code> pt-PT (agrupa milhares a partir de
                10&nbsp;000, regra do locale), alinhada à direita com dígitos tabulares, e o
                servidor ordena-a por NÚMERO (<code>?sort=pages</code> com
                <code>numericSorts</code>, publicado em <code>meta.sorts</code> —
                experimente: “A Hora da Estrela” (112) fica antes de
                “Os Lusíadas” (1008) na ordem ascendente, onde “1008” em texto viria antes de
                “112”). A escrita segue pelo <code>this.$api.content.books</code>
                (makeApi) — PUT/DELETE respondem conforme a política, contorne-se a UI ou não.</p>
        </UiPanel>
        <UiPanel v-else card title="Sem permissão para ler livros" class="no-read">
            <p class="explain">A política actual não dá <code>read</code> sobre <code>Book</code> ao
                teu role — gerida em <code>/admin/permissions</code>. A API nega por si:
                <code>GET /books</code> responde <strong>403</strong>. Esconder aqui é UX; bloquear
                lá é segurança.</p>
        </UiPanel>

        <p v-if="error" class="error">{{ error }}</p>
    </div>
</template>

<script>
// Vista do 2.º recurso — ORQUESTRADOR fino, como o PostsView, e sobre a MESMA
// tabela genérica (ui/DataTable.vue). A MÁQUINA DE LEITURA vem do mixin
// Vue.listPage (ui/list-page.js, partilhado com PostsView e UsersPanel); aqui
// fica o domínio: colunas, o Detalhe (5.º verbo canónico) e as mutações.
// Leitura paginada + ordenada (o servidor aceita ?sort id/title/author/pages),
// edição inline (PUT com a lista branca publicada em meta.editable:
// title/author) e apagar (DELETE 204), gated por $perm.can('update'/'delete',
// 'Book', book) — o admin (manage Book) vê tudo; o user (read Book) não vê
// nenhuma. Estados: loading do GET, .no-read quando a política não dá
// 'read Book', erro (403 = sem permissão, sessão mantida). Paginação e
// ordenação server-side, como nos posts.
//
// Dois demos desta vista:
//  - coluna 'Páginas' NUMÉRICA: o servidor declara 'pages' em allowedSorts +
//    numericSorts e o contrato viaja na meta (meta.sorts) — a DataTable formata
//    em pt-PT (Intl — 1008 -> '1 008') e ordena por NÚMERO sem a vista declarar
//    nada;
//  - slot actions com o botão Detalhe: consome o $api.content.books.get(id)
//    (makeApi) — o GET /books/:id, o 5.º verbo canónico. O gating é da vista:
//    read Book chega para ver o detalhe, sem precisar de manage.
import UiPanel from '../../ui/UiPanel.vue';
import DataTable from '../../ui/DataTable.vue';
import UiPager from '../../ui/UiPager.vue';
import UiIconBtn from '../../ui/UiIconBtn.vue';

// Formatador pt-PT do Detalhe: UMA instância no módulo (não uma por clique).
// A DataTable tem a SUA, para as colunas numeric; este é o da linha inline —
// formatação é da vista, a tabela só formata as colunas dela.
const pagesFmt = (typeof Intl !== 'undefined' && Intl.NumberFormat)
    ? new Intl.NumberFormat('pt-PT')
    : null;

export default {
    components: {
        UiPanel,
        DataTable,
        UiPager,
        UiIconBtn,
    },
    // Máquina de leitura server-driven (ui/list-page.js), igual à do Feed: a
    // vista só diz QUE endpoint ler e sobrepõe readError com o texto 403 daqui.
    mixins: [Vue.listPage({
        label: 'GET /books',
        fetch: function (query) { return this.$api.content.books.list(query); },
    })],
    data() {
        return {
            // Resultado do último botão Detalhe (slot actions): o texto
            // da linha inline e um sinal de erro para o estilo. Vazio = escondido.
            detailText: '',
            detailError: false,
            // Colunas da DataTable — SÓ APRESENTAÇÃO: sortable/
            // numeric derivam de meta.sorts ('title'/'author'/'pages' têm seta
            // por estarem em allowedSorts; 'pages' formata em pt-PT por estar
            // em numericSorts; 'year' não está em nenhum — histórico em TEXTO,
            // anos sem separador de milhares).
            bookColumns: [
                { key: 'title', label: 'Título' },
                { key: 'author', label: 'Autor' },
                { key: 'year', label: 'Ano', width: '5.5rem' },
                { key: 'pages', label: 'Páginas', width: '7rem' },
            ],
        };
    },
    methods: {
        // Mensagem de falha de leitura (SOBREPÕE a do mixin): 403 é POLÍTICA
        // (sem regra 'read' sobre Book): texto próprio; os restantes, o geral.
        readError(prefix, err) {
            if (err.response && err.response.status === 403) {
                return prefix + ' devolveu 403 — a política não dá "read" sobre "Book" ao teu role. Sessão mantida.';
            }
            return prefix + ' falhou' + this.$http.describe(err);
        },
        // ---------- acções por permissão (a DataTable recebe FUNÇÕES) ----------
        canEditBook(book) {
            return this.$perm.can('update', 'Book', book);
        },
        canRemoveBook(book) {
            return this.$perm.can('delete', 'Book', book);
        },
        // Detalhe (slot actions + makeApi.get): GET /books/:id,
        // o 5.º verbo canónico. O resultado mostra-se inline (uma linha, sem
        // modal); as pages formatam-se em pt-PT AQUI (apresentação é da vista —
        // a DataTable só formata as SUAS colunas numeric:). Erro mostra-se a
        // vermelho e NUNCA limpa a sessão (403 é “sem permissão”).
        showDetail(book) {
            const self = this;
            self.detailError = false;
            self.detailText = 'A obter GET /books/' + book.id + '…';
            self.$api.content.books.get(book.id)
                .then(function (res) {
                    const b = res.data.data || {};
                    const pages = typeof b.pages === 'number'
                        ? pagesFmt.format(b.pages) + ' págs.'
                        : 'edição sem contagem de páginas';
                    self.detailText = 'GET /books/' + b.id + ' → «' + b.title + '» · '
                        + b.author + ' · ' + b.year + ' · ' + pages;
                })
                .catch(function (err) {
                    self.detailError = true;
                    self.detailText = 'GET /books/' + book.id + ' falhou'
                        + self.$http.describe(err)
                        + (err.response && err.response.status === 403
                            ? ' — a política não dá "read" sobre este livro.' : '');
                });
        },
        // A DataTable emite { id, values } (só campos editáveis, aparados). Sem
        // título não há PUT (o servidor devolveria 422); o PUT vive aqui — o
        // editor só fecha quando o PUT teve sucesso (ou cancelamento); o estado
        // da sessão (editingId) é do mixin listPage.
        saveEdit(payload) {
            const self = this;
            if (!payload.values.title) return;
            self.error = '';
            self.$api.content.books.update(payload.id, payload.values)
                .then(function () {
                    self.editingId = null;
                    // O estado real chega pelo GET de recarga da página actual.
                    return self.reloadRows();
                })
                .catch(function (err) {
                    if (err.response && err.response.status === 403) {
                        self.error = 'PUT /books/' + payload.id + ' devolveu 403 — a política não dá "update" sobre este livro. Sessão mantida.';
                    } else {
                        self.error = 'PUT /books/' + payload.id + ' falhou' + self.$http.describe(err);
                    }
                });
        },
        removeBook(book) {
            const self = this;
            self.error = '';
            self.$api.content.books.remove(book.id)
                .then(function () {
                    return self.reloadRows();
                })
                .catch(function (err) {
                    if (err.response && err.response.status === 403) {
                        self.error = 'DELETE /books/' + book.id + ' devolveu 403 — a política não dá "delete" sobre este livro. Sessão mantida.';
                    } else {
                        self.error = 'DELETE /books falhou' + self.$http.describe(err);
                    }
                });
        },
    },
    head: {
        //for vue-head use
        title: {
            inner: "Vue2 No Build Starter Template",
            separator: "-",
            complement: "BooksView",
        },
    },
};
</script>

<style scoped>
/* .tag/.explain são globais do App.vue; aqui só a linha do Detalhe. */
/* Linha do Detalhe (slot actions): discreta, monoespaçada no sítio
   do pedido; a variante de erro fica vermelha. */
.detail-line {
    margin: 0.5rem 0 0;
    padding: 0.5rem 0.65rem;
    background: var(--surface-tint);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--badge-neutral-fg);
    font-size: 0.88rem;
}
.detail-error {
    background: var(--danger-soft);
    border-color: var(--danger-border);
    color: var(--danger-strong);
}</style>
