import type { SelectionHookConstructor, SelectionHookInstance } from 'selection-hook';
import type { DesktopPlatform, Settings } from './core';
import { validatePlatformSettings } from './platform';

type HookConfiguration = Pick<SelectionHookInstance, 'stop' | 'start' | 'isRunning' | 'linuxGetEnvInfo' | 'setGlobalFilterMode' | 'setFineTunedList' | 'setClipboardOnly' | 'disableClipboard' | 'enableClipboard' | 'setSelectionPassiveMode'>;
type HookConstants = Pick<SelectionHookConstructor, 'FilterMode' | 'FineTunedListType' | 'CompositorType'>;

export function configureSelectionHook(hook: HookConfiguration, Hook: HookConstants, settings: Settings,
  platform: DesktopPlatform, ownProcess: string, testing = false): { paused: boolean; message: string } {
  if (!settings.enabled) { hook.stop(); return { paused: true, message: '已暂停划词监听' }; }
  if (platform === 'unsupported') throw new Error('当前平台不支持系统取词。');
  validatePlatformSettings(settings, platform);
  const linux = platform.startsWith('linux');
  const info = linux ? hook.linuxGetEnvInfo() : null;
  if (platform === 'linux-wayland' && info?.compositorType === Hook.CompositorType.MUTTER) {
    throw new Error('GNOME Wayland 不提供 PRIMARY data-control 协议，请使用 X11 会话。');
  }
  if (!hook.isRunning() && !hook.start({ enableClipboard: false, enableMouseMoveEvent: false, selectionPassiveMode: true })) {
    throw new Error(linux ? '无法启动 PRIMARY 监听，请检查显示会话及 data-control 支持。' : '无法启动全局监听。');
  }
  hook.setGlobalFilterMode(Hook.FilterMode.EXCLUDE_LIST, platform === 'linux-wayland' ? [] : [
    ...settings.excludedApps, ...(testing ? [] : [ownProcess])
  ]);
  if (linux) hook.disableClipboard();
  else {
    hook.setFineTunedList(Hook.FineTunedListType.EXCLUDE_CLIPBOARD_CURSOR_DETECT, ['acrobat.exe', 'wps.exe', 'cajviewer.exe']);
    hook.setFineTunedList(Hook.FineTunedListType.INCLUDE_CLIPBOARD_DELAY_READ, ['acrobat.exe', 'wps.exe', 'cajviewer.exe', 'foxitphantom.exe', 'zotero.exe']);
    if (!hook.setClipboardOnly(settings.selectionMethod === 'clipboard')) throw new Error('取词引擎缺少复制模式支持，请重新构建或安装 Glint。');
    settings.selectionMethod === 'accessibility' ? hook.disableClipboard() : hook.enableClipboard();
  }
  hook.setSelectionPassiveMode(settings.trigger === 'shortcut');
  return { paused: false, message: platform === 'linux-wayland'
    ? info?.hasInputDeviceAccess
      ? 'Wayland 监听已启动（PRIMARY 需合成器提供 data-control）'
      : 'Wayland PRIMARY 已就绪（无全局输入事件）'
    : linux ? 'X11 PRIMARY 已就绪' : '取词引擎已就绪' };
}
