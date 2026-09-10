//! Accessibility snapshots: element ids, the per-window LRU of snapshots, and
//! the text rendering agents read.
//!
//! `ElementId = "s{snapshot}:{index}"` — snapshot is a process-wide base-36
//! counter, index is the node's traversal position. Ids are valid only while the
//! snapshot is cached; acting on an evicted snapshot yields `stale_snapshot`.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::protocol::actions::{ElementAction, ElementInfo, FindElementsInput};

mod roles;
pub use roles::canonical_role;

mod render;
pub use render::{render_tree, render_tree_preferring_page};

pub mod page;

static NEXT_SNAPSHOT: AtomicU64 = AtomicU64::new(1);

pub const MAX_TREE_BYTES: usize = 40 * 1024;
/// Snapshots kept per window. Generous because a coordinate click can insert
/// one of its own (see the macOS `press_at_position` tree route), and evicting
/// the tree an agent is holding element ids from reads to it as the element
/// route breaking.
pub const SNAPSHOTS_PER_WINDOW: usize = 6;
pub const MAX_WINDOWS: usize = 8;

fn base36(mut value: u64) -> String {
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".into();
    }
    let mut out = Vec::new();
    while value > 0 {
        out.push(DIGITS[(value % 36) as usize]);
        value /= 36;
    }
    out.reverse();
    String::from_utf8(out).expect("ascii")
}

pub fn next_snapshot_id() -> String {
    format!("s{}", base36(NEXT_SNAPSHOT.fetch_add(1, Ordering::Relaxed)))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ElementId {
    pub snapshot: String,
    pub index: usize,
}

impl ElementId {
    pub fn format(snapshot: &str, index: usize) -> String {
        format!("{snapshot}:{index}")
    }

    pub fn parse(text: &str) -> Option<Self> {
        let (snapshot, index) = text.trim().split_once(':')?;
        if !snapshot.starts_with('s') || snapshot.len() < 2 {
            return None;
        }
        let index = index.parse::<usize>().ok()?;
        Some(Self {
            snapshot: snapshot.to_string(),
            index,
        })
    }
}

/// One captured tree. `H` is the backend's live handle for a node (UIA
/// RuntimeId, retained AXUIElementRef, AT-SPI object reference).
pub struct Snapshot<H> {
    pub id: String,
    pub window_id: i64,
    pub elements: Vec<ElementInfo>,
    pub handles: Vec<H>,
    pub truncated: bool,
}

impl<H> Snapshot<H> {
    pub fn new(window_id: i64) -> Self {
        Self {
            id: next_snapshot_id(),
            window_id,
            elements: Vec::new(),
            handles: Vec::new(),
            truncated: false,
        }
    }

    pub fn push(&mut self, mut element: ElementInfo, handle: H) -> usize {
        let index = self.elements.len();
        element.id = ElementId::format(&self.id, index);
        self.elements.push(element);
        self.handles.push(handle);
        index
    }

    pub fn find(&self, input: &FindElementsInput) -> (Vec<ElementInfo>, bool) {
        let role = input
            .role
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_ascii_lowercase);
        let name = input
            .name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_ascii_lowercase);
        let automation_id = input
            .automation_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let text = input
            .text
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_ascii_lowercase);
        let max = input.max_results();
        let mut out = Vec::new();
        let mut truncated = false;
        for element in &self.elements {
            if let Some(role) = &role
                && !role_matches(&element.role, role)
            {
                continue;
            }
            if let Some(name) = &name
                && !element
                    .name
                    .as_deref()
                    .is_some_and(|n| n.to_ascii_lowercase().contains(name.as_str()))
            {
                continue;
            }
            if let Some(automation_id) = automation_id
                && element.automation_id.as_deref() != Some(automation_id)
            {
                continue;
            }
            if let Some(text) = &text {
                let haystack = format!(
                    "{} {}",
                    element.name.as_deref().unwrap_or_default(),
                    element.value.as_deref().unwrap_or_default()
                )
                .to_ascii_lowercase();
                if !haystack.contains(text.as_str()) {
                    continue;
                }
            }
            if out.len() >= max {
                truncated = true;
                break;
            }
            out.push(element.clone());
        }
        (out, truncated)
    }
}

/// macOS `invoke_element` walks ancestors for `scroll`, so a find result that
/// omitted it read as "this node cannot scroll" and sent agents hunting for a
/// container that cannot. The snapshot stays as AX advertised it; only the
/// returned clones gain the action the host will actually honor.
pub fn advertise_ancestor_scroll(elements: &mut [ElementInfo]) {
    for element in elements {
        if !element.actions.contains(&ElementAction::Scroll) {
            element.actions.push(ElementAction::Scroll);
        }
    }
}

