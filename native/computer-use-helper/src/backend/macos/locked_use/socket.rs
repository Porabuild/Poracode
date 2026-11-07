//! The Unix socket the authorization plug-in asks for an approval on.
//!
//! The socket lives in the plug-in's per-user run directory, which the
//! installer creates owned by the console user with mode 0700. The helper
//! never creates that directory: if it is missing, or not ours and private,
//! the plug-in is not (properly) installed and locked use is unavailable.
//!
//! Only root may ask — the plug-in runs privileged inside `authorizationhost`
//! — so every other peer is dropped before a byte is read. One short request,
//! one reply, close. Serving happens on its own thread and never blocks the
//! NDJSON loop.

use std::fs;
use std::io::{self, Read, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{FileTypeExt, MetadataExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;
use std::time::Duration;

use super::approval::DenyReason;
use super::engine::ConsumeHandler;
use super::line::{MAX_REQUEST_BYTES, format_reply, is_consume_request};

pub(super) const RUN_ROOT: &str = "/Library/Application Support/Poracode/LockedComputerUse/run";
pub(super) const SOCKET_NAME: &str = "helper.sock";
/// The plug-in gives the whole exchange 250 ms; a slower peer is dropped.
const IO_TIMEOUT: Duration = Duration::from_millis(200);
const ACCEPT_POLL_MS: i32 = 100;
/// The only peer uid the plug-in can have.
const PLUG_IN_UID: libc::uid_t = 0;

pub(super) fn run_dir(uid: libc::uid_t) -> PathBuf {
    Path::new(RUN_ROOT).join(uid.to_string())
}

/// The run directory must be a real directory (not a symlink), owned by `uid`,
/// with mode 0700.
pub(super) fn run_dir_is_valid(dir: &Path, uid: libc::uid_t) -> bool {
    fs::symlink_metadata(dir).is_ok_and(|metadata| {
        metadata.file_type().is_dir()
            && metadata.uid() == uid
            && metadata.permissions().mode() & 0o7777 == 0o700
    })
}

/// Remove a leftover socket file, but only one that is a socket owned by us.
/// Anything else at that path is left alone and reported.
fn remove_stale_socket(path: &Path, uid: libc::uid_t) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
        Ok(metadata) if metadata.file_type().is_socket() && metadata.uid() == uid => {
            fs::remove_file(path)
        }
        Ok(_) => Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            format!("{} exists and is not our socket", path.display()),
        )),
    }
}

fn peer_uid(stream: &UnixStream) -> Option<libc::uid_t> {
    let mut uid: libc::uid_t = 0;
    let mut gid: libc::gid_t = 0;
    // SAFETY: The descriptor is a live connected Unix socket and both outputs
    // are writable locals.
    (unsafe { libc::getpeereid(stream.as_raw_fd(), &mut uid, &mut gid) } == 0).then_some(uid)
}

/// Read up to the first newline (inclusive), bounded in size and time.
fn read_request(stream: &mut UnixStream) -> Option<Vec<u8>> {
    let mut request = Vec::with_capacity(MAX_REQUEST_BYTES);
    let mut byte = [0u8; 1];
    while request.len() < MAX_REQUEST_BYTES {
        match stream.read(&mut byte) {
            Ok(1) => {
                request.push(byte[0]);
                if byte[0] == b'\n' {
                    return Some(request);
                }
            }
            _ => return None,
        }
    }
    None
}

fn serve_one(mut stream: UnixStream, allowed_uid: libc::uid_t, handler: &ConsumeHandler) {
    // Accepted sockets inherit the listener's non-blocking mode.
    if stream.set_nonblocking(false).is_err()
        || stream.set_read_timeout(Some(IO_TIMEOUT)).is_err()
        || stream.set_write_timeout(Some(IO_TIMEOUT)).is_err()
    {
        return;
    }
    match peer_uid(&stream) {
        Some(uid) if uid == allowed_uid => {}
        other => {
            log::warn!("locked-use: dropped a socket peer with uid {other:?}");
            return;
        }
    }
    let reply = match read_request(&mut stream) {
        Some(request) if is_consume_request(&request) => handler(),
        _ => format_reply(&super::approval::Consume::Deny(DenyReason::BadRequest)),
    };
    let _ = stream.write_all(reply.as_bytes());
}

fn wait_readable(listener: &UnixListener) -> bool {
    let mut descriptor = libc::pollfd {
        fd: listener.as_raw_fd(),
        events: libc::POLLIN,
        revents: 0,
    };
    // SAFETY: One valid pollfd for a live descriptor; the count matches.
    unsafe { libc::poll(&mut descriptor, 1, ACCEPT_POLL_MS) > 0 }
}

