import json
from pathlib import Path
from types import SimpleNamespace
import sys
import time
import base64
from dataclasses import replace

import pytest
from claude_swap.exceptions import ConfigError
from claude_swap.usage_store import UsageEntry
from pulse_bridge import PulseBridge, SecureSwitcher, dpapi, public_account


def account(entry=None, kind="oauth"):
    return SimpleNamespace(number="1", email="test@example.com", org_uuid="workspace",
        org_name="Codex Pro", is_active=False, disabled=False, kind=kind,
        usage=entry or UsageEntry())


def test_missing_data_is_unknown_not_zero():
    row = public_account(account(), time.time())
    assert row["status"] == "unavailable"
    assert row["windows"] == []
    assert row["credits"] is None


def test_clamped_remaining_and_unknown_numbers():
    entry = UsageEntry(last_good={"weekly": {"pct": 140}, "five_hour": {"pct": float("nan")}}, fetched_at=time.time())
    row = public_account(account(entry), time.time())
    assert len(row["windows"]) == 1
    assert row["windows"][0]["remainingPercent"] == 0
    assert "access_token" not in json.dumps(row)


def test_stale_reading_survives_refresh_error():
    entry = UsageEntry(last_good={"weekly": {"pct": 25}}, fetched_at=time.time() - 700,
                       last_error="network error")
    row = public_account(account(entry), time.time())
    assert row["status"] == "stale"
    assert row["windows"][0]["remainingPercent"] == 75


def test_reconnect_does_not_expose_error_details():
    entry = UsageEntry(last_error="token expired: a-secret-value")
    row = public_account(account(entry), time.time())
    assert row["status"] == "reconnect"
    assert "a-secret-value" not in json.dumps(row)


@pytest.mark.skipif(sys.platform != "win32", reason="Windows vault")
def test_vault_roundtrip_without_plaintext_backups(tmp_path):
    switcher = SecureSwitcher(tmp_path / "pulse", tmp_path / "codex")
    value = {"tokens": {"access_token": "secret-access", "refresh_token": "secret-refresh"}}
    path = switcher._credential_path("1")
    switcher._write_json(path, value)
    assert "secret-access" not in path.read_text()
    assert "secret-refresh" not in path.read_text()
    assert switcher._read_account_auth("1") == value
    assert not list(path.parent.glob("*.tmp"))


def test_corrupt_roster_is_not_treated_as_empty(tmp_path):
    switcher = SecureSwitcher(tmp_path / "pulse", tmp_path / "codex")
    switcher.sequence_file.parent.mkdir(parents=True)
    switcher.sequence_file.write_text("corrupted")
    with pytest.raises(ConfigError):
        switcher._read_sequence()
    assert switcher.sequence_file.read_text() == "corrupted"


def test_snapshot_does_not_touch_codex_auth(tmp_path):
    home = tmp_path / "codex"
    home.mkdir()
    auth = home / "auth.json"
    auth.write_text('{"tokens": {"id_token": "dummy"}}')
    before = auth.read_bytes()
    bridge = PulseBridge(tmp_path / "pulse", home)
    assert bridge.snapshot(False)["accounts"] == []
    assert auth.read_bytes() == before
    assert not (tmp_path / "pulse" / "codex").exists()


def test_invalid_operation_cannot_select_a_path(tmp_path):
    bridge = PulseBridge(tmp_path / "pulse", tmp_path / "codex")
    with pytest.raises(ValueError):
        bridge.dispatch("remove", {"id": "../../other"})
    with pytest.raises(ValueError):
        bridge.dispatch("arbitraryMethod", {})


@pytest.mark.skipif(sys.platform != "win32", reason="Windows vault")
def test_damaged_vault_fails_closed():
    with pytest.raises(ConfigError):
        dpapi(b"not-a-windows-vault", decrypt=True)


def synthetic_auth(email, workspace):
    claims = {"email": email, "https://api.openai.com/auth": {"chatgpt_plan_type": "pro"}}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return {"auth_mode": "chatgpt", "tokens": {"id_token": f"header.{payload}.signature",
            "access_token": f"synthetic-access-{workspace}", "refresh_token": f"synthetic-refresh-{workspace}", "account_id": workspace}}


