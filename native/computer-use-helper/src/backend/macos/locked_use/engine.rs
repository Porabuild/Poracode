//! Locked-use session orchestration, independent of the OS.
//!
//! [`Engine`] owns the decisions: when a begin may proceed, the order of its
//! steps, what every failure undoes, when a session ends and whether that
//! pauses unlocks. Every OS effect goes through [`Platform`], so the whole flow
//! runs in unit tests against fakes — no test locks the screen, spawns the
//! guard, or touches loginwindow.
//!
//! Two locks: `op` serializes begin, end, and session teardown (a begin can
//! hold it for seconds); `state` guards the data and is only ever held briefly,
//! so the plug-in socket's `CONSUME` never waits behind a begin.

use std::cell::RefCell;
use std::io;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use std::time::{Duration, Instant};

use crossbeam_channel::{Receiver, RecvTimeoutError, TryRecvError};

use super::approval::{ApprovalStore, Consume, DenyReason, MintRefused};
use super::line::format_reply;
use super::pause::{PauseReason, PauseStore, should_clear};
use crate::backend::CancelToken;
use crate::protocol::locked_use::{
    LockedUseBeginRequest, LockedUseBeginResult, LockedUseEndOutcome, LockedUseEndReason,
    LockedUseEndResult, LockedUseFlags, LockedUseLastEnd, LockedUseOutcome, LockedUseStage,
    LockedUseStatus, Overlay,
};
use crate::protocol::{ErrorCode, HelperError, Result};

/// How long the guard gets to put its windows and event tap up.
pub(super) const GUARD_READY_TIMEOUT: Duration = Duration::from_secs(5);
const GUARD_POLL: Duration = Duration::from_millis(25);
/// How long the lock screen gets to accept the submitted placeholder.
pub(super) const UNLOCK_TIMEOUT: Duration = Duration::from_secs(8);
const UNLOCK_POLL: Duration = Duration::from_millis(100);
/// How long the host waits for confirmation. The guard stays up on failure.
const RELOCK_SETTLE_TIMEOUT: Duration = Duration::from_secs(1);
const RELOCK_POLL: Duration = Duration::from_millis(50);

fn polls(total: Duration, interval: Duration) -> u32 {
    (total.as_millis() / interval.as_millis().max(1)) as u32
}

/// What the guard subprocess reports on stdout, plus its exit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum GuardEvent {
    Ready,
    LocalInput,
    DisplayChanged,
    Exited,
}

/// The parent's handle on a running guard.
pub(super) trait GuardControl: Send {
    /// Close the guard's stdin — it relocks and exits — and reap it.
    fn stop(&mut self);
}

pub(super) struct SpawnedGuard {
    pub(super) control: Box<dyn GuardControl>,
    pub(super) events: Receiver<GuardEvent>,
    pub(super) interrupted: Arc<AtomicBool>,
    pub(super) alive: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum TriggerFailure {
    Cancelled,
    NoPasswordField,
    PasswordFieldNotEmpty,
}

/// Answers one plug-in `CONSUME` with the full reply line.
pub(super) type ConsumeHandler = Arc<dyn Fn() -> String + Send + Sync>;

/// Every OS effect the engine needs.
pub(super) trait Platform: Send + Sync + 'static {
    /// Wall-clock epoch milliseconds (approvals carry `mintedAtMs`).
    fn now_ms(&self) -> u64;
    fn sleep(&self, duration: Duration);
    /// 32 bytes from the system CSPRNG, or `None` if it failed.
    fn random_bytes(&self) -> Option<[u8; 32]>;
    fn screen_locked(&self) -> bool;
    /// The helper and its parent are signed by the same Developer ID team.
    fn signed(&self) -> bool;
    /// Serve the plug-in socket. False when the plug-in's per-user run
    /// directory is missing or not ours, i.e. the plug-in is not installed.
    fn ensure_socket(&self, handler: ConsumeHandler) -> bool;
    fn stop_socket(&self);
    fn spawn_guard(&self, overlay: &Overlay, dim_display: bool) -> io::Result<SpawnedGuard>;
    /// Replace the guarded lock-screen field with the approved placeholder
    /// and submit it with Return; never read password contents.
    fn trigger_unlock(
        &self,
        cancelled: &dyn Fn() -> bool,
    ) -> std::result::Result<(), TriggerFailure>;
    /// Remove the placeholder a failed attempt left in the password field, so
    /// a person who comes back does not type after it.
    fn clear_trigger(&self, guard_alive: &dyn Fn() -> bool);
    fn forget_trigger(&self);
    fn relock(&self) -> std::result::Result<(), String>;
}

struct Active {
    generation: u64,
    thread_id: String,
    /// Taken while the session is being torn down; the session itself stays
    /// `active` until the relock has been issued.
    guard: Option<Box<dyn GuardControl>>,
}

struct PendingAttempt {
    epoch: u64,
    cancel: CancelToken,
    interrupted: Arc<AtomicBool>,
    guard_alive: Arc<AtomicBool>,
}

#[derive(Default)]
struct State {
    approvals: ApprovalStore,
    pending: Option<PendingAttempt>,
    /// When this process paused unlocks; `None` for a pause loaded from disk.
    paused_since_ms: Option<u64>,
    active: Option<Active>,
    last_end: Option<LockedUseLastEnd>,
}

/// Why an attempt stopped short of `unlocked`.
enum Abort {
    /// Counts against the thread's failure budget.
    Failed(LockedUseStage, Option<PauseReason>),
    /// Paused or out of budget at mint time; no new failure.
    Refused(LockedUseBeginResult),
    /// The request was cancelled, `locked_use_end` arrived, or the helper is
    /// shutting down; no failure.
    Cancelled,
    Internal(String),
}

