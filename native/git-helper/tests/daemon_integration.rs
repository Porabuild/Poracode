//! Integration tests spawning the compiled `poracode-git-helper` binary against
//! real temporary Git repositories and worktrees.

#![allow(clippy::expect_used, clippy::unwrap_used, clippy::panic)]

use poracode_git_helper::protocol::HelperResponse;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(1);

struct TempDir {
    path: PathBuf,
}

impl TempDir {
    fn new(label: &str) -> Self {
        let id = NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "poracode-git-helper-test-{label}-{}-{id}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir");
        Self { path: dir }
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn bin_path() -> &'static str {
    env!("CARGO_BIN_EXE_poracode-git-helper")
}

fn git(cwd: &Path, args: &[&str]) {
    let status = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("spawn git");
    assert!(status.success(), "git {args:?} failed in {}", cwd.display());
}

#[test]
fn hello_handshake_reports_protocol_v4() {
    let output = Command::new(bin_path())
        .arg("--hello")
        .output()
        .expect("spawn --hello");
    assert!(output.status.success());
    let parsed: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("valid hello JSON");
    assert_eq!(parsed["helper"], "poracode-git-helper");
    assert_eq!(parsed["protocolVersion"], 4);
    assert!(parsed["helperVersion"].as_str().is_some());
}

#[test]
fn unknown_flag_and_protocol_mismatch_fail_closed() {
    let bad_flag = Command::new(bin_path())
        .arg("--serve-v1")
        .output()
        .expect("spawn --serve-v1");
    assert!(!bad_flag.status.success());
    assert!(
        !Command::new(bin_path())
            .arg("--serve-v2")
            .output()
            .expect("old helper mode")
            .status
            .success()
    );

    let mut child = Command::new(bin_path())
        .arg("--serve-v3")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn --serve-v3");

    {
        let stdin = child.stdin.as_mut().expect("stdin");
        writeln!(stdin, r#"{{"protocolVersion":99,"id":7,"kind":"ping"}}"#).expect("write");
    }
    let output = child.wait_with_output().expect("wait");
    assert!(!output.status.success());
    let resp: HelperResponse = serde_json::from_slice(&output.stdout).expect("error response JSON");
    assert!(!resp.ok);
    assert_eq!(resp.id, 7);
}

#[test]
fn previous_protocol_cannot_accept_list_tree() {
    let mut child = Command::new(bin_path())
        .arg("--serve-v3")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("daemon");
    writeln!(
        child.stdin.as_mut().expect("stdin"),
        r#"{{"protocolVersion":3,"id":1,"kind":"listTree","rootPath":"missing"}}"#
    )
    .expect("request");
    let output = child.wait_with_output().expect("exit");
    assert_eq!(output.status.code(), Some(2));
    let response: HelperResponse = serde_json::from_slice(&output.stdout).expect("response");
    assert!(!response.ok);
    assert!(
        response
            .error
            .expect("error")
            .contains("Incompatible protocolVersion 3")
    );
}

#[test]
fn lists_directories_without_git_and_refuses_traversal() {
    let fixture = TempDir::new("list-tree");
    for path in [".git", "empty", "git-only/.git", "dir10", "dir2"] {
        fs::create_dir_all(fixture.path.join(path)).expect("directory");
    }
    for path in ["a10.txt", "a2.txt", "dir2/child.txt"] {
        fs::write(fixture.path.join(path), "").expect("file");
    }
    let mut child = Command::new(bin_path())
        .arg("--serve-v3")
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("daemon");
    let mut stdin = child.stdin.take().expect("stdin");
    let mut stdout = BufReader::new(child.stdout.take().expect("stdout"));
    for (id, path) in ["", "dir2", "..", "dir2/../empty"].iter().enumerate() {
        writeln!(stdin, "{}", serde_json::json!({"protocolVersion":4,"id":id,"kind":"listTree","rootPath":fixture.path,"directoryPath":path,"timeoutMs":10_000})).expect("request");
        stdin.flush().expect("flush");
        let mut line = String::new();
        stdout.read_line(&mut line).expect("line");
        let response: HelperResponse = serde_json::from_str(&line).expect("response");
        if id >= 2 {
            assert!(!response.ok);
            assert!(response.error.expect("error").contains("traversal"));
            continue;
        }
        assert!(response.ok, "{response:?}");
        let mut entries = response.tree_entries.expect("entries");
        if id == 0 {
            entries.sort_by(|a, b| a.name.cmp(&b.name));
            assert_eq!(
                entries
                    .iter()
                    .map(|entry| entry.name.as_str())
                    .collect::<Vec<_>>(),
                ["a10.txt", "a2.txt", "dir10", "dir2", "empty", "git-only"]
            );
            assert_eq!(entries[3].has_children, Some(true));
            for entry in [&entries[2], &entries[4], &entries[5]] {
                assert_eq!(entry.has_children, Some(false));
            }
            assert_eq!(entries[0].has_children, None);
        } else {
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].path, "dir2/child.txt");
        }
    }
    drop(stdin);
    assert!(child.wait().expect("exit").success());
}

