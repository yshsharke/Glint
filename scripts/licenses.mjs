import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// The renderer is bundled; include licenses for the actual shipped modules, not just direct dependencies.
export async function buildFrontendLicenses(inputs) {
  const roots = new Set(inputs.filter(name => name.startsWith('node_modules/')).map(name => {
    const parts = name.split('/');
    return parts.slice(0, parts[1].startsWith('@') ? 3 : 2).join('/');
  }));
  const notices = [];
  for (const root of [...roots].sort()) {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const files = (await readdir(root)).filter(name => /^(licen[cs]e|copying|notice|copyright)/i.test(name)).map(name => path.join(root, name));
    // react-icons 2.0.341 accidentally omits its upstream license from the npm tarball.
    if (!files.length && pkg.name === '@fluentui/react-icons' && pkg.version === '2.0.341') files.push('third_party/fluentui-system-icons-LICENSE');
    if (!files.length) throw new Error(`Missing bundled dependency license: ${pkg.name}`);
    const folder = path.join('dist/licenses/frontend', pkg.name.replaceAll('/', '__'));
    await mkdir(folder, { recursive: true });
    await Promise.all(files.map(file => copyFile(file, path.join(folder, path.basename(file)))));
    notices.push({ name: pkg.name, version: pkg.version, license: pkg.license });
  }
  await writeFile('dist/licenses/frontend/dependencies.json', JSON.stringify(notices, null, 2) + '\n');
}

// Preserve complete notices, including Electron's bundled Chromium components.
// Fail the build if a required notice disappears after a dependency update.
export async function buildLicenses() {
  await mkdir('dist/licenses', { recursive: true });
  const files = [
    ['LICENSE', 'Glint-LICENSE'],
    ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
    ['node_modules/selection-hook/LICENSE', 'selection-hook-LICENSE'],
    ['node_modules/node-addon-api/LICENSE.md', 'node-addon-api-LICENSE'],
    ['node_modules/node-gyp-build/LICENSE', 'node-gyp-build-LICENSE'],
    ['node_modules/electron-builder/LICENSE', 'electron-builder-LICENSE'],
    ['node_modules/electron/dist/LICENSE', 'electron-LICENSE'],
    ['node_modules/electron/dist/LICENSES.chromium.html', 'LICENSES.chromium.html']
  ];
  await Promise.all(files.map(([source, name]) => copyFile(source, `dist/licenses/${name}`)));
  // Lucide's full license is copied by buildIcons alongside its generated assets.
}
