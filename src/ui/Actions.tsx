import { Button, Field, Input, Textarea, Switch } from '@fluentui/react-components';
import type { Action } from '../core';
import { Icon } from './Icon';
import { IconPicker } from './IconPicker';
import { Toolbar } from './Toolbar';
import { Select, controlData } from './controls';
import { ui, useAppState, toast, perform } from './state';
const kindLabel = (kind: string) => ({ ai: '指令', search: '搜索' })[kind] || kind;
export function Actions() {
  const { draft, selectedId, snapshot } = useAppState();
  const selected = draft.actions.find(a => a.id === selectedId) || draft.actions[0];
  const move = (offset: number) => ui.edit(draft => {
    const at = draft.actions.findIndex(action => action.id === selected.id), next = at + offset;
    if (next >= 0 && next < draft.actions.length) [draft.actions[at], draft.actions[next]] = [draft.actions[next], draft.actions[at]];
  });
  return <>
    <p className="page-description section-summary">{draft.actions.length} 个动作 · 选择后编辑</p>
    <div className="action-workbench"><div className="action-list">{draft.actions.map(a => <div key={a.id} className={'action-row ' + (a.id === selected.id ? 'selected' : '')}>
      <Button appearance="subtle" className="action-select" data-select={a.id} aria-pressed={a.id === selected.id}
        icon={<Icon name={a.icon} />} onClick={() => ui.selectAction(a.id)}><span><strong>{a.name}</strong><small>{kindLabel(a.kind)}</small></span></Button>
      <Switch size="small" className="action-switch" checked={a.enabled} input={controlData({ 'data-toggle': a.id, 'aria-label': (a.enabled ? '停用' : '启用') + a.name })}
        onChange={(_, data) => {
          if (!data.checked && draft.actions.filter(item => item.enabled).length === 1) { toast('至少保留一个启用的动作。'); return; }
          ui.editAction(a.id, { enabled: data.checked });
        }} />
    </div>)}
      <div className="action-row action-create-row"><Button appearance="subtle" className="action-select" data-add icon={<Icon name="plus" />}
        disabled={draft.actions.length >= 12} onClick={() => {
          const action: Action = { id: crypto.randomUUID(), name: '新动作', englishName: '', icon: 'sparkles', kind: 'ai', enabled: true, prompt: '请处理以下文字：\n\n{text}' };
          ui.addAction(action);
        }}>新建</Button></div>
    </div>
    <div className="action-editor"><div className="editor-top"><span className="eyebrow">动作设置</span><div className="icon-tools">
      <Button appearance="subtle" size="small" data-move="up" aria-label="上移动作" title="上移" icon={<Icon name="up" />} disabled={draft.actions[0] === selected} onClick={() => move(-1)} />
      <Button appearance="subtle" size="small" data-move="down" aria-label="下移动作" title="下移" icon={<Icon name="down" />} disabled={draft.actions.at(-1) === selected} onClick={() => move(1)} />
      <Button appearance="subtle" size="small" data-delete aria-label="删除动作" title="删除" icon={<Icon name="trash" />} disabled={draft.actions.length === 1}
        onClick={() => ui.edit(draft => { draft.actions = draft.actions.filter(a => a.id !== selected.id); })} />
    </div></div>
    <div className="form-grid">
      <Field label="显示名称"><Input value={selected.name} maxLength={20} input={controlData({ 'data-action-field': 'name' })} onChange={(_, data) => ui.editAction(selected.id, { name: data.value })} /></Field>
      <Field label="动作图标"><IconPicker action={selected} /></Field>
      <Select label="动作类型" actionField="kind" value={selected.kind} options={['ai', 'search'].map(kind => [kind, kindLabel(kind)])}
        onChange={value => ui.editAction(selected.id, { kind: value as Action['kind'], prompt: value === 'ai' && !selected.prompt ? '{text}' : selected.prompt })} />
    </div>
    {!snapshot.settings.actions.some(action => action.id === selected.id) && <Field label="英文名称" className="form-field"
      hint="小写字母开头，可含数字和下划线，例如 summary；首次保存后固定。">
      <Input value={selected.englishName} maxLength={48} spellCheck={false}
        placeholder="例如 summary" input={controlData({ 'data-action-field': 'englishName' })}
        onChange={(_, data) => ui.editAction(selected.id, { englishName: data.value })} />
    </Field>}
    {selected.kind === 'ai' ? <Field label="提示词" className="form-field prompt-field" hint="{text} = 选中的文字 · 使用「模型」中的模型">
      <Textarea value={selected.prompt} rows={4} maxLength={12000} resize="none" spellCheck={false}
        textarea={controlData({ 'data-action-field': 'prompt' })} onChange={(_, data) => ui.editAction(selected.id, { prompt: data.value })} />
    </Field> : <div className="action-description"><Icon name={selected.icon} /><p>使用 Google 搜索选中文字，在默认浏览器中打开。</p></div>}
    </div></div>
    <div className="inline-preview"><span>浮条预览</span><Toolbar settings={draft} />
      <Button size="small" className="preview-test" data-demo onClick={() => void perform(() => window.glint.demo())}>测试浮条</Button>
    </div>
  </>;
}
