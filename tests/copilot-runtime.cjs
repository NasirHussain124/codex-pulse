// Integration health check: no credential, login, AI session or model request.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CopilotClient, RuntimeConnection } = require('@github/copilot-sdk');
const { runtimeEnvironment, connection } = require('../electron/providers/copilot.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-copilot-health-'));
const client = new CopilotClient({ connection: connection(RuntimeConnection), mode: 'empty', useLoggedInUser: false,
  workingDirectory: directory, baseDirectory: directory, logLevel: 'none', env: runtimeEnvironment(directory) });
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; void client.forceStop(); }, 20000);
(async () => {
  try {
    await client.start();
    const result = await client.ping('quota-management-runtime-health');
    if (timedOut || typeof result.message !== 'string' || !result.message.includes('quota-management-runtime-health') || !Number.isFinite(Date.parse(result.timestamp))) throw new Error('Invalid health response: ' + JSON.stringify(result));
    console.log(JSON.stringify({ runtime: 'started', transport: 'stdio', ping: true, authenticated: false, modelSessions: 0 }));
  } catch (error) { console.error('Bundled Copilot runtime health check failed:', error.message); process.exitCode = 1; }
  finally { clearTimeout(timer); await client.stop().catch(() => client.forceStop()); fs.rmSync(directory, { recursive: true, force: true }); }
})();
