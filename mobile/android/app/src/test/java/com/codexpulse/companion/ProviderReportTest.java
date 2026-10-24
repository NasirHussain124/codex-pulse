package com.codexpulse.companion;

import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class ProviderReportTest {
    private String text(View view) {
        if (view instanceof TextView) return ((TextView)view).getText().toString();
        StringBuilder value = new StringBuilder(); if (view instanceof ViewGroup) { ViewGroup group = (ViewGroup)view; for (int i = 0; i < group.getChildCount(); i++) value.append(text(group.getChildAt(i))).append(' '); } return value.toString();
    }
    private JSONObject report(String provider) throws Exception {
        return new JSONObject().put("provider", provider).put("label", "Synthetic workspace").put("status", "ready").put("fetchedAt", java.time.Instant.now().toString())
            .put("report", new JSONObject().put("scope", "organization").put("complete", true).put("quotas", new JSONArray()).put("metrics", new JSONArray()).put("notes", new JSONArray()));
    }
    @Test public void olderSnapshotRemainsCompatibleAndProviderCountsAreBounded() throws Exception {
        JSONObject snapshot = new JSONObject().put("schemaVersion", 1).put("accounts", new JSONArray()); ProviderText.validateSnapshot(snapshot);
        ProviderText.validateSnapshot(snapshot.put("providers", new JSONArray().put(report("copilot"))));
        try { ProviderText.validateSnapshot(snapshot.put("providers", new JSONArray().put(report("unknown")))); fail(); } catch (Exception expected) { assertTrue(expected.getMessage().contains("Unsupported")); }
        JSONArray rows = new JSONArray(); for (int i = 0; i < 21; i++) rows.put(report("copilot"));
        try { ProviderText.validateSnapshot(snapshot.put("providers", rows)); fail(); } catch (Exception expected) { assertTrue(expected.getMessage().contains("Unsupported")); }
    }
    @Test public void unknownZeroAndUnlimitedStayDistinct() throws Exception {
        assertEquals("Not reported", ProviderText.quotaValue(new JSONObject()));
        assertEquals("0% left", ProviderText.quotaValue(new JSONObject().put("remainingPercent", 0)));
        assertEquals("Unlimited entitlement", ProviderText.quotaValue(new JSONObject().put("unlimited", true).put("remainingPercent", 100)));
        assertEquals(-1, ProviderText.percent(new JSONObject().put("remainingPercent", 101)));
        assertEquals("Not reported", ProviderText.metricValue(new JSONObject().put("value", JSONObject.NULL)));
        assertEquals("$1.24", ProviderText.metricValue(new JSONObject().put("value", "1.24").put("unit", "USD")));
        assertEquals("Not reported", ProviderText.metricValue(new JSONObject().put("value", "NaN").put("unit", "USD")));
    }
    @Test public void phoneReportUsesNativeQuotaAndOrganizationUsageNotCodexWindows() throws Exception {
        try (var activity = Robolectric.buildActivity(MainActivity.class).setup()) {
            JSONObject copilot = report("copilot"); copilot.getJSONObject("report").getJSONArray("quotas").put(new JSONObject().put("label", "Premium interactions").put("remainingPercent", 72).put("period", "Provider entitlement"));
            String quota = text(activity.get().providerCard(copilot, false)); assertTrue(quota.contains("72% left")); assertTrue(quota.contains("GitHub Copilot")); assertFalse(quota.contains("5-hour")); assertFalse(quota.contains("7-day"));
            JSONObject claude = report("claude"); claude.getJSONObject("report").getJSONArray("metrics").put(new JSONObject().put("label", "Reported API cost").put("value", "18.42").put("unit", "USD"));
            String usage = text(activity.get().providerCard(claude, true)); assertTrue(usage.contains("$18.42")); assertTrue(usage.contains("Saved reading")); assertFalse(usage.contains("%"));
        }
    }
    @Test public void oldAndFutureReadingsAreNeverLiveAndCursorHasAnHourlyCadence() throws Exception {
        JSONObject row = report("cursor").put("fetchedAt", java.time.Instant.now().minusSeconds(3600).toString()); assertFalse(ProviderText.stale(row, false));
        assertTrue(ProviderText.stale(row.put("provider", "copilot"), false)); assertTrue(ProviderText.stale(report("copilot"), true));
        assertTrue(ProviderText.stale(report("copilot").put("fetchedAt", java.time.Instant.now().plusSeconds(120).toString()), false));
        assertTrue(ProviderText.stale(report("copilot").put("status", "paused"), false));
    }
}