/// A running socket server. Dropping it stops the thread and removes the
/// socket file.
pub(super) struct SocketServer {
    path: PathBuf,
    identity: (u64, u64),
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl SocketServer {
    /// Bind `dir/helper.sock` (mode 0600) and serve `allowed_uid` peers.
    pub(super) fn start(
        dir: &Path,
        owner_uid: libc::uid_t,
        allowed_uid: libc::uid_t,
        handler: ConsumeHandler,
    ) -> io::Result<Self> {
        if !run_dir_is_valid(dir, owner_uid) {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!(
                    "{} is missing or not a private directory of ours",
                    dir.display()
                ),
            ));
        }
        let path = dir.join(SOCKET_NAME);
        remove_stale_socket(&path, owner_uid)?;
        let listener = UnixListener::bind(&path)?;
        // The directory is already private; this keeps the socket private too
        // if the directory's mode is ever widened.
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
        listener.set_nonblocking(true)?;
        let metadata = fs::symlink_metadata(&path)?;
        let identity = (metadata.dev(), metadata.ino());
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        let thread = std::thread::Builder::new()
            .name("computer-use-locked-use-socket".into())
            .spawn(move || {
                while !thread_stop.load(Ordering::SeqCst) {
                    if !wait_readable(&listener) {
                        continue;
                    }
                    match listener.accept() {
                        Ok((stream, _)) => serve_one(stream, allowed_uid, &handler),
                        Err(error) if error.kind() == io::ErrorKind::WouldBlock => {}
                        Err(error) => {
                            log::warn!("locked-use: socket accept failed: {error}");
                            std::thread::sleep(Duration::from_millis(ACCEPT_POLL_MS as u64));
                        }
                    }
                }
            })?;
        Ok(Self {
            path,
            identity,
            stop,
            thread: Some(thread),
        })
    }

    /// Start the production server for the current user.
    pub(super) fn start_for_current_user(handler: ConsumeHandler) -> io::Result<Self> {
        // SAFETY: getuid has no preconditions and cannot fail.
        let uid = unsafe { libc::getuid() };
        Self::start(&run_dir(uid), uid, PLUG_IN_UID, handler)
    }

    /// Whether the socket file this server bound is still the one on disk.
    /// An uninstall (or anything else) that removes it means a rebind.
    pub(super) fn is_healthy(&self) -> bool {
        self.thread
            .as_ref()
            .is_some_and(|thread| !thread.is_finished())
            && fs::symlink_metadata(&self.path)
                .is_ok_and(|metadata| (metadata.dev(), metadata.ino()) == self.identity)
    }
}

impl Drop for SocketServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        // Only remove the file if it is still the one we bound.
        if fs::symlink_metadata(&self.path)
            .is_ok_and(|metadata| (metadata.dev(), metadata.ino()) == self.identity)
        {
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader};
    use std::os::unix::fs::symlink;
    use std::sync::atomic::AtomicUsize;

    use super::*;

    fn uid() -> libc::uid_t {
        // SAFETY: getuid has no preconditions.
        unsafe { libc::getuid() }
    }

    fn private_dir() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).unwrap();
        dir
    }

    fn counting_handler() -> (ConsumeHandler, Arc<AtomicUsize>) {
        let calls = Arc::new(AtomicUsize::new(0));
        let counter = calls.clone();
        let handler: ConsumeHandler = Arc::new(move || {
            counter.fetch_add(1, Ordering::SeqCst);
            "DENY 1 none_pending\n".to_string()
        });
        (handler, calls)
    }

    fn exchange(path: &Path, request: &[u8]) -> String {
        let mut stream = UnixStream::connect(path).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        stream.write_all(request).unwrap();
        let mut reply = String::new();
        let _ = BufReader::new(stream).read_line(&mut reply);
        reply
    }

    #[test]
    fn the_run_dir_must_be_a_private_directory_we_own() {
        let dir = private_dir();
        assert!(run_dir_is_valid(dir.path(), uid()));
        assert!(!run_dir_is_valid(dir.path(), uid() + 1));
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o755)).unwrap();
        assert!(!run_dir_is_valid(dir.path(), uid()));
        assert!(!run_dir_is_valid(&dir.path().join("missing"), uid()));

        let target = private_dir();
        let link = dir.path().join("link");
        symlink(target.path(), &link).unwrap();
        assert!(!run_dir_is_valid(&link, uid()));
        assert_eq!(run_dir(501), Path::new(RUN_ROOT).join("501"));
    }

    #[test]
    fn refuses_to_start_without_the_run_dir() {
        let dir = private_dir();
        let (handler, _) = counting_handler();
        assert!(SocketServer::start(&dir.path().join("missing"), uid(), uid(), handler).is_err());
    }

    #[test]
    fn serves_the_allowed_peer_and_cleans_up() {
        let dir = private_dir();
        let (handler, calls) = counting_handler();
        // Tests cannot be root, so allow our own uid to exercise the exchange.
        let server = SocketServer::start(dir.path(), uid(), uid(), handler).unwrap();
        let path = dir.path().join(SOCKET_NAME);
        let mode = fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        assert!(server.is_healthy());

        assert_eq!(exchange(&path, b"CONSUME 1\n"), "DENY 1 none_pending\n");
        assert_eq!(exchange(&path, b"HELLO\n"), "DENY 1 bad_request\n");
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        drop(server);
        assert!(!path.exists());
    }

    #[test]
    fn drops_peers_that_are_not_the_plug_in() {
        let dir = private_dir();
        let (handler, calls) = counting_handler();
        let _server = SocketServer::start(dir.path(), uid(), PLUG_IN_UID, handler).unwrap();
        let reply = exchange(&dir.path().join(SOCKET_NAME), b"CONSUME 1\n");
        assert_eq!(reply, "");
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn replaces_only_a_stale_socket_of_ours() {
        let dir = private_dir();
        let path = dir.path().join(SOCKET_NAME);
        // A leftover socket from a previous helper is replaced.
        drop(UnixListener::bind(&path).unwrap());
        let (handler, _) = counting_handler();
        let server = SocketServer::start(dir.path(), uid(), uid(), handler.clone()).unwrap();
        drop(server);

        // A regular file is not ours to delete.
        fs::write(&path, b"not a socket").unwrap();
        assert!(SocketServer::start(dir.path(), uid(), uid(), handler).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"not a socket");
    }

    #[test]
    fn notices_when_its_socket_file_is_removed() {
        let dir = private_dir();
        let (handler, _) = counting_handler();
        let server = SocketServer::start(dir.path(), uid(), uid(), handler).unwrap();
        fs::remove_file(dir.path().join(SOCKET_NAME)).unwrap();
        assert!(!server.is_healthy());
    }
}
