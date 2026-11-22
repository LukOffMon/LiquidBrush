// Liquid · v98: versiones minificadas para publicar (las que cargan index.html, lab.html y sw.js).
//   node tools/minify.mjs           genera app.min.js y styles.min.css (lo corre tools/bump_version.py)
//   node tools/minify.mjs --check   solo comprueba que están al día (lo usa tools/check_site.py)
// Se sigue editando app.js y styles.css. Cada .min lleva en su primera línea la huella del original:
// si no coincide, check_site.py falla y CI avisa de que falta regenerarlo.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { transform } from 'esbuild';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  { src: 'app.js', out: 'app.min.js', loader: 'js' },
  { src: 'styles.css', out: 'styles.min.css', loader: 'css' }
];
// Git en Windows puede dejar CRLF en la copia de trabajo y LF en Linux (CI): la huella se calcula sin \r
const huella = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const marca = (h) => `/* liquid-src:${h} · generado por tools/minify.mjs desde el original: no editar */`;

const soloComprobar = process.argv.includes('--check');
let mal = 0;
for (const f of FILES) {
  const src = readFileSync(new URL(f.src, ROOT), 'utf8');
  const h = huella(src);
  const destino = new URL(f.out, ROOT);
  if (soloComprobar) {
    const actual = existsSync(destino) ? readFileSync(destino, 'utf8').split('\n', 1)[0].replace(/\r$/, '') : '';
    if (actual !== marca(h)) {
      console.error(`${f.out}: no corresponde a ${f.src} (node tools/minify.mjs o python3 tools/bump_version.py)`);
      mal++;
    }
    continue;
  }
  // Sin renombrar nada visible desde fuera (es un script clásico) y para navegadores de 2020 en adelante
  const r = await transform(src.replace(/\r\n/g, '\n'), { loader: f.loader, minify: true, target: f.loader === 'js' ? 'es2020' : ['chrome90', 'safari14', 'firefox90'], legalComments: 'none', charset: 'utf8' });
  writeFileSync(destino, `${marca(h)}\n${r.code}`);
  console.log(`· ${f.out}: ${Math.round(src.length / 1024)} KB → ${Math.round(r.code.length / 1024)} KB`);
}
process.exit(mal ? 1 : 0);
