const { text, finite, count, instant } = require('./common.cjs');
const PROVIDERS = new Set(['copilot', 'claude', 'cursor', 'gemini']);
const SOURCES = {
  copilot: 'https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing',
  claude: 'https://platform.claude.com/docs/en/manage-claude/usage-cost-api',
  cursor: 'https://cursor.com/docs/account/teams/admin-api', gemini: 'https://ai.google.dev/gemini-api/docs/rate-limits',
};
function metrics(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 12).map(row => ({ id: text(row?.id, 80), label: text(row?.label),
    value: typeof row?.value === 'string' ? text(row.value, 120) : finite(row?.value) && row.value >= 0 ? row.value : null,
    unit: ['USD', 'tokens', 'requests', 'members', 'count', 'text'].includes(row?.unit) ? row.unit : 'count' }));
}
function quotas(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 100).map(row => ({ id: text(row?.id, 80), label: text(row?.label), period: text(row?.period, 80), unit: text(row?.unit, 40),
    remainingPercent: finite(row?.remainingPercent) && row.remainingPercent >= 0 && row.remainingPercent <= 100 ? row.remainingPercent : null,
    used: finite(row?.used) && row.used >= 0 ? row.used : null, limit: finite(row?.limit) && row.limit >= 0 ? row.limit : null,
    unlimited: row?.unlimited === true, resetsAt: instant(row?.resetsAt), observedAt: instant(row?.observedAt),
    overage: count(row?.overage), overageAllowed: row?.overageAllowed === true }));
}
function report(value, provider, privacy) {
  if (!value || typeof value !== 'object' || !PROVIDERS.has(provider)) return null;
  return { scope: ['account', 'organization', 'team', 'project'].includes(value.scope) ? value.scope : 'account',
    subject: text(value.subject), periodStart: instant(value.periodStart), periodEnd: instant(value.periodEnd), complete: value.complete === true,
    source: SOURCES[provider], quotas: quotas(value.quotas), metrics: metrics(value.metrics),
    members: (Array.isArray(value.members) ? value.members : []).slice(0, 100).map(row => ({ id: text(row?.id, 80), label: text(row?.label) || 'Member',
      ...(privacy ? {} : { email: text(row?.email) }), quotas: quotas(row?.quotas), metrics: metrics(row?.metrics) })),
    notes: (Array.isArray(value.notes) ? value.notes : []).slice(0, 8).map(row => text(row, 300)) };
}
module.exports = { report, metrics, quotas, SOURCES };
