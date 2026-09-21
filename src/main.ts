import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeImage, safeStorage, screen, shell, Tray, utilityProcess } from 'electron';
import type { IpcMainInvokeEvent, UtilityProcess } from 'electron';
import type { IPCArgs, IPCChannel, IPCResult } from './ipc-contract';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { RecordStore } from './records';
import { AppLogger, errorCode } from './logger';
import { runtimePaths } from './runtime-paths';
import { isAppPage } from './ipc-origin';
import type { TextSelectionData } from 'selection-hook';
import { defaults, endpoint, migrateSettings, modelErrorMessage, placeToolbar, readSSE, recordKind, recordFilename, validateActionNames, validateSettings } from './core';
import type { RecordKind, ResultState, Selection, Settings, Snapshot, Status, UIEvent } from './core';

import { runPackageCheck } from './package-check';
declare const GLINT_TEST_BUILD: boolean;
declare const GLINT_ASSET_DIR: string | undefined;
const assets = GLINT_ASSET_DIR ?? __dirname;
const packageCheck = process.argv.includes('--package-check');
const smoke = (GLINT_TEST_BUILD && process.argv.includes('--smoke')) || packageCheck;
const root = app.getAppPath();
// An installed app lives in a read-only ASAR. Test profiles must remain writable
// and separate from the real user's AppData, including portable launches.
const testRoot = smoke ? (process.env.GLINT_SMOKE_ROOT
  ? path.resolve(process.env.GLINT_SMOKE_ROOT)
  : app.isPackaged ? path.join(app.getPath('temp'), 'Glint-smoke', randomUUID()) : root) : root;
app.setName('Glint');
if (process.platform === 'win32') app.setAppUserModelId('com.yshsharke.glint');
app.setPath('userData', smoke ? path.join(testRoot, 'work', 'smoke-profile') : path.join(app.getPath('appData'), 'Glint'));
if (smoke) app.commandLine.appendSwitch('force-renderer-accessibility');
const page = path.join(assets, 'index.html');
const preload = path.join(assets, 'preload.cjs');
const configPath = path.join(app.getPath('userData'), 'settings.json');
const paths = runtimePaths(testRoot, process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), smoke);
const recordsFolder = paths.data;
let logger: AppLogger | undefined;
const recordPath = (kind: RecordKind) => path.join(recordsFolder, recordFilename(kind));
const recordStores = new Map<RecordKind, RecordStore>();
function openRecordStore(kind: RecordKind): RecordStore {
  const cached = recordStores.get(kind);
  if (cached) return cached;
  const store = new RecordStore(recordPath(kind));
  try {
    if (!smoke && (kind === 'translation' || kind === 'polishing')) {
      const imported = store.migrateFrom(path.join(root, 'work', recordFilename(kind)));
      if (imported !== undefined) logger?.write('records.migrated', { kind, imported });
    }
    recordStores.set(kind, store);
    return store;
  } catch (error) { store.close(); throw error; }
}
function closeRecordStores() {
  for (const store of recordStores.values()) store.close();
  recordStores.clear();
}
function initializeRecordStores(actions: Settings['actions']) {
  for (const action of actions.filter(action => action.kind === 'ai')) {
    try { openRecordStore(action.englishName); }
    catch (error) {
      logger?.write('records.initialization-failed', { kind: action.englishName, code: errorCode(error) });
      diagnose(`“${action.name}”记录数据库暂不可用，点击记录时将重新尝试。`);
    }
  }
}
let settings: Settings = structuredClone(defaults);
let encryptedKey = '';
let setup: BrowserWindow | undefined;
let toolbar: BrowserWindow | undefined;
let resultWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let host: UtilityProcess | undefined;
let quitting = false;
let selection: Selection | undefined;
let toolbarSelectionId: number | undefined;
let result: ResultState | undefined;
let resultPrompt: string | undefined;
let serial = 0;
let requestSerial = 0;
let captureTimer: NodeJS.Timeout | undefined;
let capturePending = false;
let abort: AbortController | undefined;
let saving = false;
const status: Status = { hook: 'starting', message: '正在启动取词引擎', shortcutReady: false, events: [] };

