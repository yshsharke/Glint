import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/core';
import type { Snapshot } from '../src/core';
import { RendererStore } from '../src/ui/renderer-store';

const initial = (): Snapshot => ({ settings: structuredClone(defaults), hasKey: true, settingsMaximized: false, status: { hook: 'ready', message: '', shortcutReady: true, events: [] } });

test('editing creates a new draft without mutating previous snapshots or saved settings', () => {
  const store = new RendererStore(initial(), true), before = store.getState();
  assert.equal(store.getState(), before, 'snapshot identity stays stable between changes');
  store.editAction('translate', { name: '我的翻译' });
  assert.equal(before.draft.actions[0].name, '翻译');
  assert.equal(store.getState().snapshot.settings.actions[0].name, '翻译');
  assert.equal(store.getState().draft.actions[0].name, '我的翻译');
  assert.equal(store.getState().dirty, true);
});

test('status updates preserve edits and selection; revert adopts latest saved settings', () => {
  const store = new RendererStore(initial(), true);
  store.selectPage('history'); store.selectAction('polish');
  store.editAction('translate', { prompt: '自定义 {text}' });
  store.updateKey('');
  const draft = store.getState().draft;
  const next = initial(); next.settings.theme = 'dark'; next.status.hook = 'paused';
  store.receive({ type: 'snapshot', snapshot: next });
  assert.equal(store.getState().draft, draft);
  assert.equal(store.getState().keyUpdate, '');
  assert.equal(store.getState().selectedId, 'polish');
  assert.equal(store.getState().resetVersion, 0);
  store.revert();
  assert.equal(store.getState().draft.theme, 'dark');
  assert.equal(store.getState().page, 'history');
  assert.equal(store.getState().keyUpdate, undefined);
  assert.equal(store.getState().dirty, false);
});

test('clean status broadcasts do not reset controls; changed settings do', () => {
  const store = new RendererStore(initial(), true), draft = store.getState().draft;
  const next = initial(); next.status.message = '更新';
  store.receive({ type: 'snapshot', snapshot: next });
  assert.equal(store.getState().draft, draft);
  assert.equal(store.getState().resetVersion, 0);
  next.settings.theme = 'dark';
  store.receive({ type: 'snapshot', snapshot: next });
  assert.equal(store.getState().draft.theme, 'dark');
  assert.equal(store.getState().resetVersion, 1);
});

test('saving freezes edits until acknowledgement, preserves selection, and clears key updates', async () => {
  const store = new RendererStore(initial(), true);
  store.selectAction('polish'); store.editAction('polish', { name: ' 新名称 ' }); store.updateKey('');
  let finish!: (result: { ok: boolean }) => void;
  const saved = initial(); saved.settings.actions[2].name = '新名称'; saved.hasKey = false;
  let calls = 0;
  const api = {
    save: async () => { calls++; return new Promise<{ ok: boolean }>(resolve => { finish = resolve; }); },
    snapshot: async () => saved,
  };
  const pending = store.save(api);
  store.editAction('polish', { name: '不应修改' }); store.revert(); store.updateKey('不应修改');
  await store.save(api);
  assert.equal(calls, 1);
  assert.equal(store.getState().draft.actions[2].name, ' 新名称 ');
  store.receive({ type: 'snapshot', snapshot: saved });
  assert.equal(store.getState().dirty, true);
  finish({ ok: true }); await pending;
  assert.equal(store.getState().draft.actions[2].name, '新名称');
  assert.equal(store.getState().selectedId, 'polish');
  assert.equal(store.getState().dirty, false);
  assert.equal(store.getState().busy, false);
  assert.equal(store.getState().keyUpdate, undefined);
});

test('failed saves and IPC errors retain the draft and release the busy state', async () => {
  const store = new RendererStore(initial(), true);
  store.editAction('translate', { name: '保留草稿' }); store.updateKey('draft-key');
  const draft = store.getState().draft;
  await store.save({ save: async () => ({ ok: false, error: '磁盘不可用' }), snapshot: async () => initial() });
  assert.equal(store.getState().draft, draft);
  assert.equal(store.getState().notice.error, true);
  await assert.rejects(store.save({ save: async () => { throw new Error('IPC failed'); }, snapshot: async () => initial() }));
  assert.equal(store.getState().draft, draft);
  assert.equal(store.getState().dirty, true);
  assert.equal(store.getState().keyUpdate, 'draft-key');
  assert.equal(store.getState().busy, false);
});

test('discarding a new action repairs selection and subscriptions can be removed', () => {
  const store = new RendererStore(initial(), true);
  let calls = 0; const unsubscribe = store.subscribe(() => { calls++; });
  store.addAction({ ...defaults.actions[0], id: 'new', englishName: 'new' });
  assert.equal(store.getState().selectedId, 'new');
  store.revert(); assert.equal(store.getState().selectedId, 'translate');
  assert.equal(calls, 2); unsubscribe(); store.selectPage('model'); assert.equal(calls, 2);
  const before = store.getState(); store.receive({ type: 'records-changed', kind: 'translation' });
  assert.equal(store.getState(), before);
});
