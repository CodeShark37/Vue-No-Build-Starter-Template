// Cache de código compilado (.vue -> JS) para o vue2-sfc-loader.
//
// Porquê: compilar um .vue no cliente (parse + template + babel) é o custo dominante em
// dispositivos fracos. A chave que o loader nos entrega é um hash do conteúdo do ficheiro,
// logo editar um .vue invalida sozinho. Na 2ª visita só se faz fetch + avaliação.
//
// Contrato do loader: get(key) -> string | undefined (pode ser Promise); set(key, string).
// Camadas: Map em memória -> IndexedDB (assíncrono, não bloqueia a main thread).
// Qualquer falha de IndexedDB (modo privado, quota, não suportado) degrada para só-memória.

const DB_NAME = 'vue-no-build';
const STORE = 'compiled';
const VERSION_KEY = '__v';

/**
 * Cache de código compilado (2 camadas: Map em memória -> IndexedDB). Contrato
 * do loader: get(key) -> string|undefined (pode ser Promise); set(key, string).
 * Qualquer falha de IndexedDB (modo privado, quota, não suportado) degrada para
 * só-memória; exceder maxEntries limpa a camada em disco.
 * @param {{version: string, maxEntries?: number}} opts version: bump invalida
 *        TODA a cache (a BD guarda a versão e limpa-se sozinha ao divergir).
 * @returns {{get: Function, set: Function}} cache compatível com o loader
 */
export function createCompiledCache(opts) {
    const version = String(opts.version);
    const maxEntries = opts.maxEntries || 1000;
    const mem = new Map();
    let count = 0;
    let dbPromise = null;

    // Abre a BD uma só vez. Se a versão guardada difere, limpa tudo. Resolve null se indisponível.
    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve) {
            if (typeof indexedDB === 'undefined') return resolve(null);
            let req;
            try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(null); }
            req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
            req.onerror = req.onblocked = function () { resolve(null); };
            req.onsuccess = function () {
                const db = req.result;
                const tx = db.transaction(STORE, 'readwrite');
                const st = tx.objectStore(STORE);
                const cur = st.get(VERSION_KEY);
                tx.onabort = tx.onerror = function () { resolve(null); };
                cur.onsuccess = function () {
                    if (cur.result !== version) {
                        st.clear();
                        st.put(version, VERSION_KEY);
                        count = 0;
                        resolve(db);
                    } else {
                        const n = st.count();
                        n.onsuccess = function () { count = Math.max(0, n.result - 1); resolve(db); };
                    }
                };
            };
        });
        return dbPromise;
    }

    return {
        get(key) {
            if (mem.has(key)) return mem.get(key);
            return open().then(function (db) {
                if (!db) return undefined;
                return new Promise(function (resolve) {
                    let r;
                    try { r = db.transaction(STORE).objectStore(STORE).get(key); } catch (e) { return resolve(undefined); }
                    r.onsuccess = function () {
                        if (r.result !== undefined) mem.set(key, r.result);
                        resolve(r.result);
                    };
                    r.onerror = function () { resolve(undefined); };
                });
            });
        },

        // Não devolve promise de propósito: o loader não deve esperar pela escrita em disco.
        set(key, value) {
            mem.set(key, value);
            open().then(function (db) {
                if (!db) return;
                try {
                    const st = db.transaction(STORE, 'readwrite').objectStore(STORE);
                    if (count >= maxEntries) { st.clear(); st.put(version, VERSION_KEY); count = 0; }
                    st.put(value, key);
                    count++;
                } catch (e) { /* quota / BD fechada: ficamos só com a cache em memória */ }
            });
        },
    };
}