function snapshot(): Snapshot { return { settings, hasKey: Boolean(encryptedKey), status, selection, result, settingsMaximized: setup?.isMaximized() ?? false }; }
function emit(event: UIEvent) {
  for (const win of [setup, toolbar, resultWindow]) if (win && !win.isDestroyed() && !win.webContents.isLoadingMainFrame()) win.webContents.send('glint:event', event);
}
function broadcast() { emit({ type: 'snapshot', snapshot: snapshot() }); }
function diagnose(message: string) {
  logger?.write('diagnostic', { hook: status.hook });
  status.events.unshift({ time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), message });
  status.events = status.events.slice(0, 20);
  broadcast();
}
function persist(next: Settings, key: string) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const temp = `${configPath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ settings: next, encryptedKey: key }, null, 2), 'utf8');
  fs.renameSync(temp, configPath);
}
function load() {
  if (!fs.existsSync(configPath)) return;
  try {
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    settings = migrateSettings(saved.settings);
    encryptedKey = typeof saved.encryptedKey === 'string' ? saved.encryptedKey : '';
    if (JSON.stringify(saved.settings) !== JSON.stringify(settings)) {
      try { persist(settings, encryptedKey); }
      catch { diagnose('设置已升级，但配置暂时无法写入磁盘。'); }
    }
  }
  catch { diagnose('设置文件无法读取，使用默认配置；原文件仍保留。'); }
}
function secureWindow(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
}
function openSettings() {
  if (setup && !setup.isDestroyed()) { if (setup.isMinimized()) setup.restore(); setup.show(); setup.focus(); return; }
  setup = new BrowserWindow({ width: 920, height: 640, minWidth: 820, minHeight: 570, frame: false, fullscreenable: false, title: 'Glint', backgroundColor: '#f3f3f3', show: false, autoHideMenuBar: true, icon: createIcon(), webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: !smoke } });
  secureWindow(setup);
  setup.loadFile(page, { query: { view: 'settings' } });
  const win = setup;
  win.once('ready-to-show', () => win.show());
  const updateWindowState = () => {
    if (!win.webContents.isLoadingMainFrame()) win.webContents.send('glint:event', { type: 'settings-window', maximized: win.isMaximized() } satisfies UIEvent);
  };
  win.on('maximize', updateWindowState);
  win.on('unmaximize', updateWindowState);
  win.on('closed', () => { if (setup === win) setup = undefined; });
}
async function getToolbar() {
  if (toolbar && !toolbar.isDestroyed()) return toolbar;
  const win = new BrowserWindow({ width: 440, height: 60, show: false, frame: false, transparent: true, resizable: false, focusable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false, webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  secureWindow(win);
  toolbar = win;
  await win.loadFile(page, { query: { view: 'toolbar' } });
  return win;
}
async function showSelection(data: TextSelectionData, demo = false) {
  if (!data.text?.trim() || (!settings.enabled && !demo)) return;
  if (data.text.length > 50_000) { diagnose('选区超过 50,000 字符，请缩小选区。'); return; }
  let point = screen.getCursorScreenPoint();
  const anchor = data.posLevel >= 3 ? data.endBottom : data.posLevel > 0 ? data.mousePosEnd : undefined;
  if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && anchor.x !== -99999 && anchor.y !== -99999) point = process.platform === 'win32' ? screen.screenToDipPoint(anchor) : anchor;
  if (demo && setup) { const bounds = setup.getBounds(); point = { x: bounds.x + bounds.width / 2 + 100, y: bounds.y + 260 }; }
  const current: Selection = { id: ++serial, text: data.text, app: data.programName || '未知应用', method: demo ? '演示' : ({ 1: 'UI Automation', 3: 'IAccessible', 99: '剪贴板' } as Record<number, string>)[data.method] || '系统取词', x: point.x, y: point.y, demo };
  selection = current;
  logger?.write('selection.accepted', { selectionId: current.id, sourceApp: current.app, method: current.method, inputLength: current.text.length, historyCleanup: data.historyCleanup });
  toolbarSelectionId = current.id;
  status.lastSelection = { app: current.app, method: current.method, length: current.text.length };
  diagnose(`${demo ? '演示' : '取词成功'} · ${current.app} · ${current.method} · ${current.text.length} 字符`);
  await getToolbar();
  if (toolbarSelectionId !== current.id || quitting) return;
  // The renderer measures the actual controls before we size and reveal the window.
  broadcast();
}
function showDemo() {
  const zero = { x: 0, y: 0 };
  return showSelection({ text: 'Good tools stay out of your way. Great tools make the next step feel effortless.', programName: 'Glint 体验区', method: 1, posLevel: 0, startTop: zero, startBottom: zero, endTop: zero, endBottom: zero, mousePosStart: zero, mousePosEnd: zero }, true);
}
function dismissToolbar() { toolbarSelectionId = undefined; toolbar?.hide(); }
function configureHost() { host?.postMessage({ type: 'configure', settings, testing: smoke }); }
function startHost() {
  clearTimeout(captureTimer); capturePending = false;
  const previous = host;
  host = undefined;
  previous?.kill();
  status.hook = 'starting'; status.message = '正在启动取词引擎'; broadcast();
  const child = utilityProcess.fork(path.join(assets, 'selection-host.cjs'), [], { serviceName: 'Glint Selection', stdio: 'pipe' });
  host = child;
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  child.on('message', message => {
    if (host !== child || quitting) return;
    if (message.type === 'loaded') configureHost();
    else if (message.type === 'ready') {
      status.hook = message.paused ? 'paused' : 'ready'; status.message = message.paused ? '已暂停划词监听' : '取词引擎已就绪'; diagnose(status.message);
    } else if (message.type === 'error') {
      clearTimeout(captureTimer); capturePending = false;
      status.hook = 'error'; status.message = `取词引擎异常：${message.message}`; diagnose(status.message);
    } else if (message.type === 'selection') {
      if (settings.trigger === 'automatic') void showSelection(message.data).catch(error => diagnose(String(error)));
    } else if (message.type === 'captured' && message.id === requestSerial) {
      clearTimeout(captureTimer); capturePending = false;
      if (message.data) void showSelection(message.data).catch(error => diagnose(String(error)));
      else diagnose('未读取到选中文字：请检查应用排除规则，或为需要的场景开启复制取词。');
    } else if (message.type === 'dismiss') dismissToolbar();
    else if (message.type === 'mouse-down' && toolbar?.isVisible()) {
      const point = process.platform === 'win32' ? screen.screenToDipPoint(message.data) : message.data;
      const rect = toolbar.getBounds();
      if (point.x < rect.x || point.x > rect.x + rect.width || point.y < rect.y || point.y > rect.y + rect.height) dismissToolbar();
    }
  });
  child.on('exit', code => {
    if (host === child && !quitting) { host = undefined; status.hook = 'error'; status.message = `取词进程已退出 (${code})，可以在诊断页重新启动。`; diagnose(status.message); }
  });
}
function captureSelection() {
  if (!settings.enabled || status.hook !== 'ready' || !host || capturePending) return;
  capturePending = true;
  host.postMessage({ type: 'capture', id: ++requestSerial });
  captureTimer = setTimeout(() => {
    capturePending = false;
    ++requestSerial;
    const stuck = host; host = undefined; stuck?.kill();
    status.hook = 'error'; status.message = '取词超时，已停止取词进程。可在诊断页重新启动。'; diagnose(status.message);
  }, 3500);
}
function registerShortcut(shortcut: string) {
  try { return globalShortcut.register(shortcut, captureSelection); } catch { return false; }
}
function createIcon(size = 256) {
  return nativeImage.createFromPath(path.join(assets, 'brand', `glint-${size}.png`));
}
function updateTray() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: '打开设置', click: openSettings },
    { label: settings.enabled ? '停止划词' : '启用划词', click: () => { settings.enabled = !settings.enabled; try { persist(settings, encryptedKey); } catch { diagnose('无法保存划词启用状态。'); } configureHost(); dismissToolbar(); broadcast(); updateTray(); } },
    { type: 'separator' }, { label: '退出', click: () => app.quit() }
  ]));
}
async function getResultWindow(anchor: Pick<Selection, 'x' | 'y'>) {
  const area = screen.getDisplayNearestPoint(anchor).workArea;
  if (resultWindow && !resultWindow.isDestroyed()) {
    const { width, height } = resultWindow.getBounds();
    const position = placeToolbar(anchor, area, width, height);
    resultWindow.setPosition(position.x, position.y);
    return resultWindow;
  }
  const position = placeToolbar(anchor, area, 480, 360);
  const win = new BrowserWindow({ ...position, width: 480, height: 360, minWidth: 380, minHeight: 240, frame: false, minimizable: false, maximizable: false, fullscreenable: false, show: false, title: 'Glint · 结果', alwaysOnTop: true, autoHideMenuBar: true, backgroundColor: '#f3f3f3', icon: createIcon(), webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  resultWindow = win; secureWindow(win);
  win.on('closed', () => { abort?.abort(); resultPrompt = undefined; resultWindow = undefined; });
  await win.loadFile(page, { query: { view: 'result' } });
  return win;
}
async function runAction(actionId: unknown) {
  if (typeof actionId !== 'string') throw new Error('动作无效。');
  const action = settings.actions.find(a => a.id === actionId && a.enabled);
  const captured = selection;
  if (!action || !captured) throw new Error('请先选择文字。');
  dismissToolbar();
  if (action.kind === 'search') { await shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(captured.text.slice(0, 4000))}`); return; }
  abort?.abort();
  const controller = new AbortController(); abort = controller;
  const state: ResultState = { id: randomUUID(), recorded: false, recordKind: recordKind(action), actionName: action.name, actionIcon: action.icon, source: captured.text, text: '', app: captured.app, busy: true, demo: captured.demo };
  result = state;
  resultPrompt = action.prompt;
  const win = await getResultWindow(captured);
  if (abort !== controller) return;
  broadcast(); win.show();
  void generate(action.prompt, captured.text, state, controller);
}
async function generate(prompt: string, text: string, state: ResultState, controller: AbortController) {
  const startedAt = Date.now();
  logger?.write('model.started', { requestId: state.id, kind: state.recordKind || 'other', sourceApp: state.app, inputLength: text.length });
  let firstOutput = false;
  const publish = () => {
    if (!firstOutput && state.text.length) {
      firstOutput = true;
      logger?.write('model.first-output', { requestId: state.id, elapsedMs: Date.now() - startedAt });
    }
    if (result === state) emit({ type: 'result', result: state });
  };
  const timeout = setTimeout(() => controller.abort(new Error('请求超过 90 秒。')), 90_000);
  let lastPublish = 0;
  try {
    if (!settings.provider.model) throw new Error('请先在「模型」中填写模型名称和 API 地址。');
    const key = encryptedKey ? safeStorage.decryptString(Buffer.from(encryptedKey, 'base64')) : '';
    const response = await fetch(endpoint(settings.provider.baseUrl), { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ model: settings.provider.model, stream: true, messages: [{ role: 'user', content: prompt.split('{text}').join(text) }] }), signal: controller.signal });
    logger?.write('model.response', { requestId: state.id, status: response.status });
    if (!response.ok) {
      if ([502, 503, 504].includes(response.status)) throw new Error(`已连接 API 服务，但模型服务暂时不可用（HTTP ${response.status}）。请检查服务端的上游连接，或稍后重试。`);
      throw new Error(`模型请求失败（HTTP ${response.status}）。请检查地址、模型、密钥及服务配额。`);
    }
    if (!response.body) throw new Error('模型没有返回内容。');
    if (response.headers.get('content-type')?.includes('application/json')) {
      const body = await response.json(); state.text = body.choices?.[0]?.message?.content || ''; publish();
    } else {
      for await (const packet of readSSE(response.body)) {
        if (packet.trim() === '[DONE]') break;
        let body;
        try { body = JSON.parse(packet); } catch { throw new Error('模型返回了无法解析的流式内容。'); }
        if (body.error) throw new Error('模型服务返回错误，请检查连接设置。');
        const delta = body.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') state.text += delta;
        if (state.text.length > 150_000) throw new Error('回复超过原型的长度限制。');
        if (Date.now() - lastPublish > 45) { publish(); lastPublish = Date.now(); }
      }
    }
    if (!state.text.trim()) throw new Error('模型没有返回可显示的文字。');
  } catch (error) {
    logger?.write(controller.signal.aborted ? 'model.cancelled' : 'model.failed', { requestId: state.id, code: errorCode(error) });
    state.error = controller.signal.aborted ? (controller.signal.reason instanceof Error ? controller.signal.reason.message : '已停止生成。') : modelErrorMessage(error, settings.provider.baseUrl);
  } finally {
    logger?.write('model.finished', { requestId: state.id, elapsedMs: Date.now() - startedAt, outputLength: state.text.length });
    clearTimeout(timeout); state.busy = false; if (abort === controller) abort = undefined; publish();
  }
}
function guard(event: IpcMainInvokeEvent) {
  const allowed = [setup, toolbar, resultWindow].some(win => win && !win.isDestroyed() && win.webContents.id === event.sender.id);
  if (!allowed || event.senderFrame !== event.sender.mainFrame || !isAppPage(event.sender.getURL(), page)) throw new Error('Untrusted IPC sender');
}
function installIPC() {
  const handle = <K extends IPCChannel>(name: K, fn: (event: IpcMainInvokeEvent, ...args: IPCArgs<K>) => IPCResult<K> | Promise<IPCResult<K>>) =>
    ipcMain.handle(`glint:${name}`, (event, ...args: unknown[]) => {
      guard(event);
      // IPC is an untrusted runtime boundary. Each handler still validates its inputs.
      return fn(event, ...args as IPCArgs<K>);
    });
  const historyStore = (event: IpcMainInvokeEvent, kind: unknown) => {
    if (event.sender !== setup?.webContents) throw new Error('Settings window only');
    if (typeof kind !== 'string' || !settings.actions.some(action => recordKind(action) === kind)) throw new Error('记录类型无效。');
    return openRecordStore(kind);
  };
  handle('list-records', (event, kind, pageNumber) => historyStore(event, kind).list(pageNumber));
  handle('get-record', (event, kind, id) => historyStore(event, kind).get(id));
  handle('delete-record', (event, kind, id) => {
    const deleted = historyStore(event, kind).delete(id);
    if (result && result.recordKind === kind && result.id === id) {
      result.recorded = false;
      emit({ type: 'result', result });
    }
    emit({ type: 'records-changed', kind, deletedId: id });
    if (deleted) logger?.write('records.deleted', { kind, requestId: id });
    return deleted;
  });
  handle('copy-record', async (event, kind, id, field) => {
    const store = historyStore(event, kind);
    if (field !== 'original' && field !== 'result') throw new Error('记录字段无效。');
    const record = store.get(id);
    const text = field === 'original' ? record?.originalText : record?.resultText;
    if (!text) return false;
    await clipboard.writeText(text); return true;
  });
  handle('snapshot', () => snapshot());
  handle('save', (_event, input, keyUpdate) => {
    if (saving) return { ok: false, error: '正在保存，请稍后重试。' };
    saving = true;
    let newShortcut: string | undefined;
    try {
      const next = validateSettings(input);
      validateActionNames(next, settings);
      if (keyUpdate !== undefined && (typeof keyUpdate !== 'string' || keyUpdate.length > 4096)) throw new Error('API Key 格式无效。');
      let key = encryptedKey;
      if (keyUpdate !== undefined) {
        if (keyUpdate && !safeStorage.isEncryptionAvailable()) throw new Error('系统凭据加密暂不可用，无法保存 API Key。');
        key = keyUpdate ? safeStorage.encryptString(keyUpdate).toString('base64') : '';
      }
      if (next.shortcut !== settings.shortcut || !status.shortcutReady) {
        if (!registerShortcut(next.shortcut)) throw new Error('快捷键无效或已被其他应用占用。');
        newShortcut = next.shortcut;
      }
      persist(next, key);
      if (newShortcut && settings.shortcut !== newShortcut) globalShortcut.unregister(settings.shortcut);
      const selectionMethodChanged = next.selectionMethod !== settings.selectionMethod;
      settings = next; encryptedKey = key; status.shortcutReady = true;
      initializeRecordStores(settings.actions);
      // Discard in-flight results acquired with the previous retrieval strategy.
      if (selectionMethodChanged) { selection = undefined; startHost(); } else configureHost();
      dismissToolbar(); updateTray(); broadcast();
      return { ok: true };
    } catch (error) {
      if (newShortcut) globalShortcut.unregister(newShortcut);
      return { ok: false, error: error instanceof Error ? error.message : '保存失败。' };
    } finally { saving = false; }
  });
  handle('demo', () => showDemo());
  handle('fit-toolbar', (event, id, measuredWidth, measuredHeight) => {
    if (event.sender !== toolbar?.webContents || !selection || id !== toolbarSelectionId || id !== selection.id || quitting) return;
    if (!Number.isFinite(measuredWidth) || !Number.isFinite(measuredHeight)) return;
    const area = screen.getDisplayNearestPoint(selection).workArea;
    const width = Math.min(740, area.width - 16, Math.max(160, Math.ceil(measuredWidth)));
    const height = Math.min(120, Math.max(56, Math.ceil(measuredHeight)));
    toolbar.setBounds({ ...placeToolbar(selection, area, width, height), width, height });
    toolbar.showInactive();
    toolbar.setAlwaysOnTop(true, 'screen-saver');
  });
  handle('run', async (event, id, selectionId) => {
    if (event.sender !== toolbar?.webContents || !toolbar.isVisible() || !Number.isSafeInteger(selectionId)
      || selectionId !== toolbarSelectionId || selectionId !== selection?.id) {
      return { ok: false, error: '选区已更新或浮条已关闭，请重新划词。' };
    }
    try { await runAction(id); return { ok: true }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : '操作失败。' }; }
  });
  handle('settings', () => { dismissToolbar(); openSettings(); });
  handle('settings-window', (event, action) => {
    if (event.sender !== setup?.webContents) throw new Error('Settings window only');
    if (action === 'minimize') setup.minimize();
    else if (action === 'maximize') { if (setup.isMaximized()) setup.unmaximize(); else setup.maximize(); }
    else if (action === 'close') setup.close();
    else throw new Error('Invalid window action');
  });
  handle('dismiss', event => { if (event.sender === resultWindow?.webContents) resultWindow.close(); else dismissToolbar(); });
  handle('cancel', () => abort?.abort('cancelled'));
  handle('retry-result', event => {
    if (event.sender !== resultWindow?.webContents) throw new Error('Result window only');
    if (!result || result.busy || resultPrompt === undefined) return;
    const controller = new AbortController(); abort = controller;
    const state: ResultState = { ...result, text: '', error: undefined, busy: true, recorded: false };
    result = state;
    emit({ type: 'result', result: state });
    void generate(resultPrompt, state.source, state, controller);
  });
  handle('copy-result', () => { if (!result?.text) return false; clipboard.writeText(result.text); return true; });
  handle('record-source', (event, resultId) => {
    if (event.sender !== resultWindow?.webContents) throw new Error('Result window only');
    if (!result || resultId !== result.id) return { ok: false, error: '卡片已更新，请重新点击记录。' };
    if (!result.recordKind) return { ok: false, error: '仅指令动作支持记录。' };
    if (result.busy || !result.text.trim()) return { ok: false, error: '请等待生成结束，且有结果正文后再记录。' };
    try {
      const records = openRecordStore(result.recordKind);
      records.save(result.id, result.source, result.text, result.app);
      logger?.write('records.saved', { kind: result.recordKind, requestId: result.id, saved: true });
      result.recorded = true;
      emit({ type: 'result', result });
      emit({ type: 'records-changed', kind: result.recordKind });
      return { ok: true };
    } catch (error) {
      logger?.write('records.failed', { kind: result.recordKind, code: errorCode(error) });
      return { ok: false, error: '记录失败，请检查数据库目录的写入权限、磁盘空间或文件占用。' };
    }
  });
  handle('restart', () => startHost());
  handle('quit', () => app.quit());
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  try { logger = new AppLogger(paths.logs); }
  catch { console.error('Glint 无法初始化运行日志目录。'); }
  if (logger && !logger.write('app.started', { version: app.getVersion() })) console.error('Glint 无法写入运行日志。');
  app.on('second-instance', openSettings);
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; abort?.abort(); clearTimeout(captureTimer); globalShortcut.unregisterAll(); host?.kill(); });
  app.on('will-quit', () => { closeRecordStores(); logger?.write('app.stopped'); });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    if (logger) app.setAppLogsPath(paths.logs);
    if (smoke) { settings.shortcut = 'CommandOrControl+Alt+Shift+F12'; settings.trigger = 'shortcut'; }
    else load();
    initializeRecordStores(settings.actions);
    installIPC();
    tray = new Tray(createIcon(32)); tray.setToolTip('Glint · 选中文字，即刻行动'); tray.on('click', openSettings); updateTray();
    status.shortcutReady = registerShortcut(settings.shortcut);
    if (!status.shortcutReady) diagnose('快捷键注册失败，请在触发设置中修改。');
    startHost(); openSettings();
    if (smoke) {
      try {
        if (packageCheck) await runPackageCheck(applicationRuntime());
        else if (GLINT_TEST_BUILD) {
          const { runSmoke } = await import('../tests/electron/smoke');
          await runSmoke(applicationRuntime(), process.env.GLINT_SMOKE_SCENARIO || 'ui');
        }
        fs.mkdirSync(path.join(testRoot, 'work'), { recursive: true });
        fs.writeFileSync(path.join(testRoot, 'work', 'smoke-success.json'), JSON.stringify({ packaged: app.isPackaged, check: packageCheck ? 'startup' : 'full', version: app.getVersion() }));
        quitting = true; closeRecordStores(); host?.kill(); app.exit(0);
      }
      catch (error) { console.error(error); fs.mkdirSync(path.join(testRoot, 'work'), { recursive: true }); fs.writeFileSync(path.join(testRoot, 'work', 'smoke-error.txt'), error instanceof Error ? error.stack || error.message : String(error)); quitting = true; host?.kill(); app.exit(1); }
      finally { host?.kill(); }
    }
  }).catch(error => { logger?.write('app.start-failed', { code: errorCode(error) }); console.error(error); app.exit(1); });
}

// Internal runtime seam for startup probes and the separately built test runner.
function applicationRuntime() {
  return {
    get broadcast() { return broadcast; },
    get capturePending() { return capturePending; },
    get captureSelection() { return captureSelection; },
    get configPath() { return configPath; },
    get configureHost() { return configureHost; },
    get dismissToolbar() { return dismissToolbar; },
    get openRecordStore() { return openRecordStore; },
    get paths() { return paths; },
    get persist() { return persist; },
    get recordPath() { return recordPath; },
    get result() { return result; },
    get resultWindow() { return resultWindow; },
    get root() { return root; },
    get runAction() { return runAction; },
    get selection() { return selection; },
    set selection(value: typeof selection) { selection = value; },
    get settings() { return settings; },
    set settings(value: typeof settings) { settings = value; },
    get setup() { return setup; },
    get showDemo() { return showDemo; },
    get status() { return status; },
    get testRoot() { return testRoot; },
    get toolbar() { return toolbar; },
    get tray() { return tray; }
  };
}
export type ApplicationRuntime = ReturnType<typeof applicationRuntime>;
