import router from "./src/router/routerIndex.js";
import store from "./src/store/storeIndex.js"; 

//Injectando plugins dentro do vue
Vue.use(VueHead);

// Definindo o VueJS para o ambiente de desenvolvimento
Vue.config.productionTip = false;
Vue.config.devtools = true;
// Configurações iniciais do axios para requisições http 
axios.defaults.withCredentials = true;
axios.defaults.responseType = 'json';
axios.defaults.baseURL = 'http://localhost/api/';

var app = new Vue({
    router,
    store,
}).$mount("#app"); 
