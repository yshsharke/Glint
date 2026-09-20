import { app, BrowserWindow, clipboard, ClipboardItem, screen } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { defaults } from '../../src/core';
import type { Settings } from '../../src/core';
import type { ApplicationRuntime } from '../../src/main';

export async function runSmoke(runtime: ApplicationRuntime, mode: string) {
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
  await fs.promises.writeFile(path.join(folder, 'settings.png'), (await runtime.setup!.webContents.capturePage()).toPNG());
  for (const [selector, name] of [['input[data-action-field=name]', 'input-focus-dark'], ['textarea[data-action-field=prompt]', 'textarea-focus-dark']]) {
    await runtime.setup!.webContents.executeJavaScript(`document.querySelector('${selector}').focus()`);
    await fs.promises.writeFile(path.join(folder, `${name}.png`), (await runtime.setup!.webContents.capturePage()).toPNG());
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
  await fs.promises.writeFile(path.join(folder, 'dropdown-dark.png'), (await runtime.setup!.webContents.capturePage()).toPNG());
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
  await fs.promises.writeFile(path.join(folder, 'icon-picker.png'), (await runtime.setup!.webContents.capturePage()).toPNG());
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
    await fs.promises.writeFile(path.join(folder, `${tab}-light.png`), (await runtime.setup!.webContents.capturePage()).toPNG());
    if (tab === 'actions') {
      await ui("document.querySelector('input[data-action-field=name]').focus()");
      await fs.promises.writeFile(path.join(folder, 'input-focus-light.png'), (await runtime.setup!.webContents.capturePage()).toPNG());
      await ui("document.querySelector('[data-action-field=kind]').focus(); document.querySelector('[data-action-field=kind]').click()");
      await fs.promises.writeFile(path.join(folder, 'dropdown-light.png'), (await runtime.setup!.webContents.capturePage()).toPNG());
      runtime.setup!.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      runtime.setup!.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await wait(200);
      assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-action-field=kind]').getAttribute('aria-expanded')"), 'false', 'Escape closes Fluent dropdown');
    }
  }
  runtime.setup!.setSize(820, 570);
  await runtime.setup!.webContents.executeJavaScript("document.querySelector('[data-page=actions]').click()");
  await wait(100);
  await fs.promises.writeFile(path.join(folder, 'settings-small.png'), (await runtime.setup!.webContents.capturePage()).toPNG());
  runtime.setup!.setSize(920, 640);
  await ui("document.querySelector('[data-page=triggers]').click()");
  const fallbackBefore = await runtime.setup!.webContents.executeJavaScript("document.querySelector('input[data-field=clipboardFallback]').checked");
  await ui("document.querySelector('input[data-field=clipboardFallback]').click()");
  assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('input[data-field=clipboardFallback]').checked"), !fallbackBefore, 'Fluent switch updates the draft');
  await ui("document.querySelector('[data-revert]').click()");
  assert.equal(await runtime.setup!.webContents.executeJavaScript("document.querySelector('input[data-field=clipboardFallback]').checked"), fallbackBefore, 'revert restores switch state');
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
async function runRecordsSmoke(runtime: ApplicationRuntime) {
  const { wait, until, folder, ui, untilUI } = await prepareScenario(runtime);
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
    const saved = await runtime.setup!.webContents.executeJavaScript(`window.glint.save(${JSON.stringify(next)})`);
    assert.equal(saved.ok, true, saved.error);
    await runtime.showDemo(); await wait(350);
    assert.ok(runtime.toolbar?.isVisible());
    assert.equal(runtime.toolbar!.isFocusable(), false);
    assert.equal(await runtime.toolbar!.webContents.executeJavaScript("document.querySelectorAll('[data-run]').length"), next.actions.filter(a => a.enabled).length);
    assert.equal(await runtime.toolbar!.webContents.executeJavaScript("document.querySelector('[data-run=copy]')"), null, 'the retired default copy action is absent');
    await fs.promises.writeFile(path.join(folder, 'toolbar.png'), (await runtime.toolbar!.webContents.capturePage()).toPNG());
    const readToolbarLayout = () => runtime.toolbar!.webContents.executeJavaScript(`(() => {
      const actions = document.querySelector('.bar-actions');
      const last = actions.lastElementChild.getBoundingClientRect();
      return { viewport: actions.clientWidth, content: actions.scrollWidth, lastRight: last.right, viewportRight: actions.getBoundingClientRect().right, x: last.x + last.width / 2, y: last.y + last.height / 2 };
    })()`);
    const toolbarLayout = await readToolbarLayout();
    assert.ok(toolbarLayout.lastRight <= toolbarLayout.viewportRight + 0.5, 'Last action clipped: ' + JSON.stringify(toolbarLayout));
    runtime.toolbar!.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(toolbarLayout.x), y: Math.round(toolbarLayout.y) });
    await wait(100);
    await fs.promises.writeFile(path.join(folder, 'toolbar-last-hover.png'), (await runtime.toolbar!.webContents.capturePage()).toPNG());
    runtime.setup!.hide();
    assert.equal(await runtime.toolbar!.webContents.executeJavaScript("document.querySelectorAll('[data-open-settings]').length"), 1);
    await runtime.toolbar!.webContents.executeJavaScript("document.querySelector('button.mini-brand[data-open-settings]').click()");
    await until(() => !!runtime.setup?.isVisible() && !runtime.toolbar?.isVisible(), 'brand button opens settings and dismisses toolbar');
    for (const density of ['comfortable', 'compact'] as const) {
      runtime.settings = structuredClone(next); runtime.settings.density = density;
      runtime.settings.actions.find(a => a.id === 'search')!.name = '搜索 WMWM';
      await runtime.showDemo(); await wait(150);
      const layout = await readToolbarLayout();
      assert.ok(layout.lastRight <= layout.viewportRight + 0.5, `Last action clipped (${density}): ${JSON.stringify(layout)}`);
    }
    runtime.dismissToolbar(); runtime.broadcast(); await wait(100);
    assert.equal(runtime.toolbar!.isVisible(), false, 'A stale measurement must not reopen a dismissed toolbar');
    runtime.settings = structuredClone(next);
    await runtime.showDemo(); await wait(150);
    await runtime.runAction('translate');
    await until(() => !!runtime.result && !runtime.result.busy, 'streaming response');
    assert.equal(runtime.result!.text, 'Glint 流式测试成功。');
    assert.equal(runtime.result!.error, undefined);
    assert.equal(JSON.parse(received).model, 'local-test');
    assert.ok(JSON.parse(received).messages[0].content.includes('Good tools'));
    await wait(250);
    assert.equal(runtime.resultWindow!.isMaximizable(), false);
    assert.equal(runtime.resultWindow!.isMinimizable(), false);
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
    await fs.promises.writeFile(path.join(folder, 'result.png'), (await runtime.resultWindow!.webContents.capturePage()).toPNG());
    runtime.settings.theme = 'light'; runtime.broadcast(); await wait(100);
    await fs.promises.writeFile(path.join(folder, 'result-light.png'), (await runtime.resultWindow!.webContents.capturePage()).toPNG());
    runtime.resultWindow!.setSize(380, 240);
    const originalApp = runtime.result!.app; runtime.result!.app = 'a-very-long-source-application-name.exe'; runtime.broadcast(); await wait(100);
    await fs.promises.writeFile(path.join(folder, 'result-small.png'), (await runtime.resultWindow!.webContents.capturePage()).toPNG());
    runtime.result!.app = originalApp; runtime.resultWindow!.setSize(480, 360);
    const previousCardId = runtime.result!.id;
    responseDelay = 10_000;
    await runtime.runAction('translate');
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
    await fs.promises.writeFile(path.join(folder, 'history.png'), (await runtime.setup!.webContents.capturePage()).toPNG());
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
    runtime.settings = structuredClone(defaults); runtime.persist(runtime.settings, ''); runtime.configureHost();
    const report = { passed: true, nativeHook: runtime.status.hook, shortcut: runtime.status.shortcutReady, checks: ['local SSE requests', 'record save, retry, copy, delete and re-record', 'action database isolation', 'history refresh and dynamic categories'], memory: app.getAppMetrics().map(m => ({ type: m.type, memory: m.memory })), note: 'Live selection in third-party applications requires manual verification. Memory is a test-session snapshot with open windows, not an idle benchmark.' };
    fs.writeFileSync(path.join(folder, 'smoke-report.json'), JSON.stringify(report, null, 2));
    console.log('Glint records smoke passed:', report.checks.join(', '));
  } finally { server.close(); }

}
async function runNativeSmoke(runtime: ApplicationRuntime) {
  const { wait, until, folder } = await prepareScenario(runtime);
  app.setAccessibilitySupportEnabled(true);
  const fixtureText = 'Glint native selection fixture';
  const fixture = new BrowserWindow({ width: 500, height: 260, frame: false, alwaysOnTop: true, show: false, title: 'Glint native selection test', webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
  const attempts: unknown[] = [];
  let passed = false;
  try {
    assert.equal(runtime.settings.clipboardFallback, false, 'native test must not use clipboard fallback');
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
    assert.equal(runtime.selection?.text, fixtureText, 'Native UI Automation should read the controlled selection');
    assert.equal(runtime.selection?.demo, false);
    assert.equal(runtime.selection?.method, 'UI Automation', 'selection must come from UIA');
    assert.equal(runtime.selection?.app.toLowerCase(), path.basename(process.execPath).toLowerCase(), 'process metadata must identify the fixture');
    passed = true;
    runtime.dismissToolbar();
    console.log('Glint native smoke passed: real UIA selection and source process, clipboard fallback disabled');
  } finally {
    fs.writeFileSync(path.join(folder, 'smoke-report.json'), JSON.stringify({ passed, attempts, hook: runtime.status.hook }, null, 2));
    fixture.destroy();
  }

}

async function prepareScenario(runtime: ApplicationRuntime) {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (condition: () => boolean, description: string) => { const end = Date.now() + 15000; while (!condition()) { if (Date.now() > end) throw new Error(`Timeout: ${description}`); await wait(60); } };
  const folder = path.join(runtime.testRoot, 'work'); fs.mkdirSync(folder, { recursive: true });
  await until(() => runtime.status.hook === 'ready' || runtime.status.hook === 'error', 'native hook');
  assert.equal(runtime.status.hook, 'ready', runtime.status.message);
  await until(() => !!runtime.setup && !runtime.setup.webContents.isLoading(), 'settings page');
  await wait(500);
  // React commits on the next render; each interaction waits for that commit before reading DOM.
  const ui = async (code: string) => {
    runtime.setup!.focus(); runtime.setup!.webContents.focus();
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
