# Codex Pulse 0.2.0 — desktop + Android preview

An independent, Codex-only multi-account usage monitor built on ccswap 0.39.2.

## Downloads

- Windows Setup: permanent per-user installation with Start Menu shortcut.
- Windows Portable: launch the portable file itself, not an extracted Temp exe.
- Android debug APK: native usage viewer + configurable home-screen widget.
  This is a development-signed APK, not a production Play Store release.
- RELEASE_HASHES.txt: SHA-256 checksums for the locally verified artifacts.

## Pair your phone

Use the same trusted private network. On Windows choose **Phone companion →
Enable private phone connection → Pair an Android phone**. In the Android app,
scan that QR and confirm the PC. Customize account labels on Windows, and add a
widget from the phone app or your launcher's widget picker. Keep Pulse running
in the tray; enable the connection again after a full PC-app restart.

The phone only receives labels, quota, reset times and reading timestamps. It
cannot change accounts. Codex credentials remain on the PC. Paired phones can
be revoked from the desktop pairing panel. Read MOBILE.md / SECURITY.md first.

## Checks

33 Node tests, 17 Python tests, 8 Android tests, 33 packaged desktop UI checks,
packaged frozen-engine protocol checks and cold/tray/reload/encrypted-pairing
lifecycle tests passed locally. Android lint has no errors; npm audit has no
reported vulnerabilities. Windows artifacts are unsigned.

## Important limits

- Same-private-network Android only: no internet relay or iPhone app yet.
- PC asleep/fully closed/offline: cached readings, clearly stale/offline; Android
  controls background/widget refresh timing.
- Selecting a file-backed login does not guarantee the account inside ChatGPT
  desktop. Automatic close/reopen switching is not implemented or claimed.
- Physical Android camera/network/launcher/battery tests, independent security
  review, production signing and clean-machine validation are still required.
  This is a tested release candidate, not production certification.
