import { useLayoutEffect, useRef } from 'react';
import { Button } from '@fluentui/react-components';
import type { Settings } from '../core';
import { Icon, Brand } from './Icon';
import { perform, toast, useAppState } from './state';
export function Toolbar({ settings, live = false }: { settings: Settings; live?: boolean }) {
  const { snapshot } = useAppState();
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
