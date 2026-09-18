import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeImage, safeStorage, screen, shell, Tray, utilityProcess } from 'electron';
import type { IpcMainInvokeEvent, UtilityProcess } from 'electron';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { RecordStore } from './records';
import { AppLogger, errorCode } from './logger';
import { runtimePaths } from './runtime-paths';
import { pathToFileURL } from 'node:url';
import type { TextSelectionData } from 'selection-hook';
import { defaults, endpoint, modelErrorMessage, placeToolbar, readSSE, recordKind, validateSettings } from './core';
import type { RecordKind, ResultState, Selection, Settings, Snapshot, Status, UIEvent } from './core';

const smoke = process.argv.includes('--smoke');
const root = app.getAppPath();
app.setName('Glint');
if (process.platform === 'win32') app.setAppUserModelId('Glint');
app.setPath('userData', smoke ? path.join(root, 'work', 'smoke-profile') : path.join(app.getPath('appData'), 'Glint'));
if (smoke) app.commandLine.appendSwitch('force-renderer-accessibility');
const page = path.join(__dirname, 'index.html');
const preload = path.join(__dirname, 'preload.cjs');
const configPath = path.join(app.getPath('userData'), 'settings.json');
const paths = runtimePaths(root, process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), smoke);
const recordsFolder = paths.data;
let logger: AppLogger | undefined;
const recordsPaths: Record<RecordKind, string> = {
  translation: path.join(recordsFolder, 'translations.sqlite'),
  polishing: path.join(recordsFolder, 'polishing.sqlite')
};
const recordStores: Partial<Record<RecordKind, RecordStore>> = {};
function openRecordStore(kind: RecordKind): RecordStore {
  if (recordStores[kind]) return recordStores[kind];
  const store = new RecordStore(recordsPaths[kind]);
  try {
    if (!smoke) {
      const imported = store.migrateFrom(path.join(root, 'work', path.basename(recordsPaths[kind])));
      if (imported !== undefined) logger?.write('records.migrated', { kind, imported });
    }
    recordStores[kind] = store;
    return store;
  } catch (error) { store.close(); throw error; }
}
function closeRecordStores() {
  for (const kind of Object.keys(recordStores) as RecordKind[]) { recordStores[kind]?.close(); delete recordStores[kind]; }
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
  try { const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')); settings = validateSettings(saved.settings); encryptedKey = typeof saved.encryptedKey === 'string' ? saved.encryptedKey : ''; }
  catch { diagnose('设置文件无法读取，使用默认配置；原文件仍保留。'); }
}
function secureWindow(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
}
function openSettings() {
  if (setup && !setup.isDestroyed()) { if (setup.isMinimized()) setup.restore(); setup.show(); setup.focus(); return; }
  setup = new BrowserWindow({ width: 920, height: 640, minWidth: 820, minHeight: 570, frame: false, fullscreenable: false, title: 'Glint', backgroundColor: '#f3f3f3', show: false, autoHideMenuBar: true, icon: createIcon(), webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false } });
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
  const child = utilityProcess.fork(path.join(__dirname, 'selection-host.cjs'), [], { serviceName: 'Glint Selection', stdio: 'pipe' });
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
  return nativeImage.createFromPath(path.join(__dirname, 'brand', `glint-${size}.png`));
}
function updateTray() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 Glint', click: openSettings },
    { label: settings.enabled ? '暂停划词' : '恢复划词', click: () => { settings.enabled = !settings.enabled; try { persist(settings, encryptedKey); } catch { diagnose('无法保存暂停状态。'); } configureHost(); dismissToolbar(); broadcast(); updateTray(); } },
    { type: 'separator' }, { label: '退出', click: () => app.quit() }
  ]));
}
async function getResultWindow() {
  if (resultWindow && !resultWindow.isDestroyed()) return resultWindow;
  const win = new BrowserWindow({ width: 480, height: 360, minWidth: 380, minHeight: 240, frame: false, minimizable: false, maximizable: false, fullscreenable: false, show: false, title: 'Glint · 结果', alwaysOnTop: true, autoHideMenuBar: true, backgroundColor: '#f3f3f3', icon: createIcon(), webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
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
  if (action.kind === 'copy') { clipboard.writeText(captured.text); diagnose('已复制选中文字。'); return; }
  if (action.kind === 'search') { await shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(captured.text.slice(0, 4000))}`); return; }
  abort?.abort();
  const controller = new AbortController(); abort = controller;
  const state: ResultState = { id: randomUUID(), recorded: false, recordKind: recordKind(action), actionName: action.name, actionIcon: action.icon, source: captured.text, text: '', app: captured.app, busy: true, demo: captured.demo };
  result = state;
  resultPrompt = action.prompt;
  const win = await getResultWindow();
  if (abort !== controller) return;
  broadcast(); win.show();
  void generate(action.prompt, captured.text, state, controller);
}
async function generate(prompt: string, text: string, state: ResultState, controller: AbortController) {
  const startedAt = Date.now();
  logger?.write('model.started', { requestId: state.id, kind: state.recordKind || 'other' });
  const publish = () => { if (result === state) emit({ type: 'result', result: state }); };
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
  if (!allowed || event.senderFrame !== event.sender.mainFrame || !event.sender.getURL().startsWith(pathToFileURL(page).href)) throw new Error('Untrusted IPC sender');
}
function installIPC() {
  const handle = (name: string, fn: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) => ipcMain.handle(`glint:${name}`, (event, ...args) => { guard(event); return fn(event, ...args); });
  handle('snapshot', () => snapshot());
  handle('save', (_event, input, keyUpdate) => {
    if (saving) return { ok: false, error: '正在保存，请稍后重试。' };
    saving = true;
    let newShortcut: string | undefined;
    try {
      const next = validateSettings(input);
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
      settings = next; encryptedKey = key; status.shortcutReady = true;
      configureHost(); dismissToolbar(); updateTray(); broadcast();
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
  handle('run', async (_event, id) => { try { await runAction(id); return { ok: true }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : '操作失败。' }; } });
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
    if (!result.recordKind) return { ok: false, error: '仅翻译和润色支持记录原文。' };
    if (result.busy || !result.text.trim()) return { ok: false, error: '请等待生成结束，且有结果正文后再记录。' };
    try {
      const records = openRecordStore(result.recordKind);
      records.save(result.id, result.source, result.text, result.app);
      logger?.write('records.saved', { kind: result.recordKind, requestId: result.id, saved: true });
      result.recorded = true;
      emit({ type: 'result', result });
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
  logger?.write('app.started');
  app.on('second-instance', openSettings);
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; abort?.abort(); clearTimeout(captureTimer); globalShortcut.unregisterAll(); host?.kill(); });
  app.on('will-quit', () => { closeRecordStores(); logger?.write('app.stopped'); });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    if (logger) app.setAppLogsPath(paths.logs);
    if (smoke) { settings.shortcut = 'CommandOrControl+Alt+Shift+F12'; settings.trigger = 'shortcut'; }
    else load();
    for (const kind of Object.keys(recordsPaths) as RecordKind[]) {
      try { openRecordStore(kind); }
      catch (error) {
        logger?.write('records.initialization-failed', { kind, code: errorCode(error) });
        diagnose(`${kind === 'translation' ? '翻译' : '润色'}记录数据库暂不可用，点击记录时将重新尝试。`);
      }
    }
    installIPC();
    tray = new Tray(createIcon(32)); tray.setToolTip('Glint · 选中文字，即刻行动'); tray.on('double-click', openSettings); updateTray();
    status.shortcutReady = registerShortcut(settings.shortcut);
    if (!status.shortcutReady) diagnose('快捷键注册失败，请在触发设置中修改。');
    startHost(); openSettings();
    if (smoke) {
      try { await runSmoke(); quitting = true; host?.kill(); app.exit(0); }
      catch (error) { console.error(error); fs.mkdirSync(path.join(root, 'work'), { recursive: true }); fs.writeFileSync(path.join(root, 'work', 'smoke-error.txt'), String(error)); quitting = true; host?.kill(); app.exit(1); }
      finally { host?.kill(); }
    }
  }).catch(error => { logger?.write('app.start-failed', { code: errorCode(error) }); console.error(error); app.exit(1); });
}

async function runSmoke() {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (condition: () => boolean, description: string) => { const end = Date.now() + 15000; while (!condition()) { if (Date.now() > end) throw new Error(`Timeout: ${description}`); await wait(60); } };
  const folder = path.join(root, 'work'); fs.mkdirSync(folder, { recursive: true });
  await until(() => status.hook === 'ready' || status.hook === 'error', 'native hook');
  assert.equal(status.hook, 'ready', status.message);
  await until(() => !!setup && !setup.webContents.isLoading(), 'settings page');
  await wait(500);
  assert.ok(await setup!.webContents.executeJavaScript("document.querySelector('[data-page=actions]')"));
  assert.deepEqual(await setup!.webContents.executeJavaScript(`({
    drag: getComputedStyle(document.querySelector('.settings-titlebar')).getPropertyValue('-webkit-app-region'),
    controls: getComputedStyle(document.querySelector('.window-controls')).getPropertyValue('-webkit-app-region'),
    count: document.querySelectorAll('[data-window]').length
  })`), { drag: 'drag', controls: 'no-drag', count: 3 });
  await setup!.webContents.executeJavaScript("document.querySelector('[data-window=maximize]').click()");
  await until(() => !!setup?.isMaximized(), 'custom settings maximize');
  await wait(150);
  assert.equal(await setup!.webContents.executeJavaScript("document.querySelector('[data-window=maximize]').getAttribute('aria-label')"), '向下还原');
  await setup!.webContents.executeJavaScript("document.querySelector('[data-window=maximize]').click()");
  await until(() => !setup?.isMaximized(), 'custom settings restore');
  await setup!.webContents.executeJavaScript("document.querySelector('[data-window=minimize]').click()");
  await until(() => !!setup?.isMinimized(), 'custom settings minimize');
  openSettings();
  await until(() => !!setup?.isVisible() && !setup.isMinimized(), 'reopen minimized settings');
  await setup!.webContents.executeJavaScript("document.querySelector('[data-window=close]').click()");
  await until(() => !setup, 'custom settings close');
  assert.ok(tray && !tray.isDestroyed(), 'closing settings keeps the tray available');
  openSettings();
  await until(() => !!setup?.isVisible() && !setup.webContents.isLoading(), 'reopen closed settings');
  await wait(300);
  await fs.promises.writeFile(path.join(folder, 'settings.png'), (await setup!.webContents.capturePage()).toPNG());
  for (const [selector, name] of [['input[data-action-field=name]', 'input-focus-dark'], ['textarea[data-action-field=prompt]', 'textarea-focus-dark']]) {
    await setup!.webContents.executeJavaScript(`document.querySelector('${selector}').focus()`);
    await fs.promises.writeFile(path.join(folder, `${name}.png`), (await setup!.webContents.capturePage()).toPNG());
  }
  assert.ok(await setup!.webContents.executeJavaScript("CSS.supports('appearance', 'base-select')"), 'Electron must support styled native selects');
  await setup!.webContents.executeJavaScript("const kind = document.querySelector('select[data-action-field=kind]'); kind.focus(); kind.showPicker();", true);
  await wait(150);
  await fs.promises.writeFile(path.join(folder, 'dropdown-dark.png'), (await setup!.webContents.capturePage()).toPNG());
  for (const keyCode of ['Down', 'Return']) {
    setup!.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    setup!.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  }
  await wait(150);
  assert.equal(await setup!.webContents.executeJavaScript("document.querySelector('select[data-action-field=kind]').value"), 'copy', 'Arrow and Enter must update the action type');
  await setup!.webContents.executeJavaScript("document.querySelector('[data-revert]').click()");
  const actionCount = settings.actions.length;
  await setup!.webContents.executeJavaScript("document.querySelector('[data-add]').click(); document.querySelector('[data-open-icon-picker]').click();");
  await wait(300);
  assert.equal(await setup!.webContents.executeJavaScript("document.querySelectorAll('[data-pick-icon]').length"), 32);
  assert.ok(await setup!.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-icon-tab=all]').click();
    const first = document.querySelector('[data-pick-icon]').dataset.pickIcon;
    document.querySelector('[data-picker-next]').click();
    const changed = document.querySelector('[data-pick-icon]').dataset.pickIcon !== first;
    document.querySelector('[data-icon-tab=common]').click();
    return changed;
  })()`), 'Full icon catalog should paginate');
  await fs.promises.writeFile(path.join(folder, 'icon-picker.png'), (await setup!.webContents.capturePage()).toPNG());
  assert.ok(await setup!.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[data-icon-search]');
    input.value = '翻译'; input.dispatchEvent(new Event('input', { bubbles: true }));
    return !!document.querySelector('[data-pick-icon="languages"]');
  })()`), 'Chinese icon search should find translation');
  const longIcon = 'triangles-centerline-dashed-horizontal';
  await setup!.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[data-icon-search]');
    input.value = '${longIcon}'; input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-pick-icon="${longIcon}"]').click();
    document.querySelector('[data-save]').click();
  })()`);
  await until(() => settings.actions.length === actionCount + 1 && settings.actions.at(-1)?.icon === longIcon, 'new action icon save');
  assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).settings.actions.at(-1).icon, longIcon);
  await wait(100);
  await setup!.webContents.executeJavaScript("document.querySelector('[data-delete]').click(); document.querySelector('[data-save]').click();");
  await until(() => settings.actions.length === actionCount, 'remove temporary action');
  await wait(100);
  await setup!.webContents.executeJavaScript("document.querySelector('[data-page=appearance]').click(); document.querySelector('[data-theme=light]').click();");
  for (const tab of ['actions', 'model', 'triggers', 'appearance']) {
    await setup!.webContents.executeJavaScript(`document.querySelector('[data-page=${tab}]').click()`);
    await wait(100);
    await fs.promises.writeFile(path.join(folder, `${tab}-light.png`), (await setup!.webContents.capturePage()).toPNG());
    if (tab === 'actions') {
      await setup!.webContents.executeJavaScript("document.querySelector('input[data-action-field=name]').focus()");
      await fs.promises.writeFile(path.join(folder, 'input-focus-light.png'), (await setup!.webContents.capturePage()).toPNG());
      await setup!.webContents.executeJavaScript("document.querySelector('select[data-action-field=kind]').showPicker()", true);
      await wait(150);
      await fs.promises.writeFile(path.join(folder, 'dropdown-light.png'), (await setup!.webContents.capturePage()).toPNG());
      setup!.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      setup!.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await wait(60);
      assert.equal(await setup!.webContents.executeJavaScript("document.querySelector('select').matches(':open')"), false, 'Escape must close the dropdown');
    }
  }
  setup!.setSize(820, 570);
  await setup!.webContents.executeJavaScript("document.querySelector('[data-page=actions]').click()");
  await wait(100);
  await fs.promises.writeFile(path.join(folder, 'settings-small.png'), (await setup!.webContents.capturePage()).toPNG());
  setup!.setSize(920, 640);
  await setup!.webContents.executeJavaScript("document.querySelector('[data-revert]').click()");
  await wait(250);
  const fixtureText = 'Glint native selection fixture';
  const fixture = new BrowserWindow({ width: 500, height: 260, show: false, title: 'Glint native selection test', webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
  try {
    await fixture.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<textarea style="width:90%;height:100px" aria-label="Selection fixture">${fixtureText}</textarea>`));
    fixture.show(); fixture.focus(); fixture.webContents.focus();
    await until(() => fixture.isFocused(), 'selection fixture focus');
    await fixture.webContents.executeJavaScript("const input = document.querySelector('textarea'); input.focus(); input.select();");
    await wait(750);
    captureSelection();
    await until(() => !capturePending, 'native selection capture');
    assert.equal(selection?.text, fixtureText, 'Native UI Automation should read the controlled selection');
    assert.equal(selection?.demo, false);
    dismissToolbar();
  } finally { fixture.destroy(); }
  const { createServer } = await import('node:http');
  let received = '';
  let requestCount = 0;
  let responseStatus = 200;
  let responseDelay = 80;
  const server = createServer((req, res) => {
    let requestBody = '';
    req.on('data', chunk => { requestBody += chunk; });
    req.on('end', () => {
      received = requestBody; requestCount++;
      if (responseStatus !== 200) { res.writeHead(responseStatus, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Glint 流式"}}]}\n\n');
      const completion = setTimeout(() => res.end('data: {"choices":[{"delta":{"content":"测试成功。"}}]}\n\ndata: [DONE]\n\n'), responseDelay);
      res.on('close', () => clearTimeout(completion));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const next = structuredClone(settings); next.provider = { baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'local-test' };
    const saved = await setup!.webContents.executeJavaScript(`window.glint.save(${JSON.stringify(next)})`);
    assert.equal(saved.ok, true, saved.error);
    await showDemo(); await wait(350);
    assert.ok(toolbar?.isVisible());
    assert.equal(toolbar!.isFocusable(), false);
    assert.equal(await toolbar!.webContents.executeJavaScript("document.querySelectorAll('[data-run]').length"), next.actions.filter(a => a.enabled).length);
    await fs.promises.writeFile(path.join(folder, 'toolbar.png'), (await toolbar!.webContents.capturePage()).toPNG());
    const readToolbarLayout = () => toolbar!.webContents.executeJavaScript(`(() => {
      const actions = document.querySelector('.bar-actions');
      const copy = document.querySelector('[data-run="copy"]').getBoundingClientRect();
      return { viewport: actions.clientWidth, content: actions.scrollWidth, copyRight: copy.right, viewportRight: actions.getBoundingClientRect().right, x: copy.x + copy.width / 2, y: copy.y + copy.height / 2 };
    })()`);
    const toolbarLayout = await readToolbarLayout();
    assert.ok(toolbarLayout.copyRight <= toolbarLayout.viewportRight + 0.5, 'Copy button clipped: ' + JSON.stringify(toolbarLayout));
    toolbar!.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(toolbarLayout.x), y: Math.round(toolbarLayout.y) });
    await wait(100);
    await fs.promises.writeFile(path.join(folder, 'toolbar-copy-hover.png'), (await toolbar!.webContents.capturePage()).toPNG());
    setup!.hide();
    assert.equal(await toolbar!.webContents.executeJavaScript("document.querySelectorAll('[data-open-settings]').length"), 1);
    await toolbar!.webContents.executeJavaScript("document.querySelector('button.mini-brand[data-open-settings]').click()");
    await until(() => !!setup?.isVisible() && !toolbar?.isVisible(), 'brand button opens settings and dismisses toolbar');
    for (const density of ['comfortable', 'compact'] as const) {
      settings = structuredClone(next); settings.density = density;
      settings.actions.find(a => a.id === 'copy')!.name = '复制 WMWM';
      await showDemo(); await wait(150);
      const layout = await readToolbarLayout();
      assert.ok(layout.copyRight <= layout.viewportRight + 0.5, `Copy button clipped (${density}): ${JSON.stringify(layout)}`);
    }
    dismissToolbar(); broadcast(); await wait(100);
    assert.equal(toolbar!.isVisible(), false, 'A stale measurement must not reopen a dismissed toolbar');
    settings = structuredClone(next);
    await showDemo(); await wait(150);
    await runAction('translate');
    await until(() => !!result && !result.busy, 'streaming response');
    assert.equal(result!.text, 'Glint 流式测试成功。');
    assert.equal(result!.error, undefined);
    assert.equal(JSON.parse(received).model, 'local-test');
    assert.ok(JSON.parse(received).messages[0].content.includes('Good tools'));
    await wait(250);
    assert.equal(resultWindow!.isMaximizable(), false);
    assert.equal(resultWindow!.isMinimizable(), false);
    const resultLayout = await resultWindow!.webContents.executeJavaScript(`(() => {
      const footer = [...document.querySelectorAll('.result-footer button')];
      return {
        action: document.querySelector('.result-action').textContent.trim(),
        app: document.querySelector('.result-app').textContent.trim(),
        controls: footer.map(button => button.id),
        stopDisabled: document.querySelector('#result-stop').disabled,
        retryDisabled: document.querySelector('#result-retry').disabled,
        copyDisabled: document.querySelector('#result-copy').disabled,
        recordPrimary: document.querySelector('#result-record').classList.contains('primary'),
        copySecondary: document.querySelector('#result-copy').classList.contains('secondary'),
        settingsButtons: document.querySelectorAll('[data-open-settings]').length,
        draggable: getComputedStyle(document.querySelector('.result-header')).getPropertyValue('-webkit-app-region'),
        closeClickable: getComputedStyle(document.querySelector('.result-close')).getPropertyValue('-webkit-app-region')
      };
    })()`);
    assert.equal(resultLayout.action, '翻译');
    assert.equal(resultLayout.app, 'Glint 体验区');
    assert.deepEqual(resultLayout.controls, ['result-stop', 'result-retry', 'result-copy', 'result-record']);
    assert.equal(resultLayout.stopDisabled, true);
    assert.equal(resultLayout.retryDisabled, false);
    assert.equal(resultLayout.copyDisabled, false);
    assert.equal(resultLayout.recordPrimary, true);
    assert.equal(resultLayout.copySecondary, true);
    assert.equal(resultLayout.settingsButtons, 0);
    assert.equal(resultLayout.draggable, 'drag');
    assert.equal(resultLayout.closeClickable, 'no-drag');
    await fs.promises.writeFile(path.join(folder, 'result.png'), (await resultWindow!.webContents.capturePage()).toPNG());
    settings.theme = 'light'; broadcast(); await wait(100);
    await fs.promises.writeFile(path.join(folder, 'result-light.png'), (await resultWindow!.webContents.capturePage()).toPNG());
    resultWindow!.setSize(380, 240);
    const originalApp = result!.app; result!.app = 'a-very-long-source-application-name.exe'; broadcast(); await wait(100);
    await fs.promises.writeFile(path.join(folder, 'result-small.png'), (await resultWindow!.webContents.capturePage()).toPNG());
    result!.app = originalApp; resultWindow!.setSize(480, 360);
    const previousCardId = result!.id;
    responseDelay = 10_000;
    await runAction('translate');
    await until(() => !!result?.busy && !!result.text, 'partial response for cancellation');
    await wait(100);
    assert.equal(await resultWindow!.webContents.executeJavaScript("document.querySelector('#result-retry').disabled"), true);
    selection = { ...selection!, text: 'A different selection after the card was opened.' };
    const { DatabaseSync } = await import('node:sqlite');
    assert.equal(await resultWindow!.webContents.executeJavaScript("document.querySelector('#result-record').disabled"), true);
    assert.equal((await resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(result!.id)})`)).ok, false, 'generation in progress cannot save a partial result');
    await resultWindow!.webContents.executeJavaScript("document.querySelector('[data-cancel]').click()");
    await until(() => !result?.busy, 'stop button cancels generation');
    await wait(100);
    const recordReader = new DatabaseSync(recordsPaths.translation, { readOnly: true });
    try {
      assert.equal(recordReader.prepare('SELECT id FROM records WHERE id = ?').get(result!.id), undefined, 'original text is not automatically recorded');
      assert.equal((await resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(previousCardId)})`)).ok, false, 'stale cards cannot save a new selection');
      await resultWindow!.webContents.executeJavaScript("document.querySelector('[data-record-source]').click()");
      await until(() => !!result?.recorded, 'record original and partial result after stopping');
      assert.equal((await resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(result!.id)})`)).ok, true);
      const row = recordReader.prepare('SELECT original_text, result_text, process_name FROM records WHERE id = ?').get(result!.id)!;
      assert.equal(row.original_text, result!.source, 'record stores the card original, not new selection');
      assert.equal(row.result_text, result!.text);
      assert.equal(row.process_name, result!.app);
      assert.equal(recordReader.prepare('SELECT count(*) AS count FROM records WHERE id = ?').get(result!.id)!.count, 1);
      assert.equal(await setup!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(result!.id)}).then(() => false, () => true)`), true, 'only result window may record');
    } finally { recordReader.close(); }
    await resultWindow!.webContents.executeJavaScript("document.querySelector('[data-cancel]').click()");
    await until(() => !result?.busy, 'stop button cancels generation');
    assert.equal(result!.error, '已停止生成。');
    assert.equal(result!.text, 'Glint 流式');
    const originalSource = result!.source;
    const originalMessage = JSON.parse(received).messages[0].content;
    selection = { ...selection!, text: 'A different selection after the card was opened.' };
    settings.actions.find(action => action.id === 'translate')!.prompt = 'A different instruction: {text}';
    responseStatus = 503;
    await wait(100);
    await resultWindow!.webContents.executeJavaScript("document.querySelector('[data-retry-result]').click()");
    await until(() => !!result?.error?.includes('HTTP 503') && !result.busy, 'retry after stopping displays service failure');
    assert.equal(result!.text, '');
    responseStatus = 200; responseDelay = 80;
    const requestsBeforeRetry = requestCount;
    await resultWindow!.webContents.executeJavaScript("Promise.all([window.glint.retryResult(), window.glint.retryResult()])");
    await until(() => !!result && !result.busy, 'retry after failure completes');
    assert.equal(requestCount, requestsBeforeRetry + 1, 'duplicate retry cannot start concurrent requests');
    assert.equal(result!.source, originalSource, 'retry keeps the card selection');
    assert.equal(JSON.parse(received).messages[0].content, originalMessage, 'retry keeps the original instruction');
    assert.equal(result!.text, 'Glint 流式测试成功。');
    assert.equal(result!.error, undefined);
    assert.equal(result!.recorded, false, 'new result can update the existing saved card');
    await wait(100);
    await resultWindow!.webContents.executeJavaScript("document.querySelector('[data-record-source]').click()");
    await until(() => !!result?.recorded, 'updated result saved');
    const updatedDb = new DatabaseSync(recordsPaths.translation, { readOnly: true });
    try {
      assert.equal(updatedDb.prepare('SELECT result_text FROM records WHERE id = ?').get(result!.id)!.result_text, 'Glint 流式测试成功。');
      assert.equal(updatedDb.prepare('SELECT count(*) AS count FROM records WHERE id = ?').get(result!.id)!.count, 1);
    } finally { updatedDb.close(); }
    const translationCardId = result!.id;
    await runAction('polish');
    await until(() => !!result && !result.busy, 'polishing response');
    await wait(100);
    assert.equal(result!.recordKind, 'polishing');
    const polishingCardId = result!.id;
    const lockedDb = new DatabaseSync(recordsPaths.polishing);
    try {
      lockedDb.exec('BEGIN IMMEDIATE');
      const failedSave = await resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(polishingCardId)})`);
      assert.equal(failedSave.ok, false, 'write failures must not report success');
      assert.equal(result!.recorded, false);
    } finally { lockedDb.exec('ROLLBACK'); lockedDb.close(); }
    await resultWindow!.webContents.executeJavaScript("document.querySelector('[data-record-source]').click()");
    await until(() => !!result?.recorded, 'polishing record saved');
    for (const kind of Object.keys(recordsPaths) as RecordKind[]) {
      const db = new DatabaseSync(recordsPaths[kind], { readOnly: true });
      try {
        const ownId = kind === 'translation' ? translationCardId : polishingCardId;
        const otherId = kind === 'translation' ? polishingCardId : translationCardId;
        assert.ok(db.prepare('SELECT id FROM records WHERE id = ?').get(ownId), 'record is in its own database');
        assert.equal(db.prepare('SELECT id FROM records WHERE id = ?').get(otherId), undefined, 'databases are isolated');
        if (kind === 'polishing') {
          const row = db.prepare('SELECT original_text, result_text, process_name FROM records WHERE id = ?').get(ownId)!;
          assert.equal(row.original_text, result!.source);
          assert.equal(row.result_text, result!.text);
          assert.equal(row.process_name, result!.app);
        }
      } finally { db.close(); }
    }
    await runAction('explain');
    await until(() => !!result && !result.busy, 'explanation response');
    await wait(100);
    assert.equal(await resultWindow!.webContents.executeJavaScript("document.querySelector('[data-record-source]') === null"), true, 'explanation has no record button');
    assert.equal((await resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(result!.id)})`)).ok, false, 'non-recordable actions are rejected by main process');
    await resultWindow!.webContents.executeJavaScript("document.querySelector('[data-close-result]').click()");
    await until(() => !resultWindow, 'custom close button closes the result card');
    settings = structuredClone(defaults); persist(settings, ''); configureHost();
    const report = { passed: true, nativeHook: status.hook, shortcut: status.shortcutReady, checks: ['native module loads and starts', 'native UI Automation reads a controlled textarea selection', 'sandboxed UI bridge', 'settings save', 'non-focusable toolbar', 'configured actions render', 'copy button fully visible with default and mixed-width names in both densities', 'dismissed toolbar stays hidden after layout messages', 'OpenAI-compatible local SSE end-to-end'], memory: app.getAppMetrics().map(m => ({ type: m.type, memory: m.memory })), note: 'Live selection in third-party applications requires manual verification. Memory is a test-session snapshot with open windows, not an idle benchmark.' };
    fs.writeFileSync(path.join(folder, 'smoke-report.json'), JSON.stringify(report, null, 2));
    console.log('Glint smoke passed:', report.checks.join(', '));
  } finally { server.close(); host?.kill(); closeRecordStores(); }
}
