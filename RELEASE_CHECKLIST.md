# Release gates

## Automated local verification

- [x] TypeScript check and production renderer build.
- [x] Settings input validation and prototype-key rejection tests.
- [x] Windows DPAPI encryption/decryption and damaged-vault handling tests.
- [x] Unknown/stale quota normalization and secret-redaction tests.
- [x] Read-only snapshot and malformed roster preservation tests.
- [x] Packaged-engine protocol check using synthetic isolated accounts.
- [x] Electron secure bridge/render smoke test with four sample accounts.
- [x] Codex-only navigation and account side panel: chooser, rename, reconnect, row entry, keyboard focus, Escape, narrow layout.
- [x] Themed dropdowns: selection, keyboard controls, focus ring, outside/Escape dismissal, modal containment, viewport bounds.
- [x] Packaged offline account persistence: cold restart, tray reopen, renderer reload, new window, missing and corrupt snapshot cache.
- [x] Vault-first startup and stale IPC state/error ordering regression tests.
- [x] Desktop and narrow-layout visual review.
- [x] Runtime dependency audit.
- [x] Portable and NSIS packaging.

- [x] Isolated browser/device login orchestration, cancellation, timeout and reconnect identity tests.
- [x] Independent/live refresh-token ownership and reconnect/apply tests.

## Before public distribution

- [ ] Windows signing certificate configured; signed executable and installer verified.
- [ ] Clean Windows 10/11 installation, upgrade, startup, and uninstall tested.
- [ ] Live multi-account import, quota read, refresh-token expiry and reconnect tested.
- [ ] Live switch/restart flow checked for each supported Codex CLI/IDE version.
- [ ] Extended network interruption, rate-limit and sleep/resume soak tests.
- [ ] Independent review of vault, refresh-token ownership and IPC boundaries.
- [ ] Update feed and signing/rollback process established; updater integration implemented.

## Mobile release

- [x] Authenticated, encrypted, read-only local-network pairing and snapshot transport.
- [x] Expired/single-use QR, revocation, certificate pin, projection allowlist, browser/rebinding and request-race tests.
- [x] Native Android companion/widget, APK build, Android lint, unit and Robolectric screen tests.
- [ ] Physical Android phone camera/pairing, widget launcher/OEM, battery/doze and PC sleep/resume tests.
- [ ] Independent mobile trust/pairing/Keystore review and production Android signing.
- [ ] Optional authenticated internet relay; no public endpoint or router forwarding in this build.
- [ ] Native iOS WidgetKit extension and companion app; signing and device testing.
- [x] Cached-reading timestamps and stale/offline states implemented; physical-device validation remains above.
