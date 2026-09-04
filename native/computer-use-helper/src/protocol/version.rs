//! Wire protocol version. Mirrored in TypeScript at
//! `src/shared/contracts/computerUse.ts` (`COMPUTER_USE_HELPER_PROTOCOL_VERSION`);
//! a parity test compares the two.
//!
//! Bump `PROTOCOL_VERSION` on any change to the request/response envelope or to
//! an action's input/result shape. Bump `MIN_CLIENT_PROTOCOL_VERSION` only when
//! deliberately dropping support for older TypeScript clients.

pub const PROTOCOL_VERSION: u32 = 1;
pub const MIN_CLIENT_PROTOCOL_VERSION: u32 = 1;
pub const HELPER_VERSION: &str = env!("CARGO_PKG_VERSION");
