import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { saveScreenshot } from './electron/screenshot';

const png = Buffer.from('test image');
const image = { isEmpty: () => false, toPNG: () => png };
function destination(t: { after(fn: () => void): void }) {
  mkdirSync('work', { recursive: true });
  const folder = mkdtempSync(path.resolve('work/screenshot-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  return path.join(folder, 'capture.png');
}

test('screenshots save a successful capture without retrying', async t => {
  const filename = destination(t);
  let attempts = 0;
  await saveScreenshot({ capturePage: async () => { attempts++; return image; } }, filename);
  assert.equal(attempts, 1);
  assert.deepEqual(readFileSync(filename), png);
});

test('screenshots retry transient compositor errors and empty images', async t => {
  const filename = destination(t);
  let attempts = 0;
  await saveScreenshot({ capturePage: async () => {
    attempts++;
    if (attempts === 1) throw new Error('UnknownVizError');
    if (attempts === 2) throw new Error('VizSentEmptyBitmap');
    if (attempts === 3) return { ...image, isEmpty: () => true };
    return image;
  } }, filename);
  assert.equal(attempts, 4);
  assert.deepEqual(readFileSync(filename), png);
});

test('persistent capture failures fail with the filename and original cause', async t => {
  const filename = destination(t);
  const failure = new Error('UnknownVizError');
  let attempts = 0;
  await assert.rejects(saveScreenshot({ capturePage: async () => { attempts++; throw failure; } }, filename),
    { message: `Screenshot failed: ${filename}: UnknownVizError`, cause: failure });
  assert.equal(attempts, 5);
  assert.equal(existsSync(filename), false);
});

test('unexpected capture failures are not retried or suppressed', async t => {
  const filename = destination(t);
  const failure = new Error('Object has been destroyed');
  let attempts = 0;
  await assert.rejects(saveScreenshot({ capturePage: async () => { attempts++; throw failure; } }, filename), { cause: failure });
  assert.equal(attempts, 1);
  assert.equal(existsSync(filename), false);
});

test('persistently empty screenshots fail without writing an empty artifact', async t => {
  const filename = destination(t);
  let attempts = 0;
  await assert.rejects(saveScreenshot({ capturePage: async () => {
    attempts++;
    return { ...image, isEmpty: () => true };
  } }, filename), error => {
    assert.ok(error instanceof Error && error.cause instanceof Error);
    assert.equal(error.cause.message, 'VizSentEmptyBitmap');
    return true;
  });
  assert.equal(attempts, 5);
  assert.equal(existsSync(filename), false);
});

test('screenshot write failures are not retried or suppressed', async t => {
  const filename = path.join(destination(t), 'missing', 'capture.png');
  let attempts = 0;
  await assert.rejects(saveScreenshot({ capturePage: async () => { attempts++; return image; } }, filename), { code: 'ENOENT' });
  assert.equal(attempts, 1);
});
