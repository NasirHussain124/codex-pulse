package com.codexpulse.companion;
import org.json.JSONObject;

final class AccountText {
    static String name(JSONObject account) {
        String label = account.optString("label", "").trim(), email = account.optString("email", "").trim();
        if (!label.isEmpty() && !label.matches("Account \\d+")) return label;
        if (!email.isEmpty()) return email.split("@", 2)[0];
        return label.isEmpty() ? "Codex account" : label;
    }
    static String widgetName(JSONObject account) {
        String name = name(account), email = account.optString("email", "").trim();
        return !email.isEmpty() && (name.equals(email.split("@", 2)[0]) || name.matches("Account \\d+")) ? email : name;
    }
}
