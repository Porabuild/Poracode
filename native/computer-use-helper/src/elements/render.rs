//! Rendering a snapshot into the tree text agents read: the `actions=`
//! convention, depth-first text, browser-chrome elision, clipped-run
//! collapsing, and the byte budget that bounds it all.

use std::fmt::Write as _;

use super::canonical_role;
use crate::protocol::actions::{ElementAction, ElementInfo};

/// Explains the `actions=` convention once instead of on every line: ambient
/// actions (see `tree_action_is_ambient`) are omitted from the text, and the
/// ids remain valid targets for them. Counted against `max_bytes`.
// The header has to name every omission. A `button "Send"` line that shows no
// actions and no bounds reads as an inert element, and an agent that believes
// it goes looking for a coordinate route — or for a takeover — instead of
// simply invoking the button.
const TREE_HEADER: &str = "# actions= omits set_value,scroll,context_menu and click on every node, invoke on button/link/menuitem/splitbutton. find_elements lists advertised actions (macOS adds scroll). ids stay actionable\n";
/// Consecutive clipped leaves below this count stay visible so an agent can
/// still see the one or two rows sitting on a clip edge.
const CLIPPED_RUN_MIN: usize = 3;

enum Visit {
    Node {
        index: usize,
        depth: usize,
    },
    ClippedRun {
        count: usize,
        role: Option<String>,
        depth: usize,
    },
}

enum ChildGroup {
    Node(usize),
    Clipped(Vec<usize>),
}

/// Render the tree text agents read. Truncated at `max_bytes`.
///
/// The format is one line per element, indented by tree depth:
/// `[<id>] <role> "<name>" (x,y WxH) value="…" id=… actions=…`. It is consumed
/// by the agent only — nothing parses it programmatically — so it is optimized
/// for information per character.
pub fn render_tree(elements: &[ElementInfo], max_bytes: usize) -> (String, bool) {
    render_tree_inner(elements, max_bytes, false)
}

/// Same as [`render_tree`], but a Chromium/Electron window starts at the page
/// even when its chrome is wrapped in anonymous groups that the toolbar
/// heuristic would miss.
pub fn render_tree_preferring_page(elements: &[ElementInfo], max_bytes: usize) -> (String, bool) {
    render_tree_inner(elements, max_bytes, true)
}

fn render_tree_inner(
    elements: &[ElementInfo],
    max_bytes: usize,
    prefer_page: bool,
) -> (String, bool) {
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
    // A browser-shaped tree starts at the page: chrome siblings of the path
    // to the first webarea stay in the snapshot and out of the text.
    let mut stack = match initial_visits(
        elements,
        &children,
        &roots,
        &mut out,
        max_bytes,
        prefer_page,
    ) {
        Ok(stack) => stack,
        Err(()) => return (out, true),
    };
    while let Some(visit) = stack.pop() {
        match visit {
            Visit::ClippedRun { count, role, depth } => {
                let line = render_clipped_run(count, role.as_deref(), depth);
                if out.len() + line.len() > max_bytes {
                    return (out, true);
                }
                out.push_str(&line);
            }
            Visit::Node { index, depth } => {
                let element = &elements[index];
                let kids = &children[index];
                if kids.len() == 1 && is_collapsible_container(element) {
                    stack.push(Visit::Node {
                        index: kids[0],
                        depth,
                    });
                    continue;
                }
                let line = render_element(element, depth);
                if out.len() + line.len() > max_bytes {
                    return (out, true);
                }
                out.push_str(&line);
                push_children(&mut stack, elements, &children, kids, depth + 1);
            }
        }
    }
    (out, false)
}

