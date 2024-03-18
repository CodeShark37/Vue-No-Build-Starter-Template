<template>
    <div>
        <h2>{{ headline }}</h2>
        <p>This is the footer with custom scoped CSS.</p>
    </div>
</template>
<script>
    export default {
        data() {
            return {
                headline: 'Vue Base Component Headline'
            };
        },head:{
            //for vue-head use
        },
        mounted() {
            alert('Vue Base Component mounted');
        }
    };
</script>
<style scoped>
    p {
        color: rgb(0, 255, 76);
    }
</style>
