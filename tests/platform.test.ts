import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { LinuxEnvInfo } from 'selection-hook';
import { defaults } from '../src/core';
import { credentialsAvailable, desktopPlatform, platformDefaults, settingsForSession, settingsForStorage, validScreenPoint, validatePlatformSettings, xwaylandRelaunch } from '../src/platform';
import { configureSelectionHook } from '../src/selection-config';
import { runtimePaths } from '../src/runtime-paths';

const constants = {
  FilterMode: { DEFAULT: 0, INCLUDE_LIST: 1, EXCLUDE_LIST: 2 },
  FineTunedListType: { EXCLUDE_CLIPBOARD_CURSOR_DETECT: 0, INCLUDE_CLIPBOARD_DELAY_READ: 1 },
  CompositorType: { UNKNOWN: 0, KWIN: 1, MUTTER: 2, HYPRLAND: 3, SWAY: 4, WLROOTS: 5, COSMIC_COMP: 6 }
} as const;

function fakeHook(info: LinuxEnvInfo | null = null) {
  const calls: { name: string; args: unknown[] }[] = [];
  const record = (name: string, ...args: unknown[]) => { calls.push({ name, args }); return true; };
  const hook = {
    isRunning: () => false,
    start: (...args: unknown[]) => record('start', ...args),
    stop: () => record('stop'),
    linuxGetEnvInfo: () => info,
    setGlobalFilterMode: (...args: unknown[]) => record('filter', ...args),
    setFineTunedList: (...args: unknown[]) => record('fineTune', ...args),
    setClipboardOnly: (...args: unknown[]) => record('clipboardOnly', ...args),
    disableClipboard: () => record('disableClipboard'),
    enableClipboard: () => record('enableClipboard'),
    setSelectionPassiveMode: (...args: unknown[]) => record('passive', ...args)
  };
  return { hook, calls };
}

test('Wayland detection keeps the selection backend native even when DISPLAY is also present', () => {
  assert.equal(desktopPlatform('linux', { WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':1' }), 'linux-wayland');
  assert.equal(desktopPlatform('linux', { XDG_SESSION_TYPE: 'wayland', DISPLAY: ':1' }), 'linux-x11');
  assert.equal(desktopPlatform('linux', { WAYLAND_DISPLAY: '', XDG_SESSION_TYPE: 'wayland' }), 'linux-x11');
  assert.equal(desktopPlatform('linux', { DISPLAY: ':1', XDG_SESSION_TYPE: 'x11' }), 'linux-x11');
  assert.equal(desktopPlatform('win32', { WAYLAND_DISPLAY: 'wayland-0' }), 'windows');
  assert.equal(desktopPlatform('darwin', {}), 'unsupported');
});

test('XWayland relaunch preserves arguments and uses the persistent AppImage path', () => {
  assert.deepEqual(xwaylandRelaunch(['.', '--package-check'], '/opt/glint/glint'), {
    execPath: '/opt/glint/glint', args: ['.', '--package-check', '--ozone-platform=x11']
  });
  assert.deepEqual(xwaylandRelaunch(['--ozone-platform', 'wayland', '--package-check'], path.resolve('/tmp/extracted/glint'), { file: '/apps/Glint.AppImage', directory: path.resolve('/tmp/extracted') }), {
    execPath: '/apps/Glint.AppImage', args: ['--appimage-extract-and-run', '--package-check', '--ozone-platform=x11']
  });
  assert.equal(xwaylandRelaunch(['--ozone-platform=x11'], '/opt/glint/glint'), undefined);
  assert.equal(xwaylandRelaunch(['--ozone-platform', 'x11'], '/opt/glint/glint'), undefined);
  assert.deepEqual(xwaylandRelaunch(['--ozone-platform=x11', '--ozone-platform=wayland'], '/opt/glint/glint')?.args, ['--ozone-platform=x11']);
});

test('unpacked launches do not relaunch an AppImage inherited from their parent', () => {
  const executable = path.resolve('/opt/glint/glint');
  assert.deepEqual(xwaylandRelaunch(['--package-check'], executable, { file: '/apps/Editor.AppImage', directory: '/tmp/editor' }), {
    execPath: executable, args: ['--package-check', '--ozone-platform=x11']
  });
});

