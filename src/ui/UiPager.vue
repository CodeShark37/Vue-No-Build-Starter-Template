<template>
    <div class="table-footer">
        <span class="rows-info">{{ info }}</span>
        <div class="pager">
            <button class="page-btn nav" :disabled="page <= 1" @click="go(page - 1)" aria-label="Página anterior">‹</button>
            <button v-for="n in totalPages" :key="n" class="page-btn" :class="{ active: n === page }"
                :aria-label="'Página ' + n" @click="go(n)">{{ n }}</button>
            <button class="page-btn nav" :disabled="page >= totalPages" @click="go(page + 1)" aria-label="Página seguinte">›</button>
        </div>
        <label class="goto">Ir para página
            <input type="number" v-model.number="pageInput" min="1" :max="totalPages"
                @keyup.enter="go(pageInput)" aria-label="Número da página">
        </label>
    </div>
</template>

<script>
// Paginação numérica reutilizável: anterior/seguinte, botões por página e "ir para
// página". Burra de propósito — só emite `go(n)`; o dono da lista é quem valida o
// intervalo e recarrega (clamps no pai). `info` é a linha "Mostrando X de Y".
export default {
    props: {
        page: { type: Number, required: true },
        totalPages: { type: Number, required: true },
        info: { type: String, default: '' },
    },
    data() {
        return {
            // Campo "Ir para página" é estado LOCAL do widget; acompanha a página
            // real (props) para não ficar dessincronizado após refresh/reload.
            pageInput: this.page,
        };
    },
    watch: {
        page: function (n) { this.pageInput = n; },
    },
    methods: {
        go(n) { this.$emit('go', n); },
    },
};
</script>

<style scoped>
.table-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.9rem;
    padding-top: 0.8rem;
    border-top: 1px solid #f2f4f7;
}
.rows-info {
    color: #98a2b3;
    font-size: 0.84rem;
}
.pager {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
}
.page-btn {
    min-width: 32px;
    height: 32px;
    padding: 0 0.45rem;
    border: none;
    border-radius: 8px;
    background: #f2f4f7;
    color: #475467;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
}
.page-btn:hover:not(.active):not(:disabled) {
    background: #e9ecef;
}
.page-btn.active {
    background: #1f2937;
    color: #fff;
}
.page-btn:disabled {
    opacity: 0.45;
    cursor: default;
}
.goto {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: #667085;
    font-size: 0.84rem;
}
.goto input {
    width: 3.4rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid #e4e7ec;
    border-radius: 8px;
    font: inherit;
    color: #1f2937;
    text-align: center;
}
</style>
