import { copyFile, mkdir } from 'node:fs/promises';

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
    ['node_modules/electron/dist/LICENSE', 'electron-LICENSE'],
    ['node_modules/electron/dist/LICENSES.chromium.html', 'LICENSES.chromium.html']
  ];
  await Promise.all(files.map(([source, name]) => copyFile(source, `dist/licenses/${name}`)));
  // Lucide's full license is copied by buildIcons alongside its generated assets.
}
