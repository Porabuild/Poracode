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
fn hello_handshake_reports_protocol_v1() {
    let output = Command::new(bin_path())
        .arg("--hello")
        .output()
        .expect("spawn --hello");
    assert!(output.status.success());
    let parsed: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("valid hello JSON");
    assert_eq!(parsed["helper"], "poracode-git-helper");
    assert_eq!(parsed["protocolVersion"], 1);
    assert!(parsed["helperVersion"].as_str().is_some());
}

#[test]
fn unknown_flag_and_protocol_mismatch_fail_closed() {
    let bad_flag = Command::new(bin_path())
        .arg("--unknown")
        .output()
        .expect("spawn --unknown");
    assert!(!bad_flag.status.success());

    let mut child = Command::new(bin_path())
        .arg("--serve-v1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn --serve-v1");

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
fn serves_parallel_worktree_summary_and_full_batches() {
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

    fs::write(repo_b.join("staged.txt"), "s1\ns2\n").expect("write staged");
    git(&repo_b, &["add", "staged.txt"]);

    let mut child = Command::new(bin_path())
        .arg("--serve-v1")
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
        "protocolVersion": 1,
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
    assert!(a_sum.head_sha.is_some());
    assert_eq!(a_sum.total_insertions, 0);
    // Expanded untracked directory entries + modified tracked.txt
    assert_eq!(a_sum.unstaged.len(), 3);
    assert!(!statuses[&paths[2]].is_repo);

    // 2. Full batch
    let full_req = serde_json::json!({
        "protocolVersion": 1,
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

    let a_full = &full_statuses[&paths[0]];
    assert!(a_full.is_repo);
    assert!(a_full.detail.is_none());
    assert!(a_full.has_remote);
    assert!(
        a_full
            .remote_output
            .as_deref()
            .unwrap_or("")
            .contains("https://github.com/poracode/demo.git")
    );
    // 1 insertion in tracked.txt + 3 lines in untracked_dir/new.txt + 0 for binary = 4
    assert_eq!(a_full.total_insertions, 4);
    assert_eq!(a_full.total_deletions, 0);

    let b_full = &full_statuses[&paths[1]];
    assert_eq!(b_full.staged.len(), 1);
    assert_eq!(b_full.staged[0].path, "staged.txt");
    assert_eq!(b_full.staged[0].insertions, 2);
    assert_eq!(b_full.total_insertions, 2);

    drop(stdin);
    let exit = child.wait().expect("wait clean exit");
    assert!(exit.success());
}
