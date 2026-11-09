// Verificação de sintaxe sem build: node --check em todos os .js (src/, dev/,
// env.js) e nos blocos <script> dos .vue (extraídos para ficheiros temporários).
// Faz parte do workflow "correr a cada mudança", junto da matriz de intrusão
// (package.json).
//
// Uso:  node scripts/syntax-check.mjs   (a partir da raiz do template)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, ext, out) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, ext, out);
        else if (e.name.endsWith(ext)) out.push(p);
    });
    return out;
}

const jsFiles = walk(path.join(ROOT, 'src'), '.js', [])
    .concat(walk(path.join(ROOT, 'dev'), '.js', []));
jsFiles.push(path.join(ROOT, 'env.js'));

const vueFiles = walk(path.join(ROOT, 'src'), '.vue', []);

let fail = 0;
function check(file, label, code) {
    const tmp = path.join(os.tmpdir(), 'vnb-syntax-' + path.basename(file) + '.js');
    fs.writeFileSync(tmp, code, 'utf8');
    try {
        execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
        console.log('OK   ' + label);
    } catch (e) {
        fail = 1;
        console.log('FAIL ' + label);
        console.log(String(e.stderr));
    }
}

jsFiles.forEach(function (f) {
    check(f, path.relative(ROOT, f), fs.readFileSync(f, 'utf8'));
});

vueFiles.forEach(function (f) {
    const src = fs.readFileSync(f, 'utf8');
    const m = /<script>([\s\S]*?)<\/script>/.exec(src);
    check(f, path.relative(ROOT, f) + ' (script)', m ? m[1] : '/* no script */');
});

console.log(fail ? 'SINTAXE: FALHAS' : 'SINTAXE: tudo OK (' + (jsFiles.length + vueFiles.length) + ' ficheiros)');
process.exit(fail);
