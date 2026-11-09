<template>
  <div>
    <BaseComponent/>
  </div>
</template>

<script>
import BaseComponent from './BaseComponent.vue';
export default {
  components: {
    BaseComponent
  },
  data() {
    return {};
  },
  head: {
    //for vue-head use
    title: {
      inner: "Vue2 No Build Starter Template",
      separator: "-",
      complement: "HomeView",
    },
  },
};
</script>

<style scoped>

</style>
