const { ProviderError, json, identity, text, instant, sumCounts, usdFromCents, metric } = require('./common.cjs');

async function pages(route, query, config, context) {
  const rows = []; let cursor = null;
  const seen = new Set();
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams(query); if (cursor) params.set('page', cursor);
    const result = await json(`https://api.anthropic.com/v1/organizations/${route}?${params}`, { headers: { 'x-api-key': config.secret, 'anthropic-version': '2023-06-01', Accept: 'application/json' }, signal: context.signal }, context.fetcher);
    if (!Array.isArray(result.data) || result.data.length > 100 || typeof result.has_more !== 'boolean') throw new ProviderError('schema');
    for (const bucket of result.data) {
      if (!bucket || !Array.isArray(bucket.results) || bucket.results.length > 5000) throw new ProviderError('schema');
      rows.push({ start: instant(bucket.starting_at), end: instant(bucket.ending_at), results: bucket.results });
    }
    if (!result.has_more) return { rows, complete: true };
    if (typeof result.next_page !== 'string' || !result.next_page || result.next_page.length > 2048 || seen.has(result.next_page)) throw new ProviderError('schema');
    cursor = result.next_page; seen.add(cursor);
  }
  return { rows, complete: false };
}
async function collect(config, context = {}) {
  const now = context.now ?? Date.now(), end = new Date(now).toISOString();
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - 6);
  const query = { starting_at: start.toISOString(), ending_at: end, bucket_width: '1d', limit: '7' };
  const usage = await pages('usage_report/messages', query, config, context);
  // Usage can remain useful if cost reporting is separately unavailable.
  let cost = null;
  try { cost = await pages('cost_report', query, config, context); } catch (error) { if (context.signal?.aborted) throw error; }
  const rows = usage.rows.flatMap(bucket => bucket.results), costs = cost?.rows.flatMap(bucket => bucket.results) || [];
  const input = rows.flatMap(row => [row.uncached_input_tokens, row.cache_read_input_tokens, row.cache_creation?.ephemeral_1h_input_tokens, row.cache_creation?.ephemeral_5m_input_tokens]);
  const complete = usage.complete && (!cost || cost.complete);
  const costValue = cost?.complete && costs.every(row => row.currency === 'USD') ? usdFromCents(costs.map(row => row.amount)) : null;
  const models = [...new Set(rows.map(row => text(row.model)).filter(Boolean))];
  return { subjectKey: `claude-key:${identity(config.secret)}`, subject: config.label, scope: 'organization',
    periodStart: start.toISOString(), periodEnd: end, complete, quotas: [],
    source: 'https://platform.claude.com/docs/en/manage-claude/usage-cost-api',
    metrics: [metric('input', 'Input tokens, including cache', usage.complete ? sumCounts(input) : null, 'tokens'),
      metric('output', 'Output tokens', usage.complete ? sumCounts(rows.map(row => row.output_tokens)) : null, 'tokens'),
      metric('cost', 'Reported API cost', costValue, 'USD'), metric('models', 'Models reported', models.length || null, 'count')], members: [],
    notes: ['Organization API reporting only. Claude.ai Pro/Max personal 5h/7d limits are not exposed by this integration.',
      'Reports may lag. Priority-tier costs may be absent from the cost endpoint.', ...(!cost ? ['Cost reporting is unavailable for this credential; token usage is still shown.'] : []),
      ...(!complete ? ['The report is partial. Totals are withheld instead of undercounting.'] : [])] };
}
module.exports = { collect, pages };
