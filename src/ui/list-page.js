// Mixin partilhado pelas vistas de lista. Centraliza paginação, ordenação,
// recarga pós-mutação e edição inline. É registado como Vue.listPage em
// app/services.js para evitar uma segunda cópia do módulo nos componentes .vue.
//
// Composição (semântica de mixins do Vue 2):
//  - data: o mixin traz o estado da lista; o que a vista declarar com o MESMO
//    nome vence (as vistas só acrescentam chaves próprias — sem conflitos);
//  - methods: os da vista SOBREPÕEM os do mixin — é assim que readError()
//    ganha o texto 403 do domínio (posts/livros) mantendo a máquina igual;
//  - hooks: o created() da vista corre DEPOIS do do mixin — nada a fazer:
//    a 1.ª leitura é do próprio mixin.
//
// As mutações, colunas e regras de permissão continuam nas vistas; o mixin
// apenas repõe o estado real do servidor após cada mutação.
//
// Contrato de leitura esperado pelo mixin (o mesmo da DataTable/UiPager):
//   fetch(query) -> res  com  res.data.data = linhas
//                         res.data.meta = { page, total, totalPages,
//                                           editable?, sorts?, ...extras }

/**
 * Fábrica do mixin de listagem (ver cabeçalho). Registada em app/services.js
 * como `Vue.listPage` — as vistas usam `mixins: [Vue.listPage({ ... })]`.
 * @param {Object} opts
 * @param {function(this: Vue, Object): Promise} opts.fetch GET da listagem;
 *        recebe o query {page, per_page, sort, order} e devolve a promessa do
 *        axios (ex.: function (q) { return this.$api.content.posts.list(q); }).
 * @param {string} opts.label rótulo do endpoint nas mensagens de leitura
 *        (ex.: 'GET /posts'; a recarga acrescenta ' (reload)').
 * @param {function(Vue, Object): void} [opts.apply] extras da meta por vista
 *        (ex.: roleCounts no UsersPanel) — corre depois do applyRows padrão.
 * @param {number} [opts.perPage=6] linhas por página inicial.
 * @param {string} [opts.order='desc'] ordem inicial ('asc' na listagem admin).
 * @returns {Object} mixin (options object do Vue 2)
 */
export function listPage(opts) {
    return {
        data() {
            return {
                // Linhas da página corrente — o GET é a fonte da verdade: nada
                // de manter estado local além desta lista (mutação => reload).
                rows: [],
                page: 1,
                perPage: opts.perPage || 6,
                total: 0,
                totalPages: 1,
                sort: 'id', // coluna activa (?sort=) — tem de estar em meta.sorts.allowed
                order: opts.order || 'desc', // 'asc' | 'desc'
                loading: false,
                error: '',
                // Sessão de edição inline: CONTROLADA pela vista dona — o editor
                // só fecha quando o PUT teve sucesso (ou cancelamento); num 403
                // fica aberto com o que o utilizador escreveu.
                editingId: null,
                // Contratos publicados pelo SERVIDOR na meta da listagem — a UI
                // segue-os sem os repetir (mudar o mock reflecte-se aqui sem
                // tocar nas vistas).
                editable: [], // meta.editable — a lista branca do PUT
                sorts: { allowed: [], numeric: [] }, // meta.sorts — setas + formato numérico
            };
        },
        created() {
            this.loadRows(1);
        },
        methods: {
            // Parâmetros de leitura: paginação + ordenação, tudo resolvido no servidor.
            queryFor(page) {
                return { page: page, per_page: this.perPage, sort: this.sort, order: this.order };
            },
            // Mensagem de falha de leitura POR OMISSÃO — a vista pode sobrepor
            // (PostsView/BooksView dão texto próprio ao 403 da política).
            readError(prefix, err) {
                return prefix + ' falhou' + this.$http.describe(err);
            },
            // A meta da listagem manda: linhas, totais e os contratos de UI
            // (editable/sorts). opts.apply acrescenta os extras da vista.
            applyRows(res) {
                const meta = res.data.meta || {};
                this.rows = res.data.data;
                this.page = meta.page;
                this.total = meta.total;
                this.totalPages = meta.totalPages;
                this.editable = meta.editable || [];
                this.sorts = meta.sorts || { allowed: [], numeric: [] };
                if (opts.apply) opts.apply(this, meta);
            },
            // Leitura de uma página (1.ª carga, ordenação, per-page, "Ir para
            // página"). loading/error geridos aqui — a vista não repete nada.
            loadRows(page) {
                const self = this;
                self.loading = true;
                self.error = '';
                return opts.fetch.call(self, self.queryFor(page))
                    .then(function (res) { self.applyRows(res); return res; })
                    .catch(function (err) { self.error = self.readError(opts.label, err); })
                    .then(function () { self.loading = false; });
            },
            // Re-lê a página ACTUAL (depois de editar/apagar; é também o botão
            // "Actualizar (GET)"). Se a página deixou de existir (apagou-se a
            // última linha dela), cai para a última página válida da meta — e a
            // promessa só resolve quando a lista real já chegou (goTo devolve a
            // promessa da 2.ª leitura: o loading não apaga a meio da troca).
            reloadRows() {
                const self = this;
                self.loading = true;
                self.error = '';
                return opts.fetch.call(self, self.queryFor(self.page))
                    .then(function (res) {
                        if (!res.data.data.length && self.page > 1) {
                            return self.goTo(res.data.meta.totalPages);
                        }
                        self.applyRows(res);
                        return res;
                    })
                    .catch(function (err) {
                        self.error = self.readError(opts.label + ' (reload)', err);
                    })
                    .then(function () { self.loading = false; });
            },
            // Clamps: entrada do "Ir para página" pode ser vazia/0/fora do
            // intervalo. Devolve a promessa da leitura (ou resolve na hora
            // quando não há nada a ler) — mutações e reload encadeiam nela.
            goTo(page) {
                const target = Math.min(Math.max(1, parseInt(page, 10) || 1), Math.max(1, this.totalPages));
                if (target !== this.page || target === 1) return this.loadRows(target);
                return Promise.resolve();
            },
            setPerPage(n) {
                this.perPage = n;
                this.loadRows(1);
            },
            // Clique na mesma coluna alterna asc/desc; coluna nova começa asc.
            setSort(col) {
                if (this.sort === col) {
                    this.order = this.order === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sort = col;
                    this.order = 'asc';
                }
                this.loadRows(1);
            },
            // Sessão de edição inline: a DataTable emite 'edit'/'cancel'; o
            // buffer dos inputs (editValues) é DELA — daqui só o id em edição.
            startEdit(row) {
                this.editingId = row.id;
            },
            cancelEdit() {
                this.editingId = null;
            },
        },
    };
}
