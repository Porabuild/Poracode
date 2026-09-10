//! Describing a window as an accessibility tree: one batched attribute read
//! per node, and the bounded walk that turns those nodes into a snapshot.

use std::collections::VecDeque;
use std::ffi::c_void;
use std::ptr::NonNull;

use objc2_core_foundation::{
    CFArray, CFBoolean, CFNumber, CFRetained, CFString, CFType, CGPoint, CGSize,
};

use super::super::session;
use super::chromium;
use super::webcontent::{
    MissingContent, PAGE_ABSENT, PAGE_ABSENT_TTL, RETRIED_CONTENT, RETRY_CONTENT_TTL,
    WEB_AREA_TIMEOUT, await_web_area, await_web_content, enable_manual_accessibility, has_web_area,
    missing_content, pid_logged, record_pid, request_web_accessibility,
};
use super::{
    AX_COPY_MULTIPLE_KEEP_GOING, AX_SUCCESS, AX_VALUE_AX_ERROR, AX_VALUE_POINT, AX_VALUE_SIZE,
    AXUIElementCopyActionNames, AXUIElementCopyMultipleAttributeValues,
    AXUIElementIsAttributeSettable, AXValueGetType, AXValueGetValue, AxElement, CFEqual,
    application, attribute, copy_attribute, ensure_trusted, find_window, resolve,
};
use crate::backend::CancelToken;
use crate::elements::{Snapshot, canonical_role};
use crate::protocol::Result;
use crate::protocol::actions::{ElementAction, ElementBounds, ElementInfo};
use crate::protocol::window::WindowInfo;

/// Attributes fetched for every snapshot node in a single IPC round trip.
/// The order is the positional contract used by the `ATTR_*` indexes below;
/// `AXChildren` rides along so the walk needs no separate children fetch.
const SNAPSHOT_ATTRIBUTES: [&str; 12] = [
    "AXRole",
    "AXTitle",
    "AXDescription",
    "AXValue",
    "AXIdentifier",
    "AXPosition",
    "AXSize",
    "AXEnabled",
    "AXFocused",
    "AXVisible",
    "AXExpanded",
    "AXChildren",
];
const ATTR_ROLE: usize = 0;
const ATTR_TITLE: usize = 1;
const ATTR_DESCRIPTION: usize = 2;
const ATTR_VALUE: usize = 3;
const ATTR_IDENTIFIER: usize = 4;
pub(super) const ATTR_POSITION: usize = 5;
const ATTR_SIZE: usize = 6;
const ATTR_ENABLED: usize = 7;
const ATTR_FOCUSED: usize = 8;
const ATTR_VISIBLE: usize = 9;
const ATTR_EXPANDED: usize = 10;
const ATTR_CHILDREN: usize = 11;

thread_local! {
    /// The attribute-name array is immutable, so the CFStrings are built once
    /// per worker thread rather than once per node.
    static SNAPSHOT_ATTRIBUTE_NAMES: CFRetained<CFArray<CFString>> = {
        let names: Vec<CFRetained<CFString>> =
            SNAPSHOT_ATTRIBUTES.iter().map(|name| attribute(name)).collect();
        CFArray::from_retained_objects(&names)
    };
}

/// Positional values for [`SNAPSHOT_ATTRIBUTES`]. `None` means the attribute is
/// absent or came back as an AX error placeholder.
pub(super) type NodeAttributes = Vec<Option<CFRetained<CFType>>>;

fn is_ax_error(value: &CFType) -> bool {
    // SAFETY: AXValueGetType reads the type of any CoreFoundation value and
    // answers kAXValueIllegalType for values that are not AXValues.
    unsafe { AXValueGetType(std::ptr::from_ref(value).cast()) == AX_VALUE_AX_ERROR }
}

