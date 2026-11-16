//! Native Rust helper for Poracode's parallel Git status, multi-worktree batch
//! queries, and arena-allocated project file/tree search indexing. Ports the
//! parsing, untracked line/binary counting, and search scoring in
//! `src/supervisor/git/statusParsing.ts`, `src/supervisor/git/statusService.ts`,
//! `src/supervisor/ProjectSearchIndex.ts`, and `src/supervisor/fileIndex.ts`
//! onto a bounded Rust OS thread pool; WSL and missing-binary targets fall back
//! to the TypeScript supervisor implementation.

pub mod git_exec;
pub mod parser;
pub mod protocol;
pub mod search;
pub mod service;
pub mod untracked;
pub mod watch;
