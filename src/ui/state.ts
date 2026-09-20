import { useSyncExternalStore } from 'react';
import type { Snapshot } from '../core';
import { RendererStore } from './renderer-store';

export let ui: RendererStore;
export function initializeUI(snapshot: Snapshot, editingSettings: boolean) {
  ui = new RendererStore(snapshot, editingSettings);
}
export function useAppState() { return useSyncExternalStore(ui.subscribe, ui.getState); }
export const toast = (message: string, error = false) => ui.notify(message, error);
export async function perform(action: () => Promise<unknown>) {
  try { await action(); } catch (error) { toast(error instanceof Error ? error.message : '操作失败', true); }
}
