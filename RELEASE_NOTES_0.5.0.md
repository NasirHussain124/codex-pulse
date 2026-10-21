# Quota management 0.5.0 — quick usage, calmer widgets

## Windows

Click the Q icon beside the clock for a small usage popover with both 5-hour and
7-day limits for every account. Click away, click the icon again, or press Escape
to dismiss. Refresh readings, pin the view as a desktop widget, or open Dashboard.
Right-click offers the full tray menu; double-click opens the dashboard.

The popover follows top/bottom/side taskbars and the tray's monitor. Windows may
place the icon in its hidden-icons menu; drag it beside the clock if preferred.
This is a supported system-tray feature, not a replacement Windows taskbar.

## Android

Redesigned widgets group each account into a soft, rounded card with both limits
inside it. Four accounts fit the default two-column grid; narrower widgets and
larger text use one column. Existing selected accounts and pairing are retained.
Resize a previously tall widget down once if you want a smaller footprint.

Install the APK over the existing app, then open it once to refresh the widget.
Do not uninstall. After fully restarting the PC app, enable Phone companion again;
the existing device trust stays saved, so you do not need to scan a new QR.

Verification: 47 Node tests, 48 packaged desktop interaction checks, Android APK
assembly, all 33 Android tests and lint (no errors), plus native synthetic visual
previews. Account-persistence lifecycle tests use isolated test accounts, not
real provider credentials.

Windows executables are unsigned; Android is debug-signed with the same upgrade
certificate as previous builds. This is a release candidate, not Play Store
distribution or certification across every physical camera, launcher and taskbar.
