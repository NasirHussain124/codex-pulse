package com.codexpulse.companion;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.google.zxing.BarcodeFormat;
import com.journeyapps.barcodescanner.BarcodeCallback;
import com.journeyapps.barcodescanner.BarcodeResult;
import com.journeyapps.barcodescanner.BarcodeView;
import com.journeyapps.barcodescanner.CameraPreview;
import com.journeyapps.barcodescanner.DefaultDecoderFactory;
import java.util.Collections;

/** In-app scanner: explicit permissions, camera lifecycle, and a safe manual fallback. */
public final class ScannerActivity extends Activity {
    static final int CAMERA_PERMISSION = 82;
    private BarcodeView camera;
    private TextView hint;
    private boolean requested, completed, failed;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); setResult(RESULT_CANCELED);
        requested = state != null && state.getBoolean("requested");
        FrameLayout root = new FrameLayout(this); root.setBackgroundColor(Color.rgb(25, 24, 32));
        setContentView(root);
        try {
            camera = new BarcodeView(this);
            camera.setUseTextureView(false);
            camera.setDecoderFactory(new DefaultDecoderFactory(Collections.singletonList(BarcodeFormat.QR_CODE)));
            root.addView(camera, new FrameLayout.LayoutParams(-1, -1));
            camera.addStateListener(new CameraPreview.StateListener() {
                public void previewSized() { } public void previewStarted() { } public void previewStopped() { } public void cameraClosed() { }
                public void cameraError(Exception error) { runOnUiThread(() -> cameraUnavailable()); }
            });
            camera.decodeContinuous(new BarcodeCallback() {
                public void barcodeResult(BarcodeResult result) {
                    if (completed || result == null || result.getText() == null) return;
                    String text = result.getText();
                    if (!text.startsWith("codexpulse://pair?data=")) { hint.setText("Scan the pairing QR from your PC."); return; }
                    completed = true; pauseCamera();
                    setResult(RESULT_OK, new Intent().putExtra("pairing", text)); finish();
                }
            });
        } catch (RuntimeException error) { failed = true; }
        LinearLayout controls = new LinearLayout(this); controls.setOrientation(LinearLayout.VERTICAL);
        int pad = (int)(20 * getResources().getDisplayMetrics().density);
        controls.setPadding(pad, pad, pad, pad); controls.setBackgroundColor(0xE6252536);
        TextView title = new TextView(this); title.setText("Scan pairing QR"); title.setTextColor(Color.WHITE); title.setTextSize(23); controls.addView(title);
        hint = new TextView(this); hint.setText(failed ? "Camera unavailable. You can paste a pairing link instead." : "Point your camera at the QR in Phone companion on your PC.");
        hint.setTextColor(0xFFE0D7EF); hint.setTextSize(14); hint.setPadding(0, pad / 2, 0, pad / 2); controls.addView(hint);
        Button manual = new Button(this); manual.setText("Use a pairing link instead"); manual.setAllCaps(false);
        manual.setOnClickListener(v -> { setResult(RESULT_CANCELED, new Intent().putExtra("manual", true)); finish(); }); controls.addView(manual);
        Button back = new Button(this); back.setText("Back"); back.setAllCaps(false); back.setOnClickListener(v -> finish()); controls.addView(back);
        FrameLayout.LayoutParams position = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM); root.addView(controls, position);
        root.setOnApplyWindowInsetsListener((v, insets) -> { controls.setPadding(pad, pad, pad, pad + insets.getSystemWindowInsetBottom()); return insets; });
    }
    @Override protected void onResume() {
        super.onResume();
        if (failed || completed) return;
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) resumeCamera();
        else if (!requested) { requested = true; requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION); }
        else hint.setText("Camera access is off. Use a pairing link, or allow Camera in Android settings.");
    }
    @Override protected void onPause() { pauseCamera(); super.onPause(); }
    @Override protected void onSaveInstanceState(Bundle state) { state.putBoolean("requested", requested); super.onSaveInstanceState(state); }
    private void resumeCamera() { try { if (camera != null && !completed && !failed) camera.resume(); } catch (RuntimeException error) { cameraUnavailable(); } }
    private void pauseCamera() { try { if (camera != null) camera.pause(); } catch (RuntimeException ignored) { } }
    private void cameraUnavailable() { failed = true; pauseCamera(); if (hint != null) hint.setText("Camera unavailable. Use a pairing link instead."); }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != CAMERA_PERMISSION) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) resumeCamera();
        else hint.setText("Camera access is off. You can still pair using a link.");
    }
}
