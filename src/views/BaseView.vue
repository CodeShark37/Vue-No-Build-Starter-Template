<template>
  <div>
    <base-component></base-component>
  </div>
</template>

<script>
//import BaseComponent from '../components/BaseComponent.vue';

export default {
  components: {
    BaseComponent:() => load('./src/components/BaseComponent.vue') 
  },
  data() {
    return {};
  },
  head: {
    //for vue-head use
    title: {
      inner: "Vue2 NoCLI StarterKit Template",
      separator: "-",
      complement: "BaseView",
    },
  },
};
</script>

<style scoped>

</style>
