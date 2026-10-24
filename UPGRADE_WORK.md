# Intelligent Quota management upgrade

User-requested scope (2026-10-24). The goal remains the whole upgrade, not just
the first working slice. No feature is complete merely because a fixture passes.

## Acceptance checklist

- [ ] Explainable account recommendations: consume before reset, longest session,
  reserve, stale/unknown/excluded handling, both binding quota windows, no churn.
- [ ] Expiring reset advice: expiry unknown/count-only preserved, natural reset
  versus redemption, explicit confirmation, provider-authoritative refresh.
- [ ] Redesigned desktop hierarchy, density controls, accessible details, matching
  tray/widget surfaces, no false current-account claims.
- [ ] All-accounts graph default, per-account lines/selection, 5h/7d, recorded
  versus forecast distinction, gaps/unknown data, no misleading pooled capacity.
- [ ] Reset timeline, account groups/reserve exclusions, actionable alerts,
  connection diagnostics and safe backup/restore.
- [ ] Phone reconnect: opt-in persistence, start at Windows sign-in, sleep/network
  recovery, stable paired identity, private-network discovery, certificate pinning.
- [ ] Remote phone access: Tailscale adapters/endpoints on desktop and Android,
  explicit enrollment, no public ports, cached readings when PC unavailable.
- [ ] Provider adapters: existing Codex preserved, Copilot documented quota,
  Gemini supported-source validation, Claude permitted API/organization reporting,
  Cursor authorized team reporting. No decorative working-provider claims.
- [ ] Optional encrypted relay mode: separate deployment/security choice; don't
  create hosting resources or publish any credentials without explicit approval.
- [ ] Production delivery: signing/update/rollback design, migration tests,
  desktop/Android build and UI QA, regression tests, public source/releases,
  carefully backed-up installed-PC update and pairing/account preservation.

## Current evidence

Baseline: clean commit 6509fde, Windows 0.5.2 / Android 0.5.0.
The canonical editable checkout is Local/CodexPulse-source; Documents workspace
edits are blocked by Controlled Folder Access. Build outputs stay in the verified
build workspace. The independent live profile is `%USERPROFILE%/.quota-management`.

Implementation and verification evidence is recorded below as work progresses.

### Development checkpoint — 2026-10-24 (not a release)

Implemented in the upgrade branch:

- Explainable consume/runway/reserve strategies, both binding windows, stale and
  excluded-account checks, planned sessions, recommendation hysteresis, expiring
  earned-reset advice and a reset timeline. Five-hour reset urgency is included;
  unknown consumption is not converted into an invented working-time estimate.
- Recommendation-first desktop design, density controls, groups/exclusions,
  all-account independent history lines by default, per-account selection,
  gap-aware observations and explicitly optional estimated projections.
- Earned-reset review/redemption using official Codex app-server stdio RPC in
  an isolated temporary profile. Only an access token is supplied in memory;
  refresh tokens are not sent and the live Codex login is never written. A
  native Cancel-default confirmation precedes redemption. Pending idempotency
  keys survive a timeout/crash; another credit cannot bypass a pending attempt.
  Updated limits are read from the provider and persisted, never inferred 100%.
- Opt-in desktop restart/sleep/network recovery. Auto-resume requires Windows
  Private/domain classification for LAN or a named enrolled Tailscale adapter.
  Opt-in LAN discovery carries only an opaque public certificate pin and endpoint.
  Discovery filters other adapters out of A records. Android relocates only the
  endpoint and verifies the original TLS identity before bearer authentication.
- Actionable, deduplicated reset-expiry and verified-quota-recovery notifications,
  with account-details actions and a user setting. No automatic reset or switch.
- Encrypted same-Windows-user backup/restore. A per-backup AES-256-GCM key is
  wrapped directly in purpose-bound Windows DPAPI, independent of Chromium Local
  State. The authenticated backup retains the original encrypted credentials,
  phone vault and its Chromium key. Restore stages/verifies files, preserves the
  previous profile, rolls back a failed rename and pauses phone sharing.
- Connection-health UI with no credentials, emails or IPs in its report.
- Original Q/dual-window app artwork, eight native Windows ICO sizes, Android
  adaptive/themed icons. Provider SVGs vendored unchanged (plus file newline)
  from Lobe Icons commit 7d7d0379f18b114a4009dc5cb85a7c375284f31b;
  upstream and bundled hashes and MIT attribution ship locally. No icon CDN.

Verification at this checkpoint:

- 109 Node regression tests passed; production TypeScript/Vite build passed.
- 28 Python bridge/reset/DPAPI tests passed. No real reset was redeemed.
- Installed official Codex CLI 0.163.0 generated schemas confirming credit expiry
  units, exact credit IDs and idempotency outcomes used by the narrow RPC client.
- Android assembleDebug, Robolectric tests and lintDebug passed with endpoint
  recovery, TLS-policy tests and the new adaptive/themed launcher resources.
- Electron UI smoke checks passed for recommendations, four-account visibility,
  all/single-account charts, accessible dropdowns/drawers, widget/tray behavior,
  privacy and narrow viewports. Real provider SVG loading, recovery IPC,
  read-only backup preview and read-only reset preview also passed.
- Runtime dependency audit previously reported zero vulnerabilities after adding
  pinned bonjour-service 1.4.4. Needs rerun on the final release dependency set.

Still required before completing the full objective:

- Authenticated live checks for other providers require the user's own authorized
  reporting credentials. Adapters and connection/report management flows are now
  implemented; no personal Claude/Gemini subscription limits are claimed.
- Live read-only reset-protocol integration check, backup/restart pairing
  integration, real-device LAN relocation and Tailscale end-to-end validation.
- Final mobile/widget polish and release-wide UI/regression audit.
- Signed/update/rollback delivery workflow and final packaging, source publication,
  release downloads and safely backed-up installed-PC update. The installed app
  has not been changed. No new release has been published from this branch.
- User-controlled Tailscale enrollment/permissions and any signing/hosting
  credentials remain external choices; don't create accounts, purchase resources,
  spend earned credits or expose public listeners as implementation shortcuts.

### 0.6.0 release-candidate verification in progress

- Implemented Copilot SDK quota plus verified GitHub identity, Claude organization
  token/cost pagination, Cursor team spend pagination and Google-authorized Gemini
  project monitoring. Bounded fixed HTTPS endpoints, no redirects/model sessions,
  explicit capabilities and unknown values, encrypted connection vault, pause/
  reconnect/remove/rename, identity guards, cancellation and rate-aware scheduling.
- Compact read-only provider reports are included in pinned phone sync; no
  provider credential or team-member directory is transported. Android renders
  native provider quota versus organization/project usage without false 5h/7d.
- 137 Node tests passed including the final backup regression. The bundled
  Copilot stdio runtime starts/pings without authentication or AI sessions.
  Desktop smoke checks passed for provider setup, all four opt-in sample reports,
  narrow layouts, real logos and preserved Codex graph state.
- Windows cold backup/restore now verified with actual Electron safeStorage
  ciphertext across three processes, preserved original profile and paused
  sharing. Backups refuse a newly generated Chromium encryption key until it has
  been persisted by a normal quit; incomplete recoverability is never exported.
- 28 Python tests and rebuilt frozen engine integration passed. Android 0.6.0
  assembleDebug, 45 tests and lintDebug passed; the APK retains the installed
  development certificate. Final packaged application,
  source publication, release downloads and installed-PC update are underway.
- This remains a release candidate: Windows executables are unsigned, Android
  retains the existing development signing key, and real-device Tailscale/LAN
  relocation plus provider credentials are not represented as already verified.
