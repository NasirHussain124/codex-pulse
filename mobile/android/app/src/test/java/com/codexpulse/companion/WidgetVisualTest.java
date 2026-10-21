package com.codexpulse.companion;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import java.io.File;
import java.io.FileOutputStream;
import static org.junit.Assert.*;

/** Native raster previews use synthetic account labels only; no phone or live account data. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, qualifiers = "port-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class WidgetVisualTest {
    private void inspect(View view) {
        if (view.getId() == R.id.row_percent || view.getId() == R.id.row_five_percent) {
            View label = ((ViewGroup)view.getParent()).getChildAt(0);
            assertTrue("Quota label overlaps percentage", label.getRight() < view.getLeft());
            assertTrue("Quota number is clipped", view.getBottom() <= ((View)view.getParent()).getHeight());
        }
        if (view instanceof ViewGroup) { ViewGroup group = (ViewGroup)view; for (int i = 0; i < group.getChildCount(); i++) inspect(group.getChildAt(i)); }
    }
    @Test public void nativeCardsStayReadableAtCompactAndTallSizes() throws Exception {
        Context context = RuntimeEnvironment.getApplication(); JSONArray accounts = new JSONArray();
        String[] names = {"Personal", "Work", "Studio", "Backup"}; int[] five = {100, 65, 100, 78}, weekly = {69, 51, 85, 50};
        for (int i = 0; i < 4; i++) accounts.put(new JSONObject().put("id", "" + i).put("label", names[i]).put("status", "ready").put("fetchedAt", java.time.Instant.now().toString()).put("windows", new JSONArray()
            .put(new JSONObject().put("durationMinutes", 300).put("remainingPercent", five[i])).put(new JSONObject().put("durationMinutes", 10080).put("remainingPercent", weekly[i]))));
        JSONObject data = new JSONObject().put("connection", new JSONObject()).put("snapshot", new JSONObject().put("accounts", accounts));
        File dir = new File("build/reports/widget-previews"); assertTrue(dir.isDirectory() || dir.mkdirs());
        for (int width : new int[]{300, 350}) for (int height : new int[]{148, 180, 230}) {
            View view = PulseWidget.createView(context, 8000 + width + height, data, width, height).apply(context, new FrameLayout(context));
            view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY)); view.layout(0, 0, width, height); inspect(view);
            assertEquals(View.GONE, view.findViewById(R.id.widget_status).getVisibility());
            Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888); view.draw(new Canvas(bitmap));
            try (FileOutputStream output = new FileOutputStream(new File(dir, "widget-" + width + "x" + height + ".png"))) { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)); }
            bitmap.recycle();
        }
    }
}
