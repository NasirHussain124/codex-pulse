# Quota management 0.3.0 — new name, new widgets

Previously Codex Pulse. Codex-only, local-first usage monitoring, powered by
ccswap 0.39.2. This independent project is not an official OpenAI app.

- New quota-meter / Q icon and Quota management branding on Windows and Android.
- Battery-style widgets with rounded, full-height percentage fills, a lavender
  and plum palette, account icons and reset times.
- Desktop widget: switch between 5-hour and 7-day remaining quota, open account
  details, add accounts, refresh, manage privacy and open the dashboard.
- Android widget: choose accounts/window in configuration, resize to show more
  rows, refresh the PC snapshot, and see saved/unreported readings clearly.
- Upgrade keeps the existing vault and phone pairing. Internal executable name,
  application IDs, encryption aliases and pairing scheme intentionally remain
  unchanged. No need to re-add accounts just because the app has a new name.

Install the Windows Setup over the existing installation. On Android install
the new APK as an update, without uninstalling the old companion first.
Windows installers are unsigned and the APK is development-signed. Same private
network only; Android controls background refresh. Physical-device validation,
production signing and independent security review remain release gates.
