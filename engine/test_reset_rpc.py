import io
import json
from pathlib import Path
import queue
import time
import uuid

import pytest

from reset_rpc import ResetError, ResetRPC, public_review, timestamp
from pulse_bridge import PulseBridge
from test_bridge import synthetic_auth


def response(count=2, remaining=0):
    return {"rateLimitResetCredits": {"availableCount": count, "credits": [
        {"id": "later", "resetType": "codexRateLimits", "status": "available", "expiresAt": 2000000000},
        {"id": "sooner", "resetType": "codexRateLimits", "status": "available", "expiresAt": 1990000000},
        {"id": "unknown", "resetType": "unknown", "status": "available", "expiresAt": None},
        {"id": "redeemed", "resetType": "codexRateLimits", "status": "redeemed", "expiresAt": None},
    ]}, "rateLimitsByLimitId": {"codex": {
        "primary": {"usedPercent": 100 - remaining, "windowDurationMins": 300, "resetsAt": 2000000000},
        "secondary": {"usedPercent": 20, "windowDurationMins": 10080, "resetsAt": None}}},
        "access_token": "must-not-leak"}


def test_reset_projection_uses_authoritative_count_and_exact_expiries():
    data = public_review(response())
    assert data["available"] == 2
    assert data["detailsKnown"] is True
    assert [c["id"] for c in data["credits"]] == ["sooner", "later"]
    assert data["credits"][0]["expiresAt"] == timestamp(1990000000)
    assert data["windows"][0]["remainingPercent"] == 0
    assert "must-not-leak" not in json.dumps(data)


def test_count_only_is_different_from_zero_details_or_unknown():
    assert public_review({})["available"] is None
    count = public_review({"rateLimitResetCredits": {"availableCount": 6, "credits": None}})
    assert count["available"] == 6 and not count["detailsKnown"]
    zero = public_review({"rateLimitResetCredits": {"availableCount": 0, "credits": []}})
    assert zero["detailsKnown"] and zero["credits"] == []
    for value in [True, -1, 2.5, "5", float("nan")]:
        assert public_review({"rateLimitResetCredits": {"availableCount": value}})["available"] is None
    assert timestamp(True) is None and timestamp(1e30) is None


class FakeOutput:
    def __init__(self):
        self.queue = queue.Queue()

    def readline(self, _):
        return self.queue.get()

    def close(self):
        pass


class FakeChild:
    def __init__(self):
        self.stdout = FakeOutput()
        self.requests = []
        self.stdin = self
        self.closed = False
        self.error = False

    def write(self, data):
        message = json.loads(data)
        self.requests.append(message)
        if "method" in message and "id" in message:
            result = {"id": message["id"], "result": response()}
            if self.error:
                result = {"id": message["id"], "error": {"message": "secret-server-token"}}
            self.stdout.queue.put((json.dumps(result) + "\n").encode())

    def flush(self):
        pass

    def close(self):
        pass

    def kill(self):
        self.closed = True
        self.stdout.queue.put(b"")

    def poll(self):
        return 0 if self.closed else None

    def wait(self, timeout):
        return 0


def test_rpc_has_narrow_methods_memory_only_access_token_and_cleanup(tmp_path):
    executable = tmp_path / "codex.exe"
    executable.write_bytes(b"synthetic")
    child = FakeChild()
    calls = []
    def launch(*args, **kwargs):
        calls.append((args, kwargs))
        return child
    with ResetRPC(str(executable), {"access_token": "access-test", "account_id": "workspace", "refresh_token": "never-send"}, launch=launch) as rpc:
        rpc.call("account/rateLimits/read")
        with pytest.raises(ResetError, match="Unsupported"):
            rpc.call("turn/start", {})
        child.error = True
        with pytest.raises(ResetError) as error:
            rpc.call("account/rateLimits/read")
        assert "secret-server-token" not in str(error.value)
        home = Path(calls[0][1]["env"]["CODEX_HOME"])
        assert not (home / "auth.json").exists()
    assert not home.exists() and child.closed
    assert "never-send" not in json.dumps(child.requests)
    assert "--listen" in calls[0][0][0] and "stdio://" in calls[0][0][0]
    assert "shell" not in calls[0][1]
    login = next(m for m in child.requests if m.get("method") == "account/login/start")
    assert login["params"]["type"] == "chatgptAuthTokens"
    assert set(login["params"]) == {"type", "accessToken", "chatgptAccountId"}


