package com.codexpulse.companion;

import java.io.IOException;
import org.json.JSONObject;

/** Location can change; the original TLS identity and bearer credential cannot. */
final class EndpointRecovery {
    interface Request { JSONObject fetch(JSONObject connection) throws Exception; }
    interface Locator { String find(String pin); }
    static final class Result {
        final JSONObject connection, snapshot;
        Result(JSONObject connection, JSONObject snapshot) { this.connection = connection; this.snapshot = snapshot; }
    }
    static Result fetch(JSONObject connection, Request request, Locator locator) throws Exception {
        try { return new Result(connection, request.fetch(connection)); }
        catch (IOException unreachable) {
            String previous = connection.getString("endpoint");
            if (EndpointPolicy.validate(previous).getHost().startsWith("100.")) throw unreachable;
            String candidate = locator.find(connection.getString("fingerprint"));
            if (candidate == null || candidate.equals(previous)) throw unreachable;
            EndpointPolicy.validate(candidate);
            if (EndpointPolicy.validate(candidate).getHost().startsWith("100.")) throw unreachable;
            JSONObject relocated = new JSONObject(connection.toString()).put("endpoint", candidate);
            // Even after a TLS failure at an IP now owned by another host,
            // discovery is merely a locator. The request MUST verify the same
            // saved pin before sending a token. Never copy a discovered pin.
            return new Result(relocated, request.fetch(relocated));
        }
    }
    private EndpointRecovery() { }
}
