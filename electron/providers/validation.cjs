const { createPrivateKey } = require('node:crypto');
const { text } = require('./common.cjs');
const KINDS = ['copilot', 'claude', 'cursor', 'gemini'];
function configuration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !KINDS.includes(input.provider) || JSON.stringify(input).length > 40000) throw new Error('Choose a supported provider connection.');
  const label = text(input.label, 48).trim();
  if (!label) throw new Error('Give this connection a short name.');
  const secret = typeof input.secret === 'string' ? input.secret.trim() : '';
  if (input.provider === 'copilot' && !/^(?:gho_|ghu_|github_pat_)[A-Za-z0-9_]{20,1000}$/.test(secret)) throw new Error('Use a supported GitHub OAuth/user token or fine-grained PAT. Classic ghp_ tokens are not supported.');
  if (input.provider === 'claude' && !/^sk-ant-admin01-[A-Za-z0-9_-]{16,1000}$/.test(secret)) throw new Error('Use a Claude Console organization Admin API key, not a Claude.ai subscription token or session cookie.');
  if (input.provider === 'cursor' && !/^key_[A-Za-z0-9_-]{20,1000}$/.test(secret)) throw new Error('Use a Cursor team Admin API key with reporting access.');
  if (input.provider !== 'gemini') return { provider: input.provider, label, secret };
  let value;
  try { value = JSON.parse(secret); } catch { throw new Error('Paste the service-account JSON for a project you are authorized to monitor.'); }
  const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : value.project_id;
  if (value.type !== 'service_account' || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId || '') || typeof value.client_email !== 'string' || !/^[A-Za-z0-9_.-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(value.client_email) || typeof value.private_key !== 'string' || value.private_key.length > 16000) throw new Error('Use a valid Google service account and project ID. Other credential types are not accepted.');
  try {
    const key = createPrivateKey(value.private_key), bits = key.asymmetricKeyDetails?.modulusLength;
    if (key.asymmetricKeyType !== 'rsa' || !bits || bits < 2048 || bits > 8192) throw new Error();
  } catch { throw new Error('The service-account key is not a supported RSA key.'); }
  return { provider: 'gemini', label, projectId, serviceAccount: { client_email: value.client_email, private_key: value.private_key,
    private_key_id: typeof value.private_key_id === 'string' ? value.private_key_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) : undefined } };
}
module.exports = { configuration, KINDS };
