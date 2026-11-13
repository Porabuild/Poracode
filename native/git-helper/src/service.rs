//! Parallel multi-worktree Git status collection without Git subprocesses.

mod attributes;
mod config;
mod remotes;
mod status;
mod tree;

use crate::git_exec::SubprocessLimiter;
use crate::protocol::{
    NativeFileEntry, NativeGitStatusEntry, NativeProjectTreeEntry, StatusDetail,
};
use crate::search::{NativeSearchCache, SearchParams};
use crate::untracked::UntrackedStatsCache;
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::thread;

/// Stateful service owning untracked-file statistics and project search indexes.
#[derive(Debug, Default)]
pub struct GitHelperService {
    untracked_cache: UntrackedStatsCache,
    search_cache: NativeSearchCache,
}

impl GitHelperService {
    /// Construct a new service with empty, process-local caches.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// List a contained directory without spawning Git or using the host's IO pool.
    pub fn list_tree(
        &self,
        root_path: &str,
        directory_path: &str,
        timeout_ms: u64,
    ) -> Result<Vec<NativeProjectTreeEntry>, String> {
        tree::list(root_path, directory_path, timeout_ms).map_err(|error| error.to_string())
    }

    /// Execute tree search; this independent route can still start Git.
    pub fn search_tree(&self, params: &SearchParams<'_>) -> Vec<NativeProjectTreeEntry> {
        self.search_cache
            .search_tree(params, &SubprocessLimiter::new(2))
    }

    /// Execute file search; this independent route can still start Git.
    pub fn search_files(&self, params: &SearchParams<'_>) -> (Vec<NativeFileEntry>, usize) {
        self.search_cache
            .search_files(params, &SubprocessLimiter::new(2))
    }

    /// Invalidate search indexes for one root, or all roots when absent.
    pub fn invalidate_search(&self, root_path: Option<&str>) {
        self.search_cache.invalidate(root_path);
    }

    /// Collect a bounded parallel batch. Transient repository failures are
    /// omitted, allowing single-path callers to use the TypeScript fallback and
    /// batch callers to preserve prior rows rather than report a clean/non-repo.
    /// The client still owns the request deadline and helper process lifetime.
    pub fn status_batch(
        &self,
        paths: &[String],
        detail: StatusDetail,
        timeout_ms: u64,
        max_concurrency: usize,
    ) -> Result<BTreeMap<String, NativeGitStatusEntry>, String> {
        let worker_count = paths.len().min(max_concurrency.clamp(1, 16));
        let queue = Mutex::new(0usize);
        let results = Mutex::new(BTreeMap::new());
        let unsupported = Mutex::new(false);
        thread::scope(|scope| {
            for _ in 0..worker_count {
                scope.spawn(|| {
                    loop {
                        let index = {
                            let mut next = queue
                                .lock()
                                .unwrap_or_else(|poisoned| poisoned.into_inner());
                            if *next >= paths.len() {
                                break;
                            }
                            let current = *next;
                            *next += 1;
                            current
                        };
                        let path = &paths[index];
                        match status::collect(path, detail, &self.untracked_cache, timeout_ms) {
                            Ok(entry) => {
                                results
                                    .lock()
                                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                                    .insert(path.clone(), entry);
                            }
                            Err(error) if requires_fallback(&error) => {
                                *unsupported
                                    .lock()
                                    .unwrap_or_else(|poisoned| poisoned.into_inner()) = true;
                            }
                            Err(_) => {}
                        }
                    }
                });
            }
        });
        if unsupported
            .into_inner()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
        {
            Err("Native Git repository or configuration requires TypeScript fallback".to_owned())
        } else {
            Ok(results
                .into_inner()
                .unwrap_or_else(|poisoned| poisoned.into_inner()))
        }
    }
}

fn requires_fallback(error: &git2::Error) -> bool {
    use git2::ErrorClass;
    match error.class() {
        ErrorClass::Config => true,
        // These pinned libgit2 diagnostics identify persistent format limits,
        // unlike corrupt/missing indexes or transient filesystem failures.
        ErrorClass::Repository => {
            error.message().starts_with("unknown object format ")
                || error.message().starts_with("unsupported extension name ")
                || error
                    .message()
                    .starts_with("unsupported repository version ")
        }
        ErrorClass::Index => error
            .message()
            .starts_with("unsupported mandatory extension:"),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::requires_fallback;
    use git2::{Error, ErrorClass, ErrorCode};

    #[test]
    fn persistent_format_limits_require_fallback_but_corruption_remains_transient() {
        for (class, message) in [
            (ErrorClass::Repository, "unknown object format 'sha256'"),
            (
                ErrorClass::Repository,
                "unsupported extension name extensions.refstorage",
            ),
            (
                ErrorClass::Repository,
                "unsupported repository version 2; only versions up to 1 are supported",
            ),
            (ErrorClass::Index, "unsupported mandatory extension: 'link'"),
            (ErrorClass::Index, "unsupported mandatory extension: 'sdir'"),
        ] {
            assert!(requires_fallback(&Error::new(
                ErrorCode::Invalid,
                class,
                message
            )));
        }
        assert!(!requires_fallback(&Error::new(
            ErrorCode::Invalid,
            ErrorClass::Index,
            "invalid data in index - incorrect header signature",
        )));
    }
}
