package com.codexpulse.companion;

import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class ScannerUiTest {
    private View find(View view, String value, boolean description) {
        CharSequence text = description ? view.getContentDescription() : view instanceof TextView ? ((TextView)view).getText() : null;
        if (text != null && text.toString().equals(value)) return view;
        if (view instanceof ViewGroup) { ViewGroup group = (ViewGroup)view; for (int i = 0; i < group.getChildCount(); i++) { View result = find(group.getChildAt(i), value, description); if (result != null) return result; } }
        return null;
    }
    @Test public void cleanCameraHasAccessibleCloseAndFlashControls() {
        try (var activity = Robolectric.buildActivity(ScannerActivity.class).setup()) {
            View root = activity.get().getWindow().getDecorView();
            assertNotNull(find(root, "Scan QR", false)); assertNotNull(find(root, "Close camera", true)); assertNotNull(find(root, "Turn on flash", true));
            assertNull(find(root, "Back", false));
            find(root, "Close camera", true).performClick();
            assertTrue(activity.get().isFinishing()); assertEquals(Activity.RESULT_CANCELED, shadowOf(activity.get()).getResultCode());
        }
    }
    @Test public void quietManualButtonReturnsToMainAppPasteFlow() {
        try (var activity = Robolectric.buildActivity(ScannerActivity.class).setup()) {
            find(activity.get().getWindow().getDecorView(), "Use pairing link", false).performClick();
            assertTrue(activity.get().isFinishing()); assertTrue(shadowOf(activity.get()).getResultIntent().getBooleanExtra("manual", false));
        }
    }
    @Test public void scanFrameIsCenteredAndInsidePortraitAndLandscapeScreens() {
        var frame = new ScannerActivity.Viewfinder(RuntimeEnvironment.getApplication());
        for (int[] size : new int[][]{{360, 800}, {800, 360}}) {
            var bounds = frame.frameBounds(size[0], size[1]);
            assertTrue(bounds.left > 0 && bounds.top > 0 && bounds.right < size[0] && bounds.bottom < size[1]);
            assertEquals(bounds.width(), bounds.height(), .01f); assertEquals(size[0] / 2f, bounds.centerX(), .01f); assertEquals(size[1] / 2f, bounds.centerY(), .01f);
        }
    }
}
