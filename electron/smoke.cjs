const fs = require('node:fs');
const path = require('node:path');
const pause = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms));

async function runSmoke({ app, window, createWindow }) {
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
      try { fs.writeFileSync(path.join(output, filename), (await win.webContents.capturePage()).toPNG()); return; }
      catch (error) { if (attempt === 2) throw error; await pause(200); }
    }
  };
  try {
    await pause(400);
    await js(`document.documentElement.style.setProperty('--drawer-motion', '0s')`);
    const initial = await js(`({ cards: document.querySelectorAll('[data-account-card]').length, title: document.body.innerText.includes('All accounts'), bridge: typeof window.pulse?.getState === 'function', visible: [...document.querySelectorAll('[data-account-card]')].every(row => row.getBoundingClientRect().bottom <= innerHeight), width: innerWidth, height: innerHeight })`);
    report.viewport = { width: initial.width, height: initial.height };
    report.fourAccounts = initial.cards === 4;
    report.secureBridge = initial.bridge;
    report.allFourVisible = initial.visible;
    report.ledgerOnly = await js(`!document.querySelector('select[aria-label="Dashboard view"]') && !document.body.innerText.includes('watching all accounts')`);
    await js(`document.querySelector('.companion-shortcut button').click()`);
    await pause();
    report.mobilePairingEntry = await js(`document.querySelector('[role="dialog"]').innerText.includes('Phone companion') && document.body.innerText.includes('Sample accounts cannot be paired')`);
    await capture(window, 'codex-pulse-phone-pairing.png');
    await js(`document.querySelector('button[aria-label="Close dialog"]').click()`);
    await pause();
    await capture(window, 'codex-pulse-smoke.png');
    await js(`document.querySelector('[aria-label="Chart quota window"]').click()`);
    await pause();
    report.themedDropdown = await js(`(() => { const menu = document.querySelector('.pulse-select-menu'); return menu?.getAttribute('role') === 'listbox' && getComputedStyle(menu).backgroundColor === 'rgb(32, 35, 27)' && menu.querySelectorAll('[role="option"]').length === 2 && menu.querySelector('[aria-selected="true"]').textContent.includes('7-day limit'); })()`);
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
    await js(`(() => { document.querySelector('button[aria-label="Rename account"]').focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); })()`);
    report.panelFocusTrap = await js(`document.activeElement.getAttribute('aria-label') === 'Close account panel'`);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
    await pause();
    report.panelKeyboardDismiss = await js(`!document.querySelector('.account-drawer')`);
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
    await capture(widget, 'codex-pulse-widget.png'); widget.destroy();
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
    fs.writeFileSync(path.join(output, 'codex-pulse-smoke.json'), JSON.stringify(report, null, 2));
    return Object.values(report).every(Boolean);
  } catch (error) {
    fs.writeFileSync(path.join(output, 'codex-pulse-smoke.json'), JSON.stringify({ ...report, error: error.message }, null, 2));
    return false;
  }
}
module.exports = { runSmoke };
