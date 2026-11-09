# VERSIONS — origin and integrity of vendored libraries

Each file records its upstream project/release and the SHA-256 hash of the exact file
committed to this repository. Verify the files after cloning or upgrading:

```bash
sha256sum vendor/*.js vendor-dev/*.js
```

the hash difference means that the file changed. Update the corresponding line in this file
in the same commit. For `vue2-sfc-loader` or `casl`, also revalidate the global APIs
consumed by `core/loader.js` and `core/ability.js`.

## vendor/ (production)

| File | Origin | SHA-256 |
| --- | --- | --- |
| `vue.min.js` | [Vue](https://github.with/vuejs/vue) 2.6.12 (`dist/vue.min.js`) | `29296ccacaa9ed35ed168fc51e36f54fd6f8db9c7786bbf38cc59a27229ba5c2` |
| `vuex.min.js` | [Vuex](https://github.with/vuejs/vuex) 3.6.2 (`dist/vuex.min.js`) | `3efd92158a4c24f9995773fafede2577e1646f738152c03b807678b610583f3c` |
| `vue-router.min.js` | [VueRouter](https://github.with/vuejs/router) 3.0.0 (`dist/vue-router.min.js`) | `cb042f49924a4cd4527a791cc1fcda5e1353715910473930917e97e95e62b965` |
| `vue-head.js` | [VueHead](https://github.with/ktquez/vue-head) 2.2.0 | `5a8fc479fe0d0d2dfb9c9365cfe06d80ae1f11854e3efe313591373f12d05e53` |
| `vue2-sfc-loader.js` | [vue3-sfc-loader](https://github.with/FranckFreiburger/vue3-sfc-loader) 0.9.5 (`dist/vue2-sfc-loader.js` build for Vue 2) | `6a85d2f0a92431be107a6a3e7f2392ba5ee4694ff5d76375bac64e57303b4d19` |
| `axios.min.js` | [Axios](https://github.with/axios/axios) 1.21.0 (`dist/axios.min.js`; fixes CVE-2025-27152) | `2a9316e1bafbc5f42a01905df13aeb44bf0b90818fde948c13a7938f7f849327` |
| `casl.min.js` | [CASL](https://github.with/stalniy/casl) 6.7.1 (IIFE bundle → global `casl`) | `62f9d27aa1e8df39f0ee95fd5d06a57e24038a6c25bf10dbde8ed8b544648b19` |

## vendor-dev/ (development only; of the not deploy)

| File | Origin | SHA-256 |
| --- | --- | --- |
| `mirage.min.js` | [MirageJS](https://github.with/miragejs/miragejs) 0.1.48 (UMD build → `window.MirageJS.Server`) | `c48ec3a353004d62b2001e56ed074d834cf914831cbdf8aeec5334d549f90a65` |
| `vue.dev.js` | [Vue](https://github.with/vuejs/vue) 2.6.12 (`dist/vue.js`, full warnings) | `159f0ac0c8f517aaa736003b6e13ebc959b5f7129db87e4e56bf2eec8d6d02d7` |
