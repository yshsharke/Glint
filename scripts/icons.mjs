import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageRoot = path.dirname(require.resolve('lucide-static/package.json'));
const tags = JSON.parse(await readFile(path.join(packageRoot, 'tags.json'), 'utf8'));
export const iconNames = Object.keys(tags).sort();

export async function buildIcons() {
  await mkdir('dist/icons', { recursive: true });
  await mkdir('dist/licenses', { recursive: true });
  // Only SVGs ship, not the package's fonts, bundles, or alternative formats.
  // Masks inherit the UI color and each image loads only when displayed.
  await Promise.all(iconNames.map(name => copyFile(path.join(packageRoot, 'icons', name + '.svg'), 'dist/icons/' + name + '.svg')));
  await writeFile('dist/icons.css', iconNames.map(name => '.lucide-' + name + '{mask-image:url("./icons/' + name + '.svg")}').join('\n'));
  await writeFile('dist/icon-catalog.js', 'window.glintIconTags=' + JSON.stringify(tags) + ';');
  await copyFile(path.join(packageRoot, 'LICENSE'), 'dist/licenses/lucide-LICENSE');
}
