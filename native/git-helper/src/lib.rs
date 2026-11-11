//! Native Rust helper for Poracode's parallel Git status and multi-worktree
//! batch queries. Ports the parsing and untracked-file line/binary counting in
//! `src/supervisor/git/statusParsing.ts` and `src/supervisor/git/statusService.ts`
//! onto a bounded Rust OS thread pool; WSL and missing-binary targets fall back
//! to the TypeScript supervisor implementation.

pub mod git_exec;
pub mod parser;
pub mod protocol;
pub mod service;
pub mod untracked;
