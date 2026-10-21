package com.codexpulse.companion;

import android.Manifest;
import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import java.util.ArrayList;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class MobileRegressionTest {
    private java.util.List<View> cards(View view) {
        var found = new java.util.ArrayList<View>();
        if (view.getId() == R.id.row_root) found.add(view);
        if (view instanceof android.view.ViewGroup) { var group = (android.view.ViewGroup)view; for (int i = 0; i < group.getChildCount(); i++) found.addAll(cards(group.getChildAt(i))); }
        return found;
    }
    private JSONObject fixture() throws Exception {
        JSONArray accounts = new JSONArray();
        for (int i = 1; i <= 4; i++) accounts.put(new JSONObject().put("id", "" + i).put("label", "person" + i).put("email", "person" + i + "@example.test").put("status", "ready").put("fetchedAt", java.time.Instant.now().toString()).put("windows", new JSONArray().put(new JSONObject().put("durationMinutes", 10080).put("remainingPercent", 70 + i))));
        return new JSONObject().put("connection", new JSONObject()).put("snapshot", new JSONObject().put("accounts", accounts));
    }
    @Test public void scanButtonTargetsOurPrivateInAppScanner() {
        try (var activity = Robolectric.buildActivity(MainActivity.class).setup()) {
            activity.get().scan();
            var intent = shadowOf(activity.get()).getNextStartedActivity();
            assertEquals(ScannerActivity.class.getName(), intent.getComponent().getClassName());
            assertNotNull(intent.resolveActivity(activity.get().getPackageManager()));
            assertFalse(activity.get().isFinishing());
        }
    }
    @Test public void cameraDenialAndCanceledScannerNeverFinishTheMainApp() {
        try (var activity = Robolectric.buildActivity(ScannerActivity.class).setup()) {
            activity.get().onRequestPermissionsResult(ScannerActivity.CAMERA_PERMISSION, new String[]{Manifest.permission.CAMERA}, new int[]{PackageManager.PERMISSION_DENIED});
            assertFalse(activity.get().isFinishing());
            assertNotNull(activity.get().getWindow().getDecorView());
        }
        try (var activity = Robolectric.buildActivity(MainActivity.class).setup()) {
            activity.get().onActivityResult(MainActivity.SCAN, Activity.RESULT_CANCELED, null);
            assertFalse(activity.get().isFinishing());
        }
    }
    @Test public void scannerManualFallbackIsAvailableWithoutCameraPermission() {
        try (var activity = Robolectric.buildActivity(ScannerActivity.class).setup()) {
            assertTrue(findText(activity.get().getWindow().getDecorView(), "Use pairing link"));
        }
    }
    private boolean findText(View view, String text) {
        if (view instanceof TextView && ((TextView)view).getText().toString().equals(text)) return true;
        if (view instanceof android.view.ViewGroup) { var group = (android.view.ViewGroup)view; for (int i = 0; i < group.getChildCount(); i++) if (findText(group.getChildAt(i), text)) return true; }
        return false;
    }
    @Test public void portraitWidgetShowsFourAccountsAndNoDebugParagraph() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        var view = PulseWidget.createView(context, 57, fixture(), 280).apply(context, new android.widget.FrameLayout(context));
        assertEquals(4, cards(view).size());
        assertEquals(View.GONE, view.findViewById(R.id.widget_status).getVisibility());
        assertEquals("person1", ((TextView)view.findViewById(R.id.row_name)).getText().toString());
        assertEquals(View.GONE, view.findViewById(R.id.row_reset).getVisibility());
        view.measure(View.MeasureSpec.makeMeasureSpec(300, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(280, View.MeasureSpec.EXACTLY));
        view.layout(0, 0, 300, 280);
        assertTrue(view.findViewById(R.id.widget_rows).getBottom() <= 280);
    }
    @Test public void widgetFitsSmallHostsAndAccessibilityFonts() {
        assertTrue(PulseWidget.rowsForHeight(160, 1, true) < PulseWidget.rowsForHeight(300, 1, false));
        assertTrue(PulseWidget.rowsForHeight(280, 1.6f, false) < PulseWidget.rowsForHeight(280, 1, false));
    }
    @Test @Config(qualifiers = "port-mdpi") public void oldLauncherUsesTallPortraitHeightNotShortLandscapeHeight() throws Exception {
        Context context = RuntimeEnvironment.getApplication(); Bundle options = new Bundle();
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 150); options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 280);
        var view = PulseWidget.forOptions(context, 58, fixture(), options).apply(context, new android.widget.FrameLayout(context));
        assertEquals(4, cards(view).size());
        assertEquals(2, ((LinearLayout)view.findViewById(R.id.widget_rows)).getChildCount());
    }
    @Test public void modernLauncherHasExactSizeLayouts() throws Exception {
        Context context = RuntimeEnvironment.getApplication(); Bundle options = new Bundle();
        ArrayList<SizeF> sizes = new ArrayList<>(); sizes.add(new SizeF(300, 280)); sizes.add(new SizeF(500, 150)); options.putParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES, sizes);
        assertNotNull(PulseWidget.forOptions(context, 59, fixture(), options));
    }
    @Test public void identityKeepsNamesAndEmailsWithoutGenericAccountNumbers() throws Exception {
        JSONObject account = new JSONObject().put("label", "Account 1").put("email", "real.person@example.test");
        assertEquals("real.person", AccountText.name(account)); assertEquals("real.person@example.test", AccountText.widgetName(account));
        account.put("label", "Work"); assertEquals("Work", AccountText.widgetName(account));
    }
}
