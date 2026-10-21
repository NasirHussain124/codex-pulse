package com.codexpulse.companion;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.google.zxing.BarcodeFormat;
import com.journeyapps.barcodescanner.BarcodeCallback;
import com.journeyapps.barcodescanner.BarcodeResult;
import com.journeyapps.barcodescanner.BarcodeView;
import com.journeyapps.barcodescanner.CameraPreview;
import com.journeyapps.barcodescanner.DefaultDecoderFactory;
import java.util.Collections;

/** Full-screen QR camera. Camera/permission behavior is unchanged from the verified 0.4 flow. */
public final class ScannerActivity extends Activity {
    static final int CAMERA_PERMISSION = 82;
    private BarcodeView camera;
    private TextView hint;
    private ImageButton flash;
    private boolean requested, completed, failed, torch;
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); setResult(RESULT_CANCELED);
        requested = state != null && state.getBoolean("requested");
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.TRANSPARENT); getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        FrameLayout root = new FrameLayout(this); root.setBackgroundColor(0xFF111217); setContentView(root);
        try {
            camera = new BarcodeView(this); camera.setUseTextureView(false);
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
                    if (!text.startsWith("codexpulse://pair?data=")) { hint.setText(R.string.scan_wrong_qr); return; }
                    completed = true; pauseCamera();
                    root.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                    setResult(RESULT_OK, new Intent().putExtra("pairing", text)); finish();
                }
            });
        } catch (RuntimeException error) { failed = true; }
        Viewfinder frame = new Viewfinder(this); frame.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO); root.addView(frame, new FrameLayout.LayoutParams(-1, -1));
        boolean landscape = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        View shadeTop = new View(this); shadeTop.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xBC111217, 0x00111217}));
        root.addView(shadeTop, new FrameLayout.LayoutParams(-1, dp(155), Gravity.TOP));
        View shadeBottom = new View(this); shadeBottom.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0x00111217, 0xEC111217}));
        root.addView(shadeBottom, new FrameLayout.LayoutParams(-1, dp(landscape ? 160 : 280), Gravity.BOTTOM));

        LinearLayout top = new LinearLayout(this); top.setGravity(Gravity.CENTER_VERTICAL); top.setPadding(dp(20), dp(12), dp(20), dp(12));
        ImageButton close = iconButton(false, getString(R.string.scan_close)); close.setOnClickListener(v -> finish()); top.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));
        TextView title = new TextView(this); title.setText(R.string.scan_title); title.setTextColor(Color.WHITE); title.setTextSize(15); title.setGravity(Gravity.CENTER); title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        top.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        flash = iconButton(true, getString(R.string.scan_flash_on)); flash.setOnClickListener(v -> toggleTorch()); top.addView(flash, new LinearLayout.LayoutParams(dp(48), dp(48)));
        root.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        LinearLayout bottom = new LinearLayout(this); bottom.setOrientation(LinearLayout.VERTICAL); bottom.setGravity(Gravity.CENTER_HORIZONTAL); bottom.setPadding(dp(26), dp(12), dp(26), dp(24));
        TextView heading = new TextView(this); heading.setText(R.string.scan_heading); heading.setTextSize(22); heading.setTextColor(Color.WHITE); heading.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL)); heading.setGravity(Gravity.CENTER);
        if (!landscape) bottom.addView(heading);
        hint = new TextView(this); hint.setText(failed ? R.string.scan_unavailable : R.string.scan_align);
        hint.setTextColor(0xFFCCCDD5); hint.setTextSize(13); hint.setMaxLines(2); hint.setGravity(Gravity.CENTER); hint.setPadding(0, dp(8), 0, dp(18)); bottom.addView(hint);
        Button manual = new Button(this); manual.setText(R.string.scan_manual); manual.setAllCaps(false); manual.setTextSize(14); manual.setTextColor(Color.WHITE); manual.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL)); manual.setMinHeight(dp(52)); manual.setMinimumWidth(0);
        GradientDrawable pill = new GradientDrawable(); pill.setColor(0xBC292932); pill.setCornerRadius(dp(28)); pill.setStroke(dp(1), 0x30FFFFFF); manual.setBackground(new RippleDrawable(ColorStateList.valueOf(0x35FFFFFF), pill, null));
        manual.setPadding(dp(26), dp(10), dp(26), dp(10));
        manual.setOnClickListener(v -> { setResult(RESULT_CANCELED, new Intent().putExtra("manual", true)); finish(); });
        bottom.addView(manual, new LinearLayout.LayoutParams(-2, dp(52)));
        root.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            top.setPadding(dp(20) + insets.getSystemWindowInsetLeft(), dp(12) + insets.getSystemWindowInsetTop(), dp(20) + insets.getSystemWindowInsetRight(), dp(12));
            bottom.setPadding(dp(26) + insets.getSystemWindowInsetLeft(), dp(12), dp(26) + insets.getSystemWindowInsetRight(), dp(24) + insets.getSystemWindowInsetBottom());
            return insets;
        });
        updateFlashButton();
    }
    private ImageButton iconButton(boolean bolt, String description) {
        ImageButton button = new ImageButton(this); button.setImageDrawable(new CameraIcon(bolt)); button.setContentDescription(description);
        GradientDrawable circle = new GradientDrawable(); circle.setShape(GradientDrawable.OVAL); circle.setColor(0x66292932);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x40FFFFFF), circle, null)); button.setPadding(dp(13), dp(13), dp(13), dp(13)); return button;
    }
    private void updateFlashButton() {
        if (flash == null) return;
        boolean supported = getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH);
        flash.setEnabled(supported && !failed && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED);
        flash.setAlpha(flash.isEnabled() ? 1f : .45f); flash.setSelected(torch);
        flash.setContentDescription(getString(torch ? R.string.scan_flash_off : R.string.scan_flash_on));
    }
    private void toggleTorch() {
        try { if (camera != null) { camera.setTorch(!torch); torch = !torch; } } catch (RuntimeException error) { torch = false; hint.setText(R.string.scan_flash_unavailable); }
        updateFlashButton();
    }
    @Override protected void onResume() {
        super.onResume(); updateFlashButton(); if (failed || completed) return;
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) resumeCamera();
        else if (!requested) { requested = true; requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION); }
        else hint.setText(R.string.scan_allow);
    }
    @Override protected void onPause() { pauseCamera(); super.onPause(); }
    @Override protected void onSaveInstanceState(Bundle state) { state.putBoolean("requested", requested); super.onSaveInstanceState(state); }
    private void resumeCamera() { try { if (camera != null && !completed && !failed) camera.resume(); } catch (RuntimeException error) { cameraUnavailable(); } }
    private void pauseCamera() { try { if (camera != null) { camera.setTorch(false); camera.pause(); } } catch (RuntimeException ignored) { } torch = false; updateFlashButton(); }
    private void cameraUnavailable() { failed = true; pauseCamera(); if (hint != null) hint.setText(R.string.scan_unavailable); }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != CAMERA_PERMISSION) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) resumeCamera();
        else hint.setText(R.string.scan_denied);
        updateFlashButton();
    }

    static final class CameraIcon extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        CameraIcon(boolean bolt) {
            paint.setColor(Color.WHITE); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(1.8f); paint.setStrokeCap(Paint.Cap.ROUND); paint.setStrokeJoin(Paint.Join.ROUND);
            if (bolt) { path.moveTo(13, 2); path.lineTo(5, 13); path.lineTo(11, 13); path.lineTo(10, 22); path.lineTo(19, 10); path.lineTo(13, 10); path.close(); }
            else { path.moveTo(6, 6); path.lineTo(18, 18); path.moveTo(18, 6); path.lineTo(6, 18); }
        }
        public void draw(Canvas canvas) {
            canvas.save(); canvas.translate(getBounds().left, getBounds().top); canvas.scale(getBounds().width() / 24f, getBounds().height() / 24f);
            canvas.drawPath(path, paint); canvas.restore();
        }
        public void setAlpha(int alpha) { paint.setAlpha(alpha); } public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); } public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }
    static final class Viewfinder extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path dim = new Path(), edge = new Path();
        private final RectF box = new RectF();
        private final float density;
        Viewfinder(android.content.Context context) { super(context); density = getResources().getDisplayMetrics().density; }
        RectF frameBounds(int width, int height) {
            float side = Math.min(width * .74f, Math.min(height * .40f, 310 * density));
            return new RectF((width - side) / 2, (height - side) / 2, (width + side) / 2, (height + side) / 2);
        }
        @Override protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
            super.onSizeChanged(width, height, oldWidth, oldHeight); box.set(frameBounds(width, height)); float radius = 25 * density;
            dim.reset(); dim.setFillType(Path.FillType.EVEN_ODD); dim.addRect(0, 0, width, height, Path.Direction.CW); dim.addRoundRect(box, radius, radius, Path.Direction.CW);
            edge.reset(); edge.moveTo(box.left, box.top + 46 * density); edge.lineTo(box.left, box.top + radius); edge.quadTo(box.left, box.top, box.left + radius, box.top); edge.lineTo(box.left + 46 * density, box.top);
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas); float radius = 25 * density;
            paint.setStyle(Paint.Style.FILL); paint.setColor(0x50000000); canvas.drawPath(dim, paint);
            paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(density); paint.setColor(0x35FFFFFF); canvas.drawRoundRect(box, radius, radius, paint);
            paint.setStrokeWidth(3 * density); paint.setStrokeCap(Paint.Cap.ROUND); paint.setColor(0xFFF0EFF8);
            for (int corner = 0; corner < 4; corner++) {
                canvas.save(); canvas.rotate(90 * corner, box.centerX(), box.centerY());
                canvas.drawPath(edge, paint); canvas.restore();
            }
        }
    }
}
