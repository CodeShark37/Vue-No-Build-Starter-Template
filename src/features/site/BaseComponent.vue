<template>
    <div>
        <h2>{{ headline }}</h2>
        <p>This is the paragraph with custom scoped CSS.</p>
        <h2>Base Record: {{ record }}</h2>
        <input type="text" @input="update($event.target.value)" />
    </div>
</template>

<script>
// `vuex` resolve via moduleCache do loader (ver core/loader.js).
import { mapState } from 'vuex';

export default {
    data() {
        return {
            headline: 'Vue Base Component Headline',
        };
    },
    computed: mapState('base', ['record']),
    methods: {
        update(value) {
            this.$store.dispatch('base/updateRecord', { name: value });
        },
    },
};
</script>

<style scoped>
p {
    color: rgb(0, 255, 76);
}
</style>
