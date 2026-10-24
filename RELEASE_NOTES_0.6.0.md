# Quota management 0.6.0 — intelligent dashboard

Windows and Android release candidate. Independent project, not an official
OpenAI, GitHub, Anthropic, Google or Cursor application.

## What's new

- Redesigned, recommendation-first PC dashboard. Consume-before-reset, session
  runway and reserve strategies explain why an account is suggested. Both Codex
  quota windows, freshness, exclusions and reserved groups are considered.
- Upcoming natural resets and banked-reset expiry advice. Earned-reset redemption
  requires fresh provider review and explicit confirmation; never automatic.
- All-account chart by default, separate account lines, 5h/7d selection and gaps
  for missing observations. Projections are optional estimates, not recorded usage.
- Encrypted same-Windows-user backup/restore with an untouched previous profile,
  connection diagnostics and actionable reset-expiry/quota-recovery alerts.
- Opt-in restart/network recovery for phone sync. LAN rediscovery retains the
  original certificate trust. User-enrolled Tailscale supports different networks
  while the PC is awake; no public port or hosted relay is created.
- Authorized additional reporting connections: GitHub Copilot account quota,
  Claude API organization usage/cost, Cursor team spending, and Gemini API project
  monitoring. Add provider explains each credential, permission and reporting
  boundary. Pause, rename, refresh, reconnect and remove are supported.
- Native provider units and scopes, never an invented pooled 5h/7d percentage.
  Personal Claude.ai Pro/Max and Gemini CLI/Pro/Ultra quotas are not exposed by
  these integrations. Live access requires your own authorized reporting keys.
- Phone receives compact read-only reports, never provider credentials or a team
  directory. Clean Codex widgets continue to show both limits for multiple accounts.
- Original Q artwork and locally bundled Lobe Icons provider SVGs with attribution.

## Updating

- Windows: install **Quota-Management-Setup-0.6.0-x64.exe**. Keep the independent
  `%USERPROFILE%\.quota-management` profile; do not uninstall/delete account data.
  The internal executable and application ID remain compatible with prior builds.
- Android: install **Quota-management-Android.apk** over the existing app. Its
  application ID and existing development certificate are unchanged. No uninstall
  or re-pair is normally needed. Enable phone recovery/discovery explicitly on PC.
- Portable Windows executable is optional; Setup is recommended for normal use.
- Check **SHA256SUMS.txt** to verify downloads.

## Verification and limits

137 Node tests, 28 Python tests, 45 Android tests, Android lint/build, frozen
account-engine integration and real Electron encrypted cold backup/restore passed.
The Copilot runtime health check starts/pings without authentication or AI sessions.
UI checks exercise provider reports, recommendations, charts, account panels,
phone pairing preview and both-limit desktop widgets at wide/narrow sizes.

This is a **release candidate**, not a claim of completed production certification.
Windows executables are unsigned; Android remains development-signed. No automatic
binary updater, app-store distribution or hosted relay is enabled. Verify the
publisher/source before installing. Tailscale needs separate user enrollment and
has not been verified on the user's physical phone across networks. Other-provider
adapters have contract/security tests but require authorized credentials for live
account-specific verification. Real banked reset credits were not spent in testing.
Account selection changes compatible file-backed Codex launches only; it does not
force-close or certify the signed-in account inside ChatGPT/Codex desktop.
