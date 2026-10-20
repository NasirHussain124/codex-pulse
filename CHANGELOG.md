# Changes

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
