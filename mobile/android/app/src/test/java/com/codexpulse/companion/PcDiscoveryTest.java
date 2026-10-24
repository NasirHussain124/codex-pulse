package com.codexpulse.companion;
import android.net.nsd.NsdServiceInfo;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class PcDiscoveryTest {
    private NsdServiceInfo service(String address, String pin) {
        NsdServiceInfo result = new NsdServiceInfo(); result.setServiceName("Quota-abababababab"); result.setServiceType("_quotamgmt._tcp.");
        result.setPort(47831); result.setAttribute("v", "1"); result.setAttribute("pin", pin); result.setAttribute("address", address); return result;
    }
    @Test public void matchingPinLocatesPairedPcWithoutGrantingTrust() {
        assertEquals("https://192.168.1.7:47831", PcDiscovery.endpoint(service("192.168.1.7", "ab".repeat(32)), "ab".repeat(32)));
    }
    @Test public void unrelatedPcAndPublicEndpointsAreRejected() {
        assertNull(PcDiscovery.endpoint(service("192.168.1.7", "cd".repeat(32)), "ab".repeat(32)));
        assertNull(PcDiscovery.endpoint(service("8.8.8.8", "ab".repeat(32)), "ab".repeat(32)));
        assertNull(PcDiscovery.endpoint(service("100.90.1.7", "ab".repeat(32)), "ab".repeat(32)));
        assertNull(PcDiscovery.endpoint(service("example.com", "ab".repeat(32)), "ab".repeat(32)));
    }
    @Test public void badVersionsAndMissingAttributesFailClosed() {
        NsdServiceInfo invalid = service("192.168.1.7", "ab".repeat(32)); invalid.setAttribute("v", "2");
        assertNull(PcDiscovery.endpoint(invalid, "ab".repeat(32)));
        assertNull(PcDiscovery.endpoint(new NsdServiceInfo(), "ab".repeat(32)));
    }
}
