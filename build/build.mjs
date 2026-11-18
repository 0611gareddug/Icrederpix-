// 빌드: 원본(src) → 번들 → 난독화 → game.min.js / style.css
// 사용법: node build/build.mjs        (배포용, 난독화)
//        node build/build.mjs --dev  (개발용, 난독화 없음)
import * as esbuild from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeIcons } from './icon.mjs';

const dev = process.argv.includes('--dev');
const root = new URL('..', import.meta.url).pathname;

const js = await esbuild.build({
  entryPoints: [root + 'src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019', 'safari13'],
  write: false,
  outdir: root + '.build-tmp',
  define: { __DEV__: dev ? 'true' : 'false' },
  legalComments: 'none',
  loader: { '.css': 'css' },
  external: ['*.woff2'],
});
let code = '', css = '';
for (const f of js.outputFiles) {
  if (f.path.endsWith('.js')) code = f.text;
  if (f.path.endsWith('.css')) css = f.text;
}

if (!dev) {
  const t0 = Date.now();
  code = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: true,
    debugProtectionInterval: 3000,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: false,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.5,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 1,
    stringArrayThreshold: 0.75,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    target: 'browser',
    seed: 20261118,
  }).getObfuscatedCode();
  console.log('난독화 완료', ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

writeFileSync(root + 'game.min.js', code);
writeFileSync(root + 'style.css', css);
mkdirSync(root + 'fonts', { recursive: true });
makeIcons(root);
console.log(`빌드 완료 (${dev ? '개발' : '배포'}) game.min.js ${(code.length / 1024).toFixed(0)}KB, style.css ${(css.length / 1024).toFixed(0)}KB`);
