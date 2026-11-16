//! The parent's side of the guard subprocess.
//!
//! The guard is this same binary in `--locked-use-guard` mode. It talks over
//! two pipes: it prints `ready` and `local_input` lines on stdout, and treats
//! EOF on its stdin as "relock and exit" — so the guard also relocks when the
//! helper dies without a word.

use std::io::{self, BufRead, BufReader, Read};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::{Duration, Instant};

use crossbeam_channel::{Sender, unbounded};

use super::brightness::Snapshot;
use super::engine::{GuardControl, GuardEvent, SpawnedGuard};
use crate::protocol::locked_use::{
    GUARD_BRIGHTNESS_FLAG, GUARD_FLAG, GUARD_SUBTITLE_FLAG, GUARD_TITLE_FLAG, Overlay,
};

pub(crate) const READY_LINE: &str = "ready";
pub(crate) const LOCAL_INPUT_LINE: &str = "local_input";
pub(crate) const DISPLAY_CHANGED_LINE: &str = "display_changed";
/// How long to wait synchronously before leaving the guard to finish relocking.
const STOP_TIMEOUT: Duration = Duration::from_secs(2);
// A stopped guard may still be restoring brightness behind a confirmed lock.
// Do not let another begin snapshot that temporary dim level.
static CLEANUP_PENDING: AtomicBool = AtomicBool::new(false);

fn claim_cleanup(pending: &AtomicBool) -> io::Result<()> {
    pending
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map(|_| ())
        .map_err(|_| io::Error::other("previous locked-use guard is still cleaning up"))
}

/// Map one guard stdout line to an event; unknown lines are ignored.
pub(super) fn parse_line(line: &str) -> Option<GuardEvent> {
    match line.trim_end() {
        READY_LINE => Some(GuardEvent::Ready),
        LOCAL_INPUT_LINE => Some(GuardEvent::LocalInput),
        DISPLAY_CHANGED_LINE => Some(GuardEvent::DisplayChanged),
        _ => None,
    }
}

struct GuardChild {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    reader: Option<std::thread::JoinHandle<()>>,
}

impl GuardControl for GuardChild {
    fn stop(&mut self) {
        // Closing stdin is the guard's relock-and-exit signal.
        drop(self.stdin.take());
        let deadline = Instant::now() + STOP_TIMEOUT;
        loop {
            let Some(child) = self.child.as_mut() else {
                return;
            };
            match child.try_wait() {
                Ok(Some(_)) => {
                    self.child.take();
                    // A later begin must capture the restored level, never
                    // the old session's dimmed brightness. Relock has already
                    // been requested before stopping this guard.
                    if let Some(reader) = self.reader.take() {
                        let _ = reader.join();
                    }
                    return;
                }
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(20));
                }
                _ => break,
            }
        }
        // A failed relock must never expose the desktop. The guard owns its
        // retry loop and exits only once it observes a locked session.
        log::error!("locked-use: guard is still protecting the desktop while relocking");
        if let Some(mut child) = self.child.take() {
            let reader = self.reader.take();
            let _ = std::thread::Builder::new()
                .name("locked-use-guard-reaper".into())
                .spawn(move || {
                    let _ = child.wait();
                    if let Some(reader) = reader {
                        let _ = reader.join();
                    }
                });
        }
    }
}

impl Drop for GuardChild {
    fn drop(&mut self) {
        if self.stdin.is_some() {
            self.stop();
        }
    }
}

pub(super) fn spawn(overlay: &Overlay, dim_display: bool) -> io::Result<SpawnedGuard> {
    let executable = std::env::current_exe()?;
    claim_cleanup(&CLEANUP_PENDING)?;
    let brightness = Snapshot::capture(dim_display);
    let child = Command::new(executable)
        .arg(GUARD_FLAG)
        .arg(GUARD_TITLE_FLAG)
        .arg(&overlay.title)
        .arg(GUARD_SUBTITLE_FLAG)
        .arg(&overlay.subtitle)
        .arg(GUARD_BRIGHTNESS_FLAG)
        .arg(brightness.encode())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn();
    let mut child = match child {
        Ok(child) => child,
        Err(error) => {
            CLEANUP_PENDING.store(false, Ordering::SeqCst);
            return Err(error);
        }
    };
    let stdin = child.stdin.take();
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("guard stdout was not captured"))?;
    let (sender, events) = unbounded();
    let interrupted = Arc::new(AtomicBool::new(false));
    let reader_interrupted = interrupted.clone();
    let alive = Arc::new(AtomicBool::new(true));
    let reader_alive = alive.clone();
    let mut control = GuardChild {
        child: Some(child),
        stdin,
        reader: None,
    };
    let reader = std::thread::Builder::new()
        .name("computer-use-locked-use-guard".into())
        .spawn(move || {
            read_guard_output(
                stdout,
                &sender,
                &reader_interrupted,
                &reader_alive,
                &CLEANUP_PENDING,
                || {
                    brightness.restore();
                },
            );
        });
    // On reader creation failure, control closes stdin and relocks on drop.
    // Keep the barrier set: without a reader cleanup cannot be confirmed.
    control.reader = Some(reader?);
    Ok(SpawnedGuard {
        control: Box::new(control),
        events,
        interrupted,
        alive,
    })
}