pub(super) struct Engine<P: Platform> {
    platform: P,
    pause_store: PauseStore,
    state: Mutex<State>,
    op: Mutex<()>,
    /// Bumped by end and shutdown so a begin in flight stops at its next poll.
    abort_epoch: AtomicU64,
    shutting_down: AtomicBool,
    next_generation: AtomicU64,
    weak_self: Weak<Self>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn thread_failure(stage: LockedUseStage) -> Abort {
    Abort::Failed(stage, None)
}

impl<P: Platform> Engine<P> {
    pub(super) fn new(platform: P, pause_store: PauseStore) -> Arc<Self> {
        let mut state = State::default();
        if pause_store.load() {
            state.approvals.pause();
        }
        Arc::new_cyclic(|weak_self| Self {
            platform,
            pause_store,
            state: Mutex::new(state),
            op: Mutex::new(()),
            abort_epoch: AtomicU64::new(0),
            shutting_down: AtomicBool::new(false),
            next_generation: AtomicU64::new(0),
            weak_self: weak_self.clone(),
        })
    }

    fn state(&self) -> MutexGuard<'_, State> {
        lock(&self.state)
    }

    pub(super) fn is_active(&self) -> bool {
        self.state().active.is_some()
    }

    pub(super) fn flags(&self) -> LockedUseFlags {
        let signed = self.platform.signed();
        let state = self.state();
        LockedUseFlags {
            supported: true,
            signed,
            paused: state.approvals.paused(),
            active: state.active.is_some(),
        }
    }

    pub(super) fn status(&self) -> LockedUseStatus {
        let flags = self.flags();
        let screen_locked = self.platform.screen_locked();
        LockedUseStatus {
            supported: flags.supported,
            signed: flags.signed,
            paused: flags.paused,
            active: flags.active,
            screen_locked,
            last_end: self.state().last_end.clone(),
        }
    }

    /// Answer one plug-in `CONSUME`.
    pub(super) fn consume_reply(&self) -> String {
        let now = self.platform.now_ms();
        let mut state = self.state();
        if state.pending.as_ref().is_none_or(|pending| {
            pending.cancel.is_cancelled()
                || pending.interrupted.load(Ordering::SeqCst)
                || pending.epoch != self.abort_epoch.load(Ordering::SeqCst)
                || self.shutting_down.load(Ordering::SeqCst)
        }) {
            state.approvals.invalidate();
        }
        let outcome = state.approvals.consume(now);
        drop(state);
        match &outcome {
            Consume::Allow {
                approval_id,
                thread_id,
                ..
            } => log::info!(
                "locked-use: plug-in consumed approval {} for thread {thread_id}",
                &approval_id[..approval_id.len().min(8)]
            ),
            Consume::Deny(reason) => {
                log::info!("locked-use: plug-in consume denied ({})", reason.as_str());
            }
        }
        format_reply(&outcome)
    }

    fn consume_handler(&self) -> ConsumeHandler {
        let engine = self.weak_self.clone();
        Arc::new(move || match engine.upgrade() {
            Some(engine) => engine.consume_reply(),
            None => format_reply(&Consume::Deny(DenyReason::NonePending)),
        })
    }

    /// Persist a pause. Callers hold the state lock.
    fn pause(&self, state: &mut State, reason: PauseReason, now_ms: u64) {
        state.approvals.pause();
        state.paused_since_ms = Some(now_ms);
        if let Err(error) = self.pause_store.save_paused(reason, now_ms) {
            log::warn!("locked-use: could not persist the pause: {error}");
        }
    }

    pub(super) fn begin(
        &self,
        request: &LockedUseBeginRequest,
        cancel: &CancelToken,
    ) -> Result<LockedUseBeginResult> {
        let epoch = self.abort_epoch.load(Ordering::SeqCst);
        if !self.platform.signed() {
            return Ok(LockedUseBeginResult::unavailable(
                LockedUseStage::UnsignedBuild,
            ));
        }
        let _op = lock(&self.op);
        let aborted = || {
            cancel.is_cancelled()
                || self.shutting_down.load(Ordering::SeqCst)
                || self.abort_epoch.load(Ordering::SeqCst) != epoch
        };
        if aborted() {
            return Err(cancelled());
        }
        {
            let state = self.state();
            if state.active.is_some() {
                return Ok(LockedUseBeginResult::outcome(
                    LockedUseOutcome::AlreadyActive,
                ));
            }
            if state.approvals.budget_exhausted(&request.thread_id) {
                return Ok(LockedUseBeginResult::failed(
                    LockedUseStage::BudgetExhausted,
                ));
            }
            if state.approvals.paused() {
                return Ok(LockedUseBeginResult::outcome(LockedUseOutcome::Paused));
            }
        }
        if !self.platform.screen_locked() {
            return Ok(LockedUseBeginResult::outcome(LockedUseOutcome::NotLocked));
        }
        if !self.platform.ensure_socket(self.consume_handler()) {
            return Ok(LockedUseBeginResult::unavailable(
                LockedUseStage::PluginNotInstalled,
            ));
        }

        let guard = match self
            .platform
            .spawn_guard(&request.overlay, request.dim_display)
        {
            Ok(guard) => guard,
            Err(error) => {
                log::warn!("locked-use: could not start the guard: {error}");
                return Ok(self.record_failure(
                    &request.thread_id,
                    LockedUseStage::GuardFailed,
                    None,
                ));
            }
        };
        let SpawnedGuard {
            mut control,
            events,
            interrupted,
            alive,
        } = guard;
        self.state().pending = Some(PendingAttempt {
            epoch,
            cancel: cancel.clone(),
            interrupted,
            guard_alive: alive,
        });
        match self.attempt(request, &events, &aborted) {
            Ok(approval_id) => {
                let generation = self.next_generation.fetch_add(1, Ordering::SeqCst) + 1;
                self.state().active = Some(Active {
                    generation,
                    thread_id: request.thread_id.clone(),
                    guard: Some(control),
                });
                self.spawn_monitor(generation, events, request.max_session);
                log::info!("locked-use: unlocked for thread {}", request.thread_id);
                Ok(LockedUseBeginResult::unlocked(approval_id))
            }
            Err(abort) => {
                self.undo_attempt(control.as_mut());
                match abort {
                    Abort::Failed(stage, pause) => {
                        log::warn!(
                            "locked-use: begin failed for thread {} at {stage:?}",
                            request.thread_id
                        );
                        Ok(self.record_failure(&request.thread_id, stage, pause))
                    }
                    Abort::Refused(result) => Ok(result),
                    Abort::Cancelled => Err(cancelled()),
                    Abort::Internal(message) => Err(HelperError::internal(message)),
                }
            }
        }
    }