@pytest.mark.skipif(sys.platform != "win32", reason="Windows vault")
def test_two_accounts_switch_without_cross_contaminating_credentials(tmp_path):
    home = tmp_path / "codex"
    home.mkdir()
    auth_file = home / "auth.json"
    first = synthetic_auth("one@example.com", "same-workspace")
    second = synthetic_auth("two@example.com", "same-workspace")
    bridge = PulseBridge(tmp_path / "pulse", home)
    auth_file.write_text(json.dumps(first))
    bridge.dispatch("addCurrent", {})
    auth_file.write_text(json.dumps(second))
    saved = bridge.dispatch("addCurrent", {})
    assert len(saved["accounts"]) == 2
    assert "synthetic-access" not in json.dumps(saved)
    bridge.dispatch("switch", {"id": "1"})
    assert json.loads(auth_file.read_text()) == first
    assert bridge.switcher._read_account_auth("2") == second
    selected = bridge.snapshot(False)
    assert [a["id"] for a in selected["accounts"] if a["selected"]] == ["1"]
    before = auth_file.read_bytes()
    bridge.dispatch("remove", {"id": "1"})
    assert auth_file.read_bytes() == before
    assert bridge.switcher._read_account_auth("2") == second


@pytest.mark.skipif(sys.platform != "win32", reason="Windows vault")
def test_failed_network_retains_measurement_and_applies_backoff(tmp_path, monkeypatch):
    import claude_swap.codex as codex
    from claude_swap.codex_usage import CodexUsageError
    home = tmp_path / "codex"
    home.mkdir()
    (home / "auth.json").write_text(json.dumps(synthetic_auth("one@example.com", "workspace")))
    bridge = PulseBridge(tmp_path / "pulse", home)
    bridge.dispatch("addCurrent", {})
    calls = []
    def good_fetch(auth, **kwargs):
        calls.append(True)
        return {"weekly": {"pct": 20}}
    monkeypatch.setattr(codex, "fetch_codex_usage", good_fetch)
    first = bridge.snapshot(True)
    assert first["accounts"][0]["windows"][0]["remainingPercent"] == 80
    bridge.snapshot(True)
    assert len(calls) == 1
    bridge.last_collect = 0
    bridge.retry_at["1"] = 0
    bridge.switcher._usage_cache["1"] = replace(bridge.switcher._usage_cache["1"], fetched_at=time.time() - 1000)
    def failed_fetch(auth, **kwargs):
        calls.append(False)
        raise CodexUsageError("network is unavailable")
    monkeypatch.setattr(codex, "fetch_codex_usage", failed_fetch)
    stale = bridge.snapshot(True)
    assert stale["accounts"][0]["status"] == "stale"
    assert stale["accounts"][0]["windows"][0]["remainingPercent"] == 80
    assert bridge.retry_at["1"] > time.time()


@pytest.mark.skipif(sys.platform != "win32", reason="Windows vault")
def test_reused_slot_cannot_restore_another_identitys_cached_quota(tmp_path):
    home = tmp_path / "codex"
    home.mkdir()
    (home / "auth.json").write_text(json.dumps(synthetic_auth("new@example.com", "new")))
    bridge = PulseBridge(tmp_path / "pulse", home)
    bridge.dispatch("addCurrent", {})
    (bridge.root / "readings.json").write_text(json.dumps({"accounts": {"1": {
        "usage": {"weekly": {"pct": 0}}, "at": time.time(), "identity": "someone-else"}}}))
    restarted = PulseBridge(tmp_path / "pulse", home)
    assert restarted.snapshot(False)["accounts"][0]["windows"] == []


@pytest.mark.skipif(sys.platform != "win32", reason="Windows vault")
def test_isolated_login_imports_multiple_accounts_without_changing_active(tmp_path):
    import uuid
    home = tmp_path / "codex"
    home.mkdir()
    (home / "auth.json").write_text(json.dumps(synthetic_auth("active@example.com", "active")))
    before = (home / "auth.json").read_bytes()
    bridge = PulseBridge(tmp_path / "pulse", home)
    for email in ["one@example.com", "two@example.com", "one@example.com"]:
        session = str(uuid.uuid4())
        pending = bridge.root / "pending-logins" / session
        pending.mkdir(parents=True)
        (pending / "auth.json").write_text(json.dumps(synthetic_auth(email, "shared")))
        result = bridge.dispatch("importLogin", {"sessionId": session})
    assert len(result["accounts"]) == 2
    assert not any(a["selected"] for a in result["accounts"])
    assert "synthetic-access" not in json.dumps(result)
    assert (home / "auth.json").read_bytes() == before


def test_login_import_rejects_paths_and_wrong_reconnect_without_writing(tmp_path):
    import uuid
    bridge = PulseBridge(tmp_path / "pulse", tmp_path / "codex")
    with pytest.raises(ValueError):
        bridge.dispatch("importLogin", {"sessionId": "../../outside"})
    session = str(uuid.uuid4())
    pending = bridge.root / "pending-logins" / session
    pending.mkdir(parents=True)
    (pending / "auth.json").write_text(json.dumps(synthetic_auth("wrong@example.com", "shared")))
    with pytest.raises(ValueError, match="different account"):
        bridge.dispatch("importLogin", {"sessionId": session, "expectedIdentity": "wrong-identity"})
    assert not bridge.switcher.sequence_file.exists()


