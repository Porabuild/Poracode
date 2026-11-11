//! Parallel multi-worktree Git status batch execution in Rust.

use crate::git_exec::{SubprocessLimiter, run_git_command};
use crate::parser::{
    ParsedPorcelainStatus, apply_numstat_counts, expand_untracked_entries, has_remote_lines,
    is_inherited_start_point_upstream, parse_diff_numstat, parse_status_porcelain_v2,
    strip_commit_message_comments, sum_change_totals,
};
use crate::protocol::{GitFileChange, NativeGitStatusEntry, StatusDetail};
use crate::untracked::UntrackedStatsCache;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

const LS_FILES_UNTRACKED_ARGS: &[&str] = &["ls-files", "--others", "--exclude-standard", "-z"];
const MAX_MERGE_MESSAGE_BYTES: u64 = 64 * 1024;

/// Stateful service owning the untracked-file `(size, mtime)` cache across
/// requests for the lifetime of the helper daemon.
#[derive(Debug, Default)]
pub struct GitHelperService {
    untracked_cache: UntrackedStatsCache,
}

impl GitHelperService {
    /// Construct a new [`GitHelperService`].
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Execute a parallel `statusBatch` across `paths`. Worktrees that cannot
    /// be opened at the OS level (e.g. deleted directory during race) are omitted
    /// when `paths.len() > 1` or returned as non-repo for single-path queries,
    /// matching `GitStatusService` + `GitService.getWorktreeStatusBatch`.
    pub fn status_batch(
        &self,
        paths: &[String],
        detail: StatusDetail,
        timeout_ms: u64,
        max_concurrency: usize,
    ) -> BTreeMap<String, NativeGitStatusEntry> {
        if paths.is_empty() {
            return BTreeMap::new();
        }
        let timeout = Duration::from_millis(timeout_ms.max(250));
        let limiter = SubprocessLimiter::new(max_concurrency.clamp(1, 32));

        if paths.len() == 1 {
            let path = &paths[0];
            let mut out = BTreeMap::new();
            let entry = match detail {
                StatusDetail::Summary => self.collect_summary(path, timeout, &limiter),
                StatusDetail::Full => self.collect_full(path, timeout, &limiter),
            };
            out.insert(path.clone(), entry);
            return out;
        }

        let worker_count = paths.len().min(max_concurrency.clamp(1, 16));
        let queue: Mutex<usize> = Mutex::new(0);
        let results: Mutex<BTreeMap<String, NativeGitStatusEntry>> = Mutex::new(BTreeMap::new());

        thread::scope(|scope| {
            for _ in 0..worker_count {
                scope.spawn(|| {
                    loop {
                        let idx = {
                            let mut next = match queue.lock() {
                                Ok(guard) => guard,
                                Err(poisoned) => poisoned.into_inner(),
                            };
                            if *next >= paths.len() {
                                break;
                            }
                            let current = *next;
                            *next += 1;
                            current
                        };
                        let path = &paths[idx];
                        let entry = match detail {
                            StatusDetail::Summary => self.collect_summary(path, timeout, &limiter),
                            StatusDetail::Full => self.collect_full(path, timeout, &limiter),
                        };
                        let mut map = match results.lock() {
                            Ok(guard) => guard,
                            Err(poisoned) => poisoned.into_inner(),
                        };
                        map.insert(path.clone(), entry);
                    }
                });
            }
        });

        match results.into_inner() {
            Ok(map) => map,
            Err(poisoned) => poisoned.into_inner(),
        }
    }

