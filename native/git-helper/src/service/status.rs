//! In-process status collection. Search retains its separate Git subprocess path.

use crate::parser::{
    is_inherited_start_point_upstream, strip_commit_message_comments, to_forward_slash,
};
use crate::protocol::{GitFileChange, NativeGitStatusEntry, StatusDetail};
use crate::untracked::UntrackedStatsCache;
use git2::{
    Config, Delta, Diff, DiffFindOptions, Error, ErrorClass, ErrorCode, Patch, Repository,
    RepositoryOpenFlags, Status, StatusOptions,
};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};

const MAX_MERGE_MESSAGE_BYTES: u64 = 64 * 1024;

pub(super) fn collect(
    cwd: &str,
    detail: StatusDetail,
    untracked_cache: &UntrackedStatsCache,
    timeout_ms: u64,
) -> Result<NativeGitStatusEntry, Error> {
    let started = Instant::now();
    let timeout = Duration::from_millis(timeout_ms.max(250));
    // libgit2 does not consume Git's command-line config environment. Refuse
    // rather than report a successful status using a different configuration.
    if std::env::var_os("GIT_CONFIG_COUNT").is_some()
        || std::env::var_os("GIT_CONFIG_PARAMETERS").is_some()
    {
        return Err(unsupported_config(
            "Inherited command-line Git configuration requires fallback",
        ));
    }
    if !Path::new(cwd).is_dir() {
        return Ok(non_repo(detail));
    }
    let repo = match Repository::open_ext(
        cwd,
        RepositoryOpenFlags::FROM_ENV,
        std::iter::empty::<&Path>(),
    ) {
        Ok(repo) => repo,
        Err(error) if error.code() == ErrorCode::NotFound => return Ok(non_repo(detail)),
        Err(error) => return Err(error),
    };
    let config = super::config::resolved(&repo)?;
    if repo.is_bare() {
        return Ok(non_repo(detail));
    }
    let index = repo.index()?;
    if index
        .iter()
        .any(|entry| entry.flags_extended & git2::IndexEntryExtendedFlag::INTENT_TO_ADD.bits() != 0)
    {
        return Err(unsupported_config(
            "Intent-to-add index entries require fallback",
        ));
    }
    super::attributes::check(&repo, &config, &index)?;
    let renames = config_renames(&config, "status.renames")?
        .or(config_renames(&config, "diff.renames")?)
        .unwrap_or(true);
    let include_untracked = match config_string(&config, "status.showuntrackedfiles")?.as_deref() {
        None | Some("normal" | "all") => true,
        Some("no") => false,
        Some(_) => {
            return Err(unsupported_config(
                "Invalid Git untracked-files configuration",
            ));
        }
    };
    let mut options = StatusOptions::new();
    options
        .include_untracked(include_untracked)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(renames)
        .renames_index_to_workdir(false)
        .sort_case_sensitively(true);
    let statuses = repo.statuses(Some(&mut options))?;
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    let mut conflicts = Vec::new();
    for entry in statuses.iter() {
        check_deadline(started, timeout)?;
        let flags = entry.status();
        let index_delta = entry.head_to_index();
        let work_delta = entry.index_to_workdir();
        let delta = work_delta.as_ref().or(index_delta.as_ref());
        let path = delta
            .and_then(|delta| delta.new_file().path_bytes())
            .unwrap_or_else(|| entry.path_bytes());
        let path = to_forward_slash(&String::from_utf8_lossy(path));
        if flags.contains(Status::CONFLICTED) {
            conflicts.push(change(path, None, "U", false));
            continue;
        }
        let old_path = index_delta
            .filter(|delta| matches!(delta.status(), Delta::Renamed | Delta::Copied))
            .and_then(|delta| {
                delta
                    .old_file()
                    .path_bytes()
                    .map(|path| to_forward_slash(&String::from_utf8_lossy(path)))
            });
        if let Some(status) = index_status(flags) {
            staged.push(change(path.clone(), old_path.clone(), status, true));
        }
        if flags.contains(Status::WT_NEW) {
            untracked.push(change(path, None, "?", false));
        } else if let Some(status) = work_status(flags) {
            unstaged.push(change(path, old_path, status, false));
        }
    }
    // Git emits tracked porcelain records before untracked records, and the
    // fallback expands untracked directories into byte-sorted ls-files rows.
    staged.sort_by(|left, right| left.path.cmp(&right.path));
    unstaged.sort_by(|left, right| left.path.cmp(&right.path));
    untracked.sort_by(|left, right| left.path.cmp(&right.path));
    conflicts.sort_by(|left, right| left.path.cmp(&right.path));
    let full = detail == StatusDetail::Full;
    check_deadline(started, timeout)?;
    if full {
        let tree = match repo.head() {
            Ok(head) => Some(head.peel_to_tree()?),
            Err(error) if error.code() == ErrorCode::UnbornBranch => None,
            Err(error) => return Err(error),
        };
        if !staged.is_empty() {
            let mut diff = repo.diff_tree_to_index(tree.as_ref(), None, None)?;
            detect_diff_renames(&config, &mut diff)?;
            apply_stats(&mut staged, &diff_stats(&repo, &diff)?);
        }
        if !unstaged.is_empty() {
            let mut diff = repo.diff_index_to_workdir(None, None)?;
            detect_diff_renames(&config, &mut diff)?;
            apply_stats(&mut unstaged, &diff_stats(&repo, &diff)?);
        }
        if !conflicts.is_empty() {
            let diff = repo.diff_tree_to_workdir(tree.as_ref(), None)?;
            let stats = diff_stats(&repo, &diff)?;
            for conflict in &mut conflicts {
                if let Some(&(insertions, deletions)) = stats.get(&conflict.path) {
                    conflict.insertions = insertions;
                    conflict.deletions = deletions;
                }
            }
        }
        for file in &mut untracked {
            file.insertions = untracked_cache.read_insertions(cwd, &file.path);
        }
    }
    unstaged.extend(untracked);
    check_deadline(started, timeout)?;
    let (branch, head_sha, tracking, ahead, behind) = branch_info(&repo, &config)?;
    let remote_output = if full {
        Some(super::remotes::output(&repo, &config)?)
    } else {
        None
    };
    let has_remote = remote_output
        .as_ref()
        .map_or_else(|| !tracking.is_empty(), |output| !output.trim().is_empty());
    let merge_in_progress = !conflicts.is_empty();
    let merge_message = if full && merge_in_progress {
        read_merge_message(&repo)
    } else {
        None
    };
    let (total_insertions, total_deletions) = staged
        .iter()
        .chain(&unstaged)
        .fold((0, 0), |(insertions, deletions), file| {
            (insertions + file.insertions, deletions + file.deletions)
        });
    Ok(NativeGitStatusEntry {
        detail: (!full).then(|| "summary".to_owned()),
        is_repo: true,
        branch,
        head_sha: (!full).then_some(head_sha),
        tracking,
        has_remote,
        remote_output,
        has_ssh_overrides: if full {
            Some(has_ssh_overrides(&config)?)
        } else {
            None
        },
        ahead,
        behind,
        staged,
        unstaged,
        total_insertions,
        total_deletions,
        merge_in_progress: merge_in_progress.then_some(true),
        conflict_files: merge_in_progress.then_some(conflicts),
        merge_message,
    })
}

