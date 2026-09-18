import { createRoot } from 'react-dom/client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  FluentProvider, Button, Input, Textarea, Dropdown, Option, Switch, Field,
  TabList, Tab, ToggleButton, Dialog, DialogTrigger, DialogSurface, DialogBody, DialogTitle,
  DialogContent, DialogActions, Spinner, MessageBar, MessageBarBody,
  Toaster, Toast, ToastTitle, useToastController, useId, createLightTheme, createDarkTheme,
  type BrandVariants,
} from '@fluentui/react-components';
import { FadeSnappy, CollapseSnappy } from './ui/motion';
import { iconName, findIcons, loadCatalog, iconCount } from './icons';
import type { Action, GlintAPI, ResultState, Settings, Snapshot } from './core';

declare global { interface Window { glint: GlintAPI } }
declare const GLINT_APP_VERSION: string;
const view = new URLSearchParams(location.search).get('view') || 'settings';
let snapshot: Snapshot;
let draft: Settings;
let selectedId = '';
let page = 'actions';
let dirty = false;
let keyUpdate: string | undefined;
let busy = false;
let notice = { id: 0, message: '', error: false };
let revision = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => { revision++; listeners.forEach(listener => listener()); };
const toast = (message: string, error = false) => { notice = { id: notice.id + 1, message, error }; emit(); };
function edit(change: () => void) { change(); dirty = true; emit(); }
async function perform(action: () => Promise<unknown>) {
  try { await action(); } catch (error) { toast(error instanceof Error ? error.message : '操作失败', true); }
}
const kindLabel = (kind: string) => ({ ai: 'AI 指令', copy: '复制文字', search: '网页搜索' })[kind] || kind;
const pages = [
  { id: 'actions', title: '动作', icon: 'sparkles' }, { id: 'model', title: '模型', icon: 'link' },
  { id: 'triggers', title: '触发', icon: 'zap' }, { id: 'appearance', title: '外观', icon: 'palette' },
  { id: 'diagnostics', title: '诊断', icon: 'activity' },
];
const ramps: Record<Settings['accent'], string[]> = {
  blue: ['#020305','#081828','#0b263e','#0c3354','#0b406b','#084e83','#035c9b','#0067c0','#1677cb','#3088d4','#529adb','#74ace3','#96bfeb','#b8d2f2','#d8e7f8','#eff6fd'],
  violet: ['#040207','#180f26','#281b3d','#382652','#483368','#58407f','#6750a4','#775fba','#8a73c7','#9d87d3','#af9bdd','#c3afff','#d0bfff','#dfd2ff','#ece5ff','#f7f3ff'],
  teal: ['#010504','#071d19','#0a2d27','#0b3d35','#0c4e44','#0b6054','#097264','#087f73','#219184','#3ba294','#56b4a7','#71cdbb','#94dbcd','#b7e8de','#d7f3ec','#eefaf6'],
  amber: ['#050300','#201602','#322305','#453109','#59400b','#6e510b','#82600b','#926400','#a57818','#b88d35','#cba353','#e4bd73','#edce96','#f3dfb9','#faeed9','#fdf8ee'],
};
function controlData(attributes: Record<`data-${string}`, string> & { 'aria-label'?: string }) {
  return { className: undefined, ...attributes };
}
function Icon({ name }: { name: string }) { return <span className={'icon lucide-' + iconName(name)} aria-hidden="true" />; }
function Brand() { return <span className="icon glint-mark" aria-hidden="true" />; }
function Select({ label, value, options, onChange, field, actionField }: {
  label: string; value: string; options: string[][]; onChange: (value: string) => void; field?: string; actionField?: string;
}) {
  const id = useId('select');
  return <Field label={label} className="form-field"><Dropdown id={id}
    data-field={field} data-action-field={actionField} className="full-control"
    value={options.find(([key]) => key === value)?.[1] || value} selectedOptions={[value]}
    onOptionSelect={(_, data) => { if (data.optionValue) onChange(data.optionValue); }}>
    {options.map(([key, text]) => <Option key={key} value={key}>{text}</Option>)}
  </Dropdown></Field>;
}
function SettingSwitch({ label, description, field }: { label: string; description: string; field: 'enabled' | 'clipboardFallback' }) {
  const id = useId('switch');
  return <div className="switch-setting"><div><label htmlFor={id}>{label}</label><p>{description}</p></div>
    <Switch id={id} checked={draft[field]} input={controlData({ 'data-field': field })}
      onChange={(_, data) => edit(() => { draft[field] = data.checked; })} /></div>;
}
function Toolbar({ settings, live = false }: { settings: Settings; live?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const selectionId = snapshot.selection?.id;
  useLayoutEffect(() => {
    if (!live || selectionId === undefined) return;
    let cancelled = false;
    const fit = () => {
      const bar = ref.current;
      if (cancelled || !bar) return;
      const px = (value: string) => Number.parseFloat(value) || 0;
      const style = getComputedStyle(bar), wrap = getComputedStyle(bar.parentElement!);
      const children = [...bar.children] as HTMLElement[];
      const width = children.reduce((sum, child) => {
        const css = getComputedStyle(child);
        return sum + (child.classList.contains('bar-actions') ? child.scrollWidth : child.getBoundingClientRect().width) + px(css.marginLeft) + px(css.marginRight);
      }, 0) + px(style.columnGap) * (children.length - 1) + px(style.paddingLeft) + px(style.paddingRight)
        + px(style.borderLeftWidth) + px(style.borderRightWidth) + px(wrap.paddingLeft) + px(wrap.paddingRight) + 2;
      void perform(() => window.glint.fitToolbar(selectionId, width, bar.offsetHeight + px(wrap.paddingTop) + px(wrap.paddingBottom) + 4));
    };
    void document.fonts.ready.then(fit);
    const observer = new ResizeObserver(fit);
    if (ref.current) observer.observe(ref.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [live, selectionId, settings.density, JSON.stringify(settings.actions)]);
  return <div ref={ref} className={'floating-bar ' + (live ? '' : 'sample-bar')}>
    <Button appearance="subtle" size="small" className="mini-brand" data-open-settings aria-label="打开 Glint 设置" title="Glint 设置"
      icon={<Brand />} onClick={() => void perform(() => window.glint.openSettings())} />
    <span className="bar-divider" />
    <div className="bar-actions">{settings.actions.filter(a => a.enabled).map(a => <Button key={a.id}
      appearance="subtle" size="small" className="bar-action" data-run={live ? a.id : undefined}
      data-preview-action={live ? undefined : ''} icon={<Icon name={a.icon} />} aria-label={a.name} title={a.name}
      onClick={() => live ? void perform(async () => { const r = await window.glint.run(a.id); if (!r.ok) toast(r.error || '执行失败', true); }) : toast('点击「测试浮条」体验动作。')}>
      {settings.density === 'compact' ? undefined : a.name}
    </Button>)}</div>
  </div>;
}
function IconPicker({ action }: { action: Action }) {
  const [open, setOpen] = useState(false);
  const onClose = () => setOpen(false);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const [index, setIndex] = useState(0);
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    setQuery(''); setIndex(0); setAll(false); setFailed(false);
    let active = true;
    void loadCatalog().then(data => { if (active) setTags(data); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [open]);
  const results = findIcons(query, all, tags);
  const count = Math.max(1, Math.ceil(results.length / 32));
  const currentPage = Math.min(index, count - 1);
  return <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
    <DialogTrigger disableButtonEnhancement><Button className="icon-select-button" data-open-icon-picker aria-label="更换动作图标" title={'当前图标：' + iconName(action.icon) + ' · 点击更换'} icon={<Icon name={action.icon} />}>
      <span className="icon-select-name">{iconName(action.icon)}</span>
    </Button></DialogTrigger>
    <DialogSurface className="icon-dialog">
      <DialogBody>
        <DialogTitle action={<Button appearance="subtle" size="small" icon={<Icon name="x" />} data-picker-close aria-label="关闭图标选择" onClick={onClose} />}>选择图标 <small>Lucide · {iconCount} 个</small></DialogTitle>
        <DialogContent>
          <Input className="full-control" type="search" value={query} contentBefore={<Icon name="search" />}
            input={controlData({ 'data-icon-search': '', 'aria-label': '搜索图标' })}
            placeholder="搜索：翻译、代码、book…" onChange={(_, data) => { setQuery(data.value); setIndex(0); }} />
          <TabList size="small" selectedValue={all ? 'all' : 'common'} onTabSelect={(_, data) => { setAll(data.value === 'all'); setIndex(0); setQuery(''); }}>
            <Tab value="common" data-icon-tab="common">常用</Tab><Tab value="all" data-icon-tab="all">全部图标</Tab>
          </TabList>
          <div className="icon-library-grid" aria-label="图标" onKeyDown={event => {
            const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 } as Record<string, number>)[event.key];
            if (offset === undefined) return;
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-pick-icon]')];
            const at = buttons.indexOf(event.target as HTMLButtonElement);
            if (at < 0) return;
            event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, at + offset))]?.focus();
          }}>
            {results.slice(currentPage * 32, (currentPage + 1) * 32).map(name => <ToggleButton key={name}
              appearance="subtle" checked={iconName(action.icon) === name} className="library-icon"
              data-pick-icon={name} title={name} aria-label={name}
              onClick={() => { edit(() => { action.icon = name; }); onClose(); }}>
              <Icon name={name} /><span className="library-icon-name">{name}</span>
            </ToggleButton>)}
            {!results.length && <p className="icon-library-empty">没有找到图标，试试英文名称或更短的关键词。</p>}
          </div>
        </DialogContent>
        <DialogActions className="icon-dialog-footer"><span role="status">{failed ? '索引加载失败，仍可按名称搜索' : results.length + ' 个图标'}</span><div>
          <Button appearance="subtle" size="small" icon={<Icon name="chevron-left" />} data-picker-prev aria-label="上一页" disabled={!currentPage} onClick={() => setIndex(currentPage - 1)} />
          <span data-picker-page>{currentPage + 1} / {count}</span>
          <Button appearance="subtle" size="small" icon={<Icon name="chevron-right" />} data-picker-next aria-label="下一页" disabled={currentPage === count - 1} onClick={() => setIndex(currentPage + 1)} />
        </div></DialogActions>
      </DialogBody>
    </DialogSurface>
  </Dialog>;
}
function Actions() {
  const selected = draft.actions.find(a => a.id === selectedId) || draft.actions[0];
  const move = (offset: number) => edit(() => {
    const at = draft.actions.indexOf(selected), next = at + offset;
    if (next >= 0 && next < draft.actions.length) [draft.actions[at], draft.actions[next]] = [draft.actions[next], draft.actions[at]];
  });
  return <>
    <div className="section-heading"><span className="section-summary">{draft.actions.length} 个动作 · 选择后编辑</span><div className="heading-buttons">
      <Button size="small" data-demo onClick={() => void perform(() => window.glint.demo())}>测试浮条</Button>
      <Button size="small" data-add icon={<Icon name="plus" />} disabled={draft.actions.length >= 12} onClick={() => edit(() => {
        const action: Action = { id: crypto.randomUUID(), name: '新动作', icon: 'sparkles', kind: 'ai', enabled: true, prompt: '请处理以下文字：\n\n{text}' };
        draft.actions.push(action); selectedId = action.id;
      })}>新建动作</Button>
    </div></div>
    <div className="action-workbench"><div className="action-list">{draft.actions.map(a => <div key={a.id} className={'action-row ' + (a.id === selected.id ? 'selected' : '')}>
      <Button appearance="subtle" className="action-select" data-select={a.id} aria-pressed={a.id === selected.id}
        icon={<Icon name={a.icon} />} onClick={() => { selectedId = a.id; emit(); }}><span><strong>{a.name}</strong><small>{kindLabel(a.kind)}</small></span></Button>
      <Switch size="small" className="action-switch" checked={a.enabled} input={controlData({ 'data-toggle': a.id, 'aria-label': (a.enabled ? '停用' : '启用') + a.name })}
        onChange={(_, data) => {
          if (!data.checked && draft.actions.filter(item => item.enabled).length === 1) { toast('至少保留一个启用的动作。'); return; }
          edit(() => { a.enabled = data.checked; });
        }} />
    </div>)}</div>
    <div className="action-editor"><div className="editor-top"><span className="eyebrow">动作设置</span><div className="icon-tools">
      <Button appearance="subtle" size="small" data-move="up" aria-label="上移动作" title="上移" icon={<Icon name="up" />} disabled={draft.actions[0] === selected} onClick={() => move(-1)} />
      <Button appearance="subtle" size="small" data-move="down" aria-label="下移动作" title="下移" icon={<Icon name="down" />} disabled={draft.actions.at(-1) === selected} onClick={() => move(1)} />
      <Button appearance="subtle" size="small" data-delete aria-label="删除动作" title="删除" icon={<Icon name="trash" />} disabled={draft.actions.length === 1}
        onClick={() => edit(() => { draft.actions = draft.actions.filter(a => a.id !== selected.id); selectedId = draft.actions[0].id; })} />
    </div></div>
    <div className="form-grid">
      <Field label="动作名称"><Input value={selected.name} maxLength={20} input={controlData({ 'data-action-field': 'name' })} onChange={(_, data) => edit(() => { selected.name = data.value; })} /></Field>
      <Field label="动作图标"><IconPicker action={selected} /></Field>
      <Select label="动作类型" actionField="kind" value={selected.kind} options={['ai', 'copy', 'search'].map(kind => [kind, kindLabel(kind)])}
        onChange={value => edit(() => { selected.kind = value as Action['kind']; if (value === 'ai' && !selected.prompt) selected.prompt = '{text}'; })} />
    </div>
    {selected.kind === 'ai' ? <Field label="提示词" className="form-field" hint="{text} = 选中的文字 · 使用「模型」中的模型">
      <Textarea value={selected.prompt} rows={4} maxLength={12000} resize="vertical" spellCheck={false}
        textarea={controlData({ 'data-action-field': 'prompt' })} onChange={(_, data) => edit(() => { selected.prompt = data.value; })} />
    </Field> : <div className="action-description"><Icon name={selected.icon} /><p>{selected.kind === 'copy' ? '将当前选中的文字复制到剪贴板，然后收起浮条。' : '使用 Google 搜索选中文字，在默认浏览器中打开。'}</p></div>}
    </div></div>
    <div className="inline-preview"><span>浮条预览</span><Toolbar settings={draft} /></div>
  </>;
}
function Model() {
  return <><p className="page-description">支持 OpenAI 兼容接口及本地模型服务。</p><section className="panel form-panel">
    <div className="panel-heading"><h3>连接配置</h3><span className="subtle-badge">OpenAI compatible</span></div>
    <Field label="API 地址" hint="填写服务商提供的 API 根地址，例如以 /v1 结尾的地址。"><Input type="url" value={draft.provider.baseUrl} placeholder="https://your-provider.com/v1" spellCheck={false} input={controlData({ 'data-field': 'baseUrl' })} onChange={(_, data) => edit(() => { draft.provider.baseUrl = data.value; })} /></Field>
    <Field label="模型名称"><Input value={draft.provider.model} placeholder="填写服务商提供的模型 ID" spellCheck={false} input={controlData({ 'data-field': 'model' })} onChange={(_, data) => edit(() => { draft.provider.model = data.value; })} /></Field>
    <Field label="API Key" hint="本地模型可留空"><Input type="password" value={keyUpdate || ''} autoComplete="off" input={controlData({ 'data-key': '' })}
      placeholder={snapshot.hasKey && keyUpdate === undefined ? '已保存密钥 · 留空保留原密钥' : '粘贴你的 API Key'}
      onChange={(_, data) => edit(() => { keyUpdate = data.value || undefined; })} /></Field>
    <div className="key-note"><span><Icon name="check" /> 密钥使用 Windows 系统加密后保存在本机</span>{snapshot.hasKey && <Button appearance="transparent" size="small" data-clear-key onClick={() => { edit(() => { keyUpdate = ''; }); toast('保存设置后将清除密钥。'); }}>清除已保存密钥</Button>}</div>
  </section><div className="quiet-note"><Icon name="sparkles" /><p>只有点击 AI 动作时，选中文字才会发送到这里配置的服务。复制与搜索不调用模型。</p></div></>;
}
function Triggers() {
  const [apps, setApps] = useState(draft.excludedApps.join('\n'));
  // Preserve empty lines while editing, rather than normalizing the controlled textarea on each key.
  return <><p className="page-description">自动浮现，或用一个快捷键主动呼出。</p><section className="panel form-panel">
    <SettingSwitch label="启用划词助手" description="关闭后停止系统划词监听。" field="enabled" />
    <Select label="触发方式" field="trigger" value={draft.trigger} options={[[ 'automatic', '选中文字后自动显示'], ['shortcut', '仅使用快捷键']]} onChange={value => edit(() => { draft.trigger = value as Settings['trigger']; })} />
    <Field label="全局快捷键" hint="例如 CommandOrControl+Alt+G。自动模式下也能使用快捷键。"><Input value={draft.shortcut} spellCheck={false} input={controlData({ 'data-field': 'shortcut' })} onChange={(_, data) => edit(() => { draft.shortcut = data.value; })} /></Field>
    <SettingSwitch label="允许复制取词" description="辅助接口取不到文字时，尝试复制并恢复剪贴板。" field="clipboardFallback" />
    <Field label="在这些应用中停用" hint="每行一个程序名。终端默认排除，以避免复制快捷键干扰命令。"><Textarea rows={4} value={apps} resize="vertical" spellCheck={false} placeholder="例如 WindowsTerminal.exe" textarea={controlData({ 'data-apps': '' })}
      onChange={(_, data) => { setApps(data.value); edit(() => { draft.excludedApps = data.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean); }); }} /></Field>
  </section></>;
}
function Appearance() {
  return <><p className="page-description">设置主题、强调色和浮条显示方式。</p><section className="panel form-panel">
    <Field label="主题"><div className="theme-options">{[['light','浅色'],['dark','深色'],['system','跟随系统']].map(([value,label]) =>
      <ToggleButton key={value} checked={draft.theme === value} data-theme={value} onClick={() => edit(() => { draft.theme = value as Settings['theme']; })}>{label}</ToggleButton>)}</div></Field>
    <Field label="强调色"><div className="accent-options">{[['blue','蓝色'],['violet','紫色'],['teal','绿色'],['amber','琥珀色']].map(([value,label]) =>
      <ToggleButton key={value} checked={draft.accent === value} data-accent={value} icon={<span className={'accent-dot dot-' + value} />} onClick={() => edit(() => { draft.accent = value as Settings['accent']; })}>{label}</ToggleButton>)}</div></Field>
    <Field label="浮条密度"><div className="density-options" role="group" aria-label="浮条密度">{([['comfortable','舒适 · 图标与文字'],['compact','紧凑 · 仅图标']] as const).map(([value,label]) =>
      <ToggleButton key={value} checked={draft.density === value} data-density={value} onClick={() => edit(() => { draft.density = value; })}>{label}</ToggleButton>)}</div></Field>
  </section><section className="appearance-preview"><span className="eyebrow">实时预览</span><Toolbar settings={draft} /></section></>;
}
function Diagnostics() {
  const status = snapshot.status;
  return <><p className="page-description">查看取词状态和最近事件。运行日志不包含原文、回复或密钥。</p>
    <section className="panel"><div className="panel-heading"><h3>运行状态</h3><Button size="small" data-restart icon={<Icon name="refresh" />} onClick={() => void perform(async () => { await window.glint.restart(); toast('正在重新启动取词引擎'); })}>重启取词引擎</Button></div>
    <div className="diagnostic-row"><span>取词引擎</span><strong>{status.message}</strong></div>
    <div className="diagnostic-row"><span>全局快捷键</span><strong>{status.shortcutReady ? '注册成功' : '注册失败，请修改快捷键'}</strong></div>
    <div className="diagnostic-row"><span>上次取词</span><strong>{status.lastSelection ? status.lastSelection.app + ' · ' + status.lastSelection.method + ' · ' + status.lastSelection.length + ' 字符' : '尚未触发'}</strong></div></section>
    <section className="panel events-panel"><div className="panel-heading"><h3>最近事件</h3><span className="subtle-badge">本次会话 · 最近 20 条</span></div>
    <div className="events-list" role="region" aria-label="最近事件" tabIndex={0}>{status.events.length ? status.events.map((e, index) => <div className="log-entry" key={index}><time>{e.time}</time><span>{e.message}</span></div>) : <div className="empty-state">开始划词后，事件会出现在这里。</div>}</div></section>
    <div className="quiet-note"><Icon name="activity" /><p>没有弹出浮条时，可先尝试快捷键，再检查应用排除列表。图片和扫描版 PDF 尚不支持。</p></div></>;
}
let resetVersion = 0;
async function save() {
  if (busy) return;
  busy = true; emit();
  // Edits stay disabled until the main process acknowledges this exact draft.
  try {
    const response = await window.glint.save(structuredClone(draft), keyUpdate);
    if (!response.ok) { toast(response.error || '保存失败', true); return; }
    snapshot = await window.glint.snapshot(); draft = structuredClone(snapshot.settings);
    keyUpdate = undefined; dirty = false; resetVersion++; toast('设置已保存');
  } finally { busy = false; emit(); }
}
function SettingsView() {
  const current = pages.find(p => p.id === page)!;
  const Contents = ({ actions: Actions, model: Model, triggers: Triggers, appearance: Appearance, diagnostics: Diagnostics })[page]!;
  return <div className={'app-shell ' + (snapshot.settingsMaximized ? 'maximized' : '')}>
    <header className="settings-titlebar"><div className="brand"><Brand /><span className="brand-wordmark"><span>Glint</span><small className="version-label">{GLINT_APP_VERSION}</small></span></div><h1>{current.title}</h1>
      <span id="engine-status" className="status-badge" data-state={snapshot.status.hook}><i /><span>{({ starting: '正在连接', ready: '划词已就绪', paused: '已暂停', error: '需要检查' })[snapshot.status.hook]}</span></span>
      <div className="window-controls">{(['minimize','maximize','close'] as const).map(action => {
        const label = action === 'minimize' ? '最小化' : action === 'close' ? '关闭设置' : snapshot.settingsMaximized ? '向下还原' : '最大化';
        return <Button key={action} appearance="subtle" size="small" data-window={action} className={action === 'close' ? 'window-close' : ''} title={label} aria-label={label}
          icon={<Icon name={action === 'minimize' ? 'minus' : action === 'close' ? 'close' : snapshot.settingsMaximized ? 'copy' : 'square'} />} onClick={() => void perform(() => window.glint.settingsWindow(action))} />;
      })}</div>
    </header>
    <aside className="sidebar"><TabList vertical size="small" selectedValue={page} onTabSelect={(_, data) => { page = String(data.value); emit(); }} aria-label="设置导航">
      {pages.map(p => <Tab key={p.id} value={p.id} data-page={p.id} icon={<Icon name={p.icon} />}>{p.title}</Tab>)}
    </TabList><div className="sidebar-bottom"><Button appearance="subtle" size="small" className="quit-button" data-quit icon={<Icon name="power" />} onClick={() => void perform(() => window.glint.quit())}>退出 Glint</Button></div></aside>
    <main className="workspace"><div className={'page-content' + (page === 'diagnostics' ? ' diagnostics-page' : '')} inert={busy}>
      <FadeSnappy.In key={page + resetVersion}><div role="tabpanel" aria-label={current.title}><Contents /></div></FadeSnappy.In>
    </div><footer className="save-bar"><span id="save-note">{dirty ? '有尚未保存的更改' : '设置保存在本机'}</span><div>
      <Button data-revert disabled={!dirty || busy} onClick={() => { draft = structuredClone(snapshot.settings); keyUpdate = undefined; dirty = false; resetVersion++; emit(); }}>撤销更改</Button>
      <Button appearance="primary" data-save disabled={busy} icon={busy ? <Spinner size="tiny" /> : <Icon name="check" />} onClick={() => void perform(save)}>{busy ? '保存中…' : '保存设置'}</Button>
    </div></footer></main>
  </div>;
}
function Result({ state }: { state?: ResultState }) {
  const [expanded, setExpanded] = useState(false);
  const [recording, setRecording] = useState(false);
  const sourceId = useId('source');
  return <div className="result-shell"><header className="result-header"><div className="result-heading">
    <span className="result-action" title={state?.actionName}><Icon name={state?.actionIcon || 'sparkles'} /><strong>{state?.actionName || '结果'}</strong></span>
    <span className="result-header-divider" /><span className="result-app" title={state?.app}>{state?.app}</span>{state?.demo && <span className="result-demo">演示</span>}
  </div><Button appearance="subtle" size="small" className="result-close" data-close-result aria-label="关闭结果卡片" icon={<Icon name="close" />} onClick={() => void perform(() => window.glint.dismiss())} /></header>
    <div className="result-content">
      <div className="source-details"><Button appearance="subtle" size="small" aria-expanded={expanded} aria-controls={sourceId}
        icon={<Icon name={expanded ? 'chevron-down' : 'chevron-right'} />} onClick={() => setExpanded(!expanded)}>查看原文</Button>
        <CollapseSnappy visible={expanded} unmountOnExit><div id={sourceId}><p id="source-text">{state?.source}</p></div></CollapseSnappy>
      </div>
      {state?.busy && !state.text && !state.error && <Spinner id="result-loading" size="small" className="request-loading" aria-label="正在请求模型" />}
      <div id="answer" className="answer" aria-busy={state?.busy}>{state?.text}</div>
      {state?.error && <MessageBar intent="error" id="result-error"><MessageBarBody>{state.error}</MessageBarBody></MessageBar>}
    </div>
    <footer className="result-footer"><span id="result-state" role="status">{state?.busy ? '正在生成' : state?.error ? '已停止' : '已完成'}</span><div>
      <Button size="small" id="result-stop" data-cancel disabled={!state?.busy} icon={<Icon name="stop" />} onClick={() => void perform(() => window.glint.cancel())}>停止</Button>
      <Button size="small" id="result-retry" data-retry-result disabled={!state || state.busy} icon={<Icon name="rotate-cw" />} onClick={() => void perform(() => window.glint.retryResult())}>重试</Button>
      <Button size="small" id="result-copy" className="secondary" data-copy-result disabled={!state?.text} icon={<Icon name="copy" />} onClick={() => void perform(async () => { if (await window.glint.copyResult()) toast('已复制'); })}>复制</Button>
      {state?.recordKind && <Button appearance="primary" size="small" id="result-record" className="primary" data-record-source
        disabled={recording || state.recorded || state.busy || !state.text.trim() || !state.source.trim()} icon={<Icon name={state.recorded ? 'bookmark-check' : 'bookmark'} />}
        onClick={() => void perform(async () => { setRecording(true); try { const r = await window.glint.recordSource(state.id); toast(r.ok ? '原文与结果已记录' : r.error || '记录失败', !r.ok); } finally { setRecording(false); } })}>{state.recorded ? '已记录' : '记录'}</Button>}
    </div></footer>
  </div>;
}
function Notices() {
  const toasterId = useId('glint-toaster');
  const { dispatchToast } = useToastController(toasterId);
  useEffect(() => {
    if (notice.id) dispatchToast(<Toast><ToastTitle>{notice.message}</ToastTitle></Toast>, { intent: notice.error ? 'error' : 'success', timeout: 3500 });
  }, [notice.id, dispatchToast]);
  return <Toaster toasterId={toasterId} position="bottom" limit={1} />;
}
function App() {
  useSyncExternalStore(subscribe, () => revision);
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  const settings = view === 'settings' ? draft : snapshot.settings;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  const theme = useMemo(() => {
    const ramp = Object.fromEntries(ramps[settings.accent].map((color, index) => [(index + 1) * 10, color])) as BrandVariants;
    return { ...(dark ? createDarkTheme(ramp) : createLightTheme(ramp)), fontFamilyBase: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif', fontSizeBase300: '13px', lineHeightBase300: '18px' };
  }, [dark, settings.accent]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.accent = settings.accent;
    document.documentElement.dataset.density = settings.density;
    document.body.className = view + '-body';
  }, [dark, settings.accent, settings.density]);
  return <FluentProvider theme={theme} applyStylesToPortals={false} className={'glint-provider ' + view + '-provider'}>
    {view === 'settings' ? <SettingsView /> : view === 'result' ? <Result key={snapshot.result?.id} state={snapshot.result} />
      : <FadeSnappy.In key={snapshot.selection?.id}><div className="toolbar-wrap"><Toolbar settings={settings} live /></div></FadeSnappy.In>}
    <Notices />
  </FluentProvider>;
}
document.addEventListener('keydown', event => { if (event.key === 'Escape' && view !== 'settings') void perform(() => window.glint.dismiss()); });
async function boot() {
  snapshot = await window.glint.snapshot(); draft = structuredClone(snapshot.settings); selectedId = draft.actions[0].id;
  window.glint.subscribe(event => {
    if (event.type === 'snapshot') {
      snapshot = event.snapshot;
      if (view === 'settings' && !dirty && !busy && JSON.stringify(draft) !== JSON.stringify(snapshot.settings)) {
        draft = structuredClone(snapshot.settings); resetVersion++;
        if (!draft.actions.some(a => a.id === selectedId)) selectedId = draft.actions[0].id;
      }
    } else if (event.type === 'settings-window') snapshot = { ...snapshot, settingsMaximized: event.maximized };
    else if (event.type === 'result') snapshot = { ...snapshot, result: event.result };
    emit();
  });
  createRoot(document.getElementById('app')!).render(<App />);
}
boot().catch(error => { document.getElementById('app')!.textContent = 'Glint 无法加载：' + String(error); });
