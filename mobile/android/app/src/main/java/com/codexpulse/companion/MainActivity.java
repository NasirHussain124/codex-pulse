package com.codexpulse.companion;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int BG = Color.rgb(37, 37, 54), TEXT = Color.rgb(238, 230, 255), MUTED = Color.rgb(192, 181, 210), ACCENT = Color.rgb(212, 195, 243);
    private LinearLayout root;
    static final int SCAN = 4501;
    private long lastRefresh;
    private boolean busy;
    private String message = "";
    private final Runnable ticker = () -> { if (!isFinishing()) render(); };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); render(); RefreshJob.schedule(this); handleIntent(getIntent());
    }
    @Override protected void onDestroy() { if (root != null) root.removeCallbacks(ticker); super.onDestroy(); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); handleIntent(intent); }
    @Override protected void onResume() {
        super.onResume();
        if (root != null) { root.removeCallbacks(ticker); root.postDelayed(ticker, 60000); }
        try {
            if (!busy && System.currentTimeMillis() - lastRefresh > 15000 && new PhoneStore(this).read().has("connection")) {
                lastRefresh = System.currentTimeMillis();
                RefreshJob.refresh(getApplicationContext(), () -> runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) render(); }));
            }
        } catch (Exception ignored) { }
    }
    @Override protected void onPause() { if (root != null) root.removeCallbacks(ticker); super.onPause(); }
    void scan() {
        try { startActivityForResult(new Intent(this, ScannerActivity.class), SCAN); }
        catch (RuntimeException error) { message = "Camera could not open. You can paste the pairing link instead."; render(); }
    }
    private void handleIntent(Intent intent) { if (intent.getData() != null) { String value = intent.getData().toString(); intent.setData(null); confirmPair(value); } }
    private int dp(float value) { return (int)(value * getResources().getDisplayMetrics().density + .5f); }
    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); view.setPadding(0, dp(5), 0, dp(5)); return view;
    }
    private GradientDrawable shape(int color, int radius) { GradientDrawable bg = new GradientDrawable(); bg.setColor(color); bg.setCornerRadius(dp(radius)); return bg; }
    private Button button(String value, boolean primary, Runnable action) {
        Button view = new Button(this); view.setText(value); view.setAllCaps(false); view.setTextSize(14); view.setTextColor(primary ? BG : TEXT);
        view.setBackground(shape(primary ? ACCENT : Color.rgb(58, 53, 76), 16)); view.setPadding(dp(18), dp(8), dp(18), dp(8)); view.setMinHeight(dp(52)); view.setEnabled(!busy);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(52)); params.setMargins(0, dp(10), 0, dp(3)); view.setLayoutParams(params); view.setOnClickListener(v -> action.run()); return view;
    }
    private void work(RunnableWithError action) {
        busy = true; message = ""; render();
        RefreshJob.EXECUTOR.execute(() -> {
            try { action.run(); } catch (Exception error) { message = error.getMessage() == null ? "Something went wrong. Try again." : error.getMessage(); }
            runOnUiThread(() -> { if (!isFinishing()) { busy = false; render(); PulseWidget.updateAll(this); } });
        });
    }
    interface RunnableWithError { void run() throws Exception; }
    private void render() {
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(BG);
        LinearLayout previous = root; root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(25), dp(23), dp(25), dp(32)); scroll.addView(root);
        if (previous != null) previous.removeCallbacks(ticker);
        scroll.setOnApplyWindowInsetsListener((v, insets) -> { scroll.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets; });
        setContentView(scroll);
        LinearLayout brand = new LinearLayout(this); brand.setGravity(Gravity.CENTER_VERTICAL); ImageView mark = new ImageView(this); mark.setImageResource(R.drawable.ic_pulse); brand.addView(mark, new LinearLayout.LayoutParams(dp(32), dp(32))); TextView brandName = text("Quota management", 15, TEXT); brandName.setPadding(dp(10), 0, 0, 0); brand.addView(brandName); root.addView(brand);
        TextView title = text("Your Codex usage", 28, TEXT); title.setTypeface(null, Typeface.BOLD); title.setPadding(0, dp(24), 0, dp(12)); root.addView(title);
        root.addView(text("All your accounts. A little more headroom.", 13, MUTED));
        JSONObject data;
        try { data = new PhoneStore(this).read(); } catch (Exception error) { data = new JSONObject(); message = "Encrypted phone data could not be opened. Forget this connection and pair again."; }
        boolean paired = data.optJSONObject("connection") != null;
        if (!message.isEmpty()) root.addView(text(message, 13, Color.rgb(236, 173, 140)));
        if (!paired) {
            LinearLayout intro = new LinearLayout(this); intro.setOrientation(LinearLayout.VERTICAL); intro.setPadding(dp(20), dp(18), dp(20), dp(18)); intro.setBackground(shape(Color.rgb(46, 45, 67), 22));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.setMargins(0, dp(28), 0, dp(8)); intro.setLayoutParams(params);
            intro.addView(text("Connect your PC", 20, TEXT)); intro.addView(text("1  Open Quota management on Windows.\n2  Choose Phone companion and enable it.\n3  Generate a QR code, then scan it here.\n\nUse the same private Wi-Fi. Your Codex login stays on your PC.", 14, MUTED)); root.addView(intro);
            root.addView(button("Scan pairing QR", true, this::scan));
            root.addView(button("Paste a pairing link", false, this::paste));
            if (!data.toString().equals("{}")) root.addView(button("Forget damaged connection", false, this::forget));
        } else {
            boolean offline = data.has("error");
            root.addView(text(busy ? "Refreshing…" : offline ? "Saved readings · PC offline" : "Connected to your PC", 12, offline ? Color.rgb(223, 178, 120) : ACCENT));

            JSONObject snapshot = data.optJSONObject("snapshot"); JSONArray accounts = snapshot == null ? null : snapshot.optJSONArray("accounts");
            if (accounts == null || accounts.length() == 0) root.addView(text("No account readings yet. Refresh with your PC online.", 15, MUTED));
            else for (int i = 0; i < accounts.length(); i++) { JSONObject account = accounts.optJSONObject(i); if (account != null) account(account, offline); }
            root.addView(button(busy ? "Refreshing…" : "Refresh from PC", true, () -> work(() -> new CompanionClient(this).refresh())));
            root.addView(button("Pair another PC", false, this::scan));
            AppWidgetManager widgets = AppWidgetManager.getInstance(this);
            root.addView(button("Add home-screen widget", false, () -> {
                if (widgets.isRequestPinAppWidgetSupported()) widgets.requestPinAppWidget(new ComponentName(this, PulseWidget.class), null, null);
                else new AlertDialog.Builder(this).setMessage("Long-press an empty area of your home screen, choose Widgets, then Quota management.").setPositiveButton("OK", null).show();
            }));
            root.addView(button("Forget this PC", false, this::forget));
        }
        root.addView(text("Private Wi-Fi sync · 0.4.0", 11, MUTED));
        root.addView(button("Open-source notices", false, () -> {
            try (var input = getAssets().open("NOTICE.txt")) {
                var output = new java.io.ByteArrayOutputStream(); byte[] bytes = new byte[2048]; int length;
                while ((length = input.read(bytes)) != -1) output.write(bytes, 0, length);
                new AlertDialog.Builder(this).setTitle("Open-source notices").setMessage(output.toString(java.nio.charset.StandardCharsets.UTF_8.name())).setPositiveButton("Close", null).show();
            } catch (Exception error) { message = "Notices are also available in the project repository."; render(); }
        }));
        root.postDelayed(ticker, 60000);
    }
    private void account(JSONObject account, boolean offline) {
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(18), dp(16), dp(18), dp(16)); card.setBackground(shape(Color.rgb(47, 44, 63), 24));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.setMargins(0, dp(14), 0, 0); card.setLayoutParams(params);
        TextView name = text(AccountText.name(account), 17, TEXT); name.setTypeface(null, Typeface.BOLD); name.setMaxLines(1); name.setEllipsize(android.text.TextUtils.TruncateAt.END); card.addView(name);
        String email = account.optString("email", "");
        if (!email.trim().isEmpty() && !email.equals(AccountText.name(account))) { TextView address = text(email, 12, MUTED); address.setMaxLines(1); address.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE); card.addView(address); }
        boolean stale = offline || QuotaText.stale(account);
        LinearLayout limits = new LinearLayout(this); limits.setOrientation(LinearLayout.HORIZONTAL);
        for (int duration : new int[]{300, 10080}) {
            JSONObject window = QuotaText.window(account, duration); int percent = QuotaText.percent(window);
            LinearLayout column = new LinearLayout(this); column.setOrientation(LinearLayout.VERTICAL);
            LinearLayout.LayoutParams columnParams = new LinearLayout.LayoutParams(0, -2, 1); column.setLayoutParams(columnParams);
            if (duration == 10080) column.setPadding(dp(18), 0, 0, 0);
            column.addView(text(duration == 300 ? "5-hour" : "7-day", 12, MUTED));
            int color = percent < 0 || stale ? MUTED : percent <= 10 ? Color.rgb(231, 133, 126) : percent <= 30 ? Color.rgb(221, 187, 116) : ACCENT;
            TextView value = text(percent < 0 ? "—" : percent + "%", 34, color); value.setTypeface(null, Typeface.NORMAL); column.addView(value);
            ProgressBar bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); bar.setMax(100); bar.setProgress(Math.max(0, percent)); bar.setProgressTintList(ColorStateList.valueOf(color)); bar.setProgressBackgroundTintList(ColorStateList.valueOf(Color.rgb(70, 64, 85))); bar.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(5))); column.addView(bar);
            column.addView(text(percent < 0 ? "reconnect".equals(account.optString("status")) ? "Reconnect on PC" : "Not reported" : QuotaText.reset(window), 11, MUTED)); limits.addView(column);
        }
        card.addView(limits);
        if (stale) card.addView(text("Saved · " + QuotaText.observed(account), 11, MUTED));
        root.addView(card);
    }
    private void paste() {
        EditText input = new EditText(this); input.setHint("codexpulse://pair?data=…"); input.setTextSize(13); input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS); input.setPadding(dp(20), dp(15), dp(20), dp(15));
        new AlertDialog.Builder(this).setTitle("Pairing link from your PC").setView(input).setPositiveButton("Continue", (dialog, which) -> confirmPair(input.getText().toString())).setNegativeButton("Cancel", null).show();
    }
    private void confirmPair(String value) {
        if (busy) return;
        try {
            CompanionClient client = new CompanionClient(this); JSONObject pair = client.decodePairing(value);
            new AlertDialog.Builder(this).setTitle("Trust this PC?").setMessage("Pair with " + pair.getString("endpoint") + "?\n\nOnly continue if you generated this QR/link in your own Quota management app. The phone will pin this PC’s certificate and receive read-only usage access.").setPositiveButton("Pair securely", (dialog, which) -> work(() -> { client.pair(pair); RefreshJob.schedule(this); })).setNegativeButton("Cancel", null).show();
        } catch (Exception error) { message = "Invalid pairing link. Generate a fresh QR code in Quota management on your PC."; render(); }
    }
    private void forget() { new AlertDialog.Builder(this).setTitle("Forget this PC?").setMessage("Removes this phone’s connection and cached readings. You can also revoke the phone in Quota management on your PC.").setPositiveButton("Forget", (dialog, which) -> work(() -> new PhoneStore(this).clear())).setNegativeButton("Cancel", null).show(); }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != SCAN || data == null) return;
        if (result == RESULT_OK && data.getStringExtra("pairing") != null) confirmPair(data.getStringExtra("pairing"));
        else if (data.getBooleanExtra("manual", false)) paste();
    }
}
