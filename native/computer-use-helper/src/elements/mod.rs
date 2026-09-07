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

/// Explains the `actions=` convention once instead of on every line: ambient
/// actions (see `tree_action_is_ambient`) are omitted from the text, and the
/// ids remain valid targets for them. Counted against `max_bytes`.
const TREE_HEADER: &str =
    "# actions omit scroll,context_menu (available on most nodes); ids stay actionable\n";

/// Render the tree text agents read. Truncated at `max_bytes`.
///
/// The format is one line per element, indented by tree depth:
/// `[<id>] <role> "<name>" (x,y WxH) value="…" id=… actions=…`. It is consumed
/// by the agent only — nothing parses it programmatically — so it is optimized
/// for information per character.
pub fn render_tree(elements: &[ElementInfo], max_bytes: usize) -> (String, bool) {
    if elements.is_empty() {
        return (String::new(), false);
    }
    let (children, roots) = tree_links(elements);
    let mut out = String::new();
    if TREE_HEADER.len() > max_bytes {
        return (out, true);
    }
    out.push_str(TREE_HEADER);
    // Depth-first over the roots reproduces the incoming pre-order, while
    // `depth` is the *rendered* depth so collapsed containers do not indent.
    let mut stack: Vec<(usize, usize)> = roots.iter().rev().map(|index| (*index, 0)).collect();
    while let Some((index, depth)) = stack.pop() {
        let element = &elements[index];
        let kids = &children[index];
        if kids.len() == 1 && is_collapsible_container(element) {
            stack.push((kids[0], depth));
            continue;
        }
        let line = render_element(element, depth);
        if out.len() + line.len() > max_bytes {
            return (out, true);
        }
        out.push_str(&line);
        for kid in kids.iter().rev() {
            stack.push((*kid, depth + 1));
        }
    }
    (out, false)
}

fn render_element(element: &ElementInfo, depth: usize) -> String {
    let mut line = " ".repeat(depth);
    let _ = write!(line, "[{}] {}", element.id, element.role);
    if let Some(name) = display_text(element.name.as_deref(), 120) {
        let _ = write!(line, " {}", quoted(&name));
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
    if let Some(value) = display_text(element.value.as_deref(), 200) {
        let _ = write!(line, " value={}", quoted(&value));
    }
    if let Some(automation_id) = informative_automation_id(element) {
        let _ = write!(line, " id={automation_id}");
    }
    let actions = element
        .actions
        .iter()
        .filter(|action| {
            !tree_action_is_ambient(action) && !tree_action_is_implicit(&element.role, action)
        })
        .map(action_name)
        .collect::<Vec<_>>();
    if !actions.is_empty() {
        line.push_str(" actions=");
        line.push_str(&actions.join(","));
    }
    line.push('\n');
    line
}

/// Direct children per element plus the root indexes, recovered from the flat
/// pre-order list and its `depth` column.
fn tree_links(elements: &[ElementInfo]) -> (Vec<Vec<usize>>, Vec<usize>) {
    let mut children = vec![Vec::new(); elements.len()];
    let mut roots = Vec::new();
    let mut open: Vec<usize> = Vec::new();
    for (index, element) in elements.iter().enumerate() {
        while open
            .last()
            .is_some_and(|parent| elements[*parent].depth >= element.depth)
        {
            open.pop();
        }
        match open.last() {
            Some(parent) => children[*parent].push(index),
            None => roots.push(index),
        }
        open.push(index);
    }
    (children, roots)
}

/// An anonymous structural container with a single child only adds a line and a
/// level of indentation. It is skipped in the text tree; it stays in the
/// snapshot, so its id still resolves in `find_elements` and `invoke_element`.
/// Anything an agent could act on or report (a name, a value, a non-ambient
/// action, a state flag, a meaningful automation id) disqualifies the collapse.
/// Ambient actions do not: Chromium/WebKit hang `scroll`/`context_menu` off
/// nearly every node, so requiring an empty action list would keep every
/// wrapper in a web view.
fn is_collapsible_container(element: &ElementInfo) -> bool {
    matches!(
        canonical_role(&element.role).as_str(),
        "group" | "pane" | "splitgroup"
    ) && display_text(element.name.as_deref(), 120).is_none()
        && display_text(element.value.as_deref(), 200).is_none()
        && element.actions.iter().all(tree_action_is_ambient)
        && element.enabled
        && !element.focused
        && !element.offscreen
        && informative_automation_id(element).is_none()
}

/// The automation id is dropped when it repeats the name or is an AppKit
/// internal auto id (`_NS:123`), which is unstable across launches and useless
/// as a selector.
fn informative_automation_id(element: &ElementInfo) -> Option<&str> {
    let automation_id = element.automation_id.as_deref()?.trim();
    if automation_id.is_empty() || is_internal_automation_id(automation_id) {
        return None;
    }
    if element
        .name
        .as_deref()
        .is_some_and(|name| name.trim().eq_ignore_ascii_case(automation_id))
    {
        return None;
    }
    Some(automation_id)
}

fn is_internal_automation_id(automation_id: &str) -> bool {
    automation_id
        .strip_prefix("_NS:")
        .is_some_and(|rest| !rest.is_empty() && rest.chars().all(|ch| ch.is_ascii_digit()))
}

/// Bidi controls and zero-width characters are invisible to a reader but reach
/// the tree as escapes and waste tokens.
fn is_invisible_format(ch: char) -> bool {
    matches!(
        ch,
        '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}' | '\u{feff}'
    )
}

fn display_text(text: Option<&str>, max: usize) -> Option<String> {
    let text: String = text?
        .chars()
        .filter(|ch| !is_invisible_format(*ch))
        .collect();
    (!text.is_empty()).then(|| truncate(&text, max))
}

/// Plain quoting instead of Rust `Debug`: only the quote, the backslash, and
/// line breaks can break the one-element-per-line format.
fn quoted(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for ch in text.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            _ => out.push(ch),
        }
    }
    out.push('"');
    out
}

