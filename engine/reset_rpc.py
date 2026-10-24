"""Narrow stdio client for the official Codex earned-reset protocol.

No prompts, turns, refresh tokens, live auth writes, arbitrary RPC methods or
listening sockets. The caller owns credentials; the child receives only the
short-lived access token in memory. Protocol failures never echo raw output.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import queue
import subprocess
import tempfile
import threading
import time


class ResetError(ValueError):
    pass


class ResetRPC:
    def __init__(self, executable: str, tokens: dict, *, launch=subprocess.Popen, timeout=30):
        file = Path(executable)
        if not file.is_absolute() or file.name.lower() != "codex.exe" or not file.is_file():
            raise ResetError("Install the official Codex CLI to review earned resets.")
        access, account = tokens.get("access_token"), tokens.get("account_id")
        if not isinstance(access, str) or not access or not isinstance(account, str) or not account:
            raise ResetError("Reconnect this ChatGPT login before reviewing resets.")
        self.timeout, self.sequence = timeout, 0
        self.messages = queue.Queue(maxsize=256)
        self.directory = tempfile.TemporaryDirectory(prefix="quota-reset-")
        self.child = None
        try:
            self.child = launch([str(file), "app-server", "--listen", "stdio://", "-c", 'cli_auth_credentials_store="file"'],
                cwd=self.directory.name, env={**os.environ, "CODEX_HOME": self.directory.name, "NO_COLOR": "1"},
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            threading.Thread(target=self._read, daemon=True).start()
            self.call("initialize", {"clientInfo": {"name": "quota_management", "title": "Quota management", "version": "0.6.0"},
                "capabilities": {"experimentalApi": True}})
            self._send({"method": "initialized", "params": {}})
            self.call("account/login/start", {"type": "chatgptAuthTokens", "accessToken": access, "chatgptAccountId": account})
        except Exception:
            self.close()
            raise ResetError("The installed Codex CLI could not initialize reset review. Update Codex, refresh this account, and try again.") from None

    def _read(self):
        try:
            while True:
                line = self.child.stdout.readline(2097153)
                if not line or len(line) > 2097152:
                    break
                self.messages.put_nowait(json.loads(line))
        except (OSError, ValueError, queue.Full):
            pass
        try:
            self.messages.put_nowait(None)
        except queue.Full:
            pass

    def _send(self, message):
        self.child.stdin.write((json.dumps(message, allow_nan=False) + "\n").encode())
        self.child.stdin.flush()

    def call(self, method, params=None):
        if method not in {"initialize", "account/login/start", "account/rateLimits/read", "account/rateLimitResetCredit/consume"}:
            raise ResetError("Unsupported reset operation.")
        self.sequence += 1
        request_id = self.sequence
        self._send({"id": request_id, "method": method, "params": params or {}})
        deadline = time.monotonic() + self.timeout
        while True:
            try:
                message = self.messages.get(timeout=max(0, deadline - time.monotonic()))
            except queue.Empty:
                raise ResetError("Reset review timed out. If you confirmed redemption, retry the same credit to check that attempt safely.") from None
            if not isinstance(message, dict):
                raise ResetError("The reset connection closed. Refresh and retry the same credit if redemption was confirmed.")
            if message.get("id") == request_id and "method" not in message:
                if "error" in message:
                    raise ResetError("Codex could not complete the reset request. Check your login and installed CLI version, then retry the same credit.")
                return message.get("result", {})
            if "method" in message and "id" in message:
                # Never approve a tool, model turn, credential refresh, or any
                # other server action as a side effect of quota review.
                self._send({"id": message["id"], "error": {"code": -32601, "message": "Quota review only; refresh the saved login in the host."}})
            if time.monotonic() >= deadline:
                raise ResetError("Reset review timed out. Refresh the account and retry.")

    def close(self):
        if self.child is not None:
            if self.child.poll() is None:
                self.child.kill()
            try:
                self.child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
            for stream in (self.child.stdin, self.child.stdout):
                if stream:
                    stream.close()
        self.directory.cleanup()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None


def timestamp(value):
    # The protocol uses Unix seconds, including credit expiry (nullable).
    value = number(value)
    try:
        return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z") if value is not None else None
    except (ValueError, OverflowError, OSError):
        return None


def public_review(result):
    if not isinstance(result, dict):
        raise ResetError("Codex returned an unsupported quota response.")
    raw = result.get("rateLimitResetCredits")
    count = number(raw.get("availableCount")) if isinstance(raw, dict) else None
    count = int(count) if count is not None and 0 <= count <= 9007199254740991 and int(count) == count else None
    details = raw.get("credits") if isinstance(raw, dict) else None
    credits = []
    if isinstance(details, list):
        for credit in details[:100]:
            if not isinstance(credit, dict) or not isinstance(credit.get("id"), str) or not 0 < len(credit["id"]) <= 512:
                continue
            if credit.get("status") != "available" or credit.get("resetType") != "codexRateLimits":
                continue
            credits.append({"id": credit["id"], "expiresAt": timestamp(credit.get("expiresAt")),
                "title": "Codex quota reset"})
    credits.sort(key=lambda c: c["expiresAt"] or "9999")
    buckets = result.get("rateLimitsByLimitId")
    bucket = buckets.get("codex") if isinstance(buckets, dict) else result.get("rateLimits")
    windows = []
    for name in ("primary", "secondary"):
        row = bucket.get(name) if isinstance(bucket, dict) else None
        if not isinstance(row, dict):
            continue
        used, minutes = number(row.get("usedPercent")), number(row.get("windowDurationMins"))
        if used is None or minutes is None or not 0 <= used <= 100 or minutes <= 0:
            continue
        windows.append({"durationMinutes": minutes, "remainingPercent": round(100 - used, 2), "resetsAt": timestamp(row.get("resetsAt"))})
    return {"available": count, "detailsKnown": isinstance(details, list), "credits": credits, "windows": windows,
        "readAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
