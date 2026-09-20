import { useState } from 'react';
import { Button, Field, Input, Textarea, ToggleButton, TabList, Tab, Spinner } from '@fluentui/react-components';
import type { Settings } from '../core';
import type { SettingsPage } from './renderer-store';
import { Brand, Icon } from './Icon';
import { Actions } from './Actions';
import { History } from './History';
import { Toolbar } from './Toolbar';
import { Select, SettingSwitch, controlData } from './controls';
import { FadeSnappy } from './motion';
import { ui, useAppState, perform, toast } from './state';
declare const GLINT_APP_VERSION: string;
const pages = [
  { id: 'actions', title: '动作', icon: 'sparkles' }, { id: 'model', title: '模型', icon: 'link' },
  { id: 'triggers', title: '触发', icon: 'zap' }, { id: 'appearance', title: '外观', icon: 'palette' },
  { id: 'history', title: '历史', icon: 'book' },
  { id: 'diagnostics', title: '诊断', icon: 'activity' },
];

function Model() {
  const { draft, keyUpdate, snapshot } = useAppState();
  return <><p className="page-description">支持 OpenAI 兼容接口及本地模型服务。</p><section className="panel form-panel">
    <div className="panel-heading"><h3>连接配置</h3><span className="subtle-badge">OpenAI compatible</span></div>
    <Field label="API 地址" hint="填写服务商提供的 API 根地址，例如以 /v1 结尾的地址。"><Input type="url" value={draft.provider.baseUrl} placeholder="https://your-provider.com/v1" spellCheck={false} input={controlData({ 'data-field': 'baseUrl' })} onChange={(_, data) => ui.edit(draft => { draft.provider.baseUrl = data.value; })} /></Field>
    <Field label="模型名称"><Input value={draft.provider.model} placeholder="填写服务商提供的模型 ID" spellCheck={false} input={controlData({ 'data-field': 'model' })} onChange={(_, data) => ui.edit(draft => { draft.provider.model = data.value; })} /></Field>
    <Field label="API Key" hint="本地模型可留空"><Input type="password" value={keyUpdate || ''} autoComplete="off" input={controlData({ 'data-key': '' })}
      placeholder={snapshot.hasKey && keyUpdate === undefined ? '已保存密钥 · 留空保留原密钥' : '粘贴你的 API Key'}
      onChange={(_, data) => ui.updateKey(data.value || undefined)} /></Field>
    <div className="key-note"><span><Icon name="check" /> 密钥使用 Windows 系统加密后保存在本机</span>{snapshot.hasKey && <Button appearance="transparent" size="small" data-clear-key onClick={() => { ui.updateKey(''); toast('保存设置后将清除密钥。'); }}>清除已保存密钥</Button>}</div>
  </section></>;
}

function Triggers() {
  const { draft } = useAppState();
  const [apps, setApps] = useState(draft.excludedApps.join('\n'));
  // Preserve empty lines while editing, rather than normalizing the controlled textarea on each key.
  return <><p className="page-description">自动浮现，或用一个快捷键主动呼出。</p><section className="panel form-panel">
    <SettingSwitch label="启用划词助手" description="关闭后停止系统划词监听。" field="enabled" />
    <Select label="触发方式" field="trigger" value={draft.trigger} options={[[ 'automatic', '选中文字后自动显示'], ['shortcut', '仅使用快捷键']]} onChange={value => ui.edit(draft => { draft.trigger = value as Settings['trigger']; })} />
    <Field label="全局快捷键" hint="例如 CommandOrControl+Alt+G。自动模式下也能使用快捷键。"><Input value={draft.shortcut} spellCheck={false} input={controlData({ 'data-field': 'shortcut' })} onChange={(_, data) => ui.edit(draft => { draft.shortcut = data.value; })} /></Field>
    <SettingSwitch label="允许复制取词" description="辅助接口取不到文字时，尝试复制并恢复剪贴板。" field="clipboardFallback" />
    <Field className="excluded-apps-field" label="在这些应用中停用" hint="每行一个程序名。终端默认排除，以避免复制快捷键干扰命令。"><Textarea rows={4} value={apps} resize="none" spellCheck={false} placeholder="例如 WindowsTerminal.exe" textarea={controlData({ 'data-apps': '' })}
      onChange={(_, data) => { setApps(data.value); ui.edit(draft => { draft.excludedApps = data.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean); }); }} /></Field>
  </section></>;
}

function Appearance() {
  const { draft } = useAppState();
  return <><p className="page-description">设置主题、强调色和浮条显示方式。</p><section className="panel form-panel">
    <Field label="主题"><div className="theme-options">{[['light','浅色'],['dark','深色'],['system','跟随系统']].map(([value,label]) =>
      <ToggleButton key={value} checked={draft.theme === value} data-theme={value} onClick={() => ui.edit(draft => { draft.theme = value as Settings['theme']; })}>{label}</ToggleButton>)}</div></Field>
    <Field label="强调色"><div className="accent-options">{[['blue','蓝色'],['violet','紫色'],['teal','绿色'],['amber','琥珀色']].map(([value,label]) =>
      <ToggleButton key={value} checked={draft.accent === value} data-accent={value} icon={<span className={'accent-dot dot-' + value} />} onClick={() => ui.edit(draft => { draft.accent = value as Settings['accent']; })}>{label}</ToggleButton>)}</div></Field>
    <Field label="浮条密度"><div className="density-options" role="group" aria-label="浮条密度">{([['comfortable','舒适 · 图标与文字'],['compact','紧凑 · 仅图标']] as const).map(([value,label]) =>
      <ToggleButton key={value} checked={draft.density === value} data-density={value} onClick={() => ui.edit(draft => { draft.density = value; })}>{label}</ToggleButton>)}</div></Field>
  </section><section className="appearance-preview"><span className="eyebrow">实时预览</span><Toolbar settings={draft} /></section></>;
}

