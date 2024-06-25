
const routes = [
    // dynamic segments start with a colon
    { path: '*', redirect: '/' },
    { path: '/', name: 'BaseView', component: () => load("./src/views/BaseView.vue") }
];

export default routes;
