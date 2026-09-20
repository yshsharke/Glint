import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { RecordPage, RecordSummary, SavedRecord } from './core';

export class RecordStore {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    let transaction = false;
    try {
      this.db.exec('PRAGMA busy_timeout = 1000; BEGIN IMMEDIATE'); transaction = true;
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS records (
          id TEXT PRIMARY KEY NOT NULL,
          original_text TEXT NOT NULL CHECK(length(original_text) > 0),
          result_text TEXT NOT NULL DEFAULT '',
          process_name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ) STRICT;
        CREATE TABLE IF NOT EXISTS migration_history (
          source TEXT PRIMARY KEY NOT NULL,
          completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ) STRICT;
      `);
      const columns = new Set(this.db.prepare('PRAGMA table_info(records)').all().map(row => row.name));
      if (!columns.has('result_text')) this.db.exec("ALTER TABLE records ADD COLUMN result_text TEXT NOT NULL DEFAULT ''");
      if (!columns.has('process_name')) this.db.exec("ALTER TABLE records ADD COLUMN process_name TEXT NOT NULL DEFAULT ''");
      this.db.exec('CREATE INDEX IF NOT EXISTS records_created_at ON records(created_at DESC, id DESC); PRAGMA user_version = 2; COMMIT'); transaction = false;
    } catch (error) { if (transaction) this.db.exec('ROLLBACK'); this.db.close(); throw error; }
  }

  save(id: string, text: string, resultText: string, processName: string): void {
    if (!id || !text.trim() || text.length > 50_000) throw new Error('原文无效或过长。');
    if (!resultText.trim() || resultText.length > 150_000) throw new Error('结果为空或过长。');
    const saved = this.db.prepare(`INSERT INTO records (id, original_text, result_text, process_name) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET result_text = excluded.result_text, process_name = excluded.process_name
      WHERE records.original_text = excluded.original_text`).run(id, text, resultText, processName);
    if (!saved.changes) throw new Error('记录原文不一致。');
  }

  list(page: number): RecordPage {
    if (!Number.isSafeInteger(page) || page < 0 || page > 1_000_000) throw new Error('记录页码无效。');
    const pageSize = 20;
    const total = Number(this.db.prepare('SELECT count(*) AS total FROM records').get()!.total);
    const current = Math.min(page, Math.max(0, Math.ceil(total / pageSize) - 1));
    // Fetch only bounded previews; full text is read on demand for the selected record.
    const items = this.db.prepare(`SELECT id, substr(original_text, 1, 120) AS preview,
      process_name AS processName, created_at AS createdAt FROM records
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(pageSize, current * pageSize) as unknown as RecordSummary[];
    return { items, total, page: current, pageSize };
  }

  get(id: string): SavedRecord | undefined {
    if (typeof id !== 'string' || !id || id.length > 256) throw new Error('记录 ID 无效。');
    return this.db.prepare(`SELECT id, original_text AS originalText, result_text AS resultText,
      process_name AS processName, created_at AS createdAt FROM records WHERE id = ?`).get(id) as unknown as SavedRecord | undefined;
  }

  delete(id: string): boolean {
    if (typeof id !== 'string' || !id || id.length > 256) throw new Error('记录 ID 无效。');
    return this.db.prepare('DELETE FROM records WHERE id = ?').run(id).changes > 0;
  }

  migrateFrom(legacyPath: string): number | undefined {
    const source = path.resolve(legacyPath);
    if (!existsSync(source) || this.db.prepare('SELECT source FROM migration_history WHERE source = ?').get(source)) return undefined;
    const legacy = new DatabaseSync(source, { readOnly: true });
    let transaction = false;
    try {
      legacy.exec('BEGIN');
      if (legacy.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw new Error('Legacy database integrity check failed');
      this.db.exec('BEGIN IMMEDIATE'); transaction = true;
      const columns = new Set(legacy.prepare('PRAGMA table_info(records)').all().map(row => row.name));
      const insert = this.db.prepare('INSERT INTO records (id, original_text, created_at, result_text, process_name) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING');
      const lookup = this.db.prepare('SELECT original_text, created_at, result_text, process_name FROM records WHERE id = ?');
      let imported = 0;
      for (const row of legacy.prepare(`SELECT id, original_text, created_at, ${columns.has('result_text') ? 'result_text' : "'' AS result_text"}, ${columns.has('process_name') ? 'process_name' : "'' AS process_name"} FROM records`).iterate()) {
        imported += Number(insert.run(row.id, row.original_text, row.created_at, row.result_text, row.process_name).changes);
        const saved = lookup.get(row.id)!;
        if (saved.original_text !== row.original_text || saved.created_at !== row.created_at) throw new Error('Conflicting legacy record');
        if ((columns.has('result_text') && saved.result_text !== row.result_text) || (columns.has('process_name') && saved.process_name !== row.process_name)) throw new Error('Conflicting legacy record');
      }
      this.db.prepare('INSERT INTO migration_history (source) VALUES (?)').run(source);
      this.db.exec('COMMIT'); transaction = false;
      return imported;
    } catch (error) { if (transaction) this.db.exec('ROLLBACK'); throw error; }
    finally { legacy.close(); }
  }

  close(): void { this.db.close(); }
}
