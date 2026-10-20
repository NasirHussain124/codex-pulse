# Codex Pulse

A Windows desktop account and usage manager built on **ccswap 0.39.2**. The
dark ledger displays all saved Codex accounts together, with separate usage
windows, remaining percentages, reset countdowns, and connection states.
The ledger is the only dashboard view; the floating widget is a compact companion.

**0.2.0 release candidate:** Windows desktop + native Android usage viewer and
home-screen widget. Local-first, Codex-only, no analytics. This is an independent
project, not an official OpenAI app. See [MOBILE.md](MOBILE.md) for pairing and
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for production-validation gates.

## What works

- Multi-account ledger, search, sorting, custom names, and email masking.
- Codex-only quota-management header and a right-side account panel: click the
  Codex tab or any account row, choose an account, review quota, rename, refresh,
  reconnect, remove, or explicitly select it for the next compatible Codex launch.
- Accessible panel keyboard navigation, focus containment, Escape dismissal,
  and full-width narrow-screen presentation.
- Consistent dark dropdowns throughout the dashboard, panel, and settings,
  with keyboard selection, selected-item indicators, viewport-safe menus, and
  a single visible keyboard focus ring instead of Windows-native popup styling.
- Guided ChatGPT browser sign-in and one-time device-code fallback via the official Codex CLI.
- Import a current file-backed Codex login without signing in again.
- Import existing ccswap Codex backups without changing their original store.
- Select an account for the next Codex launch, with an explicit restart reminder.
- Per-account quota collection with caching, backoff, timestamps, offline readings.
- Windows DPAPI encryption for Pulse-managed saved credentials.
- Floating desktop widget, system tray, Windows notifications and startup setting.
- Local usage history and CSV export, warm dark appearance, email masking.
- Per-account remaining-quota and drain-rate charts with explicitly estimated projections.
- A clearly labeled browser/sample preview, independent of live account operations.
- Offline startup from the saved-account vault, with cache fallback and state
  resynchronization after tray reopen or renderer reload. A loading failure is
  shown as a recovery error, not as an invitation to add the accounts again.

For a permanent installation, use the Setup executable. Portable builds extract
to a temporary folder; never create a shortcut to that extracted executable.
Use **Settings → Quit Codex Pulse** to exit completely. With close-to-tray enabled,
the window's close button hides it; the tray icon or Start Menu reopens it.

The **Phone companion** button enables opt-in, read-only Android sync over a
private network: one-time QR pairing, certificate-pinned HTTPS, encrypted phone
cache, revocable devices, and configurable multi-account native widgets.
The listener is off by default and after a full desktop restart. It exposes no
account-management methods. iPhone widgets and an internet relay are not yet
implemented; this version does not work from arbitrary networks.

## Build and run on Windows

Requirements: Node.js 24+, uv, Python 3.14.5 (uv can install it), Windows 10/11.

```powershell
pwsh -File scripts/build-windows.ps1
```

The script mirrors the sources into `%LOCALAPPDATA%\CodexPulse-build`, installs
dependencies there, runs tests, builds the Python sidecar and creates NSIS and
portable executables in its `release` directory. This keeps generated files
outside a Documents folder protected by Windows Controlled Folder Access.

For development, use that build directory:

```powershell
$env:PULSE_PYTHON = "$env:LOCALAPPDATA\CodexPulse-build\.venv314\Scripts\python.exe"
npm run build
npm start
```

`npm start -- --demo` opens a read-only sample workspace. `npm start -- --smoke`
uses a temporary app-data directory, captures a screenshot and exits after
checking the renderer and secure preload bridge. The smoke test does not open
or mutate real account credentials.

`node tests/desktop-lifecycle.cjs "release/win-unpacked/Codex Pulse.exe"` verifies
cold restart, tray close/reopen, reload, and missing/corrupt cache with four
isolated synthetic accounts. Set `PULSE_PYTHON` as above before running it.

`npm run dev` serves the browser design preview at http://127.0.0.1:5184.
The browser preview intentionally has no access to real accounts.

## Connecting accounts

1. Open the Windows app (not the sample browser preview).
2. Choose **Add account → Sign in with ChatGPT**, then finish in your browser.
3. Repeat for each account. All of them stay visible on the same screen.

The official Codex CLI must be installed. Pulse detects the Codex desktop app's
bundled CLI, native PATH installations, and standard npm vendor layouts. It
launches only the `login` command with fixed arguments and no shell. Each login
uses a separate, temporary child-process profile; your default Codex config,
credential-store preference, active auth file, and environment stay unchanged.
After sign-in the engine validates identity, encrypts the saved credentials,
and the temporary profile is removed. Interrupted profiles are cleaned on exit
and on the next launch. Device-code login may need enabling in ChatGPT security
or workspace settings. See the [official authentication guide](https://learn.chatgpt.com/docs/auth).

Existing logins can use **Already signed into Codex on this PC? → Save current
login**. Keyring-only credentials are not read; use the isolated sign-in flow
instead. Existing ccswap users can choose **Import existing ccswap accounts**.
Reconnect requires the same account and workspace. New independent sign-ins
can refresh without consuming the refresh token currently owned by Codex.
If the active account was reconnected, **Apply new login** explicitly selects
the new credentials; adding or reconnecting alone does not alter running Codex.

Choosing **Use on next Codex launch** changes Codex's active `auth.json` via the
ccswap engine. Running sessions retain their current login until restarted.
Pulse does not close any running Codex processes. Switching applies to file-backed
CLI/IDE logins; clients using the Windows credential store may retain a separate
account. Pulse does not weaken or change that credential-store policy.

Restarting ChatGPT/Codex desktop does **not** prove its account changed. There is
no verified desktop account-switch integration in this release. Pulse labels a
selected file login, never a verified desktop session, and does not force-close
active work or modify the desktop app's private credential store.

## Storage and integration boundaries

App data is stored in Electron's per-user application-data directory. Pulse's
credential backups are DPAPI ciphertext bound to the Windows user. Codex's own
active login stays in the format Codex expects. Importing existing ccswap
accounts does not encrypt or delete their original backups.

`health.json` is local-only startup diagnostics: app version, account counts,
state revisions and timestamps. It contains no emails, credentials or quota
values and is not transmitted to a service.

Only quota measurements, account identity metadata, settings, events, and the
user-visible one-time device code reach the renderer. Access/refresh tokens,
auth documents, and raw CLI output are never returned over IPC. The renderer is
sandboxed, context-isolated, and has no Node.js integration. IPC methods and
sender origins are allowlisted. No arbitrary command or URL API is exposed.

Quota reads use the authenticated backend integration implemented by ccswap;
its upstream routes and payloads can change. An unavailable measurement is never
displayed as zero. Credit balances are separate from quota percentages, and
percentages are not summed across accounts. History starts with local readings;
the app cannot reconstruct previous billing usage or per-model token history.

Forecasts are per account and window. They require two observations at least
15 minutes apart, restart their series after an observed quota reset, and are
suppressed when the current reading is stale. Dashed future paths are estimates
that assume the recent drain rate continues and the reported window resets on
schedule. They do not trigger account changes, spend credits, or redeem resets.

## Release status

This is a functional **0.2.0 desktop + Android release candidate**, not a claim of completed
production validation. See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for the
remaining public-release gates. A signing certificate and real account testing
must be supplied by the product owner before public distribution.

## Upstream

See [UPSTREAM.md](UPSTREAM.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
The ccswap engine remains the base; the desktop adapter and UI are additive.