fn unsupported_config(message: &str) -> Error {
    Error::new(ErrorCode::Invalid, ErrorClass::Config, message)
}

fn check_deadline(started: Instant, timeout: Duration) -> Result<(), Error> {
    if started.elapsed() >= timeout {
        Err(Error::from_str("Native status timed out"))
    } else {
        Ok(())
    }
}

fn config_string(config: &Config, key: &str) -> Result<Option<String>, Error> {
    match config.get_string(key) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn has_ssh_overrides(config: &Config) -> Result<bool, Error> {
    // git config --get-regexp reports even an explicitly empty value.
    Ok(config_string(config, "core.sshcommand")?.is_some()
        || config_string(config, "ssh.variant")?.is_some())
}

fn config_renames(config: &Config, key: &str) -> Result<Option<bool>, Error> {
    // StatusOptions exposes rename detection, but not Git's copies mode.
    if config_string(config, key)?.as_deref() == Some("copies") {
        return Err(unsupported_config("Git copies status requires fallback"));
    }
    // get_bool preserves valueless=true versus an explicitly empty=false.
    match config.get_bool(key) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn branch_info(
    repo: &Repository,
    config: &Config,
) -> Result<(String, String, String, usize, usize), Error> {
    let head = match repo.head() {
        Ok(head) => Some(head),
        Err(error) if error.code() == ErrorCode::UnbornBranch => None,
        Err(error) => return Err(error),
    };
    let branch = match &head {
        Some(head) if head.is_branch() => head.shorthand().unwrap_or("").to_owned(),
        Some(_) => "(detached)".to_owned(),
        None => repo
            .find_reference("HEAD")?
            .symbolic_target()?
            .unwrap_or("")
            .strip_prefix("refs/heads/")
            .unwrap_or("")
            .to_owned(),
    };
    let oid = head.as_ref().and_then(git2::Reference::target);
    let head_sha = oid.map_or_else(|| "(initial)".to_owned(), |oid| oid.to_string());
    let upstream = if branch == "(detached)" {
        None
    } else {
        match repo.branch_upstream_name(&format!("refs/heads/{branch}")) {
            Ok(name) => Some(String::from_utf8_lossy(&name).into_owned()),
            Err(error) if matches!(error.code(), ErrorCode::NotFound | ErrorCode::UnbornBranch) => {
                None
            }
            Err(error) => return Err(error),
        }
    };
    let mut tracking = upstream
        .as_deref()
        .map(|name| {
            name.strip_prefix("refs/remotes/")
                .or_else(|| name.strip_prefix("refs/heads/"))
                .unwrap_or(name)
        })
        .unwrap_or("")
        .to_owned();
    let source = config_string(config, &format!("branch.{branch}.poracodeSource"))?;
    if is_inherited_start_point_upstream(&branch, &tracking, source.as_deref()) {
        // Match the fallback's deliberate repair without starting git branch.
        let repaired =
            Config::open(&repo.commondir().join("config")).and_then(|mut local_config| {
                local_config.remove_multivar(&format!("branch.{branch}.remote"), ".*")?;
                local_config.remove_multivar(&format!("branch.{branch}.merge"), ".*")
            });
        if repaired.is_ok() {
            tracking.clear();
            return Ok((branch, head_sha, tracking, 0, 0));
        }
    }
    let (ahead, behind) = match (oid, upstream.as_deref()) {
        (Some(local), Some(upstream)) => match repo.refname_to_id(upstream) {
            Ok(upstream) => repo.graph_ahead_behind(local, upstream)?,
            Err(error) if error.code() == ErrorCode::NotFound => (0, 0),
            Err(error) => return Err(error),
        },
        _ => (0, 0),
    };
    Ok((branch, head_sha, tracking, ahead, behind))
}

fn detect_diff_renames(config: &Config, diff: &mut Diff<'_>) -> Result<(), Error> {
    let enabled = config_renames(config, "diff.renames")?.unwrap_or(true);
    if enabled {
        diff.find_similar(Some(DiffFindOptions::new().renames(true)))?;
    }
    Ok(())
}

fn diff_stats(
    repo: &Repository,
    diff: &Diff<'_>,
) -> Result<HashMap<String, (usize, usize)>, Error> {
    let mut stats = HashMap::new();
    for (index, delta) in diff.deltas().enumerate() {
        let path = delta
            .new_file()
            .path_bytes()
            .or_else(|| delta.old_file().path_bytes());
        let Some(path) = path else { continue };
        if delta.new_file().mode() == git2::FileMode::Commit
            && !delta.old_file().id().is_zero()
            && delta.old_file().id() == delta.new_file().id()
        {
            let path = std::str::from_utf8(path)
                .map_err(|_| unsupported_config("Non-UTF-8 submodule paths require fallback"))?;
            let submodule = repo.find_submodule(path)?;
            let status =
                repo.submodule_status(submodule.name()?, git2::SubmoduleIgnore::Untracked)?;
            // Git's numstat retains tracked submodule dirtiness with 0/0 and
            // excludes an unchanged gitlink containing only untracked files.
            if status.intersects(
                git2::SubmoduleStatus::WD_INDEX_MODIFIED | git2::SubmoduleStatus::WD_WD_MODIFIED,
            ) {
                stats.insert(to_forward_slash(path), (0, 0));
            }
            continue;
        }
        let counts = match Patch::from_diff(diff, index)? {
            Some(patch) => {
                let delta = patch.delta();
                if delta.status() == Delta::Unmodified
                    || (delta.status() == Delta::Modified
                        && delta.new_file().mode() != git2::FileMode::Commit
                        && delta.old_file().mode() == delta.new_file().mode()
                        && !delta.old_file().id().is_zero()
                        && delta.old_file().id() == delta.new_file().id())
                {
                    continue;
                }
                let (_, insertions, deletions) = patch.line_stats()?;
                (insertions, deletions)
            }
            None => (0, 0),
        };
        if delta.status() == Delta::Unmodified {
            continue;
        }
        stats.insert(to_forward_slash(&String::from_utf8_lossy(path)), counts);
    }
    Ok(stats)
}

fn apply_stats(files: &mut Vec<GitFileChange>, stats: &HashMap<String, (usize, usize)>) {
    files.retain_mut(|file| {
        if let Some(&(insertions, deletions)) = stats.get(&file.path) {
            file.insertions = insertions;
            file.deletions = deletions;
            true
        } else {
            false
        }
    });
}

fn read_merge_message(repo: &Repository) -> Option<String> {
    let path = repo.path().join("MERGE_MSG");
    let metadata = fs::metadata(&path).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_MERGE_MESSAGE_BYTES {
        return None;
    }
    let message = strip_commit_message_comments(&fs::read_to_string(path).ok()?);
    (!message.is_empty()).then_some(message)
}

fn change(path: String, old_path: Option<String>, status: &str, staged: bool) -> GitFileChange {
    GitFileChange {
        path,
        old_path,
        status: status.to_owned(),
        staged,
        insertions: 0,
        deletions: 0,
    }
}

fn index_status(status: Status) -> Option<&'static str> {
    if status.contains(Status::INDEX_NEW) {
        Some("A")
    } else if status.contains(Status::INDEX_DELETED) {
        Some("D")
    } else if status.contains(Status::INDEX_RENAMED) {
        Some("R")
    } else if status.contains(Status::INDEX_TYPECHANGE) {
        Some("T")
    } else if status.contains(Status::INDEX_MODIFIED) {
        Some("M")
    } else {
        None
    }
}

fn work_status(status: Status) -> Option<&'static str> {
    if status.contains(Status::WT_DELETED) {
        Some("D")
    } else if status.contains(Status::WT_RENAMED) {
        Some("R")
    } else if status.contains(Status::WT_TYPECHANGE) {
        Some("T")
    } else if status.contains(Status::WT_MODIFIED) {
        Some("M")
    } else {
        None
    }
}

fn non_repo(detail: StatusDetail) -> NativeGitStatusEntry {
    NativeGitStatusEntry {
        detail: (detail == StatusDetail::Summary).then(|| "summary".to_owned()),
        is_repo: false,
        branch: String::new(),
        head_sha: None,
        tracking: String::new(),
        has_remote: false,
        remote_output: None,
        has_ssh_overrides: None,
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

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used)]
    use super::*;

    #[test]
    fn unborn_repository_with_ssh_remote_is_native() {
        let root =
            std::env::temp_dir().join(format!("poracode-native-unborn-{}", std::process::id()));
        fs::create_dir_all(&root).expect("mkdir");
        let repo = Repository::init(&root).expect("init");
        repo.remote("origin", "git@github.com-work:poracode/status.git")
            .expect("remote");
        fs::write(root.join("new.txt"), "one\ntwo\n").expect("write");
        let result = collect(
            root.to_str().expect("path"),
            StatusDetail::Full,
            &UntrackedStatsCache::new(),
            u64::MAX,
        );
        drop(repo);
        fs::remove_dir_all(&root).expect("cleanup");
        let result = result.expect("native status");
        assert!(result.is_repo);
        assert_eq!(result.total_insertions, 2);
    }
}
