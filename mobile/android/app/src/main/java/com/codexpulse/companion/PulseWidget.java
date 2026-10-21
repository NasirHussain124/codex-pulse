package com.codexpulse.companion;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public final class PulseWidget extends AppWidgetProvider {
    private static final String REFRESH = "com.codexpulse.companion.REFRESH";
    static RemoteViews quotaRow(Context context, JSONObject account, int duration, boolean offline) {
        JSONObject quota = QuotaText.window(account, duration); int percent = QuotaText.percent(quota);
        boolean selected = account.optBoolean("selected"), old = offline || QuotaText.stale(account);
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_row);
        String name = AccountText.widgetName(account), detail = (old ? "Saved · " : "") + (percent < 0 ? "Not reported" : QuotaText.reset(quota));
        row.setTextViewText(R.id.row_name, name); row.setTextViewText(R.id.row_percent, percent < 0 ? "—" : percent + "%"); row.setTextViewText(R.id.row_reset, detail);
        row.setProgressBar(R.id.row_progress, 100, Math.max(0, percent), false); row.setProgressBar(R.id.row_progress_selected, 100, Math.max(0, percent), false);
        row.setViewVisibility(R.id.row_progress, selected ? View.GONE : View.VISIBLE); row.setViewVisibility(R.id.row_progress_selected, selected ? View.VISIBLE : View.GONE);
        row.setContentDescription(R.id.row_name, name + ", " + (percent < 0 ? "quota not reported" : percent + " percent remaining") + ". " + detail + ". " + QuotaText.observed(account));
        return row;
    }
    static int rowsForHeight(int height, float scale, boolean footer) {
        int chrome = 24 + (height >= 125 ? 44 : 0) + (footer ? 18 : 0);
        return Math.max(1, Math.min(8, (int)((height - chrome) / (48 * Math.max(1f, scale)))));
    }
    static RemoteViews createView(Context context, int id, JSONObject data, int height) {
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.widget); view.removeAllViews(R.id.widget_rows);
        var prefs = context.getSharedPreferences("widgets", Context.MODE_PRIVATE);
        int duration = prefs.getInt("duration-" + id, 10080); Set<String> chosen = prefs.getStringSet("accounts-" + id, Collections.emptySet());
        JSONObject snapshot = data.optJSONObject("snapshot"); JSONArray all = snapshot == null ? null : snapshot.optJSONArray("accounts");
        ArrayList<JSONObject> accounts = new ArrayList<>(); boolean stale = data.has("error");
        if (all != null) for (int i = 0; i < all.length(); i++) { JSONObject account = all.optJSONObject(i); if (account != null && (chosen.isEmpty() || chosen.contains(account.optString("id")))) { accounts.add(account); stale |= QuotaText.stale(account); } }
        float scale = context.getResources().getConfiguration().fontScale;
        int limit = rowsForHeight(height, scale, false);
        boolean footer = accounts.isEmpty() || stale || accounts.size() > limit;
        if (footer) limit = rowsForHeight(height, scale, true);
        for (int i = 0; i < Math.min(limit, accounts.size()); i++) view.addView(R.id.widget_rows, quotaRow(context, accounts.get(i), duration, data.has("error")));
        view.setTextViewText(R.id.widget_period, duration == 300 ? "5-hour remaining" : "7-day remaining");
        view.setViewVisibility(R.id.widget_header, height < 125 ? View.GONE : View.VISIBLE);
        view.setViewVisibility(R.id.widget_status, footer ? View.VISIBLE : View.GONE);
        String status = accounts.isEmpty() ? data.has("connection") ? "Tap to refresh" : "Tap to connect" : stale ? "Saved · open app to refresh" : "";
        int hidden = accounts.size() - limit;
        if (hidden > 0) status += (status.isEmpty() ? "" : " · ") + "+" + hidden + " more";
        view.setTextViewText(R.id.widget_status, status);
        PendingIntent open = PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        view.setOnClickPendingIntent(R.id.widget_root, open);
        view.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(context, 47831, new Intent(context, PulseWidget.class).setAction(REFRESH), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return view;
    }
    static RemoteViews forOptions(Context context, int id, JSONObject data, Bundle options) {
        // On Android 12+, provide exact layouts for the actual launcher sizes.
        if (Build.VERSION.SDK_INT >= 31) {
            ArrayList<SizeF> sizes = options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if (sizes != null && !sizes.isEmpty() && sizes.size() <= 16) {
                Map<SizeF, RemoteViews> layouts = new LinkedHashMap<>();
                for (SizeF size : sizes) if (size.getWidth() > 0 && size.getHeight() > 0) layouts.put(size, createView(context, id, data, Math.round(size.getHeight())));
                if (!layouts.isEmpty()) return new RemoteViews(layouts);
            }
        }
        // Legacy options describe BOTH orientations: MAX height is portrait.
        int shortHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 160);
        int tallHeight = Math.max(shortHeight, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 300));
        return new RemoteViews(createView(context, id, data, shortHeight), createView(context, id, data, tallHeight));
    }
    static void updateAll(Context context) { AppWidgetManager manager = AppWidgetManager.getInstance(context); update(context, manager, manager.getAppWidgetIds(new ComponentName(context, PulseWidget.class))); }
    static void update(Context context, AppWidgetManager manager, int[] ids) {
        JSONObject data; try { data = new PhoneStore(context).read(); } catch (Exception error) { data = new JSONObject(); }
        for (int id : ids) manager.updateAppWidget(id, forOptions(context, id, data, manager.getAppWidgetOptions(id)));
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { RefreshJob.schedule(context); update(context, manager, ids); }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        JSONObject data; try { data = new PhoneStore(context).read(); } catch (Exception error) { data = new JSONObject(); }
        manager.updateAppWidget(id, forOptions(context, id, data, options));
    }
    @Override public void onDeleted(Context context, int[] ids) { var edit = context.getSharedPreferences("widgets", Context.MODE_PRIVATE).edit(); for (int id : ids) edit.remove("duration-" + id).remove("accounts-" + id); edit.apply(); }
    @Override public void onReceive(Context context, Intent intent) { super.onReceive(context, intent); if (REFRESH.equals(intent.getAction())) { PendingResult result = goAsync(); RefreshJob.refresh(context, result::finish); } }
}
