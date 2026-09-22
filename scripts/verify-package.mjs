import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { extractFile, listPackage } from '@electron/asar';

process.on('uncaughtException', error => {
  console.error(error);
  if (process.env.GITHUB_ACTIONS) {
    const detail = (error.stack || error.message).slice(0, 8000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.error(`::error title=Packaged application verification::${detail}`);
  }
  process.exit(1);
});

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const archive = 'release/win-unpacked/resources/app.asar';
const entries = listPackage(archive).map(name => name.replaceAll('\\', '/'));
const main = extractFile(archive, 'dist/main.cjs').toString('utf8');
assert.ok(!main.includes('Glint native selection fixture') && !main.includes('smoke_summary') && !main.includes('runSettingsSmoke'), 'Full test scenarios must not ship in the application');
for (const name of ['/dist/main.cjs', '/dist/preload.cjs', '/dist/renderer.js', '/dist/brand/glint.ico', '/dist/licenses/selection-hook-LICENSE', '/dist/licenses/lucide-LICENSE', '/dist/licenses/LICENSES.chromium.html']) {
  assert.ok(entries.includes(name), `Missing packaged file: ${name}`);
}
for (const name of entries) {
  assert.ok(!/^\/(work|src|tests|scripts|\.git|\.github)(\/|$)/.test(name), `Private/development directory in archive: ${name}`);
  assert.ok(!/\.(sqlite(?:-\w+)?|log|map)$/.test(name), `Unwanted packaged file: ${name}`);
  assert.ok(!/\/prebuilds\/(?!win32-x64(?:\/|$))/.test(name), `Foreign native binary shipped: ${name}`);
}
for (const name of ['/dist/licenses/frontend/dependencies.json', '/dist/licenses/frontend/react/LICENSE', '/dist/licenses/frontend/react-dom/LICENSE', '/dist/licenses/frontend/@fluentui__react-motion/LICENSE']) {
  assert.ok(entries.includes(name), `Missing frontend notice: ${name}`);
}
assert.ok(!entries.some(name => name.startsWith('/node_modules/@fluentui/') || name.startsWith('/node_modules/react/')), 'Bundled frontend libraries must not be duplicated as runtime packages');
assert.ok(!entries.some(name => name.startsWith('/node_modules/selection-hook/build/')), 'Native compiler intermediates must not ship');
assert.ok(existsSync('release/win-unpacked/resources/app.asar.unpacked/node_modules/selection-hook/prebuilds/win32-x64/selection-hook.node'), 'Native selection binary must be unpacked');
const nativeBinary = 'node_modules/selection-hook/prebuilds/win32-x64/selection-hook.node';
const nativeStamp = JSON.parse(readFileSync('node_modules/selection-hook/glint-native.json', 'utf8'));
assert.equal(createHash('sha256').update(readFileSync(`release/win-unpacked/resources/app.asar.unpacked/${nativeBinary}`)).digest('hex'), nativeStamp.binary, 'Package must ship the verified patched native binary');

mkdirSync('work', { recursive: true });
const executables = ['release/win-unpacked/Glint.exe', `release/Glint-${version}-windows-x64-portable.exe`];
// Exercise the same 8.3 path representation used by NSIS on Windows runners.
const shortPath = spawnSync('powershell', ['-NoProfile', '-Command', '(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:GLINT_PACKAGE_DIR).ShortPath'], {
  env: { ...process.env, GLINT_PACKAGE_DIR: path.resolve('release/win-unpacked') }, encoding: 'utf8', windowsHide: true
});
assert.equal(shortPath.status, 0, 'Could not resolve Windows short path');
if (shortPath.stdout.includes('~')) executables.push(path.join(shortPath.stdout.trim(), 'Glint.exe'));
for (const file of executables) {
  const folder = mkdtempSync(path.resolve('work', 'packaged-check-'));
  const env = { ...process.env, GLINT_SMOKE_ROOT: folder };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(path.resolve(file), ['--package-check'], { env, stdio: 'inherit', windowsHide: true });
  const timer = setTimeout(() => {
    // Only terminate the process tree created by this verification run.
    if (child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  }, 120000);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timer));
  const errorFile = path.join(folder, 'work', 'smoke-error.txt');
  assert.equal(code, 0, existsSync(errorFile) ? readFileSync(errorFile, 'utf8') : `Packaged process failed: ${file}`);
  const report = JSON.parse(readFileSync(path.join(folder, 'work', 'smoke-success.json'), 'utf8'));
  assert.equal(report.packaged, true);
  assert.equal(report.version, version);
  assert.equal(report.check, 'startup');
  console.log(`Verified ${path.basename(file)} (${report.check}).`);
}
