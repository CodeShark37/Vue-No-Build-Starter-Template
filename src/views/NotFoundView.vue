<template>
    <div>
        <h2>NotFound 404</h2>
        <h3>This is a NotFound example Route</h3>
        <h3>Try to access any route with <code>meta: {requiresAuth:true}</code> or not listed on router/index.js to see this page</h3>
        <h3>Set <code>meta: {requiresAuth:false}</code> in router/index.js to remove the authentication required on desired route</h3>
    </div>
  </template>
  
  <script>
  export default {
    components: {
      
    },
    data() {
      return {};
    },
    mounted(){
      console.log('NotFound View mounted')
    },
    head: {
      //for vue-head use
      title: {
        inner: "Vue2 No Build Starter Template",
        separator: "-",
        complement: "NotFoundView",
      },
    },
  };
  </script>
  
  <style scoped>
  
  </style>
  