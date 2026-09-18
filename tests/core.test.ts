import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, unlinkSync, rmdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isAppPage } from '../src/ipc-origin';
import { RecordStore } from '../src/records';
import { AppLogger, errorCode } from '../src/logger';
import { runtimePaths } from '../src/runtime-paths';
import { defaults, endpoint, modelErrorMessage, placeToolbar, readSSE, recordKind, validateSettings } from '../src/core';

test('IPC page guard accepts Chromium short-path encoding but rejects other origins and lookalike files', () => {
  const page = path.resolve('work', 'RUNNER~1', 'space 中文', 'index.html');
  const url = pathToFileURL(page).href;
  assert.equal(isAppPage(url + '?view=settings', page), true);
  assert.equal(isAppPage(url.replace(/%7E/gi, '~') + '?view=settings', page), true);
  assert.equal(isAppPage(url + '.attacker.html', page), false);
  assert.equal(isAppPage(url.replace('index.html', 'other.html'), page), false);
  assert.equal(isAppPage(url.replace('index.html', 'nested%2Findex.html'), page), false);
  assert.equal(isAppPage('https://example.org/index.html', page), false);
  assert.equal(isAppPage('file://other-host/share/index.html', page), false);
  assert.equal(isAppPage('not a URL', page), false);
});

test('normal data and logs use LocalAppData while smoke stays in work', () => {
  const root = path.resolve('repo');
  const local = path.resolve('local-appdata');
  assert.deepEqual(runtimePaths(root, local, false), { data: path.join(local, 'Glint', 'data'), logs: path.join(local, 'Glint', 'logs') });
  assert.deepEqual(runtimePaths(root, local, true), { data: path.join(root, 'work', 'smoke-profile', 'data'), logs: path.join(root, 'work', 'smoke-profile', 'logs') });
});

test('legacy migration preserves originals and timestamps, merges safely, and only runs once', () => {
  const folder = mkdtempSync(path.resolve('work', 'migration-test-'));
  const source = path.join(folder, 'legacy.sqlite');
  const destination = path.join(folder, 'current.sqlite');
  try {
    const legacy = new DatabaseSync(source);
    legacy.exec('CREATE TABLE records (id TEXT PRIMARY KEY NOT NULL, original_text TEXT NOT NULL, created_at TEXT NOT NULL) STRICT');
    legacy.prepare('INSERT INTO records VALUES (?, ?, ?)').run('old', ' 原文\n🙂 ', '2026-09-18T00:00:00.000Z');
    legacy.close();
    const store = new RecordStore(destination);
    try {
      store.save('new', 'Existing destination record', '译文\n结果🙂', 'editor.exe');
      assert.equal(store.migrateFrom(source), 1);
      assert.equal(store.migrateFrom(source), undefined);
    } finally { store.close(); }
    const from = new DatabaseSync(source, { readOnly: true });
    const to = new DatabaseSync(destination, { readOnly: true });
    try {
      assert.deepEqual(to.prepare('SELECT id, original_text, created_at FROM records WHERE id = ?').get('old'), from.prepare('SELECT * FROM records WHERE id = ?').get('old'));
      assert.equal(to.prepare('SELECT result_text FROM records WHERE id = ?').get('old')!.result_text, '');
      assert.equal(to.prepare('SELECT count(*) AS count FROM records').get()!.count, 2);
    } finally { from.close(); to.close(); }
    const reopened = new RecordStore(destination);
    try { assert.equal(reopened.migrateFrom(source), undefined); } finally { reopened.close(); }
  } finally { for (const name of readdirSync(folder)) unlinkSync(path.join(folder, name)); rmdirSync(folder); }
});

test('conflicting legacy IDs roll back without replacing destination records', () => {
  const folder = mkdtempSync(path.resolve('work', 'migration-conflict-'));
  const source = path.join(folder, 'legacy.sqlite');
  const destination = path.join(folder, 'current.sqlite');
  try {
    const legacy = new RecordStore(source);
    try { legacy.save('first', 'Should roll back', '译文\n结果🙂', 'editor.exe'); legacy.save('same', 'Legacy text', '译文\n结果🙂', 'editor.exe'); } finally { legacy.close(); }
    const store = new RecordStore(destination);
    try { store.save('same', 'Current text', '译文\n结果🙂', 'editor.exe'); assert.throws(() => store.migrateFrom(source), /Conflicting/); } finally { store.close(); }
    const db = new DatabaseSync(destination, { readOnly: true });
    try {
      assert.equal(db.prepare('SELECT count(*) AS count FROM records').get()!.count, 1);
      assert.equal(db.prepare('SELECT original_text FROM records WHERE id = ?').get('same')!.original_text, 'Current text');
      assert.equal(db.prepare('SELECT count(*) AS count FROM migration_history').get()!.count, 0);
    } finally { db.close(); }
  } finally { for (const name of readdirSync(folder)) unlinkSync(path.join(folder, name)); rmdirSync(folder); }
});

