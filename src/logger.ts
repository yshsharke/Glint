import fs from 'node:fs';
import path from 'node:path';

// Typed metadata only: never accept request bodies, credentials, URLs or raw errors.
interface LogFields {
  requestId?: string;
  kind?: string;
  hook?: string;
  status?: number;
  elapsedMs?: number;
  outputLength?: number;
  code?: string;
  imported?: number;
  saved?: boolean;
}
export function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UNKNOWN';
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  const code = value.cause?.code ?? value.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'UNKNOWN';
}

export class AppLogger {
  readonly filename: string;
  constructor(folder: string, private readonly maxBytes = 1024 * 1024) {
    fs.mkdirSync(folder, { recursive: true });
    this.filename = path.join(folder, 'glint.log');
  }
  write(event: string, fields: LogFields = {}): boolean {
    try {
      const line = JSON.stringify({ time: new Date().toISOString(), event, ...fields }) + '\n';
      if (fs.existsSync(this.filename) && fs.statSync(this.filename).size + Buffer.byteLength(line) > this.maxBytes) {
        for (let i = 3; i >= 1; i--) {
          const destination = `${this.filename}.${i}`;
          const source = i === 1 ? this.filename : `${this.filename}.${i - 1}`;
          if (fs.existsSync(destination)) fs.unlinkSync(destination);
          if (fs.existsSync(source)) fs.renameSync(source, destination);
        }
      }
      fs.appendFileSync(this.filename, line, 'utf8');
      return true;
    } catch { return false; }
  }
}
