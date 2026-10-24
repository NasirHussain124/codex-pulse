package com.codexpulse.companion;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Handler;
import android.os.Looper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** A bounded locator for an ALREADY paired PC. Advertisements never grant trust. */
public final class PcDiscovery {
    private PcDiscovery() { }
    static String endpoint(NsdServiceInfo service, String expectedPin) {
        try {
            Map<String, byte[]> attributes = service.getAttributes();
            String version = new String(attributes.get("v"), StandardCharsets.UTF_8);
            String pin = new String(attributes.get("pin"), StandardCharsets.UTF_8);
            if (!"1".equals(version) || !expectedPin.equalsIgnoreCase(pin)) return null;
            String address = new String(attributes.get("address"), StandardCharsets.UTF_8);
            String url = "https://" + address + ":" + service.getPort();
            EndpointPolicy.validate(url);
            // DNS-SD is LAN-only. Remote access uses the enrolled direct endpoint.
            if (address.startsWith("100.")) return null;
            return url;
        } catch (Exception ignored) { return null; }
    }
    @SuppressWarnings("deprecation")
    public static String find(Context context, String expectedPin) {
        EndpointPolicy.validatePin(expectedPin);
        if (Looper.myLooper() == Looper.getMainLooper()) throw new IllegalStateException("Discovery must run off the UI thread.");
        NsdManager manager = context.getSystemService(NsdManager.class);
        if (manager == null) return null;
        Handler handler = new Handler(Looper.getMainLooper());
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> found = new AtomicReference<>();
        AtomicBoolean stopped = new AtomicBoolean(false), started = new AtomicBoolean(false), resolving = new AtomicBoolean(false);
        ArrayDeque<NsdServiceInfo> queue = new ArrayDeque<>();
        String name = "Quota-" + expectedPin.substring(0, 12).toLowerCase(java.util.Locale.ROOT);
        Runnable[] next = new Runnable[1];
        next[0] = () -> {
            if (stopped.get() || resolving.get() || queue.isEmpty()) return;
            resolving.set(true);
            NsdServiceInfo service = queue.removeFirst();
            try { manager.resolveService(service, new NsdManager.ResolveListener() {
                @Override public void onResolveFailed(NsdServiceInfo info, int error) { handler.post(() -> { resolving.set(false); next[0].run(); }); }
                @Override public void onServiceResolved(NsdServiceInfo info) { handler.post(() -> {
                    if (stopped.get()) return;
                    String endpoint = endpoint(info, expectedPin);
                    if (endpoint != null) { found.set(endpoint); done.countDown(); }
                    resolving.set(false); next[0].run();
                }); }
            }); } catch (RuntimeException error) { resolving.set(false); next[0].run(); }
        };
        NsdManager.DiscoveryListener listener = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String type) { started.set(true); if (stopped.get()) try { manager.stopServiceDiscovery(this); } catch (RuntimeException ignored) { } }
            @Override public void onStartDiscoveryFailed(String type, int error) { done.countDown(); }
            @Override public void onStopDiscoveryFailed(String type, int error) { }
            @Override public void onDiscoveryStopped(String type) { }
            @Override public void onServiceLost(NsdServiceInfo info) { }
            @Override public void onServiceFound(NsdServiceInfo info) { handler.post(() -> {
                if (!stopped.get() && info.getServiceName().startsWith(name) && queue.size() < 4) { queue.addLast(info); next[0].run(); }
            }); }
        };
        handler.post(() -> { if (!stopped.get()) try { manager.discoverServices("_quotamgmt._tcp.", NsdManager.PROTOCOL_DNS_SD, listener); } catch (RuntimeException error) { done.countDown(); } });
        try { done.await(6, TimeUnit.SECONDS); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
        finally { stopped.set(true); handler.post(() -> { queue.clear(); if (started.get()) try { manager.stopServiceDiscovery(listener); } catch (RuntimeException ignored) { } }); }
        return found.get();
    }
}
