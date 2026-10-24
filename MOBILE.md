# Android companion — 0.6.0 release candidate

The companion displays Codex quota and compact read-only reports for providers
connected on the PC. Organization/project reports keep their own units and scope;
they are not converted to Codex 5h/7d limits. Home-screen widgets remain focused
on Codex accounts. The companion cannot sign in to Codex, switch an
account, change the vault, or close an application. No OpenAI tokens or passwords
are transferred to the phone. The desktop continues to use ccswap 0.39.2.

## First connection

1. Install the Android APK from this repository's public release on your phone.
   The development APK is debug-signed, not a Play Store production build.
   If GitHub does not open, use the [direct Android 0.6.0 file](https://cdn.jsdelivr.net/gh/NasirHussain124/codex-pulse@d8c4abb6884dde1329b2da6ebbb3cc84c3b71667/Quota-management-Android.apk)
   in Chrome. Windows 0.6.1 includes this direct source and an alternate download
   button. Both mirrors retain the same signed APK and published SHA-256 hash.
2. Connect the phone and PC to the same trusted private Wi-Fi/Ethernet network.
3. In Quota management, choose **Phone companion**, select the private PC address,
   and enable the connection. If Windows asks, allow the private network only.
4. Generate a QR code. In the Android app choose **Scan pairing QR**, inspect
   the confirmation, and pair. A copied pairing link is also supported.
5. Account names come from the real account or your custom PC label. Enable
   **Show emails** in the PC dashboard to include account emails on the phone.
   With emails hidden, only names and quota are shared; internal identities and
   login credentials are never shared. Refresh the phone after changing this setting.
6. Choose **Add home-screen widget**, or use your launcher's widget picker.
   Both limits are grouped inside each account's rounded card, with short names,
   two percentages and quiet bars. Four accounts fit a compact 148dp-high grid at
   normal font size. The requested default grid is 4×2; actual cell sizes depend
   on your launcher. Resize an existing widget down once to reclaim home-screen
   space. Narrow widgets and larger text switch to one column to stay readable;
   resize taller for more accounts. Saved/offline state stays in the quiet header
   rather than hiding half the accounts to make room for diagnostic text.
   Long-press to reconfigure chosen accounts, optional emails or a single quota
   window. Leave all accounts unchecked to show everyone. Extra accounts remain
   available in the app with a quiet overflow count on the widget.

The scanner opens a full-screen camera with a centered frame, accessible close
and flash controls, and a small **Use pairing link** fallback. Closing it returns
to the app without changing an existing pairing.

Keep Quota management running in the tray. Enable automatic phone recovery and
Windows sign-in startup if you want it to resume after a restart. Local discovery
can find a changed private LAN address without replacing the original certificate
pin/token. On public networks LAN auto-resume fails closed. Device trust is
retained, so a new QR is not required unless access was revoked or the certificate
changed. For remote access, explicitly enroll both devices in your own Tailscale
network and select the verified Tailscale adapter in Phone companion. No public
listener or hosted relay is created, and your PC must stay awake and connected.

## Freshness and disconnection

Phone refresh retrieves the latest snapshot already collected by the PC. It
does not make the PC perform another provider quota request. Per-account reading
timestamps are preserved. Readings over five minutes old are labeled stale.
Android schedules background collection (requested every 15 minutes) and widget
updates (30-minute periodic fallback); these are not exact/live guarantees.

If the PC is asleep, fully closed, offline, or on another network, the phone
retains encrypted cached readings and marks the failed connection. Widget rows
retain observation times in their accessibility description; a quiet Saved
label appears when readings are old. A countdown
reaching zero never invents a fresh 100% quota reading.

## Security design

- Listener: HTTPS/TLS 1.2+ bound to an explicitly selected private IPv4 or verified
  Tailscale interface, port 47831. Disabled by default; auto-resume/discovery
  require explicit opt-in and a trusted network/adapter.
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