@pytest.mark.skipif(sys.platform != "win32", reason="Windows vault")
def test_independent_reconnect_reads_new_auth_and_can_apply_it_explicitly(tmp_path, monkeypatch):
    import uuid
    import claude_swap.codex as codex
    home = tmp_path / "codex"
    home.mkdir()
    original = synthetic_auth("one@example.com", "shared")
    (home / "auth.json").write_text(json.dumps(original))
    bridge = PulseBridge(tmp_path / "pulse", home)
    bridge.dispatch("addCurrent", {})
    session = str(uuid.uuid4())
    pending = bridge.root / "pending-logins" / session
    pending.mkdir(parents=True)
    reconnected = synthetic_auth("one@example.com", "shared")
    reconnected["tokens"]["access_token"] = "new-independent-access"
    reconnected["tokens"]["refresh_token"] = "new-independent-refresh"
    (pending / "auth.json").write_text(json.dumps(reconnected))
    result = bridge.dispatch("importLogin", {"sessionId": session})
    assert result["accounts"][0]["pendingLogin"] is True
    assert json.loads((home / "auth.json").read_text()) == original
    calls = []
    def fetch(auth, **kwargs):
        calls.append(auth)
        return {"weekly": {"pct": 15}}
    monkeypatch.setattr(codex, "fetch_codex_usage", fetch)
    assert bridge.snapshot(True)["accounts"][0]["windows"][0]["remainingPercent"] == 85
    assert calls == [reconnected]
    bridge.dispatch("switch", {"id": "1"})
    assert json.loads((home / "auth.json").read_text()) == reconnected
    assert bridge.snapshot(False)["accounts"][0]["pendingLogin"] is False


@pytest.mark.skipif(sys.platform != "win32", reason="Windows vault")
def test_switch_away_preserves_independent_reconnected_backup(tmp_path):
    home = tmp_path / "codex"
    home.mkdir()
    first = synthetic_auth("one@example.com", "first")
    second = synthetic_auth("two@example.com", "second")
    (home / "auth.json").write_text(json.dumps(first))
    bridge = PulseBridge(tmp_path / "pulse", home)
    bridge.dispatch("addCurrent", {})
    (home / "auth.json").write_text(json.dumps(second))
    bridge.dispatch("addCurrent", {})
    (home / "auth.json").write_text(json.dumps(first))
    updated = {**first, "tokens": {**first["tokens"], "refresh_token": "independent-refresh"}}
    bridge.switcher._write_json(bridge.switcher._credential_path("1"), updated)
    roster = bridge.switcher._read_sequence()
    roster["accounts"]["1"]["isolatedLogin"] = True
    bridge.switcher._write_sequence(roster)
    bridge.dispatch("switch", {"id": "2"})
    assert bridge.switcher._read_account_auth("1") == updated
    assert json.loads((home / "auth.json").read_text()) == second


@pytest.mark.skipif(sys.platform != "win32", reason="Windows vault")
def test_refresh_never_consumes_a_token_owned_by_live_codex(tmp_path, monkeypatch):
    import pulse_bridge
    home = tmp_path / "codex"
    home.mkdir()
    auth = synthetic_auth("one@example.com", "shared")
    (home / "auth.json").write_text(json.dumps(auth))
    bridge = PulseBridge(tmp_path / "pulse", home)
    bridge.dispatch("addCurrent", {})
    roster = bridge.switcher._read_sequence()
    roster["accounts"]["1"]["isolatedLogin"] = True
    bridge.switcher._write_sequence(roster)
    calls = []
    monkeypatch.setattr(pulse_bridge, "refresh_codex_auth", lambda auth: calls.append(auth))
    assert bridge.switcher._refresh_inactive_auth("1", auth) is None
    assert not calls
    independent = {**auth, "tokens": {**auth["tokens"], "refresh_token": "separate-refresh"}}
    refreshed = {**independent, "tokens": {**independent["tokens"], "refresh_token": "rotated-refresh"}}
    bridge.switcher._write_json(bridge.switcher._credential_path("1"), independent)
    monkeypatch.setattr(pulse_bridge, "refresh_codex_auth", lambda auth: refreshed)
    assert bridge.switcher._refresh_inactive_auth("1", independent) == refreshed
    assert json.loads((home / "auth.json").read_text()) == auth
