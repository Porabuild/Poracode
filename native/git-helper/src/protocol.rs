//! NDJSON wire protocol and version handshake for `poracode-git-helper`.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Helper identifier emitted by `--hello` and validated by staging.
pub const HELLO_HELPER: &str = "poracode-git-helper";

/// Must match `GIT_HELPER_PROTOCOL_VERSION` in
/// `src/supervisor/git/gitNativeHelperProtocol.ts`.
pub const GIT_HELPER_PROTOCOL_VERSION: u32 = 1;

/// Detail level requested for a status query.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StatusDetail {
    /// Lightweight summary (`status --porcelain=v2 -b` + `ls-files --others`).
    Summary,
    /// Full status including staged/unstaged numstat, untracked line counts, and merge state.
    Full,
}

/// One changed or untracked file entry, matching `GitFileChange` in TypeScript.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChange {
    /// Normalized forward-slash repository-relative path.
    pub path: String,
    /// Previous path when `status` represents a rename/copy.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    /// Single-character porcelain v2 status (`M`, `A`, `D`, `R`, `C`, `?`, `U`, ...).
    pub status: String,
    /// Whether this entry belongs to the staged index side.
    pub staged: bool,
    /// Line insertions (`0` for binaries, summary queries, or deleted files).
    pub insertions: usize,
    /// Line deletions (`0` for binaries, summary queries, or untracked files).
    pub deletions: usize,
}

/// Raw status result returned per worktree by the helper before optional
/// host-side SSH remote alias resolution.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGitStatusEntry {
    /// Detail marker (`"summary"` for summary queries, omitted for full queries).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    /// True when `git rev-parse --is-inside-work-tree` / `git status` succeeded.
    pub is_repo: bool,
    /// Current branch name (or `(detached)` / empty).
    pub branch: String,
    /// Current `HEAD` commit OID when present.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    /// Upstream tracking ref (after clearing inherited fork start-points).
    pub tracking: String,
    /// Whether at least one remote (or tracking branch in summary mode) exists.
    pub has_remote: bool,
    /// Raw `git remote -v` output on full queries so TypeScript can apply
    /// `parseRemoteInfo` + `resolveGitRemoteInfo` identically.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_output: Option<String>,
    /// Commits ahead of upstream.
    pub ahead: usize,
    /// Commits behind upstream.
    pub behind: usize,
    /// Staged index changes.
    pub staged: Vec<GitFileChange>,
    /// Unstaged working-tree changes (including expanded untracked files).
    pub unstaged: Vec<GitFileChange>,
    /// Sum of insertions across `staged` and `unstaged`.
    pub total_insertions: usize,
    /// Sum of deletions across `staged` and `unstaged`.
    pub total_deletions: usize,
    /// Set to `true` when unmerged (`u `) entries exist.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_in_progress: Option<bool>,
    /// Unmerged conflict entries when `merge_in_progress == Some(true)`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict_files: Option<Vec<GitFileChange>>,
    /// Cleaned `MERGE_MSG` body when `merge_in_progress == Some(true)` and non-empty.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_message: Option<String>,
}

/// Request envelope sent over stdin NDJSON.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelperRequest {
    /// Wire protocol version; anything other than [`GIT_HELPER_PROTOCOL_VERSION`] fails closed.
    pub protocol_version: u32,
    /// Caller correlation ID echoed back in [`HelperResponse`].
    pub id: u64,
    /// Request kind (`"statusBatch"` or `"ping"`).
    pub kind: String,
    /// Worktree filesystem paths to inspect (for `"statusBatch"`).
    #[serde(default)]
    pub paths: Vec<String>,
    /// Requested detail level (`"summary"` or `"full"`).
    #[serde(default = "default_detail")]
    pub detail: StatusDetail,
    /// Per-command Git execution timeout in milliseconds.
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    /// Maximum concurrent `git` subprocesses spawned for this request (aligned
    /// with the supervisor's admitted short-permit grant).
    #[serde(default = "default_max_concurrency")]
    pub max_concurrency: usize,
}

fn default_detail() -> StatusDetail {
    StatusDetail::Full
}

fn default_timeout_ms() -> u64 {
    10_000
}

fn default_max_concurrency() -> usize {
    8
}

/// Response envelope written as a single JSON line to stdout.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelperResponse {
    /// Wire protocol version (`1`).
    pub protocol_version: u32,
    /// Correlation ID matching [`HelperRequest::id`].
    pub id: u64,
    /// Whether the request succeeded.
    pub ok: bool,
    /// Per-path status map when `ok == true` on `"statusBatch"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub statuses: Option<BTreeMap<String, NativeGitStatusEntry>>,
    /// Error description when `ok == false`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl HelperResponse {
    /// Construct a successful `statusBatch` response.
    #[must_use]
    pub fn ok_statuses(id: u64, statuses: BTreeMap<String, NativeGitStatusEntry>) -> Self {
        Self {
            protocol_version: GIT_HELPER_PROTOCOL_VERSION,
            id,
            ok: true,
            statuses: Some(statuses),
            error: None,
        }
    }

    /// Construct a successful empty response (e.g. `ping`).
    #[must_use]
    pub fn ok_empty(id: u64) -> Self {
        Self {
            protocol_version: GIT_HELPER_PROTOCOL_VERSION,
            id,
            ok: true,
            statuses: None,
            error: None,
        }
    }

    /// Construct an error response.
    #[must_use]
    pub fn err(id: u64, message: impl Into<String>) -> Self {
        Self {
            protocol_version: GIT_HELPER_PROTOCOL_VERSION,
            id,
            ok: false,
            statuses: None,
            error: Some(message.into()),
        }
    }
}
