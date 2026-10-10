import { app, BrowserWindow, clipboard, ClipboardItem, dialog, globalShortcut, screen } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { defaults } from '../../src/core';
import { platformDefaults } from '../../src/platform';
import type { Settings, Selection } from '../../src/core';
import type { ApplicationRuntime } from '../../src/main';
import { mdxFixture } from '../fixtures/mdx';
import { saveScreenshot } from './screenshot';

export async function runSmoke(runtime: ApplicationRuntime, mode: string) {
  if (mode === 'toolbar') return runToolbarSmoke(runtime);
  if (mode === 'dictionary') return runDictionarySmoke(runtime);
  if (mode === 'ui') return runSettingsSmoke(runtime);
  if (mode === 'records') return runRecordsSmoke(runtime);
  if (mode === 'native') return runNativeSmoke(runtime);
  throw new Error('Unknown smoke scenario: ' + mode);
}
async function runSettingsSmoke(runtime: ApplicationRuntime) {
  const { wait, until, folder, ui, untilUI, setInput } = await prepareScenario(runtime);
  assert.ok(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-page=actions]')"));
  assert.deepEqual(await runtime.setup!.webContents.executeJavaScript(`({
    drag: getComputedStyle(document.querySelector('.settings-titlebar')).getPropertyValue('-webkit-app-region'),
    controls: getComputedStyle(document.querySelector('.window-controls')).getPropertyValue('-webkit-app-region'),
    count: document.querySelectorAll('[data-window]').length
  })`), { drag: 'drag', controls: 'no-drag', count: 3 });
  await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-window=maximize]').click()");
  await until(() => !!runtime.setup?.isMaximized(), 'custom settings maximize');
  await wait(150);
  assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-window=maximize]').getAttribute('aria-label')"), '向下还原');
  await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-window=maximize]').click()");
  await until(() => !runtime.setup?.isMaximized(), 'custom settings restore');
  await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-window=minimize]').click()");
  await until(() => !!runtime.setup?.isMinimized(), 'custom settings minimize');
  runtime.tray!.emit('click');
  await until(() => !!runtime.setup?.isVisible() && !runtime.setup.isMinimized(), 'tray click restores minimized settings');
  await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-window=close]').click()");
  await until(() => !runtime.setup, 'custom settings close');
  assert.ok(runtime.tray && !runtime.tray.isDestroyed(), 'closing settings keeps the tray available');
  runtime.tray!.emit('click');
  await until(() => !!runtime.setup?.isVisible() && !runtime.setup.webContents.isLoading(), 'tray click reopens closed settings');
  await wait(300);
  await saveScreenshot(runtime.setup!.webContents, path.join(folder, 'settings.png'));
  for (const [selector, name] of [['input[data-action-field=name]', 'input-focus-dark'], ['textarea[data-action-field=prompt]', 'textarea-focus-dark']]) {
    await runtime.setup!.webContents.executeJavaScript(`document.querySelector('${selector}').focus()`);
    await saveScreenshot(runtime.setup!.webContents, path.join(folder, `${name}.png`));
  }
  assert.ok(await runtime.setup!.webContents.executeJavaScript("!!document.querySelector('.fui-FluentProvider')"), 'official Fluent provider is mounted');
  await ui("document.querySelector('input[data-action-field=name]').focus(); document.querySelector('input[data-action-field=name]').select()");
  await runtime.setup!.webContents.insertText('临时动作');
  await wait(100);
  runtime.broadcast(); await wait(100);
  assert.deepEqual(await runtime.setup!.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('input[data-action-field=name]');
    return { text: input.value, focused: document.activeElement === input, caret: input.selectionStart };
  })()`), { text: '临时动作', focused: true, caret: 4 }, 'typing and status events preserve draft, focus and caret');
  await ui("document.querySelector('[data-revert]').click()");
  await ui("document.querySelector('[data-action-field=kind]').focus(); document.querySelector('[data-action-field=kind]').click()");
  await saveScreenshot(runtime.setup!.webContents, path.join(folder, 'dropdown-dark.png'));
  assert.ok(await runtime.setup!.webContents.executeJavaScript("!!document.querySelector('[role=listbox]')"), 'Fluent dropdown opens');
  assert.deepEqual(await runtime.setup!.webContents.executeJavaScript("[...document.querySelectorAll('[role=listbox] [role=option]')].map(option => option.textContent)"), ['指令', '搜索'], 'only current action types are offered');
  for (const keyCode of ['Down', 'Return']) {
    runtime.setup!.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    runtime.setup!.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  }
  await wait(200);
  assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-action-field=kind]').textContent"), '搜索', 'Arrow and Enter must update the action type');
  await ui("document.querySelector('[data-revert]').click()");
  const actionCount = runtime.settings.actions.length;
  assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-action-field=englishName]') === null"), true, 'existing actions hide the English name');
  await ui("document.querySelector('[data-add]').click()");
  await setInput('[data-action-field=englishName]', 'smoke_custom');
  await ui("document.querySelector('[data-open-icon-picker]').focus()");
  await ui("document.querySelector('[data-open-icon-picker]').click()");
  assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelectorAll('[data-pick-icon]').length"), 32);
  assert.ok(await runtime.setup!.webContents.executeJavaScript("!!document.querySelector('[role=dialog]')"), 'Fluent modal opens');
  await ui("document.querySelector('[data-icon-tab=all]').click()");
  const firstIcon = await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-pick-icon]').dataset.pickIcon");
  await ui("document.querySelector('[data-picker-next]').click()");
  assert.notEqual(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-pick-icon]').dataset.pickIcon"), firstIcon, 'Full icon catalog paginates');
  await ui("document.querySelector('[data-icon-tab=common]').click()");
  assert.ok(await runtime.setup!.webContents.executeJavaScript(`(() => {
    const dialog = document.querySelector('[role=dialog]');
    return !dialog.parentElement.classList.contains('glint-provider');
  })()`), 'portal must not inherit the full-window layout class');
  await saveScreenshot(runtime.setup!.webContents, path.join(folder, 'icon-picker.png'));
  await setInput('[data-icon-search]', '翻译');
  assert.ok(await runtime.setup!.webContents.executeJavaScript("!!document.querySelector('[data-pick-icon=languages]')"), 'Chinese search finds translation');
  const longIcon = 'triangles-centerline-dashed-horizontal';
  await setInput('[data-icon-search]', longIcon);
  await ui(`document.querySelector('[data-pick-icon="${longIcon}"]').click()`);
  await untilUI("document.activeElement.matches('[data-open-icon-picker]')", 'dialog restores focus after its closing animation');
  assert.equal(await runtime.setup!.webContents.executeJavaScript("document.activeElement.matches('[data-open-icon-picker]') ? 'opener' : document.activeElement.outerHTML.slice(0, 1000)"), 'opener', 'Dialog restores focus to its opener');
  await ui("document.querySelector('[data-save]').click()");
  await until(() => runtime.settings.actions.length === actionCount + 1 && runtime.settings.actions.at(-1)?.icon === longIcon, 'new action icon save');
  await untilUI("document.querySelector('[data-action-field=englishName]') === null", 'English name disappears after first save');
  assert.ok(await runtime.setup!.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('input[data-action-field=name]');
    const rect = input.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === input;
  })()`), 'toast and closed dialog must not cover the settings form');
  assert.equal(JSON.parse(fs.readFileSync(runtime.configPath, 'utf8')).settings.actions.at(-1).icon, longIcon);
  await ui("document.querySelector('[data-delete]').click()");
  await ui("document.querySelector('[data-save]').click()");
  await until(() => runtime.settings.actions.length === actionCount, 'remove temporary action');
  await ui("document.querySelector('[data-page=appearance]').click()");
  await ui("document.querySelector('[data-theme=light]').click()");
  for (const tab of ['actions', 'model', 'triggers', 'appearance']) {
    await ui(`document.querySelector('[data-page=${tab}]').click()`);
    await saveScreenshot(runtime.setup!.webContents, path.join(folder, `${tab}-light.png`));
    if (tab === 'actions') {
      await ui("document.querySelector('input[data-action-field=name]').focus()");
      await saveScreenshot(runtime.setup!.webContents, path.join(folder, 'input-focus-light.png'));
      await ui("document.querySelector('[data-action-field=kind]').focus(); document.querySelector('[data-action-field=kind]').click()");
      await saveScreenshot(runtime.setup!.webContents, path.join(folder, 'dropdown-light.png'));
      runtime.setup!.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      runtime.setup!.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await wait(200);
      assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-action-field=kind]').getAttribute('aria-expanded')"), 'false', 'Escape closes Fluent dropdown');
    }
  }
  runtime.setup!.setSize(820, 570);
  await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-page=actions]').click()");
  await wait(100);
  await saveScreenshot(runtime.setup!.webContents, path.join(folder, 'settings-small.png'));
  runtime.setup!.setSize(920, 640);
  await ui("document.querySelector('[data-page=triggers]').click()");
  const linux = runtime.platform.startsWith('linux');
  if (linux) {
    const keySave = await runtime.setup!.webContents.executeJavaScript("(async () => window.glint.save((await window.glint.snapshot()).settings, 'glint-test-key'))()");
    assert.equal(keySave.ok, false, 'Linux smoke uses basic_text and must refuse credential storage');
    assert.equal((await runtime.setup!.webContents.executeJavaScript('window.glint.snapshot()')).hasKey, false);
    for (const method of ['clipboard', 'auto']) {
      assert.equal(await runtime.setup!.webContents.executeJavaScript(`document.querySelector('[data-selection-method=${method}]').disabled`), true);
      const response = await runtime.setup!.webContents.executeJavaScript(`(async () => window.glint.save({ ...(await window.glint.snapshot()).settings, selectionMethod: '${method}' }))()`);
      assert.equal(response.ok, false, 'IPC rejects unsupported Linux capture modes');
    }
    assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-apps]').disabled"), runtime.platform === 'linux-wayland');
    if (runtime.platform === 'linux-wayland') {
      const response = await runtime.setup!.webContents.executeJavaScript("(async () => window.glint.save({ ...(await window.glint.snapshot()).settings, excludedApps: ['private-app'] }))()");
      assert.equal(response.ok, false, 'Wayland must not silently accept ineffective exclusions');
      const config = fs.readFileSync(runtime.configPath, 'utf8');
      try {
        const imported = { ...structuredClone(runtime.settings), trigger: 'automatic', selectionMethod: 'clipboard', excludedApps: ['private-app'] };
        const original = JSON.stringify({ settings: imported, encryptedKey: '' });
        fs.writeFileSync(runtime.configPath, original);
        runtime.load();
        assert.equal(fs.readFileSync(runtime.configPath, 'utf8'), original, 'opening another session must not rewrite valid saved preferences');
        assert.deepEqual(runtime.settings.excludedApps, []);
        assert.equal(runtime.settings.trigger, 'shortcut');
        assert.equal(runtime.settings.selectionMethod, 'accessibility');
        const save = await runtime.setup!.webContents.executeJavaScript("(async () => window.glint.save({ ...(await window.glint.snapshot()).settings, density: 'compact' }))()");
        assert.equal(save.ok, true, save.error);
        const persisted = JSON.parse(fs.readFileSync(runtime.configPath, 'utf8'));
        assert.deepEqual(persisted.settings.excludedApps, ['private-app']);
        assert.equal(persisted.settings.trigger, 'automatic');
        assert.equal(persisted.settings.selectionMethod, 'clipboard');
        assert.equal(persisted.waylandTrigger, 'shortcut');
        const automatic = await runtime.setup!.webContents.executeJavaScript("(async () => window.glint.save({ ...(await window.glint.snapshot()).settings, trigger: 'automatic' }))()");
        assert.equal(automatic.ok, true, automatic.error);
        runtime.load();
        assert.equal(runtime.settings.trigger, 'automatic', 'Wayland trigger choice survives restart independently');
      } finally {
        fs.writeFileSync(runtime.configPath, config);
        runtime.load(); runtime.configureHost(); runtime.broadcast();
        await ui("document.querySelector('[data-revert]').click()");
      }
      const saved = structuredClone(runtime.settings);
      globalShortcut.unregister(saved.shortcut);
      runtime.settings.shortcut = 'UnavailableShortcut'; runtime.status.shortcutReady = false;
      try {
        const response = await runtime.setup!.webContents.executeJavaScript("(async () => window.glint.save({ ...(await window.glint.snapshot()).settings, trigger: 'automatic' }))()");
        assert.equal(response.ok, true, 'automatic capture remains configurable without a working shortcut service');
        assert.equal(runtime.status.shortcutReady, false, 'saving does not falsely report successful registration');
      } finally {
        const response = await runtime.setup!.webContents.executeJavaScript(`window.glint.save(${JSON.stringify(saved)})`);
        assert.equal(response.ok, true, `restore the smoke shortcut: ${response.error || ''}`);
      }
    }
  }
  for (const method of linux ? ['accessibility'] : ['clipboard', 'auto', 'accessibility', 'clipboard']) {
    await ui(`document.querySelector('[data-selection-method=${method}]').click()`);
    assert.equal(await runtime.setup!.webContents.executeJavaScript(`document.querySelector('[data-selection-method=${method}]').getAttribute('aria-pressed')`), 'true', 'selection method updates the draft');
    assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelectorAll('[data-selection-method][aria-pressed=true]').length"), 1, 'selection methods are mutually exclusive');
  }
  await ui("document.querySelector('[data-revert]').click()");
  assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-selection-method=accessibility]').getAttribute('aria-pressed')"), 'true', 'revert restores selection method');
  for (const method of linux ? ['accessibility'] : ['clipboard', 'auto', 'accessibility']) {
    assert.equal((await runtime.setup!.webContents.executeJavaScript(`(async () => window.glint.save({ ...(await window.glint.snapshot()).settings, selectionMethod: '${method}' }))()`)).ok, true);
    await until(() => runtime.status.hook === 'ready', 'engine restarts after changing selection method');
    assert.equal(runtime.settings.selectionMethod, method, 'saved method reaches the main process');
    await untilUI(`document.querySelector('[data-selection-method=${method}]')?.getAttribute('aria-pressed') === 'true'`, 'saved method returns to the renderer');
  }
  // Check real Web Animations API durations under both operating-system preferences.
  runtime.setup!.webContents.debugger.attach('1.3');
  try {
    for (const preference of ['no-preference', 'reduce']) {
      await runtime.setup!.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: preference }] });
      await wait(50);
      const durations = await runtime.setup!.webContents.executeJavaScript(`(async () => {
        document.querySelector('[data-page=${preference === 'reduce' ? 'actions' : 'model'}]').click();
        await new Promise(requestAnimationFrame);
        return document.querySelector('.page-content [role=tabpanel]').getAnimations().map(animation => animation.effect.getTiming().duration);
      })()`);
      if (preference === 'no-preference') assert.ok(durations.some((duration: number) => duration > 0), 'page transitions use Fluent motion');
      else assert.ok(durations.every((duration: number) => duration <= 1), 'reduced-motion preference uses Fluent minimal-duration transitions');
    }
  } finally { runtime.setup!.webContents.debugger.detach(); }
  await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-revert]').click()");
  await wait(250);
}
async function runToolbarSmoke(runtime: ApplicationRuntime) {
  const { wait, until } = await prepareScenario(runtime);
  // Synthetic selections must retain the painted toolbar instead of remounting/fading it.
  runtime.settings.enabled = false; runtime.configureHost();
  await until(() => runtime.status.hook === 'paused', 'pause desktop events during toolbar checks');
  try {
    runtime.setup!.focus();
    await until(() => runtime.setup!.isFocused(), 'source window focus before toolbar');
    await runtime.showDemo();
    await until(() => !!runtime.toolbar?.isVisible(), 'initial toolbar');
    const toolbar = runtime.toolbar!;
    assert.equal(toolbar.isFocused(), false, 'appearing toolbar must not take the source focus');
    assert.equal(runtime.setup!.isFocused(), true, 'source remains active after showInactive');
    if (process.platform === 'win32') assert.equal(toolbar.isFocusable(), true, 'Windows must allow mouse activation so the first press is delivered');
    await toolbar.webContents.executeJavaScript(`(() => {
      window.originalToolbar = document.querySelector('.toolbar-wrap');
      window.toolbarOpacities = [];
      window.sampleToolbar = true;
      const sample = () => {
        if (!window.sampleToolbar) return;
        window.toolbarOpacities.push(Number(getComputedStyle(document.querySelector('.toolbar-wrap')).opacity));
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    })()`);
    let repeatedShows = 0;
    const showInactive = toolbar.showInactive.bind(toolbar);
    toolbar.showInactive = () => { repeatedShows++; showInactive(); };
    try {
      for (let index = 0; index < 4; index++) {
        await runtime.showDemo(); await wait(120);
        assert.equal(await toolbar.webContents.executeJavaScript("document.querySelector('.toolbar-wrap') === window.originalToolbar"), true, 'new selections retain the same toolbar DOM');
      }
      const opacity = await toolbar.webContents.executeJavaScript('window.sampleToolbar = false; window.toolbarOpacities');
      assert.ok(opacity.length > 0 && opacity.every((value: number) => value === 1), 'visible toolbar must never reset to transparent');
      assert.equal(repeatedShows, 0, 'measurements must not show an already-visible native window');
      const id = runtime.selection!.id;
      runtime.dismissToolbar();
      await toolbar.webContents.executeJavaScript(`window.glint.fitToolbar(${id}, 400, 60)`);
      assert.equal(toolbar.isVisible(), false, 'late measurements cannot reopen a dismissed toolbar');
      await runtime.showDemo();
      await until(() => toolbar.isVisible(), 'reused toolbar reappears');
      assert.equal(repeatedShows, 1, 'hidden toolbar is revealed once');

      // Hold renderer frames after measurement to verify that the native window
      // cannot be revealed early or resurrected by a cancelled presentation.
      runtime.dismissToolbar();
      await toolbar.webContents.executeJavaScript(`window.savedToolbarRAF = window.requestAnimationFrame;
        window.pendingToolbarFrames = [];
        window.requestAnimationFrame = callback => window.pendingToolbarFrames.push(callback); void 0;`);
      try {
        await runtime.showDemo();
        let waiting = false;
        for (let attempt = 0; attempt < 50 && !waiting; attempt++) {
          waiting = await toolbar.webContents.executeJavaScript('window.pendingToolbarFrames.length > 0');
          if (!waiting) await wait(30);
        }
        assert.equal(waiting, true, 'renderer waits for a frame after sizing');
        assert.equal(toolbar.isVisible(), false, 'measurements alone cannot reveal the window');
        runtime.dismissToolbar();
      } finally {
        await toolbar.webContents.executeJavaScript(`window.requestAnimationFrame = window.savedToolbarRAF;
          window.pendingToolbarFrames.forEach(callback => requestAnimationFrame(callback));`);
      }
      await wait(200);
      assert.equal(toolbar.isVisible(), false, 'late renderer frames cannot reopen a dismissed toolbar');
      await runtime.showDemo();
      await until(() => toolbar.isVisible(), 'painted toolbar reappears');
      assert.equal(repeatedShows, 2, 'cancelled frames never cause an extra show');

      // Reproduce a delayed native resize: RAF keeps running against the old
      // viewport, so elapsed frames must not be mistaken for a painted new size.
      runtime.dismissToolbar();
      const setBounds = toolbar.setBounds.bind(toolbar);
      const getContentBounds = toolbar.getContentBounds.bind(toolbar);
      setBounds({ width: 180, height: 100 });
      await wait(100);
      let pendingBounds: Parameters<typeof toolbar.setBounds>[0] | undefined;
      toolbar.setBounds = next => { pendingBounds = next; };
      // Main sees the new native client bounds before Chromium receives resize.
      toolbar.getContentBounds = () => ({ ...getContentBounds(), ...pendingBounds });
      try {
        await runtime.showDemo();
        await until(() => !!pendingBounds, 'native resize requested');
        await wait(100);
        assert.equal(toolbar.isVisible(), false, 'old viewport frames must not reveal the toolbar');
        setBounds(pendingBounds!);
        await until(() => toolbar.isVisible(), 'target viewport ready after delayed resize');
        assert.equal(repeatedShows, 3, 'delayed resize presents once');
      } finally { toolbar.setBounds = setBounds; toolbar.getContentBounds = getContentBounds; runtime.dismissToolbar(); }
      const originalSettings = structuredClone(runtime.settings);
      const originalBounds = runtime.setup!.getBounds();
      try {
        for (const display of screen.getAllDisplays()) {
          const area = display.workArea;
          runtime.setup!.setBounds({ x: area.x + 20, y: area.y + 20, width: Math.min(920, area.width - 40), height: Math.min(640, area.height - 40) });
          await wait(100);
          for (const density of ['compact', 'comfortable'] as const) {
            runtime.dismissToolbar();
            runtime.settings = { ...originalSettings, density };
            await runtime.showDemo();
            try { await until(() => toolbar.isVisible(), `painted ${density} toolbar on display ${display.id}`); }
            catch (error) {
              console.error('Toolbar presentation state:', { bounds: toolbar.getBounds(), content: toolbar.getContentBounds(), minimum: toolbar.getMinimumSize(), viewport: await toolbar.webContents.executeJavaScript('({ width: innerWidth, height: innerHeight, scale: devicePixelRatio })') });
              throw error;
            }
            const bounds = toolbar.getBounds();
            const viewport = await toolbar.webContents.executeJavaScript('({ width: innerWidth, height: innerHeight })');
            assert.ok(Math.abs(viewport.width - bounds.width) <= 1 && Math.abs(viewport.height - bounds.height) <= 1, 'renderer and native surface agree before showing across display scales');
            await wait(150);
            assert.deepEqual(toolbar.getBounds(), bounds, 'visible window must not resize again after its first frame');
          }
        }
      } finally { runtime.settings = originalSettings; runtime.setup!.setBounds(originalBounds); }
      runtime.dismissToolbar();
      await runtime.showDemo();
      await until(() => toolbar.isVisible(), 'toolbar for pointer activation');
      runtime.selection = { ...runtime.selection!, text: 'apple' };
      const buttonPoint = await toolbar.webContents.executeJavaScript(`(() => {
        const button = document.querySelector('[data-run="translate"]');
        const rect = button.getBoundingClientRect();
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
      })()`);
      toolbar.webContents.sendInputEvent({ type: 'mouseDown', ...buttonPoint, button: 'left', clickCount: 1 });
      toolbar.webContents.sendInputEvent({ type: 'mouseUp', ...buttonPoint, button: 'left', clickCount: 1 });
      await until(() => !!runtime.resultWindow?.isVisible(), 'pointer click opens translation window');
      assert.equal(runtime.result?.source, 'apple');
      assert.equal(runtime.result?.dictionary?.word.toLowerCase(), 'apple');
      assert.equal(toolbar.isVisible(), false, 'successful action dismisses toolbar');
      runtime.resultWindow!.close();
    } finally { toolbar.showInactive = showInactive; runtime.dismissToolbar(); }
  } finally { runtime.settings.enabled = true; runtime.configureHost(); }
  console.log('Toolbar stability smoke passed.');
}
async function runDictionarySmoke(runtime: ApplicationRuntime) {
  const { wait, until, folder, ui, untilUI } = await prepareScenario(runtime, false);
  const { createServer } = await import('node:http');
  let requests = 0;
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => { requests++; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: 'Local AI test response' } }] })); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const save = async (enabled: boolean, model: string) => {
    // This scenario uses synthetic selections; desktop mouse/keyboard activity must not dismiss them.
    const next = { ...runtime.settings, enabled: false, dictionaryEnabled: enabled, provider: { baseUrl: `http://127.0.0.1:${address.port}/v1`, model } };
    const response = await runtime.setup!.webContents.executeJavaScript(`window.glint.save(${JSON.stringify(next)})`);
    assert.equal(response.ok, true, response.error);
    await until(() => runtime.status.hook === 'paused', 'pause native capture during dictionary checks');
  };
  const select = async (text: string, action = 'translate') => {
    await runtime.showDemo();
    await until(() => !!runtime.toolbar?.isVisible(), 'dictionary toolbar');
    runtime.selection = { ...runtime.selection!, text };
    const response = await runtime.toolbar!.webContents.executeJavaScript(`window.glint.run(${JSON.stringify(action)}, ${runtime.selection.id})`);
    assert.equal(response.ok, true, response.error);
    await until(() => !!runtime.result && !runtime.result.busy, 'dictionary result');
    await wait(100);
  };
  try {
    await save(true, '');
    await select('“Apple,”');
    assert.equal(requests, 0, 'offline hit never calls the model');
    assert.equal(runtime.result!.dictionary?.word.toLowerCase(), 'apple');
    assert.equal(runtime.result!.error, undefined, 'offline lookup works without a model configured');
    assert.match(runtime.result!.text, /苹果/);
    assert.equal(await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('#result-retry').textContent"), 'AI 翻译');
    const recorded = await runtime.resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(runtime.result!.id)})`);
    assert.equal(recorded.ok, true, recorded.error);
    const row = await runtime.setup!.webContents.executeJavaScript(`window.glint.getRecord('translation', ${JSON.stringify(runtime.result!.id)})`);
    assert.equal(row.originalText, '“Apple,”'); assert.match(row.resultText, /ECDICT/);
    if (process.platform === 'win32') {
      await wait(250);
      await saveScreenshot(runtime.resultWindow!.webContents, path.join(folder, 'dictionary.png'));
    }
    runtime.resultWindow!.setSize(380, 240);
    await wait(100);
    assert.equal(await runtime.resultWindow!.webContents.executeJavaScript(`(() => {
      const footer = document.querySelector('.result-footer');
      return footer.scrollWidth <= footer.clientWidth;
    })()`), true, 'dictionary controls fit the smallest card');
    runtime.resultWindow!.setSize(480, 360);
    await save(true, 'local-test');
    await runtime.resultWindow!.webContents.executeJavaScript('window.glint.retryResult()');
    await until(() => !runtime.result?.busy, 'explicit AI translation');
    assert.equal(requests, 1); assert.equal(runtime.result!.dictionary, undefined);
    assert.equal(runtime.result!.text, 'Local AI test response');
    assert.equal((await runtime.resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(runtime.result!.id)})`)).ok, true);
    const updated = await runtime.setup!.webContents.executeJavaScript(`window.glint.getRecord('translation', ${JSON.stringify(runtime.result!.id)})`);
    assert.equal(updated.originalText, '“Apple,”'); assert.equal(updated.resultText, 'Local AI test response');
    for (const [text, action] of [['zxqvnotaword', 'translate'], ['an apple a day', 'translate'], ['apple', 'polish'], ['apple', 'explain']]) {
      const before: number = requests;
      await select(text, action);
      assert.equal(requests, before + 1, 'misses, sentences and other actions use the model');
      assert.equal(runtime.result!.dictionary, undefined);
    }
    await save(false, 'local-test');
    const before: number = requests;
    await select('apple');
    assert.equal(requests, before + 1, 'dictionary opt-out is honored');
    assert.equal(runtime.result!.dictionary, undefined);
    // A renamed built-in action keeps its dictionary identity.
    runtime.settings.actions[0].name = '译文';
    await save(true, ''); await select('went');
    assert.ok(runtime.result!.dictionary); assert.equal(runtime.result!.actionName, '译文');
    await save(true, 'local-test');
    const lookup = runtime.dictionary.lookup;
    try {
      runtime.dictionary.lookup = () => { throw new Error('fixture unavailable dictionary'); };
      const before: number = requests;
      await select('apple');
      assert.equal(requests, before + 1, 'an unavailable dictionary gracefully falls back to the model');
      assert.equal(runtime.result!.error, undefined);
    } finally { runtime.dictionary.lookup = lookup; }
    await ui("document.querySelector('[data-page=dictionary]').click()");
    await untilUI("!!document.querySelector('[data-import-dictionary]') && !document.querySelector('[data-import-dictionary]').disabled", 'dictionary settings loaded');
    assert.match(await runtime.setup!.webContents.executeJavaScript("document.querySelector('.page-description').textContent"), /仅用于内置「翻译」/);
    const filename = path.join(folder, 'custom.mdx'); fs.writeFileSync(filename, mdxFixture());
    const showOpenDialog = dialog.showOpenDialog;
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [filename] })) as typeof dialog.showOpenDialog;
    try { await ui("document.querySelector('[data-import-dictionary]').click()"); }
    finally { dialog.showOpenDialog = showOpenDialog; }
    await untilUI("document.querySelectorAll('[data-dictionary-id]').length === 1", 'MDX import through settings IPC');
    if (process.platform === 'win32') await saveScreenshot(runtime.setup!.webContents, path.join(folder, 'dictionary-settings.png'));
    const custom = runtime.customDictionaries.list()[0];
    await select('apple');
    assert.equal(await runtime.resultWindow!.webContents.executeJavaScript('(async () => (await window.glint.snapshot()).result.dictionary.source)()'), 'Glint 测试词典');
    assert.match(runtime.result!.text, /自定义苹果/);
    assert.equal(await runtime.resultWindow!.webContents.executeJavaScript('window.glint.listDictionaries().then(() => false, () => true)'), true, 'dictionary management is settings-only');
    assert.equal((await runtime.resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(runtime.result!.id)})`)).ok, true);
    const customRecord = await runtime.setup!.webContents.executeJavaScript(`window.glint.getRecord('translation', ${JSON.stringify(runtime.result!.id)})`);
    assert.match(customRecord.resultText, /来源：Glint 测试词典/);
    await runtime.setup!.webContents.executeJavaScript(`window.glint.changeDictionary('${custom.id}', 'disable')`);
    await select('apple'); assert.equal(await runtime.resultWindow!.webContents.executeJavaScript('(async () => (await window.glint.snapshot()).result.dictionary.source)()'), 'ECDICT');
    await runtime.setup!.webContents.executeJavaScript(`window.glint.changeDictionary('${custom.id}', 'remove')`);
    assert.equal(runtime.customDictionaries.list().length, 0); assert.equal(fs.existsSync(filename), true);
    fs.writeFileSync(path.join(folder, 'smoke-report.json'), JSON.stringify({ passed: true, checks: ['offline without model', 'source punctuation preserved', 'history persistence and AI update', 'AI translation', 'miss/sentence fallback', 'other actions unchanged', 'opt-out', 'renamed action', 'unavailable dictionary fallback'], requests }, null, 2));
    console.log('Dictionary smoke passed.');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

async function runRecordsSmoke(runtime: ApplicationRuntime) {
  const { wait, until, folder, ui, untilUI } = await prepareScenario(runtime, false);
  const { createServer } = await import('node:http');
  let received = '';
  let requestCount = 0;
  let responseStatus = 200;
  let responseDelay = 80;
  const server = createServer((req, res) => {
    let requestBody = '';
    req.on('data', chunk => { requestBody += chunk; });
    req.on('end', () => {
      received = requestBody; requestCount++;
      if (responseStatus !== 200) { res.writeHead(responseStatus, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Glint 流式"}}]}\n\n');
      const completion = setTimeout(() => res.end('data: {"choices":[{"delta":{"content":"测试成功。"}}]}\n\ndata: [DONE]\n\n'), responseDelay);
      res.on('close', () => clearTimeout(completion));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const next = structuredClone(runtime.settings); next.provider = { baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'local-test' };
    // Synthetic records selections must not be dismissed by desktop activity.
    next.enabled = false;
    const saved = await runtime.setup!.webContents.executeJavaScript(`window.glint.save(${JSON.stringify(next)})`);
    assert.equal(saved.ok, true, saved.error);
    await until(() => runtime.status.hook === 'paused', 'pause desktop capture during records checks');
    await runtime.showDemo();
    await until(() => !!runtime.toolbar?.isVisible(), 'records toolbar presentation');
    assert.equal(runtime.toolbar!.isFocusable(), process.platform === 'win32');
    assert.equal(await runtime.toolbar!.webContents.executeJavaScript("document.querySelectorAll('[data-run]').length"), next.actions.filter(a => a.enabled).length);
    assert.equal(await runtime.toolbar!.webContents.executeJavaScript("document.querySelector('[data-run=copy]')"), null, 'the retired default copy action is absent');
    await saveScreenshot(runtime.toolbar!.webContents, path.join(folder, 'toolbar.png'));
    const readToolbarLayout = () => runtime.toolbar!.webContents.executeJavaScript(`(() => {
      const actions = document.querySelector('.bar-actions');
      const last = actions.lastElementChild.getBoundingClientRect();
      return { viewport: actions.clientWidth, content: actions.scrollWidth, lastRight: last.right, viewportRight: actions.getBoundingClientRect().right, x: last.x + last.width / 2, y: last.y + last.height / 2 };
    })()`);
    const toolbarLayout = await readToolbarLayout();
    assert.ok(toolbarLayout.lastRight <= toolbarLayout.viewportRight + 0.5, 'Last action clipped: ' + JSON.stringify(toolbarLayout));
    runtime.toolbar!.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(toolbarLayout.x), y: Math.round(toolbarLayout.y) });
    await wait(100);
    await saveScreenshot(runtime.toolbar!.webContents, path.join(folder, 'toolbar-last-hover.png'));
    runtime.setup!.hide();
    assert.equal(await runtime.toolbar!.webContents.executeJavaScript("document.querySelectorAll('[data-open-settings]').length"), 1);
    await runtime.toolbar!.webContents.executeJavaScript("document.querySelector('button.mini-brand[data-open-settings]').click()");
    await until(() => !!runtime.setup?.isVisible() && !runtime.toolbar?.isVisible(), 'brand button opens settings and dismisses toolbar');
    for (const density of ['comfortable', 'compact'] as const) {
      runtime.settings = structuredClone(next); runtime.settings.density = density;
      runtime.settings.actions.find(a => a.id === 'search')!.name = '搜索 WMWM';
      await runtime.showDemo();
      await until(() => !!runtime.toolbar?.isVisible(), `records toolbar ${density}`);
      await wait(100);
      const layout = await readToolbarLayout();
      assert.ok(layout.lastRight <= layout.viewportRight + 0.5, `Last action clipped (${density}): ${JSON.stringify(layout)}`);
    }
    runtime.dismissToolbar(); runtime.broadcast(); await wait(100);
    assert.equal(runtime.toolbar!.isVisible(), false, 'A stale measurement must not reopen a dismissed toolbar');
    runtime.settings = structuredClone(next);
    await runtime.showDemo(); await wait(150);
    const primaryDisplay = screen.getPrimaryDisplay();
    const sourceDisplay = screen.getAllDisplays().find(display => display.id !== primaryDisplay.id) ?? primaryDisplay;
    const selectOnDisplay = (display: Electron.Display) => {
      const area = display.workArea;
      runtime.selection = { ...runtime.selection!, x: area.x + area.width / 2, y: area.y + area.height / 2 };
    };
    selectOnDisplay(sourceDisplay);
    await until(() => !!runtime.toolbar?.isVisible(), 'toolbar ready for action');
    assert.equal((await runtime.toolbar!.webContents.executeJavaScript(`window.glint.run('translate', ${runtime.selection!.id - 1})`)).ok, false, 'stale toolbar selection cannot start a model request');
    assert.equal(requestCount, 0, 'stale selection never reaches the model');
    assert.equal((await runtime.toolbar!.webContents.executeJavaScript(`window.glint.run('translate', ${runtime.selection!.id})`)).ok, true);
    assert.equal(screen.getDisplayMatching(runtime.resultWindow!.getBounds()).id, sourceDisplay.id, 'new result opens on the selection display');
    await until(() => !!runtime.result && !runtime.result.busy, 'streaming response');
    assert.equal(runtime.result!.text, 'Glint 流式测试成功。');
    assert.equal(runtime.result!.error, undefined);
    assert.equal(JSON.parse(received).model, 'local-test');
    assert.ok(JSON.parse(received).messages[0].content.includes('Good tools'));
    await wait(250);
    // Electron documents these getters as always true on Linux.
    if (process.platform !== 'linux') {
      assert.equal(runtime.resultWindow!.isMaximizable(), false);
      assert.equal(runtime.resultWindow!.isMinimizable(), false);
    }
    const resultLayout = await runtime.resultWindow!.webContents.executeJavaScript(`(() => {
      const footer = [...document.querySelectorAll('.result-footer button')];
      return {
        action: document.querySelector('.result-action').textContent.trim(),
        app: document.querySelector('.result-app').textContent.trim(),
        controls: footer.map(button => button.id),
        stopDisabled: document.querySelector('#result-stop').disabled,
        retryDisabled: document.querySelector('#result-retry').disabled,
        copyDisabled: document.querySelector('#result-copy').disabled,
        recordPrimary: document.querySelector('#result-record').classList.contains('primary'),
        copySecondary: document.querySelector('#result-copy').classList.contains('secondary'),
        settingsButtons: document.querySelectorAll('[data-open-settings]').length,
        draggable: getComputedStyle(document.querySelector('.result-header')).getPropertyValue('-webkit-app-region'),
        closeClickable: getComputedStyle(document.querySelector('.result-close')).getPropertyValue('-webkit-app-region')
      };
    })()`);
    assert.equal(resultLayout.action, '翻译');
    assert.equal(resultLayout.app, 'Glint 体验区');
    assert.deepEqual(resultLayout.controls, ['result-stop', 'result-retry', 'result-copy', 'result-record']);
    assert.equal(resultLayout.stopDisabled, true);
    assert.equal(resultLayout.retryDisabled, false);
    assert.equal(resultLayout.copyDisabled, false);
    assert.equal(resultLayout.recordPrimary, true);
    assert.equal(resultLayout.copySecondary, true);
    assert.equal(resultLayout.settingsButtons, 0);
    assert.equal(resultLayout.draggable, 'drag');
    assert.equal(resultLayout.closeClickable, 'no-drag');
    await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('.source-details button').click()");
    await wait(250);
    assert.equal(await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('#source-text').textContent"), runtime.result!.source, 'Fluent collapse reveals the original text');
    await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('.source-details button').click()");
    await wait(250);
    await saveScreenshot(runtime.resultWindow!.webContents, path.join(folder, 'result.png'));
    runtime.settings.theme = 'light'; runtime.broadcast(); await wait(100);
    await saveScreenshot(runtime.resultWindow!.webContents, path.join(folder, 'result-light.png'));
    runtime.resultWindow!.setSize(380, 240);
    const originalApp = runtime.result!.app; runtime.result!.app = 'a-very-long-source-application-name.exe'; runtime.broadcast(); await wait(100);
    await saveScreenshot(runtime.resultWindow!.webContents, path.join(folder, 'result-small.png'));
    runtime.result!.app = originalApp; runtime.resultWindow!.setSize(480, 360);
    const previousCardId = runtime.result!.id;
    responseDelay = 10_000;
    const reusedWindow = runtime.resultWindow;
    selectOnDisplay(primaryDisplay);
    await runtime.runAction('translate');
    assert.equal(runtime.resultWindow, reusedWindow, 'result window is reused');
    assert.equal(screen.getDisplayMatching(runtime.resultWindow!.getBounds()).id, primaryDisplay.id, 'reused result follows the new selection display');
    await until(() => !!runtime.result?.busy && !!runtime.result.text, 'partial response for cancellation');
    await wait(100);
    assert.equal(await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('#result-retry').disabled"), true);
    runtime.selection = { ...runtime.selection!, text: 'A different selection after the card was opened.' };
    const { DatabaseSync } = await import('node:sqlite');
    assert.equal(await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('#result-record').disabled"), true);
    assert.equal((await runtime.resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(runtime.result!.id)})`)).ok, false, 'generation in progress cannot save a partial result');
    await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('[data-cancel]').click()");
    await until(() => !runtime.result?.busy, 'stop button cancels generation');
    await wait(100);
    const recordReader = new DatabaseSync(runtime.recordPath('translation'), { readOnly: true });
    try {
      assert.equal(recordReader.prepare('SELECT id FROM records WHERE id = ?').get(runtime.result!.id), undefined, 'original text is not automatically recorded');
      assert.equal((await runtime.resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(previousCardId)})`)).ok, false, 'stale cards cannot save a new selection');
      await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('[data-record-source]').click()");
      await until(() => !!runtime.result?.recorded, 'record original and partial result after stopping');
      assert.equal((await runtime.resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(runtime.result!.id)})`)).ok, true);
      const row = recordReader.prepare('SELECT original_text, result_text, process_name FROM records WHERE id = ?').get(runtime.result!.id)!;
      assert.equal(row.original_text, runtime.result!.source, 'record stores the card original, not new selection');
      assert.equal(row.result_text, runtime.result!.text);
      assert.equal(row.process_name, runtime.result!.app);
      assert.equal(recordReader.prepare('SELECT count(*) AS count FROM records WHERE id = ?').get(runtime.result!.id)!.count, 1);
      assert.equal(await runtime.setup!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(runtime.result!.id)}).then(() => false, () => true)`), true, 'only result window may record');
    } finally { recordReader.close(); }
    await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('[data-cancel]').click()");
    await until(() => !runtime.result?.busy, 'stop button cancels generation');
    assert.equal(runtime.result!.error, '已停止生成。');
    assert.equal(runtime.result!.text, 'Glint 流式');
    const originalSource = runtime.result!.source;
    const originalMessage = JSON.parse(received).messages[0].content;
    runtime.selection = { ...runtime.selection!, text: 'A different selection after the card was opened.' };
    runtime.settings.actions.find(action => action.id === 'translate')!.prompt = 'A different instruction: {text}';
    responseStatus = 503;
    await wait(100);
    await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('[data-retry-result]').click()");
    await until(() => !!runtime.result?.error?.includes('HTTP 503') && !runtime.result.busy, 'retry after stopping displays service failure');
    assert.equal(runtime.result!.text, '');
    responseStatus = 200; responseDelay = 80;
    const requestsBeforeRetry = requestCount;
    await runtime.resultWindow!.webContents.executeJavaScript("Promise.all([window.glint.retryResult(), window.glint.retryResult()])");
    await until(() => !!runtime.result && !runtime.result.busy, 'retry after failure completes');
    assert.equal(requestCount, requestsBeforeRetry + 1, 'duplicate retry cannot start concurrent requests');
    assert.equal(runtime.result!.source, originalSource, 'retry keeps the card selection');
    assert.equal(JSON.parse(received).messages[0].content, originalMessage, 'retry keeps the original instruction');
    assert.equal(runtime.result!.text, 'Glint 流式测试成功。');
    assert.equal(runtime.result!.error, undefined);
    assert.equal(runtime.result!.recorded, false, 'new result can update the existing saved card');
    await wait(100);
    await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('[data-record-source]').click()");
    await until(() => !!runtime.result?.recorded, 'updated result saved');
    const updatedDb = new DatabaseSync(runtime.recordPath('translation'), { readOnly: true });
    try {
      assert.equal(updatedDb.prepare('SELECT result_text FROM records WHERE id = ?').get(runtime.result!.id)!.result_text, 'Glint 流式测试成功。');
      assert.equal(updatedDb.prepare('SELECT count(*) AS count FROM records WHERE id = ?').get(runtime.result!.id)!.count, 1);
    } finally { updatedDb.close(); }
    const translationCardId = runtime.result!.id;
    await ui("document.querySelector('[data-page=history]').click()");
    await untilUI(`!!document.querySelector('[data-history-id="${translationCardId}"]')`, 'translation history renders');
    assert.ok(await runtime.setup!.webContents.executeJavaScript(`!!document.querySelector('[data-history-id="${translationCardId}"]')`), 'history shows saved translation');
    await ui(`document.querySelector('[data-history-id="${translationCardId}"]').click()`);
    await wait(150);
    assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-history-result]').textContent"), 'Glint 流式测试成功。');
    assert.equal(await runtime.setup!.webContents.executeJavaScript(`window.glint.getRecord('polishing', '${translationCardId}')`), undefined, 'history cannot cross record categories');
    assert.equal(await runtime.setup!.webContents.executeJavaScript("window.glint.listRecords('../translation', 0).then(() => false, () => true)"), true, 'history rejects unknown database names');
    assert.equal(await runtime.resultWindow!.webContents.executeJavaScript("window.glint.listRecords('translation', 0).then(() => false, () => true)"), true, 'history is restricted to settings');
    await ui("document.querySelector('[data-history-kind=polishing]').click()");
    await runtime.runAction('polish');
    await until(() => !!runtime.result && !runtime.result.busy, 'polishing response');
    await wait(100);
    assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-history-kind=polishing]').getAttribute('aria-selected')"), 'true', 'settings snapshots preserve the chosen history category');
    assert.equal(runtime.result!.recordKind, 'polishing');
    const polishingCardId = runtime.result!.id;
    const lockedDb = new DatabaseSync(runtime.recordPath('polishing'));
    try {
      lockedDb.exec('BEGIN IMMEDIATE');
      const failedSave = await runtime.resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(polishingCardId)})`);
      assert.equal(failedSave.ok, false, 'write failures must not report success');
      assert.equal(runtime.result!.recorded, false);
    } finally { lockedDb.exec('ROLLBACK'); lockedDb.close(); }
    await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('[data-record-source]').click()");
    await until(() => !!runtime.result?.recorded, 'polishing record saved');
    await untilUI(`!!document.querySelector('[data-history-id="${polishingCardId}"]')`, 'history refreshes after saving');
    assert.ok(await runtime.setup!.webContents.executeJavaScript(`!!document.querySelector('[data-history-id="${polishingCardId}"]')`), 'history refreshes automatically after saving');
    await ui(`document.querySelector('[data-history-id="${polishingCardId}"]').click()`);
    await wait(150);
    assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-history-original]').textContent"), runtime.result!.source);
    assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-history-result]').textContent"), runtime.result!.text);
    // Windows can return an item with no MIME types for an empty clipboard.
    // Materialize readable payloads before the copy checks overwrite the clipboard,
    // but never pass an empty data map to the ClipboardItem constructor.
    const snapshotClipboard = async () => Promise.all((await clipboard.read())
      .filter(item => item.types.length > 0)
      .map(async item => new ClipboardItem(Object.fromEntries(
        await Promise.all(item.types.map(async type => [type, await item.getType(type)]))
      ))));
    const restoreClipboard = async (items: ClipboardItem[]) => {
      if (items.length) await clipboard.write(items); else await clipboard.clear();
    };
    const previousClipboard = await snapshotClipboard();
    try {
      await clipboard.clear();
      const emptyClipboard = await snapshotClipboard();
      assert.equal(emptyClipboard.length, 0, 'empty clipboard snapshots must not construct empty ClipboardItems');
      await ui("document.querySelector('[data-history-copy=result]').click()");
      assert.equal(await clipboard.readText(), runtime.result!.text, 'history copies the stored result');
      await ui("document.querySelector('[data-history-copy=original]').click()");
      assert.equal(await clipboard.readText(), runtime.result!.source, 'history copies the original');
      await restoreClipboard(emptyClipboard);
      assert.equal((await snapshotClipboard()).length, 0, 'restoring an empty snapshot clears copied text');
    } finally { await restoreClipboard(previousClipboard); }
    await saveScreenshot(runtime.setup!.webContents, path.join(folder, 'history.png'));
    for (const kind of ['translation', 'polishing']) {
      const db = new DatabaseSync(runtime.recordPath(kind), { readOnly: true });
      try {
        const ownId = kind === 'translation' ? translationCardId : polishingCardId;
        const otherId = kind === 'translation' ? polishingCardId : translationCardId;
        assert.ok(db.prepare('SELECT id FROM records WHERE id = ?').get(ownId), 'record is in its own database');
        assert.equal(db.prepare('SELECT id FROM records WHERE id = ?').get(otherId), undefined, 'databases are isolated');
        if (kind === 'polishing') {
          const row = db.prepare('SELECT original_text, result_text, process_name FROM records WHERE id = ?').get(ownId)!;
          assert.equal(row.original_text, runtime.result!.source);
          assert.equal(row.result_text, runtime.result!.text);
          assert.equal(row.process_name, runtime.result!.app);
        }
      } finally { db.close(); }
    }
    assert.equal(await runtime.resultWindow!.webContents.executeJavaScript(`window.glint.deleteRecord('polishing', '${polishingCardId}').then(() => false, () => true)`), true, 'deletion is restricted to settings');
    assert.equal(await runtime.setup!.webContents.executeJavaScript("window.glint.deleteRecord('../translation', 'x').then(() => false, () => true)"), true, 'deletion rejects unknown database names');
    assert.equal(await runtime.setup!.webContents.executeJavaScript("window.glint.deleteRecord('polishing', '').then(() => false, () => true)"), true, 'deletion rejects invalid IDs');
    await ui("document.querySelector('[data-history-delete]').click()");
    await untilUI(`!document.querySelector('[data-history-id="${polishingCardId}"]') && !document.querySelector('.history-detail[aria-busy=true]')`, 'deleted record leaves history');
    assert.equal(runtime.openRecordStore('polishing').get(polishingCardId), undefined, 'UI deletion removes the stored row');
    assert.ok(runtime.openRecordStore('translation').get(translationCardId), 'deletion preserves other actions');
    assert.equal(runtime.result!.recorded, false, 'deleting the open result resets its record button');
    assert.equal((await runtime.resultWindow!.webContents.executeJavaScript(`window.glint.recordSource('${polishingCardId}')`)).ok, true, 'deleted result can be recorded again');
    await untilUI(`!!document.querySelector('[data-history-id="${polishingCardId}"]')`, 'recording again refreshes history');
    await runtime.runAction('explain');
    await until(() => !!runtime.result && !runtime.result.busy, 'explanation response');
    await wait(100);
    assert.equal(await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('[data-record-source]') !== null"), true, 'explanation has a record button');
    assert.equal((await runtime.resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(runtime.result!.id)})`)).ok, true, 'explanation can be saved');
    assert.equal(runtime.openRecordStore('explanation').get(runtime.result!.id)?.resultText, runtime.result!.text);
    assert.equal(runtime.openRecordStore('translation').get(runtime.result!.id), undefined, 'explanation has its own database');
    const customSettings = structuredClone(runtime.settings);
    customSettings.actions.push({ ...defaults.actions[0], id: 'smoke-history-action', name: '自定义总结', englishName: 'smoke_summary', icon: 'book' });
    const saveFromSettings = (next: Settings) => runtime.setup!.webContents.executeJavaScript(`window.glint.save(${JSON.stringify(next)})`);
    assert.equal((await saveFromSettings(customSettings)).ok, true);
    assert.ok(fs.existsSync(runtime.recordPath('smoke_summary')), 'saving an instruction initializes its database');
    await untilUI("!!document.querySelector('[data-history-kind=smoke_summary] .lucide-book')", 'custom instruction gets a history tab');
    await ui("document.querySelector('[data-history-kind=smoke_summary]').click()");
    await runtime.runAction('smoke-history-action');
    await until(() => !!runtime.result && !runtime.result.busy, 'custom instruction response');
    const customResultId = runtime.result!.id;
    assert.equal((await runtime.resultWindow!.webContents.executeJavaScript(`window.glint.recordSource(${JSON.stringify(customResultId)})`)).ok, true);
    await untilUI(`!!document.querySelector('[data-history-id="${customResultId}"]')`, 'custom history refreshes after saving');
    assert.equal(runtime.openRecordStore('smoke_summary').get(customResultId)?.originalText, runtime.result!.source);
    assert.equal(runtime.openRecordStore('smoke_summary').get(customResultId)?.resultText, runtime.result!.text);
    assert.equal(runtime.openRecordStore('explanation').get(customResultId), undefined, 'custom records are isolated');
    customSettings.actions.at(-1)!.name = '我的总结';
    customSettings.actions.at(-1)!.icon = 'pen';
    customSettings.actions.at(-1)!.enabled = false;
    assert.equal((await saveFromSettings(customSettings)).ok, true);
    await untilUI("!!document.querySelector('[data-history-kind=smoke_summary] .lucide-pen')", 'history uses the configured icon');
    assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-history-kind=smoke_summary]').textContent"), '我的总结');
    assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-history-kind=smoke_summary]').getAttribute('aria-selected')"), 'true');
    assert.equal((await runtime.setup!.webContents.executeJavaScript(`window.glint.getRecord('smoke_summary', '${customResultId}')`)).id, customResultId, 'renaming and disabling preserve history');
    customSettings.actions.at(-1)!.englishName = 'renamed_database';
    assert.equal((await saveFromSettings(customSettings)).ok, false, 'saved English names are immutable at the IPC boundary');
    customSettings.actions.pop();
    assert.equal((await saveFromSettings(customSettings)).ok, true);
    assert.ok(fs.existsSync(runtime.recordPath('smoke_summary')), 'deleting an action preserves its database');
    await untilUI("!document.querySelector('[data-history-kind=smoke_summary]') && !!document.querySelector('.history-content')", 'removed category falls back to another instruction');
    await runtime.resultWindow!.webContents.executeJavaScript("document.querySelector('[data-close-result]').click()");
    await until(() => !runtime.resultWindow, 'custom close button closes the result card');
    runtime.settings = platformDefaults(runtime.platform); runtime.persist(runtime.settings, ''); runtime.configureHost();
    const report = { passed: true, nativeHook: runtime.status.hook, shortcut: runtime.status.shortcutReady, checks: ['local SSE requests', 'record save, retry, copy, delete and re-record', 'action database isolation', 'history refresh and dynamic categories'], memory: app.getAppMetrics().map(m => ({ type: m.type, memory: m.memory })), note: 'Live selection in third-party applications requires manual verification. Memory is a test-session snapshot with open windows, not an idle benchmark.' };
    fs.writeFileSync(path.join(folder, 'smoke-report.json'), JSON.stringify(report, null, 2));
    console.log('Glint records smoke passed:', report.checks.join(', '));
  } finally { server.close(); }

}
async function runNativeSmoke(runtime: ApplicationRuntime) {
  const { wait, until, folder } = await prepareScenario(runtime);
  const initialClipboard = runtime.platform.startsWith('linux') ? await clipboard.readText() : undefined;
  app.setAccessibilitySupportEnabled(true);
  const fixtureText = 'Glint native selection fixture';
  const fixture = new BrowserWindow({ width: 500, height: 260, frame: false, alwaysOnTop: true, show: false, title: 'Glint native selection test', webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
  const attempts: unknown[] = [];
  const checks: string[] = [];
  let passed = false;
  try {
    assert.equal(runtime.settings.selectionMethod, 'accessibility', 'initial native test must not use clipboard');
    await fixture.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<textarea style="width:90%;height:100px" aria-label="Selection fixture">${fixtureText}</textarea>`));
    // selection-hook filters the HWND under the OS cursor before querying UIA focus.
    // Move our fixture under the pointer instead of moving the user's pointer. Focusing
    // a textarea alone can otherwise query an unrelated (possibly excluded) process.
    for (let attempt = 0; attempt < 3; attempt++) {
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor).bounds;
      fixture.setPosition(Math.max(display.x, Math.min(cursor.x - 100, display.x + display.width - 500)), Math.max(display.y, Math.min(cursor.y - 100, display.y + display.height - 260)));
      fixture.show(); fixture.focus(); fixture.webContents.focus();
      await until(() => fixture.isFocused(), 'selection fixture focus');
      await fixture.webContents.executeJavaScript("document.querySelector('textarea').focus()");
      fixture.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
      fixture.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
      assert.equal(await fixture.webContents.executeJavaScript("(() => { const input = document.querySelector('textarea'); return input.value.slice(input.selectionStart, input.selectionEnd); })()"), fixtureText, 'keyboard establishes the full test selection');
      await wait(750);
      const point = screen.getCursorScreenPoint();
      const bounds = fixture.getContentBounds();
      const focused = fixture.isFocused();
      const pointerInside = point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height;
      const diagnostic = { attempt: attempt + 1, focused, pointerInside, cursor: point, bounds, matched: false, method: '', process: '' };
      attempts.push(diagnostic);
      assert.ok(focused && pointerInside, 'native fixture lost focus or the pointer moved outside it');
      runtime.captureSelection();
      await until(() => !runtime.capturePending, 'native selection capture');
      diagnostic.matched = runtime.selection?.text === fixtureText;
      diagnostic.method = runtime.selection?.method ?? '';
      diagnostic.process = runtime.selection?.app ?? '';
      if (runtime.selection?.text === fixtureText) break;
    }
    assert.equal(runtime.selection?.text, fixtureText, 'Native capture should read the controlled selection');
    assert.equal(runtime.selection?.demo, false);
    if (runtime.platform.startsWith('linux')) {
      assert.equal(runtime.selection?.method, 'PRIMARY', 'Linux capture must come from PRIMARY');
      if (runtime.platform === 'linux-wayland') assert.equal(runtime.selection?.app, '未知应用');
      await until(() => !!runtime.toolbar?.isVisible(), 'Linux toolbar appears');
      await runtime.toolbar!.webContents.executeJavaScript("document.querySelector('[data-dismiss-toolbar]').click()");
      await until(() => !runtime.toolbar?.isVisible(), 'explicit close works without global input events');
      runtime.settings.enabled = false; runtime.configureHost();
      await until(() => runtime.status.hook === 'paused', 'Linux capture pauses');
      runtime.captureSelection();
      assert.equal(runtime.capturePending, false);
      runtime.settings.enabled = true; runtime.configureHost();
      await until(() => runtime.status.hook === 'ready', 'Linux capture resumes');
      checks.push('PRIMARY capture', 'pause', 'resume', 'explicit toolbar dismissal');
      if (runtime.platform === 'linux-x11') {
        const source = runtime.selection!.app;
        assert.notEqual(source, '未知应用', 'X11 identifies the source WM_CLASS');
        const excluded = runtime.settings.excludedApps;
        runtime.settings.excludedApps = [source]; runtime.status.hook = 'starting'; runtime.configureHost();
        await until(() => runtime.status.hook === 'ready', 'X11 exclusion configured');
        runtime.selection = undefined;
        fixture.focus(); fixture.webContents.focus();
        runtime.captureSelection();
        await until(() => !runtime.capturePending, 'excluded X11 capture finishes');
        assert.equal(runtime.selection, undefined, 'X11 exclusions block PRIMARY capture');
        runtime.settings.excludedApps = excluded; runtime.status.hook = 'starting'; runtime.configureHost();
        await until(() => runtime.status.hook === 'ready', 'X11 exclusion removed');
        runtime.captureSelection();
        await until(() => runtime.selection?.text === fixtureText, 'X11 capture recovers after removing exclusion');
        checks.push('X11 source identity and exclusions');
      }
      // sendInputEvent updates the fixture and PRIMARY, but does not inject an
      // OS gesture. Only the no-input Wayland backend uses PRIMARY alone.
      if (runtime.platform === 'linux-wayland' && runtime.status.message.includes('无全局输入事件')) {
        runtime.selection = undefined;
        runtime.settings.trigger = 'automatic'; runtime.status.hook = 'starting'; runtime.configureHost();
        await until(() => runtime.status.hook === 'ready', 'automatic PRIMARY monitoring configured');
        fixture.focus(); fixture.webContents.focus();
        await fixture.webContents.executeJavaScript(`document.querySelector('textarea').value = ${JSON.stringify(fixtureText + ' automatic')}; document.querySelector('textarea').focus()`);
        fixture.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
        fixture.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
        await until(() => runtime.selection?.text === fixtureText + ' automatic', 'automatic PRIMARY selection');
        assert.equal((runtime.selection as Selection | undefined)?.method, 'PRIMARY');
        checks.push('Wayland automatic capture without input devices');
      }
      runtime.dismissToolbar();
      runtime.settings.trigger = 'shortcut'; runtime.configureHost();
      assert.equal(await clipboard.readText(), initialClipboard, 'Linux PRIMARY capture does not replace the regular clipboard');
      checks.push('regular clipboard unchanged');
      passed = true;
      console.log('Glint Linux native smoke passed:', checks.join(', '));
      return;
    }
    assert.equal(runtime.selection?.method, 'UI Automation', 'selection must come from UIA');
    assert.equal(runtime.selection?.app.toLowerCase(), path.basename(process.execPath).toLowerCase(), 'process metadata must identify the fixture');
    runtime.dismissToolbar();
    const savedClipboard = await Promise.all((await clipboard.read()).filter(item => item.types.length > 0).map(async item =>
      new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
    const savedSettings = structuredClone(runtime.settings);
    // Native smoke owns only its fixture's copy shortcuts. Publish test payloads
    // with the Windows exclusion format so regression checks do not evict Win+V
    // entries from a real desktop. Production captures never use this fixture.
    const excludedItem = (data: ConstructorParameters<typeof ClipboardItem>[0]) => new ClipboardItem({
      ...data, 'electron application/osclipboard;format="ExcludeClipboardContentFromMonitorProcessing"': new Blob([new Uint8Array(4)])
    });
    let copyPayload: 'text' | 'image' | 'none' = 'text';
    const copiedText = 'Glint clipboard fixture';
    const testPNG = new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8DwHwAFBQIAgJbjwgAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' });
    let copyWrite: Promise<void> = Promise.resolve();
    fixture.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !input.control || !['c', 'insert'].includes(input.key.toLowerCase())) return;
      event.preventDefault();
      if (copyPayload !== 'none') copyWrite = clipboard.write([excludedItem(copyPayload === 'image'
        ? { 'image/png': testPNG } : { 'text/plain': copiedText })]);
    });
    try {
      // A distinct copy response proves that clipboard-only bypasses a working UIA provider.
      const capture = async (method: Settings['selectionMethod']): Promise<Selection | undefined> => {
        runtime.dismissToolbar();
        runtime.selection = undefined;
        runtime.settings.selectionMethod = method;
        runtime.settings.trigger = 'shortcut';
        runtime.configureHost();
        fixture.focus(); fixture.webContents.focus();
        await wait(150);
        runtime.captureSelection();
        assert.ok(runtime.capturePending, 'native capture was dispatched');
        await until(() => !runtime.capturePending, `native ${method} capture`);
        return runtime.selection as Selection | undefined;
      };
      await clipboard.write([excludedItem({ 'text/plain': 'Glint clipboard backup', 'text/html': '<b>Glint clipboard backup</b>' })]);
      const readHTML = async () => {
        const item = (await clipboard.read()).find(item => item.types.includes('text/html'));
        if (!item) return undefined;
        const data = await item.getType('text/html');
        assert.ok(data instanceof Blob);
        return data.text();
      };
      const previousHTML = await readHTML();
      const copied = await capture('clipboard');
      assert.equal(copied?.text, copiedText, 'copy mode bypasses UIA text');
      assert.equal(copied?.method, '剪贴板');
      assert.equal(await clipboard.readText(), 'Glint clipboard backup', 'copy mode restores text');
      assert.deepEqual(await readHTML(), previousHTML, 'copy mode restores HTML');
      await clipboard.clear();
      assert.equal((await capture('clipboard'))?.text, copiedText);
      assert.equal((await clipboard.read()).flatMap(item => item.types).length, 0, 'copy mode restores an empty clipboard');
      copyPayload = 'none';
      assert.equal(await capture('clipboard'), undefined, 'failed copy must not accept UIA text');
      assert.equal((await clipboard.read()).flatMap(item => item.types).length, 0, 'failed copy leaves clipboard untouched');
      copyPayload = 'image';
      assert.equal(await capture('clipboard'), undefined, 'screenshot is not selected text');
      await copyWrite;
      assert.equal(await clipboard.has('image/png'), true, 'new screenshot survives capture without being replaced by the backup');
      copyPayload = 'text';
      assert.equal((await capture('auto'))?.text, fixtureText, 'on-demand mode prefers available UIA text');
      assert.equal((await capture('accessibility'))?.text, fixtureText, 'switching back disables forced copy');
      runtime.settings.excludedApps.push(path.basename(process.execPath));
      assert.equal(await capture('clipboard'), undefined, 'copy mode respects excluded applications');
      runtime.settings.excludedApps = [...savedSettings.excludedApps];
      await fixture.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<canvas tabindex="0" aria-label="Copy fixture"></canvas>'));
      await fixture.webContents.executeJavaScript("document.querySelector('canvas').focus()");
      assert.equal(await capture('accessibility'), undefined, 'blank canvas has no accessible selection');
      assert.equal((await capture('auto'))?.text, copiedText, 'on-demand mode copies when accessibility has no text');
      console.log('Glint native smoke passed: UIA, forced copy, on-demand fallback, mode switching, exclusions, clipboard restoration and screenshot preservation');
    } finally {
      runtime.settings = savedSettings; runtime.configureHost(); runtime.dismissToolbar();
      await copyWrite;
      if (savedClipboard.length) await clipboard.write([...savedClipboard, excludedItem({})]); else await clipboard.clear();
    }
    passed = true;
  } finally {
    fs.writeFileSync(path.join(folder, 'smoke-report.json'), JSON.stringify({ passed, attempts, checks, hook: runtime.status.hook,
      manualChecks: runtime.platform.startsWith('linux') ? ['OS gesture-triggered capture with input devices', 'desktop portal shortcut authorization'] : [] }, null, 2));
    fixture.destroy();
  }

}