def setup_bridge(tmp_path, monkeypatch, *, after=None):
    home = tmp_path / "live"
    home.mkdir()
    auth = home / "auth.json"
    auth.write_text(json.dumps(synthetic_auth("reset@example.test", "workspace")))
    bridge = PulseBridge(tmp_path / "vault", home)
    saved = bridge.dispatch("addCurrent", {})
    identity = saved["accounts"][0]["identity"]
    calls = []
    class RPC:
        def __init__(self, executable, tokens):
            assert tokens["account_id"] == "workspace"
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def call(self, method, params=None):
            calls.append((method, params))
            if method.endswith("consume"):
                return {"outcome": "reset"}
            return after if after and any(m.endswith("consume") for m, _ in calls) else response()
    monkeypatch.setattr("pulse_bridge.ResetRPC", RPC)
    return bridge, {"id": "1", "expectedIdentity": identity, "executable": "synthetic-codex.exe"}, calls, auth


def test_redemption_checks_identity_exact_credit_and_actual_post_reading(tmp_path, monkeypatch):
    after = response(count=1, remaining=57)
    bridge, params, calls, auth = setup_bridge(tmp_path, monkeypatch, after=after)
    original = auth.read_bytes()
    attempt = str(uuid.uuid4())
    result = bridge.dispatch("resetConsume", {**params, "creditId": "sooner", "attemptId": attempt})
    assert result["outcome"] == "reset"
    assert result["snapshot"]["accounts"][0]["windows"][0]["remainingPercent"] == 57
    assert [m for m, _ in calls] == ["account/rateLimits/read", "account/rateLimitResetCredit/consume", "account/rateLimits/read"]
    assert calls[1][1] == {"creditId": "sooner", "idempotencyKey": attempt}
    assert auth.read_bytes() == original
    assert "synthetic-access" not in json.dumps(result)
    restarted = PulseBridge(bridge.root, auth.parent)
    assert restarted.snapshot(False)["accounts"][0]["windows"][0]["remainingPercent"] == 57


def test_unavailable_credit_or_changed_identity_cannot_be_redeemed(tmp_path, monkeypatch):
    bridge, params, calls, _ = setup_bridge(tmp_path, monkeypatch)
    with pytest.raises(ResetError, match="no longer available"):
        bridge.dispatch("resetConsume", {**params, "creditId": "not-known", "attemptId": str(uuid.uuid4())})
    assert not any(m.endswith("consume") for m, _ in calls)
    calls.clear()
    with pytest.raises(ResetError, match="account changed"):
        bridge.dispatch("resetReview", {**params, "expectedIdentity": "wrong"})
    assert calls == []


def test_retry_uses_same_explicit_credit_even_if_no_longer_in_available_list(tmp_path, monkeypatch):
    bridge, params, calls, _ = setup_bridge(tmp_path, monkeypatch)
    attempt = str(uuid.uuid4())
    bridge.dispatch("resetConsume", {**params, "creditId": "previously-confirmed", "attemptId": attempt, "retry": True})
    assert calls[0] == ("account/rateLimitResetCredit/consume", {"creditId": "previously-confirmed", "idempotencyKey": attempt})


def test_unknown_redemption_does_not_infer_new_quota(tmp_path, monkeypatch):
    bridge, params, calls, _ = setup_bridge(tmp_path, monkeypatch)
    class BrokenRPC:
        def __init__(self, *_): pass
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def call(self, method, params=None):
            return {"outcome": "mystery"} if method.endswith("consume") else response()
    monkeypatch.setattr("pulse_bridge.ResetRPC", BrokenRPC)
    with pytest.raises(ResetError, match="unknown"):
        bridge.dispatch("resetConsume", {**params, "creditId": "sooner", "attemptId": str(uuid.uuid4())})
    assert bridge.snapshot(False)["accounts"][0]["windows"] == []
