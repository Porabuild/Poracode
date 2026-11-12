//! Real filesystem watch-mode fixtures. Kept separate from the status daemon suite.

#![allow(clippy::expect_used, clippy::unwrap_used, clippy::panic)]

use serde_json::{Value, json};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "poracode-watch-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).expect("create fixture");
        Self(path)
    }
    fn mkdir(&self, path: &str) {
        fs::create_dir_all(self.0.join(path)).expect("mkdir fixture");
    }
    fn write(&self, path: &str, value: &str) {
        fs::write(self.0.join(path), value).expect("write fixture");
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

struct Daemon {
    child: Child,
    stdin: Option<ChildStdin>,
    messages: Receiver<Value>,
}
impl Daemon {
    fn new() -> Self {
        Self::with_env(&[])
    }
    fn with_env(variables: &[(&str, &Path)]) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_poracode-git-helper"))
            .arg("--watch-v3")
            .envs(variables.iter().copied())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("spawn watcher");
        let stdin = child.stdin.take().expect("stdin");
        let stdout = child.stdout.take().expect("stdout");
        let (sender, messages) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else {
                    break;
                };
                let message = serde_json::from_str(&line).expect("valid watch JSON");
                if sender.send(message).is_err() {
                    break;
                }
            }
        });
        let daemon = Self {
            child,
            stdin: Some(stdin),
            messages,
        };
        daemon.wait("ready", 0, None);
        daemon
    }
    fn send(&mut self, message: Value) {
        writeln!(self.stdin.as_mut().expect("live stdin"), "{message}")
            .expect("send watch command");
    }
    fn watch(&mut self, id: u64, root: &Path) {
        self.send(json!({"protocolVersion":3,"id":id,"kind":"watch","rootPath":root}));
        self.wait("ready", id, None);
    }
    fn wait(&self, kind: &str, id: u64, scope: Option<&str>) -> Value {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let message = self
                .messages
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                .expect("watch response before deadline");
            assert_eq!(message["protocolVersion"], 3);
            assert_ne!(message["kind"], "error", "{message}");
            if message["kind"] == kind
                && message["id"] == id
                && scope.is_none_or(|scope| message["scope"] == scope)
            {
                return message;
            }
        }
    }
    fn changed_for(&self, duration: Duration) -> Vec<Value> {
        let mut messages = Vec::new();
        let deadline = Instant::now() + duration;
        while let Ok(message) = self
            .messages
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
        {
            assert_ne!(message["kind"], "error", "{message}");
            if message["kind"] == "changed" {
                messages.push(message);
            }
        }
        messages
    }
}
impl Drop for Daemon {
    fn drop(&mut self) {
        self.stdin.take();
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn keeps_file_notifications_for_ignored_writes_and_git_fresh_for_tracked_and_rule_changes() {
    let root = Fixture::new();
    let repo = git2::Repository::init(&root.0).expect("init repository");
    root.mkdir("scratch");
    root.write(".gitignore", "scratch/*\n!scratch/keep.txt\n");
    root.write("scratch/tracked.txt", "tracked before\n");
    root.write("scratch/output.log", "ignored before watching\n");
    let mut index = repo.index().expect("index");
    index
        .add_path(Path::new("scratch/tracked.txt"))
        .expect("force add");
    index.write().expect("write index");
    let mut daemon = Daemon::new();
    daemon.watch(1, &root.0);

    root.write("scratch/output.log", "ignored output\n");
    assert_ne!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );
    root.write("scratch/output.log", "ignored output again\n");
    assert_eq!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );
    for name in [
        "scratch/keep.txt",
        "scratch/tracked.txt",
        "scratch/.gitignore",
        "scratch/.gitattributes",
    ] {
        root.write(name, "changed\n");
        assert_ne!(
            daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
            false,
            "{name}"
        );
    }
    fs::remove_file(root.0.join("scratch/tracked.txt")).expect("remove tracked");
    assert_ne!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );

    // The classifier must read the current index, not retain the original one.
    index
        .add_path(Path::new("scratch/output.log"))
        .expect("force add later");
    index.write().expect("write new index");
    root.write("scratch/output.log", "new tracked output\n");
    assert_ne!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );
    root.write(".gitignore", "");
    assert_ne!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );
    root.write("scratch/new.log", "now unignored\n");
    assert_ne!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );
}

