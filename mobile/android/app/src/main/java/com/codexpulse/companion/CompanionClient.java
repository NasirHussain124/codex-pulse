package com.codexpulse.companion;

import android.content.Context;
import android.os.Build;
import android.util.Base64;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.Locale;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

public final class CompanionClient {
    private final PhoneStore store;
    public CompanionClient(Context context) { store = new PhoneStore(context); }
    static boolean pinMatches(X509Certificate cert, String expected) throws Exception {
        byte[] actual = MessageDigest.getInstance("SHA-256").digest(cert.getEncoded());
        byte[] pin = new byte[32]; for (int i = 0; i < 32; i++) pin[i] = (byte)Integer.parseInt(expected.substring(i * 2, i * 2 + 2), 16);
        return MessageDigest.isEqual(actual, pin);
    }
    static void verifyPinnedCertificate(X509Certificate cert, String pin) throws Exception {
        EndpointPolicy.validatePin(pin);
        if (!pinMatches(cert, pin)) throw new java.security.cert.CertificateException("PC certificate changed. Pair again on the PC.");
        cert.checkValidity();
    }
    // Intentional private trust anchor: exact SHA-256 leaf from a user-approved
    // QR plus certificate validity. No accept-all branch or global TLS changes.
    @android.annotation.SuppressLint("CustomX509TrustManager")
    private JSONObject request(JSONObject connection, String path, JSONObject body, String token) throws Exception {
        String endpoint = connection.getString("endpoint"), pin = connection.getString("fingerprint").toLowerCase(Locale.ROOT);
        URI base = EndpointPolicy.validate(endpoint); EndpointPolicy.validatePin(pin);
        SSLContext tls = SSLContext.getInstance("TLS");
        tls.init(null, new TrustManager[]{new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            public void checkClientTrusted(X509Certificate[] chain, String type) throws java.security.cert.CertificateException { throw new java.security.cert.CertificateException("Client certificate not supported."); }
            public void checkServerTrusted(X509Certificate[] chain, String type) throws java.security.cert.CertificateException {
                try { if (chain == null || chain.length == 0) throw new Exception(); verifyPinnedCertificate(chain[0], pin); }
                catch (Exception error) { throw new java.security.cert.CertificateException("PC certificate changed. Pair again on the PC."); }
            }
        }}, null);
        HttpsURLConnection socket = (HttpsURLConnection)new URL("https", base.getHost(), base.getPort(), path).openConnection();
        socket.setSSLSocketFactory(tls.getSocketFactory());
        // The QR is the trust anchor. Verify the exact leaf certificate, not a
        // public CA/DNS identity; this is never a global or trust-all bypass.
        socket.setHostnameVerifier((host, session) -> { try { return host.equals(base.getHost()) && pinMatches((X509Certificate)session.getPeerCertificates()[0], pin); } catch (Exception error) { return false; } });
        socket.setConnectTimeout(6000); socket.setReadTimeout(6000); socket.setInstanceFollowRedirects(false);
        socket.setRequestProperty("Accept", "application/json");
        if (token != null) socket.setRequestProperty("Authorization", "Bearer " + token);
        try {
            if (body != null) { socket.setRequestMethod("POST"); socket.setDoOutput(true); socket.setRequestProperty("Content-Type", "application/json"); try (var output = socket.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); } }
            int code = socket.getResponseCode();
            if (code == 401) throw new Exception("Pairing expired or access revoked. Pair again from your PC.");
            if (code != 200) throw new Exception("PC connection unavailable. Try again shortly.");
            try (InputStream input = socket.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] bytes = new byte[4096]; int count;
                while ((count = input.read(bytes)) != -1) { if (output.size() + count > 262144) throw new Exception("PC response too large."); output.write(bytes, 0, count); }
                return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
            }
        } finally { socket.disconnect(); }
    }
    public JSONObject decodePairing(String value) throws Exception {
        URI link = URI.create(value.trim());
        if (!"codexpulse".equals(link.getScheme()) || !"pair".equals(link.getHost()) || link.getRawQuery() == null || !link.getRawQuery().startsWith("data=") || value.length() > 3000) throw new Exception("Scan the pairing QR generated by Codex Pulse on your PC.");
        JSONObject pair = new JSONObject(new String(Base64.decode(link.getRawQuery().substring(5), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), StandardCharsets.UTF_8));
        if (pair.getInt("version") != 1 || !pair.getString("code").matches("[A-Za-z0-9_-]{43}")) throw new Exception("Invalid pairing link.");
        EndpointPolicy.validate(pair.getString("endpoint")); EndpointPolicy.validatePin(pair.getString("fingerprint"));
        return pair;
    }
    public void pair(JSONObject pair) throws Exception {
        JSONObject answer = request(pair, "/v1/pair", new JSONObject().put("code", pair.getString("code")).put("name", Build.MANUFACTURER + " " + Build.MODEL), null);
        if (!answer.getString("token").matches("[A-Za-z0-9_-]{43}")) throw new Exception("Invalid pairing response.");
        JSONObject connection = new JSONObject().put("endpoint", pair.getString("endpoint")).put("fingerprint", pair.getString("fingerprint")).put("token", answer.getString("token")).put("id", answer.getString("id"));
        store.write(new JSONObject().put("connection", connection)); refresh();
    }
    public JSONObject refresh() throws Exception {
        JSONObject connection = store.read().optJSONObject("connection");
        if (connection == null) throw new Exception("Pair your PC to see its usage readings.");
        try {
            JSONObject snapshot = request(connection, "/v1/snapshot", null, connection.getString("token"));
            if (snapshot.getInt("schemaVersion") != 1 || snapshot.getJSONArray("accounts").length() > 200) throw new Exception("Unsupported PC response.");
            synchronized (PhoneStore.class) { JSONObject data = store.read(); data.put("snapshot", snapshot).put("receivedAt", System.currentTimeMillis()).remove("error"); store.write(data); }
            return snapshot;
        } catch (Exception error) {
            String message = error instanceof javax.net.ssl.SSLException ? "PC certificate could not be verified. Check both devices’ clocks, then pair again from your PC. Do not bypass certificate protection." : error.getMessage() != null && error.getMessage().startsWith("Pairing expired") ? error.getMessage() : "PC offline or unreachable. Showing the last saved readings. Keep Pulse running and use the same private Wi-Fi.";
            synchronized (PhoneStore.class) { JSONObject data = store.read(); data.put("error", message); store.write(data); }
            throw new Exception(message);
        }
    }
}