    fn collect_summary(
        &self,
        cwd: &str,
        timeout: Duration,
        limiter: &SubprocessLimiter,
    ) -> NativeGitStatusEntry {
        if !Path::new(cwd).is_dir() {
            return non_repo_summary_entry();
        }

        let Ok(status_out) =
            run_git_command(cwd, &["status", "--porcelain=v2", "-b"], timeout, limiter)
        else {
            return non_repo_summary_entry();
        };
        if !status_out.ok {
            return non_repo_summary_entry();
        }

        let mut parsed = parse_status_porcelain_v2(&status_out.stdout);
        // Only spawn `git ls-files --others` when porcelain actually reported
        // collapsed `? dir/` untracked directories! Individual `? file.txt`
        // entries are already listed in `status --porcelain=v2`.
        if parsed
            .unstaged
            .iter()
            .any(|f| f.status == "?" && f.path.ends_with('/'))
        {
            let untracked_stdout =
                match run_git_command(cwd, LS_FILES_UNTRACKED_ARGS, timeout, limiter) {
                    Ok(out) if out.ok => out.stdout,
                    _ => String::new(),
                };
            expand_untracked_entries(&mut parsed, &untracked_stdout);
        }
        clear_inherited_start_point_upstream(cwd, &mut parsed, timeout, limiter);

        let (merge_in_progress, conflict_files) = if parsed.merge_in_progress {
            let conflicts = parsed
                .conflict_files
                .iter()
                .map(|path| GitFileChange {
                    path: path.clone(),
                    old_path: None,
                    status: "U".to_owned(),
                    staged: false,
                    insertions: 0,
                    deletions: 0,
                })
                .collect();
            (Some(true), Some(conflicts))
        } else {
            (None, None)
        };

        NativeGitStatusEntry {
            detail: Some("summary".to_owned()),
            is_repo: true,
            branch: parsed.branch,
            head_sha: if parsed.head_sha.is_empty() {
                None
            } else {
                Some(parsed.head_sha)
            },
            has_remote: !parsed.tracking.is_empty(),
            tracking: parsed.tracking,
            remote_output: None,
            ahead: parsed.ahead,
            behind: parsed.behind,
            staged: parsed.staged,
            unstaged: parsed.unstaged,
            total_insertions: 0,
            total_deletions: 0,
            merge_in_progress,
            conflict_files,
            merge_message: None,
        }
    }

    fn collect_full(
        &self,
        cwd: &str,
        timeout: Duration,
        limiter: &SubprocessLimiter,
    ) -> NativeGitStatusEntry {
        if !Path::new(cwd).is_dir() {
            return non_repo_full_entry();
        }

        // Probe with `status --porcelain=v2 -b` directly: it exits 128 on
        // non-repositories just like `rev-parse --is-inside-work-tree`, saving
        // an entire sequential `git.exe` spawn on every full refresh!
        let Ok(status_out) =
            run_git_command(cwd, &["status", "--porcelain=v2", "-b"], timeout, limiter)
        else {
            return non_repo_full_entry();
        };
        if !status_out.ok {
            return non_repo_full_entry();
        }

        let mut parsed = parse_status_porcelain_v2(&status_out.stdout);
        let need_staged_numstat = !parsed.staged.is_empty();
        let need_unstaged_numstat = parsed.unstaged.iter().any(|f| f.status != "?");
        let need_ls_files = parsed
            .unstaged
            .iter()
            .any(|f| f.status == "?" && f.path.ends_with('/'));

        let (remote_res, staged_res, unstaged_res, ls_res) = thread::scope(|scope| {
            let r = scope.spawn(|| run_git_command(cwd, &["remote", "-v"], timeout, limiter));
            let st = scope.spawn(|| {
                if need_staged_numstat {
                    Some(run_git_command(
                        cwd,
                        &["diff", "--cached", "--numstat"],
                        timeout,
                        limiter,
                    ))
                } else {
                    None
                }
            });
            let un = scope.spawn(|| {
                if need_unstaged_numstat {
                    Some(run_git_command(
                        cwd,
                        &["diff", "--numstat"],
                        timeout,
                        limiter,
                    ))
                } else {
                    None
                }
            });
            let ls = scope.spawn(|| {
                if need_ls_files {
                    Some(run_git_command(
                        cwd,
                        LS_FILES_UNTRACKED_ARGS,
                        timeout,
                        limiter,
                    ))
                } else {
                    None
                }
            });

            (
                r.join()
                    .unwrap_or_else(|_| Err("remote thread panicked".to_owned())),
                st.join()
                    .unwrap_or_else(|_| Some(Err("staged numstat thread panicked".to_owned()))),
                un.join()
                    .unwrap_or_else(|_| Some(Err("unstaged numstat thread panicked".to_owned()))),
                ls.join()
                    .unwrap_or_else(|_| Some(Err("ls-files thread panicked".to_owned()))),
            )
        });

        let remote_stdout = match remote_res {
            Ok(out) if out.ok => out.stdout,
            _ => String::new(),
        };
        // `None` on command failure so `apply_numstat_counts` preserves tracked
        // rows rather than mistaking an errored numstat for "no diffs".
        let staged_numstat = match staged_res {
            None => Some(""),
            Some(Ok(ref out)) if out.ok => Some(out.stdout.as_str()),
            _ => None,
        };
        let unstaged_numstat = match unstaged_res {
            None => Some(""),
            Some(Ok(ref out)) if out.ok => Some(out.stdout.as_str()),
            _ => None,
        };

        clear_inherited_start_point_upstream(cwd, &mut parsed, timeout, limiter);
        let has_remote = has_remote_lines(&remote_stdout);
        apply_numstat_counts(&mut parsed, staged_numstat, unstaged_numstat);

        if let Some(Ok(ref ls_out)) = ls_res
            && ls_out.ok
        {
            expand_untracked_entries(&mut parsed, &ls_out.stdout);
        }
        self.populate_untracked_insertions(cwd, &mut parsed);

        let (total_insertions, total_deletions) = sum_change_totals(&parsed);

        let (merge_in_progress, conflict_files, merge_message) = if parsed.merge_in_progress {
            let conflicts =
                build_conflict_file_changes(cwd, &parsed.conflict_files, timeout, limiter);
            let msg = read_merge_message(cwd, timeout, limiter);
            (Some(true), Some(conflicts), msg)
        } else {
            (None, None, None)
        };

        // Note: `GitStatusService.getStatus` omits `headSha` on the local full
        // path (only summary and `buildGitStatusResultFromOutputs` populate it),
        // so leave `head_sha: None` here for exact field-for-field parity.
        NativeGitStatusEntry {
            detail: None,
            is_repo: true,
            branch: parsed.branch,
            head_sha: None,
            tracking: parsed.tracking,
            has_remote,
            remote_output: Some(remote_stdout),
            ahead: parsed.ahead,
            behind: parsed.behind,
            staged: parsed.staged,
            unstaged: parsed.unstaged,
            total_insertions,
            total_deletions,
            merge_in_progress,
            conflict_files,
            merge_message,
        }
    }

