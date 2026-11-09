<template>
    <div>
        <h2>Feed <span class="tag">rota protegida · zona /content</span></h2>
        <p class="explain">Todos os pedidos passam por <code>this.$api.content.posts</code>
            (makeApi('/posts') em features/content/index.js) sobre o axios de
            <code>core/http.js</code>, que anexa o cabeçalho <code>Authorization: Bearer …</code>
            pelo interceptor.</p>

        <!-- Tabela genérica (ui/DataTable.vue): leitura paginada e ordenada (GET), edição
             inline (PUT) e apagar (DELETE). Os CAMPOS EDITÁVEIS chegam do SERVIDOR
             (meta.editable — a lista branca do PUT em dev/mock/routes/posts.js): a
             DataTable desenha os inputs a partir daqui. A PRÓPRIA LEITURA é governada
             pela política: enquanto a Ability não sincronizou (null) o painel fica
             (fail-closed só esconde ACÇÕES, não a página); sem regra 'read' no sync, a
             tabela é substituída pelo painel .no-read — e a API nega por si (GET /posts
             -> 403), com ou sem este painel. O v-else tem de ficar COLADO ao v-if (só
             whitespace entre eles): um comentário no meio quebra a adjacência no
             compilador do sfc-loader e a vista deixa de renderizar. -->
        <UiPanel v-if="!$perm.ability || $perm.can('read', 'Post')" card>
            <DataTable
                :rows="posts" :columns="postColumns" :loading="loading"
                :editing-id="editingId" :editable-fields="editable"
                :sorts-allowed="sorts.allowed" :sorts-numeric="sorts.numeric"
                :page="page" :per-page="perPage" :total="total" :total-pages="totalPages"
                :sort="sort" :order="order"
                noun="posts" empty-text="Sem posts — cria um em baixo."
                :field-labels="postFieldLabels"
                :can-edit="canEditPost" :can-remove="canRemovePost"
                @sort="setSort" @per-page="setPerPage" @refresh="reloadCurrent"
                @edit="startEdit" @cancel="cancelEdit" @save="saveEdit" @delete="removePost">
                <!-- Célula do autor: apresentação própria desta vista (nome + badges do
                     ROLE REAL do autor — post.authorRoles, juntado pelo servidor em
                     routes/posts.js, e não um username que por acaso coincide com um
                     role). Roles desconhecidos ficam na cor neutra do .badge; role novo
                     no seed não exige tocar aqui. -->
                <template v-slot:cell-author="{ row }">
                    <span class="author-name">{{ row.author }}</span>
                    <span class="role-badges">
                        <span v-for="role in (row.authorRoles || [])" :key="role" class="badge"
                            :class="'badge-role-' + role">{{ role }}</span>
                    </span>
                </template>
            </DataTable>
            <UiPager :page="page" :total-pages="totalPages"
                :info="'Mostrando ' + posts.length + ' de ' + total" @go="goTo" />
            <p class="hint">Os botões de editar/apagar aparecem conforme as permissões do utilizador
                (<code>GET /api/permissions</code> → <code>this.$perm.can(...)</code>): admin pode tudo;
                o user só nos próprios posts. Os CAMPOS do formulário de edição vêm do servidor
                (<code>meta.editable</code>). A LEITURA também é da política — sem regra
                <code>read Post</code>, <code>GET /posts</code> responde <strong>403</strong>. Mesmo
                contornando a UI, a API nega — "sem permissão": a sessão mantém-se, nada é limpo.</p>
        </UiPanel>
        <UiPanel v-else card title="Sem permissão para ler posts" class="no-read">
            <!-- Painel só UX: o 403 do GET é o enforcement real (ver dev/mock/routes/posts.js). -->
            <p class="explain">A política actual não dá <code>read</code> sobre <code>Post</code> ao teu
                role — gerida em <code>/admin/permissions</code>. A API nega por si:
                <code>GET /posts</code> responde <strong>403</strong> e a sessão mantém-se. Esconder
                aqui é UX; bloquear lá é segurança.</p>
        </UiPanel>

        <!-- Escrita: criação (gated por permissões: pode ser escondido para roles sem 'create'). -->
        <UiPanel v-if="$perm.can('create', 'Post')">
            <template #title>Novo post <code>POST /posts</code></template>
            <PostForm v-model="newTitle" :saving="saving" @create="createPost" />
        </UiPanel>

        <p v-if="error" class="error">{{ error }}</p>
    </div>
