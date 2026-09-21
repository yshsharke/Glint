import path from 'node:path';
import type { Settings } from './core';
import type { SelectionHookConstructor, SelectionHookInstance } from 'selection-hook';

const port = process.parentPort;
if (!port) throw new Error('Selection host must run as an Electron utility process.');
const send = (message: unknown) => port.postMessage(message);
let hook: SelectionHookInstance | undefined;
let Hook: SelectionHookConstructor;

try {
  Hook = require('selection-hook');
  hook = new Hook();
  hook.on('text-selection', data => send({ type: 'selection', data }));
  hook.on('mouse-down', data => send({ type: 'mouse-down', data }));
  hook.on('mouse-wheel', () => send({ type: 'dismiss' }));
  hook.on('key-down', data => { if (data.uniKey === 'Escape') send({ type: 'dismiss' }); });
  hook.on('error', error => send({ type: 'error', message: String(error) }));
  send({ type: 'loaded' });
} catch (error) { send({ type: 'error', message: String(error) }); }

port.on('message', (event: { data: { type: string; settings?: Settings; id?: number; testing?: boolean } }) => {
  const message = event.data;
  if (!hook) return;
  try {
    if (message.type === 'configure' && message.settings) {
      const settings = message.settings;
      if (!settings.enabled) { hook.stop(); send({ type: 'ready', paused: true }); return; }
      if (!hook.isRunning() && !hook.start({ enableClipboard: false, enableMouseMoveEvent: false, selectionPassiveMode: true })) throw new Error('无法启动全局监听。');
      hook.setGlobalFilterMode(Hook.FilterMode.EXCLUDE_LIST, [
        ...settings.excludedApps,
        ...(message.testing ? [] : [path.basename(process.execPath).toLowerCase()])
      ]);
      hook.setFineTunedList(Hook.FineTunedListType.EXCLUDE_CLIPBOARD_CURSOR_DETECT, ['acrobat.exe', 'wps.exe', 'cajviewer.exe']);
      hook.setFineTunedList(Hook.FineTunedListType.INCLUDE_CLIPBOARD_DELAY_READ, ['acrobat.exe', 'wps.exe', 'cajviewer.exe', 'foxitphantom.exe', 'zotero.exe']);
      if (!hook.setClipboardOnly(settings.selectionMethod === 'clipboard')) throw new Error('取词引擎缺少复制模式支持，请重新构建或安装 Glint。');
      settings.selectionMethod === 'accessibility' ? hook.disableClipboard() : hook.enableClipboard();
      hook.setSelectionPassiveMode(settings.trigger === 'shortcut');
      send({ type: 'ready', paused: false });
    } else if (message.type === 'capture') {
      const data = hook.getCurrentSelection();
      send({ type: 'captured', id: message.id, data });
    } else if (message.type === 'stop') {
      hook.cleanup(); process.exit(0);
    }
  } catch (error) { send({ type: 'error', message: String(error), id: message.id }); }
});