test('platform defaults and validation do not promise unsupported capture or exclusions', () => {
  assert.deepEqual(platformDefaults('windows'), defaults);
  const wayland = platformDefaults('linux-wayland');
  assert.equal(wayland.trigger, 'shortcut');
  assert.deepEqual(wayland.excludedApps, []);
  assert.equal(platformDefaults('linux-x11').excludedApps.includes('konsole'), true);
  for (const platform of ['linux-x11', 'linux-wayland'] as const) {
    validatePlatformSettings(platformDefaults(platform), platform);
    for (const method of ['clipboard', 'auto'] as const) {
      assert.throws(() => validatePlatformSettings({ ...platformDefaults(platform), selectionMethod: method }, platform), /PRIMARY/);
    }
  }
  assert.throws(() => validatePlatformSettings({ ...wayland, excludedApps: ['secret-app'] }, 'linux-wayland'), /Wayland/);
  wayland.actions[0].name = 'Changed';
  assert.notEqual(defaults.actions[0].name, wayland.actions[0].name);
});

test('session-specific capture settings never erase saved preferences', () => {
  const original = { ...platformDefaults('linux-x11'), selectionMethod: 'clipboard' as const };
  const wayland = settingsForSession(original, 'linux-wayland');
  assert.equal(wayland.trigger, 'shortcut');
  assert.deepEqual(wayland.excludedApps, []);
  assert.equal(wayland.selectionMethod, 'accessibility');
  const saved = settingsForStorage({ ...wayland, density: 'compact' }, original, 'linux-wayland');
  assert.equal(saved.density, 'compact');
  assert.equal(original.density, 'comfortable');
  assert.deepEqual(saved.excludedApps, original.excludedApps);
  assert.equal(saved.selectionMethod, 'clipboard');
  assert.equal(saved.trigger, 'automatic');
  const x11 = settingsForSession(saved, 'linux-x11', 'shortcut');
  assert.deepEqual(x11.excludedApps, original.excludedApps);
  assert.equal(x11.trigger, 'automatic');
  assert.equal(x11.selectionMethod, 'accessibility');
  assert.equal(settingsForSession(saved, 'windows').selectionMethod, 'clipboard');
  assert.deepEqual(settingsForStorage(x11, saved, 'linux-x11'), saved);
  assert.deepEqual(settingsForStorage(defaults, saved, 'windows'), defaults);
  assert.equal(settingsForSession(saved, 'linux-wayland', 'automatic').trigger, 'automatic');
  assert.equal(settingsForSession(saved, 'linux-wayland', 'shortcut').trigger, 'shortcut');
  assert.equal(settingsForSession({ ...saved, excludedApps: [] }, 'linux-wayland').trigger, 'automatic');
});

test('Linux native smoke refuses to alter PRIMARY without a disposable-desktop acknowledgement', { skip: process.platform !== 'linux' }, () => {
  const env = { ...process.env };
  delete env.GLINT_TEST_DESKTOP;
  for (const args of [[], ['native']]) {
    const result = spawnSync(process.execPath, ['scripts/smoke.mjs', ...args], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /GLINT_TEST_DESKTOP=1/);
  }
});

test('Linux configures PRIMARY without invoking the Windows clipboard extension', () => {
  for (const platform of ['linux-x11', 'linux-wayland'] as const) {
    const { hook, calls } = fakeHook({ displayProtocol: platform === 'linux-wayland' ? 2 : 1, compositorType: 1, hasInputDeviceAccess: false, isRoot: false });
    hook.setClipboardOnly = () => { throw new Error('Windows only'); };
    hook.setFineTunedList = () => { throw new Error('Windows only'); };
    const settings = platformDefaults(platform);
    const state = configureSelectionHook(hook, constants, settings, platform, 'glint');
    assert.equal(state.paused, false);
    assert.match(state.message, /PRIMARY/);
    assert.deepEqual(calls.find(call => call.name === 'start')?.args, [{ enableClipboard: false, enableMouseMoveEvent: false, selectionPassiveMode: true }]);
    assert.equal(calls.some(call => call.name === 'disableClipboard'), true);
    assert.deepEqual(calls.find(call => call.name === 'filter')?.args, [2, platform === 'linux-wayland' ? [] : [...settings.excludedApps, 'glint']]);
    assert.deepEqual(calls.find(call => call.name === 'passive')?.args, [settings.trigger === 'shortcut']);
    if (platform === 'linux-wayland') assert.match(state.message, /无全局输入事件/);
    hook.isRunning = () => true;
    calls.length = 0;
    configureSelectionHook(hook, constants, { ...settings, trigger: 'automatic' }, platform, 'glint');
    assert.equal(calls.some(call => call.name === 'start'), false);
    assert.deepEqual(calls.find(call => call.name === 'passive')?.args, [false]);
  }
});

