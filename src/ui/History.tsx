import { useState } from 'react';
import { Button, MessageBar, MessageBarBody, Spinner, Tab, TabList, Tooltip } from '@fluentui/react-components';
import type { Action, RecordKind } from '../core';
import { Icon } from './Icon';
import { useHistoryRecords, type HistoryAPI, type HistoryNotify } from './useHistoryRecords';

const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function recordTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : dateFormat.format(date);
}

export function History({ actions, api, notify }: { actions: Action[]; api: HistoryAPI; notify: HistoryNotify }) {
  const categories = actions.filter(action => action.kind === 'ai');
  const [selectedKind, setKind] = useState<RecordKind>('translation');
  const current = categories.find(action => action.englishName === selectedKind) || categories[0];
  if (!current) return <div className="history-empty"><Icon name="book" /><strong>还没有指令动作</strong><span>在动作页添加并保存指令后，即可记录和查看历史。</span></div>;
  const kind = current.englishName;
  return <>
    <TabList className="history-tabs" size="small" selectedValue={kind} aria-label="历史分类"
      onTabSelect={(_, data) => setKind(data.value as RecordKind)}>
      {categories.map(category => <Tab key={category.id} value={category.englishName} data-history-kind={category.englishName}
        icon={<Icon name={category.icon} />}>{category.name}</Tab>)}
    </TabList>
    <HistoryRecords key={kind} kind={kind} label={current.name} api={api} notify={notify} />
  </>;
}

function HistoryRecords({ kind, label, api, notify }: { kind: RecordKind; label: string; api: HistoryAPI; notify: HistoryNotify }) {
  const { data, loading, error, selected, record, detailLoading, detailError, copying, deleting, refresh, copy, remove, setSelected, setPage } = useHistoryRecords(kind, api, notify);

  return <div className="history-content" role="tabpanel" aria-label={`${label}记录`}>
    <div className="history-tools"><span role="status">{loading ? '正在读取记录…' : data ? `共 ${data.total} 条 · 最新在前` : '读取失败'}</span>
      <Button size="small" appearance="subtle" data-history-refresh icon={<Icon name="refresh" />} onClick={refresh} disabled={loading}>刷新</Button>
    </div>
    {error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
      : loading ? <div className="history-empty"><Spinner size="small" aria-label="正在读取历史记录" /></div>
      : !data?.items.length ? <div className="history-empty"><Icon name="book" /><strong>还没有{label}记录</strong><span>在{label}结果卡片中点击「记录」，即可在这里查看。</span></div>
      : <div className="history-workbench">
        <div className="history-list-pane"><div className="history-list" aria-label={`${label}记录列表`}>
          {data.items.map(item => <Button key={item.id} appearance="subtle" className="history-item" data-history-id={item.id}
            aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
            <span className="history-item-meta"><time dateTime={item.createdAt}>{recordTime(item.createdAt)}</time><span title={item.processName}>{item.processName || '未知来源'}</span></span>
            <span className="history-preview">{item.preview}</span>
          </Button>)}
        </div><div className="history-pagination"><span>{data.page + 1} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
          <Button size="small" appearance="subtle" data-history-prev aria-label="上一页" icon={<Icon name="chevron-left" />} disabled={data.page === 0} onClick={() => setPage(data.page - 1)} />
          <Button size="small" appearance="subtle" data-history-next aria-label="下一页" icon={<Icon name="chevron-right" />} disabled={(data.page + 1) * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)} />
        </div></div>
        <div className="history-detail" aria-label="记录详情" aria-busy={detailLoading}>
          {detailError ? <MessageBar intent="error"><MessageBarBody>{detailError}</MessageBarBody></MessageBar>
            : !record || record.id !== selected || detailLoading ? <div className="history-empty"><Spinner size="small" aria-label="正在读取记录详情" /></div>
            : <><header className="history-detail-meta"><span title={record.processName}>{record.processName || '未知来源'}</span><time dateTime={record.createdAt}>{recordTime(record.createdAt)}</time>
                <div className="history-detail-actions">
                  <Tooltip content="复制原文" relationship="label"><Button size="small" appearance="subtle" data-history-copy="original" aria-label="复制原文" disabled={copying || deleting || !record.originalText} icon={<Icon name="clipboard-copy" />} onClick={() => void copy('original')} /></Tooltip>
                  <Tooltip content="复制结果" relationship="label"><Button size="small" appearance="subtle" data-history-copy="result" aria-label="复制结果" disabled={copying || deleting || !record.resultText} icon={<Icon name="copy" />} onClick={() => void copy('result')} /></Tooltip>
                  <Tooltip content="删除记录" relationship="label"><Button size="small" appearance="subtle" className="history-delete" data-history-delete aria-label="删除记录" disabled={copying || deleting} icon={<Icon name="trash" />} onClick={() => void remove()} /></Tooltip>
                </div>
              </header>
              <div className="history-detail-body" key={record.id}>
                <section className="history-text" tabIndex={0} aria-label="原文"><p data-history-original>{record.originalText}</p></section>
                <section className="history-text" tabIndex={0} aria-label="结果">{record.resultText ? <p data-history-result>{record.resultText}</p> : <p className="history-missing">这条旧记录未保存结果。</p>}</section>
              </div></>}
        </div>
      </div>}
  </div>;
}
