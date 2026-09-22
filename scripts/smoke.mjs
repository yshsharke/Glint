import { build } from 'esbuild';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const scenarios = process.argv.slice(2);
if (!scenarios.length) scenarios.push('ui', 'records', 'native');
if (scenarios.some(value => !['ui', 'records', 'native'].includes(value))) throw new Error('Expected ui, records or native');
if (process.platform === 'linux' && scenarios.includes('native') && process.env.GLINT_TEST_DESKTOP !== '1') {
  throw new Error('Linux native smoke changes PRIMARY. Run in a disposable desktop or nested compositor with GLINT_TEST_DESKTOP=1.');
}
mkdirSync('work', { recursive: true });
const entry = path.resolve('work/smoke-runner.cjs');
await build({ entryPoints: ['src/main.ts'], outfile: entry, bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'selection-hook'], target: 'node22',
  define: { GLINT_TEST_BUILD: 'true', GLINT_ASSET_DIR: JSON.stringify(path.resolve('dist')) } });

const reports = [];
for (const scenario of scenarios) {
  const profile = mkdtempSync(path.resolve('work', `smoke-${scenario}-`));
  const env = { ...process.env, GLINT_SMOKE_ROOT: profile, GLINT_SMOKE_SCENARIO: scenario };
  delete env.ELECTRON_RUN_AS_NODE;
  console.log(`Running ${scenario} smoke in an isolated profile.`);
  const child = spawn(require('electron'), [entry, '--smoke', ...(process.platform === 'linux' ? ['--ozone-platform=x11', '--password-store=basic'] : [])], { env, stdio: 'inherit', windowsHide: true, detached: process.platform !== 'win32' });
  const timer = setTimeout(() => {
    if (!child.pid) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  }, 120000);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', resolve);
  }).finally(() => clearTimeout(timer));
  reports.push({ scenario, passed: code === 0, profile });
  if (code !== 0 && process.env.GITHUB_ACTIONS === 'true') {
    const errorFile = path.join(profile, 'work', 'smoke-error.txt');
    const detail = existsSync(errorFile) ? readFileSync(errorFile, 'utf8') : `Electron exited with code ${code} before writing a failure report.`;
    const message = `${scenario} smoke: ${detail}`.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.log(`::error title=Electron smoke failed::${message}`);
  }
}
writeFileSync('work/smoke-summary.json', JSON.stringify(reports, null, 2));
console.log(reports.map(report => `${report.scenario}: ${report.passed ? 'passed' : 'FAILED'}`).join('\n'));
process.exitCode = reports.every(report => report.passed) ? 0 : 1;
