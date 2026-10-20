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
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int BG = Color.rgb(20, 21, 17), TEXT = Color.rgb(228, 236, 217), MUTED = Color.rgb(159, 173, 145), ACCENT = Color.rgb(185, 208, 163);
    private LinearLayout root;
    private boolean busy;
    private String message = "";
    private final Runnable ticker = () -> { if (!isFinishing()) render(); };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); render(); RefreshJob.schedule(this); handleIntent(getIntent());
    }
    @Override protected void onDestroy() { if (root != null) root.removeCallbacks(ticker); super.onDestroy(); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); handleIntent(intent); }
    private void handleIntent(Intent intent) { if (intent.getData() != null) { String value = intent.getData().toString(); intent.setData(null); confirmPair(value); } }
    private int dp(float value) { return (int)(value * getResources().getDisplayMetrics().density + .5f); }
    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); view.setPadding(0, dp(5), 0, dp(5)); return view;
    }
    private GradientDrawable shape(int color, int radius) { GradientDrawable bg = new GradientDrawable(); bg.setColor(color); bg.setCornerRadius(dp(radius)); return bg; }
    private Button button(String value, boolean primary, Runnable action) {
        Button view = new Button(this); view.setText(value); view.setAllCaps(false); view.setTextSize(14); view.setTextColor(primary ? BG : TEXT);
        view.setBackground(shape(primary ? ACCENT : Color.rgb(42, 48, 36), 16)); view.setPadding(dp(18), dp(8), dp(18), dp(8)); view.setMinHeight(dp(52)); view.setEnabled(!busy);
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
        TextView brand = text("‹/›  CODEX PULSE", 12, ACCENT); brand.setLetterSpacing(.14f); root.addView(brand);
        TextView title = text("Your limits.\nAt a glance.", 34, TEXT); title.setTypeface(null, Typeface.BOLD); title.setPadding(0, dp(24), 0, dp(12)); root.addView(title);
        root.addView(text("A private, read-only window into your PC’s Codex accounts.", 14, MUTED));
        JSONObject data;
        try { data = new PhoneStore(this).read(); } catch (Exception error) { data = new JSONObject(); message = "Encrypted phone data could not be opened. Forget this connection and pair again."; }
        boolean paired = data.optJSONObject("connection") != null;
        if (!message.isEmpty()) root.addView(text(message, 13, Color.rgb(236, 173, 140)));
        if (!paired) {
            LinearLayout intro = new LinearLayout(this); intro.setOrientation(LinearLayout.VERTICAL); intro.setPadding(dp(20), dp(18), dp(20), dp(18)); intro.setBackground(shape(Color.rgb(32, 39, 27), 22));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.setMargins(0, dp(28), 0, dp(8)); intro.setLayoutParams(params);
            intro.addView(text("Connect your PC", 20, TEXT)); intro.addView(text("1  Open Codex Pulse on Windows.\n2  Choose Phone companion and enable it.\n3  Generate a QR code, then scan it here.\n\nUse the same private Wi-Fi. Your Codex login stays on your PC.", 14, MUTED)); root.addView(intro);
            root.addView(button("Scan pairing QR", true, () -> new IntentIntegrator(this).setDesiredBarcodeFormats(IntentIntegrator.QR_CODE).setPrompt("Scan the QR in Codex Pulse on your PC").setBeepEnabled(false).setOrientationLocked(false).initiateScan()));
            root.addView(button("Paste a pairing link", false, this::paste));
            if (!data.toString().equals("{}")) root.addView(button("Forget damaged connection", false, this::forget));
        } else {
            boolean offline = data.has("error");
            root.addView(text(busy ? "Connecting to your PC…" : offline ? "●  PC offline · saved readings" : "●  Paired · private Wi-Fi", 12, offline ? Color.rgb(223, 178, 120) : ACCENT));
            if (offline) root.addView(text(data.optString("error"), 12, MUTED));
            JSONObject snapshot = data.optJSONObject("snapshot"); JSONArray accounts = snapshot == null ? null : snapshot.optJSONArray("accounts");
            if (accounts == null || accounts.length() == 0) root.addView(text("No account readings yet. Refresh with your PC online.", 15, MUTED));
            else for (int i = 0; i < accounts.length(); i++) { JSONObject account = accounts.optJSONObject(i); if (account != null) account(account, offline); }
            root.addView(button(busy ? "Refreshing…" : "Refresh from PC", true, () -> work(() -> new CompanionClient(this).refresh())));
            root.addView(text("Refresh reads the PC’s latest collected snapshot. It does not sign in, switch accounts, or force extra provider requests.", 11, MUTED));
            AppWidgetManager widgets = AppWidgetManager.getInstance(this);
            root.addView(button("Add home-screen widget", false, () -> {
                if (widgets.isRequestPinAppWidgetSupported()) widgets.requestPinAppWidget(new ComponentName(this, PulseWidget.class), null, null);
                else new AlertDialog.Builder(this).setMessage("Long-press an empty area of your home screen, choose Widgets, then Codex Pulse.").setPositiveButton("OK", null).show();
            }));
            root.addView(button("Forget this PC", false, this::forget));
        }
        root.addView(text("Private by design\nNo analytics. No Codex credentials on your phone. No account-switching controls. Background updates are scheduled by Android.\n\nCompanion 0.2.0 · Android release candidate", 11, MUTED));
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
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(20), dp(18), dp(20), dp(20)); card.setBackground(shape(Color.rgb(31, 36, 27), 23));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.setMargins(0, dp(16), 0, 0); card.setLayoutParams(params);
        TextView name = text(account.optString("label", "Codex account"), 18, TEXT); name.setTypeface(null, Typeface.BOLD); card.addView(name);
        boolean stale = offline || QuotaText.stale(account);
        card.addView(text((stale ? "Saved / stale · " : "") + QuotaText.observed(account), 10, MUTED));
        for (int duration : new int[]{300, 10080}) {
            JSONObject window = QuotaText.window(account, duration); int percent = QuotaText.percent(window);
            LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER_VERTICAL);
            TextView label = text(duration == 300 ? "5-hour limit" : "7-day limit", 13, MUTED); label.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1)); row.addView(label);
            int color = percent < 0 || stale ? MUTED : percent <= 10 ? Color.rgb(231, 133, 126) : percent <= 30 ? Color.rgb(221, 187, 116) : ACCENT;
            row.addView(text(percent < 0 ? "—" : percent + "%", 22, color)); card.addView(row);
            ProgressBar bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); bar.setMax(100); bar.setProgress(Math.max(0, percent)); bar.setProgressTintList(ColorStateList.valueOf(color)); bar.setProgressBackgroundTintList(ColorStateList.valueOf(Color.rgb(51, 60, 42))); bar.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(9))); card.addView(bar);
            card.addView(text(percent < 0 ? "reconnect".equals(account.optString("status")) ? "Reconnect on your PC" : "Not reported" : QuotaText.reset(window), 10, MUTED));
        }
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
            new AlertDialog.Builder(this).setTitle("Trust this PC?").setMessage("Pair with " + pair.getString("endpoint") + "?\n\nOnly continue if you generated this QR/link in your own Codex Pulse app. The phone will pin this PC’s certificate and receive read-only usage access.").setPositiveButton("Pair securely", (dialog, which) -> work(() -> { client.pair(pair); RefreshJob.schedule(this); })).setNegativeButton("Cancel", null).show();
        } catch (Exception error) { message = "Invalid pairing link. Generate a fresh QR code in Pulse on your PC."; render(); }
    }
    private void forget() { new AlertDialog.Builder(this).setTitle("Forget this PC?").setMessage("Removes this phone’s connection and cached readings. You can also revoke the phone in Pulse on your PC.").setPositiveButton("Forget", (dialog, which) -> work(() -> new PhoneStore(this).clear())).setNegativeButton("Cancel", null).show(); }
    @Override protected void onActivityResult(int request, int result, Intent data) { super.onActivityResult(request, result, data); IntentResult scan = IntentIntegrator.parseActivityResult(request, result, data); if (scan != null && scan.getContents() != null) confirmPair(scan.getContents()); }
}
