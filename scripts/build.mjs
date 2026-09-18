import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { buildIcons, iconNames } from './icons.mjs';
import { buildBrand } from './brand.mjs';
import { buildLicenses, buildFrontendLicenses } from './licenses.mjs';
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await mkdir('dist', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'selection-hook'], target: 'node22', sourcemap: true }),
  build({ entryPoints: ['src/selection-host.ts'], outfile: 'dist/selection-host.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'selection-hook'], target: 'node22', sourcemap: true }),
  build({ entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node22' }),
  build({ entryPoints: ['src/renderer.tsx'], outfile: 'dist/renderer.js', bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', minify: true, metafile: true, sourcemap: true, define: { 'process.env.NODE_ENV': '"production"', GLINT_ICON_NAMES: JSON.stringify(iconNames), GLINT_APP_VERSION: JSON.stringify(version) } })
    .then(result => buildFrontendLicenses(Object.entries(result.metafile.outputs['dist/renderer.js'].inputs).filter(([, input]) => input.bytesInOutput > 0).map(([name]) => name))),
  buildIcons(),
  buildBrand(),
  buildLicenses(),
  copyFile('src/index.html', 'dist/index.html'),
  copyFile('src/styles.css', 'dist/styles.css')
]);
console.log('Glint built.');
