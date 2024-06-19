Vue.use(VueRouter);

const router = new VueRouter({
    mode: "history",
    strict: true,
    routes : [
        // dynamic segments start with a colon
        { path: '*', redirect: '/' },
        { path: '/', name:'BaseView',component: () =>load("./src/views/BaseView.vue")}
    ] 
});

export default router;