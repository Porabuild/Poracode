# Poracode Chrome Extension

A focused chat sidebar for Chrome, Brave, and Edge, with access to your real tabs,
cookies, and logged-in browser sessions through Poracode's Chrome tools.

## Build and load

1. From the repository root, run `pnpm run build:extension`.
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select `dist/chrome-extension/`.
5. Start Poracode and click the extension toolbar icon to open the sidebar.

The extension finds the running local app automatically. There is no connection
screen or token to enter. If the app closes, the extension keeps retrying.
Rebuild and reload the extension after changing the sidebar code.

## Chat

Choose an existing chat or start a new one. The sidebar reuses Poracode's chat
history, composer, provider controls, attachments, and permission prompts. New
sidebar conversations enable supported Chrome tools as an inherent capability;
there is no Chrome plugin chip, toggle, or mention entry in the sidebar. Provider
tool support and host restrictions still apply; existing chats keep the tools
bound when their session started. New chat opens straight to
the composer and uses the server's built-in Home scope; no project setup is
required. Click the centered chat title to search the flat list of GUI chats,
ordered by recent activity with relative timestamps, or
the plus button to start a fresh chat. Provider installation is managed in the
desktop app. The extension always uses desktop chat controls and anchored menus,
even in a narrow sidebar; it does not switch to mobile drawers. Chat selection
and navigation are local to the sidebar and do
not change the Electron app's page. Sidebar preferences do not write through to
desktop settings; conversation messages and runtime actions remain shared.
Reloading restores the visible chat through the shared remote-history and live
subscription lifecycle, without changing desktop navigation.

## Architecture

The sidebar is a client of Poracode's v2 server architecture. It uses the canonical
renderer bootstrap, authenticated HTTP/WebSocket transport, runtime reducer, and
shared chat components. The server owns conversations and provider processes.
The extension worker discovers the local bridge and obtains a single-use local
bootstrap credential; the sidebar exchanges it through the existing pairing
endpoint and uses authenticated transport thereafter.

Browser control remains a separate CDP relay:

```text
Agent → Chrome MCP server → loopback WebSocket → extension worker → chrome.debugger → tabs
```

Sidebar bootstrap protocol version 2 is negotiated separately from CDP, so older
relay clients continue to work. Version 1 was extension 0.2.0's hello, which sent
the raw token; current apps never negotiate it, so a 0.2.0 install gets no chat
credentials until it is updated to 0.2.1. The app answers the hello with a
`helloAck`; when none arrives (an app that predates the sidebar) or it names
another protocol, the sidebar is told Poracode needs an update. If the native
host was not reachable when the connection opened, the worker retries it at most
every 10 seconds while the sidebar or the app is asking, then reconnects and
proves the token.

Several Poracode apps can listen at once, for example an installed release and a
development build. The worker lets only the native host's list of running bridges
pick the port. It uses the dialed port's own entry when there is one, and
otherwise the newest entry: it closes the unknown port without sending anything,
dials that entry, and proves its token there. Each secret is dialed this way at
most once, so a stale or squatted entry cannot cause a reconnect loop. The release
workflow builds the renderer, then copies `dist/chrome-extension/` to
`dist/chrome-extension-store/` for the release zip. Only the upload copy omits
the manifest's public `key`; the unpacked build retains its stable identity.

## Browser control

Ask the agent to use Chrome tools to list tabs, attach to a tab, take a snapshot,
or capture a screenshot. Chrome displays its own debugging banner on controlled
tabs; you can stop control there.

The bridge binds to loopback, but loopback is shared by every local process and
a WebSocket `Origin` header is client-asserted, so the origin alone grants
nothing beyond the CDP relay, and only for the pinned extension ID. Poracode
registers a per-user native messaging host (`com.poracode.chrome_bridge`) on
every start of the installed app or production server; Chrome launches it only
for the pinned ID in `allowed_origins`, and it hands the worker the running
bridge's per-launch token from a private (0700 directory, 0600 file) store. The
token never crosses the socket: the hello carries a fresh nonce and an HMAC of it
bound to the port, and the app must answer with its own HMAC before the worker
requests sidebar credentials or serves any tab or CDP request. Another process
listening on a scanned port therefore gets neither credentials nor browser
control, and an app without this handshake gets no browser control from this
extension version. Only a proven connection from the pinned extension receives
single-use, short-lived sidebar credentials, and only when the local server is
plain-http loopback. HTTP access still requires
authentication. Another OS user or another extension cannot obtain a
credential. A process running as the same OS user can read the same files, so
it is outside this boundary. Eval and cookie access follow the same switches as
the embedded browser under **Settings → Browser**.

Development and smoke runs (`pnpm dev`, unpacked builds, worktrees) do not
register the native host, so they never repoint the installed app's launcher at
a checkout. Set `PORACODE_CHROME_NATIVE_HOST=1` to opt such a run in (for
example a branch server under test); the installed app re-registers its own
runtime on its next start.

The manifest `key` is a public key that pins the extension ID for unpacked
builds; no private key is stored in the repository or the package. Adding the
`nativeMessaging` permission means Chrome asks existing installs to re-approve
permissions once on update.
