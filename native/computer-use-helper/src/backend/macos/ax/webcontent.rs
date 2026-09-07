//! Getting a browser to expose its page, and detecting that it has not.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use objc2_core_foundation::CFBoolean;

use super::{AxElement, array_attribute, set_value};
use crate::backend::CancelToken;
use crate::elements::Snapshot;
use crate::protocol::Result;

/// Canonical role name of a Chromium page container (`canonical_role` of
/// `AXWebArea`). A web area with no children means the page is not exposed.
const WEB_AREA_ROLE: &str = "webarea";
const WEB_CONTENT_POLL: Duration = Duration::from_millis(50);
/// Budget for a Chromium renderer to publish a page after it is asked to.
/// 750 ms covered Brave lab pages; the wait is paid on a snapshot that
/// finds a childless web area, so do not raise it without a measured miss.
const WEB_CONTENT_TIMEOUT: Duration = Duration::from_millis(750);

/// Electron debounces platform accessibility activation for two seconds. Before
/// that completes, its native window groups contain no web area at all.
pub(super) const WEB_AREA_TIMEOUT: Duration = Duration::from_millis(2500);

pub(super) fn has_web_area<H>(snapshot: &Snapshot<H>) -> bool {
    snapshot
        .elements
        .iter()
        .any(|element| element.role == WEB_AREA_ROLE)
}

/// Poll without repeating the activation write: another write can restart the
/// application's debounce. The caller supplies a bounded window-tree read.
pub(super) fn await_web_area<H>(
    mut snapshot: Snapshot<H>,
    timeout: Duration,
    cancel: &CancelToken,
    mut read: impl FnMut() -> Result<Snapshot<H>>,
) -> Result<Snapshot<H>> {
    let deadline = Instant::now() + timeout;
    while !snapshot.truncated && !has_web_area(&snapshot) && Instant::now() < deadline {
        cancel.check()?;
        thread::sleep(WEB_CONTENT_POLL.min(deadline.saturating_duration_since(Instant::now())));
        cancel.check()?;
        snapshot = read()?;
    }
    Ok(snapshot)
}

pub(super) fn enable_manual_accessibility(application: &AxElement) -> bool {
    let value = CFBoolean::new(true);
    set_value(
        application,
        "AXManualAccessibility",
        (value as *const CFBoolean).cast(),
    ) | set_value(
        application,
        "AXEnhancedUserInterface",
        (value as *const CFBoolean).cast(),
    )
}

pub(super) type PidLog = OnceLock<Mutex<HashMap<u32, Instant>>>;

/// How long the "already asked this process for its web content" record holds.
///
/// The log is keyed by pid and macOS reuses pids, so without an expiry a
/// browser that restarts into a pid this helper has already handled would be
/// treated as already asked and would never expose its page again for the life
/// of the session.
const WEB_REQUEST_TTL: Duration = Duration::from_secs(60);

/// How long a spent empty-tree retry holds.
///
/// Deliberately short. The record only exists to stop an app whose window
/// genuinely has no children from paying an extra walk on every snapshot, and
/// the passive and input lanes run concurrently: a click that spends the retry
/// while a page is still being built must not leave the `find_elements` call
/// the agent makes next with nothing to find and no way to ask again.
pub(super) const RETRY_CONTENT_TTL: Duration = Duration::from_secs(2);

/// How long a page that never arrived is taken at its word.
///
/// Separating the write from the wait left the wait itself unbounded, and some
/// web areas are permanently childless — `about:blank`, an empty subframe, a
/// pane that never publishes. Those would otherwise pay the full
/// `WEB_CONTENT_TIMEOUT` plus a second tree walk on every snapshot, every
/// `find_elements` and every coordinate click, forever. One wait per interval
/// keeps a genuinely slow page recoverable while making an empty one cheap.
pub(super) const PAGE_ABSENT_TTL: Duration = Duration::from_secs(10);

/// Processes whose page did not arrive within the wait.
pub(super) static PAGE_ABSENT: PidLog = OnceLock::new();

