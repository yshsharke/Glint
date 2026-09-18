import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['tests/core.test.ts'], outfile: 'work/core.test.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22' });
const result = spawnSync(process.execPath, ['--test', 'work/core.test.cjs'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
