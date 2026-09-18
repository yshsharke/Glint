import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const files = ['portable', 'setup'].map(kind => `Glint-${version}-windows-x64-${kind}.exe`);
const sums = await Promise.all(files.map(async name => `${createHash('sha256').update(await readFile(`release/${name}`)).digest('hex')}  ${name}`));
await writeFile('release/SHA256SUMS.txt', sums.join('\n') + '\n');
console.log('Release SHA-256 checksums generated.');