#[test]
fn keeps_git_refresh_for_ignored_configuration_sources() {
    for included in [false, true] {
        let root = Fixture::new();
        let repo = git2::Repository::init(&root.0).expect("init repository");
        root.write(".gitignore", "settings\noutput.log\n");
        root.write("output.log", "ignored before watching\n");
        root.write(
            "settings",
            if included {
                "[core]\nignorecase = true\n"
            } else {
                "output.log\n"
            },
        );
        repo.config()
            .expect("config")
            .set_str(
                if included {
                    "include.path"
                } else {
                    "core.excludesfile"
                },
                root.0.join("settings").to_str().expect("fixture path"),
            )
            .expect("set config source");
        let mut daemon = Daemon::new();
        daemon.watch(1, &root.0);
        root.write("output.log", "establish configuration\n");
        daemon.wait("changed", 1, Some("worktree"));
        root.write("output.log", "unchanged configuration\n");
        assert_eq!(
            daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
            false
        );
        root.write(
            "settings",
            if included {
                "[core]\nignorecase = false\n"
            } else {
                "\n"
            },
        );
        assert_ne!(
            daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
            false
        );
        fs::remove_file(root.0.join("settings")).expect("remove config source");
        assert_ne!(
            daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
            false
        );
    }
}

#[test]
fn reconciles_status_after_external_excludes_change() {
    let root = Fixture::new();
    let external = Fixture::new();
    let repo = git2::Repository::init(&root.0).expect("init repository");
    external.write("ignore", "");
    repo.config()
        .expect("config")
        .set_str(
            "core.excludesfile",
            external.0.join("ignore").to_str().expect("external path"),
        )
        .expect("global excludes");
    root.write("output.log", "visible untracked file\n");
    let mut daemon = Daemon::new();
    daemon.watch(1, &root.0);
    root.write("output.log", "still visible\n");
    assert_ne!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );
    external.write("ignore", "output.log\n");
    root.write("output.log", "now ignored\n");
    assert_ne!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );
    root.write("output.log", "unchanged external rules\n");
    assert_eq!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );
}

#[test]
fn reconciles_status_after_default_global_ignore_changes() {
    let root = Fixture::new();
    let external = Fixture::new();
    git2::Repository::init(&root.0).expect("init repository");
    external.mkdir("git");
    external.write("git/ignore", "");
    root.write("output.log", "visible untracked file\n");
    let mut daemon = Daemon::with_env(&[("HOME", &external.0), ("XDG_CONFIG_HOME", &external.0)]);
    daemon.watch(1, &root.0);
    root.write("output.log", "establish external rules\n");
    daemon.wait("changed", 1, Some("worktree"));
    external.write("git/ignore", "output.log\n");
    root.write("output.log", "now ignored\n");
    assert_ne!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );
    root.write("output.log", "unchanged external rules\n");
    assert_eq!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );
}

#[cfg(unix)]
#[test]
fn does_not_classify_lossy_filenames_as_ignore_only() {
    use std::ffi::OsString;
    use std::os::unix::ffi::OsStringExt;
    let root = Fixture::new();
    let repo = git2::Repository::init(&root.0).expect("init repository");
    root.write(".gitignore", "*.log\n");
    let name = PathBuf::from(OsString::from_vec(b"tracked-\xff.log".to_vec()));
    fs::write(root.0.join(&name), "tracked before").expect("write byte path");
    let mut index = repo.index().expect("index");
    index.add_path(&name).expect("add byte path");
    index.write().expect("write index");
    let mut daemon = Daemon::new();
    daemon.watch(1, &root.0);
    root.write("warmup.txt", "establish config fingerprint");
    daemon.wait("changed", 1, Some("worktree"));
    fs::write(root.0.join(&name), "tracked after").expect("edit byte path");
    assert_ne!(
        daemon.wait("changed", 1, Some("worktree"))["gitChanged"],
        false
    );
}