/// Match equivalent platform roles without conflating different control types.
pub fn role_matches(actual: &str, wanted: &str) -> bool {
    canonical_role(actual) == canonical_role(wanted)
}

struct WindowSnapshots<H> {
    window_id: i64,
    snapshots: VecDeque<Snapshot<H>>,
}

/// Bounded cache: `SNAPSHOTS_PER_WINDOW` per window, `MAX_WINDOWS` windows,
/// least-recently-used windows evicted first. Dropping a snapshot drops its
/// handles (backends release platform resources in `Drop`).
pub struct SnapshotCache<H> {
    windows: Mutex<VecDeque<WindowSnapshots<H>>>,
}

impl<H> Default for SnapshotCache<H> {
    fn default() -> Self {
        Self {
            windows: Mutex::new(VecDeque::new()),
        }
    }
}

impl<H> SnapshotCache<H> {
    pub fn insert(&self, snapshot: Snapshot<H>) {
        let mut windows = self.windows.lock().unwrap_or_else(|p| p.into_inner());
        let position = windows
            .iter()
            .position(|w| w.window_id == snapshot.window_id);
        let mut entry = match position {
            Some(index) => windows.remove(index).expect("index in range"),
            None => WindowSnapshots {
                window_id: snapshot.window_id,
                snapshots: VecDeque::new(),
            },
        };
        entry.snapshots.push_back(snapshot);
        while entry.snapshots.len() > SNAPSHOTS_PER_WINDOW {
            entry.snapshots.pop_front();
        }
        windows.push_back(entry);
        while windows.len() > MAX_WINDOWS {
            windows.pop_front();
        }
    }

    /// Run `f` against the snapshot owning `element_id`. Returns `None` when
    /// the snapshot is gone or the index is out of range.
    pub fn with_element<R>(
        &self,
        element_id: &str,
        f: impl FnOnce(&Snapshot<H>, usize) -> R,
    ) -> Option<R> {
        let parsed = ElementId::parse(element_id)?;
        let mut windows = self.windows.lock().unwrap_or_else(|p| p.into_inner());
        let position = windows
            .iter()
            .position(|w| w.snapshots.iter().any(|s| s.id == parsed.snapshot))?;
        let mut entry = windows.remove(position).expect("index in range");
        // Using a snapshot makes it the freshest one for its window, so the
        // per-window cap evicts what the caller has stopped touching. Insert
        // order alone would let a few coordinate clicks — each of which inserts
        // the tree it resolved against — push out the inspection tree the
        // caller is still holding element ids from, and the next element action
        // would refuse with `stale_snapshot` for no reason the caller can see.
        let found = entry.snapshots.iter().position(|s| s.id == parsed.snapshot);
        if let Some(index) = found
            && index + 1 < entry.snapshots.len()
            && let Some(snapshot) = entry.snapshots.remove(index)
        {
            entry.snapshots.push_back(snapshot);
        }
        let result = entry
            .snapshots
            .iter()
            .find(|s| s.id == parsed.snapshot)
            .filter(|s| parsed.index < s.elements.len())
            .map(|s| f(s, parsed.index));
        windows.push_back(entry);
        result
    }

    pub fn with_snapshot<R>(
        &self,
        snapshot_id: &str,
        f: impl FnOnce(&Snapshot<H>) -> R,
    ) -> Option<R> {
        let windows = self.windows.lock().unwrap_or_else(|p| p.into_inner());
        windows
            .iter()
            .flat_map(|w| w.snapshots.iter())
            .find(|s| s.id == snapshot_id)
            .map(f)
    }

