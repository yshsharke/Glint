import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = path.join(root, 'node_modules/selection-hook');
const patch = path.join(root, 'patches/selection-hook-2.1.1.patch');
const digest = value => createHash('sha256').update(value).digest('hex');
const run = (command, args, cwd = root) => spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true });
const require = createRequire(import.meta.url);

export function setupSelection() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Glint builds require Windows x64.');
  if (JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')).version !== '2.1.1') throw new Error('Review the native patch before upgrading selection-hook.');
  const applyArgs = ['apply', '--ignore-space-change', '--directory=node_modules/selection-hook'];
  const check = run('git', [...applyArgs, '--check', patch]);
  if (check.status === 0) {
    const applied = run('git', [...applyArgs, patch]);
    if (applied.status !== 0) throw new Error(applied.stderr || 'Could not apply selection patch.');
  } else if (run('git', [...applyArgs, '--reverse', '--check', patch]).status !== 0) {
    throw new Error(`selection-hook sources do not match the reviewed patch. Run npm ci.\n${check.stderr}`);
  }
  for (const name of ['clipboard-history.h', 'clipboard-history.cpp', 'clipboard-history-policy.h'])
    copyFileSync(path.join(root, 'native', name), path.join(folder, 'src/windows/lib', name));
  const sources = ['binding.gyp', 'index.js', 'index.d.ts', 'src/windows/core/types.h', 'src/windows/core/engine.cc', 'src/windows/selection_hook.cc', 'src/windows/lib/clipboard.cc', 'src/windows/lib/clipboard-history.h', 'src/windows/lib/clipboard-history.cpp', 'src/windows/lib/clipboard-history-policy.h'];
  const fingerprint = digest(Buffer.concat([readFileSync(patch), ...sources.map(file => readFileSync(path.join(folder, file)))]));
  const binary = path.join(folder, 'prebuilds/win32-x64/selection-hook.node');
  const stampPath = path.join(folder, 'glint-native.json');
  if (existsSync(stampPath) && existsSync(binary)) {
    const stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
    if (stamp.fingerprint === fingerprint && stamp.binary === digest(readFileSync(binary))) return;
  }
  console.log('Building Glint selection compatibility patch...');
  const build = run(process.execPath, [require.resolve('node-gyp/bin/node-gyp.js'), 'rebuild', '--arch=x64'], folder);
  if (build.status !== 0) throw new Error(`Native build failed. Install Python and Visual Studio C++ build tools.\n${build.stdout}\n${build.stderr}`);
  copyFileSync(path.join(folder, 'build/Release/selection-hook.node'), binary);
  writeFileSync(stampPath, JSON.stringify({ version: '2.1.1', fingerprint, binary: digest(readFileSync(binary)) }, null, 2) + '\n');
  console.log('Glint selection compatibility patch ready.');
}

setupSelection();
