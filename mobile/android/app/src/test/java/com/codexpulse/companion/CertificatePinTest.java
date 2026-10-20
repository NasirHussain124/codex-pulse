package com.codexpulse.companion;
import org.junit.Test;
import java.security.MessageDigest;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import static org.junit.Assert.*;
public class CertificatePinTest {
    @Test public void exactLeafAcceptedAndDifferentPinRejected() throws Exception {
        X509Certificate cert;
        try (var input = getClass().getClassLoader().getResourceAsStream("pin-test.pem")) { cert = (X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(input); }
        String pin = java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()));
        CompanionClient.verifyPinnedCertificate(cert, pin);
        assertFalse(CompanionClient.pinMatches(cert, "00".repeat(32)));
        try { CompanionClient.verifyPinnedCertificate(cert, "00".repeat(32)); fail("Wrong certificate was accepted"); } catch (java.security.cert.CertificateException expected) { }
    }
}