    pub fn clear(&self) {
        self.windows
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::actions::ElementBounds;

    fn element(role: &str, name: &str, depth: u32) -> ElementInfo {
        ElementInfo {
            id: String::new(),
            role: role.into(),
            name: Some(name.into()),
            value: None,
            automation_id: None,
            bounds: ElementBounds {
                x: 1,
                y: 2,
                width: 3,
                height: 4,
            },
            enabled: true,
            focused: false,
            offscreen: false,
            actions: vec![ElementAction::Invoke],
            depth,
        }
    }

    #[test]
    fn element_id_round_trip() {
        let id = ElementId::format("s3", 17);
        assert_eq!(id, "s3:17");
        assert_eq!(
            ElementId::parse(&id),
            Some(ElementId {
                snapshot: "s3".into(),
                index: 17
            })
        );
        assert_eq!(ElementId::parse("3:17"), None);
        assert_eq!(ElementId::parse("s3"), None);
        assert_eq!(ElementId::parse("s3:x"), None);
    }

    #[test]
    fn snapshot_ids_are_unique_and_prefixed() {
        let a = next_snapshot_id();
        let b = next_snapshot_id();
        assert!(a.starts_with('s') && b.starts_with('s'));
        assert_ne!(a, b);
    }

    #[test]
    fn cache_evicts_per_window_and_across_windows() {
        let cache: SnapshotCache<()> = SnapshotCache::default();
        let mut first_ids = Vec::new();
        for _ in 0..(SNAPSHOTS_PER_WINDOW + 1) {
            let mut snapshot = Snapshot::new(1);
            snapshot.push(element("button", "ok", 0), ());
            first_ids.push(snapshot.id.clone());
            cache.insert(snapshot);
        }
        assert!(
            cache.with_snapshot(&first_ids[0], |_| ()).is_none(),
            "oldest per-window evicted"
        );
        assert!(cache.with_snapshot(&first_ids[1], |_| ()).is_some());
        for window_id in 2..=(MAX_WINDOWS as i64 + 1) {
            cache.insert(Snapshot::new(window_id));
        }
        assert!(
            cache.with_snapshot(&first_ids[1], |_| ()).is_none(),
            "LRU window evicted"
        );
    }

    #[test]
    fn with_element_checks_index_range() {
        let cache: SnapshotCache<u8> = SnapshotCache::default();
        let mut snapshot = Snapshot::new(9);
        snapshot.push(element("edit", "Name", 0), 7);
        let id = snapshot.elements[0].id.clone();
        cache.insert(snapshot);
        assert_eq!(cache.with_element(&id, |s, i| s.handles[i]), Some(7));
        let bad = id.replace(":0", ":5");
        assert_eq!(cache.with_element(&bad, |s, i| s.handles[i]), None);
    }

    #[test]
    fn find_filters_by_role_name_text() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(element("Button", "Save", 0), ());
        snapshot.push(element("Edit", "Name", 1), ());
        let mut input: FindElementsInput =
            serde_json::from_str(r#"{"window":{"app":"a","id":1},"role":"text field"}"#).unwrap();
        let (found, truncated) = snapshot.find(&input);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].role, "Edit");
        assert!(!truncated);
        snapshot.push(element("text", "Name", 1), ());
        snapshot.push(element("document", "Name", 1), ());
        assert_eq!(snapshot.find(&input).0.len(), 1);
        assert!(!role_matches("radio button", "tab"));
        assert!(!role_matches("group", "window"));
        input.role = None;
        input.name = Some("sav".into());
        assert_eq!(snapshot.find(&input).0.len(), 1);
        input.name = None;
        input.max_results = Some(1);
        assert!(snapshot.find(&input).1, "truncated when over max_results");
    }

    /// A snapshot the caller is still using must outlive newer ones it is not.
    /// Coordinate clicks insert a snapshot each, so insert-order eviction alone
    /// would drop the inspection tree an agent is holding ids from.
    #[test]
    fn using_a_snapshot_protects_it_from_eviction() {
        let cache: SnapshotCache<()> = SnapshotCache::default();
        let mut held: Snapshot<()> = Snapshot::new(7);
        held.push(element("button", "Send", 0), ());
        let held_id = held.elements[0].id.clone();
        cache.insert(held);

        for _ in 0..SNAPSHOTS_PER_WINDOW - 1 {
            let mut filler: Snapshot<()> = Snapshot::new(7);
            filler.push(element("button", "Other", 0), ());
            cache.insert(filler);
            // Touching the held snapshot keeps it current.
            assert!(cache.with_element(&held_id, |_, index| index).is_some());
        }
        let mut overflow: Snapshot<()> = Snapshot::new(7);
        overflow.push(element("button", "Overflow", 0), ());
        cache.insert(overflow);

        assert!(
            cache.with_element(&held_id, |_, index| index).is_some(),
            "the snapshot in use survived; an untouched one was evicted instead"
        );
    }

    #[test]
    fn advertise_ancestor_scroll_adds_scroll_to_the_result_only() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        let mut row = element("text", "Row 50", 0);
        row.actions.clear();
        snapshot.push(row, ());
        let input: FindElementsInput =
            serde_json::from_str(r#"{"window":{"app":"a","id":1},"name":"Row"}"#).unwrap();
        let (mut found, _) = snapshot.find(&input);
        assert!(found[0].actions.is_empty());
        advertise_ancestor_scroll(&mut found);
        assert_eq!(found[0].actions, vec![ElementAction::Scroll]);
        assert!(
            snapshot.elements[0].actions.is_empty(),
            "the snapshot keeps the advertised AX set"
        );
    }
}
