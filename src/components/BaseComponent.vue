<template>
    <div>
        <h2>{{ headline }}</h2>
        <p>This is the paragraph with custom scoped CSS.</p>
        <h2>Base Record: {{ baseRecord }}</h2>
        <input type="text" v-model="inputValue" />
        <button @click="updateBaseRecord(inputValue)" disabled>Update Base Record</button>
    </div>
</template>
<script>
export default {
    data() {
        return {
            headline: 'Vue Base Component Headline',
            inputValue: ''
        };
    }, head: {
        //for vue-head use
    },
    mounted() {
        console.log('Vue Base Component mounted');
    }, computed: {
        baseRecord() {
            return this.$store.state.baseRecord;
        }
    }, methods: {
        updateBaseRecord(value) {
            const newData = { name: value };
            this.$store.dispatch('baseAction', newData);
        }
    }, watch:{
        inputValue(newValue){
            this.updateBaseRecord(newValue);
        }
    }
};
</script>
<style scoped>
p {
    color: rgb(0, 255, 76);
}
</style>
