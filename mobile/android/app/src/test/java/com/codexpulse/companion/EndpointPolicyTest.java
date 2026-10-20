package com.codexpulse.companion;
import org.junit.Test;
import static org.junit.Assert.*;
public class EndpointPolicyTest {
    @Test public void permitsPrivateHttpsOnly() { for (String ip : new String[]{"10.0.0.2", "192.168.1.9", "172.16.1.1", "172.31.0.1"}) assertEquals(ip, EndpointPolicy.validate("https://" + ip + ":47831").getHost()); }
    @Test public void rejectsUnsafeEndpoints() {
        for (String endpoint : new String[]{"http://192.168.1.1:47831", "https://8.8.8.8:443", "https://example.com:443", "https://192.168.1.9:443/path", "https://user@192.168.1.9:443", "https://172.32.0.1:443", "https://192.168.999.1:443", "https://127.0.0.1:443", "https://192.168.1.1:443#x", "https://192.168.1.1:443?x=1"}) { try { EndpointPolicy.validate(endpoint); fail(endpoint); } catch (IllegalArgumentException expected) { } }
    }
    @Test public void validatesExactSha256Pin() { EndpointPolicy.validatePin("ab".repeat(32)); for (String pin : new String[]{"", "ab".repeat(31), "gg".repeat(32)}) { try { EndpointPolicy.validatePin(pin); fail(pin); } catch (IllegalArgumentException expected) { } } }
}
