package com.codexpulse.companion;

import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

final class QuotaText {
    static JSONObject window(JSONObject account, int duration) {
        if ("reconnect".equals(account.optString("status"))) return null;
        JSONArray windows = account.optJSONArray("windows");
        if (windows != null) for (int i = 0; i < windows.length(); i++) { JSONObject window = windows.optJSONObject(i); if (window != null && window.optInt("durationMinutes") == duration) return window; }
        return null;
    }
    static int percent(JSONObject window) {
        double value = window == null ? Double.NaN : window.optDouble("remainingPercent", Double.NaN);
        return Double.isFinite(value) && value >= 0 && value <= 100 ? (int)Math.round(value) : -1;
    }
    static String reset(JSONObject window) {
        try {
            long minutes = (long)Math.ceil((Instant.parse(window.getString("resetsAt")).toEpochMilli() - System.currentTimeMillis()) / 60000.0);
            if (minutes <= 0) return "Reset due · waiting for PC reading";
            return "Resets in " + (minutes >= 1440 ? minutes / 1440 + "d " + minutes % 1440 / 60 + "h" : minutes >= 60 ? minutes / 60 + "h " + minutes % 60 + "m" : minutes + "m");
        } catch (Exception error) { return "Reset not reported"; }
    }
    static boolean stale(JSONObject account) {
        try { return !"ready".equals(account.optString("status")) || System.currentTimeMillis() - Instant.parse(account.getString("fetchedAt")).toEpochMilli() > 300000; } catch (Exception error) { return true; }
    }
    static String observed(JSONObject account) {
        try { return "Reading " + DateTimeFormatter.ofPattern("MMM d, HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(account.getString("fetchedAt"))); } catch (Exception error) { return "No reading yet"; }
    }
}
