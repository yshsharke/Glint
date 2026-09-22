import path from 'node:path';
import type { Settings } from './core';
import type { SelectionHookConstructor, SelectionHookInstance } from 'selection-hook';
import { configureSelectionHook } from './selection-config';
import { desktopPlatform } from './platform';

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
      const state = configureSelectionHook(hook, Hook, message.settings, desktopPlatform(process.platform, process.env), path.basename(process.execPath).toLowerCase(), message.testing);
      send({ type: 'ready', ...state });
    } else if (message.type === 'capture') {
      const data = hook.getCurrentSelection();
      send({ type: 'captured', id: message.id, data });
    } else if (message.type === 'stop') {
      hook.cleanup(); process.exit(0);
    }
  } catch (error) { send({ type: 'error', message: String(error), id: message.id }); }
});
