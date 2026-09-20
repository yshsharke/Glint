import { useState } from 'react';
import { Button, MessageBar, MessageBarBody, useId } from '@fluentui/react-components';
import type { ResultState } from '../core';
import { Icon } from './Icon';
import { CollapseSnappy } from './motion';
import { perform, toast } from './state';
export function Result({ state }: { state?: ResultState }) {
  const [expanded, setExpanded] = useState(false);
  const [recording, setRecording] = useState(false);
  const sourceId = useId('source');
  return <div className="result-shell"><header className="result-header"><div className="result-heading">
    <span className="result-action" title={state?.actionName}><Icon name={state?.actionIcon || 'sparkles'} /><strong>{state?.actionName || '结果'}</strong></span>
    <span className="result-header-divider" /><span className="result-app" title={state?.app}>{state?.app}</span>{state?.demo && <span className="result-demo">演示</span>}
  </div><Button appearance="subtle" size="small" className="result-close" data-close-result aria-label="关闭结果卡片" icon={<Icon name="close" />} onClick={() => void perform(() => window.glint.dismiss())} /></header>
    <div className="result-content">
      <div className="source-details"><Button appearance="transparent" size="small" className="source-toggle" aria-expanded={expanded} aria-controls={sourceId}
        icon={<Icon name={expanded ? 'chevron-down' : 'chevron-right'} />} onClick={() => setExpanded(!expanded)}>查看原文</Button>
        <CollapseSnappy visible={expanded} unmountOnExit><div id={sourceId}><p id="source-text">{state?.source}</p></div></CollapseSnappy>
      </div>
      {state?.busy && !state.text && !state.error && <div id="result-loading" className="request-loading" role="status" aria-label="正在请求模型">
        <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
      </div>}
      <div id="answer" className="answer" aria-busy={state?.busy}>{state?.text}</div>
      {state?.error && <MessageBar intent="error" id="result-error"><MessageBarBody>{state.error}</MessageBarBody></MessageBar>}
    </div>
    <footer className="result-footer"><span id="result-state" role="status">{state?.busy ? '正在生成' : state?.error ? '已停止' : '已完成'}</span><div>
      <Button size="medium" id="result-stop" data-cancel disabled={!state?.busy} icon={<Icon name="stop" />} onClick={() => void perform(() => window.glint.cancel())}>停止</Button>
      <Button size="medium" id="result-retry" data-retry-result disabled={!state || state.busy} icon={<Icon name="rotate-cw" />} onClick={() => void perform(() => window.glint.retryResult())}>重试</Button>
      <Button size="medium" id="result-copy" className="secondary" data-copy-result disabled={!state?.text} icon={<Icon name="copy" />} onClick={() => void perform(async () => { if (await window.glint.copyResult()) toast('已复制'); })}>复制</Button>
      {state?.recordKind && <Button appearance="primary" size="medium" id="result-record" className="primary" data-record-source
        disabled={recording || state.recorded || state.busy || !state.text.trim() || !state.source.trim()} icon={<Icon name={state.recorded ? 'bookmark-check' : 'bookmark'} />}
        onClick={() => void perform(async () => { setRecording(true); try { const r = await window.glint.recordSource(state.id); toast(r.ok ? '原文与结果已记录' : r.error || '记录失败', !r.ok); } finally { setRecording(false); } })}>{state.recorded ? '已记录' : '记录'}</Button>}
    </div></footer>
  </div>;
}
