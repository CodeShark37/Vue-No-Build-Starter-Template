import router from "./src/router/routerIndex.js";
import store from "./src/store/storeIndex.js";

//Injectando plugins dentro do vue
Vue.use(VueHead);

// Definindo o VueJS para o ambiente de desenvolvimento
Vue.config.productionTip = false;

// Configurações iniciais do axios para requisições http 
axios.defaults.withCredentials = true;
axios.defaults.responseType = 'json';
axios.defaults.baseURL = 'http://localhost/api/';

//Vue Single File Component Loader Setup

/* 
function load(path) {
    const options = {
        moduleCache: {
            vue: Vue,
            router: router
        },
        async getFile(url) {
            const resp = await fetch(url);
            return await (
                resp.ok ? resp.text() : Promise.reject(resp));
        },
        addStyle(styleStr) {
            const style = document.createElement('style');
            style.textContent = styleStr;
            const ref = document.head.getElementsByTagName('style')[0] || null;
            document.head.insertBefore(style, ref);
        },
        log(type, ...args) {
            console.log(type, ...args);
        }
    };
    return window["vue2-sfc-loader"].loadModule(path, options);
  } */

/* load("./App.vue").then(App => {
    router.routes = [
        // dynamic segments start with a colon
        //{ path: '*', redirect: '/' },
        { path: '/', name:'BaseView',component: () => load("./src/views/BaseView.vue")}
    ];

    new Vue({...App,router,store,data(){return{a:"teste"}}}).$mount("#app");
}); */
app = new Vue({
    router,
    store
}).$mount("#app");