    /// The steps after the guard is spawned. Returns the consumed approval id.
    fn attempt(
        &self,
        request: &LockedUseBeginRequest,
        events: &Receiver<GuardEvent>,
        aborted: &dyn Fn() -> bool,
    ) -> std::result::Result<String, Abort> {
        self.wait_guard_ready(events, aborted)?;

        let random = self
            .platform
            .random_bytes()
            .ok_or_else(|| Abort::Internal("the system random generator failed".into()))?;
        let now = self.platform.now_ms();
        let approval_id = self
            .state()
            .approvals
            .mint(&request.thread_id, &random, now)
            .map_err(|refused| {
                Abort::Refused(match refused {
                    MintRefused::Paused => LockedUseBeginResult::outcome(LockedUseOutcome::Paused),
                    MintRefused::BudgetExhausted => {
                        LockedUseBeginResult::failed(LockedUseStage::BudgetExhausted)
                    }
                })
            })?;

        check_guard(events)?;
        if aborted() {
            return Err(Abort::Cancelled);
        }
        let stopped = RefCell::new(None);
        let cancelled = || {
            let abort = if aborted() {
                Some(Abort::Cancelled)
            } else {
                check_guard(events).err()
            };
            if let Some(abort) = abort {
                self.state().approvals.invalidate();
                *stopped.borrow_mut() = Some(abort);
            }
            stopped.borrow().is_some()
        };
        let triggered = self.platform.trigger_unlock(&cancelled);
        if let Some(abort) = stopped.into_inner() {
            return Err(abort);
        }
        triggered.map_err(|failure| match failure {
            TriggerFailure::Cancelled => Abort::Cancelled,
            TriggerFailure::NoPasswordField => thread_failure(LockedUseStage::NoPasswordField),
            TriggerFailure::PasswordFieldNotEmpty => {
                thread_failure(LockedUseStage::PasswordFieldNotEmpty)
            }
        })?;

        let mut unlocked = false;
        for _ in 0..polls(UNLOCK_TIMEOUT, UNLOCK_POLL) {
            if aborted() {
                return Err(Abort::Cancelled);
            }
            check_guard(events)?;
            if !self.platform.screen_locked() {
                unlocked = true;
                break;
            }
            self.platform.sleep(UNLOCK_POLL);
        }
        if !unlocked {
            return Err(thread_failure(LockedUseStage::StillLocked));
        }
        // Unlocked, but not by our approval (the user, Touch ID, a second
        // authorization path): this is not a session we may hold.
        if !self.state().approvals.is_consumed(&approval_id) {
            return Err(thread_failure(LockedUseStage::NotConsumed));
        }
        self.platform.forget_trigger();
        check_guard(events)?;
        Ok(approval_id)
    }

    fn wait_guard_ready(
        &self,
        events: &Receiver<GuardEvent>,
        aborted: &dyn Fn() -> bool,
    ) -> std::result::Result<(), Abort> {
        for _ in 0..polls(GUARD_READY_TIMEOUT, GUARD_POLL) {
            if aborted() {
                return Err(Abort::Cancelled);
            }
            match events.try_recv() {
                Ok(GuardEvent::Ready) => return Ok(()),
                Ok(GuardEvent::LocalInput | GuardEvent::DisplayChanged) => {
                    return Err(Abort::Failed(
                        LockedUseStage::GuardFailed,
                        Some(PauseReason::LocalInput),
                    ));
                }
                Ok(GuardEvent::Exited) | Err(TryRecvError::Disconnected) => {
                    return Err(thread_failure(LockedUseStage::GuardFailed));
                }
                Err(TryRecvError::Empty) => self.platform.sleep(GUARD_POLL),
            }
        }
        Err(thread_failure(LockedUseStage::GuardFailed))
    }

    /// Undo a begin that did not produce a session: withdraw the approval,
    /// relock if the screen came unlocked anyway, then stop the guard.
    fn undo_attempt(&self, guard: &mut dyn GuardControl) {
        let guard_alive = {
            let mut state = self.state();
            state.approvals.invalidate();
            state.pending.take().map(|p| p.guard_alive)
        };
        if self.platform.screen_locked()
            && let Some(alive) = guard_alive
        {
            self.platform
                .clear_trigger(&|| alive.load(Ordering::SeqCst));
        }
        if !self.platform.screen_locked()
            && let Err(error) = self.platform.relock()
        {
            log::error!("locked-use: relock after a failed begin failed: {error}");
        }
        guard.stop();
    }

    fn record_failure(
        &self,
        thread_id: &str,
        stage: LockedUseStage,
        pause: Option<PauseReason>,
    ) -> LockedUseBeginResult {
        let now = self.platform.now_ms();
        let mut state = self.state();
        let exhausted = state.approvals.record_failure(thread_id);
        if let Some(reason) = pause.or(exhausted.then_some(PauseReason::BudgetExhausted)) {
            self.pause(&mut state, reason, now);
        }
        LockedUseBeginResult::failed(stage)
    }