test('unsupported Wayland compositor and startup failures cannot report ready', () => {
  const { hook, calls } = fakeHook({ displayProtocol: 2, compositorType: 2, hasInputDeviceAccess: false, isRoot: false });
  assert.throws(() => configureSelectionHook(hook, constants, platformDefaults('linux-wayland'), 'linux-wayland', 'glint'), /GNOME Wayland/);
  assert.equal(calls.length, 0);
  hook.start = () => false;
  assert.throws(() => configureSelectionHook(hook, constants, platformDefaults('linux-x11'), 'linux-x11', 'glint'), /无法启动/);
  assert.throws(() => configureSelectionHook(hook, constants, defaults, 'unsupported', 'glint'), /当前平台/);
});

test('Wayland input monitoring alone does not promise PRIMARY protocol availability', () => {
  const { hook } = fakeHook({ displayProtocol: 2, compositorType: 0, hasInputDeviceAccess: true, isRoot: false });
  const state = configureSelectionHook(hook, constants, platformDefaults('linux-wayland'), 'linux-wayland', 'glint');
  assert.match(state.message, /data-control/);
  assert.doesNotMatch(state.message, /PRIMARY 已就绪/);
});

test('pause stops capture without requiring platform capabilities', () => {
  const { hook, calls } = fakeHook();
  const result = configureSelectionHook(hook, constants, { ...defaults, enabled: false }, 'linux-wayland', 'glint');
  assert.equal(result.paused, true);
  assert.deepEqual(calls, [{ name: 'stop', args: [] }]);
});

test('Windows keeps direct copy, fallback, exclusions and compatibility tuning', () => {
  for (const method of ['accessibility', 'clipboard', 'auto'] as const) {
    const { hook, calls } = fakeHook();
    configureSelectionHook(hook, constants, { ...defaults, selectionMethod: method }, 'windows', 'glint.exe');
    assert.deepEqual(calls.find(call => call.name === 'clipboardOnly')?.args, [method === 'clipboard']);
    assert.equal(calls.filter(call => call.name === 'fineTune').length, 2);
    assert.ok(calls.some(call => call.name === (method === 'accessibility' ? 'disableClipboard' : 'enableClipboard')));
    assert.deepEqual(calls.find(call => call.name === 'filter')?.args, [2, [...defaults.excludedApps, 'glint.exe']]);
  }
  const { hook } = fakeHook();
  hook.setClipboardOnly = () => false;
  assert.throws(() => configureSelectionHook(hook, constants, defaults, 'windows', 'glint.exe'), /缺少复制模式支持/);
});

test('Linux data and logs honor absolute XDG paths and smoke always stays isolated', () => {
  const root = path.resolve('work/test-root');
  const home = path.resolve('work/test-home');
  const env = { XDG_DATA_HOME: path.resolve('work/xdg-data'), XDG_STATE_HOME: path.resolve('work/xdg-state') };
  assert.deepEqual(runtimePaths(root, 'unused', false, { home, env }), {
    data: path.join(env.XDG_DATA_HOME, 'Glint/data'), logs: path.join(env.XDG_STATE_HOME, 'Glint/logs')
  });
  for (const env of [{}, { XDG_DATA_HOME: '', XDG_STATE_HOME: 'relative' }]) {
    assert.deepEqual(runtimePaths(root, 'unused', false, { home, env }), {
      data: path.join(home, '.local/share/Glint/data'), logs: path.join(home, '.local/state/Glint/logs')
    });
  }
  assert.deepEqual(runtimePaths(root, 'unused', true, { home, env }), {
    data: path.join(root, 'work/smoke-profile/data'), logs: path.join(root, 'work/smoke-profile/logs')
  });
});

test('Linux API keys require a real available keyring and reject the basic_text fallback', () => {
  for (const backend of ['basic_text', 'unknown', '', undefined]) assert.equal(credentialsAvailable('linux', true, backend), false);
  for (const backend of ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']) {
    assert.equal(credentialsAvailable('linux', true, backend), true);
    assert.equal(credentialsAvailable('linux', false, backend), false);
  }
  assert.equal(credentialsAvailable('win32', true), true);
  assert.equal(credentialsAvailable('win32', false), false);
});

test('unavailable Wayland coordinates are rejected without rejecting valid negative monitor coordinates', () => {
  for (const point of [undefined, { x: -99999, y: 1 }, { x: 1, y: -99999 }, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) {
    assert.equal(validScreenPoint(point), false);
  }
  assert.equal(validScreenPoint({ x: -1920, y: -100 }), true);
  assert.equal(validScreenPoint({ x: 0, y: 0 }), true);
});
