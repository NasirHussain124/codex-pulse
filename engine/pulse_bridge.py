"""Private JSON-lines adapter around the pinned ccswap engine.

Only sanitized account metadata and quota measurements cross stdout. Pulse's
saved credentials are DPAPI-encrypted on Windows; Codex's own active auth file
retains the format expected by Codex. No listening network service is created.
"""
from __future__ import annotations

import argparse
import base64
import contextlib
from concurrent.futures import ThreadPoolExecutor
import ctypes
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
import time
import uuid
from typing import Any
from reset_rpc import ResetRPC, ResetError, public_review

from claude_swap.codex import CodexAccountSwitcher, _plan_type_from_auth, refresh_codex_auth
from claude_swap.codex_usage import CodexUsageError
from claude_swap.exceptions import ConfigError, ValidationError, SwitchError, AccountNotFoundError, LockError
from claude_swap.fsutil import read_text_with_retry, replace_with_retry
from claude_swap.locking import FileLock
from claude_swap.usage_store import UsageEntry


def dpapi(data: bytes, *, decrypt: bool = False, purpose: bytes | None = None) -> bytes:
    if sys.platform != "win32":
        raise ConfigError("This build requires Windows secure storage.")

    class Blob(ctypes.Structure):
        _fields_ = [("size", ctypes.c_ulong), ("data", ctypes.POINTER(ctypes.c_ubyte))]

    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    source = ctypes.create_string_buffer(data)
    incoming = Blob(len(data), ctypes.cast(source, ctypes.POINTER(ctypes.c_ubyte)))
    outgoing = Blob()
    entropy_buffer = ctypes.create_string_buffer(purpose) if purpose else None
    entropy = Blob(len(purpose), ctypes.cast(entropy_buffer, ctypes.POINTER(ctypes.c_ubyte))) if purpose else None
    fn = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    fn.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p,
                   ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(Blob)]
    fn.restype = ctypes.c_int
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    if not fn(ctypes.byref(incoming), None, ctypes.byref(entropy) if entropy else None, None, None, 1, ctypes.byref(outgoing)):
        raise ConfigError("Windows could not unlock this account. Save its login again on this Windows account.")
    try:
        return ctypes.string_at(outgoing.data, outgoing.size)
    finally:
        kernel.LocalFree(outgoing.data)


def atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        if sys.platform != "win32":
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=True, allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        replace_with_retry(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


class SecureSwitcher(CodexAccountSwitcher):
    def __init__(self, root: Path, codex_home: Path | None = None):
        super().__init__()
        self.backup_dir = root
        self.provider_dir = root / "codex"
        self.credentials_dir = self.provider_dir / "credentials"
        self.sequence_file = self.provider_dir / "sequence.json"
        self.lock_file = root / ".lock"
        if codex_home is not None:
            self.codex_home = codex_home
            self.auth_file = codex_home / "auth.json"

    def _read_sequence(self):
        roster = super()._read_sequence()
        if not roster["accounts"] and any(self.credentials_dir.glob("account-*.json")):
            raise ConfigError("Saved logins exist but their account list is missing or empty. Your encrypted logins have been preserved; do not add them again.")
        return roster

    def current_account_number(self) -> str | None:
        try:
            return super().current_account_number()
        except ValidationError:
            # A partially written or unsupported live login cannot prevent
            # saved accounts from being displayed.
            return None

    def _read_json(self, path: Path) -> dict[str, Any] | None:
        if not path.exists():
            return None
        try:
            value = json.loads(read_text_with_retry(path))
            if path.parent == self.credentials_dir:
                if not isinstance(value, dict) or value.get("pulseVault") != 1:
                    raise ConfigError("This saved login is not a Pulse vault entry. Import it through Accounts.")
                value = json.loads(dpapi(base64.b64decode(value["data"], validate=True), decrypt=True))
            if not isinstance(value, dict):
                raise ValueError("expected object")
            return value
        except ConfigError:
            raise
        except (OSError, ValueError, KeyError, UnicodeError):
            if path == self.auth_file:
                return None
            raise ConfigError("Saved account data is unreadable. It has been preserved for recovery.") from None

    def _write_json(self, path: Path, data: dict[str, Any]) -> None:
        if path.parent == self.credentials_dir:
            # ccswap normally backs up the departing live auth. Do not replace
            # a freshly reconnected independent login with that older session.
            if getattr(self, "_preserve_departing", None) == path:
                return
            protected = dpapi(json.dumps(data, allow_nan=False).encode("utf-8"))
            data = {"pulseVault": 1, "data": base64.b64encode(protected).decode("ascii")}
        atomic_json(path, data)

    @staticmethod
    def refresh_token(auth):
        tokens = auth.get("tokens") if isinstance(auth, dict) else None
        return tokens.get("refresh_token") if isinstance(tokens, dict) else None

    def independent_login(self, number, live_auth=None, roster=None):
        roster = roster or self._read_sequence()
        if not roster["accounts"].get(number, {}).get("isolatedLogin"):
            return False
        saved = self._read_account_auth(number)
        live = live_auth if live_auth is not None else self._read_json(self.auth_file)
        return bool(self.refresh_token(saved) and self.refresh_token(saved) != self.refresh_token(live))

    def _refresh_inactive_auth(self, number, expected_auth):
        roster = self._read_sequence()
        if not roster["accounts"].get(number, {}).get("isolatedLogin"):
            return super()._refresh_inactive_auth(number, expected_auth)
        expected = self.refresh_token(expected_auth)
        if not expected:
            raise CodexUsageError("saved login has no ChatGPT refresh token")
        with FileLock(self.lock_file):
            # An independent sign-in can have the same email/workspace as
            # Codex's live login but a DIFFERENT refresh token. Only the token
            # actually owned by a running session must not be consumed here.
            live = self._read_json(self.auth_file)
            if self.refresh_token(live) == expected:
                return None
            saved = self._read_account_auth(number)
            if self.refresh_token(saved) != expected:
                return None
            refreshed = refresh_codex_auth(saved)
            self._write_json(self._credential_path(number), refreshed)
            return refreshed

    def switch_to(self, identifier, json_output=False, force=False):
        roster = self._read_sequence()
        number = self._resolve(identifier, roster)
        active = self.current_account_number()
        independent = self.independent_login(active, roster=roster) if active else False
        if number == active and independent:
            # Explicitly applying a reconnected login is the only action that
            # may replace its older live auth. No running process is closed.
            with FileLock(self.lock_file):
                if self.current_account_number() != number:
                    raise ConfigError("The active login changed. Refresh the dashboard and choose the account again.")
                auth = self._read_account_auth(number)
                if auth is None:
                    raise ConfigError("The saved login is missing. Reconnect this account.")
                self._write_json(self.auth_file, auth)
            return {"switched": True, "reason": "reconnected-login"}
        self._preserve_departing = self._credential_path(active) if independent else None
        try:
            return super().switch_to(identifier, json_output=json_output, force=force)
        finally:
            self._preserve_departing = None

    def _usage_entry(self, number, auth, eligible, now, *, is_active):
        # Upstream's network handler assumes every OSError has .reason. A
        # plain socket/SSL OSError can instead raise AttributeError. Keep the
        # last reading without allowing one broken request to blank the grid.
        try:
            return super()._usage_entry(number, auth, eligible, now, is_active=is_active)
        except (OSError, AttributeError) as exc:
            entry = self._usage_failure_entry(self._usage_cache.get(number), exc)
            self._usage_cache[number] = entry
            return entry


def iso(epoch: float | None) -> str | None:
    from datetime import datetime, timezone
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")


def finite(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        result = float(value)
    except OverflowError:
        return None
    return result if math.isfinite(result) else None


def public_account(account, now: float) -> dict:
    entry = account.usage
    windows = []
    usage = entry.last_good or {}
    for key, label, duration in (("five_hour", "5-hour window", 300),
                                 ("weekly", "Weekly", 10080), ("seven_day", "Weekly", 10080)):
        raw = usage.get(key)
        used = finite(raw.get("pct")) if isinstance(raw, dict) else None
        if used is None:
            continue
        used = min(100.0, max(0.0, used))
        windows.append({"id": key, "label": label, "durationMinutes": duration,
                        "usedPercent": used, "remainingPercent": round(100 - used, 2),
                        "resetsAt": raw.get("resets_at")})
    age = max(0, now - entry.fetched_at) if entry.fetched_at is not None else None
    error = entry.last_error or ""
    expired = any(word in error.lower() for word in ("expired", "unauthorized", "revoked", "already used"))
    is_api = account.kind == "api_key"
    status = "api_key" if is_api else "reconnect" if expired else "stale" if windows and (error or (age or 0) > 300) else "ready" if usage else "unavailable"
    hint = None
    if expired:
        hint = "Sign in to this account in Codex, then save its login again."
    elif error:
        hint = "Usage could not be refreshed. The last successful reading is shown when available."
    elif is_api:
        hint = "API-key accounts do not report ChatGPT subscription quota."
    identity = hashlib.sha256(f"{account.email}\0{account.org_uuid}".encode()).hexdigest()[:16]
    balance = finite(usage.get("credits", {}).get("balance")) if isinstance(usage.get("credits"), dict) else None
    resets = usage.get("reset_credits", {})
    count = finite(resets.get("available")) if isinstance(resets, dict) else None
    count = int(count) if count is not None and count >= 0 and count.is_integer() else None
    expiry = resets.get("expires_at") if isinstance(resets, dict) else None
    if not isinstance(expiry, str):
        expiry = None
    else:
        from datetime import datetime
        try:
            parsed = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                expiry = None
        except (ValueError, OverflowError):
            expiry = None
    return {"id": account.number, "identity": identity, "email": account.email,
            "plan": account.org_name.removeprefix("Codex "), "provider": "codex",
            "selected": account.is_active, "disabled": account.disabled,
            "status": status, "hint": hint, "windows": windows,
            "fetchedAt": iso(entry.fetched_at), "credits": balance,
            "bankedResets": count,
            "resetCredits": {"available": count, "earliestExpiresAt": expiry,
                             "detailsKnown": expiry is not None}}


class PulseBridge:
    def __init__(self, root: Path, codex_home: Path | None = None):
        self.switcher = SecureSwitcher(root, codex_home)
        self.root = root
        self.retry_at: dict[str, float] = {}
        self.last_collect = 0.0
        self._restore_cache()

    def _restore_cache(self):
        try:
            data = json.loads((self.root / "readings.json").read_text(encoding="utf-8"))
            roster = self.switcher._read_sequence()["accounts"]
            for number, record in data.get("accounts", {}).items():
                ts = finite(record.get("at"))
                registered = roster.get(number, {})
                identity = hashlib.sha256(f"{registered.get('email')}\0{registered.get('accountId')}".encode()).hexdigest()
                if registered and record.get("identity") == identity and isinstance(number, str) and number.isdigit() and isinstance(record.get("usage"), dict) and ts is not None and ts <= time.time() + 60:
                    self.switcher._usage_cache[number] = UsageEntry(last_good=record["usage"], fetched_at=ts)
        except (OSError, ValueError, TypeError, AttributeError, ConfigError):
            pass  # A disposable reading cache must never prevent startup.

    def snapshot(self, refresh: bool = False, only: str | None = None) -> dict:
        now = time.time()
        roster = self.switcher._read_sequence()
        eligible = set()
        if refresh and now - self.last_collect >= 30:
            candidates = [number for number in roster["accounts"]
                          if now >= self.retry_at.get(number, 0) and (only is None or number == only)]
            eligible = set(sorted(candidates, key=lambda n: self.retry_at.get(n, 0))[:12])
            self.last_collect = now
        if eligible:
            active = self.switcher.current_account_number()
            def fetch_one(number):
                separate = self.switcher.independent_login(number, roster=roster)
                use_live = number == active and not separate
                auth = self.switcher._read_json(self.switcher.auth_file) if use_live else self.switcher._read_account_auth(number)
                self.switcher._usage_entry(number, auth, True, time.time(), is_active=use_live)
            with ThreadPoolExecutor(max_workers=3) as pool:
                list(pool.map(fetch_one, eligible))
        snapshot = self.switcher.accounts_snapshot(fetch=set())
        accounts = [public_account(a, time.time()) for a in snapshot.accounts]
        for account in accounts:
            account["pendingLogin"] = account["selected"] and self.switcher.independent_login(account["id"], roster=roster)
        for a in snapshot.accounts:
            if a.number in eligible:
                failures = a.usage.consecutive_failures
                self.retry_at[a.number] = now + (min(3600, 120 * 2 ** min(failures, 5)) if failures else 120)
        if eligible:
            self._persist_usage(snapshot.accounts)
        return {"schemaVersion": 1, "generatedAt": iso(time.time()), "accounts": accounts,
                "engine": {"name": "ccswap", "version": "0.39.2", "secureStorage": "Windows DPAPI"}}

    def _persist_usage(self, accounts):
        atomic_json(self.root / "readings.json", {"accounts": {
            a.number: {"usage": a.usage.last_good, "at": a.usage.fetched_at,
                "identity": hashlib.sha256(f"{a.email}\0{a.org_uuid}".encode()).hexdigest()}
            for a in accounts if a.usage.last_good is not None}})

    def dispatch(self, method: str, params: dict) -> dict:
        if method == "backupCreateKey":
            key = os.urandom(32)
            return {"key": base64.b64encode(key).decode("ascii"),
                "wrappedKey": base64.b64encode(dpapi(key, purpose=b"quota-management.encrypted-backup.v1")).decode("ascii")}
        if method == "backupOpenKey":
            wrapped = params.get("wrappedKey")
            try:
                if not isinstance(wrapped, str) or not 0 < len(wrapped) <= 4096:
                    raise ValueError()
                key = dpapi(base64.b64decode(wrapped, validate=True), decrypt=True, purpose=b"quota-management.encrypted-backup.v1")
                if len(key) != 32:
                    raise ValueError()
            except (ValueError, ConfigError):
                raise ValueError("This backup cannot be unlocked by this Windows user. No saved accounts were changed.") from None
            return {"key": base64.b64encode(key).decode("ascii")}
        if method == "snapshot":
            only = params.get("id")
            if only is not None and (not isinstance(only, str) or not only.isdigit() or len(only) > 9):
                raise ValueError("Invalid account identifier.")
            return self.snapshot(bool(params.get("refresh", False)), only)
        if method == "current":
            try:
                auth = self.switcher._read_live_auth()
                email, _, mode = self.switcher._identity_from_auth(auth)
                return {"available": True, "email": email, "mode": mode,
                        "plan": _plan_type_from_auth(auth) or "Unknown"}
            except (ConfigError, ValidationError):
                return {"available": False, "message": "No compatible file-backed login found. Sign in with the Codex CLI using its file credential store, then try again."}
        if method == "addCurrent":
            self.switcher.add_account()
            number = self.switcher.current_account_number()
            self.switcher._usage_cache.pop(number, None)
            self.retry_at.pop(number, None)
            self.last_collect = 0
            return self.snapshot(False)
        if method == "importExisting":
            return self.import_existing()
        if method == "importLogin":
            return self.import_login(params)
        if method in {"resetReview", "resetConsume"}:
            return self.reset_operation(method, params)
        number = str(params.get("id", ""))
        if method not in {"switch", "remove", "setDisabled"} or not number.isdigit() or len(number) > 9:
            raise ValueError("Unsupported account operation.")
        if method == "switch":
            try:
                self.switcher.switch_to(number)
            except SwitchError as exc:
                if "unmanaged" in str(exc):
                    raise ConfigError("Save your current Codex login first: Add account → Already signed into Codex → Save current login. Then select the other account.") from None
                raise ConfigError("This account could not be selected. Reconnect its login and try again.") from None
        elif method == "remove":
            self.switcher.remove_account(number, assume_yes=True)
            self.switcher._usage_cache.pop(number, None)
        else:
            if not isinstance(params.get("disabled"), bool):
                raise ValueError("Expected a boolean disabled state.")
            self.switcher.set_account_disabled(number, params["disabled"])
        return self.snapshot(False)

    def reset_operation(self, method: str, params: dict) -> dict:
        number = params.get("id")
        if not isinstance(number, str) or not re.fullmatch(r"\d{1,9}", number):
            raise ValueError("Invalid reset account.")
        # Resolve the saved identity again immediately before the RPC. Nothing
        # is selected, no refresh token is copied/consumed and live auth is never
        # overwritten. Expired access tokens require the normal safe refresh.
        with FileLock(self.switcher.lock_file):
            roster = self.switcher._read_sequence()
            record = roster["accounts"].get(number)
            if not record or record.get("disabled"):
                raise ResetError("This account is missing or excluded. Refresh the dashboard.")
            active = self.switcher.current_account_number()
            auth = self.switcher._read_json(self.switcher.auth_file) if number == active and not self.switcher.independent_login(number, roster=roster) else self.switcher._read_account_auth(number)
            email, account_id, mode = self.switcher._identity_from_auth(auth)
            if mode != "chatgpt" or email != record.get("email") or account_id != record.get("accountId"):
                raise ResetError("The saved login does not match this account. Reconnect before reviewing resets.")
            expected_identity = hashlib.sha256(f"{email}\0{account_id}".encode()).hexdigest()[:16]
            if params.get("expectedIdentity") != expected_identity:
                raise ResetError("The account changed while the reset was being reviewed. Reopen its details.")
        executable = params.get("executable")
        if not isinstance(executable, str):
            raise ResetError("Install the official Codex CLI to review resets.")
        with ResetRPC(executable, auth.get("tokens", {})) as rpc:
            if method == "resetConsume":
                credit = params.get("creditId")
                attempt = params.get("attemptId")
                if not isinstance(credit, str) or not 0 < len(credit) <= 512:
                    raise ResetError("Choose a specific reset from a fresh review.")
                try:
                    if str(uuid.UUID(attempt)) != attempt:
                        raise ValueError()
                except (ValueError, TypeError, AttributeError):
                    raise ResetError("Invalid redemption attempt. Review the credit again.") from None
                if params.get("retry") is not True:
                    before = public_review(rpc.call("account/rateLimits/read"))
                    selected = next((c for c in before["credits"] if c["id"] == credit), None)
                    if selected is None or selected["expiresAt"] is not None and selected["expiresAt"] <= iso(time.time()):
                        raise ResetError("This reset is no longer available. Refresh the review; no credit was spent.")
                result = rpc.call("account/rateLimitResetCredit/consume", {"creditId": credit, "idempotencyKey": attempt})
                outcome = result.get("outcome") if isinstance(result, dict) else None
                if outcome not in {"reset", "alreadyRedeemed", "nothingToReset", "noCredit"}:
                    raise ResetError("The redemption result is unknown. Retry the same credit to check this attempt safely.")
            else:
                outcome = None
            # The authoritative post-redemption reading, never inferred 100%.
            review = public_review(rpc.call("account/rateLimits/read"))
        current = self.switcher._usage_cache.get(number)
        usage = dict(current.last_good or {}) if current else {}
        for key in ("five_hour", "weekly", "seven_day"):
            usage.pop(key, None)
        for row in review["windows"]:
            key = "five_hour" if row["durationMinutes"] == 300 else "weekly" if row["durationMinutes"] == 10080 else None
            if key:
                usage[key] = {"pct": 100 - row["remainingPercent"], "resets_at": row["resetsAt"]}
        usage["reset_credits"] = {"available": review["available"], "expires_at": next((c["expiresAt"] for c in review["credits"] if c["expiresAt"]), None)}
        self.switcher._usage_cache[number] = UsageEntry(last_good=usage, fetched_at=time.time())
        self._persist_usage(self.switcher.accounts_snapshot(fetch=set()).accounts)
        return {"review": review, "outcome": outcome, "snapshot": self.snapshot(False)}

    def import_login(self, params: dict) -> dict:
        session_id = params.get("sessionId", "")
        if not isinstance(session_id, str) or not re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", session_id):
            raise ValueError("Invalid sign-in session.")
        parent = self.root / "pending-logins"
        directory = parent / session_id
        credential = directory / "auth.json"
        if directory.is_symlink() or credential.is_symlink() or directory.resolve().parent != parent.resolve():
            raise ValueError("Invalid sign-in directory.")
        try:
            if credential.stat().st_size > 1048576:
                raise ValueError("Invalid sign-in data.")
            auth = json.loads(read_text_with_retry(credential))
            if not isinstance(auth, dict):
                raise ValueError("Invalid sign-in data.")
            email, identity, mode = self.switcher._identity_from_auth(auth)
        except (OSError, ValueError, ValidationError):
            raise ValueError("The sign-in did not create a compatible login. Try browser sign-in again.") from None
        if not email or mode != "chatgpt":
            raise ValueError("Sign in with a ChatGPT account to monitor subscription quota.")
        expected = params.get("expectedIdentity")
        actual = hashlib.sha256(f"{email}\0{identity}".encode()).hexdigest()[:16]
        if expected is not None and expected != actual:
            raise ValueError("That is a different account or workspace. Sign in to the account you chose to reconnect, or add it as a new account.")
        with FileLock(self.switcher.lock_file):
            self.switcher._setup_directories()
            target = self.switcher._read_sequence()
            existing = self.switcher._match_account_number(target["accounts"], email, identity)
            number = existing or self.switcher._next_number(target)
            self.switcher._write_json(self.switcher._credential_path(number), auth)
            target["accounts"][number] = {**target["accounts"].get(number, {}),
                "email": email, "accountId": identity, "authMode": mode,
                "planType": _plan_type_from_auth(auth), "added": iso(time.time()), "isolatedLogin": True}
            # Adding a login never writes the active Codex auth or selects it.
            self.switcher._write_sequence(target)
        self.switcher._usage_cache.pop(number, None)
        self.retry_at.pop(number, None)
        self.last_collect = 0
        return self.snapshot(False)

    def import_existing(self) -> dict:
        original = CodexAccountSwitcher()
        source = original._read_sequence()
        imported = 0
        with FileLock(self.switcher.lock_file):
            self.switcher._setup_directories()
            target = self.switcher._read_sequence()
            for number, record in source["accounts"].items():
                if imported >= 100:
                    break
                auth = original._read_account_auth(number)
                if auth is None:
                    continue
                email, identity, mode = self.switcher._identity_from_auth(auth)
                if not email:
                    continue
                existing = self.switcher._match_account_number(target["accounts"], email, identity)
                if existing is not None:
                    continue
                slot = self.switcher._next_number(target)
                self.switcher._write_json(self.switcher._credential_path(slot), auth)
                target["accounts"][slot] = {"email": email, "accountId": identity,
                    "authMode": mode, "planType": _plan_type_from_auth(auth),
                    "added": iso(time.time()), "disabled": bool(record.get("disabled"))}
                imported += 1
            self.switcher._write_sequence(target)
        return {"imported": imported, "snapshot": self.snapshot(False)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--codex-home", type=Path, help="Explicit Codex profile directory; used for isolated integration tests.")
    args = parser.parse_args()
    bridge = PulseBridge(args.data_dir, args.codex_home)
    for line in sys.stdin:
        request_id = None
        try:
            if len(line) > 65536:
                raise ValueError("Request is too large.")
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("Expected a request object.")
            request_id = request.get("id")
            params = request.get("params", {})
            if not isinstance(params, dict):
                raise ValueError("Expected operation parameters.")
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                result = bridge.dispatch(request.get("method", ""), params)
            response = {"id": request_id, "ok": True, "result": result}
        except (ConfigError, ValidationError, AccountNotFoundError, LockError, ValueError) as exc:
            response = {"id": request_id, "ok": False, "error": str(exc)}
        except Exception:
            response = {"id": request_id, "ok": False,
                        "error": "The account engine could not finish this operation. Your saved logins have been preserved."}
        print(json.dumps(response, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
