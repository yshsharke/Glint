import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { buildIcons, iconNames } from './icons.mjs';
import { buildBrand } from './brand.mjs';
import { buildLicenses } from './licenses.mjs';
await mkdir('dist', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'selection-hook'], target: 'node22', sourcemap: true }),
  build({ entryPoints: ['src/selection-host.ts'], outfile: 'dist/selection-host.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'selection-hook'], target: 'node22', sourcemap: true }),
  build({ entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node22' }),
  build({ entryPoints: ['src/renderer.ts'], outfile: 'dist/renderer.js', bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', sourcemap: true, define: { GLINT_ICON_NAMES: JSON.stringify(iconNames) } }),
  buildIcons(),
  buildBrand(),
  buildLicenses(),
  copyFile('src/index.html', 'dist/index.html'),
  copyFile('src/styles.css', 'dist/styles.css')
]);
console.log('Glint built.');
