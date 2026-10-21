# Quota management — Windows 0.5.2

Fixes accounts appearing to disappear after closing ChatGPT and reopening the
monitor from Windows. Windows had redirected the hosted app's AppData files to
the host package's private cache; normal launches saw a separate empty folder.

The upgrade moves the verified saved profile to
`%USERPROFILE%\.quota-management`. Your encrypted logins, settings, history,
phone pairing and its Windows encryption state are retained, and legacy
originals are left untouched. An unreadable or conflicting profile produces a
recovery message rather than an empty replacement.

The app and its tray/widget run independently; no ChatGPT process is closed or
modified. Missing live Codex authentication cannot remove saved accounts.

This is a desktop-only update. Android remains 0.5.0. After a full desktop restart,
enable Phone companion again to resume local sync; an existing pairing is retained.
The Windows installer is unsigned; production signing and broader device/soak
validation remain release gates.
