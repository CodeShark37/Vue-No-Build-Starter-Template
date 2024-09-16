
const routes = [
    //{ path: '*', redirect: '/' },
    { 
        path: '/:pathMatch', 
        name: 'NotFound', 
        component: () => load('./src/views/NotFoundView.vue') 
    },
    { 
        path: '/', 
        name: 'BaseView', 
        component: () => load("./src/views/BaseView.vue"),
        meta: {requiresAuth:false}
     }
];

export default routes;
