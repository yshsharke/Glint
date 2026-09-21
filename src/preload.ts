import { contextBridge, ipcRenderer } from 'electron';
import type { GlintAPI, UIEvent } from './core';
import type { IPCArgs, IPCChannel, IPCResult } from './ipc-contract';
const invoke = <K extends IPCChannel>(channel: K, ...args: IPCArgs<K>): Promise<IPCResult<K>> => ipcRenderer.invoke(`glint:${channel}`, ...args);
const api: GlintAPI = {
  snapshot: () => invoke('snapshot'),
  save: (settings, keyUpdate) => invoke('save', settings, keyUpdate),
  demo: () => invoke('demo'),
  fitToolbar: (selectionId, width, height) => invoke('fit-toolbar', selectionId, width, height),
  run: (actionId, selectionId) => invoke('run', actionId, selectionId),
  openSettings: () => invoke('settings'),
  settingsWindow: action => invoke('settings-window', action),
  dismiss: () => invoke('dismiss'),
  cancel: () => invoke('cancel'),
  retryResult: () => invoke('retry-result'),
  copyResult: () => invoke('copy-result'),
  recordSource: resultId => invoke('record-source', resultId),
  listRecords: (kind, page) => invoke('list-records', kind, page),
  getRecord: (kind, id) => invoke('get-record', kind, id),
  copyRecord: (kind, id, field) => invoke('copy-record', kind, id, field),
  deleteRecord: (kind, id) => invoke('delete-record', kind, id),
  restart: () => invoke('restart'),
  quit: () => invoke('quit'),
  subscribe: callback => {
    const listener = (_event: unknown, event: UIEvent) => callback(event);
    ipcRenderer.on('glint:event', listener);
    return () => ipcRenderer.removeListener('glint:event', listener);
  }
};
contextBridge.exposeInMainWorld('glint', api);
