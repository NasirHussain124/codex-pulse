// Native clipboard access only after an explicit Copy pairing link action.
// Keep the browser permission deny-list intact.
function copyPairingLink(value, clipboard) {
  if (typeof value !== 'string' || !/^codexpulse:\/\/pair\?data=[A-Za-z0-9_-]{20,2500}$/.test(value)) throw new Error('Generate a new pairing link first.');
  let data;
  try { data = JSON.parse(Buffer.from(value.slice('codexpulse://pair?data='.length), 'base64url').toString('utf8')); } catch { throw new Error('Invalid pairing link.'); }
  if (!data || typeof data !== 'object' || data.version !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(data.code || '') || !/^[a-f0-9]{64}$/.test(data.fingerprint || '') || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) throw new Error('This pairing link expired. Generate a new one.');
  clipboard.writeText(value); return true;
}
module.exports = { copyPairingLink };