</template>

<script>
// Vista da zona /content (meta.requiresAuth no PAI, declarada em
// features/content/index.js) — um ORQUESTRADOR fino: detém o estado dos dados
// e fala com a API por this.$api.content.posts (makeApi('/posts')); toda a
// apresentação vive em componentes:
//   UiPanel       — caixa/painel padrão (ui/)
//   DataTable     — TABELA GENÉRICA (ui/): toolbar, ordenação, edição
//                   inline e acções — colunas por config, células por slot
//   UiPager       — paginação numerada + "ir para página" (ui/)
//   PostForm      — criação (v-model + @create)
//
// Reactividade — quem depende do quê:
//  - Tabela e paginação: o GET é a fonte da verdade. Paginação numerada, linhas por
//    página e ordenação vivem NO SERVIDOR (?page, ?per_page, ?sort, ?order). Depois
//    de CRIAR, EDITAR ou APAGAR, `reloadCurrent()` re-lê do servidor a página actual
//    (1 GET): totais, páginas e badges passam a reflectir o estado REAL da API.
//  - EDIÇÃO server-driven: os campos do formulário de edição são os que o
//    servidor publica em meta.editable (a lista branca do PUT) — mudar
//    `editable` em dev/mock/routes/posts.js muda a UI aqui, sem tocar na vista.
//  - ORDENAÇÃO server-driven: idem para as setas e o formato numérico —
//    meta.sorts {allowed, numeric} da listagem alimenta as props da DataTable.
//  - Acções (editar/apagar/criar): derivam de $perm.can(...) — core/ability.js
//    refetch das regras do servidor em cada mudança de sessão; sem regras, nada
//    de acções visível (fail-closed).
//  - A LEITURA também: enquanto a Ability não chegou o painel da tabela fica
//    (loading é do GET); quando chega sem regra 'read Post', a tabela dá lugar
//    ao painel .no-read. O bloqueio real é a API (GET /posts -> 403) — isto é UX.
import UiPanel from '../../ui/UiPanel.vue';
import DataTable from '../../ui/DataTable.vue';
import UiPager from '../../ui/UiPager.vue';
import PostForm from './PostForm.vue';

