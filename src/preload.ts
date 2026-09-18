import { contextBridge, ipcRenderer } from 'electron';
import type { GlintAPI, UIEvent } from './core';
const api: GlintAPI = {
  snapshot: () => ipcRenderer.invoke('glint:snapshot'),
  save: (settings, keyUpdate) => ipcRenderer.invoke('glint:save', settings, keyUpdate),
  demo: () => ipcRenderer.invoke('glint:demo'),
  fitToolbar: (selectionId, width, height) => ipcRenderer.invoke('glint:fit-toolbar', selectionId, width, height),
  run: actionId => ipcRenderer.invoke('glint:run', actionId),
  openSettings: () => ipcRenderer.invoke('glint:settings'),
  settingsWindow: action => ipcRenderer.invoke('glint:settings-window', action),
  dismiss: () => ipcRenderer.invoke('glint:dismiss'),
  cancel: () => ipcRenderer.invoke('glint:cancel'),
  retryResult: () => ipcRenderer.invoke('glint:retry-result'),
  copyResult: () => ipcRenderer.invoke('glint:copy-result'),
  recordSource: resultId => ipcRenderer.invoke('glint:record-source', resultId),
  restart: () => ipcRenderer.invoke('glint:restart'),
  quit: () => ipcRenderer.invoke('glint:quit'),
  subscribe: callback => {
    const listener = (_event: unknown, event: UIEvent) => callback(event);
    ipcRenderer.on('glint:event', listener);
    return () => ipcRenderer.removeListener('glint:event', listener);
  }
};
contextBridge.exposeInMainWorld('glint', api);