    fn populate_untracked_insertions(&self, cwd: &str, parsed: &mut ParsedPorcelainStatus) {
        let untracked_indices: Vec<usize> = parsed
            .unstaged
            .iter()
            .enumerate()
            .filter_map(|(i, f)| (f.status == "?").then_some(i))
            .collect();
        if untracked_indices.is_empty() {
            return;
        }

        if untracked_indices.len() <= 4 {
            for idx in untracked_indices {
                let path = parsed.unstaged[idx].path.clone();
                parsed.unstaged[idx].insertions = self.untracked_cache.read_insertions(cwd, &path);
            }
            return;
        }

        // Parallelize untracked file line/binary counting across up to 8 OS threads!
        let paths_to_count: Vec<(usize, String)> = untracked_indices
            .into_iter()
            .map(|idx| (idx, parsed.unstaged[idx].path.clone()))
            .collect();
        let next_cursor = Mutex::new(0usize);
        let counts = Mutex::new(Vec::with_capacity(paths_to_count.len()));
        let workers = paths_to_count.len().min(8);

        thread::scope(|scope| {
            for _ in 0..workers {
                scope.spawn(|| {
                    let mut local = Vec::new();
                    loop {
                        let item_idx = {
                            let mut guard = match next_cursor.lock() {
                                Ok(g) => g,
                                Err(p) => p.into_inner(),
                            };
                            if *guard >= paths_to_count.len() {
                                break;
                            }
                            let current = *guard;
                            *guard += 1;
                            current
                        };
                        let (unstaged_idx, ref rel_path) = paths_to_count[item_idx];
                        let insertions = self.untracked_cache.read_insertions(cwd, rel_path);
                        local.push((unstaged_idx, insertions));
                    }
                    if !local.is_empty() {
                        let mut guard = match counts.lock() {
                            Ok(g) => g,
                            Err(p) => p.into_inner(),
                        };
                        guard.extend(local);
                    }
                });
            }
        });

        let computed = match counts.into_inner() {
            Ok(v) => v,
            Err(p) => p.into_inner(),
        };
        for (unstaged_idx, insertions) in computed {
            parsed.unstaged[unstaged_idx].insertions = insertions;
        }
    }
}