fn copy_multiple_attributes(element: &AxElement) -> Option<NodeAttributes> {
    let mut values = std::ptr::null_mut();
    let status = SNAPSHOT_ATTRIBUTE_NAMES.with(|names| {
        // SAFETY: `element` and the name array are live and `values` is a
        // writable Copy-rule output.
        unsafe {
            AXUIElementCopyMultipleAttributeValues(
                element.as_ptr(),
                CFRetained::as_ptr(names).as_ptr(),
                AX_COPY_MULTIPLE_KEEP_GOING,
                &mut values,
            )
        }
    });
    if status != AX_SUCCESS {
        return None;
    }
    let values = NonNull::new(values)?;
    // SAFETY: A successful call returned this array following the Copy rule.
    let values = unsafe { CFRetained::from_raw(values) };
    if values.len() != SNAPSHOT_ATTRIBUTES.len() {
        return None;
    }
    Some(
        (0..SNAPSHOT_ATTRIBUTES.len())
            .map(|index| values.get(index).filter(|value| !is_ax_error(value)))
            .collect(),
    )
}

/// One round trip per node, falling back to per-attribute reads only when the
/// batched call is refused outright, so results stay identical either way.
pub(super) fn node_attributes(element: &AxElement) -> NodeAttributes {
    copy_multiple_attributes(element).unwrap_or_else(|| {
        SNAPSHOT_ATTRIBUTES
            .iter()
            .map(|name| copy_attribute(element, name))
            .collect()
    })
}

fn attribute_at(values: &NodeAttributes, index: usize) -> Option<&CFType> {
    values.get(index)?.as_deref()
}

fn batched_string(values: &NodeAttributes, index: usize) -> Option<String> {
    attribute_at(values, index)?
        .downcast_ref::<CFString>()
        .map(CFString::to_string)
        .filter(|value| !value.is_empty())
}

fn batched_bool(values: &NodeAttributes, index: usize) -> Option<bool> {
    attribute_at(values, index)?
        .downcast_ref::<CFBoolean>()
        .map(CFBoolean::as_bool)
}

fn batched_value_string(values: &NodeAttributes) -> Option<String> {
    let value = attribute_at(values, ATTR_VALUE)?;
    if let Some(text) = value.downcast_ref::<CFString>() {
        let text = text.to_string();
        return (!text.is_empty()).then_some(text);
    }
    if let Some(number) = value.downcast_ref::<CFNumber>() {
        return number.as_f64().map(|number| number.to_string());
    }
    value
        .downcast_ref::<CFBoolean>()
        .map(|value| value.as_bool().to_string())
}

pub(super) fn batched_ax_value<T>(values: &NodeAttributes, index: usize, kind: u32) -> Option<T>
where
    T: Default,
{
    let value = attribute_at(values, index)?;
    let pointer = std::ptr::from_ref(value).cast::<c_void>();
    let mut out = T::default();
    // SAFETY: The value is live; `kind` is checked before decoding and `out` is
    // the correctly sized writable output for that AXValue type.
    (unsafe {
        AXValueGetType(pointer) == kind && AXValueGetValue(pointer, kind, (&raw mut out).cast())
    })
    .then_some(out)
}

fn batched_children(values: &NodeAttributes) -> Vec<AxElement> {
    let Some(value) = attribute_at(values, ATTR_CHILDREN) else {
        return Vec::new();
    };
    let Some(array) = value.downcast_ref::<CFArray>() else {
        return Vec::new();
    };
    // SAFETY: AXChildren is documented as an array of CoreFoundation-backed
    // AXUIElement values.
    let array = unsafe { array.cast_unchecked::<CFType>() };
    array.to_vec().into_iter().map(AxElement::from_cf).collect()
}