    fn spawn_monitor(&self, generation: u64, events: Receiver<GuardEvent>, max_session: Duration) {
        let engine = self.weak_self.clone();
        let deadline = Instant::now() + max_session;
        let spawned = std::thread::Builder::new()
            .name("computer-use-locked-use-monitor".into())
            .spawn(move || {
                let (reason, pause) = loop {
                    match events.recv_deadline(deadline) {
                        Ok(GuardEvent::Ready) => {}
                        Ok(GuardEvent::LocalInput) => {
                            break ("local_input", Some(PauseReason::LocalInput));
                        }
                        Ok(GuardEvent::DisplayChanged) => {
                            break ("display_changed", Some(PauseReason::LocalInput));
                        }
                        Ok(GuardEvent::Exited) | Err(RecvTimeoutError::Disconnected) => {
                            break ("guard_exited", None);
                        }
                        Err(RecvTimeoutError::Timeout) => break ("max_session", None),
                    }
                };
                if let Some(engine) = engine.upgrade() {
                    let _op = lock(&engine.op);
                    if let Some(Err(error)) = engine.finish(Some(generation), reason, pause) {
                        log::error!("locked-use: relock after {reason} failed: {error}");
                    }
                }
            });
        if let Err(error) = spawned {
            // Without a monitor nothing would enforce the session limit or
            // notice the guard dying, so the session must not stand.
            log::error!("locked-use: could not start the session monitor: {error}");
            let _ = self.finish(Some(generation), "guard_exited", None);
        }
    }

    /// End the active session (only `generation`'s, when given): relock, then
    /// stop the guard, then record how it ended. Callers hold `op`. Returns
    /// `None` when there was no matching session.
    fn finish(
        &self,
        generation: Option<u64>,
        reason: &str,
        pause: Option<PauseReason>,
    ) -> Option<std::result::Result<(), String>> {
        let (mut guard, thread_id) = {
            let mut state = self.state();
            let active = state
                .active
                .as_mut()
                .filter(|active| generation.is_none_or(|wanted| wanted == active.generation))?;
            (active.guard.take(), active.thread_id.clone())
        };
        let mut relocked = self.platform.relock();
        if relocked.is_ok() {
            // Keep reporting `active` (which refuses foreground input) until
            // the session state shows the lock.
            for _ in 0..polls(RELOCK_SETTLE_TIMEOUT, RELOCK_POLL) {
                if self.platform.screen_locked() {
                    break;
                }
                self.platform.sleep(RELOCK_POLL);
            }
        }
        if !self.platform.screen_locked() {
            relocked = Err("lock state was not confirmed; the guard remains in place".into());
        }
        if let Some(guard) = guard.as_mut() {
            guard.stop();
        }
        let now = self.platform.now_ms();
        let mut state = self.state();
        state.active = None;
        state.approvals.invalidate();
        state.pending = None;
        state.last_end = Some(LockedUseLastEnd {
            reason: reason.to_string(),
            at_ms: now,
        });
        if let Some(pause) = pause.or(relocked.is_err().then_some(PauseReason::LocalInput)) {
            self.pause(&mut state, pause, now);
        }
        log::info!("locked-use: session for thread {thread_id} ended ({reason})");
        Some(relocked)
    }

    pub(super) fn end(&self, reason: LockedUseEndReason) -> Result<LockedUseEndResult> {
        self.abort_epoch.fetch_add(1, Ordering::SeqCst);
        let _op = lock(&self.op);
        match self.finish(None, reason.as_str(), None) {
            None => Ok(LockedUseEndResult {
                outcome: LockedUseEndOutcome::Inactive,
            }),
            Some(Ok(())) => Ok(LockedUseEndResult {
                outcome: LockedUseEndOutcome::Relocked,
            }),
            Some(Err(error)) => Err(HelperError::internal(format!(
                "the locked-use session ended but the Mac could not be relocked: {error}"
            ))),
        }
    }

    /// One round of the 2 s pause poll: lift the pause once the user has
    /// unlocked the Mac by hand. Skipped while a begin or end is running.
    pub(super) fn poll_pause(&self) {
        if !self.state().approvals.paused() || !self.pause_store.can_modify() {
            return;
        }
        let Ok(_op) = self.op.try_lock() else {
            return;
        };
        let screen_locked = self.platform.screen_locked();
        let now = self.platform.now_ms();
        let mut state = self.state();
        if should_clear(
            state.approvals.paused(),
            state.paused_since_ms,
            now,
            state.active.is_some(),
            screen_locked,
        ) {
            state.approvals.resume();
            state.paused_since_ms = None;
            if let Err(error) = self.pause_store.clear() {
                log::warn!("locked-use: could not clear the persisted pause: {error}");
            }
            log::info!("locked-use: manual unlock observed; unlocks resumed");
        }
    }

    /// The helper is exiting: abort any begin, relock an active session, and
    /// stop serving the plug-in. Later begins are cancelled.
    pub(super) fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        self.abort_epoch.fetch_add(1, Ordering::SeqCst);
        let _op = lock(&self.op);
        if let Some(Err(error)) = self.finish(None, LockedUseEndReason::Shutdown.as_str(), None) {
            log::error!("locked-use: relock at shutdown failed: {error}");
        }
        self.platform.stop_socket();
    }
}

fn cancelled() -> HelperError {
    HelperError::new(ErrorCode::Cancelled, "locked_use_begin was cancelled")
}