fn clear_inherited_start_point_upstream(
    cwd: &str,
    parsed: &mut ParsedPorcelainStatus,
    timeout: Duration,
    limiter: &SubprocessLimiter,
) {
    if parsed.branch.is_empty() || parsed.tracking.is_empty() {
        return;
    }
    let Some(slash) = parsed.tracking.find('/') else {
        return;
    };
    if slash == 0 || parsed.tracking[slash + 1..] == parsed.branch {
        return;
    }
    let config_key = format!("branch.{}.poracodeSource", parsed.branch);
    let Ok(cfg_out) = run_git_command(cwd, &["config", "--get", &config_key], timeout, limiter)
    else {
        return;
    };
    if !cfg_out.ok {
        return;
    }
    let trimmed = cfg_out.stdout.trim();
    let poracode_source = (!trimmed.is_empty()).then_some(trimmed);
    if !is_inherited_start_point_upstream(&parsed.branch, &parsed.tracking, poracode_source) {
        return;
    }
    if let Ok(unset_out) = run_git_command(
        cwd,
        &["branch", "--unset-upstream", &parsed.branch],
        timeout,
        limiter,
    ) && unset_out.ok
    {
        parsed.tracking.clear();
        parsed.ahead = 0;
        parsed.behind = 0;
    }
}

fn build_conflict_file_changes(
    cwd: &str,
    paths: &[String],
    timeout: Duration,
    limiter: &SubprocessLimiter,
) -> Vec<GitFileChange> {
    let head_numstat = match run_git_command(cwd, &["diff", "HEAD", "--numstat"], timeout, limiter)
    {
        Ok(out) if out.ok => out.stdout,
        _ => String::new(),
    };
    let mut stats: HashMap<String, (usize, usize)> = HashMap::new();
    for entry in parse_diff_numstat(&head_numstat) {
        stats.insert(entry.path, (entry.insertions, entry.deletions));
    }
    paths
        .iter()
        .map(|path| {
            let (insertions, deletions) = stats.get(path).copied().unwrap_or((0, 0));
            GitFileChange {
                path: path.clone(),
                old_path: None,
                status: "U".to_owned(),
                staged: false,
                insertions,
                deletions,
            }
        })
        .collect()
}

fn read_merge_message(cwd: &str, timeout: Duration, limiter: &SubprocessLimiter) -> Option<String> {
    let out = run_git_command(
        cwd,
        &[
            "rev-parse",
            "--path-format=absolute",
            "--git-path",
            "MERGE_MSG",
        ],
        timeout,
        limiter,
    )
    .ok()?;
    if !out.ok {
        return None;
    }
    let msg_path = out.stdout.trim();
    if msg_path.is_empty() {
        return None;
    }
    let meta = fs::metadata(msg_path).ok()?;
    if !meta.is_file() || meta.len() > MAX_MERGE_MESSAGE_BYTES {
        return None;
    }
    let raw = fs::read_to_string(msg_path).ok()?;
    let cleaned = strip_commit_message_comments(&raw);
    (!cleaned.is_empty()).then_some(cleaned)
}

fn non_repo_summary_entry() -> NativeGitStatusEntry {
    NativeGitStatusEntry {
        detail: Some("summary".to_owned()),
        is_repo: false,
        branch: String::new(),
        head_sha: None,
        tracking: String::new(),
        has_remote: false,
        remote_output: None,
        ahead: 0,
        behind: 0,
        staged: Vec::new(),
        unstaged: Vec::new(),
        total_insertions: 0,
        total_deletions: 0,
        merge_in_progress: None,
        conflict_files: None,
        merge_message: None,
    }
}

fn non_repo_full_entry() -> NativeGitStatusEntry {
    NativeGitStatusEntry {
        detail: None,
        is_repo: false,
        branch: String::new(),
        head_sha: None,
        tracking: String::new(),
        has_remote: false,
        remote_output: None,
        ahead: 0,
        behind: 0,
        staged: Vec::new(),
        unstaged: Vec::new(),
        total_insertions: 0,
        total_deletions: 0,
        merge_in_progress: None,
        conflict_files: None,
        merge_message: None,
    }
}
