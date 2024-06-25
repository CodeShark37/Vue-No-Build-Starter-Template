import routes from "./src/router/routerIndex.js";
import stores from "./src/store/storeIndex.js"; 

// Definindo o VueJS para o ambiente de desenvolvimento
Vue.config.productionTip = false;

// Configurações iniciais do axios para requisições http 
axios.defaults.withCredentials = true;
axios.defaults.responseType = 'json';
axios.defaults.baseURL = 'http://localhost/api/';

//Injectando plugins dentro do vue
Vue.use(Vuex);
Vue.use(VueHead);
Vue.use(VueRouter);

//Instanciando plugins

const store = new Vuex.Store(stores);

const router = new VueRouter({
    mode: "history",
    strict: true,
    routes : routes
});

var app = new Vue({
    components:{
        App: ()=>load('./App.vue')
    },
    template:'<App/>',
    router,
    store
}).$mount('#app');
