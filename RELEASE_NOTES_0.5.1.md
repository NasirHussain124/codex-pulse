# Windows 0.5.1 — a cleaner 5h / 7 days ledger

- Consistent limit order: 5h first, then 7 days, including Account details.
- Larger percentages, quieter reset countdowns, clear account identities and a
  rounded, readable ledger. Full reset dates are available on hover.
- Credits, banked resets and last-reading timestamps remain in Account details.
- Refresh, details, reconnect, rename, account selection and removal retain their
  existing confirmation and safety behavior. “Selected” does not imply another
  running application's authenticated account has changed.
- Exact-window, zero, invalid/missing, stale and due-reset display checks.

Verification: 50 Node tests, 53 desktop interaction checks, production build and
native synthetic layout review. Windows executables remain unsigned release
candidates. The provider engine and encrypted account storage are unchanged.

This is a desktop-only update. Android stays at 0.5.0; no phone reinstall is
needed. Existing account and phone pairing data are retained. After a full PC
app restart, enable Phone companion again if you use it; no new QR is required.
