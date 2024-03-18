import "../../globals.js";

Vue.use(VueRouter);

const router = new VueRouter({
    mode: "history",
    strict: true,
    /* routes : [
        // dynamic segments start with a colon
        //{ path: '*', redirect: '/' },
        { path: '/', name:'BaseView',component: () => app.$data.loadModule("../views/BaseView.vue")}
    ] */
});

router.map({
    '/': {
        name: 'BaseView',
        component: console.log(Vue.$loadModule)
    }
});
export default router;