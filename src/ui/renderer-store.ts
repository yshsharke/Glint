import type { Action, GlintAPI, Settings, Snapshot, UIEvent } from '../core';

export type SettingsPage = 'actions' | 'model' | 'triggers' | 'appearance' | 'history' | 'diagnostics';
export interface RendererState {
  snapshot: Snapshot;
  draft: Settings;
  selectedId: string;
  page: SettingsPage;
  dirty: boolean;
  busy: boolean;
  keyUpdate?: string;
  resetVersion: number;
  notice: { id: number; message: string; error: boolean };
}

// All state transitions live here. React reads stable snapshots and never mutates them.
export class RendererStore {
  private state: RendererState;
  private readonly listeners = new Set<() => void>();

  constructor(snapshot: Snapshot, private readonly editingSettings: boolean) {
    this.state = {
      snapshot, draft: structuredClone(snapshot.settings), selectedId: snapshot.settings.actions[0].id,
      page: 'actions', dirty: false, busy: false, resetVersion: 0,
      notice: { id: 0, message: '', error: false },
    };
  }

  getState = (): RendererState => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<RendererState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }

  notify = (message: string, error = false) => {
    this.update({ notice: { id: this.state.notice.id + 1, message, error } });
  };

  selectPage(page: SettingsPage) { this.update({ page }); }
  selectAction(selectedId: string) { this.update({ selectedId }); }

  edit = (change: (draft: Settings) => void) => {
    if (this.state.busy) return;
    const draft = structuredClone(this.state.draft);
    change(draft);
    const selectedId = draft.actions.some(action => action.id === this.state.selectedId) ? this.state.selectedId : draft.actions[0].id;
    this.update({ draft, selectedId, dirty: true });
  };

  editAction(id: string, change: Partial<Action>) {
    this.edit(draft => {
      const action = draft.actions.find(item => item.id === id);
      if (action) Object.assign(action, change);
    });
  }

  addAction(action: Action) {
    if (this.state.busy || this.state.draft.actions.length >= 12) return;
    this.update({ draft: { ...this.state.draft, actions: [...this.state.draft.actions, action] }, selectedId: action.id, dirty: true });
  }

  updateKey(keyUpdate: string | undefined) {
    if (!this.state.busy) this.update({ keyUpdate, dirty: true });
  }

  revert = () => {
    if (this.state.busy) return;
    const draft = structuredClone(this.state.snapshot.settings);
    const selectedId = draft.actions.some(action => action.id === this.state.selectedId) ? this.state.selectedId : draft.actions[0].id;
    this.update({ draft, selectedId, keyUpdate: undefined, dirty: false, resetVersion: this.state.resetVersion + 1 });
  };

  receive = (event: UIEvent) => {
    if (event.type === 'records-changed') return; // History owns its own refresh subscription.
    if (event.type === 'result') { this.update({ snapshot: { ...this.state.snapshot, result: event.result } }); return; }
    if (event.type === 'settings-window') { this.update({ snapshot: { ...this.state.snapshot, settingsMaximized: event.maximized } }); return; }
    const snapshot = event.snapshot;
    const patch: Partial<RendererState> = { snapshot };
    if (this.editingSettings && !this.state.dirty && !this.state.busy && JSON.stringify(this.state.draft) !== JSON.stringify(snapshot.settings)) {
      patch.draft = structuredClone(snapshot.settings);
      patch.resetVersion = this.state.resetVersion + 1;
      if (!patch.draft.actions.some(action => action.id === this.state.selectedId)) patch.selectedId = patch.draft.actions[0].id;
    }
    this.update(patch);
  };

  async save(api: Pick<GlintAPI, 'save' | 'snapshot'>) {
    if (this.state.busy) return;
    const draft = structuredClone(this.state.draft), keyUpdate = this.state.keyUpdate;
    this.update({ busy: true });
    try {
      const response = await api.save(draft, keyUpdate);
      if (!response.ok) { this.notify(response.error || '保存失败', true); return; }
      const snapshot = await api.snapshot();
      const selectedId = snapshot.settings.actions.some(action => action.id === this.state.selectedId) ? this.state.selectedId : snapshot.settings.actions[0].id;
      this.update({ snapshot, draft: structuredClone(snapshot.settings), selectedId, keyUpdate: undefined, dirty: false, resetVersion: this.state.resetVersion + 1 });
      this.notify('设置已保存');
    } finally { this.update({ busy: false }); }
  }
}
