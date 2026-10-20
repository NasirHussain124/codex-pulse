const path = require('node:path');
const APP_NAME = 'Quota management';
// Brand changes must not change the encrypted vault or phone-pairing keys.
const userDataPath = appData => path.join(appData, 'Codex Pulse');
module.exports = { APP_NAME, userDataPath };
