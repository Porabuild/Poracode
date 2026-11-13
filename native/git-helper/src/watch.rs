//! Filesystem callbacks, metadata discovery, noise filtering and debounce for
//! every local project/worktree, owned by one `--watch-v3` process.

use crate::protocol::GIT_HELPER_PROTOCOL_VERSION;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{self, BufRead, Read, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::thread;
use std::time::{Duration, Instant};

const DEBOUNCE: Duration = Duration::from_millis(300);
const MAX_LINE_BYTES: u64 = 64 * 1024;
const MAX_WATCH_ID: u64 = (1_u64 << 53) - 1;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Command {
    protocol_version: u32,
    id: u64,
    kind: String,
    root_path: Option<String>,
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Scope {
    Git,
    Worktree,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Message<'a> {
    protocol_version: u32,
    id: u64,
    kind: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<Scope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    git_changed: Option<bool>,
}

fn emit(id: u64, kind: &str, scope: Option<Scope>, error: Option<&str>) -> io::Result<()> {
    emit_with_git_hint(id, kind, scope, error, None)
}

fn emit_with_git_hint(
    id: u64,
    kind: &str,
    scope: Option<Scope>,
    error: Option<&str>,
    git_changed: Option<bool>,
) -> io::Result<()> {
    let message = Message {
        protocol_version: GIT_HELPER_PROTOCOL_VERSION,
        id,
        kind,
        scope,
        error,
        git_changed,
    };
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &message)?;
    stdout.write_all(b"\n")?;
    stdout.flush()
}

enum Input {
    Command(Command),
    Event(notify::Result<Event>),
    Invalid(String),
    Wake,
    Eof,
}

fn publish_event(sender: &SyncSender<Input>, overflow: &AtomicU8, event: notify::Result<Event>) {
    // Inotify reports read-only opens too. Drop them before they can fill the
    // queue and turn overflow recovery into a read/refresh loop.
    if event
        .as_ref()
        .is_ok_and(|event| matches!(event.kind, EventKind::Access(_)) && !event.need_rescan())
    {
        return;
    }
    let is_error = event.is_err();
    if let Err(TrySendError::Full(_)) = sender.try_send(Input::Event(event)) {
        // Never block notify's event loop: watch/unwatch may synchronously wait
        // for that same thread. Overflow requests one conservative rescan; an
        // overflowed watcher error still fails the daemon for client recovery.
        overflow.fetch_or(if is_error { 2 } else { 1 }, Ordering::Relaxed);
        // If the actor drained the queue between try_send and setting the flag,
        // wake it. If still full, a queued input already guarantees that wake.
        let _ = sender.try_send(Input::Wake);
    }
}

struct Subscription {
    root: PathBuf,
    git_dirs: Vec<PathBuf>,
    paths: HashSet<PathBuf>,
    // Exactly two possible deadlines per subscription, regardless of event volume.
    pending: HashMap<Scope, Instant>,
    // None means pathless/overflowed: preserve the conservative status refresh.
    status_paths: Option<HashSet<String>>,
    config_fingerprint: Option<u64>,
}

struct WatchService {
    watcher: RecommendedWatcher,
    subscriptions: HashMap<u64, Subscription>,
    paths: HashMap<PathBuf, usize>,
    registered: HashSet<PathBuf>,
    failure: Option<String>,
}

// Mirrored in src/supervisor/projectWatcherFilters.ts.
fn ignored_tree(name: &str) -> bool {
    const PREFIXES: &[&str] = &[
        "node_modules/",
        ".poracode/worktrees/",
        ".next/",
        "dist/",
        "build/",
        ".turbo/",
        "__pycache__/",
        ".venv/",
        "target/debug/",
        "target/release/",
        ".vite/",
        ".cache/",
        ".swc/",
        ".parcel-cache/",
        ".tmp/",
    ];
    const SEGMENTS: &[&str] = &[
        "/node_modules/",
        "/.next/",
        "/.turbo/",
        "/__pycache__/",
        "/.venv/",
        "/target/debug/",
        "/target/release/",
        "/.vite/",
        "/.cache/",
        "/.swc/",
        "/.parcel-cache/",
        "/.tmp/",
    ];
    name == ".git"
        || name.starts_with(".git/")
        || name.contains("/.git/")
        || PREFIXES.iter().any(|prefix| name.starts_with(prefix))
        || SEGMENTS.iter().any(|segment| name.contains(segment))
        || name.split('/').enumerate().any(|(index, segment)| {
            if segment != "target" {
                return false;
            }
            let mut tail = name.split('/').skip(index + 1);
            tail.next().is_some_and(|target| {
                target
                    .split_once('-')
                    .is_some_and(|(a, b)| !a.is_empty() && !b.is_empty())
            }) && matches!(tail.next(), Some("debug" | "release"))
                && tail.next().is_some()
        })
}

fn git_noise(name: &str) -> bool {
    if matches!(name, "FETCH_HEAD" | "index" | "index.lock")
        || name.starts_with(".watchman-cookie-")
        || name.starts_with("logs/")
        || name.starts_with("objects/")
    {
        return true;
    }
    let parts: Vec<_> = name.split('/').collect();
    parts.first() == Some(&"worktrees")
        && parts.get(1).is_some_and(|name| !name.is_empty())
        && (parts.len() == 2 || (parts.len() == 3 && matches!(parts[2], "index" | "index.lock")))
}

fn relative_name(base: &Path, path: &Path) -> Option<String> {
    let name = path
        .strip_prefix(base)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    (!name.is_empty()).then_some(name)
}

fn git_directories(root: &Path) -> Vec<PathBuf> {
    let dot_git = root.join(".git");
    if dot_git.is_dir() {
        return fs::canonicalize(dot_git).into_iter().collect();
    }
    let Ok(pointer) = fs::read_to_string(dot_git) else {
        return Vec::new();
    };
    let Some(pointer) = pointer.trim().strip_prefix("gitdir:") else {
        return Vec::new();
    };
    let Ok(git_dir) = fs::canonicalize(root.join(pointer.trim())) else {
        return Vec::new();
    };
    let mut dirs = vec![git_dir.clone()];
    if let Ok(pointer) = fs::read_to_string(git_dir.join("commondir"))
        && let Ok(common_dir) = fs::canonicalize(git_dir.join(pointer.trim()))
        && common_dir != git_dir
    {
        dirs.push(common_dir);
    }
    dirs
}

impl WatchService {
    fn new(watcher: RecommendedWatcher) -> Self {
        Self {
            watcher,
            subscriptions: HashMap::new(),
            paths: HashMap::new(),
            registered: HashSet::new(),
            failure: None,
        }
    }

    fn add_path(&mut self, path: &Path) -> notify::Result<()> {
        if let Some(count) = self.paths.get_mut(path) {
            *count += 1;
            return Ok(());
        }
        self.paths.insert(path.to_path_buf(), 1);
        if let Err(error) = self.sync_paths() {
            self.paths.remove(path);
            return Err(error);
        }
        Ok(())
    }

    fn remove_path(&mut self, path: &Path) {
        let Some(count) = self.paths.get_mut(path) else {
            return;
        };
        *count -= 1;
        if *count == 0 {
            self.paths.remove(path);
            if let Err(error) = self.sync_paths() {
                self.failure = Some(error.to_string());
            }
        }
    }

    fn sync_paths(&mut self) -> notify::Result<()> {
        // Inotify shares recursive directory handles: unwatching a nested root
        // would also remove the parent's coverage. Register only disjoint roots.
        let desired: HashSet<PathBuf> = self
            .paths
            .keys()
            .filter(|path| {
                !self
                    .paths
                    .keys()
                    .any(|parent| parent != *path && path.starts_with(parent))
            })
            .cloned()
            .collect();
        let removed: Vec<_> = self.registered.difference(&desired).cloned().collect();
        for path in &removed {
            let _ = self.watcher.unwatch(path);
            self.registered.remove(path);
        }
        for path in desired
            .difference(&self.registered)
            .cloned()
            .collect::<Vec<_>>()
        {
            self.watcher.watch(&path, RecursiveMode::Recursive)?;
            self.registered.insert(path);
        }
        // Cover the brief registration transition for scopes whose covering
        // root changed, using the same bounded debounce as filesystem events.
        let deadline = Instant::now() + DEBOUNCE;
        for subscription in self.subscriptions.values_mut() {
            if removed.iter().any(|path| {
                path.starts_with(&subscription.root) || subscription.root.starts_with(path)
            }) {
                subscription.pending.insert(Scope::Worktree, deadline);
                subscription.status_paths = None;
            }
            if subscription.git_dirs.iter().any(|git| {
                removed
                    .iter()
                    .any(|path| git.starts_with(path) || path.starts_with(git))
            }) {
                subscription.pending.insert(Scope::Git, deadline);
            }
        }
        Ok(())
    }

    fn unwatch(&mut self, id: u64) {
        if let Some(subscription) = self.subscriptions.remove(&id) {
            for path in &subscription.paths {
                self.remove_path(path);
            }
        }
    }

    fn watch(&mut self, id: u64, root: &str) -> Result<(), String> {
        self.unwatch(id);
        let root = fs::canonicalize(root).map_err(|err| err.to_string())?;
        if !root.is_dir() {
            return Err("rootPath must be a directory".into());
        }
        let git_dirs = git_directories(&root);
        let mut paths = HashSet::from([root.clone()]);
        paths.extend(
            git_dirs
                .iter()
                .filter(|path| !path.starts_with(&root))
                .cloned(),
        );
        let mut added: Vec<PathBuf> = Vec::new();
        for path in &paths {
            if let Err(error) = self.add_path(path) {
                for added in &added {
                    self.remove_path(added);
                }
                return Err(error.to_string());
            }
            added.push(path.clone());
        }
        self.subscriptions.insert(
            id,
            Subscription {
                root,
                git_dirs,
                paths,
                pending: HashMap::new(),
                status_paths: Some(HashSet::new()),
                config_fingerprint: None,
            },
        );
        Ok(())
    }

    fn refresh_metadata(&mut self, id: u64) -> Result<bool, String> {
        let Some(subscription) = self.subscriptions.get(&id) else {
            return Ok(false);
        };
        let dirs = git_directories(&subscription.root);
        if dirs == subscription.git_dirs {
            return Ok(false);
        }
        let mut desired = HashSet::from([subscription.root.clone()]);
        desired.extend(
            dirs.iter()
                .filter(|path| !path.starts_with(&subscription.root))
                .cloned(),
        );
        let old = subscription.paths.clone();
        let mut added: Vec<PathBuf> = Vec::new();
        for path in desired.difference(&old) {
            if let Err(error) = self.add_path(path) {
                for added in &added {
                    self.remove_path(added);
                }
                return Err(error.to_string());
            }
            added.push(path.clone());
        }
        for path in old.difference(&desired) {
            self.remove_path(path);
        }
        if let Some(subscription) = self.subscriptions.get_mut(&id) {
            subscription.git_dirs = dirs;
            subscription.paths = desired;
        }
        Ok(true)
    }

    fn event(&mut self, event: Event) -> io::Result<()> {
        // Read/access notifications must never turn a git status read into a refresh loop.
        if matches!(event.kind, EventKind::Access(_)) && !event.need_rescan() {
            return Ok(());
        }
        let mut changes = HashSet::new();
        let mut refresh = HashSet::new();
        for (id, subscription) in &mut self.subscriptions {
            if event.need_rescan() {
                changes.insert((*id, Scope::Git));
                changes.insert((*id, Scope::Worktree));
                refresh.insert(*id);
                subscription.status_paths = None;
            }
            for path in &event.paths {
                if let Some(name) = relative_name(&subscription.root, path) {
                    if name == ".git" {
                        refresh.insert(*id);
                        // Directory mtime events from index.lock churn are noise;
                        // file pointers and topology changes still invalidate Git.
                        if path.is_file() {
                            changes.insert((*id, Scope::Git));
                        }
                    } else if let Some(name) = name.strip_prefix(".git/") {
                        if subscription.git_dirs.is_empty() || name == "commondir" {
                            refresh.insert(*id);
                        }
                        if !git_noise(name) {
                            changes.insert((*id, Scope::Git));
                        }
                    } else if !ignored_tree(&name) {
                        changes.insert((*id, Scope::Worktree));
                        if path.to_str().is_none() {
                            subscription.status_paths = None;
                        }
                        if let Some(paths) = &mut subscription.status_paths {
                            if paths.len() < 256 {
                                paths.insert(name);
                            } else {
                                subscription.status_paths = None;
                            }
                        }
                    }
                }
                for (index, git_dir) in subscription.git_dirs.iter().enumerate() {
                    if git_dir.starts_with(&subscription.root) {
                        continue;
                    }
                    let Some(name) = relative_name(git_dir, path) else {
                        continue;
                    };
                    if index > 0 && name.starts_with("worktrees/") {
                        continue;
                    }
                    if git_noise(&name) {
                        continue;
                    }
                    if name == "commondir" {
                        refresh.insert(*id);
                    }
                    changes.insert((*id, Scope::Git));
                }
            }
        }
        for id in refresh {
            match self.refresh_metadata(id) {
                Ok(true) => {
                    changes.insert((id, Scope::Git));
                }
                Ok(false) => {}
                Err(error) => {
                    self.unwatch(id);
                    emit(id, "error", None, Some(&error))?;
                }
            }
        }
        let deadline = Instant::now() + DEBOUNCE;
        for (id, scope) in changes {
            if let Some(subscription) = self.subscriptions.get_mut(&id) {
                subscription.pending.insert(scope, deadline);
            }
        }
        Ok(())
    }

    fn deadline(&self) -> Option<Instant> {
        self.subscriptions
            .values()
            .flat_map(|sub| sub.pending.values())
            .min()
            .copied()
    }

    fn flush_due(&mut self) -> io::Result<()> {
        let now = Instant::now();
        for (id, subscription) in &mut self.subscriptions {
            let due: Vec<_> = subscription
                .pending
                .iter()
                .filter(|(_, time)| **time <= now)
                .map(|(scope, _)| *scope)
                .collect();
            for scope in due {
                subscription.pending.remove(&scope);
                let git_changed = if scope == Scope::Worktree {
                    let paths = subscription.status_paths.take();
                    subscription.status_paths = Some(HashSet::new());
                    paths
                        .map(|paths| {
                            crate::service::changes_may_affect_status(
                                &subscription.root,
                                &paths,
                                &mut subscription.config_fingerprint,
                            )
                        })
                        .filter(|changed| !changed)
                } else {
                    None
                };
                emit_with_git_hint(*id, "changed", Some(scope), None, git_changed)?;
            }
        }
        Ok(())
    }

    fn serve(&mut self, receiver: &Receiver<Input>, overflow: &AtomicU8) -> Result<(), String> {
        emit(0, "ready", None, None).map_err(|err| err.to_string())?;
        loop {
            if let Some(error) = self.failure.take() {
                return Err(error);
            }
            let flags = overflow.swap(0, Ordering::Relaxed);
            if flags & 2 != 0 {
                return Err("Filesystem watcher failed while its event queue was full".into());
            }
            if flags & 1 != 0 {
                self.event(Event::new(EventKind::Other).set_flag(notify::event::Flag::Rescan))
                    .map_err(|err| err.to_string())?;
            }
            self.flush_due().map_err(|err| err.to_string())?;
            // Sleep only until a pending debounce expires, otherwise block on
            // events/commands. There is no periodic filesystem/watchdog scan.
            let input = match self.deadline() {
                Some(deadline) => {
                    receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
                }
                None => receiver.recv().map_err(|_| RecvTimeoutError::Disconnected),
            };
            match input {
                Err(RecvTimeoutError::Timeout) => continue,
                Ok(Input::Wake) => continue,
                Err(RecvTimeoutError::Disconnected) | Ok(Input::Eof) => return Ok(()),
                Ok(Input::Invalid(error)) => return Err(error),
                Ok(Input::Event(Err(error))) => return Err(error.to_string()),
                Ok(Input::Event(Ok(event))) => self.event(event).map_err(|err| err.to_string())?,
                Ok(Input::Command(command)) => {
                    if command.protocol_version != GIT_HELPER_PROTOCOL_VERSION
                        || command.id == 0
                        || command.id > MAX_WATCH_ID
                    {
                        return Err("Incompatible protocolVersion or invalid watch id".into());
                    }
                    match command.kind.as_str() {
                        "watch" => {
                            let root = command
                                .root_path
                                .as_deref()
                                .ok_or("watch requires rootPath")?;
                            if !Path::new(root).is_absolute() || root.contains('\0') {
                                return Err("rootPath must be absolute".into());
                            }
                            match self.watch(command.id, root) {
                                Ok(()) => emit(command.id, "ready", None, None),
                                Err(error) => emit(command.id, "error", None, Some(&error)),
                            }
                            .map_err(|err| err.to_string())?;
                        }
                        "unwatch" => {
                            self.unwatch(command.id);
                            emit(command.id, "unwatched", None, None)
                                .map_err(|err| err.to_string())?;
                        }
                        _ => return Err("Unknown watch command".into()),
                    }
                }
            }
        }
    }
}

/// Run the dedicated watch mode until stdin EOF, a broken output pipe or a
/// watcher failure. A failure terminates the process so the client can resubscribe
/// every still-live scope on the worker fallback.
pub fn run() -> ExitCode {
    let (sender, receiver) = mpsc::sync_channel(1024);
    let events = sender.clone();
    let overflow = Arc::new(AtomicU8::new(0));
    let event_overflow = Arc::clone(&overflow);
    let watcher = match notify::recommended_watcher(move |event| {
        publish_event(&events, &event_overflow, event);
    }) {
        Ok(watcher) => watcher,
        Err(error) => {
            let _ = emit(0, "error", None, Some(&error.to_string()));
            return ExitCode::from(1);
        }
    };
    thread::spawn(move || {
        let mut reader = io::stdin().lock();
        loop {
            let mut line = String::new();
            let result = reader
                .by_ref()
                .take(MAX_LINE_BYTES + 1)
                .read_line(&mut line);
            match result {
                Ok(0) => break,
                Ok(_) if line.len() as u64 > MAX_LINE_BYTES => {
                    let _ = sender.send(Input::Invalid("Watch command exceeded limit".into()));
                    return;
                }
                Ok(_) => match serde_json::from_str::<Command>(&line) {
                    Ok(command) => {
                        if sender.send(Input::Command(command)).is_err() {
                            return;
                        }
                    }
                    Err(error) => {
                        let _ = sender.send(Input::Invalid(error.to_string()));
                        return;
                    }
                },
                Err(_) => break,
            }
        }
        let _ = sender.send(Input::Eof);
    });
    let mut service = WatchService::new(watcher);
    match service.serve(&receiver, &overflow) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            let _ = emit(0, "error", None, Some(&error));
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, AccessMode, Flag};

    #[test]
    fn event_overflow_is_bounded_nonblocking_and_retains_watcher_failures() {
        let (sender, receiver) = mpsc::sync_channel(1);
        let overflow = AtomicU8::new(0);
        for _ in 0..10_000 {
            publish_event(
                &sender,
                &overflow,
                Ok(Event::new(EventKind::Access(AccessKind::Open(
                    AccessMode::Read,
                )))),
            );
        }
        assert!(receiver.try_recv().is_err());
        assert_eq!(overflow.load(Ordering::Relaxed), 0);
        publish_event(
            &sender,
            &overflow,
            Ok(
                Event::new(EventKind::Access(AccessKind::Open(AccessMode::Read)))
                    .set_flag(Flag::Rescan),
            ),
        );
        assert!(matches!(receiver.try_recv(), Ok(Input::Event(Ok(event))) if event.need_rescan()));
        assert_eq!(overflow.load(Ordering::Relaxed), 0);
        publish_event(&sender, &overflow, Ok(Event::new(EventKind::Other)));
        publish_event(&sender, &overflow, Ok(Event::new(EventKind::Other)));
        assert_eq!(overflow.swap(0, Ordering::Relaxed), 1);
        assert!(receiver.try_recv().is_ok());
        publish_event(&sender, &overflow, Ok(Event::new(EventKind::Other)));
        publish_event(
            &sender,
            &overflow,
            Err(notify::Error::generic("watcher failed")),
        );
        assert_eq!(overflow.load(Ordering::Relaxed), 2);
        assert!(receiver.try_recv().is_ok());
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn access_rescan_still_invalidates_both_scopes() -> Result<(), Box<dyn std::error::Error>> {
        let watcher = notify::recommended_watcher(|_| {})?;
        let mut service = WatchService::new(watcher);
        service.subscriptions.insert(
            1,
            Subscription {
                root: std::env::temp_dir()
                    .join(format!("poracode-access-rescan-{}", std::process::id())),
                git_dirs: Vec::new(),
                paths: HashSet::new(),
                pending: HashMap::new(),
                status_paths: Some(HashSet::new()),
                config_fingerprint: None,
            },
        );
        service.event(Event::new(EventKind::Access(AccessKind::Open(
            AccessMode::Read,
        ))))?;
        assert!(service.subscriptions[&1].pending.is_empty());
        service.event(
            Event::new(EventKind::Access(AccessKind::Open(AccessMode::Read)))
                .set_flag(Flag::Rescan),
        )?;
        let pending = &service.subscriptions[&1].pending;
        assert_eq!(pending.len(), 2);
        assert!(pending.contains_key(&Scope::Git));
        assert!(pending.contains_key(&Scope::Worktree));
        Ok(())
    }

    #[test]
    fn preserves_noise_and_scope_filters() {
        for name in [
            "index",
            "index.lock",
            "FETCH_HEAD",
            "logs/HEAD",
            "objects/aa/object",
            "worktrees/topic",
            "worktrees/topic/index.lock",
            ".watchman-cookie-1",
        ] {
            assert!(git_noise(name), "{name}");
        }
        for name in [
            "HEAD",
            "refs/heads/topic",
            "worktrees/topic/HEAD",
            "config",
            "packed-refs",
        ] {
            assert!(!git_noise(name), "{name}");
        }
        for name in [
            "node_modules/react/index.js",
            ".poracode/worktrees/topic/src/app.ts",
            "packages/a/node_modules/a.js",
            "native/helper/target/release/helper",
            "target/x86_64-pc-windows-msvc/release/helper.exe",
            "native/helper/target/aarch64-apple-darwin/debug/helper",
            ".vite/deps/a.js",
            "packages/a/.vite/deps/a.js",
            ".cache/a",
            "packages/a/.cache/a",
            ".swc/a",
            "packages/a/.swc/a",
            ".parcel-cache/a",
            "packages/a/.parcel-cache/a",
            ".tmp/a",
        ] {
            assert!(ignored_tree(name), "{name}");
        }
        for name in [
            "src/app.ts",
            ".poracode/settings.json",
            "src/target/router.ts",
            "src/targeting/router.ts",
        ] {
            assert!(!ignored_tree(name), "{name}");
        }
    }

    #[test]
    fn lossy_event_paths_keep_status_unknown() -> Result<(), Box<dyn std::error::Error>> {
        #[cfg(unix)]
        let name = {
            use std::os::unix::ffi::OsStringExt;
            std::ffi::OsString::from_vec(vec![0xff])
        };
        #[cfg(windows)]
        let name = {
            use std::os::windows::ffi::OsStringExt;
            std::ffi::OsString::from_wide(&[0xd800])
        };
        let root = std::env::temp_dir().join("poracode-lossy-watch-event");
        let path = root.join(name);
        assert!(path.to_str().is_none());
        let watcher = notify::recommended_watcher(|_| {})?;
        let mut service = WatchService::new(watcher);
        service.subscriptions.insert(
            1,
            Subscription {
                root,
                git_dirs: Vec::new(),
                paths: HashSet::new(),
                pending: HashMap::new(),
                status_paths: Some(HashSet::from(["ignored.log".to_owned()])),
                config_fingerprint: None,
            },
        );
        service.event(Event::new(EventKind::Any).add_path(path))?;
        let subscription = &service.subscriptions[&1];
        assert!(subscription.pending.contains_key(&Scope::Worktree));
        assert!(subscription.status_paths.is_none());
        Ok(())
    }
}
