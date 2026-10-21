package com.codexpulse.companion;

import android.content.Context;
import android.content.res.Configuration;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, qualifiers = "mdpi")
public class DualQuotaWidgetTest {
    private java.util.List<View> cards(View view) {
        var found = new java.util.ArrayList<View>();
        if (view.getId() == R.id.row_root) found.add(view);
        if (view instanceof android.view.ViewGroup) { var group = (android.view.ViewGroup)view; for (int i = 0; i < group.getChildCount(); i++) found.addAll(cards(group.getChildAt(i))); }
        return found;
    }
    private JSONObject fixture(int count) throws Exception {
        JSONArray accounts = new JSONArray();
        for (int i = 1; i <= count; i++) accounts.put(new JSONObject().put("id", "" + i).put("label", "Person " + i).put("email", "person" + i + "@example.test").put("status", "ready").put("fetchedAt", java.time.Instant.now().toString())
            .put("windows", new JSONArray().put(new JSONObject().put("durationMinutes", 300).put("remainingPercent", 90 - i)).put(new JSONObject().put("durationMinutes", 10080).put("remainingPercent", 70 + i))));
        return new JSONObject().put("connection", new JSONObject()).put("snapshot", new JSONObject().put("accounts", accounts));
    }
    private View render(Context context, int id, JSONObject data, int height) {
        View view = PulseWidget.createView(context, id, data, height).apply(context, new FrameLayout(context));
        float density = context.getResources().getDisplayMetrics().density;
        int w = Math.round(300 * density), h = Math.round(height * density);
        view.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY)); view.layout(0, 0, w, h);
        return view;
    }
    private void assertFits(View view) {
        ViewGroup rows = view.findViewById(R.id.widget_rows);
        assertTrue("rows extend below widget", rows.getBottom() <= view.getHeight() - view.getPaddingBottom());
        for (int i = 0; i < rows.getChildCount(); i++) {
            ViewGroup row = (ViewGroup) rows.getChildAt(i);
            for (int j = 0; j < row.getChildCount(); j++) assertTrue("row contents clipped", row.getChildAt(j).getBottom() <= row.getHeight());
        }
    }
    @Test public void compactTwoCellWidgetShowsBothLimitsForFourAccounts() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        View view = render(context, 100, fixture(4), 148);
        LinearLayout rows = view.findViewById(R.id.widget_rows);
        assertEquals(4, cards(view).size()); assertEquals(2, rows.getChildCount()); assertEquals(View.GONE, view.findViewById(R.id.widget_status).getVisibility());
        for (int i = 0; i < 4; i++) {
            View row = cards(view).get(i);
            assertEquals("Person " + (i + 1), ((TextView)row.findViewById(R.id.row_name)).getText().toString());
            assertEquals((89 - i) + "%", ((TextView)row.findViewById(R.id.row_five_percent)).getText().toString());
            assertEquals((71 + i) + "%", ((TextView)row.findViewById(R.id.row_percent)).getText().toString());
            assertEquals(89 - i, ((ProgressBar)row.findViewById(R.id.row_five_progress)).getProgress());
            assertEquals(View.VISIBLE, row.findViewById(R.id.row_five_group).getVisibility());
        }
        assertFits(view);
    }
    @Test public void tallerExistingWidgetUsesTheSpaceWithoutAnEmptyBottomPanel() throws Exception {
        Context context = RuntimeEnvironment.getApplication(); View view = render(context, 101, fixture(4), 280);
        assertFits(view);
        assertTrue(view.getHeight() - view.findViewById(R.id.widget_rows).getBottom() < 16);
    }
    @Test public void oldWindowPreferenceMigratesToBothWithoutLosingChosenAccounts() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        context.getSharedPreferences("widgets", 0).edit().putInt("duration-102", 10080).putStringSet("accounts-102", java.util.Set.of("2", "4")).commit();
        View view = render(context, 102, fixture(4), 148); LinearLayout rows = view.findViewById(R.id.widget_rows);
        assertEquals(2, cards(view).size());
        assertEquals("Person 2", ((TextView)cards(view).get(0).findViewById(R.id.row_name)).getText().toString());
        assertEquals(View.VISIBLE, view.findViewById(R.id.row_five_group).getVisibility());
    }
    @Test public void optionalSingleWindowAndEmailsRemainAvailable() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        context.getSharedPreferences("widgets", 0).edit().putInt("layout-version-103", 2).putInt("duration-103", 300).putBoolean("emails-103", true).commit();
        View view = render(context, 103, fixture(4), 148);
        assertEquals(View.GONE, view.findViewById(R.id.row_five_group).getVisibility());
        assertEquals("5h", ((TextView)view.findViewById(R.id.row_week_label)).getText().toString());
        assertEquals("89%", ((TextView)view.findViewById(R.id.row_percent)).getText().toString());
        assertEquals("person1@example.test", ((TextView)view.findViewById(R.id.row_name)).getText().toString()); assertFits(view);
    }
    @Test public void missingFiveHourQuotaDoesNotBorrowWeeklyValue() throws Exception {
        Context context = RuntimeEnvironment.getApplication(); JSONObject data = fixture(1);
        data.getJSONObject("snapshot").getJSONArray("accounts").getJSONObject(0).getJSONArray("windows").remove(0);
        View view = render(context, 104, data, 148);
        assertEquals("—", ((TextView)view.findViewById(R.id.row_five_percent)).getText().toString());
        assertEquals("71%", ((TextView)view.findViewById(R.id.row_percent)).getText().toString());
    }
    @Test public void smallWidgetAndExtraAccountsUseAnHonestOverflowLabel() throws Exception {
        Context context = RuntimeEnvironment.getApplication(); View view = render(context, 105, fixture(8), 148);
        assertEquals(2, cards(view).size());
        assertEquals("+6 more", ((TextView)view.findViewById(R.id.widget_status)).getText().toString()); assertFits(view);
    }
    @Test public void largeFontsFitRatherThanClippingTheFourthAccount() throws Exception {
        Context context = RuntimeEnvironment.getApplication(); Configuration config = new Configuration(context.getResources().getConfiguration()); config.fontScale = 1.6f;
        Context large = context.createConfigurationContext(config); View view = render(large, 106, fixture(4), 180);
        assertTrue(cards(view).size() < 4); assertFits(view);
    }
    @Test public void narrowHostsUseReadableSingleColumnCards() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        View view = PulseWidget.createView(context, 108, fixture(4), 220, 280).apply(context, new FrameLayout(context));
        view.measure(View.MeasureSpec.makeMeasureSpec(220, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(280, View.MeasureSpec.EXACTLY)); view.layout(0, 0, 220, 280);
        assertEquals(4, cards(view).size()); assertEquals(4, ((LinearLayout)view.findViewById(R.id.widget_rows)).getChildCount()); assertFits(view);
    }
    @Test public void verySmallLargeTextHostsShowOverflowInsteadOfClippedCards() throws Exception {
        Context context = RuntimeEnvironment.getApplication(); Configuration config = new Configuration(context.getResources().getConfiguration()); config.fontScale = 2f;
        Context large = context.createConfigurationContext(config); View view = render(large, 109, fixture(4), 110);
        assertEquals(0, cards(view).size()); assertEquals(View.VISIBLE, view.findViewById(R.id.widget_status).getVisibility()); assertFits(view);
    }
    @Test @Config(sdk = 28, qualifiers = "mdpi") public void legacyLauncherAlsoFillsRowsAndKeepsBothLimits() throws Exception {
        Context context = RuntimeEnvironment.getApplication(); View view = render(context, 107, fixture(4), 280);
        assertEquals(4, cards(view).size());
        assertEquals(View.VISIBLE, view.findViewById(R.id.row_five_group).getVisibility()); assertFits(view);
        assertTrue(view.getHeight() - view.findViewById(R.id.widget_rows).getBottom() < 16);
    }
}
