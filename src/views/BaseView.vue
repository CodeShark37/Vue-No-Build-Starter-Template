<template>
  <div>
    <BaseComponent/>
  </div>
</template>

<script>

export default {
  components: {
    BaseComponent:() => load('./src/components/BaseComponent.vue') 
  },
  data() {
    return {};
  },
  mounted(){
    alert('Base View mounted')
  },
  head: {
    //for vue-head use
    title: {
      inner: "Vue2 Local StarterKit",
      separator: "-",
      complement: "BaseView",
    },
  },
};
</script>

<style scoped>

</style>
