//! Recognizing a snapshot whose page content has not arrived, and waiting for
//! it while it still might.
//!
//! A web engine builds the accessibility tree for a page only after an
//! assistive client connects, and it does so asynchronously: the first walk
//! can legitimately race the exposure and come back with a lone window node,
//! or with a page container that has no children yet. Re-walking on a bounded
//! budget turns that race into a short wait, and a per-process record keeps
//! an app whose page never arrives from paying the budget on every call. The
//! page roles are the caller's — each backend knows what its platform calls a
//! page container; everything here is a property of the snapshot shape alone.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use crate::backend::CancelToken;
use crate::elements::Snapshot;
use crate::protocol::Result;

/// Poll interval between re-walks.
pub const PAGE_WAIT_POLL: Duration = Duration::from_millis(50);
/// Budget for a page to appear after a walk finds it missing. 750 ms covered
/// Chromium pages on macOS; the wait is paid only by a snapshot that has
/// nothing to act on, so do not raise it without a measured miss.
pub const PAGE_WAIT_BUDGET: Duration = Duration::from_millis(750);
/// How long a page that never arrived is taken at its word.
///
/// Some pages are permanently childless — `about:blank`, an empty subframe, a
/// pane that never publishes. Without an expiry those would pay the full
/// budget plus a second walk on every snapshot and every `find_elements`
/// call, forever. One wait per interval keeps a slow page recoverable while
/// making an absent one cheap.
pub const PAGE_ABSENT_TTL: Duration = Duration::from_secs(10);
/// The note for a tree that still has no page content to act on.
pub const PAGE_NOT_EXPOSED: &str = "page_not_exposed";

/// What a tree is missing, when it has nothing to act on.
///
/// Stated as a property of the tree rather than of the app, so an
/// unrecognized browser recovers the same way a recognized one does.
#[derive(Debug, PartialEq, Eq)]
pub enum MissingContent {
    /// A lone node: the walk produced only the window root itself.
    WholeTree,
    /// A page container whose children never arrived, by index into the
    /// snapshot. A window can host several — docked developer tools, a PDF
    /// viewer, a subframe — so the empty one is not necessarily the first.
    Page(usize),
}

/// The page containers in `snapshot` that have no children, and a whole tree
/// that has nothing but its root.
///
/// Elements are pushed in tree order, so a node's first child is the element
/// right after it, exactly one level deeper. A walk that ran out of node
/// budget proves nothing about any page in it — truncation removes a breadth
/// frontier whose members land scattered through the list, so a childless
/// container in a truncated walk may simply be one whose children were cut.
pub fn missing_content<H>(snapshot: &Snapshot<H>, page_roles: &[&str]) -> Option<MissingContent> {
    if snapshot.elements.len() <= 1 {
        return Some(MissingContent::WholeTree);
    }
    if snapshot.truncated {
        return None;
    }
    snapshot
        .elements
        .iter()
        .enumerate()
        .filter(|(_, element)| page_roles.contains(&element.role.as_str()))
        .find(|(index, _)| !has_children(snapshot, *index))
        .map(|(index, _)| MissingContent::Page(index))
}

fn has_children<H>(snapshot: &Snapshot<H>, index: usize) -> bool {
    let element = &snapshot.elements[index];
    snapshot
        .elements
        .get(index + 1)
        .is_some_and(|next| next.depth > element.depth)
}

/// The note for a finished snapshot that still has no page content to act on.
///
/// Emitted whether or not this call paid the wait: an absent page stays
/// absent for later callers, and the note is how they know the emptiness is
/// not the whole truth about the app.
pub fn page_note<H>(snapshot: &Snapshot<H>, page_roles: &[&str]) -> Option<String> {
    (!snapshot.truncated && missing_content(snapshot, page_roles).is_some())
        .then(|| PAGE_NOT_EXPOSED.to_string())
}

/// A record of which processes were last handled, and when.
pub type PidLog = OnceLock<Mutex<HashMap<u32, Instant>>>;

/// Processes whose page did not arrive within the wait.
pub static PAGE_ABSENT: PidLog = OnceLock::new();

fn pid_log(cell: &PidLog) -> &Mutex<HashMap<u32, Instant>> {
    cell.get_or_init(|| Mutex::new(HashMap::new()))
}

/// True when `pid` was recorded recently enough to still count.
///
/// Reading never refreshes the stamp. Refreshing it would turn the expiry
/// into a sliding window that never elapses for a window being polled, which
/// is exactly the case the expiry exists for.
pub fn pid_logged(cell: &PidLog, pid: u32, ttl: Duration) -> bool {
    pid_log(cell)
        .lock()
        .is_ok_and(|log| log.get(&pid).is_some_and(|at| at.elapsed() < ttl))
}

/// Record that this caller has handled `pid`.
pub fn record_pid(cell: &PidLog, pid: u32, ttl: Duration) {
    if let Ok(mut log) = pid_log(cell).lock() {
        log.retain(|_, at| at.elapsed() < ttl);
        log.insert(pid, Instant::now());
    }
}

