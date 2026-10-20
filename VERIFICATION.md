# Desktop verification — 2026-10-21

Version 0.2.0, Windows x64 + Android. ccswap 0.39.2 remains the account/quota engine.

- 33 Node unit tests passed: forecast behavior, settings allowlist, official CLI
  sign-in orchestration, isolated profile configuration, one-time-code extraction,
  secret redaction, cancellation, timeout cleanup, reconnect identity, errors,
  vault-first startup, cache recovery, and out-of-order renderer state delivery.
  New mobile checks cover explicit projection allowlists, private-only binding,
  TLS pin mismatch, QR single use/expiry/replacement/cancel, hashed device tokens,
  revocation, read-only endpoints, Origin/Host rejection, rate limiting and
  serialized concurrent listener enable/disable requests.
- 17 Python tests passed: DPAPI vault, normalization, stale data, metadata
  preservation, cache identity, multi-account isolation, switching/removal,
  independent reconnect, active-token ownership, and wrong-account rejection.
- The actual frozen engine passed isolated synthetic-account JSON protocol tests,
  including encrypted backups, switching, removal, isolated login import, invalid
  path rejection, and reconnect-account checks. No live credentials were used.
- The packaged Electron app passed all 33 UI checks: secure preload, four visible
  accounts, Codex-only navigation, ledger-only dashboard, search, settings, email
  masking, onboarding/sample boundaries, sorting, chart collapse/settings,
  desktop widget, right-side account panel, account chooser, rename, reconnect,
  closing/focus restoration, row/tab entry points, keyboard focus containment,
  Escape dismissal, and narrow dashboard/panel layouts.
  Phone-companion entry and sample-mode pairing boundaries are also checked.
- New dropdown checks cover the actual dark menu color, pointer selection,
  Home/Enter keyboard selection, outside dismissal, containment in dialogs,
  Escape closing a dropdown without closing its account panel, and narrow-screen
  positioning. Browser QA additionally verified ArrowDown/Enter quota selection.
- TypeScript check and production Vite build passed.
- The development and packaged desktop lifecycle tests passed with four isolated
  synthetic accounts: no snapshot cache, damaged cache on the next cold start,
  tray close/reopen, renderer reload, and a newly created window. No network quota
  requests or real user profiles are used by these tests.
  The lifecycle harness also tests the packaged TLS/QR dependencies, Windows
  safeStorage protection, four-account mobile projection and device revocation
  over an isolated loopback TLS connection. The self-signed installation
  certificate is explicitly a CA trust anchor; phones still pin its exact leaf.
- Android debug APK builds with SDK 36 / AGP 8.13.2 / Gradle 8.13 / JDK 17.
  Eight Android tests pass: private endpoint policy, fingerprint validation,
  correct/wrong leaf-certificate pin, Robolectric onboarding view, native widget
  inflation/configuration and unknown/expired quota handling. Android lint has
  no errors; forward-compatible widget attributes and dependency-version notices
  remain warnings. This is not a physical-device certification.
- Full npm dependency audit reported 0 vulnerabilities.
- NSIS installer and portable executable built successfully. They are unsigned.
- Visual review covered the ledger, Add account dialog, widget, and narrow layout.
- Local 0.1.3 installation completed successfully. Start Menu now targets the
  permanent per-user installation instead of a portable extraction in Temp.
  The running main process and renderer both acknowledged four real saved
  accounts loaded from the vault; 24 previous history records were preserved.
  A fresh encrypted vault backup was taken before installation. This was verified
  through local state acknowledgements, not a new visual screenshot: the native
  computer-use helper was unavailable. The exact cause of the originally blank
  view was not reproduced; startup/cache/state-sync weaknesses were addressed.
- Updated that installation to 0.2.0 after acquiring the vault lock, checking
  there was no pending sign-in and making another verified four-account backup.
  The 0.2.0 main process and renderer acknowledged all four saved accounts from
  the vault. No real Codex account was selected/switched and ChatGPT was not
  restarted. Phone transport remains disabled until explicitly enabled.
- The installed official Codex CLI was detected. Its supported login flags were
  checked without initiating a real sign-in. Authentication design follows the
  [official guide](https://learn.chatgpt.com/docs/auth).

Browser preview: `http://127.0.0.1:5184/?demo=1`. This is explicitly sample data,
not a live account service. Use the Windows app for sign-in and real accounts.

Not certified by these tests: real-account OAuth completion or token expiry,
live quota responses/switches, Windows startup/notification behavior across clean
machines, signed distribution, auto-updates, real-phone QR/network/widget behavior,
iPhone support or internet relay. Android is a debug-signed release candidate;
physical phone and independent security review are still required.
See RELEASE_CHECKLIST.md before public distribution. No user accounts were added,
removed, signed into, or switched during automated verification.
