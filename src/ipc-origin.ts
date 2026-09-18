import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Chromium leaves '~' unescaped while Node's pathToFileURL encodes it as %7E.
// Compare decoded, normalized file paths rather than URL string prefixes.
export function isAppPage(candidate: string, page: string): boolean {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'file:') return false;
    const actual = path.resolve(fileURLToPath(url));
    const expected = path.resolve(page);
    return process.platform === 'win32'
      ? actual.toLowerCase() === expected.toLowerCase()
      : actual === expected;
  } catch { return false; }
}