function Diagnostics() {
  const { snapshot } = useAppState();
  const status = snapshot.status;
  return <><p className="page-description">查看取词状态和最近事件。运行日志不包含原文、回复或密钥。</p>
    <section className="panel"><div className="panel-heading"><h3>运行状态</h3><Button size="small" data-restart icon={<Icon name="refresh" />} onClick={() => void perform(async () => { await window.glint.restart(); toast('正在重新启动取词引擎'); })}>重启取词引擎</Button></div>
    <div className="diagnostic-row"><span>取词引擎</span><strong>{status.message}</strong></div>
    <div className="diagnostic-row"><span>全局快捷键</span><strong>{status.shortcutReady ? '注册成功' : '注册失败，请修改快捷键'}</strong></div>
    <div className="diagnostic-row"><span>上次取词</span><strong>{status.lastSelection ? status.lastSelection.app + ' · ' + status.lastSelection.method + ' · ' + status.lastSelection.length + ' 字符' : '尚未触发'}</strong></div></section>
    <section className="panel events-panel"><div className="panel-heading"><h3>最近事件</h3><span className="subtle-badge">本次会话 · 最近 20 条</span></div>
    <div className="events-list" role="region" aria-label="最近事件" tabIndex={0}>{status.events.length ? status.events.map((e, index) => <div className="log-entry" key={index}><time>{e.time}</time><span>{e.message}</span></div>) : <div className="empty-state">开始划词后，事件会出现在这里。</div>}</div></section>
    </>;
}

function HistoryPage() {
  const { snapshot, draft } = useAppState();
  const actions = snapshot.settings.actions.map(action => {
    const editing = draft.actions.find(item => item.id === action.id);
    return { ...action, name: editing?.name || action.name, icon: editing?.icon || action.icon };
  });
  return <><p className="page-description">按动作查看已保存的原文与结果。</p><History actions={actions} api={window.glint} notify={toast} /></>;
}
export function SettingsView() {
  const { snapshot, page, busy, dirty, resetVersion } = useAppState();
  const current = pages.find(p => p.id === page)!;
  const Contents = ({ actions: Actions, model: Model, triggers: Triggers, appearance: Appearance, history: HistoryPage, diagnostics: Diagnostics })[page]!;
  return <div className={'app-shell ' + (snapshot.settingsMaximized ? 'maximized' : '')}>
    <header className="settings-titlebar"><div className="brand"><Brand /><span className="brand-wordmark"><span>Glint</span><small className="version-label">{GLINT_APP_VERSION}</small></span></div><h1>{current.title}</h1>
      <span id="engine-status" className="status-badge" data-state={snapshot.status.hook}><i /><span>{({ starting: '正在连接', ready: '划词已就绪', paused: '已暂停', error: '需要检查' })[snapshot.status.hook]}</span></span>
      <div className="window-controls">{(['minimize','maximize','close'] as const).map(action => {
        const label = action === 'minimize' ? '最小化' : action === 'close' ? '关闭设置' : snapshot.settingsMaximized ? '向下还原' : '最大化';
        return <Button key={action} appearance="subtle" size="small" data-window={action} className={action === 'close' ? 'window-close' : ''} title={label} aria-label={label}
          icon={<Icon name={action === 'minimize' ? 'minus' : action === 'close' ? 'close' : snapshot.settingsMaximized ? 'copy' : 'square'} />} onClick={() => void perform(() => window.glint.settingsWindow(action))} />;
      })}</div>
    </header>
    <aside className="sidebar"><TabList vertical size="small" selectedValue={page} onTabSelect={(_, data) => ui.selectPage(data.value as SettingsPage)} aria-label="设置导航">
      {pages.map(p => <Tab key={p.id} value={p.id} data-page={p.id} icon={<Icon name={p.icon} />}>{p.title}</Tab>)}
    </TabList><div className="sidebar-bottom"><Button appearance="subtle" size="small" className="quit-button" data-quit icon={<Icon name="power" />} onClick={() => void perform(() => window.glint.quit())}>退出 Glint</Button></div></aside>
    <main className="workspace"><div className={'page-content' + (page === 'actions' ? ' actions-page' : page === 'triggers' ? ' triggers-page' : page === 'diagnostics' ? ' diagnostics-page' : page === 'history' ? ' history-page' : '')} inert={busy}>
      <FadeSnappy.In key={page === 'history' ? page : page + resetVersion}><div role="tabpanel" aria-label={current.title}><Contents /></div></FadeSnappy.In>
    </div><footer className="save-bar"><span id="save-note">{dirty ? '有尚未保存的更改' : '设置保存在本机'}</span><div>
      <Button data-revert disabled={!dirty || busy} onClick={() => ui.revert()}>撤销更改</Button>
      <Button appearance="primary" data-save disabled={busy} icon={busy ? <Spinner size="tiny" /> : <Icon name="check" />} onClick={() => void perform(() => ui.save(window.glint))}>{busy ? '保存中…' : '保存设置'}</Button>
    </div></footer></main>
  </div>;
}