fn action_names(element: &AxElement) -> Vec<String> {
    let mut names = std::ptr::null_mut();
    // SAFETY: The AX element is live and `names` is a writable Copy-rule output.
    let status = unsafe { AXUIElementCopyActionNames(element.as_ptr(), &mut names) };
    if status != AX_SUCCESS {
        return Vec::new();
    }
    let Some(names) = NonNull::new(names) else {
        return Vec::new();
    };
    // SAFETY: A successful CopyActionNames returned a retained string array.
    let names = unsafe { CFRetained::from_raw(names) };
    names.iter().map(|name| name.to_string()).collect()
}

fn is_settable(element: &AxElement, name: &str) -> bool {
    let name = attribute(name);
    let mut settable = false;
    // SAFETY: Inputs are live and `settable` is writable.
    (unsafe {
        AXUIElementIsAttributeSettable(
            element.as_ptr(),
            CFRetained::as_ptr(&name).as_ptr(),
            &mut settable,
        ) == AX_SUCCESS
    }) && settable
}

/// Probe policy for the two extra per-node IPC round trips
/// (`AXUIElementCopyActionNames` and `AXUIElementIsAttributeSettable`).
///
/// Static text, images and separators are pure presentation on every platform:
/// they expose no AX action and no settable value, so all three probes are
/// skipped for them. Containers such as group, pane and splitgroup are
/// deliberately *not* skipped even though they are usually inert — web engines
/// map clickable `div`s onto AXGroup and really do expose AXPress there, and
/// rows/cells expose AXPress for selection.
fn role_may_be_actionable(role: &str) -> bool {
    !matches!(
        canonical_role(role).as_str(),
        "text" | "image" | "separator"
    )
}

fn mapped_actions(
    element: &AxElement,
    role: &str,
    native: &[String],
    has_expanded: bool,
    has_value: bool,
) -> Vec<ElementAction> {
    let mut actions = Vec::new();
    let has = |name: &str| native.iter().any(|action| action == name);
    if has("AXPress") || has("AXConfirm") {
        actions.extend([ElementAction::Invoke, ElementAction::Click]);
        if role.contains("CheckBox") || role.contains("RadioButton") || role.contains("Switch") {
            actions.push(ElementAction::Toggle);
        }
        if role.contains("Row") || role.contains("MenuItem") || role.contains("Tab") {
            actions.push(ElementAction::Select);
        }
    }
    if has("AXShowMenu") {
        actions.push(ElementAction::ContextMenu);
    }
    if has("AXScrollToVisible") {
        actions.push(ElementAction::Scroll);
    }
    // An attribute the batched fetch proved absent can never be settable, so
    // the settability probe would always answer false.
    if has_expanded && is_settable(element, "AXExpanded") {
        actions.extend([ElementAction::Expand, ElementAction::Collapse]);
    }
    if has_value && is_settable(element, "AXValue") {
        actions.push(ElementAction::SetValue);
    }
    actions.sort_by_key(|action| *action as u8);
    actions.dedup();
    actions
}

fn element_info(
    element: &AxElement,
    window: &WindowInfo,
    depth: u32,
) -> (ElementInfo, Vec<AxElement>) {
    let values = node_attributes(element);
    let role = batched_string(&values, ATTR_ROLE).unwrap_or_else(|| "AXUnknown".into());
    let name =
        batched_string(&values, ATTR_TITLE).or_else(|| batched_string(&values, ATTR_DESCRIPTION));
    let point = batched_ax_value::<CGPoint>(&values, ATTR_POSITION, AX_VALUE_POINT)
        .unwrap_or(CGPoint::ZERO);
    let size =
        batched_ax_value::<CGSize>(&values, ATTR_SIZE, AX_VALUE_SIZE).unwrap_or(CGSize::ZERO);
    let actions = if role_may_be_actionable(&role) {
        let native_actions = action_names(element);
        mapped_actions(
            element,
            &role,
            &native_actions,
            attribute_at(&values, ATTR_EXPANDED).is_some(),
            attribute_at(&values, ATTR_VALUE).is_some(),
        )
    } else {
        Vec::new()
    };
    let children = batched_children(&values);
    (
        ElementInfo {
            id: String::new(),
            role: canonical_role(&role),
            name,
            value: batched_value_string(&values),
            automation_id: batched_string(&values, ATTR_IDENTIFIER),
            bounds: ElementBounds {
                x: point.x.round() as i32 - window.x,
                y: point.y.round() as i32 - window.y,
                width: size.width.round().max(0.0) as i32,
                height: size.height.round().max(0.0) as i32,
            },
            enabled: batched_bool(&values, ATTR_ENABLED).unwrap_or(true),
            focused: batched_bool(&values, ATTR_FOCUSED).unwrap_or(false),
            offscreen: !batched_bool(&values, ATTR_VISIBLE).unwrap_or(true),
            actions,
            depth,
        },
        children,
    )
}

