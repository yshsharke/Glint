import { useEffect, useState } from 'react';
import { Button, Input, TabList, Tab, ToggleButton, Dialog, DialogTrigger, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions } from '@fluentui/react-components';
import type { Action } from '../core';
import { iconName, findIcons, loadCatalog, iconCount } from '../icons';
import { Icon } from './Icon';
import { controlData } from './controls';
import { ui } from './state';
export function IconPicker({ action }: { action: Action }) {
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
              onClick={() => { ui.editAction(action.id, { icon: name }); onClose(); }}>
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
