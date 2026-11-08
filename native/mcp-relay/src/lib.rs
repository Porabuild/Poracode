//! Native Rust port of Poracode's MCP stdio↔HTTP relay. Behavior mirrors
//! `src/supervisor/mcp/mcpHttpRelay.ts`, `mcpHttpRelayWorker.ts`, and
//! `readMcpHttpRelayConfig` in `mcpToolFilterConfig.ts`; the JS relay remains
//! the fallback for HTTPS endpoints, WSL launches, and missing binaries.

pub mod config;
pub mod messages;
pub mod relay;