#[cfg(windows)]
#[test]
fn invalidates_after_windows_discards_os_notification_details() {
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;

    #[link(name = "ntdll")]
    unsafe extern "system" {
        fn NtSuspendProcess(process: *mut c_void) -> i32;
        fn NtResumeProcess(process: *mut c_void) -> i32;
    }
    struct Resume(*mut c_void);
    impl Drop for Resume {
        fn drop(&mut self) {
            // Only the disposable helper child is suspended by this fixture.
            unsafe { NtResumeProcess(self.0) };
        }
    }

    let root = Fixture::new();
    for path in ["src", ".git", "node_modules/noise"] {
        root.mkdir(path);
    }
    root.write(".git/HEAD", "ref: refs/heads/main\n");
    root.write("src/tracked.txt", "before\n");
    let mut daemon = Daemon::new();
    daemon.watch(1, &root.0);
    let handle = daemon.child.as_raw_handle();
    assert_eq!(unsafe { NtSuspendProcess(handle) }, 0);
    let resume = Resume(handle);
    // Queue one ignored completion, then overflow the OS's 16 KiB buffer while
    // the owning helper cannot rearm it. Real changes occur inside that gap.
    root.write(".git/index.lock", "noise");
    for index in 0..1000 {
        root.write(
            &format!("node_modules/noise/{index:04}-{}.txt", "x".repeat(96)),
            "noise",
        );
    }
    root.write("src/tracked.txt", "after\n");
    root.write(".git/HEAD", "ref: refs/heads/changed\n");
    drop(resume);
    let messages = daemon.changed_for(Duration::from_secs(2));
    for scope in ["git", "worktree"] {
        assert!(
            messages
                .iter()
                .any(|event| event["id"] == 1 && event["scope"] == scope),
            "missing {scope} after OS overflow: {messages:?}"
        );
    }
    root.write("src/tracked.txt", "still watched\n");
    daemon.wait("changed", 1, Some("worktree"));
}

#[test]
fn coalesces_real_changes_and_filters_noise_without_crossing_scopes() {
    let root = Fixture::new();
    let other = Fixture::new();
    for path in [
        "src",
        ".git/objects/aa",
        ".git/refs/heads",
        "node_modules/a",
        ".poracode/worktrees/topic/src",
    ] {
        root.mkdir(path);
    }
    let mut daemon = Daemon::new();
    daemon.watch(1, &root.0);
    daemon.watch(2, &other.0);
    for index in 0..80 {
        root.write(&format!("src/file-{index}.ts"), "export {}\n");
        root.write(".git/index.lock", "noise");
        root.write(&format!("node_modules/a/file-{index}.js"), "noise");
        root.write(
            &format!(".poracode/worktrees/topic/src/file-{index}.ts"),
            "noise",
        );
    }
    root.write(".git/refs/heads/main", "ref-change\n");
    let messages = daemon.changed_for(Duration::from_millis(1000));
    assert_eq!(messages.len(), 2, "{messages:?}");
    assert!(messages.iter().all(|message| message["id"] == 1));
    assert!(
        messages
            .iter()
            .any(|message| message["scope"] == "worktree")
    );
    assert!(messages.iter().any(|message| message["scope"] == "git"));
    assert!(
        messages
            .iter()
            .all(|message| message.get("paths").is_none())
    );
    daemon.send(json!({"protocolVersion":3,"id":1,"kind":"unwatch"}));
    daemon.wait("unwatched", 1, None);
    root.write("src/late.ts", "retired\n");
    other.write("active.ts", "live\n");
    let messages = daemon.changed_for(Duration::from_millis(700));
    assert_eq!(messages.len(), 1, "{messages:?}");
    assert_eq!(messages[0]["id"], 2);
}