/// Drain guard events that arrived since the last look.
fn check_guard(events: &Receiver<GuardEvent>) -> std::result::Result<(), Abort> {
    loop {
        match events.try_recv() {
            Ok(GuardEvent::Ready) => {}
            Ok(GuardEvent::LocalInput | GuardEvent::DisplayChanged) => {
                return Err(Abort::Failed(
                    LockedUseStage::GuardFailed,
                    Some(PauseReason::LocalInput),
                ));
            }
            Ok(GuardEvent::Exited) | Err(TryRecvError::Disconnected) => {
                return Err(thread_failure(LockedUseStage::GuardFailed));
            }
            Err(TryRecvError::Empty) => return Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::atomic::AtomicUsize;

    use crossbeam_channel::{Sender, unbounded};

    use super::*;
    use crate::protocol::locked_use::{DEFAULT_OVERLAY_SUBTITLE, DEFAULT_OVERLAY_TITLE};

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum Trigger {
        /// The plug-in consumes; the screen unlocks only on `ALLOW`.
        PlugInConsumes,
        /// Something else unlocks the Mac; nothing is consumed.
        UnlocksWithoutConsume,
        /// Nothing happens.
        Nothing,
        Fails(TriggerFailure),
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum GuardStart {
        Ready,
        LocalInputFirst,
        ExitsFirst,
        Silent,
        SpawnFails,
    }

    struct FakeGuard {
        stops: Arc<AtomicUsize>,
        sender: Option<Sender<GuardEvent>>,
    }

    impl GuardControl for FakeGuard {
        fn stop(&mut self) {
            self.stops.fetch_add(1, Ordering::SeqCst);
            // A real guard exits when its stdin closes.
            if let Some(sender) = self.sender.take() {
                let _ = sender.send(GuardEvent::Exited);
            }
        }
    }

    struct Fake {
        locked: AtomicBool,
        signed: bool,
        socket: bool,
        guard_start: Mutex<GuardStart>,
        trigger: Mutex<Trigger>,
        relock_fails: bool,
        relock_no_effect: bool,
        now: AtomicU64,
        handler: Mutex<Option<ConsumeHandler>>,
        guard_events: Mutex<Option<Sender<GuardEvent>>>,
        spawns: AtomicUsize,
        dim_display: AtomicBool,
        triggers: AtomicUsize,
        relocks: AtomicUsize,
        guard_stops: Arc<AtomicUsize>,
        socket_stopped: AtomicBool,
        interrupted: Arc<AtomicBool>,
        trigger_hook: Mutex<Option<Box<dyn Fn() + Send>>>,
    }

    impl Default for Fake {
        fn default() -> Self {
            Self {
                locked: AtomicBool::new(true),
                signed: true,
                socket: true,
                guard_start: Mutex::new(GuardStart::Ready),
                trigger: Mutex::new(Trigger::PlugInConsumes),
                relock_fails: false,
                relock_no_effect: false,
                now: AtomicU64::new(1_000_000),
                handler: Mutex::new(None),
                guard_events: Mutex::new(None),
                spawns: AtomicUsize::new(0),
                dim_display: AtomicBool::new(false),
                triggers: AtomicUsize::new(0),
                relocks: AtomicUsize::new(0),
                guard_stops: Arc::new(AtomicUsize::new(0)),
                socket_stopped: AtomicBool::new(false),
                interrupted: Arc::new(AtomicBool::new(false)),
                trigger_hook: Mutex::new(None),
            }
        }
    }

    impl Fake {
        /// What the plug-in would see on the socket right now.
        fn plug_in_consume(&self) -> String {
            let handler = lock(&self.handler)
                .clone()
                .expect("socket was never served");
            handler()
        }

        fn send_guard(&self, event: GuardEvent) {
            if event != GuardEvent::Ready {
                self.interrupted.store(true, Ordering::SeqCst);
            }
            lock(&self.guard_events)
                .as_ref()
                .expect("no guard running")
                .send(event)
                .unwrap();
        }
    }

    impl Platform for Arc<Fake> {
        fn now_ms(&self) -> u64 {
            self.now.load(Ordering::SeqCst)
        }

        fn sleep(&self, duration: Duration) {
            self.now
                .fetch_add(duration.as_millis() as u64, Ordering::SeqCst);
        }

        fn random_bytes(&self) -> Option<[u8; 32]> {
            Some([0xa5; 32])
        }

        fn screen_locked(&self) -> bool {
            self.locked.load(Ordering::SeqCst)
        }

        fn signed(&self) -> bool {
            self.signed
        }

        fn ensure_socket(&self, handler: ConsumeHandler) -> bool {
            if self.socket {
                *lock(&self.handler) = Some(handler);
            }
            self.socket
        }

        fn stop_socket(&self) {
            self.socket_stopped.store(true, Ordering::SeqCst);
        }

        fn spawn_guard(&self, overlay: &Overlay, dim_display: bool) -> io::Result<SpawnedGuard> {
            assert_eq!(overlay.title, DEFAULT_OVERLAY_TITLE);
            self.dim_display.store(dim_display, Ordering::SeqCst);
            self.spawns.fetch_add(1, Ordering::SeqCst);
            let (sender, events) = unbounded();
            match *lock(&self.guard_start) {
                GuardStart::SpawnFails => return Err(io::Error::other("spawn failed")),
                GuardStart::Ready => sender.send(GuardEvent::Ready).unwrap(),
                GuardStart::LocalInputFirst => sender.send(GuardEvent::LocalInput).unwrap(),
                GuardStart::ExitsFirst => sender.send(GuardEvent::Exited).unwrap(),
                GuardStart::Silent => {}
            }
            *lock(&self.guard_events) = Some(sender.clone());
            Ok(SpawnedGuard {
                control: Box::new(FakeGuard {
                    stops: self.guard_stops.clone(),
                    sender: Some(sender),
                }),
                events,
                interrupted: self.interrupted.clone(),
                alive: Arc::new(AtomicBool::new(true)),
            })
        }

        fn trigger_unlock(
            &self,
            cancelled: &dyn Fn() -> bool,
        ) -> std::result::Result<(), TriggerFailure> {
            self.triggers.fetch_add(1, Ordering::SeqCst);
            if let Some(hook) = lock(&self.trigger_hook).take() {
                hook();
            }
            if cancelled() {
                return Err(TriggerFailure::Cancelled);
            }
            match *lock(&self.trigger) {
                Trigger::PlugInConsumes => {
                    if self.plug_in_consume().starts_with("ALLOW 1 ") {
                        self.locked.store(false, Ordering::SeqCst);
                    }
                    Ok(())
                }
                Trigger::UnlocksWithoutConsume => {
                    self.locked.store(false, Ordering::SeqCst);
                    Ok(())
                }
                Trigger::Nothing => Ok(()),
                Trigger::Fails(failure) => Err(failure),
            }
        }

        fn clear_trigger(&self, _guard_alive: &dyn Fn() -> bool) {}
        fn forget_trigger(&self) {}

        fn relock(&self) -> std::result::Result<(), String> {
            self.relocks.fetch_add(1, Ordering::SeqCst);
            if self.relock_fails {
                return Err("SACLockScreenImmediate is unavailable".into());
            }
            if !self.relock_no_effect {
                self.locked.store(true, Ordering::SeqCst);
            }
            Ok(())
        }
    }

    #[test]
    fn takeover_during_trigger_revokes_approval_before_submission() {
        let (fake, engine) = engine(Fake::default());
        let weak = Arc::downgrade(&fake);
        *lock(&fake.trigger_hook) = Some(Box::new(move || {
            let fake = weak.upgrade().unwrap();
            fake.send_guard(GuardEvent::LocalInput);
            assert!(fake.plug_in_consume().starts_with("DENY 1 "));
        }));
        let result = engine
            .begin(&request("takeover"), &CancelToken::default())
            .unwrap();
        assert_eq!(result.outcome, LockedUseOutcome::Failed);
        assert!(engine.flags().paused);
        assert!(fake.locked.load(Ordering::SeqCst));
    }

    #[test]
    fn cancellation_during_trigger_revokes_approval() {
        let (fake, engine) = engine(Fake::default());
        let cancel = CancelToken::default();
        let token = cancel.clone();
        let weak = Arc::downgrade(&fake);
        *lock(&fake.trigger_hook) = Some(Box::new(move || {
            token.cancel();
            assert!(
                weak.upgrade()
                    .unwrap()
                    .plug_in_consume()
                    .starts_with("DENY 1 ")
            );
        }));
        assert_eq!(
            engine.begin(&request("cancel"), &cancel).unwrap_err().code,
            ErrorCode::Cancelled
        );
        assert!(fake.locked.load(Ordering::SeqCst));
    }

    fn request(thread_id: &str) -> LockedUseBeginRequest {
        LockedUseBeginRequest {
            thread_id: thread_id.into(),
            overlay: Overlay {
                title: DEFAULT_OVERLAY_TITLE.into(),
                subtitle: DEFAULT_OVERLAY_SUBTITLE.into(),
            },
            max_session: Duration::from_secs(600),
            dim_display: false,
        }
    }

    fn engine_with(fake: Fake, state_dir: Option<&Path>) -> (Arc<Fake>, Arc<Engine<Arc<Fake>>>) {
        let fake = Arc::new(fake);
        let engine = Engine::new(fake.clone(), PauseStore::new(state_dir));
        (fake, engine)
    }

    fn engine(fake: Fake) -> (Arc<Fake>, Arc<Engine<Arc<Fake>>>) {
        engine_with(fake, None)
    }

    fn begin(engine: &Engine<Arc<Fake>>, thread_id: &str) -> LockedUseBeginResult {
        engine
            .begin(&request(thread_id), &CancelToken::default())
            .unwrap()
    }

    fn failed(stage: LockedUseStage) -> LockedUseBeginResult {
        LockedUseBeginResult::failed(stage)
    }

    /// Wait for the session monitor thread to act.
    fn wait_inactive(engine: &Engine<Arc<Fake>>) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while engine.is_active() {
            assert!(Instant::now() < deadline, "session never ended");
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn dimming_is_passed_to_the_guard_only_when_requested() {
        for enabled in [false, true] {
            let (fake, engine) = engine_with(Fake::default(), None);
            let mut request = request("dim-test");
            request.dim_display = enabled;
            let result = engine.begin(&request, &CancelToken::default()).unwrap();
            assert_eq!(result.outcome, LockedUseOutcome::Unlocked);
            assert_eq!(fake.dim_display.load(Ordering::SeqCst), enabled);
            engine.shutdown();
        }
    }

    #[test]
    fn unsigned_builds_never_start_anything() {
        let (fake, engine) = engine(Fake {
            signed: false,
            ..Fake::default()
        });
        assert_eq!(
            begin(&engine, "t"),
            LockedUseBeginResult::unavailable(LockedUseStage::UnsignedBuild)
        );
        assert_eq!(fake.spawns.load(Ordering::SeqCst), 0);
        assert!(!engine.flags().signed);
    }

    #[test]
    fn an_unlocked_screen_is_left_alone() {
        let (fake, engine) = engine(Fake::default());
        fake.locked.store(false, Ordering::SeqCst);
        assert_eq!(
            begin(&engine, "t"),
            LockedUseBeginResult::outcome(LockedUseOutcome::NotLocked)
        );
        assert_eq!(fake.spawns.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn a_missing_plug_in_run_dir_is_unavailable() {
        let (fake, engine) = engine(Fake {
            socket: false,
            ..Fake::default()
        });
        assert_eq!(
            begin(&engine, "t"),
            LockedUseBeginResult::unavailable(LockedUseStage::PluginNotInstalled)
        );
        assert_eq!(fake.spawns.load(Ordering::SeqCst), 0);
        // Not a failure: the budget is untouched.
        assert!(!engine.flags().paused);
    }

    #[test]
    fn a_consumed_approval_unlocks_and_end_relocks_then_stops_the_guard() {
        let (fake, engine) = engine(Fake::default());
        let result = begin(&engine, "thread-1");
        assert_eq!(result.outcome, LockedUseOutcome::Unlocked);
        assert_eq!(result.approval_id.as_deref(), Some(&*"a5".repeat(32)));
        assert!(engine.flags().active);
        assert!(!engine.status().screen_locked);
        assert_eq!(fake.relocks.load(Ordering::SeqCst), 0);
        // Single use.
        assert_eq!(fake.plug_in_consume(), "DENY 1 consumed\n");
        assert_eq!(
            begin(&engine, "thread-2"),
            LockedUseBeginResult::outcome(LockedUseOutcome::AlreadyActive)
        );

        assert_eq!(
            engine.end(LockedUseEndReason::TurnEnd).unwrap().outcome,
            LockedUseEndOutcome::Relocked
        );
        assert_eq!(fake.relocks.load(Ordering::SeqCst), 1);
        assert_eq!(fake.guard_stops.load(Ordering::SeqCst), 1);
        let status = engine.status();
        assert!(!status.active && status.screen_locked && !status.paused);
        assert_eq!(status.last_end.unwrap().reason, "turn_end");
        assert_eq!(fake.plug_in_consume(), "DENY 1 none_pending\n");
        assert_eq!(
            engine.end(LockedUseEndReason::TurnEnd).unwrap().outcome,
            LockedUseEndOutcome::Inactive
        );
        assert_eq!(fake.relocks.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn the_plug_in_is_denied_outside_an_attempt() {
        let (fake, engine) = engine(Fake {
            trigger: Mutex::new(Trigger::Nothing),
            ..Fake::default()
        });
        assert_eq!(begin(&engine, "t"), failed(LockedUseStage::StillLocked));
        // The approval was withdrawn with the failed attempt.
        assert_eq!(fake.plug_in_consume(), "DENY 1 none_pending\n");
        assert_eq!(fake.guard_stops.load(Ordering::SeqCst), 1);
        // Still locked, so no relock was needed.
        assert_eq!(fake.relocks.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn trigger_refusals_fail_with_their_stage_and_undo_the_attempt() {
        for (failure, stage) in [
            (
                TriggerFailure::NoPasswordField,
                LockedUseStage::NoPasswordField,
            ),
            (
                TriggerFailure::PasswordFieldNotEmpty,
                LockedUseStage::PasswordFieldNotEmpty,
            ),
        ] {
            let (fake, engine) = engine(Fake {
                trigger: Mutex::new(Trigger::Fails(failure)),
                ..Fake::default()
            });
            assert_eq!(begin(&engine, "t"), failed(stage));
            assert_eq!(fake.guard_stops.load(Ordering::SeqCst), 1);
            assert_eq!(fake.plug_in_consume(), "DENY 1 none_pending\n");
            assert!(!engine.is_active());
        }
    }

    #[test]
    fn an_unlock_without_our_approval_is_relocked() {
        let (fake, engine) = engine(Fake {
            trigger: Mutex::new(Trigger::UnlocksWithoutConsume),
            ..Fake::default()
        });
        assert_eq!(begin(&engine, "t"), failed(LockedUseStage::NotConsumed));
        assert_eq!(fake.relocks.load(Ordering::SeqCst), 1);
        assert!(fake.screen_locked());
        assert!(!engine.is_active());
    }

    #[test]
    fn guard_start_failures_are_guard_failed() {
        for start in [
            GuardStart::SpawnFails,
            GuardStart::ExitsFirst,
            GuardStart::Silent,
        ] {
            let (fake, engine) = engine(Fake {
                guard_start: Mutex::new(start),
                ..Fake::default()
            });
            assert_eq!(
                begin(&engine, "t"),
                failed(LockedUseStage::GuardFailed),
                "{start:?}"
            );
            assert_eq!(fake.triggers.load(Ordering::SeqCst), 0, "{start:?}");
            assert!(!engine.flags().paused, "{start:?}");
        }
    }

    #[test]
    fn local_input_while_the_guard_starts_pauses_unlocks() {
        let dir = tempfile::tempdir().unwrap();
        let (fake, engine) = engine_with(
            Fake {
                guard_start: Mutex::new(GuardStart::LocalInputFirst),
                ..Fake::default()
            },
            Some(dir.path()),
        );
        assert_eq!(begin(&engine, "t"), failed(LockedUseStage::GuardFailed));
        assert_eq!(fake.triggers.load(Ordering::SeqCst), 0);
        assert!(engine.flags().paused);
        let saved = std::fs::read_to_string(dir.path().join("locked-use.json")).unwrap();
        assert!(saved.contains("local_input"));
        assert_eq!(
            begin(&engine, "other"),
            LockedUseBeginResult::outcome(LockedUseOutcome::Paused)
        );
    }

    #[test]
    fn two_failures_of_one_thread_pause_and_a_manual_unlock_resumes() {
        let dir = tempfile::tempdir().unwrap();
        let (fake, engine) = engine_with(
            Fake {
                trigger: Mutex::new(Trigger::Nothing),
                ..Fake::default()
            },
            Some(dir.path()),
        );
        assert_eq!(begin(&engine, "a"), failed(LockedUseStage::StillLocked));
        assert!(!engine.flags().paused);
        assert_eq!(begin(&engine, "a"), failed(LockedUseStage::StillLocked));
        assert!(engine.flags().paused);
        assert!(dir.path().join("locked-use.json").exists());
        assert_eq!(begin(&engine, "a"), failed(LockedUseStage::BudgetExhausted));
        assert_eq!(
            begin(&engine, "b"),
            LockedUseBeginResult::outcome(LockedUseOutcome::Paused)
        );
        assert_eq!(fake.plug_in_consume(), "DENY 1 paused\n");
        assert_eq!(fake.triggers.load(Ordering::SeqCst), 2);

        // Locked: the poll leaves the pause alone.
        engine.poll_pause();
        assert!(engine.flags().paused);
        // The user unlocks by hand; inside the grace window nothing changes.
        fake.locked.store(false, Ordering::SeqCst);
        engine.poll_pause();
        assert!(engine.flags().paused);
        fake.now.fetch_add(10_000, Ordering::SeqCst);
        engine.poll_pause();
        assert!(!engine.flags().paused);
        assert!(!dir.path().join("locked-use.json").exists());

        *lock(&fake.trigger) = Trigger::PlugInConsumes;
        fake.locked.store(true, Ordering::SeqCst);
        assert_eq!(begin(&engine, "a").outcome, LockedUseOutcome::Unlocked);
    }

    #[test]
    fn a_persisted_pause_survives_a_restart_until_a_manual_unlock() {
        let dir = tempfile::tempdir().unwrap();
        PauseStore::new(Some(dir.path()))
            .save_paused(PauseReason::LocalInput, 1)
            .unwrap();
        let (fake, engine) = engine_with(Fake::default(), Some(dir.path()));
        assert!(engine.flags().paused);
        assert_eq!(
            begin(&engine, "t"),
            LockedUseBeginResult::outcome(LockedUseOutcome::Paused)
        );
        // A pause from a previous process needs no grace period.
        fake.locked.store(false, Ordering::SeqCst);
        engine.poll_pause();
        assert!(!engine.flags().paused);
    }

    #[test]
    fn local_input_during_a_session_relocks_and_pauses() {
        let (fake, engine) = engine(Fake::default());
        assert_eq!(begin(&engine, "t").outcome, LockedUseOutcome::Unlocked);
        fake.send_guard(GuardEvent::LocalInput);
        wait_inactive(&engine);
        let status = engine.status();
        assert!(status.paused && status.screen_locked);
        assert_eq!(status.last_end.unwrap().reason, "local_input");
        assert_eq!(fake.relocks.load(Ordering::SeqCst), 1);
        assert_eq!(fake.guard_stops.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn display_reconfiguration_interrupts_and_pauses_the_session() {
        let (fake, engine) = engine(Fake::default());
        assert_eq!(begin(&engine, "t").outcome, LockedUseOutcome::Unlocked);
        fake.send_guard(GuardEvent::DisplayChanged);
        wait_inactive(&engine);
        let status = engine.status();
        assert!(status.paused && status.screen_locked);
        assert_eq!(status.last_end.unwrap().reason, "display_changed");
    }

    #[test]
    fn a_guard_that_dies_mid_session_relocks_without_pausing() {
        let (fake, engine) = engine(Fake::default());
        assert_eq!(begin(&engine, "t").outcome, LockedUseOutcome::Unlocked);
        fake.send_guard(GuardEvent::Exited);
        wait_inactive(&engine);
        let status = engine.status();
        assert!(!status.paused && status.screen_locked);
        assert_eq!(status.last_end.unwrap().reason, "guard_exited");
    }

    #[test]
    fn the_session_limit_relocks() {
        let (fake, engine) = engine(Fake::default());
        let mut short = request("t");
        short.max_session = Duration::from_millis(20);
        let result = engine.begin(&short, &CancelToken::default()).unwrap();
        assert_eq!(result.outcome, LockedUseOutcome::Unlocked);
        wait_inactive(&engine);
        assert_eq!(engine.status().last_end.unwrap().reason, "max_session");
        assert_eq!(fake.relocks.load(Ordering::SeqCst), 1);
        assert!(!engine.flags().paused);
    }

    #[test]
    fn a_failed_relock_is_reported_and_the_session_still_ends() {
        let (fake, engine) = engine(Fake {
            relock_fails: true,
            ..Fake::default()
        });
        assert_eq!(begin(&engine, "t").outcome, LockedUseOutcome::Unlocked);
        let error = engine.end(LockedUseEndReason::Disabled).unwrap_err();
        assert_eq!(error.code, ErrorCode::Internal);
        assert!(!engine.is_active());
        assert_eq!(fake.guard_stops.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_lock_call_without_a_locked_observation_is_not_success() {
        let (fake, engine) = engine(Fake {
            relock_no_effect: true,
            ..Fake::default()
        });
        assert_eq!(begin(&engine, "t").outcome, LockedUseOutcome::Unlocked);
        assert_eq!(
            engine.end(LockedUseEndReason::Disabled).unwrap_err().code,
            ErrorCode::Internal
        );
        assert!(!fake.screen_locked());
        assert!(engine.flags().paused);
    }

    #[test]
    fn a_manual_unlock_does_not_delete_future_pause_state() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("locked-use.json");
        let bytes = br#"{"schemaVersion":2,"paused":false,"custody":"future"}"#;
        std::fs::write(&path, bytes).unwrap();
        let (fake, engine) = engine_with(Fake::default(), Some(dir.path()));
        fake.locked.store(false, Ordering::SeqCst);
        engine.poll_pause();
        assert!(engine.flags().paused);
        assert_eq!(std::fs::read(path).unwrap(), bytes);
    }

    #[test]
    fn shutdown_relocks_stops_serving_and_refuses_later_begins() {
        let (fake, engine) = engine(Fake::default());
        assert_eq!(begin(&engine, "t").outcome, LockedUseOutcome::Unlocked);
        engine.shutdown();
        assert!(!engine.is_active());
        assert!(fake.screen_locked());
        assert!(fake.socket_stopped.load(Ordering::SeqCst));
        assert_eq!(engine.status().last_end.unwrap().reason, "shutdown");
        let error = engine
            .begin(&request("t"), &CancelToken::default())
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::Cancelled);
    }

    #[test]
    fn a_cancelled_begin_does_not_count_as_a_failure() {
        let (fake, engine) = engine(Fake::default());
        let cancel = CancelToken::default();
        cancel.cancel();
        let error = engine.begin(&request("t"), &cancel).unwrap_err();
        assert_eq!(error.code, ErrorCode::Cancelled);
        assert_eq!(fake.spawns.load(Ordering::SeqCst), 0);
        assert_eq!(begin(&engine, "t").outcome, LockedUseOutcome::Unlocked);
    }

    #[test]
    fn foreground_refusal_holds_until_the_relock_is_issued() {
        // `is_active` is what keeps foreground input refused on an unlocked
        // desktop; it must not drop before `relock` runs.
        let (fake, engine) = engine(Fake::default());
        assert_eq!(begin(&engine, "t").outcome, LockedUseOutcome::Unlocked);
        assert!(engine.is_active() && !fake.screen_locked());
        engine.end(LockedUseEndReason::Idle).unwrap();
        assert!(!engine.is_active() && fake.screen_locked());
    }
}
