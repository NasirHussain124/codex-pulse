const { ProviderError, json, identity, count, text, usdFromCents, sumCounts, metric } = require('./common.cjs');
async function collect(config, context = {}) {
  const headers = { Authorization: `Basic ${Buffer.from(config.secret + ':').toString('base64')}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  const rows = []; let totalPages = 1, totalMembers = null, cycle = null, complete = true;
  for (let page = 1; page <= Math.min(totalPages, 20); page++) {
    const result = await json('https://api.cursor.com/teams/spend', { method: 'POST', headers, body: JSON.stringify({ page, pageSize: 100 }), signal: context.signal }, context.fetcher);
    if (!Array.isArray(result.teamMemberSpend) || result.teamMemberSpend.length > 100 || count(result.totalPages) === null || result.totalPages < 1) throw new ProviderError('schema');
    if (page > 1 && result.totalPages !== totalPages) complete = false;
    totalPages = result.totalPages; totalMembers = count(result.totalMembers);
    if (page === 1) cycle = typeof result.subscriptionCycleStart === 'number' && Number.isFinite(result.subscriptionCycleStart) ? new Date(result.subscriptionCycleStart).toISOString() : null;
    else if (cycle !== (typeof result.subscriptionCycleStart === 'number' && Number.isFinite(result.subscriptionCycleStart) ? new Date(result.subscriptionCycleStart).toISOString() : null)) throw new ProviderError('schema');
    rows.push(...result.teamMemberSpend);
    if (page === 20 && totalPages > 20) complete = false;
  }
  const unique = new Map();
  for (const row of rows) {
    if (typeof row.userId !== 'string' || !row.userId || unique.has(row.userId)) { complete = false; continue; }
    unique.set(row.userId, row);
  }
  if (totalMembers !== null && unique.size !== totalMembers) complete = false;
  const members = [...unique.values()].slice(0, 100).map(row => ({ id: identity(row.userId).slice(0, 16), label: text(row.name) || 'Team member', email: text(row.email), quotas: [],
    metrics: [metric('cost', 'On-demand spend', usdFromCents([row.spendCents]), 'USD'), metric('overall', 'Total spend, including included usage', usdFromCents([row.overallSpendCents]), 'USD'), metric('requests', 'Premium requests', count(row.fastPremiumRequests), 'requests')] }));
  return { subjectKey: `cursor-key:${identity(config.secret)}`, subject: config.label, scope: 'team', periodStart: cycle, periodEnd: null, complete, quotas: [],
    source: 'https://cursor.com/docs/account/teams/admin-api', metrics: [metric('members', 'Members reported', totalMembers, 'members'),
      metric('cost', 'On-demand spend', complete ? usdFromCents([...unique.values()].map(row => row.spendCents)) : null, 'USD'),
      metric('requests', 'Premium requests', complete ? sumCounts([...unique.values()].map(row => row.fastPremiumRequests)) : null, 'requests')], members,
    notes: ['Authorized team billing report, not a personal subscription-quota percentage.', 'Spend excludes included usage unless marked total. Reporting can lag; this integration updates at most once per hour.',
      ...(unique.size > 100 ? ['Member details are limited to 100; verified totals include all fetched members.'] : []), ...(!complete ? ['The member report is partial or changed during pagination. Totals are withheld.'] : [])] };
}
module.exports = { collect };
