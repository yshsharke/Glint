import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, mkdtempSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { extractFile, listPackage } from '@electron/asar';
import { writeDictionaryFixture } from './package-fixture.mjs';

if (process.platform !== 'linux') throw new Error('Run Linux package verification in a Linux desktop session.');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
for (const name of ['ecdict.sqlite', 'LICENSE', 'manifest.json']) {
  assert.deepEqual(readFileSync(`release/linux-unpacked/resources/dictionary/${name}`), readFileSync(`dist/dictionary/${name}`), `Packaged dictionary mismatch: ${name}`);
}
const appImage = process.argv.includes('--appimage');
const setuidSandbox = process.argv.includes('--setuid-sandbox');
assert.ok(!appImage || !setuidSandbox, '--setuid-sandbox requires the installed helper in linux-unpacked; verify AppImages separately');
// Exercise Ubuntu's fallback even on hosts where unprivileged user namespaces work.
const sandboxArgs = setuidSandbox ? ['--disable-namespace-sandbox'] : [];
if (appImage) assert.ok(existsSync(`release/Glint-${version}-linux-x64.AppImage`), 'Build the AppImage before verifying it');
const archive = 'release/linux-unpacked/resources/app.asar';
const entries = listPackage(archive);
assert.deepEqual(extractFile(archive, 'dist/dictionary-worker.cjs'), readFileSync('dist/dictionary-worker.cjs'), 'Packaged MDX worker matches the build');
assert.ok(!entries.some(name => name.startsWith('/node_modules/js-mdict/') || name.startsWith('/node_modules/lzo')), 'Only reviewed bundled parser code may ship');
for (const file of ['dist/main.cjs', 'dist/selection-host.cjs', 'dist/preload.cjs', 'dist/renderer.js',
  'dist/licenses/selection-hook-LICENSE', 'dist/licenses/lucide-LICENSE', 'dist/licenses/LICENSES.chromium.html',
  'dist/licenses/electron-builder-LICENSE',
  'dist/licenses/frontend/dependencies.json']) assert.ok(entries.includes('/' + file), `Missing ${file}`);
for (const file of entries) {
  assert.ok(!/^\/(work|src|tests|scripts|\.git|\.github)(\/|$)/.test(file), `Development files shipped: ${file}`);
  assert.ok(!/\.(sqlite(?:-\w+)?|log|map)$/.test(file), `Private or development file shipped: ${file}`);
  assert.ok(!/\/prebuilds\/(?!linux-x64(?:\/|$))/.test(file), `Foreign native binary shipped: ${file}`);
}
const main = extractFile(archive, 'dist/main.cjs').toString();
assert.ok(!['Glint native selection fixture', 'smoke_summary', 'runSettingsSmoke'].some(value => main.includes(value)), 'Full smoke scenarios must not ship');
for (const file of ['dist/main.cjs', 'dist/selection-host.cjs', 'dist/preload.cjs', 'dist/renderer.js']) {
  assert.deepEqual(extractFile(archive, file), readFileSync(file), `Package does not match the current build: ${file}`);
}
const binary = 'node_modules/selection-hook/prebuilds/linux-x64/selection-hook.node';
assert.deepEqual(readFileSync(`release/linux-unpacked/resources/app.asar.unpacked/${binary}`), readFileSync(binary), 'Ship the upstream Linux native binary unpacked');

mkdirSync('work', { recursive: true });
for (const probe of [
  { name: 'unsandboxed startup', args: ['--ozone-platform=x11', '--no-sandbox'], message: /Glint requires the Chromium sandbox/ },
  { name: 'missing AppImage relaunch target', args: [], message: /Glint could not relaunch with X11/ }
]) {
  const profile = mkdtempSync(path.resolve('work', 'linux-package-check-'));
  const env = { ...process.env, GLINT_SMOKE_ROOT: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!probe.args.length) {
    env.APPDIR = path.resolve('release/linux-unpacked');
    env.APPIMAGE = path.join(profile, 'missing.AppImage');
  }
  const child = spawn(path.resolve('release/linux-unpacked/glint'), [...sandboxArgs, ...probe.args, '--package-check'], { env, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  const timer = setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }, 15000);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timer));
  assert.equal(code, 1, `${probe.name} must fail: ${stderr}`);
  assert.match(stderr, probe.message);
  assert.ok(!existsSync(path.join(profile, 'work/smoke-success.json')), `${probe.name} cannot pass verification`);
  console.log(`Verified refusal of ${probe.name}.`);
}
const executables = ['release/linux-unpacked/glint', ...(appImage ? [`release/Glint-${version}-linux-x64.AppImage`] : [])];
for (const file of executables) for (const ozoneArgs of [['--ozone-platform=x11'], []]) {
  const profile = mkdtempSync(path.resolve('work', 'linux-package-check-'));
  await writeDictionaryFixture(profile);
  const env = { ...process.env, GLINT_SMOKE_ROOT: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.APPIMAGE_EXTRACT_AND_RUN;
  if (!file.endsWith('.AppImage') && !ozoneArgs.length) {
    env.APPIMAGE = path.join(profile, 'unrelated-parent.AppImage');
    env.APPDIR = profile;
  }
  const extractionArgs = file.endsWith('.AppImage') && !ozoneArgs.length ? ['--appimage-extract-and-run'] : [];
  if (file.endsWith('.AppImage') && ozoneArgs.length) env.APPIMAGE_EXTRACT_AND_RUN = '1';
  const logPath = path.join(profile, 'launch.log');
  const log = openSync(logPath, 'w');
  const child = spawn(path.resolve(file), [...extractionArgs, ...sandboxArgs, ...ozoneArgs, '--package-check', '--password-store=basic'], { env, stdio: ['ignore', log, log], detached: true });
  closeSync(log);
  let spawnError;
  let exited = false;
  child.once('error', error => { spawnError = error; });
  child.once('exit', () => { exited = true; });
  const success = path.join(profile, 'work/smoke-success.json');
  const error = path.join(profile, 'work/smoke-error.txt');
  const deadline = Date.now() + 120000;
  try {
    // A direct launch first exits to relaunch under XWayland. Wait for the
    // isolated startup report, not just the original process's zero exit code.
    while (!existsSync(success) || !exited) {
      if (spawnError) throw spawnError;
      if (existsSync(error)) throw new Error(readFileSync(error, 'utf8'));
      if (exited && child.exitCode !== 0) throw new Error(`Package exited with ${child.exitCode}: ${file}`);
      if (Date.now() > deadline) throw new Error(`Packaged startup timed out: ${file} (${ozoneArgs.length ? 'explicit X11' : 'direct relaunch'}); profile: ${profile}; exit: ${child.exitCode}; signal: ${child.signalCode}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const report = JSON.parse(readFileSync(success, 'utf8'));
    assert.equal(report.packaged, true);
    assert.equal(report.check, 'startup');
    assert.equal(report.version, version);
    console.log(`Verified ${path.basename(file)} (${ozoneArgs.length ? 'explicit X11' : 'direct relaunch'}).`);
  } catch (error) {
    console.error(readFileSync(logPath, 'utf8'));
    throw error;
  } finally {
    if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  }
}
console.log('Linux package verified: current build, native binary, notices, sandboxed IPC and SQLite startup.');
