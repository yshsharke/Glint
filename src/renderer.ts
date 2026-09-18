import { defaults } from './core';
import { brandIcon, icon, iconName, openIconPicker } from './icons';
import type { Action, GlintAPI, ResultState, Settings, Snapshot } from './core';
declare global { interface Window { glint: GlintAPI } }

const root = document.getElementById('app')!;
const view = new URLSearchParams(location.search).get('view') || 'settings';
let snapshot: Snapshot;
let draft: Settings = structuredClone(defaults);
let page = 'actions';
let selectedId = draft.actions[0].id;
let dirty = false;
let keyUpdate: string | undefined;
let busy = false;
let toastTimer: number;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const kindLabel = (kind: string) => ({ ai: 'AI 指令', copy: '复制文字', search: '网页搜索' })[kind] || kind;
function theme(settings: Settings) { document.documentElement.dataset.theme = settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.theme; document.documentElement.dataset.accent = settings.accent; document.documentElement.dataset.density = settings.density; }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => theme(view === 'settings' ? draft : snapshot.settings));
function toast(message: string, error = false) {
  let node = document.getElementById('toast');
  if (!node) { node = document.createElement('div'); node.id = 'toast'; node.setAttribute('role', 'status'); document.body.append(node); }
  node.textContent = message; node.className = `toast ${error ? 'error' : ''} visible`;
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => node!.classList.remove('visible'), 3500);
}
function markDirty() { dirty = true; const note = document.getElementById('save-note'); if (note) note.textContent = '有尚未保存的更改'; }
function switchControl(label: string, description: string, field: string, checked: boolean) { return `<label class="switch-row"><span><strong>${label}</strong><small>${description}</small></span><input type="checkbox" data-field="${field}" ${checked ? 'checked' : ''}><span class="switch-track"></span></label>`; }

