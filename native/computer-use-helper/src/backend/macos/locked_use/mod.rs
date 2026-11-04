//! Locked Computer Use: briefly unlock a locked Mac under an opaque guard so a
//! Computer Use turn can run, then relock.
//!
//! The pieces, by concern:
//!
//! * `engine` — the OS-independent flow (begin, end, pause), unit-tested
//!   against fakes;
//! * `approval` — the single-use approval the authorization plug-in consumes;
//! * `line` and `socket` — the plug-in's socket and its line protocol;
//! * `signing` — the signed-build gate (and the CSPRNG);
//! * `trigger` — reveal, fill with the placeholder, and submit the lock-screen password field;
//! * `relock` — `SACLockScreenImmediate`;
//! * `guard_process` and `guard_app` — the guard subprocess, from both sides;
//! * `pause` — the persisted pause.
//!
//! The contract is `tmp/locked-computer-use-spec.md`; the helper never stores,
//! reads, or types a password.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::backend::CancelToken;
use crate::protocol::Result;
use crate::protocol::locked_use::{
    LockedUseBeginRequest, LockedUseBeginResult, LockedUseEndReason, LockedUseEndResult,
    LockedUseFlags, LockedUseStatus, Overlay,
};

mod approval;
mod brightness;
mod engine;
mod guard_app;
mod guard_process;
mod line;
mod pause;
mod relock;
mod signing;
mod socket;
mod trigger;

use engine::{ConsumeHandler, Engine, Platform, SpawnedGuard, TriggerFailure};
use pause::PauseStore;
use socket::SocketServer;

/// How often a pause is checked for a manual unlock.
const PAUSE_POLL_INTERVAL: Duration = Duration::from_secs(2);

/// The real macOS effects behind [`Engine`].
#[derive(Default)]
struct MacPlatform {
    signed: OnceLock<bool>,
    socket: Mutex<Option<SocketServer>>,
    placeholder_written: AtomicBool,
}

impl MacPlatform {
    fn socket(&self) -> std::sync::MutexGuard<'_, Option<SocketServer>> {
        self.socket
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl Platform for MacPlatform {
    fn now_ms(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_millis() as u64)
    }

    fn sleep(&self, duration: Duration) {
        std::thread::sleep(duration);
    }

    fn random_bytes(&self) -> Option<[u8; 32]> {
        signing::random_bytes()
    }

    fn screen_locked(&self) -> bool {
        super::session::screen_locked()
    }

    fn signed(&self) -> bool {
        // Neither binary's signature nor the parent can change while the
        // helper runs (an orphaned helper exits on stdin EOF).
        *self
            .signed
            .get_or_init(signing::signed_by_same_team_as_parent)
    }

    fn ensure_socket(&self, handler: ConsumeHandler) -> bool {
        let mut socket = self.socket();
        if socket.as_ref().is_some_and(SocketServer::is_healthy) {
            return true;
        }
        // Stop the stale server before binding a new one at the same path.
        socket.take();
        match SocketServer::start_for_current_user(handler) {
            Ok(server) => {
                *socket = Some(server);
                true
            }
            Err(error) => {
                log::warn!("locked-use: plug-in socket unavailable: {error}");
                false
            }
        }
    }

    fn stop_socket(&self) {
        self.socket().take();
    }

    fn spawn_guard(&self, overlay: &Overlay, dim_display: bool) -> std::io::Result<SpawnedGuard> {
        guard_process::spawn(overlay, dim_display)
    }

    fn trigger_unlock(
        &self,
        cancelled: &dyn Fn() -> bool,
    ) -> std::result::Result<(), TriggerFailure> {
        self.placeholder_written.store(false, Ordering::SeqCst);
        objc2::rc::autoreleasepool(|_| {
            trigger::submit_placeholder(cancelled, &self.placeholder_written)
        })
    }

    fn clear_trigger(&self, guard_alive: &dyn Fn() -> bool) {
        if self.placeholder_written.swap(false, Ordering::SeqCst) {
            objc2::rc::autoreleasepool(|_| trigger::clear_placeholder(guard_alive));
        }
    }

    fn forget_trigger(&self) {
        self.placeholder_written.store(false, Ordering::SeqCst);
    }

    fn relock(&self) -> std::result::Result<(), String> {
        relock::relock()
    }
}

/// The backend's handle on locked use.
pub struct LockedUse {
    engine: Arc<Engine<MacPlatform>>,
}

impl LockedUse {
    pub fn new(state_dir: Option<&Path>) -> Self {
        let engine = Engine::new(MacPlatform::default(), PauseStore::new(state_dir));
        let weak = Arc::downgrade(&engine);
        let _ = std::thread::Builder::new()
            .name("computer-use-locked-use-pause".into())
            .spawn(move || {
                loop {
                    std::thread::sleep(PAUSE_POLL_INTERVAL);
                    let Some(engine) = weak.upgrade() else {
                        return;
                    };
                    engine.poll_pause();
                }
            });
        Self { engine }
    }

    /// True while a session holds the desktop: foreground input and window
    /// activation stay refused, exactly as on a locked screen.
    pub fn is_active(&self) -> bool {
        self.engine.is_active()
    }

    pub fn flags(&self) -> LockedUseFlags {
        self.engine.flags()
    }

    pub fn begin(
        &self,
        request: &LockedUseBeginRequest,
        cancel: &CancelToken,
    ) -> Result<LockedUseBeginResult> {
        self.engine.begin(request, cancel)
    }

    pub fn end(&self, reason: LockedUseEndReason) -> Result<LockedUseEndResult> {
        self.engine.end(reason)
    }

    pub fn status(&self) -> LockedUseStatus {
        self.engine.status()
    }

    pub fn shutdown(&self) {
        self.engine.shutdown();
    }
}

/// Entry point of `--locked-use-guard` mode. Returns the exit status when the
/// guard could not come up; otherwise it never returns.
pub fn run_guard(title: &str, subtitle: &str, brightness: Option<&str>) -> i32 {
    guard_app::run(title, subtitle, brightness)
}
