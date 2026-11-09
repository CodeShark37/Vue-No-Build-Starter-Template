<template>
    <form @submit.prevent="submit" class="post-form">
        <input :value="value" @input="$emit('input', $event.target.value)" placeholder="Título do novo post">
        <button type="submit" :disabled="saving">{{ saving ? 'A criar…' : 'Criar post' }}</button>
    </form>
</template>

<script>
// Formulário de criação reutilizável, no padrão v-model do Vue 2:
//   <PostForm v-model="newTitle" :saving="saving" @create="createPost" />
// O título é do PAI (assim o input sobrevive a falhas do POST); `saving` só
// controla o botão; `create` entrega o título já aparado.
export default {
    props: {
        value: { type: String, default: '' },
        saving: { type: Boolean, default: false },
    },
    methods: {
        submit() {
            this.$emit('create', this.value.trim());
        },
    },
};
</script>

<style scoped>
.post-form {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
}
</style>
