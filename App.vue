<template>
    <div>
        <router-view></router-view>
    </div>
</template>

<script>

export default {
    components: {
    },
    mounted() {
        alert("App mounted")
    }
}
</script>

<style scoped></style>