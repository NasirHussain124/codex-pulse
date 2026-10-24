const fs = require('node:fs');
const path = require('node:path');
const pause = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms));

async function runSmoke({ app, window, createWindow, showQuickView, hideQuickView, getQuickWindow, getPinnedWindow }) {
  const report = {}, output = app.getPath('temp');
  const js = source => window.webContents.executeJavaScript(source);
  const setSelect = async (label, value) => {
    await js(`(() => { const trigger = document.querySelector('.pulse-select-trigger[aria-label="${label}"]'); if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click(); })()`);
    await pause();
    await js(`document.querySelector('.pulse-select-menu [role="option"][data-value="${value}"]').click()`);
    await pause();
  };
  const capture = async (win, filename) => {
    // Chromium can briefly reject a hidden-window capture while its GPU
    // surface is being initialized. Retry only that bounded observation.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const size = await win.webContents.executeJavaScript('({ width: innerWidth, height: innerHeight })');
        fs.writeFileSync(path.join(output, filename), (await win.webContents.capturePage({ x: 0, y: 0, ...size })).toPNG()); return;
      }
      catch (error) { if (attempt === 2) throw error; await pause(200); }
    }
  };
  try {
    // Hosted Windows provides a 1024x720 desktop and clamps native windows.
    // Test the intended large CSS viewport explicitly, not the host monitor.
    // Emulation is removed before the independent narrow-screen assertions.
    if (process.env.CI === 'true') window.webContents.enableDeviceEmulation({
      screenPosition: 'desktop', screenSize: { width: 1500, height: 1000 },
      deviceScaleFactor: 1, viewPosition: { x: 0, y: 0 },
      viewSize: { width: 1500, height: 1000 }, scale: 1,
    });
    await pause(400);
    await js(`document.documentElement.style.setProperty('--drawer-motion', '0s')`);
    const initial = await js(`({ cards: document.querySelectorAll('[data-account-card]').length, title: document.body.innerText.includes('All accounts'), bridge: typeof window.pulse?.getState === 'function', visible: [...document.querySelectorAll('[data-account-card]')].every(row => row.getBoundingClientRect().bottom <= innerHeight), width: innerWidth, height: innerHeight })`);
    report.viewport = { width: initial.width, height: initial.height };
    report.fourAccounts = initial.cards === 4;
    report.secureBridge = initial.bridge;
    // Verify that the native SDK bundle can actually spawn from app.asar.unpacked,
    // without a credential, login, session or model request.
    {
      const os = require('node:os');
      const { CopilotClient, RuntimeConnection } = require('@github/copilot-sdk');
      const copilot = require('./providers/copilot.cjs');
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-packaged-runtime-'));
      const client = new CopilotClient({ connection: copilot.connection(RuntimeConnection), mode: 'empty', useLoggedInUser: false, workingDirectory: directory, baseDirectory: directory, logLevel: 'none', env: copilot.runtimeEnvironment(directory) });
      const timer = setTimeout(() => void client.forceStop(), 20000);
      try { await client.start(); const pong = await client.ping('quota-package-health'); report.bundledProviderRuntime = pong.message.includes('quota-package-health'); }
      finally { clearTimeout(timer); await client.stop().catch(() => client.forceStop()); try { fs.rmSync(directory, { recursive: true, force: true }); } catch {} }
    }
    report.nativeClipboardBridge = await js(`typeof window.pulse.mobileCopyPair === 'function' && typeof window.pulse.copyLoginCode === 'function'`);
    report.allFourVisible = initial.visible;
    report.providerMarks = await js(`document.querySelectorAll('img.provider-mark').length >= 2 && [...document.querySelectorAll('img.provider-mark')].every(img => img.complete && img.naturalWidth > 0 && img.src.startsWith('pulse://app/providers/'))`);
    report.recoveryBridge = await js(`typeof window.pulse.createBackup === 'function' && typeof window.pulse.restoreBackup === 'function' && typeof window.pulse.diagnostics === 'function'`);
    await capture(window, 'quota-management-dashboard-v2.png');
    report.recommendations = await js(`Boolean(document.querySelector('[aria-label="Recommended next action"] .next-action[data-advice="use"]')) && document.body.innerText.includes('Use before reset')`);
    report.allAccountsGraphDefault = await js(`document.querySelector('[aria-label="Chart account"]').dataset.value === '' && document.querySelectorAll('[data-chart-series]').length === 4 && document.querySelector('svg[aria-label^="All accounts"]').getAttribute('aria-label').includes('Gaps mean missing observations')`);
    await js(`document.querySelector('.chart-account-legend button').click()`);
    await pause();
    report.chartLegendToggle = await js(`document.querySelectorAll('[data-chart-series]').length === 3`);
    await js(`document.querySelector('.chart-account-legend button').click()`);
    await setSelect('Chart account', '0000000000000000');
    report.individualAccountGraph = await js(`document.querySelectorAll('[data-chart-series]').length === 1`);
    await setSelect('Chart account', '');
    await setSelect('Recommendation strategy', 'reserve');
    report.recommendationStrategy = await js(`document.querySelector('[aria-label="Recommendation strategy"]').dataset.value === 'reserve' && document.querySelector('.next-action>p').textContent.includes('20% reserve')`);
    await js(`document.querySelector('.why-recommendation').click()`);
    await pause();
    report.recommendationExplanation = await js(`document.querySelector('.recommendation-explanation').innerText.includes('never happens automatically') && Boolean(document.querySelector('[aria-label="Planned session"]'))`);
    await js(`document.querySelector('.why-recommendation').click()`);
    await setSelect('Recommendation strategy', 'consume');
    report.ledgerWindowOrder = await js(`[...document.querySelectorAll('.account-entry')].every(row => [...row.querySelectorAll('.quota-cell')].map(cell => cell.dataset.window).join(',') === 'five_hour,weekly' && [...row.querySelectorAll('.quota-title>span')].map(label => label.textContent).join(',') === '5h,7 days')`);
    report.ledgerCleanRows = await js(`!document.querySelector('.credit-cell') && [...document.querySelectorAll('.entry-identity')].every(row => !row.innerText.includes('Last seen')) && document.querySelector('.active-marker')?.textContent.includes('Selected')`);
    report.ledgerKeyboardTargets = await js(`[...document.querySelectorAll('.quota-cell')].every(cell => cell.tagName === 'BUTTON' && cell.tabIndex === 0 && (cell.getAttribute('aria-label').includes('remaining') || cell.getAttribute('aria-label').includes('quota not reported')))`);
    report.ledgerOnly = await js(`!document.querySelector('select[aria-label="Dashboard view"]') && !document.body.innerText.includes('watching all accounts')`);
    await js(`document.querySelector('.companion-shortcut button').click()`);
    await pause();
    report.mobilePairingEntry = await js(`document.querySelector('[role="dialog"]').innerText.includes('Phone companion') && document.body.innerText.includes('Sample accounts cannot be paired')`);
    await capture(window, 'codex-pulse-phone-pairing.png');
    await js(`document.querySelector('button[aria-label="Close dialog"]').click()`);
    await pause();
    await capture(window, 'codex-pulse-smoke.png');
    const ledgerClip = await js(`(() => { const top = document.querySelector('.account-summary').getBoundingClientRect(), bottom = document.querySelector('.ledger-list').getBoundingClientRect(); return { x: Math.floor(top.left), y: Math.floor(top.top), width: Math.ceil(top.width), height: Math.ceil(bottom.bottom - top.top) }; })()`);
    fs.writeFileSync(path.join(output, 'codex-pulse-ledger-5h-7days.png'), (await window.webContents.capturePage(ledgerClip)).toPNG());
    await js(`document.querySelector('[aria-label="Chart quota window"]').click()`);
    await pause();
    report.themedDropdown = await js(`(() => { const menu = document.querySelector('.pulse-select-menu'); return menu?.getAttribute('role') === 'listbox' && getComputedStyle(menu).backgroundColor === 'rgb(41, 34, 48)' && menu.querySelectorAll('[role="option"]').length === 2 && menu.querySelector('[aria-selected="true"]').textContent.includes('7-day limit'); })()`);
    await capture(window, 'codex-pulse-dropdown.png');
    await setSelect('Chart quota window', 'five_hour');
    report.dropdownSelection = await js(`document.querySelector('[aria-label="Chart quota window"]').dataset.value === 'five_hour' && !document.querySelector('.pulse-select-menu')`);
    await js(`(() => { const trigger = document.querySelector('[aria-label="Chart quota window"]'); trigger.focus(); trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })); })()`);
    await pause();
    await js(`document.querySelector('[aria-label="Chart quota window"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
    await pause();
    report.dropdownKeyboard = await js(`document.querySelector('[aria-label="Chart quota window"]').dataset.value === 'weekly' && !document.querySelector('.pulse-select-menu')`);
    await js(`(() => { const trigger = document.querySelector('[aria-label="Chart quota window"]'); trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); })()`);
    await pause();
    await js(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
    await pause();
    report.dropdownOutsideDismiss = await js(`!document.querySelector('.pulse-select-menu')`);
    await js(`(() => { const input = document.querySelector('input[aria-label="Search accounts"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'studio builds'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await pause();
    report.search = await js(`document.querySelectorAll('[data-account-card]').length === 1`);
    await js(`(() => { const input = document.querySelector('input[aria-label="Search accounts"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await pause();
    await js(`document.querySelector('button[aria-label="Settings"]').click()`);
    await pause();
    report.settings = await js(`Boolean(document.querySelector('[role="dialog"]')) && document.body.innerText.includes('Low-quota notifications')`);
    report.backupPreviewReadOnly = await js(`Boolean(document.querySelector('[aria-label="Recovery and diagnostics"]')) && [...document.querySelectorAll('.recovery-tools button')].every(button => button.disabled)`);
    await js(`document.querySelector('[aria-label="Refresh interval"]').click()`);
    await pause();
    report.dropdownInsideDialog = await js(`Boolean(document.querySelector('.pulse-select-menu')?.closest('.dialog'))`);
    await setSelect('Refresh interval', '300');
    await js(`document.querySelector('button[aria-label="Close dialog"]').click()`);
    await pause();
    await js(`document.querySelector('button[aria-label="Hide email addresses"]').click()`);
    await pause();
    report.privacy = await js(`document.querySelector('.entry-identity p').textContent.includes('••••')`);
    await js(`document.querySelector('button[aria-label="Show email addresses"]').click()`);
    await js(`document.querySelector('.add-control').click()`);
    await pause();
    report.accountOnboarding = await js(`Boolean(document.querySelector('[role="dialog"]')) && [...document.querySelectorAll('button')].some(button => button.textContent.includes('Sign in with ChatGPT') && button.disabled) && document.body.innerText.includes('device code instead') && document.body.innerText.includes('Windows app')`);
    await js(`document.querySelector('button[aria-label="Close dialog"]').click()`);
    await setSelect('Sort accounts', 'remaining');
    report.sort = await js(`document.querySelectorAll('[data-account-card]').length === 4 && document.querySelector('.account-name').textContent === 'Personal'`);
    report.codexOnly = await js(`document.querySelectorAll('.provider-tab').length === 1 && document.querySelector('.provider-tab').textContent.includes('Codex')`);
    await js(`(() => { const button = document.querySelector('.account-name'); button.focus(); button.click(); })()`);
    await pause();
    report.accountPanel = await js(`Boolean(document.querySelector('.account-drawer[role="dialog"]')) && document.querySelector('.drawer-identity h3').textContent === 'Personal' && document.querySelector('main').inert && document.activeElement.getAttribute('aria-label') === 'Close account panel'`);
    report.drawerQuotaOrder = await js(`[...document.querySelectorAll('.drawer-quota>div:first-child>span')].map(label => label.textContent).join(',') === '5h,7 days'`);
    report.drawerFactsPreserved = await js(`['Credits', 'Banked resets', 'Last reading'].every(label => document.querySelector('.drawer-facts').textContent.includes(label))`);
    report.resetPreviewReadOnly = await js(`Boolean(document.querySelector('.reset-review')) && document.querySelector('.reset-review button').disabled`);
    await js(`(() => { const trigger = document.querySelector('[aria-label="Account in panel"]'); trigger.focus(); trigger.click(); })()`);
    await pause();
    await js(`document.querySelector('[aria-label="Account in panel"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
    await pause();
    report.dropdownEscapeKeepsPanel = await js(`!document.querySelector('.pulse-select-menu') && Boolean(document.querySelector('.account-drawer'))`);
    await setSelect('Account in panel', '0000000000000001');
    report.panelChooser = await js(`document.querySelector('.drawer-identity h3').textContent === 'Northstar' && document.querySelector('.select-account-btn').textContent.includes('Use this account') && document.querySelector('.select-account-btn').disabled`);
    await js(`document.querySelector('button[aria-label="Rename account"]').click()`);
    await pause();
    await js(`(() => { const input = document.querySelector('input[aria-label="Account name"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Work account'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await pause();
    await js(`document.querySelector('.drawer-rename button[type="submit"]').click()`);
    await pause();
    report.panelRename = await js(`document.querySelector('.drawer-identity h3').textContent === 'Work account' && [...document.querySelectorAll('.account-name')].some(button => button.textContent === 'Work account')`);
    await setSelect('Account in panel', '0000000000000003');
    report.panelReconnect = await js(`document.querySelector('.select-account-btn').textContent.includes('Reconnect this account') && document.querySelector('.drawer-quotas').textContent.includes('Reconnect to see quota')`);
    await capture(window, 'codex-pulse-account-panel.png');
    await js(`document.querySelector('button[aria-label="Close account panel"]').click()`);
    await pause();
    report.panelClose = await js(`!document.querySelector('.account-drawer') && !document.querySelector('main').inert`);
    report.panelFocusReturned = await js(`document.activeElement.classList.contains('account-name')`);
    await js(`document.querySelector('.quota-cell').click()`);
    await pause();
    report.rowOpensPanel = await js(`Boolean(document.querySelector('.account-drawer'))`);
    await js(`(() => { const targets = [...document.querySelectorAll('.account-drawer button:not(:disabled), .account-drawer input:not(:disabled), .account-drawer select:not(:disabled), .account-drawer a[href]')]; targets.at(-1).focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); })()`);
    report.panelFocusTrap = await js(`document.activeElement.getAttribute('aria-label') === 'Close account panel'`);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
    await pause();
    report.panelKeyboardDismiss = await js(`!document.querySelector('.account-drawer')`);
    report.detailsKeepAllAccountGraph = await js(`document.querySelector('[aria-label="Chart account"]').dataset.value === ''`);
    await js(`document.querySelector('.provider-tab').click()`);
    await pause();
    report.providerOpensPanel = await js(`Boolean(document.querySelector('.account-drawer'))`);
    await js(`document.querySelector('button[aria-label="Close account panel"]').click()`);
    await pause();
    await js(`document.querySelector('.forecast-settings-toggle').click()`);
    await pause();
    report.forecastSettings = await js(`Boolean(document.querySelector('.forecast-settings input'))`);
    await js(`document.querySelector('.forecast-settings-toggle').click()`);
    await js(`document.querySelector('button[aria-label="Collapse chart"]').click()`);
    await pause();
    report.collapseChart = await js(`!document.querySelector('.chart-layout')`);
    await js(`document.querySelector('button[aria-label="Expand chart"]').click()`);
    await pause();
    const widget = createWindow(true);
    await new Promise(resolve => widget.webContents.once('did-finish-load', resolve));
    await pause(300);
    report.widget = await widget.webContents.executeJavaScript(`document.querySelectorAll('[data-account-card]').length === 4 && [...document.querySelectorAll('[data-account-card]')].every(row => row.getBoundingClientRect().bottom <= innerHeight)`);
    const widgetJS = source => widget.webContents.executeJavaScript(source);
    report.widgetBrand = await widgetJS(`document.body.innerText.includes('Quota management') && document.querySelectorAll('.quota-card').length === 4 && getComputedStyle(document.querySelector('.quota-card')).borderRadius === '17px' && getComputedStyle(document.querySelector('.quota-mini-track')).height === '3px'`);
    report.widgetAccurateFills = await widgetJS(`[...document.querySelectorAll('.quota-mini')].every(metric => Number.parseFloat(metric.querySelector('.quota-mini-track>i').style.width) === Number(metric.dataset.remaining || 0))`);
    await capture(widget, 'codex-pulse-widget.png');
    report.widgetBothLimits = await widgetJS(`document.querySelectorAll('.quota-mini[data-quota="5h"]').length === 4 && document.querySelectorAll('.quota-mini[data-quota="7d"]').length === 4 && !document.querySelector('.widget-period')`);
    await widgetJS(`document.querySelector('.quota-card').click()`); await pause();
    report.widgetAccountPanel = await widgetJS(`Boolean(document.querySelector('.account-drawer')) && document.querySelector('.battery-widget').parentElement.inert`);
    await widgetJS(`document.querySelector('button[aria-label="Close account panel"]').click()`); await pause();
    await widgetJS(`document.querySelector('button[aria-label="Add account"]').click()`); await pause();
    report.widgetAddAccount = await widgetJS(`Boolean(document.querySelector('[role="dialog"]')) && document.body.innerText.includes('Sign in with ChatGPT')`);
    await widgetJS(`document.querySelector('button[aria-label="Close dialog"]').click()`); await pause();
    widget.setSize(350, 590); await pause(200);
    report.widgetNarrow = await widgetJS(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.quota-card')].every(row => row.getBoundingClientRect().bottom <= innerHeight)`);
    widget.destroy();
    window.show(); window.focus(); await pause(250);
    showQuickView();
    const quick = getQuickWindow();
    if (quick.webContents.isLoadingMainFrame()) await new Promise(resolve => quick.webContents.once('did-finish-load', resolve));
    await pause(300);
    const quickJS = source => quick.webContents.executeJavaScript(source);
    report.quickViewBothLimits = await quickJS(`document.querySelectorAll('.quota-card').length === 4 && document.querySelectorAll('.quota-mini').length === 8 && document.documentElement.scrollWidth <= innerWidth`);
    report.quickNative = { visible: quick.isVisible(), onTop: quick.isAlwaysOnTop(), title: quick.getTitle() };
    report.quickViewNativeWindow = report.quickNative.visible && report.quickNative.onTop && report.quickNative.title.includes('Quick view');
    await capture(quick, 'codex-pulse-quick-view.png');
    quick.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); quick.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await pause();
    report.quickEscapeHides = !quick.isVisible();
    showQuickView(); await pause(); const firstQuickId = quick.id;
    quick.emit('blur'); await pause();
    report.quickBlurHides = !quick.isVisible();
    showQuickView(); await pause();
    report.quickReusesWindow = getQuickWindow().id === firstQuickId && quick.isVisible();
    showQuickView(true); await pause();
    report.quickClickToggles = !quick.isVisible();
    showQuickView(); await pause();
    await quickJS(`document.querySelector('.quick-footer button:last-child').click()`); await pause(200);
    report.quickDashboard = !quick.isVisible() && window.isVisible() && await js(`document.querySelectorAll('[data-account-card]').length === 4`);
    showQuickView(); await pause();
    await quickJS(`document.querySelector('[aria-label="Pin usage widget"]').click()`); await pause(400);
    const pinned = getPinnedWindow();
    if (pinned?.webContents.isLoadingMainFrame()) await new Promise(resolve => pinned.webContents.once('did-finish-load', resolve));
    await pause();
    report.quickPin = !quick.isVisible() && pinned && await pinned.webContents.executeJavaScript(`document.querySelectorAll('.quota-card').length === 4 && document.querySelectorAll('.quota-mini').length === 8`);
    pinned?.destroy(); hideQuickView(); quick.destroy();
    if (process.env.CI === 'true') window.webContents.disableDeviceEmulation();
    window.setMinimumSize(360, 360); window.setSize(430, 900);
    await pause(250);
    report.narrowNoOverflow = await js(`document.documentElement.scrollWidth <= innerWidth + 1`);
    await js(`document.querySelector('[aria-label="Chart quota window"]').click()`);
    await pause();
    report.narrowDropdown = await js(`(() => { const rect = document.querySelector('.pulse-select-menu').getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight; })()`);
    await setSelect('Chart quota window', 'weekly');
    await capture(window, 'codex-pulse-narrow.png');
    await js(`document.querySelector('.account-name').click()`);
    await pause();
    report.narrowPanel = await js(`document.querySelector('.account-drawer').getBoundingClientRect().right <= innerWidth + 1 && document.querySelector('.account-drawer').scrollWidth <= innerWidth + 1`);
    await js(`document.querySelector('button[aria-label="Close account panel"]').click()`);
    // Multi-provider capabilities are opt-in samples, not decorative connected
    // accounts. Opening them must leave Codex history/recommendations intact.
    await js(`document.querySelector('.connect-provider-nav').click()`); await pause();
    report.providerConnectChoices = await js(`document.querySelectorAll('.provider-options button').length === 4 && Boolean(document.querySelector('.provider-connect input[type="password"]:disabled')) && document.querySelector('[role="dialog"]').innerText.includes('Sample mode is read-only')`);
    await js(`document.querySelectorAll('.provider-options button')[3].click()`); await pause();
    report.providerGeminiScope = await js(`Boolean(document.querySelector('.provider-connect textarea:disabled')) && document.querySelector('.provider-capability').innerText.includes('not Gemini CLI')`);
    await js(`document.querySelector('button[aria-label="Close dialog"]').click()`); await pause();
    await js(`document.querySelector('.sample-provider-reports').click()`); await pause();
    report.providerSampleCards = await js(`document.querySelectorAll('.provider-connection-card').length === 4 && document.querySelectorAll('.connected-provider-tab').length === 4 && document.documentElement.scrollWidth <= innerWidth + 1`);
    await js(`document.querySelector('.provider-connection-card').click()`); await pause();
    report.providerNativeQuota = await js(`document.querySelector('.provider-drawer').innerText.includes('72% left') && document.querySelector('.provider-drawer').innerText.includes('Sample report') && document.querySelector('main').inert && document.querySelectorAll('[data-chart-series]').length === 4`);
    await setSelect('Provider connection in panel', '00000000-0000-4000-8000-000000000002');
    report.providerClaudeUsageOnly = await js(`!document.querySelector('.provider-drawer .provider-quota') && document.querySelectorAll('.provider-metrics>div').length === 3 && document.querySelector('.provider-drawer').innerText.includes('not Claude.ai') && [...document.querySelectorAll('.provider-drawer button')].filter(button => /Rename|Remove|Reconnect|Pause/.test(button.textContent)).every(button => button.disabled)`);
    await setSelect('Provider connection in panel', '00000000-0000-4000-8000-000000000003');
    report.providerCursorMembers = await js(`Boolean(document.querySelector('.provider-members')) && !document.querySelector('.provider-drawer .provider-quota')`);
    await setSelect('Provider connection in panel', '00000000-0000-4000-8000-000000000004');
    report.providerGeminiUnknown = await js(`!document.querySelector('.provider-drawer .provider-quota') && document.querySelector('.provider-drawer').innerText.includes('not guessed') && document.querySelector('.provider-drawer').scrollWidth <= innerWidth + 1`);
    await capture(window, 'quota-management-provider-mobile-width.png');
    await js(`document.querySelector('button[aria-label="Close provider panel"]').click()`); await pause();
    window.setSize(1500, 1000); await pause(200);
    await js(`document.querySelectorAll('.provider-connection-card')[0].click()`); await pause();
    await capture(window, 'quota-management-provider-report.png');
    await js(`document.querySelector('button[aria-label="Close provider panel"]').click()`);
    fs.writeFileSync(path.join(output, 'codex-pulse-smoke.json'), JSON.stringify(report, null, 2));
    return Object.values(report).every(Boolean);
  } catch (error) {
    fs.writeFileSync(path.join(output, 'codex-pulse-smoke.json'), JSON.stringify({ ...report, error: error.message }, null, 2));
    return false;
  }
}
module.exports = { runSmoke };