async function prepareScenario(runtime: ApplicationRuntime, focusForInput = true) {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (condition: () => boolean, description: string) => { const end = Date.now() + 15000; while (!condition()) { if (Date.now() > end) throw new Error(`Timeout: ${description}`); await wait(60); } };
  const folder = path.join(runtime.testRoot, 'work'); fs.mkdirSync(folder, { recursive: true });
  await until(() => runtime.status.hook === 'ready' || runtime.status.hook === 'error', 'native hook');
  assert.equal(runtime.status.hook, 'ready', runtime.status.message);
  await until(() => !!runtime.setup && !runtime.setup.webContents.isLoading(), 'settings page');
  await wait(500);
  // React commits on the next render; each interaction waits for that commit before reading DOM.
  const ui = async (code: string) => {
    // DOM-only records/dictionary checks do not need OS foreground activation.
    // Keyboard/focus scenarios retain their explicit desktop-focus assertions.
    if (focusForInput && !runtime.setup!.isFocused()) {
      runtime.setup!.focus();
      await until(() => !!runtime.setup?.isFocused(), 'settings focus before interaction');
    }
    if (focusForInput && !runtime.setup!.webContents.isFocused()) runtime.setup!.webContents.focus();
    await runtime.setup!.webContents.executeJavaScript(code, true);
    await runtime.setup!.webContents.executeJavaScript(`(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
    })()`);
  };
  const untilUI = async (condition: string, description: string) => {
    const deadline = Date.now() + 5000;
    while (!await runtime.setup!.webContents.executeJavaScript(condition)) {
      if (Date.now() > deadline) throw new Error(`Timeout: ${description}`);
      await wait(60);
    }
  };
  const setInput = async (selector: string, value: string) => ui(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  return { wait, until, folder, ui, untilUI, setInput };
}
