export type ActionKind = 'ai' | 'search';
export interface Action { id: string; name: string; englishName: string; icon: string; kind: ActionKind; prompt: string; enabled: boolean }
export interface Settings {
  version: 1;
  enabled: boolean;
  trigger: 'automatic' | 'shortcut';
  shortcut: string;
  selectionMethod: 'accessibility' | 'clipboard' | 'auto';
  excludedApps: string[];
  theme: 'light' | 'dark' | 'system';
  accent: 'blue' | 'violet' | 'teal' | 'amber';
  density: 'comfortable' | 'compact';
  provider: { baseUrl: string; model: string };
  actions: Action[];
}
export interface Selection { id: number; text: string; app: string; method: string; x: number; y: number; demo: boolean }
export interface Diagnostic { time: string; message: string }
export interface Status { hook: 'starting' | 'ready' | 'paused' | 'error'; message: string; shortcutReady: boolean; lastSelection?: { app: string; method: string; length: number }; events: Diagnostic[] }
export type DesktopPlatform = 'windows' | 'linux-x11' | 'linux-wayland' | 'unsupported';
export interface Snapshot { platform: DesktopPlatform; settings: Settings; hasKey: boolean; status: Status; selection?: Selection; result?: ResultState; settingsMaximized: boolean }
export type RecordKind = string;
export interface RecordSummary { id: string; preview: string; processName: string; createdAt: string }
export interface SavedRecord { id: string; originalText: string; resultText: string; processName: string; createdAt: string }
export interface RecordPage { items: RecordSummary[]; total: number; page: number; pageSize: number }
export function recordKind(action: Action): RecordKind | undefined {
  return action.kind === 'ai' ? action.englishName : undefined;
}
export function validEnglishName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(value)
    && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9]|translations)$/.test(value);
}
export function recordFilename(kind: string): string {
  if (!validEnglishName(kind)) throw new Error('记录英文名称无效。');
  // Preserve the filename used by earlier releases.
  return kind === 'translation' ? 'translations.sqlite' : `${kind}.sqlite`;
}
export function validateActionNames(next: Settings, previous: Settings): void {
  for (const action of next.actions) {
    const saved = previous.actions.find(item => item.id === action.id);
    if (saved && saved.englishName !== action.englishName) throw new Error('已保存动作的英文名称不可修改；显示名称可随时调整。');
  }
}
export interface ResultState { id: string; recorded: boolean; recordKind?: RecordKind; actionName: string; actionIcon: string; text: string; source: string; app: string; busy: boolean; error?: string; demo: boolean }
export type UIEvent = { type: 'snapshot'; snapshot: Snapshot } | { type: 'result'; result: ResultState } | { type: 'settings-window'; maximized: boolean } | { type: 'records-changed'; kind: RecordKind; deletedId?: string };
export interface GlintAPI {
  snapshot(): Promise<Snapshot>;
  save(settings: Settings, keyUpdate?: string): Promise<{ ok: boolean; error?: string }>;
  demo(): Promise<void>;
  fitToolbar(selectionId: number, width: number, height: number): Promise<void>;
  run(actionId: string, selectionId: number): Promise<{ ok: boolean; error?: string }>;
  openSettings(): Promise<void>;
  settingsWindow(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
  dismiss(): Promise<void>;
  cancel(): Promise<void>;
  retryResult(): Promise<void>;
  copyResult(): Promise<boolean>;
  recordSource(resultId: string): Promise<{ ok: boolean; error?: string }>;
  listRecords(kind: RecordKind, page: number): Promise<RecordPage>;
  getRecord(kind: RecordKind, id: string): Promise<SavedRecord | undefined>;
  copyRecord(kind: RecordKind, id: string, field: 'original' | 'result'): Promise<boolean>;
  deleteRecord(kind: RecordKind, id: string): Promise<boolean>;
  restart(): Promise<void>;
  quit(): Promise<void>;
  subscribe(callback: (event: UIEvent) => void): () => void;
}
export const defaults: Settings = {
  version: 1, enabled: true, trigger: 'automatic', shortcut: 'CommandOrControl+Alt+G',
  selectionMethod: 'accessibility', excludedApps: ['WindowsTerminal.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe'],
  theme: 'system', accent: 'blue', density: 'comfortable',
  provider: { baseUrl: 'https://api.openai.com/v1', model: '' },
  actions: [
    { id: 'translate', englishName: 'translation', name: '翻译', icon: 'languages', kind: 'ai', prompt: '将以下文字翻译成自然、准确的简体中文；如果原文是中文，则翻译成英文。仅输出译文。\n\n{text}', enabled: true },
    { id: 'explain', englishName: 'explanation', name: '解释', icon: 'sparkles', kind: 'ai', prompt: '请用简洁的中文解释以下内容，保留必要的技术细节：\n\n{text}', enabled: true },
    { id: 'polish', englishName: 'polishing', name: '润色', icon: 'pen', kind: 'ai', prompt: '润色以下文字，使其清晰、自然，保持原语言和原意。仅输出修改后的文字。\n\n{text}', enabled: true },
    { id: 'search', englishName: 'search', name: '搜索', icon: 'search', kind: 'search', prompt: '', enabled: true }
  ]
};

// Disk loading migrates retired actions and fills missing English names once.
export function migrateSettings(input: unknown): Settings {
  if (!input || typeof input !== 'object') return validateSettings(input);
  const saved = input as Record<string, unknown>;
  if (!Array.isArray(saved.actions)) return validateSettings(input);
  const isCopy = (action: unknown) => !!action && typeof action === 'object' && (action as Record<string, unknown>).kind === 'copy';
  let actions = saved.actions.filter(action => !isCopy(action));
  if (!actions.length && saved.actions.some(isCopy)) actions = structuredClone(defaults.actions);
  else if (saved.actions.some(isCopy) && actions.every(action => action && typeof action === 'object' && action.enabled === false)) {
    actions = actions.map((action, index) => index === 0 ? { ...action, enabled: true } : action);
  }
  const used = new Set(actions.map(action => action?.englishName).filter(Boolean));
  let counter = 1;
  actions = actions.map(action => {
    if (!action || typeof action !== 'object' || action.englishName !== undefined) return action;
    let englishName = defaults.actions.find(item => item.id === action.id)?.englishName;
    if (!englishName || used.has(englishName)) {
      do { englishName = `action_user_${counter++}`; } while (used.has(englishName));
    }
    used.add(englishName);
    return { ...action, englishName };
  });
  const selectionMethod = saved.selectionMethod ?? (saved.clipboardFallback === true ? 'auto' : 'accessibility');
  return validateSettings({ ...saved, actions, selectionMethod });
}

export function validateSettings(input: unknown): Settings {
  if (!input || typeof input !== 'object') throw new Error('设置格式无效。');
  const s = input as Settings;
  const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
  if (s.version !== 1 || typeof s.enabled !== 'boolean') throw new Error('设置版本或开关无效。');
  if (!['accessibility', 'clipboard', 'auto'].includes(s.selectionMethod)) throw new Error('取词方式无效。');
  if (!['automatic', 'shortcut'].includes(s.trigger) || !['light', 'dark', 'system'].includes(s.theme) || !['blue', 'violet', 'teal', 'amber'].includes(s.accent) || !['comfortable', 'compact'].includes(s.density)) throw new Error('设置选项无效。');
  if (!text(s.shortcut, 80) || !s.shortcut.trim()) throw new Error('请填写快捷键。');
  if (!Array.isArray(s.excludedApps) || s.excludedApps.length > 100 || !s.excludedApps.every(v => text(v, 100) && v.trim())) throw new Error('应用排除列表无效。');
  if (!s.provider || !text(s.provider.baseUrl, 500) || !text(s.provider.model, 200)) throw new Error('模型配置无效。');
  const url = new URL(s.provider.baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('API 地址须为 HTTP(S) 地址，不包含密码、查询参数或片段。');
  if (!Array.isArray(s.actions) || s.actions.length < 1 || s.actions.length > 12) throw new Error('请保留 1–12 个动作。');
  const ids = new Set<string>();
  const englishNames = new Set<string>();
  for (const a of s.actions) {
    if (!a || !text(a.id, 64) || !a.id || ids.has(a.id) || !text(a.name, 20) || !a.name.trim() || !text(a.icon, 64) || !['ai', 'search'].includes(a.kind) || !text(a.prompt, 12000) || typeof a.enabled !== 'boolean') throw new Error('动作配置无效，请检查名称和类型。');
    if (!validEnglishName(a.englishName) || englishNames.has(a.englishName)) throw new Error('英文名称须唯一，使用小写字母开头的 1–48 位字母、数字或下划线，且不能使用系统保留名称。');
    englishNames.add(a.englishName);
    if (a.kind === 'ai' && !a.prompt.includes('{text}')) throw new Error(`“${a.name}”的提示词须包含 {text}。`);
    ids.add(a.id);
  }
  if (!s.actions.some(a => a.enabled)) throw new Error('至少启用一个动作。');
  return {
    version: 1, enabled: s.enabled, trigger: s.trigger, shortcut: s.shortcut.trim(), selectionMethod: s.selectionMethod,
    excludedApps: [...new Set(s.excludedApps.map(a => a.trim().toLowerCase()))], theme: s.theme, accent: s.accent, density: s.density,
    provider: { baseUrl: s.provider.baseUrl.trim().replace(/\/+$/, ''), model: s.provider.model.trim() },
    actions: s.actions.map(a => ({ id: a.id, name: a.name.trim(), englishName: a.englishName, icon: a.icon, kind: a.kind, prompt: a.prompt, enabled: a.enabled }))
  };
}

export function modelErrorMessage(error: unknown, baseUrl: string): string {
  if (!(error instanceof Error)) return '模型请求失败，请检查连接设置。';
  const cause = error.cause as { code?: string } | undefined;
  const code = cause?.code || (error as Error & { code?: string }).code;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname);
  if (['ERR_SSL_WRONG_VERSION_NUMBER', 'ERR_SSL_PACKET_LENGTH_TOO_LONG', 'ERR_SSL_RECORD_LAYER_FAILURE'].includes(code || '')) {
    return local
      ? '无法建立 HTTPS 连接：本地服务可能只支持 HTTP。请在「模型」中核对地址是否应以 http:// 开头。'
      : '无法建立 HTTPS 连接，请检查 API 地址的协议、端口及代理配置。';
  }
  if (code === 'ECONNREFUSED') return local ? '无法连接本地模型服务，请确认服务已启动，且 API 地址和端口正确。' : '模型服务拒绝连接，请检查 API 地址、端口及网络。';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '无法解析模型服务的域名，请检查 API 地址和网络连接。';
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return '连接模型服务超时，请检查网络及代理配置。';
  if (error.message === 'fetch failed') return '无法连接模型服务，请检查 API 地址、HTTP/HTTPS 协议、服务状态及网络配置。';
  return error.message;
}

export function endpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}
export function placeToolbar(anchor: { x: number; y: number }, area: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const inset = 8;
  const maxX = Math.max(area.x + inset, area.x + area.width - width - inset);
  const maxY = Math.max(area.y + inset, area.y + area.height - height - inset);
  const below = anchor.y + 10;
  return { x: Math.round(Math.max(area.x + inset, Math.min(anchor.x - width / 2, maxX))), y: Math.round(Math.max(area.y + inset, Math.min(below + height > area.y + area.height ? anchor.y - height - 10 : below, maxY))) };
}

// SSE packets and UTF-8 characters may span arbitrary network chunk boundaries.
export async function* readSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n/.exec(buffer))) {
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (line === '') { if (data.length) yield data.join('\n'); data = []; }
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (buffer.length > 1_000_000) throw new Error('模型返回的数据过大。');
      if (done) {
        if (buffer.startsWith('data:')) data.push(buffer.slice(5).replace(/^ /, ''));
        if (data.length) yield data.join('\n');
        break;
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
