// Configuração de ambiente. Este é o único ficheiro que muda num deploy.
// Corre antes dos vendors e decide a variante do Vue e se o Mirage é carregado.
window.ENV = {
    // '' ou '/api/' usa a mesma origem; com o mock activo esta base não é usada.
    apiBase: 'http://localhost/api/',

    // Carrega o Mirage em desenvolvimento; false usa a API real.
    mock: true,

    // Usa a build de desenvolvimento do Vue.
    vueDebug: false,
};

// As tags entram na mesma fila defer dos vendors estáticos, preservando
// vue -> Mirage (se activo) -> sfc-loader -> restantes vendors -> main.js.
(function () {
    var vue = window.ENV.vueDebug ? 'vendor-dev/vue.dev.js' : 'vendor/vue.min.js';
    document.write('<script defer src="' + vue + '"><\/script>');
    if (window.ENV.mock) {
        document.write('<script defer src="vendor-dev/mirage.min.js"><\/script>');
    }
})();