/// Notify the engine before optional display IPC, but keep the reader alive
/// until restoration finishes so stop() can serialize the next session.
fn read_guard_output(
    stdout: impl Read,
    sender: &Sender<GuardEvent>,
    interrupted: &AtomicBool,
    alive: &AtomicBool,
    cleanup_pending: &AtomicBool,
    restore: impl FnOnce(),
) {
    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        if let Some(event) = parse_line(&line) {
            if event != GuardEvent::Ready {
                interrupted.store(true, Ordering::SeqCst);
            }
            let _ = sender.send(event);
        }
    }
    alive.store(false, Ordering::SeqCst);
    interrupted.store(true, Ordering::SeqCst);
    let _ = sender.send(GuardEvent::Exited);
    restore();
    cleanup_pending.store(false, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_blocked_restore_cannot_delay_relock_or_race_the_next_session() {
        let (sender, events) = unbounded();
        let (restoring, at_restore) = unbounded();
        let (release, released) = unbounded();
        let interrupted = Arc::new(AtomicBool::new(false));
        let alive = Arc::new(AtomicBool::new(true));
        let reader_interrupted = interrupted.clone();
        let reader_alive = alive.clone();
        let reader = std::thread::spawn(move || {
            read_guard_output(
                io::empty(),
                &sender,
                &reader_interrupted,
                &reader_alive,
                &AtomicBool::new(true),
                || {
                    restoring.send(()).unwrap();
                    released.recv().unwrap();
                },
            );
        });
        at_restore.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(events.try_recv().unwrap(), GuardEvent::Exited);
        assert!(!alive.load(Ordering::SeqCst));
        assert!(interrupted.load(Ordering::SeqCst));
        // A harmless exited process stands in for the dead guard. No display
        // or lock APIs are called in this regression test.
        let child = Command::new("/usr/bin/true").spawn().unwrap();
        let mut guard = GuardChild {
            child: Some(child),
            stdin: None,
            reader: Some(reader),
        };
        let (finished, done) = unbounded();
        let stop = std::thread::spawn(move || {
            guard.stop();
            finished.send(()).unwrap();
        });
        assert!(done.recv_timeout(Duration::from_millis(100)).is_err());
        release.send(()).unwrap();
        done.recv_timeout(Duration::from_secs(2)).unwrap();
        stop.join().unwrap();
    }

    #[test]
    fn reaper_cleanup_blocks_a_new_guard_until_restoration_finishes() {
        let pending = Arc::new(AtomicBool::new(false));
        claim_cleanup(&pending).unwrap();
        let reader_pending = pending.clone();
        let (sender, _events) = unbounded();
        let (restoring, at_restore) = unbounded();
        let (release, released) = unbounded();
        let (finished, done) = unbounded();
        // Keep a harmless child alive beyond stop's timeout, then explicitly
        // close its input. This exercises the real background-reaper branch.
        let mut child = Command::new("/bin/cat")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let keepalive = child.stdin.take();
        let stdout = child.stdout.take().unwrap();
        let reader = std::thread::spawn(move || {
            read_guard_output(
                stdout,
                &sender,
                &AtomicBool::new(false),
                &AtomicBool::new(true),
                &reader_pending,
                || {
                    restoring.send(()).unwrap();
                    released.recv().unwrap();
                },
            );
            finished.send(()).unwrap();
        });
        let mut guard = GuardChild {
            child: Some(child),
            stdin: None,
            reader: Some(reader),
        };
        guard.stop();
        assert!(claim_cleanup(&pending).is_err());
        drop(keepalive);
        at_restore.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(claim_cleanup(&pending).is_err());
        release.send(()).unwrap();
        done.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(claim_cleanup(&pending).is_ok());
    }

    #[test]
    fn parses_the_guard_protocol() {
        assert_eq!(parse_line("ready\n"), Some(GuardEvent::Ready));
        assert_eq!(parse_line("local_input"), Some(GuardEvent::LocalInput));
        assert_eq!(
            parse_line("display_changed"),
            Some(GuardEvent::DisplayChanged)
        );
        assert_eq!(parse_line("READY"), None);
        assert_eq!(parse_line("something else"), None);
    }
}
