# Android companion — 0.2.0 release candidate

The companion only displays Codex quota. It cannot sign in to Codex, switch an
account, change the vault, or close an application. No OpenAI tokens or passwords
are transferred to the phone. The desktop continues to use ccswap 0.39.2.

## First connection

1. Install the Android APK from this repository's private release on your phone.
   The development APK is debug-signed, not a Play Store production build.
2. Connect the phone and PC to the same trusted private Wi-Fi/Ethernet network.
3. In desktop Pulse, choose **Phone companion**, select the private PC address,
   and enable the connection. If Windows asks, allow the private network only.
4. Generate a QR code. In the Android app choose **Scan pairing QR**, inspect
   the confirmation, and pair. A copied pairing link is also supported.
5. Give accounts custom names on the PC to recognize them on the phone.
   Unnamed accounts are shown as Account 1, Account 2, etc.; email fields and
   internal account identities are not shared.
6. Choose **Add home-screen widget**, or use your launcher's widget picker.
   Configure the accounts and 5-hour/7-day window. Resize it to fit more rows;
   extra accounts remain available in the app.

Keep desktop Pulse running in the tray. After a full exit/restart, explicitly
enable its private phone connection again. Device trust is retained, so a new
QR is not required unless access was revoked or the certificate changed.

## Freshness and disconnection

Phone refresh retrieves the latest snapshot already collected by the PC. It
does not make the PC perform another provider quota request. Per-account reading
timestamps are preserved. Readings over five minutes old are labeled stale.
Android schedules background collection (requested every 15 minutes) and widget
updates (30-minute periodic fallback); these are not exact/live guarantees.

If the PC is asleep, fully closed, offline, or on another network, the phone
retains encrypted cached readings and marks the failed connection. Widget rows
include their observation time even when Android delays an update. A countdown
reaching zero never invents a fresh 100% quota reading.

## Security design

- Listener: HTTPS/TLS 1.2+ bound to an explicitly selected RFC1918 IPv4 interface,
  port 47831. It is disabled by default and on a full desktop restart.
- Trust: a per-installation self-signed certificate; the QR carries its exact
  SHA-256 leaf fingerprint. The phone verifies fingerprint and certificate
  validity and refuses redirects. No public CA installation or trust-all TLS
  bypass is used. The fingerprint is trusted only after the user approves a QR
  generated on their own PC; do not scan an untrusted pairing QR.
- Pairing: random 256-bit one-time code, two-minute expiry, replaced when a new
  QR is generated and canceled when the desktop pairing dialog closes.
- Devices: random 256-bit bearer secret, at most 10 devices; only a SHA-256
  verifier is retained on the PC. Revoke devices in the desktop pairing panel.
- Storage: Windows `safeStorage` protects the TLS key/device metadata; Android
  Keystore AES-GCM protects the connection secret and cached readings. Android
  backup/device-transfer exclusions prevent exporting this state.
- HTTP: explicit read-only projection, bounded body/response sizes and socket
  timeouts, rate limits, no CORS, browser-Origin rejection and exact Host checks.
  Only pairing and snapshot endpoints exist; the network API exposes no switch,
  sign-in, file-access, export or shell capability.
- Pairing links are short-lived access secrets. Do not post them in GitHub
  issues, screenshots, logs, or public messages. Custom account labels are
  intentionally shared with paired phones; do not put secrets in labels.

## Build

Use JDK 17, Gradle 8.13 and Android SDK 36 with accepted SDK licenses:

```powershell
gradle -p mobile/android assembleDebug testDebugUnitTest lintDebug
```

On Windows `scripts/bootstrap-android.ps1` downloads checksum-verified official
toolchains under Local AppData. `scripts/build-android.ps1` mirrors source into
the desktop build directory to avoid Controlled Folder Access restrictions and
builds the APK. CI runs the same checks and stores an APK artifact.

## Not included / release gates

iPhone/WidgetKit, internet relay, remote account control, automatic desktop
account switching, Play Store publishing, and production signing are not
implemented. This local-network Android release candidate still requires a
physical-phone pairing/camera/widget/battery/sleep-resume test, OEM/launcher
coverage and independent security review before production distribution.