#[test]
fn discovers_late_git_and_linked_worktree_metadata() {
    let root = Fixture::new();
    let linked = Fixture::new();
    let mut daemon = Daemon::new();
    daemon.watch(1, &root.0);
    root.mkdir(".git/refs/heads");
    root.write(".git/HEAD", "ref: refs/heads/main\n");
    daemon.wait("changed", 1, Some("git"));
    root.mkdir(".git/worktrees/topic");
    root.write(".git/worktrees/topic/commondir", "../..\n");
    root.write(".git/worktrees/topic/HEAD", "ref: refs/heads/topic\n");
    linked.write(
        ".git",
        &format!(
            "gitdir: {}\n",
            root.0.join(".git/worktrees/topic").display()
        ),
    );
    daemon.watch(2, &linked.0);
    root.write(".git/worktrees/topic/HEAD", "ref: refs/heads/replacement\n");
    daemon.wait("changed", 2, Some("git"));
    root.write(".git/refs/heads/main", "new-ref\n");
    daemon.wait("changed", 2, Some("git"));
    let _ = daemon.changed_for(Duration::from_millis(400));
    root.write(".git/worktrees/topic/index.lock", "noise");
    assert!(daemon.changed_for(Duration::from_millis(500)).is_empty());
}

#[test]
fn replacement_and_eof_drop_pending_notifications_and_handles() {
    let old = Fixture::new();
    let new = Fixture::new();
    let mut daemon = Daemon::new();
    daemon.watch(1, &old.0);
    old.write("pending.ts", "old\n");
    daemon.send(json!({"protocolVersion":3,"id":1,"kind":"unwatch"}));
    daemon.wait("unwatched", 1, None);
    daemon.watch(2, &new.0);
    old.write("retired.ts", "old\n");
    new.write("live.ts", "new\n");
    let messages = daemon.changed_for(Duration::from_millis(700));
    assert_eq!(messages.len(), 1, "{messages:?}");
    assert_eq!(messages[0]["id"], 2);
    daemon.stdin.take();
    let deadline = Instant::now() + Duration::from_secs(3);
    while daemon.child.try_wait().expect("poll child exit").is_none() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert!(daemon.child.try_wait().expect("child exit").is_some());
}

#[test]
fn removing_overlapping_roots_preserves_live_linked_metadata_and_parent_coverage() {
    let root = Fixture::new();
    let linked = Fixture::new();
    root.mkdir(".git/worktrees/topic");
    root.write(".git/worktrees/topic/commondir", "../..\n");
    root.write(".git/worktrees/topic/HEAD", "ref: refs/heads/topic\n");
    linked.write(
        ".git",
        &format!(
            "gitdir: {}\n",
            root.0.join(".git/worktrees/topic").display()
        ),
    );
    let mut daemon = Daemon::new();
    daemon.watch(1, &root.0);
    daemon.watch(2, &linked.0);
    daemon.send(json!({"protocolVersion":3,"id":2,"kind":"unwatch"}));
    daemon.wait("unwatched", 2, None);
    root.write(".git/worktrees/topic/HEAD", "parent-still-watching\n");
    daemon.wait("changed", 1, Some("git"));
    daemon.watch(3, &linked.0);
    daemon.send(json!({"protocolVersion":3,"id":1,"kind":"unwatch"}));
    daemon.wait("unwatched", 1, None);
    let _ = daemon.changed_for(Duration::from_millis(500));
    root.write(".git/worktrees/topic/HEAD", "linked-still-watching\n");
    daemon.wait("changed", 3, Some("git"));
}

#[test]
fn rejects_previous_protocol_and_invalid_watch_paths() {
    for message in [
        json!({"protocolVersion":2,"id":1,"kind":"watch","rootPath":"/old"}),
        json!({"protocolVersion":3,"id":1,"kind":"watch","rootPath":"relative/path"}),
        json!({"protocolVersion":3,"id":0,"kind":"watch","rootPath":"/zero"}),
        json!({"protocolVersion":3,"id":1,"kind":"unknown"}),
    ] {
        let mut daemon = Daemon::new();
        daemon.send(message);
        let response = daemon
            .messages
            .recv_timeout(Duration::from_secs(3))
            .expect("rejection");
        assert_eq!(response["kind"], "error");
        assert_eq!(response["id"], 0);
        assert!(!daemon.child.wait().expect("rejected exit").success());
    }
}