function toolbarContent(actions: Action[], live = false) {
  return `<div class="floating-bar ${live ? '' : 'sample-bar'}"><button class="mini-brand" data-open-settings title="Glint 设置" aria-label="打开 Glint 设置">${brandIcon()}</button><span class="bar-divider"></span><div class="bar-actions">${actions.filter(a => a.enabled).map(a => `<button ${live ? `data-run="${escape(a.id)}"` : 'data-preview-action'} class="bar-action" title="${escape(a.name)}">${icon(a.icon)}<span>${escape(a.name)}</span></button>`).join('')}</div></div>`;
}
function renderActions() {
  const selected = draft.actions.find(a => a.id === selectedId) || draft.actions[0]; selectedId = selected.id;
  return `
  <div class="section-heading"><span class="section-summary">${draft.actions.length} 个动作 · 选择后编辑</span><div class="heading-buttons"><button class="button secondary small" data-demo>测试浮条</button><button class="button secondary small" data-add ${draft.actions.length >= 12 ? 'disabled' : ''}>${icon('plus')} 新建动作</button></div></div>
  <div class="action-workbench"><div class="action-list">${draft.actions.map(a => `<div class="action-row ${a.id === selectedId ? 'selected' : ''}"><button class="action-select" data-select="${escape(a.id)}"><span class="action-symbol">${icon(a.icon)}</span><span><strong>${escape(a.name)}</strong><small>${kindLabel(a.kind)}</small></span></button><button class="mini-toggle ${a.enabled ? 'on' : ''}" data-toggle="${escape(a.id)}" role="switch" aria-checked="${a.enabled}" aria-label="${a.enabled ? '停用' : '启用'}${escape(a.name)}"><span></span></button></div>`).join('')}</div>
  <div class="action-editor"><div class="editor-top"><span class="eyebrow">动作设置</span><div class="icon-tools"><button data-move="up" class="icon-button" title="上移" aria-label="上移动作" ${draft.actions[0].id === selectedId ? 'disabled' : ''}>${icon('up')}</button><button data-move="down" class="icon-button" title="下移" aria-label="下移动作" ${draft.actions.at(-1)?.id === selectedId ? 'disabled' : ''}>${icon('down')}</button><button data-delete class="icon-button danger" title="删除" aria-label="删除动作" ${draft.actions.length === 1 ? 'disabled' : ''}>${icon('trash')}</button></div></div>
  <div class="form-grid"><label>动作名称<input data-action-field="name" maxlength="20" value="${escape(selected.name)}"></label><label>动作类型<select data-action-field="kind">${['ai', 'copy', 'search'].map(kind => `<option value="${kind}" ${selected.kind === kind ? 'selected' : ''}>${kindLabel(kind)}</option>`).join('')}</select></label></div>
  <label class="field-label">图标</label><button class="icon-select-button" data-open-icon-picker aria-haspopup="dialog">${icon(selected.icon)}<span>${iconName(selected.icon)}</span><small>更换图标</small>${icon('chevron-down')}</button>
  ${selected.kind === 'ai' ? `<label class="prompt-label">提示词 <span class="placeholder-tag">{text} = 选中的文字</span><textarea data-action-field="prompt" rows="5" maxlength="12000" spellcheck="false">${escape(selected.prompt)}</textarea></label><p class="field-hint">使用「模型」中的模型，结果显示在独立卡片中。</p>` : `<div class="action-description">${icon(selected.icon)}<p>${selected.kind === 'copy' ? '将当前选中的文字复制到剪贴板，然后收起浮条。' : '使用 Google 搜索选中文字，在默认浏览器中打开。'}</p></div>`}</div></div><div class="inline-preview"><span>浮条预览</span>${toolbarContent(draft.actions)}</div>`;
}
function renderModel() {
  return `<p class="page-description">支持 OpenAI 兼容接口及本地模型服务。</p><section class="panel form-panel"><div class="panel-heading"><h3>连接配置</h3><span class="subtle-badge">OpenAI compatible</span></div><label>API 地址<input data-field="baseUrl" type="url" value="${escape(draft.provider.baseUrl)}" placeholder="https://your-provider.com/v1" spellcheck="false"></label><p class="field-hint">填写服务商提供的 API 根地址，例如以 /v1 结尾的地址。</p><label>模型名称<input data-field="model" value="${escape(draft.provider.model)}" placeholder="填写服务商提供的模型 ID" spellcheck="false"></label><label>API Key <span class="optional">本地模型可留空</span><input data-key type="password" value="${escape(keyUpdate || '')}" placeholder="${snapshot.hasKey && keyUpdate === undefined ? '已保存密钥 · 留空保留原密钥' : '粘贴你的 API Key'}" autocomplete="off"></label><div class="key-note"><span>${icon('check')} 密钥使用 Windows 系统加密后保存在本机</span>${snapshot.hasKey ? '<button class="text-button" data-clear-key>清除已保存密钥</button>' : ''}</div></section><div class="quiet-note">${icon('sparkles')}<p>只有点击 AI 动作时，选中文字才会发送到这里配置的服务。复制与搜索不调用模型。</p></div>`;
}
function renderTriggers() {
  return `<p class="page-description">自动浮现，或用一个快捷键主动呼出。</p><section class="panel form-panel">${switchControl('启用划词助手', '关闭后停止系统划词监听。', 'enabled', draft.enabled)}<label>触发方式<select data-field="trigger"><option value="automatic" ${draft.trigger === 'automatic' ? 'selected' : ''}>选中文字后自动显示</option><option value="shortcut" ${draft.trigger === 'shortcut' ? 'selected' : ''}>仅使用快捷键</option></select></label><label>全局快捷键<input data-field="shortcut" value="${escape(draft.shortcut)}" spellcheck="false"></label><p class="field-hint">例如 CommandOrControl+Alt+G。自动模式下也能使用快捷键。</p>${switchControl('允许复制取词', '辅助接口取不到文字时，尝试复制并恢复剪贴板。', 'clipboardFallback', draft.clipboardFallback)}<label>在这些应用中停用<textarea data-apps rows="4" placeholder="每行一个程序名，例如 WindowsTerminal.exe" spellcheck="false">${escape(draft.excludedApps.join('\n'))}</textarea></label><p class="field-hint">使用程序名，不填窗口标题。终端默认排除，以避免复制快捷键干扰命令。</p></section>`;
}
function renderAppearance() {
  return `<p class="page-description">设置主题、强调色和浮条显示方式。</p><section class="panel form-panel"><label class="field-label">主题</label><div class="theme-options">${[['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']].map(([value, label]) => `<button class="theme-choice ${draft.theme === value ? 'active' : ''}" data-theme="${value}"><strong>${label}</strong>${draft.theme === value ? icon('check') : ''}</button>`).join('')}</div><label class="field-label spaced">强调色</label><div class="accent-options">${[['blue', '蓝色'], ['violet', '紫色'], ['teal', '绿色'], ['amber', '琥珀色']].map(([value, label]) => `<button class="accent-choice ${draft.accent === value ? 'active' : ''}" data-accent="${value}"><i class="accent-dot dot-${value}"></i>${label}${draft.accent === value ? icon('check') : ''}</button>`).join('')}</div><label class="spaced">浮条密度<select data-field="density"><option value="comfortable" ${draft.density === 'comfortable' ? 'selected' : ''}>舒适 · 图标与文字</option><option value="compact" ${draft.density === 'compact' ? 'selected' : ''}>紧凑 · 仅图标</option></select></label></section><section class="appearance-preview"><span class="eyebrow">实时预览</span>${toolbarContent(draft.actions)}</section>`;
}
function renderDiagnostics() {
  const status = snapshot.status;
  return `<p class="page-description">查看取词状态和最近事件。运行日志不包含原文、回复或密钥。</p><section class="panel"><div class="panel-heading"><h3>运行状态</h3><button class="button secondary small" data-restart>${icon('refresh')} 重启取词引擎</button></div><div class="diagnostic-row"><span>取词引擎</span><strong class="${status.hook === 'error' ? 'error-text' : ''}">${escape(status.message)}</strong></div><div class="diagnostic-row"><span>全局快捷键</span><strong>${status.shortcutReady ? '注册成功' : '注册失败，请修改快捷键'}</strong></div><div class="diagnostic-row"><span>上次取词</span><strong>${status.lastSelection ? `${escape(status.lastSelection.app)} · ${escape(status.lastSelection.method)} · ${status.lastSelection.length} 字符` : '尚未触发'}</strong></div></section><section class="panel log-panel"><div class="panel-heading"><h3>最近事件</h3><span class="subtle-badge">本次会话 · 最近 20 条</span></div>${status.events.length ? status.events.map(e => `<div class="log-entry"><time>${escape(e.time)}</time><span>${escape(e.message)}</span></div>`).join('') : '<div class="empty-state">开始划词后，事件会出现在这里。</div>'}</section><div class="quiet-note">${icon('activity')}<p>没有弹出浮条时，可先尝试快捷键，再检查应用排除列表。部分应用不暴露选区，需要复制取词；图片和扫描版 PDF 尚不支持。</p></div>`;
}
function renderSettings() {
  theme(draft);
  const pages = [{ id: 'actions', title: '动作', subtitle: '编辑浮条动作', icon: 'sparkles' }, { id: 'model', title: '模型', subtitle: '设置模型服务', icon: 'link' }, { id: 'triggers', title: '触发', subtitle: '掌握浮条出现的时机', icon: 'zap' }, { id: 'appearance', title: '外观', subtitle: '主题与密度', icon: 'palette' }, { id: 'diagnostics', title: '诊断', subtitle: '了解取词引擎正在做什么', icon: 'activity' }];
  const current = pages.find(p => p.id === page)!;
  root.innerHTML = `<div class="app-shell"><header class="settings-titlebar"><div class="brand">${brandIcon()}<span class="brand-wordmark"><span>Glint</span><small class="version-label">0.1</small></span></div><h1>${current.title}</h1><span id="engine-status" class="status-badge"><i></i><span></span></span><div class="window-controls"><button data-window="minimize" title="最小化" aria-label="最小化">${icon('minus')}</button><button data-window="maximize"></button><button data-window="close" class="window-close" title="关闭设置" aria-label="关闭设置">${icon('close')}</button></div></header><aside class="sidebar"><nav>${pages.map(p => `<button data-page="${p.id}" class="nav-item ${page === p.id ? 'active' : ''}">${icon(p.icon)}<span>${p.title}</span>${page === p.id ? '<i></i>' : ''}</button>`).join('')}</nav><div class="sidebar-bottom"><button class="quit-button" data-quit>${icon('power')} 退出 Glint</button></div></aside><main class="workspace"><div class="page-content">${({ actions: renderActions, model: renderModel, triggers: renderTriggers, appearance: renderAppearance, diagnostics: renderDiagnostics })[page]!()}</div><footer class="save-bar"><span id="save-note">${dirty ? '有尚未保存的更改' : '设置保存在本机'}</span><div><button class="button secondary" data-revert ${dirty ? '' : 'disabled'}>撤销更改</button><button class="button primary" data-save ${busy ? 'disabled' : ''}>${icon('check')} ${busy ? '保存中…' : '保存设置'}</button></div></footer></main></div>`;
  updateStatus();
  updateWindowControls(snapshot.settingsMaximized);
}
function updateWindowControls(maximized: boolean) {
  snapshot.settingsMaximized = maximized;
  const button = document.querySelector<HTMLButtonElement>('[data-window=maximize]');
  if (!button) return;
  button.innerHTML = icon(maximized ? 'copy' : 'square');
  button.title = maximized ? '向下还原' : '最大化';
  button.setAttribute('aria-label', button.title);
  document.querySelector('.app-shell')?.classList.toggle('maximized', maximized);
}
function updateStatus() {
  const badge = document.getElementById('engine-status');
  if (!badge) return;
  badge.dataset.state = snapshot.status.hook;
  badge.querySelector('span')!.textContent = ({ starting: '正在连接', ready: '划词已就绪', paused: '已暂停', error: '需要检查' })[snapshot.status.hook];
}
function renderToolbar() {
  theme(snapshot.settings); document.body.className = 'toolbar-body';
  root.innerHTML = `<div class="toolbar-wrap">${toolbarContent(snapshot.settings.actions, true)}</div>`;
  const selectionId = snapshot.selection?.id;
  const bar = document.querySelector<HTMLElement>('.floating-bar')!;
  void document.fonts.ready.then(() => {
    if (!bar.isConnected || selectionId === undefined) return;
    const pixels = (value: string) => Number.parseFloat(value) || 0;
    const style = getComputedStyle(bar);
    const wrap = getComputedStyle(bar.parentElement!);
    // scrollWidth includes every action even when the old window width clips the list.
    const children = [...bar.children] as HTMLElement[];
    const contentWidth = children.reduce((sum, child) => {
      const css = getComputedStyle(child);
      return sum + (child.classList.contains('bar-actions') ? child.scrollWidth : child.getBoundingClientRect().width) + pixels(css.marginLeft) + pixels(css.marginRight);
    }, 0);
    const width = contentWidth + pixels(style.columnGap) * (children.length - 1)
      + pixels(style.paddingLeft) + pixels(style.paddingRight) + pixels(style.borderLeftWidth) + pixels(style.borderRightWidth)
      + pixels(wrap.paddingLeft) + pixels(wrap.paddingRight) + 2;
    const height = bar.getBoundingClientRect().height + pixels(wrap.paddingTop) + pixels(wrap.paddingBottom) + 4;
    return window.glint.fitToolbar(selectionId, width, height);
  }).catch(error => toast(String(error), true));
}
function renderResult(state: ResultState | undefined) {
  theme(snapshot.settings); document.body.className = 'result-body';
  root.innerHTML = `<div class="result-shell"><header class="result-header"><div class="result-heading"><span class="result-action" title="${escape(state?.actionName || '结果')}">${icon(state?.actionIcon || 'sparkles')}<strong>${escape(state?.actionName || '结果')}</strong></span><span class="result-header-divider"></span><span class="result-app" title="${escape(state?.app || '')}">${escape(state?.app || '')}</span>${state?.demo ? '<span class="result-demo">演示</span>' : ''}</div><button class="result-close" data-close-result title="关闭" aria-label="关闭结果卡片">${icon('close')}</button></header><div class="result-content"><details class="source-details"><summary>查看原文</summary><p id="source-text"></p></details><div id="result-loading" class="request-loading" role="status" aria-label="正在请求模型" hidden><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></div><div id="answer" class="answer"></div><div id="result-error" class="result-error" role="status"></div></div><footer class="result-footer"><span id="result-state" role="status"></span><div><button class="button secondary small" id="result-stop" data-cancel>${icon('stop')} 停止</button><button class="button secondary small" id="result-retry" data-retry-result>${icon('rotate-cw')} 重试</button><button class="button secondary small" id="result-copy" data-copy-result>${icon('copy')} 复制</button>${state?.recordKind ? `<button class="button primary small" id="result-record" data-record-source title="保存原文、结果和来源进程">${icon('bookmark')} 记录</button>` : ''}</div></footer></div>`;
  updateResult(state);
}
function updateResult(state: ResultState | undefined) {
  if (!state) return;
  document.getElementById('source-text')!.textContent = state.source;
  document.getElementById('answer')!.textContent = state.text;
  document.getElementById('answer')!.setAttribute('aria-busy', String(state.busy));
  document.getElementById('result-loading')!.hidden = !state.busy || Boolean(state.text) || Boolean(state.error);
  const error = document.getElementById('result-error')!; error.textContent = state.error || ''; error.hidden = !state.error;
  document.getElementById('result-state')!.textContent = state.busy ? '正在生成' : state.error ? '已停止' : '已完成';
  (document.getElementById('result-copy') as HTMLButtonElement).disabled = !state.text;
  (document.getElementById('result-stop') as HTMLButtonElement).disabled = !state.busy;
  (document.getElementById('result-retry') as HTMLButtonElement).disabled = state.busy;
  const record = document.getElementById('result-record') as HTMLButtonElement | null;
  if (record) {
    record.disabled = state.recorded || state.busy || !state.text.trim() || !state.source.trim();
    record.innerHTML = `${icon(state.recorded ? 'bookmark-check' : 'bookmark')} ${state.recorded ? '已记录' : '记录'}`;
  }
}
function render() { if (view === 'toolbar') renderToolbar(); else if (view === 'result') renderResult(snapshot.result); else renderSettings(); }