fn render_element(element: &ElementInfo, depth: usize) -> String {
    let rendered_actions = element
        .actions
        .iter()
        .filter(|action| {
            !tree_action_is_ambient(action) && !tree_action_is_implicit(&element.role, action)
        })
        .map(action_name)
        .collect::<Vec<_>>();
    let mut line = " ".repeat(depth);
    let _ = write!(line, "[{}] {}", element.id, element.role);
    if let Some(name) = display_text(element.name.as_deref(), 120) {
        let _ = write!(line, " {}", quoted(&name));
    }
    // Bounds are for nodes with no semantic action at all, where a coordinate
    // is the only way in. A button prints none: its `invoke` is omitted as
    // implicit, not missing, and spending bytes on coordinates for the nodes an
    // agent should be invoking by id both grows the tree against its byte
    // budget and points the agent at the weaker route.
    // A node with no area is clipped out of a scroller, not a 1×1 control;
    // printing its clip-edge bounds invites a click that cannot land.
    if element.bounds.width <= 1 || element.bounds.height <= 1 {
        line.push_str(" clipped");
    } else if element.actions.is_empty() {
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
    if !rendered_actions.is_empty() {
        line.push_str(" actions=");
        line.push_str(&rendered_actions.join(","));
    }
    line.push('\n');
    line
}

fn initial_visits(
    elements: &[ElementInfo],
    children: &[Vec<usize>],
    roots: &[usize],
    out: &mut String,
    max_bytes: usize,
    prefer_page: bool,
) -> std::result::Result<Vec<Visit>, ()> {
    let mut stack = Vec::new();
    if let Some(content) = prefer_web_content(elements, children, prefer_page) {
        let parents = parents_of(children);
        let path = ancestor_path(&parents, content);
        let mut depth = 0;
        for (step, &index) in path.iter().enumerate() {
            let last = step + 1 == path.len();
            if !last && is_collapsible_container(&elements[index]) {
                continue;
            }
            let line = render_element(&elements[index], depth);
            if out.len() + line.len() > max_bytes {
                return Err(());
            }
            out.push_str(&line);
            if last {
                push_children(&mut stack, elements, children, &children[index], depth + 1);
            } else {
                depth += 1;
            }
        }
        return Ok(stack);
    }
    for &index in roots.iter().rev() {
        stack.push(Visit::Node { index, depth: 0 });
    }
    Ok(stack)
}

fn prefer_web_content(
    elements: &[ElementInfo],
    children: &[Vec<usize>],
    prefer_page: bool,
) -> Option<usize> {
    let content = first_content_root(elements)?;
    if prefer_page || has_browser_chrome_beside_path(elements, children, content) {
        Some(content)
    } else {
        None
    }
}

fn first_content_root(elements: &[ElementInfo]) -> Option<usize> {
    elements.iter().position(|element| {
        matches!(
            canonical_role(&element.role).as_str(),
            "webarea" | "document"
        )
    })
}

fn has_browser_chrome_beside_path(
    elements: &[ElementInfo],
    children: &[Vec<usize>],
    content: usize,
) -> bool {
    let parents = parents_of(children);
    let path = ancestor_path(&parents, content);
    for &index in &path {
        if children[index]
            .iter()
            .any(|&kid| !path.contains(&kid) && subtree_has_browser_chrome(elements, children, kid))
        {
            return true;
        }
    }
    false
}

fn subtree_has_browser_chrome(
    elements: &[ElementInfo],
    children: &[Vec<usize>],
    index: usize,
) -> bool {
    is_browser_chrome(&elements[index])
        || children[index]
            .iter()
            .any(|&kid| subtree_has_browser_chrome(elements, children, kid))
}

fn is_browser_chrome(element: &ElementInfo) -> bool {
    matches!(
        canonical_role(&element.role).as_str(),
        "toolbar" | "tablist" | "menubar"
    )
}

fn parents_of(children: &[Vec<usize>]) -> Vec<Option<usize>> {
    let mut parents = vec![None; children.len()];
    for (parent, kids) in children.iter().enumerate() {
        for &kid in kids {
            parents[kid] = Some(parent);
        }
    }
    parents
}

fn ancestor_path(parents: &[Option<usize>], index: usize) -> Vec<usize> {
    let mut path = Vec::new();
    let mut current = Some(index);
    while let Some(index) = current {
        path.push(index);
        current = parents[index];
    }
    path.reverse();
    path
}

fn is_clipped_leaf(element: &ElementInfo, kids: &[usize]) -> bool {
    kids.is_empty() && (element.bounds.width <= 1 || element.bounds.height <= 1)
}

fn clipped_run_role(elements: &[ElementInfo], indexes: &[usize]) -> Option<String> {
    let mut roles = indexes
        .iter()
        .map(|&index| canonical_role(&elements[index].role));
    let first = roles.next()?;
    roles.all(|role| role == first).then_some(first)
}

fn render_clipped_run(count: usize, role: Option<&str>, depth: usize) -> String {
    let mut line = " ".repeat(depth);
    match role {
        Some(role) => {
            let _ = writeln!(line, "... {count} clipped {role} siblings");
        }
        None => {
            let _ = writeln!(line, "... {count} clipped siblings");
        }
    }
    line
}

fn push_children(
    stack: &mut Vec<Visit>,
    elements: &[ElementInfo],
    children: &[Vec<usize>],
    kids: &[usize],
    depth: usize,
) {
    let mut groups: Vec<ChildGroup> = Vec::new();
    for &kid in kids {
        let clipped = is_clipped_leaf(&elements[kid], &children[kid]);
        match groups.last_mut() {
            Some(ChildGroup::Clipped(run)) if clipped => run.push(kid),
            _ if clipped => groups.push(ChildGroup::Clipped(vec![kid])),
            _ => groups.push(ChildGroup::Node(kid)),
        }
    }
    for group in groups.into_iter().rev() {
        match group {
            ChildGroup::Clipped(run) if run.len() >= CLIPPED_RUN_MIN => {
                stack.push(Visit::ClippedRun {
                    count: run.len(),
                    role: clipped_run_role(elements, &run),
                    depth,
                });
            }
            ChildGroup::Clipped(run) => {
                for kid in run.into_iter().rev() {
                    stack.push(Visit::Node { index: kid, depth });
                }
            }
            ChildGroup::Node(kid) => stack.push(Visit::Node { index: kid, depth }),
        }
    }
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

/// `scroll`, `context_menu`, and `set_value` are advertised by nearly every
/// node in a Chromium/Electron/WebKit tree — including toolbars, groups, and
/// buttons that cannot take a value — so spelling them out costs a large share
/// of the byte budget, blocks wrapper collapse, and points agents at
/// `set_element_value` on chrome. `TREE_HEADER` states the convention once;
/// `find_elements` JSON still lists each node's advertised actions.
fn tree_action_is_ambient(action: &ElementAction) -> bool {
    matches!(
        action,
        ElementAction::Scroll | ElementAction::ContextMenu | ElementAction::SetValue
    )
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::elements::MAX_TREE_BYTES;
    use crate::elements::{ElementId, Snapshot, SnapshotCache};
    use crate::protocol::actions::{ElementBounds, FindElementsInput};

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
        // `invoke` is implicit for a menu item: the line shows no action, and
        // no bounds either, because the id is the route.
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

    /// Chromium hangs `set_value` on groups, toolbars, and buttons. Treating
    /// that as a real action kept every wrapper in the tree and printed
    /// `actions=set_value` on chrome an agent cannot write to.
    #[test]
    fn tree_collapses_groups_that_only_advertise_set_value() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(element("window", "CU Lab", 0), ());
        let mut wrapper = element("group", "", 1);
        wrapper.name = None;
        wrapper.actions = vec![ElementAction::SetValue, ElementAction::Scroll];
        snapshot.push(wrapper, ());
        snapshot.push(element("button", "Alpha", 2), ());
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert_eq!(text.lines().count(), 3, "header + window + button: {text}");
        let body = &text[TREE_HEADER.len()..];
        assert!(!body.contains("set_value"), "{body}");
        assert!(body.contains("button \"Alpha\""), "{body}");
    }

    /// A scroller reports clipped rows at the clip edge with no area. Bounds
    /// there are not a click target; the marker is.
    #[test]
    fn tree_marks_zero_area_nodes_clipped() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        let mut clipped = element("text", "Row 1", 0);
        clipped.actions.clear();
        clipped.bounds.height = 1;
        snapshot.push(clipped, ());
        let mut visible = element("text", "Row 26", 0);
        visible.actions.clear();
        visible.bounds = ElementBounds {
            x: 39,
            y: 150,
            width: 55,
            height: 19,
        };
        snapshot.push(visible, ());
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert!(text.contains("text \"Row 1\" clipped"), "{text}");
        assert!(!text.contains("43x1"), "{text}");
        assert!(text.contains("text \"Row 26\" (39,150 55x19)"), "{text}");
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
            TREE_HEADER.trim_end().len() < 200,
            "header stays short: {}",
            TREE_HEADER.trim_end().len()
        );
        assert!(TREE_HEADER.ends_with('\n'));
        assert!(
            !TREE_HEADER.contains("still work"),
            "the header must not claim omitted actions work on every platform: {TREE_HEADER}"
        );
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
        ambient_only.actions = vec![
            ElementAction::Scroll,
            ElementAction::ContextMenu,
            ElementAction::SetValue,
        ];
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
        // Scroll and context_menu are omitted as ambient, so the line carries
        // no actions= list — and no bounds, because the id is still the route.
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

    fn clipped_text(name: &str, depth: u32) -> ElementInfo {
        let mut node = element("text", name, depth);
        node.actions.clear();
        node.bounds.height = 1;
        node
    }

    #[test]
    fn tree_omits_browser_chrome_beside_a_webarea() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(element("window", "CU Lab", 0), ());
        let mut chrome_wrap = element("group", "", 1);
        chrome_wrap.name = None;
        chrome_wrap.actions.clear();
        snapshot.push(chrome_wrap, ());
        snapshot.push(element("toolbar", "Toolbar", 2), ());
        snapshot.push(element("button", "Back", 3), ());
        snapshot.push(element("webarea", "CU Lab", 1), ());
        snapshot.push(element("button", "Alpha", 2), ());
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        let body = &text[TREE_HEADER.len()..];
        assert!(body.contains("window \"CU Lab\""), "{body}");
        assert!(body.contains("webarea \"CU Lab\""), "{body}");
        assert!(body.contains("button \"Alpha\""), "{body}");
        assert!(!body.contains("toolbar"), "{body}");
        assert!(!body.contains("Back"), "{body}");
        let chrome_id = &snapshot.elements[3].id;
        assert!(
            ElementId::parse(chrome_id).is_some(),
            "omitted chrome ids stay in the snapshot"
        );
    }

    #[test]
    fn tree_keeps_native_siblings_of_a_webarea() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(element("window", "Mail", 0), ());
        let mut outline = element("outline", "Mailboxes", 1);
        outline.actions.clear();
        snapshot.push(outline, ());
        snapshot.push(element("webarea", "Message", 1), ());
        snapshot.push(element("text", "Hello", 2), ());
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert!(text.contains("outline \"Mailboxes\""), "{text}");
        assert!(text.contains("webarea \"Message\""), "{text}");
    }

    #[test]
    fn tree_preferring_page_starts_at_the_webarea_without_chrome() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(element("window", "App", 0), ());
        let mut wrap = element("group", "", 1);
        wrap.name = None;
        wrap.actions.clear();
        snapshot.push(wrap, ());
        snapshot.push(element("button", "Sidebar", 2), ());
        snapshot.push(element("webarea", "Page", 1), ());
        snapshot.push(element("button", "Alpha", 2), ());
        let (auto, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert!(
            auto.contains("Sidebar"),
            "heuristic keeps a chrome-less sibling: {auto}"
        );
        let (page, _) = render_tree_preferring_page(&snapshot.elements, MAX_TREE_BYTES);
        let body = &page[TREE_HEADER.len()..];
        assert!(body.contains("window \"App\""), "{body}");
        assert!(body.contains("button \"Alpha\""), "{body}");
        assert!(!body.contains("Sidebar"), "{body}");
    }

    #[test]
    fn tree_collapses_consecutive_clipped_siblings() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(element("window", "CU Lab", 0), ());
        snapshot.push(clipped_text("Row 1", 1), ());
        snapshot.push(clipped_text("Row 2", 1), ());
        snapshot.push(clipped_text("Row 3", 1), ());
        snapshot.push(clipped_text("Row 4", 1), ());
        let mut visible = element("text", "Row 5", 1);
        visible.actions.clear();
        visible.bounds = ElementBounds {
            x: 39,
            y: 150,
            width: 55,
            height: 19,
        };
        snapshot.push(visible, ());
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert!(text.contains("... 4 clipped text siblings"), "{text}");
        assert!(!text.contains("Row 1"), "{text}");
        assert!(text.contains("text \"Row 5\""), "{text}");
        assert!(
            ElementId::parse(&snapshot.elements[1].id).is_some(),
            "collapsed ids stay in the snapshot"
        );
    }

    #[test]
    fn tree_keeps_short_clipped_runs() {
        let mut snapshot: Snapshot<()> = Snapshot::new(1);
        snapshot.push(clipped_text("Row 1", 0), ());
        snapshot.push(clipped_text("Row 2", 0), ());
        let (text, _) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
        assert!(text.contains("text \"Row 1\" clipped"), "{text}");
        assert!(text.contains("text \"Row 2\" clipped"), "{text}");
        assert!(!text.contains("clipped text siblings"), "{text}");
    }
}
