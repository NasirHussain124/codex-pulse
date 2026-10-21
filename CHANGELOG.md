# Changes

## 0.5.0 — 2026-10-21

- Windows Q tray icon opens a frameless quick-usage popover with both quota limits
  for all saved Codex accounts. Click again, click away or press Escape to close.
- Refresh, pin-to-desktop and dashboard shortcuts. Right-click tray menu and
  double-click dashboard access remain available. No replacement taskbar or shell.
- Monitor-aware positioning supports top, bottom and side taskbars, tray overflow
  and negative multi-monitor origins. Large rosters scroll within a bounded popover.
- Redesigned desktop and Android widgets with grouped account tiles, quieter
  colors and separate 5-hour / 7-day values. Android adapts to narrow hosts and
  accessibility fonts; offline state does not unnecessarily hide account cards.
- Preserves account vaults, private phone pairing, Android widget selections,
  application IDs and signing identity. Desktop phone-download action points to
  the matching Android build.

## Android 0.4.1 — 2026-10-21

- Compact multi-account widget with both 5-hour and 7-day limits side by side.
  Short account names by default, optional emails, purple app-matched styling,
  quiet progress bars, 4×2 requested grid and adaptive rows without an empty panel.
- Existing widgets adopt both limits without losing selected accounts. Explicit
  single-window modes remain available through widget configuration.
- Full-screen QR camera with a subtle scan frame, close/flash controls, safe
  permission/error states and a small pairing-link fallback. No pairing reset.
- Thirty Android tests pass, including compact four-account layouts, unknown
  quotas, overflow, larger fonts, legacy launchers, migration and scanner controls.
- Android-only patch; the Windows app remains 0.4.0. Debug-signed release candidate,
  not a Play Store or broad physical-device certification.

## 0.4.0 — 2026-10-21

- Fixed pairing-link copy permission errors with a validated native clipboard action.
- Device sign-in codes use the same native clipboard path; browser permissions stay restricted.
- Phone sync now carries real account names and custom labels. Emails are included
  only when the PC's Show emails setting is enabled.
- Replaced the legacy scan activity with an in-app QR scanner: runtime camera
  permissions, permission-denial/camera-error states, cancellation and manual fallback.
- Pixel-inspired mobile widgets: Material You colors, clean typography and quiet
  quota bars. Exact Android 12+ host sizes and legacy portrait/landscape layouts
  prevent one-row widgets with large unused space.
- Compact mobile account cards, automatic foreground sync, and real identities
  in widget configuration. Stored credentials, phone pairing and widget choices remain intact.

## 0.3.0 — 2026-10-21

- Renamed the desktop app, Android companion, shortcuts and tray to Quota management.
- New lavender quota-meter / Q logo across app, installer, favicon and Android.
- Battery-style desktop and Android widgets: rounded slate container, full-height
  plum/lavender quota fills, readable account names, percentages and reset times.
- Desktop widget 5-hour/7-day selector, account details, onboarding and refresh.
- Explicit unknown/stale/reconnect states; no fallback to the wrong quota window.
- Preserved Windows/Android installation identities, original encrypted desktop
  storage, phone encryption aliases and pairing scheme for in-place upgrades.
- Added rebranding/persistence, widget data and packaged interaction tests.

## 0.2.0 — 2026-10-21

- Native Android companion: QR/paste pairing, all-account 5-hour/weekly usage,
  reset countdowns, manual snapshot refresh, encrypted cache and offline states.
- Configurable native Android home-screen widget: selected/all accounts, quota
  window, resizable rows, observation times and a refresh action.
- Desktop Phone companion panel with private-network selection, ephemeral QR,
  device list, last-connected time and immediate revocation.
- TLS-pinned read-only transport with default-off private listener, Windows
  encrypted installation identity, one-time pairing and bounded requests.
- Clear file-login vs desktop-session switching confirmation; no unverified
  automatic ChatGPT restart or account-active claims.
- Android build/check workflow, mobile/security documentation and expanded
  desktop startup/pairing regression coverage.

## 0.1.3

- Vault-first offline startup and renderer state revision ordering.
- Preserve saved accounts when snapshot caches are missing/damaged.
- Tray/reload state re-sync and explicit Quit action.

## 0.1.2

- Accessible dark dropdowns instead of inconsistent Windows-native popups.
- Codex-only ledger and right-side account chooser/details.
