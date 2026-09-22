import path from 'node:path';
import { defaults } from './core';
import type { DesktopPlatform, Settings } from './core';

export function xwaylandRelaunch(argv: string[], executable: string, appImage?: { file: string; directory: string }): { execPath: string; args: string[] } | undefined {
  const args: string[] = [];
  let ozone: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ozone-platform') ozone = argv[++i];
    else if (argv[i].startsWith('--ozone-platform=')) ozone = argv[i].slice('--ozone-platform='.length);
    else args.push(argv[i]);
  }
  if (ozone === 'x11') return;
  const image = appImage && path.dirname(executable) === path.resolve(appImage.directory) ? appImage.file : undefined;
  // AppImage's mount/extraction disappears when the first process exits.
  return { execPath: image || executable, args: [...(image ? ['--appimage-extract-and-run'] : []), ...args, '--ozone-platform=x11'] };
}

export function desktopPlatform(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): DesktopPlatform {
  if (platform === 'win32') return 'windows';
  // Match selection-hook: XDG_SESSION_TYPE alone does not select its Wayland backend.
  if (platform === 'linux') return env.WAYLAND_DISPLAY ? 'linux-wayland' : 'linux-x11';
  return 'unsupported';
}

export function platformDefaults(platform: DesktopPlatform): Settings {
  const settings = structuredClone(defaults);
  if (platform.startsWith('linux')) {
    settings.excludedApps = platform === 'linux-wayland' ? [] : ['konsole', 'gnome-terminal', 'kitty', 'alacritty', 'xterm'];
    // Wayland cannot apply app exclusions, so capture starts as an explicit action.
    if (platform === 'linux-wayland') settings.trigger = 'shortcut';
  }
  return settings;
}

export function settingsForSession(saved: Settings, platform: DesktopPlatform, waylandTrigger?: Settings['trigger']): Settings {
  const settings = structuredClone(saved);
  if (platform.startsWith('linux')) settings.selectionMethod = 'accessibility';
  if (platform === 'linux-wayland') {
    settings.trigger = waylandTrigger ?? (saved.excludedApps.length ? 'shortcut' : saved.trigger);
    settings.excludedApps = [];
  }
  return settings;
}

export function settingsForStorage(next: Settings, saved: Settings, platform: DesktopPlatform): Settings {
  const settings = structuredClone(next);
  // Saving unrelated preferences must not erase options unavailable in this session.
  if (platform.startsWith('linux')) settings.selectionMethod = saved.selectionMethod;
  if (platform === 'linux-wayland') {
    settings.excludedApps = [...saved.excludedApps];
    settings.trigger = saved.trigger;
  }
  return settings;
}

export function validatePlatformSettings(settings: Settings, platform: DesktopPlatform) {
  if (platform.startsWith('linux') && settings.selectionMethod !== 'accessibility') throw new Error('Linux 仅支持 PRIMARY 选区，不支持复制取词。');
  if (platform === 'linux-wayland' && settings.excludedApps.length) throw new Error('Wayland 无法识别来源应用，不能使用应用排除规则。');
}

export function credentialsAvailable(platform: NodeJS.Platform, encryptionAvailable: boolean, backend?: string): boolean {
  return encryptionAvailable && (platform !== 'linux' || Boolean(backend && !['basic_text', 'unknown'].includes(backend)));
}

export function validScreenPoint(point: { x: number; y: number } | undefined): point is { x: number; y: number } {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x !== -99999 && point.y !== -99999;
}