#[test]
fn concurrent_tree_requests_keep_ids_and_child_presence_isolated() {
    let fixture = TempDir::new("concurrent-trees");
    for root in ["a", "b"] {
        for index in 0..96 {
            let path = fixture.path.join(root).join(format!("dir{index}"));
            fs::create_dir_all(&path).expect("directory");
            if index % 3 == 0 {
                fs::write(path.join("file.txt"), "").expect("file");
            } else if index % 3 == 1 {
                fs::create_dir(path.join(".git")).expect("hidden directory");
            }
        }
        fs::write(fixture.path.join(root).join(format!("{root}.txt")), "").expect("root marker");
    }
    let mut child = Command::new(bin_path())
        .arg("--serve-v3")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("daemon");
    let mut stdin = child.stdin.take().expect("stdin");
    let root = fixture.path.clone();
    let writer = std::thread::spawn(move || {
        for id in 0..80 {
            let root = root.join(if id % 2 == 0 { "a" } else { "b" });
            writeln!(
                stdin,
                "{}",
                serde_json::json!({
                    "protocolVersion": 4, "id": id, "kind": "listTree",
                    "rootPath": root, "directoryPath": "", "timeoutMs": 10_000,
                })
            )
            .expect("request");
        }
    });
    let mut ids = std::collections::HashSet::new();
    for line in BufReader::new(child.stdout.take().expect("stdout")).lines() {
        let response: HelperResponse =
            serde_json::from_str(&line.expect("line")).expect("response");
        assert!(response.ok, "{response:?}");
        assert!(ids.insert(response.id), "duplicate response");
        let entries = response.tree_entries.expect("entries");
        assert_eq!(entries.len(), 97);
        let marker = if response.id.is_multiple_of(2) {
            "a.txt"
        } else {
            "b.txt"
        };
        assert!(
            entries
                .iter()
                .any(|entry| entry.name == marker && entry.entry_type == "file")
        );
        for entry in entries {
            if entry.entry_type == "file" {
                continue;
            }
            let index: usize = entry.name.trim_start_matches("dir").parse().expect("index");
            assert_eq!(entry.has_children, Some(index.is_multiple_of(3)));
        }
    }
    writer.join().expect("writer");
    assert_eq!(ids.len(), 80);
    assert!(child.wait().expect("exit").success());
}

#[test]
fn contained_symlinks_and_root_replacement_are_resolved_on_each_listing() {
    use poracode_git_helper::service::GitHelperService;
    let fixture = TempDir::new("list-root");
    let root = fixture.path.join("root");
    let outside = fixture.path.join("outside");
    fs::create_dir_all(root.join("inside")).expect("inside");
    fs::create_dir_all(&outside).expect("outside");
    fs::write(root.join("inside/visible.txt"), "").expect("file");
    fs::write(outside.join("outside.txt"), "").expect("file");
    #[cfg(unix)]
    use std::os::unix::fs::symlink as link;
    #[cfg(windows)]
    use std::os::windows::fs::symlink_dir as link;
    link(root.join("inside"), root.join("link")).expect("inside link");
    link(&outside, root.join("escape")).expect("escape link");
    link(&root, fixture.path.join("alias")).expect("root link");
    let service = GitHelperService::new();
    let root_str = root.to_str().expect("root path");
    let entries = service.list_tree(root_str, "", 10_000).expect("list");
    assert!(
        entries
            .iter()
            .any(|entry| entry.name == "link" && entry.has_children == Some(true))
    );
    assert!(
        entries
            .iter()
            .any(|entry| entry.name == "escape" && entry.entry_type == "file")
    );
    assert!(
        service
            .list_tree(root_str, "escape", 10_000)
            .is_err_and(|error| error.contains("escapes"))
    );
    assert!(
        service
            .list_tree(root_str, "link", 10_000)
            .is_ok_and(|entries| entries[0].path == "link/visible.txt")
    );
    let alias = fixture.path.join("alias");
    let alias_str = alias.to_str().expect("alias path");
    assert!(service.list_tree(alias_str, "", 10_000).is_ok());
    #[cfg(unix)]
    fs::remove_file(&alias).expect("remove link");
    #[cfg(windows)]
    fs::remove_dir(&alias).expect("remove link");
    link(&outside, &alias).expect("retarget link");
    let entries = service
        .list_tree(alias_str, "", 10_000)
        .expect("refreshed root");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "outside.txt");
    assert!(
        service
            .list_tree(alias_str, "", 0)
            .is_err_and(|error| error.contains("timed out"))
    );
}

