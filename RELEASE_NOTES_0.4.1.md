# Android 0.4.1 — compact dual-limit widget and clean camera

- Both 5-hour and 7-day limits for every visible account, side by side.
- Compact app-purple widget with short names, two percentages and quiet bars per
  account. Four accounts fit 148dp at normal font size; requested default grid 4×2.
- Existing widget selections survive. Resize a previously tall widget down once
  to reclaim space; launcher grid sizes vary. Emails and single-window views are
  optional in widget configuration. Larger text can need a taller widget.
- Full-screen scanner with a subtle frame, close/flash controls and pairing-link
  fallback. Existing phone pairing is preserved.

Install this APK over the existing Android app; do not uninstall it. It uses the
same application ID and debug signing certificate as 0.4.0. Windows remains 0.4.0
and needs no reinstall for this Android-only patch.

Verification: all 30 Android tests, APK assembly and lint passed. No lint errors;
forward-compatible widget metadata, unused resources and a test-dependency update
notice remain warnings. This is a debug-signed release candidate, not Play Store distribution
or certification across physical cameras, launchers and manufacturers.

The phone displays the latest PC readings over trusted private Wi-Fi. Keep the
desktop running and its Phone companion connection enabled. This update does
not introduce internet relay, account-control capabilities or new providers.
