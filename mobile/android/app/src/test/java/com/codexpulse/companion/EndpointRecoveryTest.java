package com.codexpulse.companion;

import static org.junit.Assert.*;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.SSLException;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class EndpointRecoveryTest {
    private JSONObject connection(String endpoint) throws Exception {
        return new JSONObject().put("endpoint", endpoint).put("fingerprint", "ab".repeat(32)).put("token", "private-token").put("id", "paired-device");
    }
    @Test public void unavailableLanFindsPcWithoutChangingPinTokenOrOriginalConnection() throws Exception {
        JSONObject original = connection("https://192.168.1.2:47831"); AtomicInteger calls = new AtomicInteger();
        EndpointRecovery.Result result = EndpointRecovery.fetch(original, candidate -> {
            if (calls.getAndIncrement() == 0) throw new IOException("old IP gone");
            assertEquals(original.getString("fingerprint"), candidate.getString("fingerprint"));
            assertEquals(original.getString("token"), candidate.getString("token"));
            assertEquals(original.getString("id"), candidate.getString("id"));
            return new JSONObject().put("schemaVersion", 1);
        }, pin -> "https://192.168.1.8:47831");
        assertEquals("https://192.168.1.8:47831", result.connection.getString("endpoint"));
        assertEquals("https://192.168.1.2:47831", original.getString("endpoint"));
        assertEquals(2, calls.get());
    }
    @Test public void oldAddressReassignedToDifferentTlsHostCanLocateOriginalPcButCannotBypassPin() throws Exception {
        JSONObject original = connection("https://192.168.1.2:47831"); AtomicInteger calls = new AtomicInteger();
        try {
            EndpointRecovery.fetch(original, candidate -> { calls.incrementAndGet(); throw new SSLException("wrong TLS identity"); }, pin -> "https://192.168.1.8:47831");
            fail("A different certificate must not be accepted");
        } catch (SSLException expected) { assertEquals(2, calls.get()); }
        assertEquals("https://192.168.1.2:47831", original.getString("endpoint"));
    }
    @Test public void revokedTokenOrRemoteEndpointNeverStartsLanDiscovery() throws Exception {
        AtomicInteger discoveries = new AtomicInteger();
        for (boolean remote : new boolean[]{false, true}) {
            try {
                EndpointRecovery.fetch(connection(remote ? "https://100.90.0.2:47831" : "https://192.168.1.2:47831"), candidate -> {
                    if (remote) throw new IOException("Tailscale offline");
                    throw new Exception("Pairing expired or access revoked");
                }, pin -> { discoveries.incrementAndGet(); return null; });
                fail("Expected offline or revoked state");
            } catch (Exception expected) { assertEquals(0, discoveries.get()); }
        }
    }
    @Test public void aPublicOrRemoteDiscoveryCandidateIsNeverContacted() throws Exception {
        for (String endpoint : new String[]{"https://8.8.8.8:47831", "https://100.90.0.2:47831", "https://evil.test:47831"}) {
            AtomicInteger calls = new AtomicInteger();
            try {
                EndpointRecovery.fetch(connection("https://192.168.1.2:47831"), candidate -> { calls.incrementAndGet(); throw new IOException("old IP gone"); }, pin -> endpoint);
                fail("Untrusted discovery location");
            } catch (Exception expected) { assertEquals(1, calls.get()); }
        }
    }
}