#[test]
fn native_status_succeeds_without_git_in_path() {
    let temp = TempDir::new("no-git-status");
    let repo = temp.path.join("repo");
    let empty_path = temp.path.join("empty-path");
    fs::create_dir_all(&repo).expect("repo");
    fs::create_dir_all(&empty_path).expect("path");
    git(&repo, &["init", "-b", "main"]);
    git(&repo, &["config", "user.name", "Test"]);
    git(&repo, &["config", "user.email", "test@poracode.dev"]);
    fs::write(repo.join("tracked.txt"), "base\n").expect("tracked");
    git(&repo, &["add", "."]);
    git(&repo, &["commit", "-m", "base"]);
    git(
        &repo,
        &[
            "remote",
            "add",
            "origin",
            "git@github.com-work:poracode/status.git",
        ],
    );
    fs::write(repo.join("tracked.txt"), "changed\nextra\n").expect("modified");
    fs::write(repo.join("new.txt"), "one\ntwo\n").expect("new");
    // Resolve Git inside the child environment: Rust's Windows launcher can
    // resolve an executable against its parent's PATH before applying env().
    #[cfg(windows)]
    let probe = Command::new(std::env::var_os("ComSpec").expect("ComSpec"))
        .args(["/d", "/c", "git --version"])
        .env("PATH", &empty_path)
        .current_dir(&temp.path)
        .output()
        .expect("probe");
    #[cfg(not(windows))]
    let probe = Command::new("/bin/sh")
        .args(["-c", "command -v git"])
        .env("PATH", &empty_path)
        .current_dir(&temp.path)
        .output()
        .expect("probe");
    assert!(!probe.status.success());
    let mut child = Command::new(bin_path())
        .arg("--serve-v3")
        .env("PATH", &empty_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("daemon");
    let mut stdin = child.stdin.take().expect("stdin");
    let mut stdout = BufReader::new(child.stdout.take().expect("stdout"));
    for detail in ["full", "summary"] {
        writeln!(stdin, "{}", serde_json::json!({"protocolVersion":4,"id":1,"kind":"statusBatch","paths":[repo],"detail":detail})).expect("write");
        stdin.flush().expect("flush");
        let mut line = String::new();
        stdout.read_line(&mut line).expect("response");
        let response: HelperResponse = serde_json::from_str(&line).expect("JSON");
        assert!(response.ok, "{response:?}");
        let status = &response.statuses.as_ref().expect("statuses")[repo.to_str().expect("path")];
        assert!(status.is_repo);
        assert_eq!(status.branch, "main");
        assert_eq!(status.unstaged.len(), 2);
        if detail == "full" {
            assert_eq!(status.total_insertions, 4);
            assert_eq!(status.total_deletions, 1);
            assert_eq!(status.has_ssh_overrides, Some(false));
        } else {
            assert_eq!(status.total_insertions, 0);
        }
    }
    drop(stdin);
    assert!(child.wait().expect("exit").success());
}

#[test]
fn walk_lists_symlinks_as_files_without_traversing_targets() {
    let temp = TempDir::new("symlinks");
    let root = temp.path.join("project");
    let outside = temp.path.join("outside");
    fs::create_dir_all(&root).expect("mkdir project");
    fs::create_dir_all(&outside).expect("mkdir outside");
    fs::write(root.join("target.txt"), "test\n").expect("write target");
    fs::write(outside.join("linked-nested.txt"), "outside\n").expect("write outside");

    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        symlink(root.join("target.txt"), root.join("linked-file.txt")).expect("file symlink");
        symlink(root.join("missing.txt"), root.join("linked-missing.txt"))
            .expect("dangling symlink");
        symlink(&outside, root.join("linked-directory")).expect("directory symlink");
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::{symlink_dir, symlink_file};
        symlink_file(root.join("target.txt"), root.join("linked-file.txt")).expect("file symlink");
        symlink_file(root.join("missing.txt"), root.join("linked-missing.txt"))
            .expect("dangling symlink");
        symlink_dir(&outside, root.join("linked-directory")).expect("directory symlink");
    }

    let mut child = Command::new(bin_path())
        .arg("--serve-v3")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn daemon");
    let mut stdin = child.stdin.take().expect("stdin");
    let request = serde_json::json!({
        "protocolVersion": 4,
        "id": 1,
        "kind": "searchTree",
        "rootPath": root,
        "query": "linked",
        "limit": 10,
        "useIgnoreFiles": false,
    });
    writeln!(stdin, "{request}").expect("write search request");
    drop(stdin);
    let output = child.wait_with_output().expect("wait daemon");
    assert!(output.status.success());
    let response: HelperResponse = serde_json::from_slice(&output.stdout).expect("search response");
    assert!(response.ok);
    let entries = response.tree_entries.expect("tree entries");
    assert!(entries.iter().all(|entry| entry.entry_type == "file"));
    let mut paths: Vec<_> = entries.iter().map(|entry| entry.path.as_str()).collect();
    paths.sort_unstable();
    assert_eq!(
        paths,
        ["linked-directory", "linked-file.txt", "linked-missing.txt"]
    );
}

