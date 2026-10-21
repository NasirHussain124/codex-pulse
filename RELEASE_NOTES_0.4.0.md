# Quota management 0.4.0 — phone fixes and cleaner widgets

- PC: Copy pairing link no longer requests the blocked browser clipboard permission.
  Device-code sign-in copy is fixed too. Paste pairing links in the Android app,
  not the browser. A selectable-link fallback and Android download action are included.
- Real account names/custom labels on the phone. Enable Show emails on the PC
  to include emails in the paired phone's encrypted snapshot.
- Internal QR camera screen with explicit permission handling, Back/cancel, and
  manual-link fallback instead of the old scan activity.
- Pixel-inspired Material You widgets, four-account overview where space permits,
  corrected portrait sizing, responsive Android 12+ layouts, and no diagnostic paragraphs.
- More compact phone cards and automatic snapshot refresh when opening the app.

Install both the new Windows Setup and Android APK. Do not uninstall the old
Android app first: package/signing identity and encryption aliases are unchanged.
Paired phones and account storage are preserved. An existing widget updates
automatically; resize it once if the launcher holds onto an old size.

Windows is unsigned and Android is development-signed. Automated regression
tests cover scanner routing/permission denial/cancel, widget layouts, identity
privacy and clipboard validation. Physical camera/hardware validation on your
particular phone is still needed; this is a release candidate, not certification.
