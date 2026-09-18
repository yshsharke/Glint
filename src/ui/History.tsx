import { useEffect, useState } from 'react';
import { Button, MessageBar, MessageBarBody, Spinner, Tab, TabList } from '@fluentui/react-components';
import type { Action, GlintAPI, RecordKind, RecordPage, SavedRecord } from '../core';
import { iconName } from '../icons';

const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function recordTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : dateFormat.format(date);
}
function HistoryIcon({ name }: { name: string }) { return <span className={'icon lucide-' + iconName(name)} aria-hidden="true" />; }

export function History({ actions, api, notify }: { actions: Action[]; api: GlintAPI; notify: (message: string, error?: boolean) => void }) {
  const categories = actions.filter(action => action.kind === 'ai');
  const [selectedKind, setKind] = useState<RecordKind>('translation');
  const current = categories.find(action => action.englishName === selectedKind) || categories[0];
  if (!current) return <div className="history-empty"><HistoryIcon name="book" /><strong>还没有指令动作</strong><span>在动作页添加并保存指令后，即可记录和查看历史。</span></div>;
  const kind = current.englishName;
  return <>
    <TabList className="history-tabs" size="small" selectedValue={kind} aria-label="历史分类"
      onTabSelect={(_, data) => setKind(data.value as RecordKind)}>
      {categories.map(category => <Tab key={category.id} value={category.englishName} data-history-kind={category.englishName}
        icon={<HistoryIcon name={category.icon} />}>{category.name}</Tab>)}
    </TabList>
    <HistoryRecords key={kind} kind={kind} label={current.name} api={api} notify={notify} />
  </>;
}

function HistoryRecords({ kind, label, api, notify }: { kind: RecordKind; label: string; api: GlintAPI; notify: (message: string, error?: boolean) => void }) {
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<RecordPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [record, setRecord] = useState<SavedRecord>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [copying, setCopying] = useState(false);
  const refresh = () => { setPage(0); setRevision(value => value + 1); };

  useEffect(() => api.subscribe(event => {
    if (event.type === 'records-changed' && event.kind === kind) {
      setPage(0); setRevision(value => value + 1);
    }
  }), [api, kind]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    api.listRecords(kind, page).then(next => {
      if (cancelled) return;
      setData(next);
      setSelected(current => next.items.some(item => item.id === current) ? current : next.items[0]?.id || '');
    }).catch(() => {
      if (!cancelled) { setData(undefined); setSelected(''); setError('无法读取记录，请稍后刷新重试。'); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, kind, page, revision]);

  useEffect(() => {
    let cancelled = false;
    setRecord(undefined); setDetailError(''); setDetailLoading(Boolean(selected));
    if (selected) api.getRecord(kind, selected).then(next => {
      if (!cancelled) {
        setRecord(next);
        if (!next) setDetailError('这条记录已不可用，请刷新列表。');
      }
    }).catch(() => { if (!cancelled) setDetailError('无法读取这条记录，请刷新重试。'); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [api, kind, selected, revision]);

  const copy = async (field: 'original' | 'result') => {
    if (!record || copying) return;
    setCopying(true);
    try {
      const copied = await api.copyRecord(kind, record.id, field);
      notify(copied ? (field === 'original' ? '原文已复制' : '结果已复制') : '记录为空或已不可用', !copied);
    } catch { notify('复制失败，请重试。', true); }
    finally { setCopying(false); }
  };

  return <div className="history-content" role="tabpanel" aria-label={`${label}记录`}>
    <div className="history-tools"><span role="status">{loading ? '正在读取记录…' : data ? `共 ${data.total} 条 · 最新在前` : '读取失败'}</span>
      <Button size="small" appearance="subtle" data-history-refresh icon={<HistoryIcon name="refresh" />} onClick={refresh} disabled={loading}>刷新</Button>
    </div>
    {error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
      : loading ? <div className="history-empty"><Spinner size="small" aria-label="正在读取历史记录" /></div>
      : !data?.items.length ? <div className="history-empty"><HistoryIcon name="book" /><strong>还没有{label}记录</strong><span>在{label}结果卡片中点击「记录」，即可在这里查看。</span></div>
      : <div className="history-workbench">
        <div className="history-list-pane"><div className="history-list" aria-label={`${label}记录列表`}>
          {data.items.map(item => <Button key={item.id} appearance="subtle" className="history-item" data-history-id={item.id}
            aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
            <span className="history-item-meta"><time dateTime={item.createdAt}>{recordTime(item.createdAt)}</time><span title={item.processName}>{item.processName || '未知来源'}</span></span>
            <span className="history-preview">{item.preview}</span>
          </Button>)}
        </div><div className="history-pagination"><span>{data.page + 1} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
          <Button size="small" appearance="subtle" data-history-prev aria-label="上一页" icon={<HistoryIcon name="chevron-left" />} disabled={data.page === 0} onClick={() => setPage(data.page - 1)} />
          <Button size="small" appearance="subtle" data-history-next aria-label="下一页" icon={<HistoryIcon name="chevron-right" />} disabled={(data.page + 1) * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)} />
        </div></div>
        <div className="history-detail" aria-label="记录详情" aria-busy={detailLoading}>
          {detailError ? <MessageBar intent="error"><MessageBarBody>{detailError}</MessageBarBody></MessageBar>
            : !record || record.id !== selected || detailLoading ? <div className="history-empty"><Spinner size="small" aria-label="正在读取记录详情" /></div>
            : <><div className="history-detail-meta"><span title={record.processName}>{record.processName || '未知来源'}</span><time dateTime={record.createdAt}>{recordTime(record.createdAt)}</time></div>
              <div className="history-detail-scroll" tabIndex={0}>
                <section className="history-text"><div><h3>原文</h3><Button size="small" appearance="subtle" data-history-copy="original" disabled={copying || !record.originalText} icon={<HistoryIcon name="copy" />} onClick={() => void copy('original')}>复制</Button></div><p data-history-original>{record.originalText}</p></section>
                <section className="history-text"><div><h3>{label}结果</h3><Button size="small" appearance="subtle" data-history-copy="result" disabled={copying || !record.resultText} icon={<HistoryIcon name="copy" />} onClick={() => void copy('result')}>复制</Button></div>{record.resultText ? <p data-history-result>{record.resultText}</p> : <p className="history-missing">这条旧记录未保存结果。</p>}</section>
              </div></>}
        </div>
      </div>}
  </div>;
}
