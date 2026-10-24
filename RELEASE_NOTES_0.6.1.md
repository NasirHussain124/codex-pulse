# Quota management 0.6.1 — download-link hotfix

Windows-only hotfix. Android remains 0.6.0; no reinstall or re-pair is needed if
that version is already installed.

- The Phone companion download button no longer points to Android 0.5.0.
- The primary button opens an immutable direct APK on jsDelivr, without opening
  a GitHub release page. An alternate raw-file download is also available.
- Both mirrors were downloaded without GitHub login: HTTP 200, 411631 bytes,
  SHA-256 `1ab7283e2a194d9c646b07e1fa3d0f00cfcf7de2677a615fe892cd6bc6ac4ad2`.
- Android package/signing certificate are unchanged. Install over the existing
  app, not after uninstalling. Do not bypass package/signature installation errors.
- Download IPC accepts only three fixed sources; it cannot open a caller-supplied
  URL. Regression checks prevent reverting to the obsolete 0.5.0 address.

## Android direct download

[Download Android 0.6.0](https://cdn.jsdelivr.net/gh/NasirHussain124/codex-pulse@d8c4abb6884dde1329b2da6ebbb3cc84c3b71667/Quota-management-Android.apk)

If a chat's built-in browser does not open the file, open this link in Chrome.

This retains the 0.6.0 release-candidate status: unsigned Windows executables and
the existing development-signed Android APK, not production certification.