export default {
    components: {
        UiPanel,
        DataTable,
        UiPager,
        PostForm,
    },
    data() {
        return {
            posts: [],
            newTitle: '',
            page: 1,
            perPage: 6,
            total: 0,
            totalPages: 1,
            sort: 'id', // coluna activa (?sort=) — tem de estar em meta.sorts.allowed
            order: 'desc', // 'asc' | 'desc'
            editingId: null,
            // Campos editáveis PUBLICADOS pelo servidor (meta.editable da listagem):
            // a fonte de verdade do formulário de edição é a API, nunca a vista.
            editable: [],
            // Contrato de ORDENAÇÃO publicado pelo servidor (meta.sorts):
            // que ?sort= é aceite e o que compara como número. Define as setas e
            // a formatação numérica da DataTable — mudar allowedSorts/
            // numericSorts em dev/mock/routes/posts.js reflecte-se aqui sem
            // tocar nesta vista.
            sorts: { allowed: [], numeric: [] },
            // Configuração DAS COLUNAS (só APRESENTAÇÃO): key é o
            // campo exibido (e o ?sort= pedido ao clicar — aceites em
            // meta.sorts.allowed); sub põe o corpo como 2.ª linha; editFields
            // diz que a coluna 'Post' edita title E body (dois inputs numa
            // célula). sortable/numeric derivam de meta.sorts na DataTable —
            // não se declaram aqui (era editar em dois sítios).
            postColumns: [
                { key: 'title', label: 'Post', sub: 'body', editFields: ['title', 'body'] },
                { key: 'author', label: 'Autor', width: '10rem' },
            ],
            postFieldLabels: { title: 'Título', body: 'Corpo' },
            loading: false,
            saving: false,
            error: '',
        };
    },
    created() {
        this.loadPosts(1);
    },
    methods: {
        // Parâmetros de leitura: paginação + ordenação, tudo resolvido no servidor.
        queryFor(page) {
            return { page: page, per_page: this.perPage, sort: this.sort, order: this.order };
        },
        applyPage(res) {
            const self = this;
            self.posts = res.data.data;
            self.page = res.data.meta.page;
            self.total = res.data.meta.total;
            self.totalPages = res.data.meta.totalPages;
            // O contrato de edição chega com a lista — a UI segue o servidor.
            self.editable = res.data.meta.editable || [];
            // Idem para a ordenação (setas) e o formato numérico.
            self.sorts = res.data.meta.sorts || { allowed: [], numeric: [] };
        },
        loadPosts(page) {
            const self = this;
            self.loading = true;
            self.error = '';
            self.$api.content.posts.list(self.queryFor(page))
                .then(function (res) { self.applyPage(res); })
                .catch(function (err) {
                    self.error = self.readError('GET /posts', err);
                })
                .then(function () { self.loading = false; });
        },
        // Mensagem de falha de leitura: 403 é POLÍTICA (sem regra 'read' — ver
        // dev/mock/routes/posts.js), com texto próprio; os restantes, o formato geral.
        readError(prefix, err) {
            if (err.response && err.response.status === 403) {
                return prefix + ' devolveu 403 — a política não dá "read" sobre "Post" ao teu role. Sessão mantida.';
            }
            return prefix + ' falhou' + (err.response ? ' (HTTP ' + err.response.status + ')' : '');
        },
        goTo(page) {
            // Clamps: entrada do "Ir para página" pode ser vazia/0/fora do intervalo.
            const target = Math.min(Math.max(1, parseInt(page, 10) || 1), Math.max(1, this.totalPages));
            if (target !== this.page || target === 1) this.loadPosts(target);
        },
        setPerPage(n) {
            this.perPage = n;
            this.loadPosts(1);
        },
        setSort(col) {
            if (this.sort === col) {
                this.order = this.order === 'asc' ? 'desc' : 'asc';
            } else {
                this.sort = col;
                this.order = 'asc';
            }
            this.loadPosts(1);
        },
        // Re-lê do servidor a página actual e SUBSTITUI a lista. É a API quem diz
        // quantas páginas existem AGORA: nada de adivinhar total/páginas localmente
        // depois de criar, editar ou apagar. Serve também de botão "Actualizar (GET)".
        // Se a página actual deixou de existir (ex.: apagou-se o último post dela),
        // cai para a última página válida devolvida pela meta.
        reloadCurrent() {
            const self = this;
            self.loading = true;
            self.error = '';
            return self.$api.content.posts.list(self.queryFor(self.page))
                .then(function (res) {
                    if (!res.data.data.length && self.page > 1) {
                        return self.goTo(res.data.meta.totalPages);
                    }
                    self.applyPage(res);
                    return res;
                })
                .catch(function (err) {
                    self.error = self.readError('GET /posts (reload)', err);
                })
                .then(function () { self.loading = false; });
        },
        createPost(title) {
            const self = this;
            if (!title) return; // PostForm já aparou; título vazio não viaja
            self.saving = true;
            self.error = '';
            self.$api.content.posts.create({ title: title, body: 'Criado via axios + MirageJS.' })
                .then(function () {
                    self.newTitle = '';
                    // Sem unshift local: o novo post chega pelo GET de recarga
                    // (página 1 — ordenação por omissão é "mais recente primeiro"),
                    // tal como chega a qualquer outro cliente que re-leia a lista.
                    return self.goTo(1);
                })
                .catch(function (err) {
                    self.error = 'POST /posts falhou' + (err.response ? ' (HTTP ' + err.response.status + ')' : '');
                })
                .then(function () { self.saving = false; });
        },
        removePost(post) {
            const self = this;
            self.error = '';
            self.$api.content.posts.remove(post.id)
                .then(function () {
                    // Feedback imediato; o GET de recarga confirma o estado real.
                    self.posts = self.posts.filter(function (p) { return p.id !== post.id; });
                    return self.reloadCurrent();
                })
                .catch(function (err) {
                    // 403 = sem permissão (a política não dá 'delete' sobre o post): sessão mantida.
                    if (err.response && err.response.status === 403) {
                        self.error = 'DELETE /posts/' + post.id + ' devolveu 403 — a política não dá "delete" sobre este post. Sessão mantida.';
                    } else {
                        self.error = 'DELETE /posts falhou' + (err.response ? ' (HTTP ' + err.response.status + ')' : '');
                    }
                });
        },
        // Acções gated pela política — chegam à DataTable como FUNÇÕES (a tabela é
        // burra: não conhece CASL nem subjects; a vista decide com $perm.can).
        canEditPost(post) {
            return this.$perm.can('update', 'Post', post);
        },
        canRemovePost(post) {
            return this.$perm.can('delete', 'Post', post);
        },
        // Edição inline: a DataTable emite intenções ({ id, values }); o PUT vive
        // aqui. O editingId é CONTROLADO por esta vista — o editor só fecha quando
        // o PUT teve sucesso (ou cancelamento); num 403 fica aberto com o que o
        // utilizador escreveu. Sem título não há PUT (o servidor devolveria 422).
        startEdit(post) {
            this.editingId = post.id;
        },
        cancelEdit() {
            this.editingId = null;
        },
        saveEdit(payload) {
            const self = this;
            if (!payload.values.title) return;
            self.error = '';
            self.$api.content.posts.update(payload.id, payload.values)
                .then(function () {
                    self.editingId = null;
                    // O estado real chega pelo GET de recarga da página actual.
                    return self.reloadCurrent();
                })
                .catch(function (err) {
                    if (err.response && err.response.status === 403) {
                        self.error = 'PUT /posts/' + payload.id + ' devolveu 403 — a política não dá "update" sobre este post. Sessão mantida.';
                    } else {
                        self.error = 'PUT /posts/' + payload.id + ' falhou' + (err.response ? ' (HTTP ' + err.response.status + ')' : '');
                    }
                });
        },
    },
    head: {
        //for vue-head use
        title: {
            inner: "Vue2 No Build Starter Template",
            separator: "-",
            complement: "PostsView",
        },
    },
};
</script>

<style scoped>
.tag {
    font-weight: 400;
    font-size: 0.8rem;
    color: #888;
}
.explain {
    color: #555;
}

/* ---------- célula do autor (slot cell-author da DataTable) ---------- */
.author-name {
    font-weight: 500;
    margin-right: 0.4rem;
}
.role-badges {
    display: inline;
}
.badge {
    display: inline-block;
    padding: 0.28rem 0.7rem;
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 600;
    line-height: 1.2;
    background: #eef0f3; /* neutro: role desconhecido (sem paleta própria) */
    color: #475467;
}
.badge + .badge {
    margin-left: 0.25rem;
}
.badge-role-admin {
    background: #f3e8ff;
    color: #9333ea;
}
.badge-role-user {
    background: #e0f2fe;
    color: #0284c7;
}
.badge-role-editor {
    background: #fef3c7;
    color: #b45309;
}
.badge-role-viewer {
    background: #f1f5f9;
    color: #64748b;
}
</style>