test('runtime logs rotate with bounded history and use codes instead of raw errors', () => {
  const folder = mkdtempSync(path.resolve('work', 'logs-test-'));
  try {
    const log = new AppLogger(folder, 180);
    for (let i = 0; i < 20; i++) assert.equal(log.write('model.response', { status: 502, requestId: String(i) }), true);
    const files = readdirSync(folder);
    assert.equal(files.length, 4);
    assert.ok(files.includes('glint.log.3'));
    for (const name of files) for (const line of readFileSync(path.join(folder, name), 'utf8').trim().split('\n')) assert.equal(JSON.parse(line).status, 502);
    assert.equal(errorCode(new Error('secret body', { cause: { code: 'ECONNREFUSED' } })), 'ECONNREFUSED');
    assert.equal(errorCode({ code: 'https://example.org/?key=secret' }), 'UNKNOWN');
  } finally { for (const name of readdirSync(folder)) unlinkSync(path.join(folder, name)); rmdirSync(folder); }
});

test('only built-in AI translation and polishing can record originals', () => {
  assert.equal(recordKind(defaults.actions[0]), 'translation');
  assert.equal(recordKind(defaults.actions[2]), 'polishing');
  assert.equal(recordKind(defaults.actions[1]), undefined);
  assert.equal(recordKind({ ...defaults.actions[0], kind: 'copy' }), undefined);
  assert.equal(recordKind({ ...defaults.actions[0], id: 'custom', name: '翻译' }), undefined);
});

test('records persist exact original text and prevent duplicate writes for the same card', () => {
  const folder = mkdtempSync(path.resolve('work', 'records-test-'));
  const filename = path.join(folder, 'records.sqlite');
  const original = "  原文🙂 '); DROP TABLE records; --\n第二行  ";
  try {
    const store = new RecordStore(filename);
    try {
      store.save('card-1', original, '译文\n结果🙂', 'editor.exe');
      store.save('card-1', original, '译文\n结果🙂', 'editor.exe');
      assert.throws(() => store.save('empty', '   ', '译文\n结果🙂', 'editor.exe'));
      assert.throws(() => store.save('large', 'x'.repeat(50_001), '译文\n结果🙂', 'editor.exe'));
    } finally { store.close(); }
    const reopened = new RecordStore(filename);
    try { reopened.save('card-2', '另一张卡片', '译文\n结果🙂', 'editor.exe'); } finally { reopened.close(); }
    const db = new DatabaseSync(filename, { readOnly: true });
    try {
      const row = db.prepare('SELECT original_text, result_text, process_name, created_at FROM records WHERE id = ?').get('card-1')!;
      assert.equal(row.original_text, original);
      assert.equal(row.result_text, '译文\n结果🙂');
      assert.equal(row.process_name, 'editor.exe');
      assert.match(String(row.created_at), /^\d{4}-\d{2}-\d{2}T.*Z$/);
      assert.equal(db.prepare('SELECT count(*) AS count FROM records').get()!.count, 2);
    } finally { db.close(); }
  } finally { unlinkSync(filename); rmdirSync(folder); }
});

test('schema upgrade preserves old records and retry updates results without adding rows', () => {
  const folder = mkdtempSync(path.resolve('work', 'schema-upgrade-'));
  const filename = path.join(folder, 'records.sqlite');
  const originalTime = '2026-09-18T01:00:00.000Z';
  try {
    const old = new DatabaseSync(filename);
    old.exec("CREATE TABLE records (id TEXT PRIMARY KEY NOT NULL, original_text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) STRICT; PRAGMA user_version = 1");
    old.prepare('INSERT INTO records VALUES (?, ?, ?)').run('old-card', '原文', originalTime);
    old.close();
    const store = new RecordStore(filename);
    try {
      const reader = new DatabaseSync(filename, { readOnly: true });
      try {
        const row = reader.prepare('SELECT * FROM records').get()!;
        assert.equal(row.original_text, '原文');
        assert.equal(row.created_at, originalTime);
        assert.equal(row.result_text, '');
        assert.equal(row.process_name, '');
        assert.equal(reader.prepare('PRAGMA user_version').get()!.user_version, 2);
      } finally { reader.close(); }
      store.save('old-card', '原文', '初次结果', 'notepad.exe');
      store.save('old-card', '原文', '重试后的结果', 'notepad.exe');
      assert.throws(() => store.save('old-card', '另一段原文', '无效结果', 'other.exe'));
      assert.throws(() => store.save('old-card', '原文', '', 'notepad.exe'));
    } finally { store.close(); }
    const reopened = new RecordStore(filename); reopened.close();
    const reader = new DatabaseSync(filename, { readOnly: true });
    try {
      const rows = reader.prepare('SELECT * FROM records').all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].original_text, '原文');
      assert.equal(rows[0].result_text, '重试后的结果');
      assert.equal(rows[0].process_name, 'notepad.exe');
      assert.equal(rows[0].created_at, originalTime);
    } finally { reader.close(); }
  } finally { unlinkSync(filename); rmdirSync(folder); }
});

