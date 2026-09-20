import { useEffect, useState } from 'react';
import type { GlintAPI, RecordKind, RecordPage, SavedRecord } from '../core';
export type HistoryAPI = Pick<GlintAPI, 'listRecords' | 'getRecord' | 'copyRecord' | 'deleteRecord' | 'subscribe'>;
export type HistoryNotify = (message: string, error?: boolean) => void;
export function useHistoryRecords(kind: RecordKind, api: HistoryAPI, notify: HistoryNotify) {
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
  const [deleting, setDeleting] = useState(false);
  const refresh = () => { setPage(0); setRevision(value => value + 1); };

  useEffect(() => api.subscribe(event => {
    if (event.type === 'records-changed' && event.kind === kind) {
      if (event.deletedId) setSelected(current => current === event.deletedId ? '' : current);
      else setPage(0);
      setRevision(value => value + 1);
    }
  }), [api, kind]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    api.listRecords(kind, page).then(next => {
      if (cancelled) return;
      setData(next);
      setPage(next.page);
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
    if (!record || copying || deleting) return;
    setCopying(true);
    try {
      const copied = await api.copyRecord(kind, record.id, field);
      notify(copied ? (field === 'original' ? '原文已复制' : '结果已复制') : '记录为空或已不可用', !copied);
    } catch { notify('复制失败，请重试。', true); }
    finally { setCopying(false); }
  };

  const remove = async () => {
    if (!record || deleting || copying) return;
    setDeleting(true);
    try {
      const deleted = await api.deleteRecord(kind, record.id);
      notify(deleted ? '记录已删除' : '这条记录已不存在');
    } catch { notify('删除失败，请重试。', true); }
    finally { setDeleting(false); }
  };

  return { data, loading, error, selected, record, detailLoading, detailError, copying, deleting, refresh, copy, remove, setSelected, setPage };
}
