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
    private static String percentage(int value) { return value < 0 ? "—" : value + "%"; }
    static RemoteViews quotaRow(Context context, JSONObject account, int duration, boolean offline) {
        return quotaRow(context, account, duration, offline, 58, false);
    }
    static RemoteViews quotaRow(Context context, JSONObject account, int duration, boolean offline, int pitch, boolean emails) {
        boolean both = duration == 0, selected = account.optBoolean("selected"), old = offline || QuotaText.stale(account);
        JSONObject first = QuotaText.window(account, 300), second = QuotaText.window(account, both ? 10080 : duration);
        int five = QuotaText.percent(first), weekly = QuotaText.percent(second);
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_row);
        String name = emails && !account.optString("email").isEmpty() ? account.optString("email") : AccountText.name(account);
        String detail = (old ? "Saved · " : "") + (weekly < 0 ? "Not reported" : QuotaText.reset(second));
        row.setTextViewText(R.id.row_name, name); row.setTextViewText(R.id.row_percent, percentage(weekly)); row.setTextViewText(R.id.row_five_percent, percentage(five)); row.setTextViewText(R.id.row_reset, detail);
        row.setViewVisibility(R.id.row_five_group, both ? View.VISIBLE : View.GONE);
        row.setTextViewText(R.id.row_week_label, context.getString(duration == 300 ? R.string.five_hour_short : R.string.weekly_short));
        row.setProgressBar(R.id.row_five_progress, 100, Math.max(0, five), false);
        row.setProgressBar(R.id.row_progress, 100, Math.max(0, weekly), false); row.setProgressBar(R.id.row_progress_selected, 100, Math.max(0, weekly), false);
        row.setViewVisibility(R.id.row_progress, selected ? View.GONE : View.VISIBLE); row.setViewVisibility(R.id.row_progress_selected, selected ? View.VISIBLE : View.GONE);
        // Minimum height also works on pre-Android-12 launchers, without clipping scaled text.
        row.setInt(R.id.row_root, "setMinimumHeight", Math.round((pitch - 6) * context.getResources().getDisplayMetrics().density));
        float textSize = pitch >= 70 ? 18 : 15;
        row.setTextViewTextSize(R.id.row_percent, android.util.TypedValue.COMPLEX_UNIT_SP, textSize);
        row.setTextViewTextSize(R.id.row_five_percent, android.util.TypedValue.COMPLEX_UNIT_SP, textSize);
        String limits = both ? "5-hour " + percentage(five) + ", 7-day " + percentage(weekly) : (duration == 300 ? "5-hour " : "7-day ") + percentage(weekly);
        row.setContentDescription(R.id.row_name, name + ", " + limits + ". " + (weekly < 0 ? "quota not reported" : weekly + " percent remaining") + ". " + detail + ". " + QuotaText.observed(account));
        return row;
    }
    static int chromeHeight(int height, float scale, boolean footer) {
        return 16 + (height >= 96 ? Math.max(24, (int)Math.ceil(16 * scale)) : 0) + (footer ? (int)Math.ceil(18 * Math.max(1f, scale)) : 0);
    }
    static int columnsForWidth(int width, float scale) { return width >= 300 * Math.max(1f, scale) ? 2 : 1; }
    static int rowsForHeight(int height, float scale, boolean footer) {
        return Math.max(0, Math.min(8, (int)((height - chromeHeight(height, scale, footer)) / (52 * Math.max(1f, scale)))));
    }
    static RemoteViews createView(Context context, int id, JSONObject data, int height) {
        return createView(context, id, data, 300, height);
    }
    static RemoteViews createView(Context context, int id, JSONObject data, int width, int height) {
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.widget); view.removeAllViews(R.id.widget_rows);
        var prefs = context.getSharedPreferences("widgets", Context.MODE_PRIVATE);
        int duration = prefs.getInt("layout-version-" + id, 0) >= 2 ? prefs.getInt("duration-" + id, 0) : 0; Set<String> chosen = prefs.getStringSet("accounts-" + id, Collections.emptySet());
        JSONObject snapshot = data.optJSONObject("snapshot"); JSONArray all = snapshot == null ? null : snapshot.optJSONArray("accounts");
        ArrayList<JSONObject> accounts = new ArrayList<>(); boolean stale = data.has("error");
        if (all != null) for (int i = 0; i < all.length(); i++) { JSONObject account = all.optJSONObject(i); if (account != null && (chosen.isEmpty() || chosen.contains(account.optString("id")))) { accounts.add(account); stale |= QuotaText.stale(account); } }
        float scale = context.getResources().getConfiguration().fontScale;
        int columns = columnsForWidth(width, scale), limit = rowsForHeight(height, scale, false) * columns;
        boolean footer = accounts.isEmpty() || accounts.size() > limit;
        if (footer) limit = rowsForHeight(height, scale, true) * columns;
        int visible = Math.min(limit, accounts.size());
        int chrome = chromeHeight(height, scale, footer), gridRows = (int)Math.ceil(visible / (float)columns);
        int pitch = visible == 0 ? 52 : Math.max(52, (height - chrome) / gridRows);
        boolean emails = prefs.getBoolean("emails-" + id, false);
        for (int i = 0; i < visible; i += columns) {
            RemoteViews gridRow = new RemoteViews(context.getPackageName(), R.layout.widget_account_row);
            for (int col = 0; col < columns; col++) {
                if (col > 0) gridRow.addView(R.id.widget_account_row, new RemoteViews(context.getPackageName(), R.layout.widget_gap));
                gridRow.addView(R.id.widget_account_row, i + col < visible ? quotaRow(context, accounts.get(i + col), duration, data.has("error"), pitch, emails) : new RemoteViews(context.getPackageName(), R.layout.widget_empty_tile));
            }
            view.addView(R.id.widget_rows, gridRow);
        }
        view.setTextViewText(R.id.widget_period, (stale ? "Saved · " : "") + context.getString(R.string.widget_remaining));
        view.setViewVisibility(R.id.widget_header, height < 96 ? View.GONE : View.VISIBLE);
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
                for (SizeF size : sizes) if (size.getWidth() > 0 && size.getHeight() > 0) layouts.put(size, createView(context, id, data, Math.round(size.getWidth()), Math.round(size.getHeight())));
                if (!layouts.isEmpty()) return new RemoteViews(layouts);
            }
        }
        // Legacy options describe BOTH orientations: MAX height is portrait.
        int shortHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 160);
        int tallHeight = Math.max(shortHeight, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 300));
        return new RemoteViews(createView(context, id, data, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 500), shortHeight), createView(context, id, data, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 300), tallHeight));
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
    @Override public void onDeleted(Context context, int[] ids) { var edit = context.getSharedPreferences("widgets", Context.MODE_PRIVATE).edit(); for (int id : ids) edit.remove("duration-" + id).remove("accounts-" + id).remove("layout-version-" + id).remove("emails-" + id); edit.apply(); }
    @Override public void onReceive(Context context, Intent intent) { super.onReceive(context, intent); if (REFRESH.equals(intent.getAction())) { PendingResult result = goAsync(); RefreshJob.refresh(context, result::finish); } }
}
