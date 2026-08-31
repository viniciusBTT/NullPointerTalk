livekit-client.esm.min.js — vendored from livekit-client@2.22.0 (npm), via jsDelivr. To upgrade: re-download https://cdn.jsdelivr.net/npm/livekit-client@<version>/dist/livekit-client.esm.min.mjs, strip the sourceMappingURL comment, and save it here with a .js extension (not .mjs - Spring's default static resource MIME mapping doesn't recognize .mjs, and browsers reject an ES module served as application/octet-stream).

stomp.umd.min.js — vendored from @stomp/stompjs@7.3.0 (npm), via jsDelivr:
https://cdn.jsdelivr.net/npm/@stomp/stompjs@<version>/bundles/stomp.umd.min.js
Deliberately the UMD bundle, not an ES module: unlike livekit-client, this package does not
publish a single-file ESM bundle (only a multi-file esm6/ tree with internal relative
imports, which isn't a drop-in the way esm.min.mjs is). So this one is loaded via a plain
non-module <script src="..."> tag in shell.html, placed BEFORE the
<script type="module" src="/js/app.js"> tag - non-module scripts run in document order
during parsing, while type="module" scripts are always deferred until after parsing, so
window.StompJs (the UMD global this bundle exposes) is guaranteed to exist before any ES
module code runs. No SockJS fallback vendored: this app has no legacy-browser
accommodation anywhere else (native WebSocket is already required for LiveKit's own
signaling), so there's nothing here that needs it.
