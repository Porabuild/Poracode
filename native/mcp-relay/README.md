# poracode-mcp-relay

Native Rust port of the Poracode MCP stdio↔HTTP relay (`src/supervisor/mcp/mcpHttpRelay.ts`).
One process per relayed MCP server replaces a Node worker, cutting per-server
private memory from ~17 MB to ~3 MB.

The binary reads its relay configuration from `PORACODE_MCP_HTTP_RELAY_CONFIG`
(the same base64url JSON envelope, version 1, as the JS relay), speaks
newline-delimited JSON-RPC on stdin/stdout, and forwards to a plain-HTTP MCP
endpoint. HTTPS and WSL launches stay on the JS `mcp-relay.mjs` fallback.

- `poracode-mcp-relay --hello` prints a one-line JSON handshake
  (`helper`, `helperVersion`, `relayConfigVersion`, `platform`, `arch`) used by
  `scripts/prepare-mcp-relay.mjs --check`.
- Signals: SIGINT/SIGTERM trigger the same graceful close as stdin EOF
  (pending requests settled, `DELETE` of the MCP session, exit 0).
- Concurrency: stdin parsing stays on the main thread; relayed requests run
  on a bounded on-demand worker pool (max 16) and forwarded
  notifications/replies on a separate small pool (max 4) so a wedged
  endpoint can never starve requests. Idle workers exit after 30 s, leaving
  only the main, timer, and signal threads. The initialize gate resolves
  generations individually, matching the JS relay's per-dispatch promise.
- The unterminated stdin buffer is capped at 10 Mi UTF-16 code units, the
  same unit the JS `buffer.length` check counts.

Build: `cargo build --release`. Stage: `node scripts/prepare-mcp-relay.mjs`.
