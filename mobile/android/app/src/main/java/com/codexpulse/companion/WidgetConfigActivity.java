package com.codexpulse.companion;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

public final class WidgetConfigActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); setResult(RESULT_CANCELED);
        int id = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        int pad = (int)(24 * getResources().getDisplayMetrics().density);
        ScrollView scroll = new ScrollView(this); LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(pad, pad, pad, pad); scroll.addView(root); setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((v, insets) -> { scroll.setPadding(0, insets.getSystemWindowInsetTop(), 0, insets.getSystemWindowInsetBottom()); return insets; });
        TextView title = new TextView(this); title.setText(R.string.widget_title); title.setTextSize(26); root.addView(title);
        TextView help = new TextView(this); help.setText(R.string.widget_help); help.setPadding(0, pad / 2, 0, pad / 2); root.addView(help);
        var prefs = getSharedPreferences("widgets", MODE_PRIVATE); RadioGroup group = new RadioGroup(this);
        RadioButton weekly = new RadioButton(this); weekly.setId(View.generateViewId()); weekly.setText(R.string.weekly_remaining); RadioButton five = new RadioButton(this); five.setId(View.generateViewId()); five.setText(R.string.five_hour_remaining); group.addView(weekly); group.addView(five); group.check(prefs.getInt("duration-" + id, 10080) == 300 ? five.getId() : weekly.getId()); root.addView(group);
        Set<String> selected = new HashSet<>(prefs.getStringSet("accounts-" + id, java.util.Collections.emptySet()));
        try {
            JSONObject snapshot = new PhoneStore(this).read().optJSONObject("snapshot"); JSONArray accounts = snapshot == null ? null : snapshot.optJSONArray("accounts");
            if (accounts != null) for (int i = 0; i < accounts.length(); i++) {
                JSONObject account = accounts.getJSONObject(i); String accountId = account.getString("id");
                CheckBox option = new CheckBox(this); option.setText(AccountText.widgetName(account)); option.setChecked(selected.contains(accountId)); option.setOnCheckedChangeListener((button, checked) -> { if (checked) selected.add(accountId); else selected.remove(accountId); }); root.addView(option);
            }
        } catch (Exception ignored) { }
        Button save = new Button(this); save.setText(R.string.add_widget); root.addView(save);
        save.setOnClickListener(v -> { prefs.edit().putInt("duration-" + id, group.getCheckedRadioButtonId() == five.getId() ? 300 : 10080).putStringSet("accounts-" + id, selected).apply(); PulseWidget.update(this, AppWidgetManager.getInstance(this), new int[]{id}); setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)); finish(); });
    }
}
