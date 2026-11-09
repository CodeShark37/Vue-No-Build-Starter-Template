// Configuração por AMBIENTE — o ÚNICO ficheiro a mudar no deploy.
//
// É um script CLÁSSICO (não módulo) e corre ANTES dos vendors: decide QUE vue
// entra na fila de scripts e se o servidor mock (Mirage) vem para produção.
// O src/core/config.js lê window.ENV e acrescenta o resto (root, cache, auth…).
//
// Deploy: mudar os valores abaixo e apagar as pastas de desenvolvimento
// (vendor-dev/ e dev/) — nada mais muda; nada disto é importado pelos vendors.
window.ENV = {
    // Base da API real. '' ou '/api/' = mesma origem da página; com o mock activo
    // nem sequer é usada (o Mirage interpreta os XHR antes de saírem para a rede).
    apiBase: 'http://localhost/api/',

    // Servidor mock (vendor-dev/mirage.min.js + dev/mock/): true injecta o script
    // e arranca o Mirage — só faz sentido em desenvolvimento. false = API real.
    mock: true,

    // true usa vendor-dev/vue.dev.js (avisos completos do Vue) em vez do min.
    // Não mexe no index.html: é a 2ª razão para este ficheiro existir.
    vueDebug: false,
};

// Injecção DINÂMICA dos scripts que dependem do ambiente. O document.write corre
// durante o parse e insere as tags NO SÍTIO — as tags escritas entram na MESMA
// fila de `defer` dos vendors estáticos, por isso a ordem de execução fica
// garantida: vue -> (mirage) -> sfc-loader -> vuex -> … -> main.js.
(function () {
    var vue = window.ENV.vueDebug ? 'vendor-dev/vue.dev.js' : 'vendor/vue.min.js';
    document.write('<script defer src="' + vue + '"><\/script>');
    if (window.ENV.mock) {
        document.write('<script defer src="vendor-dev/mirage.min.js"><\/script>');
    }
})();
