import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const files = readdirSync('tests').filter(name => name.endsWith('.test.ts')).sort();
await build({ entryPoints: files.map(name => `tests/${name}`), outdir: 'work/tests', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22' });
const result = spawnSync(process.execPath, ['--test', ...files.map(name => `work/tests/${name.replace(/\.ts$/, '.cjs')}`)], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
