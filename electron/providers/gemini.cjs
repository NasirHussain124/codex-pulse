const { ProviderError, json, identity, text, finite, count, instant, sumCounts, metric } = require('./common.cjs');
const SERVICE = 'generativelanguage.googleapis.com';
const requestInterval = now => ({ start: Math.ceil((now - 86400000) / 60000) * 60000, end: Math.floor(now / 60000) * 60000 });

function point(series) {
  if (!series || !Array.isArray(series.points)) return null;
  return series.points.flatMap(row => {
    const at = instant(row?.interval?.endTime);
    const value = row?.value?.int64Value !== undefined && /^\d{1,15}$/.test(String(row.value.int64Value)) ? Number(row.value.int64Value) : row?.value?.doubleValue;
    return at && finite(value) && value >= 0 ? [{ at, value }] : [];
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;
}
function scopeKey(series) {
  const resource = series.resource?.labels || {}, labels = series.metric?.labels || {};
  return JSON.stringify([Object.entries(resource).sort(([a], [b]) => a.localeCompare(b)), labels.quota_metric || '', labels.limit_name || '', labels.window_size || '']);
}
function quotas(limits, usage, now) {
  return limits.slice(0, 100).flatMap(series => {
    const limit = point(series), labels = series.metric?.labels || {};
    if (!limit || Date.parse(limit.at) > now + 60000 || now - Date.parse(limit.at) > 30 * 3600000 || !text(labels.quota_metric)) return [];
    const matches = usage.filter(row => scopeKey(row) === scopeKey(series));
    // Multiple method/window-start series cannot safely be collapsed into a
    // budget. Show the reported limit alone unless one exact series is known.
    const reading = matches.length === 1 ? point(matches[0]) : null;
    const fresh = reading && Date.parse(reading.at) <= now + 60000 && now - Date.parse(reading.at) <= 15 * 60000;
    const used = fresh ? reading.value : null;
    return [{ id: identity(scopeKey(series)).slice(0, 16), label: text(labels.limit_name || labels.quota_metric, 120),
      period: text(labels.window_size, 40) || 'Provider quota window', unit: 'reported units', unlimited: false,
      used, limit: limit.value, remainingPercent: used !== null && limit.value > 0 ? Math.max(0, Math.min(100, (1 - used / limit.value) * 100)) : null,
      resetsAt: null, observedAt: fresh ? reading.at : limit.at }];
  });
}
async function series(config, token, type, context, requests = false) {
  const now = context.now ?? Date.now(), rows = []; let next = null;
  const seen = new Set();
  for (let page = 0; page < 10; page++) {
    const interval = requests ? requestInterval(now) : { start: now - 86400000, end: now };
    const params = new URLSearchParams({ filter: `metric.type="${type}" AND resource.type="${requests ? 'consumed_api' : 'consumer_quota'}" AND resource.labels.service="${SERVICE}"`,
      'interval.startTime': new Date(interval.start).toISOString(), 'interval.endTime': new Date(interval.end).toISOString(), view: 'FULL', pageSize: '1000' });
    // Whole-minute buckets avoid counting an entire UTC day at either edge of
    // a rolling 24h query. Do not prorate or count partially overlapping buckets.
    if (requests) { params.set('aggregation.alignmentPeriod', '60s'); params.set('aggregation.perSeriesAligner', 'ALIGN_SUM'); }
    if (next) params.set('pageToken', next);
    const value = await json(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(config.projectId)}/timeSeries?${params}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: context.signal }, context.fetcher);
    if (value.timeSeries !== undefined && (!Array.isArray(value.timeSeries) || value.timeSeries.length > 1000)) throw new ProviderError('schema');
    for (const row of value.timeSeries || []) {
      if (row?.metric?.type !== type || row?.resource?.labels?.service !== SERVICE || String(row?.resource?.labels?.project_id) !== config.projectId) throw new ProviderError('schema');
      rows.push(row);
    }
    if (!value.nextPageToken) return { rows, complete: true };
    if (typeof value.nextPageToken !== 'string' || value.nextPageToken.length > 2048 || seen.has(value.nextPageToken)) throw new ProviderError('schema');
    next = value.nextPageToken; seen.add(next);
  }
  return { rows, complete: false };
}
async function collect(config, context = {}) {
  const now = context.now ?? Date.now();
  const getToken = context.getGoogleToken || (async () => {
    const { JWT } = require('google-auth-library');
    // Explicit, validated service-account fields only: never accept arbitrary
    // credential types, executable external-account sources or a token_uri.
    const client = new JWT({ email: config.serviceAccount.client_email, key: config.serviceAccount.private_key,
      keyId: config.serviceAccount.private_key_id, projectId: config.projectId,
      scopes: ['https://www.googleapis.com/auth/monitoring.read'], universeDomain: 'googleapis.com',
      transporterOptions: { timeout: 10000, retry: false, signal: context.signal } });
    const result = await client.getAccessToken();
    if (typeof result.token !== 'string' || !result.token) throw new ProviderError('auth');
    return result.token;
  });
  let token;
  try { token = await getToken(config, context.signal); }
  catch { throw new ProviderError(context.signal?.aborted ? 'canceled' : 'auth'); }
  if (context.signal?.aborted) throw new ProviderError('canceled');
  const [limit, usage, requests] = await Promise.all([
    series(config, token, 'serviceruntime.googleapis.com/quota/ratev2/limit', context),
    series(config, token, 'serviceruntime.googleapis.com/quota/ratev2/net_usage', context),
    series(config, token, 'serviceruntime.googleapis.com/api/request_count', context, true),
  ]);
  const interval = requestInterval(now);
  const points = requests.rows.flatMap(row => Array.isArray(row.points) ? row.points.flatMap(value => {
    const start = Date.parse(value.interval?.startTime), end = Date.parse(value.interval?.endTime), reading = point({ points: [value] });
    return reading && Number.isFinite(start) && start >= interval.start && end <= interval.end && end > start ? [reading] : [];
  }) : []);
  const complete = limit.complete && usage.complete && requests.complete;
  return { subjectKey: `gemini-project:${config.projectId}`, subject: config.projectId, scope: 'project', periodStart: new Date(interval.start).toISOString(), periodEnd: new Date(interval.end).toISOString(), complete,
    source: 'https://ai.google.dev/gemini-api/docs/rate-limits', quotas: limit.complete && usage.complete ? quotas(limit.rows, usage.rows, now) : [],
    metrics: [metric('requests', 'API requests · last 24h', requests.complete ? sumCounts(points.map(row => count(row.value))) : null, 'requests')], members: [],
    notes: ['Gemini API project monitoring, not Gemini CLI or Google AI Pro/Ultra account quota.', 'Quota is shared by the project, not individual API keys. Monitoring data can lag or be unavailable for a service/limit.',
      'A remaining percentage requires a single matching recent usage/limit series. No reset time is inferred. Request totals cover the last 24h rounded inward to whole minutes; partial edge buckets are not counted.',
      ...(!limit.rows.length ? ['No compatible quota-limit series were reported. No remaining percentage or reset time is assumed.'] : []),
      ...(!complete ? ['Monitoring results were truncated. Incomplete totals and budgets are withheld.'] : [])] };
}
module.exports = { collect, quotas, point, series, scopeKey, requestInterval };
