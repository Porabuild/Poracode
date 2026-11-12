//! Native Rust MCP launch helper (`poracode-mcp-relay`).
//!
//! Modes (selected by `PORACODE_MCP_*` environment envelopes):
//! - `PORACODE_MCP_HTTP_RELAY_CONFIG`: stdio↔HTTP host endpoint relay (`relay`)
//! - `PORACODE_MCP_FILTER_CONFIG*`: wire-level schema proxy (`schema_proxy`) and
//!   tool-filtering proxy (`filter_proxy`) for stdio and plain-HTTP upstreams
//! - `PORACODE_MCP_STDIO_CONFIG`: zero-overhead `cwd`/`env` stdio launcher (`stdio_launcher`)
//!
//! The JavaScript workers remain the automatic fallback for `https:` endpoints,
//! legacy SSE transports, `isolateConnectionFailures: true`, non-x64 WSL, and
//! missing or pre-`0.2.0` staged binaries.

pub mod config;
pub mod filter_proxy;
pub mod framing;
pub mod messages;
pub mod relay;
pub mod schema;
pub mod schema_proxy;
pub mod stdio_launcher;
#[cfg(windows)]
pub mod win_spawn;
