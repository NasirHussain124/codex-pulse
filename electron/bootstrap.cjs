function validSnapshot(value) {
  return Boolean(value && value.schemaVersion === 1 && Array.isArray(value.accounts)
    && value.accounts.every(account => account && typeof account.id === 'string'
      && typeof account.identity === 'string' && Array.isArray(account.windows)));
}

async function loadLocalAccounts({ engine, cached, empty }) {
  // The vault roster is authoritative. A missing/disposable snapshot or an
  // offline quota endpoint must not turn saved accounts into an empty setup.
  try {
    const snapshot = await engine.request('snapshot', { refresh: false });
    if (!validSnapshot(snapshot)) throw new Error('Invalid local account roster.');
    return { snapshot, source: 'vault', error: null, initialized: true };
  } catch {
    const usable = validSnapshot(cached);
    return { snapshot: usable ? cached : empty, source: usable ? 'cache' : 'unavailable',
      error: usable ? 'Saved readings are shown. The local account vault could not be loaded; retry to reconnect.'
        : 'Your saved account list could not be loaded. Your credentials have not been deleted. Retry before adding accounts again.',
      initialized: usable && cached.accounts.length > 0 };
  }
}
module.exports = { validSnapshot, loadLocalAccounts };
