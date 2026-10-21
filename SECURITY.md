# Security and supported boundaries

Quota management is an independent release candidate. Do not treat its local tests as
an independent security certification or a promise that ccswap's upstream quota
endpoints will remain compatible.

- Never attach `auth.json`, vault files, pending-login profiles, mobile pairing
  links, tokens or unredacted logs to an issue. Real app data is not source code.
- Windows credentials are DPAPI-bound; mobile transport keys/device records are
  protected with Windows safeStorage. Phone connection/cache data uses Android
  Keystore AES-GCM and is excluded from cloud backup and device transfer.
- Phone transport is disabled by default, restricted to an explicitly chosen
  private interface and read-only. Do not forward port 47831 on a router, expose
  it on public Wi-Fi, or use a trust-all TLS client. See MOBILE.md for the trust
  model, limits and source modules to review.
- A paired phone can read account names, custom labels and quota until revoked.
  Emails are included only when the PC's Show emails setting is enabled. Anyone holding
  an unexpired pairing QR can pair a device; trust only a QR generated locally
  and confirm the PC address. Custom labels must not contain secrets.
- The renderer has no raw credentials, Node integration or arbitrary shell/URL
  bridge. It is sandboxed/context-isolated and IPC origins are checked.
- Selecting a file-backed login is not evidence of ChatGPT desktop's account.
  Quota management does not patch its private login database or force-close active work.
- Production distribution still needs signed Windows/Android artifacts,
  clean-machine/physical-phone tests, token-expiry tests and independent review.

Report security findings privately to the repository owner. Include a minimal
synthetic reproduction rather than credentials or user data. Do not publish an
exploitable secret in a public issue.