fn pid_log(cell: &'static PidLog) -> &'static Mutex<HashMap<u32, Instant>> {
    cell.get_or_init(|| Mutex::new(HashMap::new()))
}

/// True when `pid` was recorded recently enough to still count.
///
/// Reading never refreshes the stamp. Refreshing it would turn the expiry into
/// a sliding window that never elapses for a window being polled, which is
/// exactly the case the expiry exists for.
pub(super) fn pid_logged(cell: &'static PidLog, pid: u32, ttl: Duration) -> bool {
    pid_log(cell)
        .lock()
        .is_ok_and(|log| log.get(&pid).is_some_and(|at| at.elapsed() < ttl))
}

/// Record that this caller has handled `pid`.
pub(super) fn record_pid(cell: &'static PidLog, pid: u32, ttl: Duration) {
    if let Ok(mut log) = pid_log(cell).lock() {
        log.retain(|_, at| at.elapsed() < ttl);
        log.insert(pid, Instant::now());
    }
}

/// Ask a Chromium process once to expose its web content.
///
/// Chromium builds the accessibility tree for a page only while an assistive
/// client is known to be watching, and the request is per process rather than
/// per window. Repeating it on every snapshot would cost a round trip for no
/// gain, so remember the processes already asked.
pub(super) fn request_web_accessibility(pid: u32, application: &AxElement) {
    static REQUESTED: PidLog = OnceLock::new();
    if !pid_logged(&REQUESTED, pid, WEB_REQUEST_TTL) && enable_manual_accessibility(application) {
        record_pid(&REQUESTED, pid, WEB_REQUEST_TTL);
    }
}

/// What a tree is missing, when it has nothing to act on.
///
/// Stated as a property of the tree rather than of the app, so an unrecognized
/// browser recovers the same way a recognized one does.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum MissingContent {
    /// A lone node: the application proxy macOS substitutes for a window it
    /// will not describe.
    WholeTree,
    /// A web area whose page was never built, by index into the snapshot. A
    /// window can host several — docked developer tools, a PDF viewer, a
    /// subframe — so the empty one is not necessarily the first.
    Page(usize),
}

pub(super) fn missing_content<H>(snapshot: &Snapshot<H>) -> Option<MissingContent> {
    if snapshot.elements.len() <= 1 {
        return Some(MissingContent::WholeTree);
    }
    // A walk that ran out of node budget proves nothing about any page in it.
    // The walk is breadth-first and its results are sorted into pre-order, so
    // truncation removes a breadth frontier whose members land scattered
    // through the list — a childless web area in a truncated tree may simply be
    // one whose children were cut, and re-asking would write a process-wide
    // accessibility mode into an app whose page is perfectly healthy.
    if snapshot.truncated {
        return None;
    }
    snapshot
        .elements
        .iter()
        .enumerate()
        .filter(|(_, element)| element.role == WEB_AREA_ROLE)
        .find(|(index, _)| !has_children(snapshot, *index))
        .map(|(index, _)| MissingContent::Page(index))
}

/// Elements are pushed in tree order, so a node's first child is the element
/// right after it, exactly one level deeper.
fn has_children<H>(snapshot: &Snapshot<H>, index: usize) -> bool {
    let Some(element) = snapshot.elements.get(index) else {
        return false;
    };
    snapshot
        .elements
        .get(index + 1)
        .is_some_and(|next| next.depth > element.depth)
}

/// Wait for a page to appear after [`request_web_accessibility`].
///
/// Chromium answers the request asynchronously: the renderer has to build the
/// tree first. Without this the re-walk would race the browser and describe the
/// same empty web area, and the agent would fall back to coordinates.
pub(super) fn await_web_content(web_area: &AxElement, cancel: &CancelToken) -> Result<()> {
    let deadline = Instant::now() + WEB_CONTENT_TIMEOUT;
    loop {
        cancel.check()?;
        if !array_attribute(web_area, "AXChildren").is_empty() || Instant::now() >= deadline {
            return Ok(());
        }
        thread::sleep(WEB_CONTENT_POLL);
    }
}

/// Processes whose empty tree has already been retried.
pub(super) static RETRIED_CONTENT: PidLog = OnceLock::new();

#[cfg(test)]
mod tests {
    use super::{
        MissingContent, PidLog, WEB_AREA_ROLE, await_web_area, has_web_area, missing_content,
        pid_logged, record_pid,
    };
    use crate::backend::CancelToken;
    use crate::elements::Snapshot;
    use crate::protocol::actions::{ElementBounds, ElementInfo};
    use std::sync::OnceLock;
    use std::thread;
    use std::time::Duration;

    fn node(role: &str, depth: u32) -> ElementInfo {
        ElementInfo {
            id: String::new(),
            role: role.into(),
            name: None,
            value: None,
            automation_id: None,
            bounds: ElementBounds {
                x: 0,
                y: 0,
                width: 1,
                height: 1,
            },
            enabled: true,
            focused: false,
            offscreen: false,
            actions: Vec::new(),
            depth,
        }
    }

    fn snapshot(nodes: &[(&str, u32)], truncated: bool) -> Snapshot<()> {
        let mut snapshot = Snapshot::new(1);
        for (role, depth) in nodes {
            snapshot.push(node(role, *depth), ());
        }
        snapshot.truncated = truncated;
        snapshot
    }

