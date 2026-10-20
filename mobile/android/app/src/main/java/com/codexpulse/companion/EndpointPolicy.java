package com.codexpulse.companion;

import java.net.URI;

public final class EndpointPolicy {
    private EndpointPolicy() { }
    public static URI validate(String endpoint) {
        URI uri;
        try { uri = URI.create(endpoint); } catch (Exception error) { throw new IllegalArgumentException("Invalid PC address."); }
        String host = uri.getHost();
        if (!"https".equals(uri.getScheme()) || host == null || uri.getRawUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null || uri.getPort() < 1 || uri.getPort() > 65535 || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) throw new IllegalArgumentException("Pairing requires a private HTTPS PC address.");
        String[] octets = host.split("\\.");
        if (octets.length != 4) throw new IllegalArgumentException("Use a private IPv4 address from Pulse.");
        int[] ip = new int[4];
        for (int i = 0; i < 4; i++) {
            if (!octets[i].matches("0|[1-9][0-9]{0,2}")) throw new IllegalArgumentException("Invalid private address.");
            ip[i] = Integer.parseInt(octets[i]); if (ip[i] > 255) throw new IllegalArgumentException("Invalid private address.");
        }
        if (!(ip[0] == 10 || ip[0] == 192 && ip[1] == 168 || ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31)) throw new IllegalArgumentException("This version pairs only over your private network.");
        return uri;
    }
    public static void validatePin(String pin) {
        if (pin == null || !pin.matches("[a-fA-F0-9]{64}")) throw new IllegalArgumentException("The QR certificate fingerprint is invalid.");
    }
}
