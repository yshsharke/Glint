import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { listPackage } from '@electron/asar';

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
for (const name of ['/dist/main.cjs', '/dist/preload.cjs', '/dist/renderer.js', '/dist/brand/glint.ico', '/dist/licenses/selection-hook-LICENSE', '/dist/licenses/lucide-LICENSE', '/dist/licenses/LICENSES.chromium.html']) {
  assert.ok(entries.includes(name), `Missing packaged file: ${name}`);
}
for (const name of entries) {
  assert.ok(!/^\/(work|src|tests|scripts|\.git|\.github)(\/|$)/.test(name), `Private/development directory in archive: ${name}`);
  assert.ok(!/\.(sqlite(?:-\w+)?|log|map)$/.test(name), `Unwanted packaged file: ${name}`);
}
assert.ok(existsSync('release/win-unpacked/resources/app.asar.unpacked/node_modules/selection-hook/prebuilds/win32-x64/selection-hook.node'), 'Native selection binary must be unpacked');

mkdirSync('work', { recursive: true });
for (const file of ['release/win-unpacked/Glint.exe', `release/Glint-${version}-windows-x64-portable.exe`]) {
  const folder = mkdtempSync(path.resolve('work', 'packaged-check-'));
  const env = { ...process.env, GLINT_SMOKE_ROOT: folder };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(path.resolve(file), [process.argv.includes('--smoke') ? '--smoke' : '--package-check'], { env, stdio: 'inherit', windowsHide: true });
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
  assert.equal(report.check, process.argv.includes('--smoke') ? 'full' : 'startup');
  console.log(`Verified ${path.basename(file)} (${report.check}).`);
}
