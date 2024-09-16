<template>
  <div>
    <BaseComponent/>
  </div>
</template>

<script>
import BaseComponent from '../components/BaseComponent.vue';
export default {
  components: {
    BaseComponent
  },
  data() {
    return {};
  },
  mounted(){
    console.log('Base View mounted')
  },
  head: {
    //for vue-head use
    title: {
      inner: "Vue2 No Build Starter Template",
      separator: "-",
      complement: "BaseView",
    },
  },
};
</script>

<style scoped>

</style>