    #[test]
    fn waits_for_a_web_area_missing_from_the_native_shell() {
        let mut reads = 0;
        let result = await_web_area(
            snapshot(&[("window", 0), ("group", 1)], false),
            Duration::from_secs(1),
            &CancelToken::default(),
            || {
                reads += 1;
                Ok(snapshot(
                    &[("window", 0), (WEB_AREA_ROLE, 1), ("button", 2)],
                    false,
                ))
            },
        )
        .unwrap();
        assert_eq!(reads, 1);
        assert!(has_web_area(&result));
    }

    #[test]
    fn does_not_poll_populated_truncated_or_expired_snapshots() {
        for (initial, timeout) in [
            (
                snapshot(&[("window", 0), (WEB_AREA_ROLE, 1)], false),
                Duration::from_secs(1),
            ),
            (snapshot(&[("window", 0)], true), Duration::from_secs(1)),
            (snapshot(&[("window", 0)], false), Duration::ZERO),
        ] {
            await_web_area(initial, timeout, &CancelToken::default(), || {
                panic!("this snapshot must not trigger another read")
            })
            .unwrap();
        }
    }

    /// A Chromium window always describes its own browser chrome, so an empty
    /// page shows up as a childless web area rather than an empty tree. Missing
    /// that is what left an agent with no element to act on.
    #[test]
    fn treats_a_childless_web_area_as_missing_content() {
        assert_eq!(
            missing_content(&snapshot(
                &[("window", 0), ("toolbar", 1), (WEB_AREA_ROLE, 1)],
                false,
            )),
            Some(MissingContent::Page(2))
        );
        assert_eq!(
            missing_content(&snapshot(
                &[("window", 0), (WEB_AREA_ROLE, 1), ("button", 2)],
                false,
            )),
            None
        );
    }

    /// The walk is breadth-first and its results are sorted into pre-order, so
    /// a truncated walk drops a frontier whose members land scattered through
    /// the list — not at its end. Re-asking on the strength of a childless web
    /// area in a truncated tree would write a process-wide accessibility mode
    /// into an app whose page is perfectly healthy.
    #[test]
    fn never_retries_a_truncated_walk() {
        assert_eq!(
            missing_content(&snapshot(
                &[
                    ("window", 0),
                    (WEB_AREA_ROLE, 1),
                    ("button", 2),
                    (WEB_AREA_ROLE, 1),
                    ("toolbar", 1),
                ],
                true,
            )),
            None,
            "a childless web area in the middle of a truncated tree proves nothing"
        );
    }

    /// A window can host several web areas — docked developer tools, a PDF
    /// viewer, a subframe — so the empty one is not necessarily the first.
    #[test]
    fn finds_an_empty_web_area_behind_a_populated_one() {
        assert_eq!(
            missing_content(&snapshot(
                &[
                    ("window", 0),
                    (WEB_AREA_ROLE, 1),
                    ("button", 2),
                    (WEB_AREA_ROLE, 1),
                ],
                false,
            )),
            Some(MissingContent::Page(3))
        );
    }

    /// A pid log expires instead of pinning a decision forever, and reading it
    /// never pushes the expiry out — a window being polled would otherwise keep
    /// its record alive for the life of the session, which is the case the
    /// expiry exists for (macOS reuses pids).
    #[test]
    fn pid_records_expire_and_reads_do_not_renew_them() {
        static LOG: PidLog = OnceLock::new();
        let ttl = Duration::from_millis(60);

        assert!(!pid_logged(&LOG, 4321, ttl));
        record_pid(&LOG, 4321, ttl);
        assert!(pid_logged(&LOG, 4321, ttl));

        thread::sleep(Duration::from_millis(35));
        assert!(pid_logged(&LOG, 4321, ttl), "still inside the window");
        thread::sleep(Duration::from_millis(35));
        assert!(
            !pid_logged(&LOG, 4321, ttl),
            "the reads above must not have renewed it"
        );
    }

    /// The application proxy macOS substitutes while the console is locked.
    #[test]
    fn treats_a_lone_node_as_missing_content() {
        assert_eq!(
            missing_content(&snapshot(&[("application", 0)], false)),
            Some(MissingContent::WholeTree)
        );
    }

    #[test]
    fn keeps_an_ordinary_tree_and_a_budget_limited_walk_alone() {
        assert_eq!(
            missing_content(&snapshot(&[("window", 0), ("button", 1)], false)),
            None
        );
        // The walk ran out of nodes at the web area, which says nothing about
        // the page below it; re-walking would only spend the budget again.
        assert_eq!(
            missing_content(&snapshot(
                &[("window", 0), ("toolbar", 1), (WEB_AREA_ROLE, 1)],
                true,
            )),
            None
        );
    }
}
