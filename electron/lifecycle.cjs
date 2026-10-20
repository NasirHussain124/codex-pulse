// Synthetic offline test profile only. It cannot point at a real Codex home.
const fs = require('node:fs');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function runLifecycle({ app, window, createWindow, showDashboard, state }) {
  const root = app.getPath('userData'), result = {};
  const count = win => win.webContents.executeJavaScript(`document.querySelectorAll('[data-account-card]').length`);
  const waitFor = async predicate => { for (let i = 0; i < 60; i++) { if (await predicate()) return; await pause(50); } throw new Error('Account view did not hydrate.'); };
  try {
    await waitFor(async () => await count(window) === 4);
    result.startupFromVault = state().snapshot.accounts.length === 4 && state().initialized;
    result.initialAccounts = await count(window);
    window.close();
    result.closeHidesToTray = !window.isDestroyed() && !window.isVisible();
    showDashboard();
    await waitFor(async () => await count(window) === 4);
    result.accountsAfterReopen = await count(window);
    window.webContents.reload();
    await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
    await waitFor(async () => await count(window) === 4);
    result.accountsAfterReload = await count(window);
    const second = createWindow();
    await new Promise(resolve => second.webContents.once('did-finish-load', resolve));
    await waitFor(async () => await count(second) === 4);
    result.accountsInNewWindow = await count(second);
    second.destroy();
    result.noEmptySetup = !await window.webContents.executeJavaScript(`Boolean(document.querySelector('.empty-monitor'))`);
    result.mobileEncryptedPairing = await require('./mobile-smoke.cjs').testMobile(root, state);
    fs.writeFileSync(path.join(root, 'lifecycle-result.json'), JSON.stringify(result));
    return result.mobileEncryptedPairing && result.startupFromVault && result.closeHidesToTray && result.noEmptySetup && [result.initialAccounts, result.accountsAfterReopen, result.accountsAfterReload, result.accountsInNewWindow].every(value => value === 4);
  } catch (error) { fs.writeFileSync(path.join(root, 'lifecycle-result.json'), JSON.stringify({ ...result, error: error.message })); return false; }
}
module.exports = { runLifecycle };
