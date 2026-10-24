package com.codexpulse.companion;

import org.json.JSONArray;
import org.json.JSONObject;
import java.text.NumberFormat;
import java.time.Instant;

/** Read-only native provider semantics; never substitute Codex 5h/7d windows. */
final class ProviderText {
    static String name(String provider) {
        switch (provider) { case "copilot": return "GitHub Copilot"; case "claude": return "Claude API"; case "cursor": return "Cursor team"; case "gemini": return "Gemini API"; default: return "Provider report"; }
    }
    static boolean supported(String provider) { return provider.equals("copilot") || provider.equals("claude") || provider.equals("cursor") || provider.equals("gemini"); }
    static boolean stale(JSONObject connection, boolean offline) {
        if (offline || !"ready".equals(connection.optString("status"))) return true;
        try {
            long age = System.currentTimeMillis() - Instant.parse(connection.getString("fetchedAt")).toEpochMilli();
            long interval = "cursor".equals(connection.optString("provider")) ? 7200000 : 600000;
            return age < -60000 || age > interval;
        } catch (Exception error) { return true; }
    }
    static int percent(JSONObject quota) { return quota.optBoolean("unlimited") ? -1 : QuotaText.percent(quota); }
    static String quotaValue(JSONObject quota) { int percent = percent(quota); return quota.optBoolean("unlimited") ? "Unlimited entitlement" : percent < 0 ? "Not reported" : percent + "% left"; }
    static String metricValue(JSONObject metric) {
        Object value = metric.opt("value");
        if (value == null || value == JSONObject.NULL) return "Not reported";
        if ("USD".equals(metric.optString("unit"))) return value instanceof String && ((String)value).matches("[0-9]{1,20}\\.[0-9]{2}") ? "$" + value : "Not reported";
        if (value instanceof Number) { double number = ((Number)value).doubleValue(); return Double.isFinite(number) && number >= 0 ? NumberFormat.getNumberInstance().format(number) : "Not reported"; }
        return value instanceof String ? clean((String)value, 120) : "Not reported";
    }
    static String clean(String value, int max) { String text = value.replaceAll("[\\p{Cntrl}]", ""); return text.substring(0, Math.min(text.length(), max)); }
    static void validateSnapshot(JSONObject snapshot) throws Exception {
        if (snapshot.getInt("schemaVersion") != 1 || snapshot.getJSONArray("accounts").length() > 200) throw new Exception("Unsupported PC response.");
        if (!snapshot.has("providers")) return; // Existing PCs remain compatible.
        JSONArray rows = snapshot.getJSONArray("providers");
        if (rows.length() > 20) throw new Exception("Unsupported provider report.");
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.getJSONObject(i), report = row.getJSONObject("report");
            if (!supported(row.getString("provider")) || row.optString("label").length() > 48 || report.getJSONArray("quotas").length() > 12 || report.getJSONArray("metrics").length() > 6 || report.getJSONArray("notes").length() > 2) throw new Exception("Unsupported provider report.");
        }
    }
}
