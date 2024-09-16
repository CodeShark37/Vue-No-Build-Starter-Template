import routes from "./src/router/index.js";
import stores from "./src/store/index.js"; 

// Definindo o VueJS para o ambiente de desenvolvimento
Vue.config.productionTip = false;
Vue.config.devtools = true;

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
})
//verifica se o usuario pode acessar uma rota que requer autenticação
router.beforeEach((to,from,next) => {
    if(to.meta.requiresAuth && !window.localStorage.getItem('token')){
        next('NotFound');
    }else{
        next();
    }
});
/* Instanciando o Vue */
var app = new Vue({
    components:{
        App: ()=>load('./App.vue')
    },
    template:'<App/>',
    store,
    router
}).$mount('#app');