/// Re-walk on a bounded budget while `snapshot` still has nothing to act on.
///
/// Budget and expiry policy for one page wait.
///
/// The budget bounds the re-walks; the TTL says how long a page that never
/// arrived is taken at its word before the next caller pays the budget again.
#[derive(Clone, Copy)]
pub struct PageWait {
    pub budget: Duration,
    pub ttl: Duration,
}

/// The production wait: 750 ms of re-walks, a 10 s absent-page record.
pub const PAGE_WAIT: PageWait = PageWait {
    budget: PAGE_WAIT_BUDGET,
    ttl: PAGE_ABSENT_TTL,
};

/// The caller supplies the walk; the wait sits between walks, so a page that
/// arrives mid-budget is picked up by the next walk without this module
/// knowing anything about the platform underneath. A process whose page did
/// not arrive is recorded in `log` and trusted for `wait.ttl`, and a process
/// still inside that record returns without walking again.
pub fn await_page_content<H>(
    mut snapshot: Snapshot<H>,
    pid: Option<u32>,
    page_roles: &[&str],
    log: &PidLog,
    wait: PageWait,
    cancel: &CancelToken,
    mut read: impl FnMut() -> Result<Snapshot<H>>,
) -> Result<Snapshot<H>> {
    let Some(pid) = pid else {
        return Ok(snapshot);
    };
    if snapshot.truncated
        || missing_content(&snapshot, page_roles).is_none()
        || pid_logged(log, pid, wait.ttl)
    {
        return Ok(snapshot);
    }
    let deadline = Instant::now() + wait.budget;
    while missing_content(&snapshot, page_roles).is_some() && Instant::now() < deadline {
        cancel.check()?;
        thread::sleep(PAGE_WAIT_POLL.min(deadline.saturating_duration_since(Instant::now())));
        cancel.check()?;
        snapshot = read()?;
    }
    if missing_content(&snapshot, page_roles).is_some() {
        record_pid(log, pid, wait.ttl);
    }
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::{
        MissingContent, PAGE_ABSENT_TTL, PageWait, PidLog, await_page_content, missing_content,
        page_note, pid_logged, record_pid,
    };
    use crate::backend::CancelToken;
    use crate::elements::Snapshot;
    use crate::protocol::actions::{ElementBounds, ElementInfo};
    use std::sync::OnceLock;
    use std::thread;
    use std::time::Duration;

    const DOCUMENT: &str = "document";

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
    fn treats_a_lone_tree_as_missing_content() {
        assert_eq!(
            missing_content(&snapshot(&[("window", 0)], false), &[DOCUMENT]),
            Some(MissingContent::WholeTree)
        );
    }

    /// A window always describes its own chrome, so an empty page shows up as
    /// a childless page container rather than an empty tree. Missing that is
    /// what left an agent with no element to act on.
    #[test]
    fn treats_a_childless_page_container_as_missing_content() {
        assert_eq!(
            missing_content(
                &snapshot(&[("window", 0), ("toolbar", 1), (DOCUMENT, 1)], false),
                &[DOCUMENT],
            ),
            Some(MissingContent::Page(2))
        );
        assert_eq!(
            missing_content(
                &snapshot(&[("window", 0), (DOCUMENT, 1), ("button", 2)], false),
                &[DOCUMENT],
            ),
            None
        );
    }

    /// Two containers, the first populated: the index in the answer must name
    /// the empty one.
    #[test]
    fn finds_an_empty_page_container_behind_a_populated_one() {
        assert_eq!(
            missing_content(
                &snapshot(
                    &[("window", 0), (DOCUMENT, 1), ("button", 2), (DOCUMENT, 1)],
                    false,
                ),
                &[DOCUMENT],
            ),
            Some(MissingContent::Page(3))
        );
    }

    /// Truncation proves nothing about any container, so a truncated walk is
    /// neither retried nor noted.
    #[test]
    fn never_retries_a_truncated_walk() {
        assert_eq!(
            missing_content(
                &snapshot(
                    &[
                        ("window", 0),
                        (DOCUMENT, 1),
                        ("button", 2),
                        (DOCUMENT, 1),
                        ("toolbar", 1),
                    ],
                    true,
                ),
                &[DOCUMENT],
            ),
            None,
        );
        assert!(
            !page_note(
                &snapshot(&[("window", 0), (DOCUMENT, 1)], true),
                &[DOCUMENT],
            )
            .is_some()
        );
    }

    #[test]
    fn keeps_an_ordinary_tree_alone() {
        assert_eq!(
            missing_content(
                &snapshot(&[("window", 0), ("button", 1)], false),
                &[DOCUMENT]
            ),
            None
        );
        assert!(
            page_note(
                &snapshot(&[("window", 0), ("button", 1)], false),
                &[DOCUMENT]
            )
            .is_none()
        );
    }

    fn reads_and_arrives() -> impl FnMut() -> crate::protocol::Result<Snapshot<()>> {
        let mut reads = 0usize;
        move || {
            reads += 1;
            Ok(if reads == 1 {
                snapshot(&[("window", 0), (DOCUMENT, 1)], false)
            } else {
                snapshot(&[("window", 0), (DOCUMENT, 1), ("button", 2)], false)
            })
        }
    }

    #[test]
    fn waits_for_page_content_and_stops_when_it_arrives() {
        let mut read = reads_and_arrives();
        let waited = await_page_content(
            snapshot(&[("window", 0), (DOCUMENT, 1)], false),
            Some(4321),
            &[DOCUMENT],
            &PidLog::new(),
            PageWait {
                budget: Duration::from_secs(1),
                ttl: PAGE_ABSENT_TTL,
            },
            &CancelToken::default(),
            &mut read,
        )
        .unwrap();
        assert_eq!(
            missing_content(&waited, &[DOCUMENT]),
            None,
            "the second walk found the page"
        );
    }

    #[test]
    fn does_not_rewalk_a_populated_truncated_or_pidless_snapshot() {
        for initial in [
            snapshot(&[("window", 0), (DOCUMENT, 1), ("button", 2)], false),
            snapshot(&[("window", 0), (DOCUMENT, 1)], true),
        ] {
            await_page_content(
                initial,
                Some(4321),
                &[DOCUMENT],
                &PidLog::new(),
                PageWait {
                    budget: Duration::from_secs(1),
                    ttl: PAGE_ABSENT_TTL,
                },
                &CancelToken::default(),
                || panic!("this snapshot must not trigger another walk"),
            )
            .unwrap();
        }
        await_page_content(
            snapshot(&[("window", 0), (DOCUMENT, 1)], false),
            None,
            &[DOCUMENT],
            &PidLog::new(),
            PageWait {
                budget: Duration::from_secs(1),
                ttl: PAGE_ABSENT_TTL,
            },
            &CancelToken::default(),
            || panic!("a snapshot without a process must not trigger another walk"),
        )
        .unwrap();
    }

    /// A process whose page did not arrive within the budget is recorded and
    /// trusted for the TTL, so a permanently absent page does not pay the
    /// budget on every call.
    #[test]
    fn records_absence_when_the_budget_expires_and_trusts_it_afterwards() {
        static LOG: PidLog = OnceLock::new();
        let mut reads = 0;
        let waited = await_page_content(
            snapshot(&[("window", 0), (DOCUMENT, 1)], false),
            Some(4321),
            &[DOCUMENT],
            &LOG,
            PageWait {
                budget: Duration::ZERO,
                ttl: PAGE_ABSENT_TTL,
            },
            &CancelToken::default(),
            || {
                reads += 1;
                Ok(snapshot(&[("window", 0), (DOCUMENT, 1)], false))
            },
        )
        .unwrap();
        assert_eq!(reads, 0, "a zero budget must not buy a single walk");
        assert_eq!(
            missing_content(&waited, &[DOCUMENT]),
            Some(MissingContent::Page(1))
        );
        assert!(
            pid_logged(&LOG, 4321, PAGE_ABSENT_TTL),
            "the absent page was recorded"
        );

        await_page_content(
            snapshot(&[("window", 0), (DOCUMENT, 1)], false),
            Some(4321),
            &[DOCUMENT],
            &LOG,
            PageWait {
                budget: Duration::from_secs(1),
                ttl: PAGE_ABSENT_TTL,
            },
            &CancelToken::default(),
            || panic!("a recorded absent page must not trigger another walk"),
        )
        .unwrap();
    }

    #[test]
    fn notes_a_tree_that_still_has_no_page_content() {
        assert_eq!(
            page_note(&snapshot(&[("window", 0)], false), &[DOCUMENT]),
            Some(super::PAGE_NOT_EXPOSED.to_string())
        );
        assert_eq!(
            page_note(
                &snapshot(&[("window", 0), (DOCUMENT, 1)], false),
                &[DOCUMENT],
            ),
            Some(super::PAGE_NOT_EXPOSED.to_string())
        );
    }

    /// A pid log expires instead of pinning a decision forever, and reading it
    /// never pushes the expiry out — a window being polled would otherwise
    /// keep its record alive for the life of the session, which is the case
    /// the expiry exists for.
    #[test]
    fn pid_records_expire_and_reads_do_not_renew_them() {
        static LOG: PidLog = OnceLock::new();
        // Margins sized for a loaded CI scheduler: the fresh check sits at a
        // fifth of the TTL, and the expiry check runs long past it (overshooting
        // only makes the answer more certain).
        let ttl = Duration::from_millis(200);

        assert!(!pid_logged(&LOG, 4321, ttl));
        record_pid(&LOG, 4321, ttl);
        assert!(pid_logged(&LOG, 4321, ttl));

        thread::sleep(Duration::from_millis(40));
        assert!(pid_logged(&LOG, 4321, ttl), "still inside the window");
        thread::sleep(Duration::from_millis(240));
        assert!(
            !pid_logged(&LOG, 4321, ttl),
            "the reads above must not have renewed it"
        );
    }
}