/// True when `candidate` repeats something already on its own ancestor chain,
/// which means descending into it would walk the same subtree forever.
///
/// Kept generic over the equality predicate so the decision is testable without
/// live `AXUIElement`s.
fn repeats_ancestor<T>(candidate: &T, ancestors: &[T], equal: impl Fn(&T, &T) -> bool) -> bool {
    ancestors.iter().any(|ancestor| equal(ancestor, candidate))
}

/// CoreFoundation identity for two `AXUIElement`s. Each attribute copy returns
/// a fresh reference, so pointer comparison is not enough.
pub(super) fn same_element(left: &AxElement, right: &AxElement) -> bool {
    // SAFETY: Both wrappers own a live CoreFoundation object.
    unsafe { CFEqual(left.as_ptr(), right.as_ptr()) != 0 }
}

fn walk_snapshot(
    window: &WindowInfo,
    root: AxElement,
    application: Option<&AxElement>,
    max_nodes: usize,
    cancel: &CancelToken,
) -> Result<Snapshot<AxElement>> {
    let mut snapshot = Snapshot::new(window.id);
    let mut discovered = Vec::new();
    // A degraded accessibility server — notably every app's while the macOS
    // console is locked — hands back a window proxy that lists the application
    // element as its own child, so the walk would spend its whole node budget
    // on one endlessly repeating chain. Seeding the root's ancestors with the
    // application element closes that loop at the first hop.
    let root_ancestors: Vec<AxElement> = application.cloned().into_iter().collect();
    let mut queue = VecDeque::from([(root, 0u32, Vec::<usize>::new(), root_ancestors)]);
    while let Some((element, depth, path, ancestors)) = queue.pop_front() {
        cancel.check()?;
        if discovered.len() >= max_nodes {
            snapshot.truncated = true;
            break;
        }
        let (info, children) = element_info(&element, window, depth);
        let mut child_ancestors = ancestors;
        child_ancestors.push(element.clone());
        discovered.push((path.clone(), info, element));
        for (child_index, child) in children.into_iter().enumerate() {
            if discovered.len() + queue.len() >= max_nodes {
                snapshot.truncated = true;
                break;
            }
            if repeats_ancestor(&child, &child_ancestors, same_element) {
                continue;
            }
            let mut child_path = path.clone();
            child_path.push(child_index);
            queue.push_back((child, depth + 1, child_path, child_ancestors.clone()));
        }
    }
    discovered.sort_by(|left, right| left.0.cmp(&right.0));
    for (_, info, handle) in discovered {
        snapshot.push(info, handle);
    }
    Ok(snapshot)
}

