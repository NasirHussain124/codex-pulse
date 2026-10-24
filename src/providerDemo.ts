import type { OtherProviders, ProviderConnection, ProviderReport } from './types';
/** Opt-in design samples. Never merged into the real reporting vault. */
export function providerDemo(privacy = true): OtherProviders {
  const now = Date.now(), at = new Date(now - 120000).toISOString();
  const base: ProviderReport = { subject: '', scope: 'account', periodStart: null, periodEnd: null, complete: true, source: '', quotas: [], metrics: [], members: [], notes: [] };
  const rows: [ProviderConnection['provider'], string, Partial<ProviderReport>][] = [
    ['copilot', 'Personal development', { subject: 'northstar-dev', quotas: [{ id: 'premium_interactions', label: 'Premium interactions', period: 'Provider entitlement', unit: 'requests', remainingPercent: 72, used: 84, limit: 300, unlimited: false, resetsAt: new Date(now + 8 * 86400000).toISOString(), observedAt: null }], notes: ['Sample Copilot entitlement, not Codex 5h/7d quota.', 'Read-only monitoring does not select an account inside Copilot.'] }],
    ['claude', 'Northstar API', { subject: 'Authorized organization', scope: 'organization', periodStart: new Date(now - 6 * 86400000).toISOString(), periodEnd: at,
      metrics: [{ id: 'input', label: 'Input tokens, including cache', value: 1248200, unit: 'tokens' }, { id: 'output', label: 'Output tokens', value: 188400, unit: 'tokens' }, { id: 'cost', label: 'Reported API cost', value: '18.42', unit: 'USD' }],
      notes: ['Sample organization API report, not Claude.ai Pro/Max subscription quota.', 'No personal 5-hour or weekly percentage is inferred.'] }],
    ['cursor', 'Design and engineering', { subject: 'Authorized team', scope: 'team', periodStart: new Date(now - 13 * 86400000).toISOString(),
      metrics: [{ id: 'members', label: 'Members reported', value: 2, unit: 'members' }, { id: 'cost', label: 'On-demand spend', value: '24.60', unit: 'USD' }],
      members: [{ id: 'sample-1', label: 'Alex', email: 'alex@example.test', quotas: [], metrics: [{ id: 'cost', label: 'On-demand spend', value: '14.20', unit: 'USD' }] }, { id: 'sample-2', label: 'Jordan', email: 'jordan@example.test', quotas: [], metrics: [{ id: 'cost', label: 'On-demand spend', value: '10.40', unit: 'USD' }] }],
      notes: ['Sample team billing report. On-demand spend excludes included usage.', 'The live integration updates at most once per hour.'] }],
    ['gemini', 'Research project', { subject: 'northstar-research', scope: 'project', periodStart: new Date(now - 86400000).toISOString(), periodEnd: at,
      metrics: [{ id: 'requests', label: 'API requests · last 24h', value: 842, unit: 'requests' }],
      notes: ['Sample Gemini API project metrics, not Gemini CLI or Google AI Pro/Ultra account quota.', 'No compatible quota-limit series in this sample. Remaining capacity is not guessed.'] }],
  ];
  return { error: null, connections: rows.map(([provider, label, report], index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, provider, label, report: { ...base, ...report, members: (report.members || []).map(member => ({ ...member, email: privacy ? undefined : member.email })) }, createdAt: at, enabled: true, status: 'ready', refreshing: false, fetchedAt: at, nextUpdateAt: new Date(now + 180000).toISOString(), error: null, source: '' })) };
}