#[test]
fn serves_parallel_worktree_batches_and_search_indexes() {
    let temp = TempDir::new("batch");
    let repo_a = temp.path.join("repo-a");
    let repo_b = temp.path.join("repo-b");
    let non_repo = temp.path.join("not-a-repo");
    fs::create_dir_all(&repo_a).expect("mkdir a");
    fs::create_dir_all(&repo_b).expect("mkdir b");
    fs::create_dir_all(&non_repo).expect("mkdir non-repo");

    for repo in [&repo_a, &repo_b] {
        git(repo, &["init", "-b", "main"]);
        git(repo, &["config", "user.email", "test@poracode.dev"]);
        git(repo, &["config", "user.name", "Test"]);
        fs::write(repo.join("tracked.txt"), "line1\nline2\n").expect("write tracked");
        git(repo, &["add", "tracked.txt"]);
        git(repo, &["commit", "-m", "initial"]);
    }

    git(
        &repo_a,
        &[
            "remote",
            "add",
            "origin",
            "https://github.com/poracode/demo.git",
        ],
    );
    fs::write(repo_a.join("tracked.txt"), "line1\nline2\nline3\n").expect("modify tracked");
    fs::create_dir_all(repo_a.join("untracked_dir")).expect("mkdir untracked_dir");
    fs::write(repo_a.join("untracked_dir/new.txt"), "u1\nu2\nu3\n").expect("write untracked");
    fs::write(repo_a.join("untracked_dir/bin.dat"), [0u8, 1u8, 2u8, 3u8]).expect("write bin");
    fs::create_dir_all(repo_a.join("src/components")).expect("mkdir components");
    fs::write(
        repo_a.join("src/components/CommandPalette.tsx"),
        "export {};\n",
    )
    .expect("write cp");
    fs::write(repo_a.join("src/components/cmdplt.ts"), "export {};\n").expect("write cmdplt");

    fs::write(repo_b.join("staged.txt"), "s1\ns2\n").expect("write staged");
    git(&repo_b, &["add", "staged.txt"]);

    let mut child = Command::new(bin_path())
        .arg("--serve-v3")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn daemon");

    let mut stdin = child.stdin.take().expect("stdin");
    let mut stdout = BufReader::new(child.stdout.take().expect("stdout"));

    let paths = vec![
        repo_a.to_string_lossy().into_owned(),
        repo_b.to_string_lossy().into_owned(),
        non_repo.to_string_lossy().into_owned(),
    ];

    // 1. Summary batch
    let summary_req = serde_json::json!({
        "protocolVersion": 4,
        "id": 1,
        "kind": "statusBatch",
        "paths": paths,
        "detail": "summary",
        "timeoutMs": 10000,
        "maxConcurrency": 8
    });
    writeln!(stdin, "{summary_req}").expect("write summary req");
    stdin.flush().expect("flush");

    let mut line = String::new();
    stdout.read_line(&mut line).expect("read summary line");
    let summary_resp: HelperResponse = serde_json::from_str(&line).expect("parse summary");
    assert!(summary_resp.ok);
    let statuses = summary_resp.statuses.expect("statuses");
    let a_sum = &statuses[&paths[0]];
    assert!(a_sum.is_repo);
    assert_eq!(a_sum.detail.as_deref(), Some("summary"));
    assert_eq!(a_sum.branch, "main");
    assert!(!statuses[&paths[2]].is_repo);

    // 2. Full batch
    let full_req = serde_json::json!({
        "protocolVersion": 4,
        "id": 2,
        "kind": "statusBatch",
        "paths": paths,
        "detail": "full",
        "timeoutMs": 10000,
        "maxConcurrency": 8
    });
    writeln!(stdin, "{full_req}").expect("write full req");
    stdin.flush().expect("flush");

    line.clear();
    stdout.read_line(&mut line).expect("read full line");
    let full_resp: HelperResponse = serde_json::from_str(&line).expect("parse full");
    assert!(full_resp.ok);
    let full_statuses = full_resp.statuses.expect("full statuses");
    assert_eq!(full_statuses[&paths[0]].total_insertions, 6);
    assert_eq!(full_statuses[&paths[1]].total_insertions, 2);

    // 3. searchTree (fuzzy + literal ranking)
    let search_tree_req = serde_json::json!({
        "protocolVersion": 4,
        "id": 3,
        "kind": "searchTree",
        "rootPath": paths[0],
        "query": "cmdplt",
        "limit": 10,
        "entryType": "file",
        "useIgnoreFiles": true,
        "excludePatterns": ["**/.git"]
    });
    writeln!(stdin, "{search_tree_req}").expect("write searchTree req");
    stdin.flush().expect("flush");

    line.clear();
    stdout.read_line(&mut line).expect("read searchTree line");
    let tree_resp: HelperResponse = serde_json::from_str(&line).expect("parse searchTree");
    assert!(tree_resp.ok);
    let tree_names: Vec<String> = tree_resp
        .tree_entries
        .expect("tree entries")
        .into_iter()
        .map(|e| e.name)
        .collect();
    assert_eq!(tree_names, vec!["cmdplt.ts", "CommandPalette.tsx"]);

    // 4. searchFiles + invalidateSearch
    let search_files_req = serde_json::json!({
        "protocolVersion": 4,
        "id": 4,
        "kind": "searchFiles",
        "rootPath": paths[0],
        "query": "tracked",
        "limit": 10,
        "useIgnoreFiles": true,
        "excludePatterns": []
    });
    writeln!(stdin, "{search_files_req}").expect("write searchFiles req");
    stdin.flush().expect("flush");

    line.clear();
    stdout.read_line(&mut line).expect("read searchFiles line");
    let files_resp: HelperResponse = serde_json::from_str(&line).expect("parse searchFiles");
    assert!(files_resp.ok);
    assert!(files_resp.total_indexed.unwrap_or(0) >= 5);
    assert_eq!(
        files_resp.file_entries.expect("file entries")[0].name,
        "tracked.txt"
    );

    let inv_req = serde_json::json!({
        "protocolVersion": 4,
        "id": 5,
        "kind": "invalidateSearch",
        "rootPath": paths[0]
    });
    writeln!(stdin, "{inv_req}").expect("write invalidateSearch req");
    stdin.flush().expect("flush");

    line.clear();
    stdout
        .read_line(&mut line)
        .expect("read invalidateSearch line");
    let inv_resp: HelperResponse = serde_json::from_str(&line).expect("parse invalidateSearch");
    assert!(inv_resp.ok);

    // 5. Corrupt index inside a real git repo omits the entry on full status
    // rather than falsely reporting `isRepo: false`!
    fs::write(repo_b.join(".git/index"), b"corrupt-index-bytes").expect("corrupt index");
    let corrupt_req = serde_json::json!({
        "protocolVersion": 4,
        "id": 6,
        "kind": "statusBatch",
        "paths": [paths[1], paths[2]],
        "detail": "full",
        "timeoutMs": 10000,
        "maxConcurrency": 4
    });
    writeln!(stdin, "{corrupt_req}").expect("write corrupt req");
    stdin.flush().expect("flush");

    line.clear();
    stdout.read_line(&mut line).expect("read corrupt line");
    let corrupt_resp: HelperResponse = serde_json::from_str(&line).expect("parse corrupt");
    assert!(corrupt_resp.ok);
    let corrupt_statuses = corrupt_resp.statuses.expect("corrupt statuses");
    assert!(
        !corrupt_statuses.contains_key(&paths[1]),
        "transient/corrupt git status inside a real repo must be omitted rather than marked isRepo=false"
    );
    assert!(!corrupt_statuses[&paths[2]].is_repo);

    drop(stdin);
    let exit = child.wait().expect("wait clean exit");
    assert!(exit.success());
}
