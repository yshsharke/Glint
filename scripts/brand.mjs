import { mkdir, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

// Selected concept C: rounded selection brackets surrounding a soft glint.
// Both variants share these paths; only weight, fill and backdrop differ.
const brackets = 'M8 3.8H7A3.2 3.2 0 0 0 3.8 7V17A3.2 3.2 0 0 0 7 20.2H8M16 3.8H17A3.2 3.2 0 0 1 20.2 7V17A3.2 3.2 0 0 1 17 20.2H16';
const glint = 'M18.45 2.7Q19 1.7 19.55 2.7C20.1 3.9 20.5 4.3 21.7 4.85Q22.7 5.4 21.7 5.95C20.5 6.5 20.1 6.9 19.55 8.1Q19 9.1 18.45 8.1C17.9 6.9 17.5 6.5 16.3 5.95Q15.3 5.4 16.3 4.85C17.5 4.3 17.9 3.9 18.45 2.7Z';
const glyph = (filled) => `<path d="${brackets}" fill="none" stroke="${filled ? '#fff' : '#000'}" stroke-width="${filled ? 3 : 1.8}" stroke-linecap="round" stroke-linejoin="round"/><path d="${glint}" transform="translate(-7 6.6)" fill="${filled ? '#c5f3ff' : 'none'}" stroke="${filled ? '#c5f3ff' : '#000'}" stroke-width="${filled ? .4 : 1.4}" stroke-linejoin="round"/>`;
const line = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${glyph(false)}</svg>`;
const filled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2196ee"/><stop offset="1" stop-color="#0865cf"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="9" fill="url(#blue)"/><g transform="translate(4 4)">${glyph(true)}</g></svg>`;

export async function buildBrand() {
  await mkdir('dist/brand', { recursive: true });
  await Promise.all([
    writeFile('dist/brand/glint-line.svg', line),
    writeFile('dist/brand/glint-filled.svg', filled)
  ]);
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const pngs = sizes.map(size => new Resvg(filled, { fitTo: { mode: 'width', value: size } }).render().asPng());
  await Promise.all(sizes.map((size, i) => writeFile(`dist/brand/glint-${size}.png`, pngs[i])));
  // A multi-resolution Windows icon, using PNG entries to retain alpha at every DPI.
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(pngs[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += pngs[i].length;
  });
  await writeFile('dist/brand/glint.ico', Buffer.concat([header, ...pngs]));
}
