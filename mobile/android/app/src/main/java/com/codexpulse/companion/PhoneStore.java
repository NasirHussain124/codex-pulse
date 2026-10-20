package com.codexpulse.companion;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public final class PhoneStore {
    private static final String KEY = "codex-pulse-companion-v1";
    private final Context context;
    public PhoneStore(Context context) { this.context = context.getApplicationContext(); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(KEY)) return (SecretKey)store.getKey(KEY, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    public synchronized JSONObject read() throws Exception {
        String encoded = context.getSharedPreferences("pulse", Context.MODE_PRIVATE).getString("encrypted", null);
        if (encoded == null) return new JSONObject();
        JSONObject envelope = new JSONObject(encoded); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("data"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
    }
    public synchronized void write(JSONObject data) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        JSONObject envelope = new JSONObject().put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).put("data", Base64.encodeToString(cipher.doFinal(data.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
        if (!context.getSharedPreferences("pulse", Context.MODE_PRIVATE).edit().putString("encrypted", envelope.toString()).commit()) throw new Exception("Could not save phone connection.");
    }
    public synchronized void update(String field, Object value) throws Exception { JSONObject data = read(); data.put(field, value); write(data); }
    public synchronized void clear() throws Exception { if (!context.getSharedPreferences("pulse", Context.MODE_PRIVATE).edit().clear().commit()) throw new Exception("Could not forget this connection. Try again."); }
}