test('reject invalid endpoint protocols and embedded credentials before saving', () => {
  for (const url of ['file:///C:/secret', 'javascript:alert(1)', 'https://user:password@example.org/v1']) {
    const input = structuredClone(defaults); input.provider.baseUrl = url;
    assert.throws(() => validateSettings(input));
  }
});
test('reject actions which would silently omit the user selection', () => {
  const input = structuredClone(defaults); input.actions[0].prompt = 'Translate this';
  assert.throws(() => validateSettings(input), /\{text\}/);
});
test('reject duplicate IDs and a toolbar with no enabled actions', () => {
  const duplicate = structuredClone(defaults); duplicate.actions[1].id = duplicate.actions[0].id;
  assert.throws(() => validateSettings(duplicate));
  const disabled = structuredClone(defaults); disabled.actions.forEach(a => { a.enabled = false; });
  assert.throws(() => validateSettings(disabled), /至少启用/);
});
test('normalization keeps user intent and does not mutate the draft', () => {
  const input = structuredClone(defaults); input.excludedApps = [' WPS.exe ', 'wps.exe'];
  const result = validateSettings(input);
  assert.deepEqual(result.excludedApps, ['wps.exe']);
  assert.equal(input.excludedApps[0], ' WPS.exe ');
});
test('endpoint accepts an API root or a complete chat completions endpoint', () => {
  assert.equal(endpoint('http://localhost:1234/v1/'), 'http://localhost:1234/v1/chat/completions');
  assert.equal(endpoint('https://example.org/v1/chat/completions'), 'https://example.org/v1/chat/completions');
});
test('local HTTPS mismatch gives a protocol correction without downgrading remote services', () => {
  const error = new TypeError('fetch failed', { cause: { code: 'ERR_SSL_PACKET_LENGTH_TOO_LONG' } });
  assert.match(modelErrorMessage(error, 'https://127.0.0.1:3000/v1'), /http:\/\//);
  assert.doesNotMatch(modelErrorMessage(error, 'https://example.org/v1'), /http:\/\//);
});
test('connection errors explain the cause and preserve model HTTP errors', () => {
  assert.match(modelErrorMessage(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }), 'http://localhost:3000'), /服务已启动/);
  assert.match(modelErrorMessage(new TypeError('fetch failed'), 'https://example.org'), /无法连接模型服务/);
  assert.equal(modelErrorMessage(new Error('模型请求失败（HTTP 401）。'), 'https://example.org'), '模型请求失败（HTTP 401）。');
});
test('floating bar stays on a negative-coordinate monitor and flips above the bottom edge', () => {
  const area = { x: -1920, y: -200, width: 1920, height: 1080 };
  const position = placeToolbar({ x: -10, y: 870 }, area, 600, 88);
  assert.ok(position.x >= area.x && position.x + 600 <= 0);
  assert.ok(position.y >= area.y && position.y + 88 <= 880);
  assert.ok(position.y < 870);
});
test('SSE handles split Unicode, split CRLF, comments and multiple packets', async () => {
  const bytes = new TextEncoder().encode(': ping\r\ndata: {"text":"中文 ✦"}\r\n\r\ndata: [DONE]\n\n');
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  const packets: string[] = [];
  for await (const packet of readSSE(stream)) packets.push(packet);
  assert.deepEqual(packets, ['{"text":"中文 ✦"}', '[DONE]']);
});
test('SSE handles an unterminated last event and multi-line data', async () => {
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: first\ndata: second')); controller.close(); } });
  const packets: string[] = [];
  for await (const packet of readSSE(stream)) packets.push(packet);
  assert.deepEqual(packets, ['first\nsecond']);
});
