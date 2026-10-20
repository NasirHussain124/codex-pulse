package com.codexpulse.companion;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Collections;
import java.util.Set;

public final class PulseWidget extends AppWidgetProvider {
    private static final String REFRESH = "com.codexpulse.companion.REFRESH";
    static void updateAll(Context context) { AppWidgetManager manager = AppWidgetManager.getInstance(context); update(context, manager, manager.getAppWidgetIds(new ComponentName(context, PulseWidget.class))); }
    static void update(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.widget); view.removeAllViews(R.id.widget_rows);
            JSONObject data;
            try { data = new PhoneStore(context).read(); } catch (Exception error) { data = new JSONObject(); }
            JSONObject snapshot = data.optJSONObject("snapshot"); JSONArray accounts = snapshot == null ? null : snapshot.optJSONArray("accounts");
            boolean offline = data.has("error");
            var prefs = context.getSharedPreferences("widgets", Context.MODE_PRIVATE);
            int duration = prefs.getInt("duration-" + id, 10080); Set<String> chosen = prefs.getStringSet("accounts-" + id, Collections.emptySet());
            Bundle options = manager.getAppWidgetOptions(id); int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 220), max = Math.max(1, Math.min(8, (height - 65) / 65));
            int added = 0, matching = 0; boolean stale = offline;
            if (accounts != null) for (int i = 0; i < accounts.length(); i++) {
                JSONObject account = accounts.optJSONObject(i); if (account == null || !chosen.isEmpty() && !chosen.contains(account.optString("id"))) continue;
                matching++; if (added >= max) continue;
                JSONObject quota = QuotaText.window(account, duration); int percent = QuotaText.percent(quota);
                RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_row);
                row.setTextViewText(R.id.row_name, account.optString("label", "Codex account")); row.setTextViewText(R.id.row_percent, percent < 0 ? "—" : percent + "%");
                row.setProgressBar(R.id.row_progress, 100, Math.max(0, percent), false);
                boolean old = offline || QuotaText.stale(account); stale |= old;
                row.setTextViewText(R.id.row_reset, (old ? "Saved · " : "") + (percent < 0 ? "Not reported / reconnect on PC" : QuotaText.reset(quota)) + " · " + QuotaText.observed(account));
                view.addView(R.id.widget_rows, row); added++;
            }
            String status = !data.has("connection") ? "Tap to pair your PC" : accounts == null ? "Tap refresh for your first reading" : (duration == 300 ? "5-hour" : "7-day") + " remaining · " + (stale ? "saved / stale" : "latest PC readings") + (matching > added ? " · +" + (matching - added) + " in app" : "");
            view.setTextViewText(R.id.widget_status, status);
            PendingIntent open = PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            view.setOnClickPendingIntent(R.id.widget_root, open);
            PendingIntent refresh = PendingIntent.getBroadcast(context, 47831, new Intent(context, PulseWidget.class).setAction(REFRESH), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            view.setOnClickPendingIntent(R.id.widget_refresh, refresh); manager.updateAppWidget(id, view);
        }
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { RefreshJob.schedule(context); update(context, manager, ids); }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) { update(context, manager, new int[]{id}); }
    @Override public void onDeleted(Context context, int[] ids) { var edit = context.getSharedPreferences("widgets", Context.MODE_PRIVATE).edit(); for (int id : ids) edit.remove("duration-" + id).remove("accounts-" + id); edit.apply(); }
    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (REFRESH.equals(intent.getAction())) {
            PendingResult result = goAsync();
            RefreshJob.refresh(context, result::finish);
        }
    }
}
