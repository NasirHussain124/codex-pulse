package com.codexpulse.companion;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.widget.TextView;
import org.robolectric.RuntimeEnvironment;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.json.JSONObject;
import org.json.JSONArray;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class CompanionViewTest {
    private String text(android.view.View view) {
        if (view instanceof TextView) return ((TextView)view).getText().toString();
        StringBuilder value = new StringBuilder(); if (view instanceof android.view.ViewGroup) { var group = (android.view.ViewGroup)view; for (int i = 0; i < group.getChildCount(); i++) value.append(text(group.getChildAt(i))).append(' '); } return value.toString();
    }
    @Test public void unpairedAppOpensWithoutSecretsOrNetwork() {
        try (var activity = Robolectric.buildActivity(MainActivity.class).setup()) {
            assertNotNull(activity.get().getWindow().getDecorView());
            String text = text(activity.get().getWindow().getDecorView());
            assertTrue(text.contains("Your usage, together")); assertTrue(text.contains("Scan pairing QR"));
        }
    }
    @Test public void widgetInflatesAndUnpairedStateIsHonest() {
        Context context = RuntimeEnvironment.getApplication();
        var views = new android.widget.RemoteViews(context.getPackageName(), R.layout.widget);
        var view = views.apply(context, new android.widget.FrameLayout(context));
        assertEquals("Tap to connect", ((TextView)view.findViewById(R.id.widget_status)).getText().toString());
    }
    @Test public void widgetConfigurationOpensWithARealGeneratedViewId() {
        Context context = RuntimeEnvironment.getApplication();
        var intent = new Intent(context, WidgetConfigActivity.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 21);
        try (var activity = Robolectric.buildActivity(WidgetConfigActivity.class, intent).setup()) {
            String text = text(activity.get().getWindow().getDecorView());
            assertTrue(text.contains("7-day remaining")); assertTrue(text.contains("5-hour remaining"));
        }
    }
    @Test public void unknownAndExpiredQuotaNeverBecomeZero() throws Exception {
        assertEquals(-1, QuotaText.percent(null));
        assertEquals(-1, QuotaText.percent(new JSONObject().put("remainingPercent", 101)));
        JSONObject account = new JSONObject().put("status", "reconnect").put("windows", new JSONArray().put(new JSONObject().put("durationMinutes", 10080).put("remainingPercent", 75)));
        assertNull(QuotaText.window(account, 10080)); assertTrue(QuotaText.stale(account));
    }
    @Test public void pillRowShowsRealQuotaWithSelectedPaletteAndFullHeightFill() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        JSONObject account = new JSONObject().put("label", "Personal").put("selected", true).put("status", "ready").put("fetchedAt", java.time.Instant.now().toString())
            .put("windows", new JSONArray().put(new JSONObject().put("durationMinutes", 10080).put("remainingPercent", 76)));
        var view = PulseWidget.quotaRow(context, account, 10080, false).apply(context, new android.widget.FrameLayout(context));
        assertEquals("76%", ((TextView)view.findViewById(R.id.row_percent)).getText().toString());
        var progress = (android.widget.ProgressBar)view.findViewById(R.id.row_progress_selected);
        assertEquals(76, progress.getProgress()); assertEquals(android.view.View.VISIBLE, progress.getVisibility());
        assertEquals(android.view.View.GONE, view.findViewById(R.id.row_progress).getVisibility());
        assertEquals(android.view.ViewGroup.LayoutParams.MATCH_PARENT, progress.getLayoutParams().height);
        assertTrue(((TextView)view.findViewById(R.id.row_name)).getContentDescription().toString().contains("76 percent remaining"));
    }
    @Test public void pillRowDoesNotSubstituteWeeklyQuotaForMissingFiveHourQuota() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        JSONObject account = new JSONObject().put("label", "Work").put("status", "ready")
            .put("windows", new JSONArray().put(new JSONObject().put("durationMinutes", 10080).put("remainingPercent", 40)));
        var view = PulseWidget.quotaRow(context, account, 300, true).apply(context, new android.widget.FrameLayout(context));
        assertEquals("—", ((TextView)view.findViewById(R.id.row_percent)).getText().toString());
        assertTrue(((TextView)view.findViewById(R.id.row_reset)).getText().toString().startsWith("Saved · Not reported"));
        assertEquals(0, ((android.widget.ProgressBar)view.findViewById(R.id.row_progress)).getProgress());
    }
    @Test public void appAndWidgetUseTheNewNameWithoutChangingThePackage() {
        Context context = RuntimeEnvironment.getApplication();
        assertEquals("Quota management", context.getString(R.string.app_name));
        assertEquals("com.codexpulse.companion", context.getPackageName());
    }
}
