//! Parallel multi-worktree Git status collection without Git subprocesses.

mod attributes;
mod config;
mod remotes;
mod status;

use crate::git_exec::SubprocessLimiter;
use crate::protocol::{
    NativeFileEntry, NativeGitStatusEntry, NativeProjectTreeEntry, StatusDetail,
};
use crate::search::{NativeSearchCache, SearchParams};
use crate::untracked::UntrackedStatsCache;
use std::collections::{BTreeMap, HashSet};
use std::path::Path;
use std::sync::Mutex;
use std::thread;

/// Ignore-only bursts still refresh file views, but need no Git status scan.
pub(crate) fn changes_may_affect_status(
    root: &Path,
    paths: &HashSet<String>,
    previous_config: &mut Option<u64>,
) -> bool {
    if paths.is_empty()
        || [
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_INDEX_FILE",
            "GIT_CONFIG_COUNT",
            "GIT_CONFIG_PARAMETERS",
            "GIT_CONFIG_GLOBAL",
            "GIT_CONFIG_SYSTEM",
            "GIT_CONFIG_NOSYSTEM",
        ]
        .iter()
        .any(|name| std::env::var_os(name).is_some())
    {
        return true;
    }
    let mut check = || -> Result<bool, git2::Error> {
        let repo = git2::Repository::open(root)?;
        if repo
            .workdir()
            .and_then(|path| std::fs::canonicalize(path).ok())
            .as_deref()
            != Some(root)
        {
            return Ok(true);
        }
        let (config, fingerprint) = config::resolved_for_watch(&repo)?;
        if previous_config.replace(fingerprint) != Some(fingerprint) {
            return Ok(true);
        }
        match config.get_bool("core.sparsecheckout") {
            Ok(true) => return Ok(true),
            Err(error) if error.code() != git2::ErrorCode::NotFound => return Err(error),
            _ => {}
        }
        let index = repo.index()?;
        for name in paths {
            let path = Path::new(name);
            if matches!(
                path.file_name().and_then(|name| name.to_str()),
                Some(".gitignore" | ".gitattributes" | ".gitmodules" | ".gitconfig")
            ) || name == "git/ignore"
                || name.ends_with("/git/ignore")
                || name == "git/config"
                || name.ends_with("/git/config")
                || (0..=3).any(|stage| index.get_path(path, stage).is_some())
                || index.find_prefix(format!("{name}/")).is_ok()
                || path
                    .ancestors()
                    .skip(1)
                    .filter(|parent| !parent.as_os_str().is_empty())
                    .any(|parent| index.get_path(parent, 0).is_some())
                || !repo.is_path_ignored(path)?
            {
                return Ok(true);
            }
        }
        Ok(false)
    };
    // Config, index, non-repository and topology uncertainty must refresh Git.
    check().unwrap_or(true)
}

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