root.addEventListener('click', async event => {
  const button = (event.target as Element).closest('button');
  if (!button || button.disabled) return;
  const d = button.dataset;
  try {
    if (d.page) { page = d.page; render(); }
    else if ('demo' in d) await window.glint.demo();
    else if ('previewAction' in d) toast('点击「测试浮条」体验动作。');
    else if (d.run) { const response = await window.glint.run(d.run); if (!response.ok) toast(response.error || '执行失败', true); }
    else if (d.window === 'minimize' || d.window === 'maximize' || d.window === 'close') await window.glint.settingsWindow(d.window);
    else if ('openSettings' in d) await window.glint.openSettings();
    else if ('closeResult' in d) await window.glint.dismiss();
    else if ('cancel' in d) await window.glint.cancel();
    else if ('retryResult' in d) await window.glint.retryResult();
    else if ('recordSource' in d && snapshot.result) {
      button.disabled = true;
      try {
        const response = await window.glint.recordSource(snapshot.result.id);
        toast(response.ok ? '原文与结果已记录' : response.error || '记录失败', !response.ok);
      } finally { updateResult(snapshot.result); }
    }
    else if ('copyResult' in d) { if (await window.glint.copyResult()) toast('已复制'); }
    else if ('restart' in d) { await window.glint.restart(); toast('正在重新启动取词引擎'); }
    else if ('quit' in d) await window.glint.quit();
    else if (d.select) { selectedId = d.select; render(); }
    else if (d.toggle) { const action = draft.actions.find(a => a.id === d.toggle)!; if (action.enabled && draft.actions.filter(a => a.enabled).length === 1) { toast('至少保留一个启用的动作。'); return; } action.enabled = !action.enabled; markDirty(); render(); }
    else if ('add' in d) { const action: Action = { id: crypto.randomUUID(), name: '新动作', icon: 'sparkles', kind: 'ai', enabled: true, prompt: '请处理以下文字：\n\n{text}' }; draft.actions.push(action); selectedId = action.id; markDirty(); render(); }
    else if ('delete' in d) { draft.actions = draft.actions.filter(a => a.id !== selectedId); selectedId = draft.actions[0].id; markDirty(); render(); }
    else if (d.move) { const index = draft.actions.findIndex(a => a.id === selectedId); const next = index + (d.move === 'up' ? -1 : 1); if (next >= 0 && next < draft.actions.length) { [draft.actions[index], draft.actions[next]] = [draft.actions[next], draft.actions[index]]; markDirty(); render(); } }
    else if ('openIconPicker' in d) { const action = draft.actions.find(a => a.id === selectedId)!; openIconPicker(action.icon, name => { action.icon = name; markDirty(); render(); }); }
    else if (d.theme) { draft.theme = d.theme as Settings['theme']; markDirty(); render(); }
    else if (d.accent) { draft.accent = d.accent as Settings['accent']; markDirty(); render(); }
    else if ('clearKey' in d) { keyUpdate = ''; markDirty(); render(); toast('保存设置后将清除密钥。'); }
    else if ('revert' in d) { draft = structuredClone(snapshot.settings); keyUpdate = undefined; dirty = false; render(); }
    else if ('save' in d) {
      busy = true; button.disabled = true;
      const response = await window.glint.save(draft, keyUpdate);
      busy = false;
      if (response.ok) { snapshot = await window.glint.snapshot(); draft = structuredClone(snapshot.settings); keyUpdate = undefined; dirty = false; render(); toast('设置已保存'); }
      else { render(); toast(response.error || '保存失败', true); }
    }
  } catch (error) { busy = false; toast(error instanceof Error ? error.message : '操作失败', true); }
});
root.addEventListener('input', event => {
  if (view !== 'settings') return;
  const input = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const d = input.dataset;
  if (d.actionField) {
    const action = draft.actions.find(a => a.id === selectedId)!;
    if (d.actionField === 'kind') { action.kind = input.value as Action['kind']; if (action.kind === 'ai' && !action.prompt) action.prompt = '{text}'; markDirty(); render(); return; }
    if (d.actionField === 'name') action.name = input.value;
    if (d.actionField === 'prompt') action.prompt = input.value;
  } else if ('key' in d) keyUpdate = input.value || undefined;
  else if ('apps' in d) draft.excludedApps = input.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  else if (d.field) {
    const field = d.field;
    if (field === 'baseUrl' || field === 'model') draft.provider[field] = input.value;
    else if (field === 'enabled' || field === 'clipboardFallback') draft[field] = (input as HTMLInputElement).checked;
    else if (field === 'shortcut') draft.shortcut = input.value;
    else if (field === 'trigger') draft.trigger = input.value as Settings['trigger'];
    else if (field === 'density') { draft.density = input.value as Settings['density']; theme(draft); }
  } else return;
  markDirty();
  const revert = document.querySelector<HTMLButtonElement>('[data-revert]'); if (revert) revert.disabled = false;
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && view !== 'settings') void window.glint.dismiss(); });

async function boot() {
  snapshot = await window.glint.snapshot(); draft = structuredClone(snapshot.settings); selectedId = draft.actions[0].id; render();
  window.glint.subscribe(event => {
    if (event.type === 'snapshot') {
      snapshot = event.snapshot;
      if (view !== 'settings') render();
      else {
        if (!dirty && JSON.stringify(draft) !== JSON.stringify(snapshot.settings)) {
          draft = structuredClone(snapshot.settings);
          if (!draft.actions.some(a => a.id === selectedId)) selectedId = draft.actions[0].id;
          render();
        } else { updateStatus(); if (page === 'diagnostics' && !dirty) render(); }
      }
    } else if (event.type === 'settings-window') { if (view === 'settings') updateWindowControls(event.maximized); }
    else if (event.type === 'result' && view === 'result') { snapshot.result = event.result; updateResult(event.result); }
  });
}
boot().catch(error => { root.textContent = `Glint 无法加载：${String(error)}`; });
