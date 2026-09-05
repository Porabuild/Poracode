//! Accessibility snapshots: element ids, the per-window LRU of snapshots, and
//! the text rendering agents read.
//!
//! `ElementId = "s{snapshot}:{index}"` — snapshot is a process-wide base-36
//! counter, index is the node's traversal position. Ids are valid only while the
//! snapshot is cached; acting on an evicted snapshot yields `stale_snapshot`.

use std::collections::VecDeque;
use std::fmt::Write as _;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::protocol::actions::{ElementAction, ElementInfo, FindElementsInput};

mod roles;
pub use roles::canonical_role;

static NEXT_SNAPSHOT: AtomicU64 = AtomicU64::new(1);

pub const MAX_TREE_BYTES: usize = 40 * 1024;
pub const SNAPSHOTS_PER_WINDOW: usize = 3;
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

/// Match equivalent platform roles without conflating different control types.
pub fn role_matches(actual: &str, wanted: &str) -> bool {
    canonical_role(actual) == canonical_role(wanted)
}

/// Render the tree text agents read. Truncated at `max_bytes`.
pub fn render_tree(elements: &[ElementInfo], max_bytes: usize) -> (String, bool) {
    let mut out = String::new();
    for element in elements {
        let mut line = String::new();
        for _ in 0..element.depth {
            line.push(' ');
        }
        let _ = write!(line, "[{}] {}", element.id, element.role);
        if let Some(name) = &element.name
            && !name.is_empty()
        {
            let _ = write!(line, " {:?}", truncate(name, 120));
        }
        if element.actions.is_empty() {
            let _ = write!(
                line,
                " ({},{} {}x{})",
                element.bounds.x, element.bounds.y, element.bounds.width, element.bounds.height
            );
        }
        if !element.enabled {
            line.push_str(" disabled");
        }
        if element.focused {
            line.push_str(" focused");
        }
        if element.offscreen {
            line.push_str(" offscreen");
        }
        if let Some(value) = &element.value
            && !value.is_empty()
        {
            let _ = write!(line, " value={:?}", truncate(value, 200));
        }
        if let Some(automation_id) = &element.automation_id
            && !automation_id.is_empty()
        {
            let _ = write!(line, " id={automation_id}");
        }
        if !element.actions.is_empty() {
            let actions = element
                .actions
                .iter()
                .filter(|action| !tree_action_is_implicit(&element.role, action))
                .map(action_name)
                .collect::<Vec<_>>();
            if !actions.is_empty() {
                line.push_str(" actions=");
                line.push_str(&actions.join(","));
            }
        }
        line.push('\n');
        if out.len() + line.len() > max_bytes {
            return (out, true);
        }
        out.push_str(&line);
    }
    (out, false)
}

fn tree_action_is_implicit(role: &str, action: &ElementAction) -> bool {
    if action == &ElementAction::Click {
        return true;
    }
    action == &ElementAction::Invoke
        && matches!(
            canonical_role(role).as_str(),
            "button" | "splitbutton" | "menuitem" | "link"
        )
}

fn action_name(action: &ElementAction) -> &'static str {
    match action {
        ElementAction::Invoke => "invoke",
        ElementAction::Toggle => "toggle",
        ElementAction::Select => "select",
        ElementAction::Expand => "expand",
        ElementAction::Collapse => "collapse",
        ElementAction::SetValue => "set_value",
        ElementAction::Scroll => "scroll",
        ElementAction::ContextMenu => "context_menu",
        ElementAction::Click => "click",
    }
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut out: String = text.chars().take(max).collect();
    out.push('…');
    out
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
        let entry = windows.remove(position).expect("index in range");
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

    #[test]
    fn tree_rendering_truncates() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(element("window", "Untitled - Notepad", 0), ());
        snapshot.push(element("menuitem", "File", 1), ());
        let mut passive = element("text", "Status", 1);
        passive.actions.clear();
        snapshot.push(passive, ());
        let (text, truncated) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert!(!truncated);
        assert!(text.starts_with(&format!(
            "[{}] window \"Untitled - Notepad\" actions=invoke\n",
            snapshot.elements[0].id
        )));
        assert!(text.contains(&format!(
            "\n [{}] menuitem \"File\"\n",
            snapshot.elements[1].id
        )));
        assert!(text.contains("text \"Status\" (1,2 3x4)"));
        let (short, truncated) = render_tree(&snapshot.elements, 10);
        assert!(truncated);
        assert!(short.is_empty());
    }
}
