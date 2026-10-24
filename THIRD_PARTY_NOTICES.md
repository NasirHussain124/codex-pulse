# ccswap

Codex Pulse uses ccswap 0.39.2 as its account and usage engine.
Source: https://github.com/errhythm/ccswap
ccswap began as a fork of https://github.com/realiti4/claude-swap.

MIT License

Copyright (c) 2026 Onur Cetinkol

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Other packaged dependencies retain their respective license files. Electron
distributions include LICENSE.electron.txt and LICENSES.chromium.html.

## Provider marks — Lobe Icons

Selected Codex, GitHub Copilot, Claude, Gemini and Cursor SVGs are bundled from
LobeHub's MIT-licensed Lobe Icons, commit
`7d7d0379f18b114a4009dc5cb85a7c375284f31b`. Copyright (c) 2023 LobeHub.
The complete MIT notice and exact source URLs/SHA-256 hashes ship in
`public/providers/LICENSE.txt` and `public/providers/SOURCES.json`
(inside the installed app: `dist/providers/`).
No runtime CDN requests are made. Brand trademarks belong to their owners;
these marks identify integrations and imply no affiliation or endorsement.
Quota management's Q / dual-window meter is original application artwork,
not a provider mark.

## Reporting integrations

GitHub Copilot SDK 1.0.26 and its matching official platform runtime 1.0.103
are distributed under their upstream MIT notices, retained in the packaged
dependency directories. Source: https://github.com/github/copilot-sdk .
Google Auth Library 11.3.1 retains its Apache-2.0 license and dependency notices.
Source: https://github.com/googleapis/google-auth-library-nodejs .
The application uses authenticated reporting operations only; it does not
create AI sessions, execute provider tools, enable overage or alter billing.

Android uses ZXing Android Embedded / ZXing core and AndroidX support libraries
under Apache-2.0. Its packaged NOTICE.txt lists upstream sources and attribution;
the app exposes it through Open-source notices. Test-only Robolectric/JUnit are
not shipped in the APK. Desktop QR/TLS dependencies qrcode and selfsigned retain
their bundled dependency license files.
