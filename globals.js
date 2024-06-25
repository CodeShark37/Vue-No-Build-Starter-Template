/**
* Use this file to register any variables or functions that should be available
* ideally you should make it available via the window object
* as well as the Vue prototype for access throughout the app
* (register globals with care, only when it makes since to be accessible app
*/

// Define as opções para o vue2-sfc-loader
function load(path) {
    const options = {
        moduleCache: {
            vue: Vue
        },
        async getFile(url) {
            const res = await fetch(url);
            if (!res.ok) {
                throw Object.assign(new Error(res.statusText + ' ' + url), { res });
            }
            return {
                getContentData: (asBinary) => asBinary ? res.arrayBuffer() : res.text(),
            }
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
}

