const { createHash } = require('node:crypto');
class ProviderError extends Error {
  constructor(code, retryAfter = null) { super(code); this.code = code; this.retryAfter = retryAfter; }
}
const HOSTS = new Set(['api.github.com', 'api.anthropic.com', 'api.cursor.com', 'monitoring.googleapis.com']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const text = (value, max = 120) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const identity = value => createHash('sha256').update(value).digest('hex');
async function json(url, options = {}, fetcher = fetch) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !HOSTS.has(target.hostname) || target.port || target.username || target.password || target.hash) throw new ProviderError('destination');
  let response;
  try { response = await fetcher(target.href, { ...options, redirect: 'error', signal: options.signal || AbortSignal.timeout(12000) }); }
  catch { throw new ProviderError(options.signal?.aborted ? 'canceled' : 'network'); }
  if (!response.ok) {
    try { await response.body?.cancel(); } catch {}
    const retry = Number(response.headers.get('retry-after'));
    throw new ProviderError(response.status === 401 ? 'auth' : response.status === 403 ? 'permission' : response.status === 429 ? 'rate' : 'service', finite(retry) && retry > 0 ? Math.min(retry, 86400) : null);
  }
  if (Number(response.headers.get('content-length')) > 2097152) { try { await response.body?.cancel(); } catch {} throw new ProviderError('size'); }
  const chunks = []; let length = 0;
  try {
    if (!response.body) throw new Error();
    for await (const chunk of response.body) { length += chunk.length; if (length > 2097152) throw new ProviderError('size'); chunks.push(Buffer.from(chunk)); }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch (error) { throw error instanceof ProviderError ? error : new ProviderError(options.signal?.aborted ? 'canceled' : 'schema'); }
}
function usdFromCents(values) {
  if (!values.length) return null;
  let sum = 0n;
  for (const raw of values) {
    const value = typeof raw === 'number' && finite(raw) ? String(raw) : raw;
    if (typeof value !== 'string' || !/^\d{1,18}(?:\.\d{1,9})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.split('.'); sum += BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
  }
  // One decimal-string cent is rounded once, after summing, to a USD cent.
  const cents = (sum + 500000000n) / 1000000000n;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
function sumCounts(values) {
  if (!values.length || values.some(value => count(value) === null)) return null;
  const total = values.reduce((sum, value) => sum + value, 0); return count(total);
}
const metric = (id, label, value, unit) => ({ id, label, value, unit });
const messages = {
  auth: 'The credential expired or was rejected. Reconnect this provider.', permission: 'This credential does not have the required reporting permission, or the plan does not expose this API.',
  rate: 'The provider asked us to wait. Saved readings are kept until the next permitted update.', network: 'The provider could not be reached. Saved readings are kept.',
  size: 'This report exceeds the safe response size. Use a smaller reporting scope.', schema: 'The provider returned an unsupported report. No quota was guessed.',
  service: 'The reporting service is temporarily unavailable. Saved readings are kept.', canceled: 'The reporting request was canceled or timed out.',
  runtime: 'The bundled Copilot runtime could not start. Check the installation and reconnect.', destination: 'The reporting destination was rejected.',
};
const publicError = error => messages[error?.code] || messages.service;
module.exports = { ProviderError, finite, count, text, instant, identity, json, usdFromCents, sumCounts, metric, publicError };
