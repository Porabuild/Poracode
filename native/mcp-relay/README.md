# poracode-mcp-relay

Native Rust MCP helper (`0.2.0`) replacing per-server Node launch wrappers across:

- `PORACODE_MCP_HTTP_RELAY_CONFIG` (`src/supervisor/mcp/mcpHttpRelay.ts` — stdio↔Streamable HTTP relay, version 1),
- `PORACODE_MCP_STDIO_CONFIG` (`src/supervisor/mcp/mcpStdioWorker.ts` — protocol-transparent cwd/env stdio launcher, version 1), and
- `PORACODE_MCP_FILTER_CONFIG` / `PORACODE_MCP_FILTER_CONFIG_V1` / `PORACODE_MCP_FILTER_CONFIG_V2` / `PORACODE_MCP_FILTER_CONFIG_V3` (`src/supervisor/mcp/mcpToolFilterProxy.ts` + `mcpSchemaProxy.ts` — tool-filtering, schema-pattern normalization, `maxSchemaDepth` bounding, and wire-level `schemaOnly` proxy over stdio and plain-HTTP MCP transports).

One native process per wrapped MCP server replaces a Node/Electron helper worker, cutting per-server private memory from ~35–40 MB (Node MCP SDK filter) or ~15–20 MB (Node stdio/relay worker) to ~2–3 MB, and running directly inside x64 WSL distros via the static musl `linux-x64` build without requiring Node inside WSL.

`https:`/TLS upstreams, legacy `sse` transports, `isolateConnectionFailures: true` sessions, and targets without a staged `0.2.0+` binary (`linux-arm64`, `arm64` WSL distros, macOS SSH archives, or pre-upgrade `0.1.0` binaries) automatically fall back to `mcp-relay.mjs`, `mcp-stdio.mjs`, and `mcp-filter.mjs`.

- `poracode-mcp-relay --hello` prints a one-line JSON handshake
  (`helper`, `helperVersion`, `relayConfigVersion`, `platform`, `arch`) used by
  `scripts/prepare-mcp-relay.mjs --check`; `McpToolFilterService` checks
  `mcp-relay/manifest.json` `helperVersion >= 0.2.0` before selecting extended
  `stdio`/`filter` modes so a staged `0.1.0` binary safely stays on `http` relay
  only.
- Signals: SIGINT/SIGTERM trigger the same graceful close as stdin EOF
  (pending requests settled, child process group/job or HTTP `DELETE` session
  cleaned up, exit 0).
- Concurrency: in HTTP relay mode, stdin parsing stays on the main thread while
  relayed requests run on a bounded on-demand worker pool (max 16) and forwarded
  notifications/replies on a separate small pool (max 4) so a wedged endpoint
  can never starve requests. Idle workers exit after 30 s, leaving only the
  main, timer, and signal threads. The initialize gate resolves generations
  individually, matching the JS relay's per-dispatch promise.
- Framing & schema parity: filter/schema modes support both newline-delimited
  JSON-RPC and `Content-Length` headers, paginate `tools/list`, hide disabled
  and app-only tools, bound nested container schemas via `maxSchemaDepth`, and
  strip invalid ECMA-262 `/u` regex `pattern` keywords from `inputSchema`.
- The unterminated stdin buffer is capped at 10 Mi UTF-16 code units, matching
  the JS `buffer.length` check.

Build: `cargo build --release`. Stage: `node scripts/prepare-mcp-relay.mjs`.