pub(super) fn build_snapshot(
    window: &WindowInfo,
    max_nodes: usize,
    cancel: &CancelToken,
) -> Result<Snapshot<AxElement>> {
    ensure_trusted()?;
    let app_element = window.pid.and_then(|pid| application(pid).ok());
    // Ask before the first walk. A Chromium window always describes its own
    // browser chrome, so waiting for an empty tree would never fire, and the
    // agent would be left with a page it cannot address by element.
    if chromium::is_chromium_shell(window)
        && let (Some(pid), Some(application)) = (window.pid, app_element.as_ref())
    {
        request_web_accessibility(pid, application);
    }
    let root = resolve(window)?;
    let mut snapshot = walk_snapshot(
        window,
        root.clone(),
        app_element.as_ref(),
        max_nodes,
        cancel,
    )?;
    // A newly enabled Electron process exposes native groups before AXWebArea
    // exists. An empty-web-area check cannot recognize this startup state.
    if chromium::is_chromium_shell(window)
        && !snapshot.truncated
        && !has_web_area(&snapshot)
        && !session::screen_locked()
        && let Some(pid) = window.pid
        && !pid_logged(&PAGE_ABSENT, pid, PAGE_ABSENT_TTL)
    {
        snapshot = await_web_area(snapshot, WEB_AREA_TIMEOUT, cancel, || {
            walk_snapshot(
                window,
                root.clone(),
                app_element.as_ref(),
                max_nodes,
                cancel,
            )
        })?;
        if !snapshot.truncated && !has_web_area(&snapshot) {
            record_pid(&PAGE_ABSENT, pid, PAGE_ABSENT_TTL);
        }
    }
    // Second chance for a browser this host did not recognize, and for the walk
    // that raced a page still being built.
    //
    // An empty page is the only case that earns the ask on an unrecognized app.
    // `AXEnhancedUserInterface` is a process-wide accessibility mode that is
    // known to disturb window geometry in some hosts and to switch on heavy
    // work in others, so a window that merely reports no children — which is
    // every window while the console is locked — does not justify writing it
    // into an arbitrary third-party app.
    if let Some(missing) = missing_content(&snapshot)
        && (matches!(missing, MissingContent::Page(_)) || chromium::is_chromium_shell(window))
        && !session::screen_locked()
        && let Some(pid) = window.pid
        && let Some(application) = app_element.as_ref()
    {
        // Only the *write* is rate limited. Waiting for a page and walking
        // again has no side effect on the app, so a caller that arrives while
        // another lane is mid-retry still gets the page instead of the empty
        // tree the record would otherwise hand it — the passive and input lanes
        // run concurrently, and that is exactly the collision the short expiry
        // was meant to cover and could not.
        if !pid_logged(&RETRIED_CONTENT, pid, RETRY_CONTENT_TTL)
            && enable_manual_accessibility(application)
        {
            // Recorded only once the ask actually went through, so an app that
            // refuses the write does not burn the retry for the next caller.
            record_pid(&RETRIED_CONTENT, pid, RETRY_CONTENT_TTL);
        }
        // Waiting is only worth it while the page might still be coming. A web
        // area that is permanently childless would otherwise pay the whole
        // budget, and a second walk, on every call for the life of the process.
        let waited = if let MissingContent::Page(index) = missing
            && !pid_logged(&PAGE_ABSENT, pid, PAGE_ABSENT_TTL)
        {
            await_web_content(&snapshot.handles[index], cancel)?;
            true
        } else {
            false
        };
        if let Some(root) = find_window(application, window) {
            snapshot = walk_snapshot(window, root, Some(application), max_nodes, cancel)?;
        }
        if waited && missing_content(&snapshot).is_some() {
            record_pid(&PAGE_ABSENT, pid, PAGE_ABSENT_TTL);
        }
    }
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::repeats_ancestor;

    #[test]
    fn a_child_that_repeats_an_ancestor_is_a_cycle() {
        let equal = |left: &u32, right: &u32| left == right;
        // The self-recursive proxy macOS hands out while the screen is locked.
        assert!(repeats_ancestor(&7, &[1, 7], equal));
        // The application element seeded as the root's ancestor.
        assert!(repeats_ancestor(&1, &[1], equal));
        assert!(!repeats_ancestor(&7, &[1, 2], equal));
        assert!(!repeats_ancestor(&7, &[], equal));
    }
}