/// `scroll` and `context_menu` are advertised by nearly every node in a
/// Chromium/Electron/WebKit tree, so spelling them out costs a large share of
/// the byte budget while telling the agent nothing about a specific element.
/// `TREE_HEADER` states the convention once; `find_elements` JSON and
/// `invoke_element` still expose and accept them per element.
fn tree_action_is_ambient(action: &ElementAction) -> bool {
    matches!(action, ElementAction::Scroll | ElementAction::ContextMenu)
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
        assert!(text.starts_with(TREE_HEADER), "{text}");
        assert!(text[TREE_HEADER.len()..].starts_with(&format!(
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

    #[test]
    fn tree_strips_invisible_formatting_and_quotes_plainly() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        let mut node = element("text", "\u{200e}Inbox\u{202c} \u{feff}(3)", 0);
        node.actions.clear();
        node.value = Some("say \"hi\"\\n\u{200b}now".into());
        snapshot.push(node, ());
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert!(text.contains("text \"Inbox (3)\""), "{text}");
        assert!(text.contains(r#"value="say \"hi\"\\nnow""#), "{text}");
        assert!(!text.contains("\\u{"), "no Debug escapes: {text}");
    }

    #[test]
    fn tree_omits_redundant_and_internal_automation_ids() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        let mut same = element("button", "Save", 0);
        same.automation_id = Some("save".into());
        snapshot.push(same, ());
        let mut internal = element("button", "Send", 0);
        internal.automation_id = Some("_NS:412".into());
        snapshot.push(internal, ());
        let mut useful = element("button", "Send", 0);
        useful.automation_id = Some("composeSend".into());
        snapshot.push(useful, ());
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert!(!text.contains("id=save"), "{text}");
        assert!(!text.contains("_NS:"), "{text}");
        assert!(text.contains("id=composeSend"), "{text}");
    }

    #[test]
    fn tree_collapses_anonymous_single_child_containers() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(element("window", "Mail", 0), ());
        for depth in 1..=3 {
            let mut wrapper = element("group", "", depth);
            wrapper.name = None;
            wrapper.actions.clear();
            snapshot.push(wrapper, ());
        }
        snapshot.push(element("button", "Send", 4), ());
        let collapsed_ids: Vec<String> = snapshot.elements[1..4]
            .iter()
            .map(|element| element.id.clone())
            .collect();
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert_eq!(text.lines().count(), 3, "header + window + button: {text}");
        assert!(
            text.ends_with(&format!(" [{}] button \"Send\"\n", snapshot.elements[4].id)),
            "child keeps one indent level: {text}"
        );
        for id in &collapsed_ids {
            assert!(!text.contains(id.as_str()), "{id} collapsed away from text");
            assert!(
                ElementId::parse(id).is_some(),
                "collapsed ids stay parseable"
            );
        }
        let cache: SnapshotCache<()> = SnapshotCache::default();
        cache.insert(snapshot);
        for id in &collapsed_ids {
            assert!(
                cache.with_element(id, |_, index| index).is_some(),
                "{id} still resolves"
            );
        }
    }

    #[test]
    fn tree_keeps_containers_that_carry_information() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(element("window", "Mail", 0), ());
        let mut named = element("group", "Toolbar", 1);
        named.actions.clear();
        snapshot.push(named, ());
        let mut anonymous_two_children = element("group", "", 1);
        anonymous_two_children.name = None;
        anonymous_two_children.actions.clear();
        snapshot.push(anonymous_two_children, ());
        snapshot.push(element("button", "One", 2), ());
        snapshot.push(element("button", "Two", 2), ());
        let mut anonymous_focused = element("pane", "", 1);
        anonymous_focused.name = None;
        anonymous_focused.actions.clear();
        anonymous_focused.focused = true;
        snapshot.push(anonymous_focused, ());
        snapshot.push(element("button", "Three", 2), ());
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert_eq!(text.lines().count(), 8, "{text}");
        assert!(text.contains("group \"Toolbar\""), "{text}");
        assert!(text.contains("pane (1,2 3x4) focused"), "{text}");
    }

    #[test]
    fn tree_header_is_budgeted_and_states_the_action_convention() {
        assert!(
            TREE_HEADER.trim_end().len() < 90,
            "header stays short: {}",
            TREE_HEADER.trim_end().len()
        );
        assert!(TREE_HEADER.ends_with('\n'));
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(element("window", "Mail", 0), ());
        // The budget covers the header, so a limit that only fits the header
        // still truncates rather than emitting a header with no tree.
        let (text, truncated) = render_tree(&snapshot.elements, TREE_HEADER.len());
        assert!(truncated);
        assert_eq!(text, TREE_HEADER, "header is charged to the budget");
        let (none, truncated) = render_tree(&snapshot.elements, TREE_HEADER.len() - 1);
        assert!(truncated);
        assert!(none.is_empty(), "header alone must fit to be emitted");
        let (empty, truncated) = render_tree(&[], MAX_TREE_BYTES);
        assert!(!truncated);
        assert!(empty.is_empty(), "no header without a tree");
    }

    #[test]
    fn tree_omits_ambient_actions_but_keeps_the_rest() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        let mut ambient_only = element("text", "Ambient", 0);
        ambient_only.actions = vec![ElementAction::Scroll, ElementAction::ContextMenu];
        snapshot.push(ambient_only, ());
        let mut mixed = element("checkbox", "Mixed", 0);
        mixed.actions = vec![
            ElementAction::Scroll,
            ElementAction::Toggle,
            ElementAction::ContextMenu,
        ];
        snapshot.push(mixed, ());
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        let body = &text[TREE_HEADER.len()..];
        assert!(!body.contains("scroll"), "ambient scroll hidden: {body}");
        assert!(
            !body.contains("context_menu"),
            "ambient context_menu hidden: {body}"
        );
        assert!(
            text.contains("text \"Ambient\"\n"),
            "no empty actions= list: {text}"
        );
        assert!(text.contains("checkbox \"Mixed\" actions=toggle"), "{text}");
        // The JSON path keeps the full list.
        let input: FindElementsInput =
            serde_json::from_str(r#"{"window":{"app":"a","id":1},"role":"checkbox"}"#).unwrap();
        let (found, _) = snapshot.find(&input);
        assert_eq!(
            found[0].actions,
            vec![
                ElementAction::Scroll,
                ElementAction::Toggle,
                ElementAction::ContextMenu
            ]
        );
    }

    #[test]
    fn tree_collapses_containers_whose_only_actions_are_ambient() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(element("window", "Mail", 0), ());
        let mut wrapper = element("group", "", 1);
        wrapper.name = None;
        wrapper.actions = vec![ElementAction::Scroll, ElementAction::ContextMenu];
        snapshot.push(wrapper, ());
        let mut kept = element("group", "", 2);
        kept.name = None;
        kept.actions = vec![ElementAction::Scroll, ElementAction::Invoke];
        snapshot.push(kept, ());
        snapshot.push(element("button", "Send", 3), ());
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert!(
            !text.contains(snapshot.elements[1].id.as_str()),
            "ambient-only wrapper collapses: {text}"
        );
        assert!(
            text.contains(&format!(
                " [{}] group actions=invoke\n",
                snapshot.elements[2].id
            )),
            "a real action keeps the container: {text}"
        );
        assert_eq!(text.lines().count(), 4, "{text}");
    }
}
