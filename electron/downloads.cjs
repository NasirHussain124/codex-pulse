// Fixed public distribution targets only. No caller-supplied URL is accepted.
// Android is versioned independently from desktop-only hotfixes.
const ANDROID = Object.freeze({
  version: '0.6.0',
  sha256: '1ab7283e2a194d9c646b07e1fa3d0f00cfcf7de2677a615fe892cd6bc6ac4ad2',
  commit: 'd8c4abb6884dde1329b2da6ebbb3cc84c3b71667',
});
const androidLinks = Object.freeze({
  direct: `https://cdn.jsdelivr.net/gh/NasirHussain124/codex-pulse@${ANDROID.commit}/Quota-management-Android.apk`,
  alternate: `https://raw.githubusercontent.com/NasirHussain124/codex-pulse/${ANDROID.commit}/Quota-management-Android.apk`,
  release: `https://github.com/NasirHussain124/codex-pulse/releases/tag/v${ANDROID.version}`,
});
function androidDownload(source = 'direct') {
  if (typeof source !== 'string' || !Object.hasOwn(androidLinks, source)) throw new Error('Choose a supported Android download source.');
  return androidLinks[source];
}
module.exports = { ANDROID, androidDownload };
