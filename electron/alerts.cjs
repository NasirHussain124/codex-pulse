const finite = value => typeof value === 'number' && Number.isFinite(value);
function eligible(account, settings, now) {
  const at = Date.parse(account.fetchedAt || '');
  return !account.disabled && settings.accounts?.[account.identity]?.group !== 'reserved' && account.status === 'ready'
    && Number.isFinite(at) && now - at <= 300000 && at <= now + 60000;
}
function headroom(account) {
  const five = account.windows.find(w => w.durationMinutes === 300), week = account.windows.find(w => w.durationMinutes === 10080);
  if (!five || !week || [five, week].some(w => !finite(w.remainingPercent) || w.remainingPercent < 0 || w.remainingPercent > 100)) return null;
  return Math.min(five.remainingPercent, week.remainingPercent);
}
function actionableAlerts(current, previous, settings, now = Date.now()) {
  if (!settings.notifications || !settings.recommendationAlerts) return [];
  const result = [];
  for (const account of current.accounts || []) {
    if (!eligible(account, settings, now)) continue;
    const name = settings.accounts?.[account.identity]?.label || (settings.privacy ? `Account ${account.id}` : account.email.split('@')[0]);
    const expiry = Date.parse(account.resetCredits?.earliestExpiresAt || '');
    const count = account.resetCredits?.available;
    if (Number.isSafeInteger(count) && count > 0 && expiry > now && expiry - now <= 86400000) {
      const band = expiry - now <= 3600000 ? '1h' : expiry - now <= 21600000 ? '6h' : '24h';
      const available = headroom(account);
      result.push({ key: `reset:${account.identity}:${expiry}:${band}`, identity: account.identity,
        title: 'A banked reset expires soon', message: `${name} · ${count} reset${count === 1 ? '' : 's'} reported. ${available !== null && available > 0 ? 'Use existing allowance first.' : 'Review whether a reset would help.'} Nothing is redeemed automatically.` });
    }
    const before = previous?.accounts?.find(row => row.identity === account.identity);
    if (before && headroom(before) === 0 && headroom(account) > 0 && account.fetchedAt !== before.fetchedAt) {
      result.push({ key: `available:${account.identity}:${account.fetchedAt}`, identity: account.identity,
        title: 'Your quota has room again', message: `${name} · a new provider reading shows usable quota in both windows.` });
    }
  }
  return result;
}
module.exports = { actionableAlerts };
