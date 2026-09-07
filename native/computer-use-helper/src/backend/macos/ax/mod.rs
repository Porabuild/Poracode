//! The macOS accessibility client: the AX FFI declarations, the `AxElement`
//! ownership wrapper, single-attribute reads, and window identity and
//! resolution.
//!
//! The public entry points live here as well and delegate the three concerns
//! the submodules own: `snapshot` describes a window as a tree, `webcontent`
//! gets a browser to expose its page, and `press` turns a coordinate or a
//! request into an acted-on element.

use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::OnceLock;

use objc2_core_foundation::{
    CFArray, CFBoolean, CFNumber, CFRetained, CFString, CFType, CGPoint, CGSize,
};

use super::chromium;
use crate::backend::{CancelToken, capability_unavailable};
use crate::elements::{
    MAX_TREE_BYTES, SnapshotCache, advertise_ancestor_scroll, canonical_role, render_tree,
    render_tree_preferring_page,
};
use crate::protocol::actions::{
    AccessibilityState, Delivery, DeliveryTarget, ElementAction, ElementBounds, ElementInfo,
    FindElementsInput, FindElementsResult, InteractiveResult, Refusal, RefusalCode, Route,
    Verified,
};
use crate::protocol::window::WindowInfo;
use crate::protocol::{HelperError, Result};

mod press;
mod snapshot;
mod webcontent;

pub(crate) use press::press_at_position;
use press::{Observation, element_origin, observed, scroll_into_view};
use snapshot::{build_snapshot, same_element};
use webcontent::request_web_accessibility;

const AX_SUCCESS: i32 = 0;
const AX_VALUE_POINT: u32 = 1;
const AX_VALUE_SIZE: u32 = 2;
/// `kAXValueAXErrorType`: the placeholder value
/// `AXUIElementCopyMultipleAttributeValues` stores for an attribute the element
/// does not support.
const AX_VALUE_AX_ERROR: u32 = 5;
/// `kAXCopyMultipleAttributeOptionStopOnError` cleared, so one unsupported
/// attribute yields an error placeholder instead of failing the whole batch.
const AX_COPY_MULTIPLE_KEEP_GOING: u32 = 0;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXUIElementCreateApplication(pid: libc::pid_t) -> *mut c_void;
    fn AXUIElementCopyAttributeValue(
        element: *const c_void,
        attribute: *const CFString,
        value: *mut *mut CFType,
    ) -> i32;
    /// Not exposed by any objc2 crate; the AX client API is declared locally.
    fn AXUIElementCopyMultipleAttributeValues(
        element: *const c_void,
        attributes: *const CFArray<CFString>,
        options: u32,
        values: *mut *mut CFArray<CFType>,
    ) -> i32;
    fn AXUIElementCopyActionNames(
        element: *const c_void,
        names: *mut *mut CFArray<CFString>,
    ) -> i32;
    fn AXUIElementPerformAction(element: *const c_void, action: *const CFString) -> i32;
    fn AXUIElementSetAttributeValue(
        element: *const c_void,
        attribute: *const CFString,
        value: *const c_void,
    ) -> i32;
    fn AXUIElementIsAttributeSettable(
        element: *const c_void,
        attribute: *const CFString,
        settable: *mut bool,
    ) -> i32;
    fn AXUIElementCopyElementAtPosition(
        application: *const c_void,
        x: f64,
        y: f64,
        element: *mut *mut c_void,
    ) -> i32;
    fn AXUIElementSetMessagingTimeout(element: *const c_void, timeout: f32) -> i32;
    fn AXValueGetType(value: *const c_void) -> u32;
    fn AXValueGetValue(value: *const c_void, value_type: u32, output: *mut c_void) -> bool;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFRetain(value: *const c_void) -> *const c_void;
    fn CFRelease(value: *const c_void);
    fn CFEqual(left: *const c_void, right: *const c_void) -> u8;
}

#[derive(Debug)]
pub struct AxElement(NonNull<c_void>);

impl AxElement {
    fn from_created(pointer: *mut c_void) -> Option<Self> {
        NonNull::new(pointer).map(Self)
    }

    fn from_cf(value: CFRetained<CFType>) -> Self {
        Self(CFRetained::into_raw(value).cast())
    }

    fn as_ptr(&self) -> *const c_void {
        self.0.as_ptr()
    }
}

impl Clone for AxElement {
    fn clone(&self) -> Self {
        // SAFETY: The AXUIElement is a live CoreFoundation object and CFRetain
        // returns another ownership reference to the same object.
        let pointer = unsafe { CFRetain(self.as_ptr()) } as *mut c_void;
        Self(NonNull::new(pointer).expect("CFRetain returned null"))
    }
}

impl Drop for AxElement {
    fn drop(&mut self) {
        // SAFETY: This wrapper owns one retain count for the AXUIElement.
        unsafe { CFRelease(self.as_ptr()) };
    }
}

// SAFETY: AXUIElementRef is an immutable CoreFoundation reference. Apple
// documents the accessibility client API as callable from non-main threads;
// mutations are performed by the target process, not through Rust aliases.
unsafe impl Send for AxElement {}
// SAFETY: See the Send implementation; each AX call is independently serialized
// by the target accessibility server.
unsafe impl Sync for AxElement {}

fn attribute(name: &str) -> CFRetained<CFString> {
    CFString::from_str(name)
}

fn application(pid: u32) -> Result<AxElement> {
    // SAFETY: AXUIElementCreateApplication accepts any process id and returns a
    // Create-rule CoreFoundation object or null.
    let application = unsafe { AXUIElementCreateApplication(pid as libc::pid_t) };
    let application = AxElement::from_created(application)
        .ok_or_else(|| HelperError::internal("Could not create a macOS accessibility client."))?;
    // SAFETY: The application element is live. Bound synchronous calls so a
    // wedged target cannot stall the helper indefinitely.
    let _ = unsafe { AXUIElementSetMessagingTimeout(application.as_ptr(), 1.0) };
    Ok(application)
}

fn copy_attribute(element: &AxElement, name: &str) -> Option<CFRetained<CFType>> {
    let name = attribute(name);
    let mut value = std::ptr::null_mut();
    // SAFETY: `element` and `name` are live and `value` is writable. A success
    // result follows the CoreFoundation Copy ownership rule.
    let status = unsafe {
        AXUIElementCopyAttributeValue(
            element.as_ptr(),
            CFRetained::as_ptr(&name).as_ptr(),
            &mut value,
        )
    };
    if status != AX_SUCCESS {
        return None;
    }
    NonNull::new(value).map(|value| {
        // SAFETY: A successful CopyAttributeValue returned this at +1.
        unsafe { CFRetained::from_raw(value) }
    })
}

fn string_attribute(element: &AxElement, name: &str) -> Option<String> {
    copy_attribute(element, name)?
        .downcast::<CFString>()
        .ok()
        .map(|value| value.to_string())
        .filter(|value| !value.is_empty())
}

fn value_string(element: &AxElement) -> Option<String> {
    let value = copy_attribute(element, "AXValue")?;
    if let Some(value) = value.downcast_ref::<CFString>() {
        let value = value.to_string();
        return (!value.is_empty()).then_some(value);
    }
    if let Some(value) = value.downcast_ref::<CFNumber>() {
        return value.as_f64().map(|value| value.to_string());
    }
    value
        .downcast_ref::<CFBoolean>()
        .map(|value| value.as_bool().to_string())
}

fn bool_attribute(element: &AxElement, name: &str) -> Option<bool> {
    copy_attribute(element, name)?
        .downcast_ref::<CFBoolean>()
        .map(CFBoolean::as_bool)
}

fn array_attribute(element: &AxElement, name: &str) -> Vec<AxElement> {
    let Some(value) = copy_attribute(element, name) else {
        return Vec::new();
    };
    let Ok(array) = value.downcast::<CFArray>() else {
        return Vec::new();
    };
    // SAFETY: AXChildren is documented as an array of CoreFoundation-backed
    // AXUIElement values.
    let array = unsafe { CFRetained::cast_unchecked::<CFArray<CFType>>(array) };
    array.to_vec().into_iter().map(AxElement::from_cf).collect()
}

fn position(element: &AxElement) -> Option<CGPoint> {
    let value = copy_attribute(element, "AXPosition")?;
    let mut point = CGPoint::ZERO;
    // SAFETY: AXPosition is documented as an AXValue containing CGPoint and
    // `point` is a correctly sized writable output.
    (unsafe { AXValueGetType(CFRetained::as_ptr(&value).as_ptr().cast()) } == AX_VALUE_POINT
        && unsafe {
            AXValueGetValue(
                CFRetained::as_ptr(&value).as_ptr().cast(),
                AX_VALUE_POINT,
                (&raw mut point).cast(),
            )
        })
    .then_some(point)
}

fn size(element: &AxElement) -> Option<CGSize> {
    let value = copy_attribute(element, "AXSize")?;
    let mut size = CGSize::ZERO;
    // SAFETY: AXSize is documented as an AXValue containing CGSize and `size`
    // is a correctly sized writable output.
    (unsafe { AXValueGetType(CFRetained::as_ptr(&value).as_ptr().cast()) } == AX_VALUE_SIZE
        && unsafe {
            AXValueGetValue(
                CFRetained::as_ptr(&value).as_ptr().cast(),
                AX_VALUE_SIZE,
                (&raw mut size).cast(),
            )
        })
    .then_some(size)
}

type GetWindowId = unsafe extern "C" fn(*const c_void, *mut u32) -> i32;

fn get_window_id() -> Option<GetWindowId> {
    static FUNCTION: OnceLock<Option<GetWindowId>> = OnceLock::new();
    *FUNCTION.get_or_init(|| {
        // SAFETY: RTLD_DEFAULT lookup is read-only. The result is called only
        // with the private AX function's established two-argument ABI.
        let symbol = unsafe { libc::dlsym(libc::RTLD_DEFAULT, c"_AXUIElementGetWindow".as_ptr()) };
        (!symbol.is_null()).then(|| {
            // SAFETY: The symbol name uniquely identifies this function ABI.
            unsafe { std::mem::transmute(symbol) }
        })
    })
}

fn window_id(element: &AxElement) -> Option<u32> {
    let function = get_window_id()?;
    let mut id = 0;
    // SAFETY: The element is live and `id` is writable.
    (unsafe { function(element.as_ptr(), &mut id) } == AX_SUCCESS).then_some(id)
}

fn same_window(element: &AxElement, window: &WindowInfo) -> bool {
    if let Some(id) = window_id(element) {
        return i64::from(id) == window.id;
    }
    let title_matches = window.title.is_empty()
        || string_attribute(element, "AXTitle").is_some_and(|title| title == window.title);
    let bounds_match = position(element)
        .zip(size(element))
        .is_some_and(|(point, size)| {
            (point.x.round() as i32 - window.x).abs() <= 2
                && (point.y.round() as i32 - window.y).abs() <= 2
                && (size.width.round() as i32 - window.width).abs() <= 2
                && (size.height.round() as i32 - window.height).abs() <= 2
        });
    title_matches && bounds_match
}

fn belongs_to_window(element: &AxElement, window: &WindowInfo) -> bool {
    if let Some(owner) = copy_attribute(element, "AXWindow").map(AxElement::from_cf) {
        return same_window(&owner, window);
    }
    same_window(element, window)
}

/// Index of the only AX window that can possibly be the requested one, or
/// `None` when the choice is ambiguous.
///
/// [`same_window`] normally identifies a window by its CoreGraphics id, and
/// falls back to title plus bounds. While the console screen is locked macOS
/// answers `_AXUIElementGetWindow` with `kAXErrorFailure` and reports every AX
/// window at `(0, 0)` with a zero size, so both branches fail and an otherwise
/// healthy target would resolve to `window_unavailable`. Background AX control
/// is supposed to keep working while locked, so this last resort accepts a
/// match that cannot be anything else:
///
/// * the process must own exactly one layer-0 window in the window server's
///   list (`cg_windows_for_pid == 1`), and
/// * exactly one AX window must carry the requested `title` (or, when the
///   requested title is empty, the process must expose exactly one AX window).
///
/// Any ambiguity — two same-titled windows, two CG windows, no title match —
/// returns `None` so resolution stays strict.
fn unique_title_fallback(
    candidates: &[Option<String>],
    title: &str,
    cg_windows_for_pid: usize,
) -> Option<usize> {
    if cg_windows_for_pid != 1 {
        return None;
    }
    let mut matching = candidates
        .iter()
        .enumerate()
        .filter(|(_, candidate)| title.is_empty() || candidate.as_deref() == Some(title));
    let index = matching.next()?.0;
    matching.next().is_none().then_some(index)
}

/// How many layer-0 windows the window server currently attributes to `pid`.
fn cg_windows_for_pid(pid: u32) -> usize {
    super::window_list::list_windows()
        .into_iter()
        .filter(|candidate| candidate.pid == Some(pid))
        .count()
}

fn find_window(application: &AxElement, window: &WindowInfo) -> Option<AxElement> {
    let mut windows = array_attribute(application, "AXWindows");
    if let Some(index) = windows
        .iter()
        .position(|element| same_window(element, window))
    {
        return Some(windows.swap_remove(index));
    }
    let titles = windows
        .iter()
        .map(|element| string_attribute(element, "AXTitle"))
        .collect::<Vec<_>>();
    let index = unique_title_fallback(&titles, &window.title, cg_windows_for_pid(window.pid?))?;
    Some(windows.swap_remove(index))
}

fn resolve(window: &WindowInfo) -> Result<AxElement> {
    let pid = window.pid.ok_or_else(HelperError::window_unavailable)?;
    let application = application(pid)?;
    if let Some(element) = find_window(&application, window) {
        return Ok(element);
    }
    if chromium::is_chromium_shell(window) {
        // The same throttled request the snapshot path uses. A raw write here
        // would fire on every failing resolution — `cached_element`, focus,
        // presses against a window that has gone away — and the mode is a
        // process-wide write into a third-party app.
        request_web_accessibility(pid, &application);
        if let Some(element) = find_window(&application, window) {
            return Ok(element);
        }
    }
    Err(HelperError::window_unavailable())
}

pub fn is_trusted() -> bool {
    // SAFETY: This is a read-only TCC status query.
    unsafe { AXIsProcessTrusted() }
}

fn ensure_trusted() -> Result<()> {
    if is_trusted() {
        Ok(())
    } else {
        Err(HelperError::permission_denied(
            "Accessibility permission is required to inspect or control macOS apps.",
        ))
    }
}

pub fn snapshot_tree(
    cache: &SnapshotCache<AxElement>,
    window: &WindowInfo,
    max_nodes: usize,
    cancel: &CancelToken,
) -> Result<AccessibilityState> {
    let snapshot = build_snapshot(window, max_nodes, cancel)?;
    let (tree, text_truncated) = if chromium::is_chromium_shell(window) {
        render_tree_preferring_page(&snapshot.elements, MAX_TREE_BYTES)
    } else {
        render_tree(&snapshot.elements, MAX_TREE_BYTES)
    };
    let state = AccessibilityState {
        source: "ax".into(),
        tree,
        snapshot_id: snapshot.id.clone(),
        element_count: snapshot.elements.len(),
        truncated: snapshot.truncated || text_truncated,
    };
    cache.insert(snapshot);
    Ok(state)
}

pub fn find_elements(
    cache: &SnapshotCache<AxElement>,
    window: &WindowInfo,
    input: &FindElementsInput,
    cancel: &CancelToken,
) -> Result<FindElementsResult> {
    let snapshot_id = if let Some(snapshot_id) = input.snapshot_id.as_deref() {
        snapshot_id.to_string()
    } else {
        let snapshot = build_snapshot(window, 2_000, cancel)?;
        let snapshot_id = snapshot.id.clone();
        cache.insert(snapshot);
        snapshot_id
    };
    Ok(cache
        .with_snapshot(&snapshot_id, |snapshot| {
            if snapshot.window_id != window.id {
                return None;
            }
            let (mut elements, filtered_truncated) = snapshot.find(input);
            advertise_ancestor_scroll(&mut elements);
            Some(FindElementsResult::found(
                snapshot.id.clone(),
                snapshot.truncated || filtered_truncated,
                elements,
            ))
        })
        .flatten()
        .unwrap_or_else(|| FindElementsResult::refused(window.clone(), Refusal::stale_snapshot())))
}

fn cached_element(
    cache: &SnapshotCache<AxElement>,
    window: &WindowInfo,
    element_id: &str,
) -> std::result::Result<(ElementInfo, AxElement, bool), Refusal> {
    let (mut live_info, element) = cache
        .with_element(element_id, |snapshot, index| {
            (snapshot.window_id == window.id).then(|| {
                (
                    snapshot.elements[index].clone(),
                    snapshot.handles[index].clone(),
                )
            })
        })
        .flatten()
        .ok_or_else(Refusal::stale_snapshot)?;
    resolve(window).map_err(|_| Refusal::stale_snapshot())?;
    let Some(role) = string_attribute(&element, "AXRole") else {
        return Err(Refusal::stale_snapshot());
    };
    if !belongs_to_window(&element, window) {
        return Err(Refusal::stale_snapshot());
    }
    live_info.role = canonical_role(&role);
    live_info.name = string_attribute(&element, "AXTitle")
        .or_else(|| string_attribute(&element, "AXDescription"));
    let previous_bounds = live_info.bounds;
    if let Some((point, size)) = position(&element).zip(size(&element)) {
        live_info.bounds = ElementBounds {
            x: point.x.round() as i32 - window.x,
            y: point.y.round() as i32 - window.y,
            width: size.width.round().max(0.0) as i32,
            height: size.height.round().max(0.0) as i32,
        };
    }
    let moved = live_info.bounds != previous_bounds;
    Ok((live_info, element, moved))
}

fn perform(element: &AxElement, action: &str) -> bool {
    let action = attribute(action);
    // SAFETY: The element and action string are live for this synchronous call.
    unsafe {
        AXUIElementPerformAction(element.as_ptr(), CFRetained::as_ptr(&action).as_ptr())
            == AX_SUCCESS
    }
}

fn set_value(element: &AxElement, attribute_name: &str, value: *const c_void) -> bool {
    let attribute_name = attribute(attribute_name);
    // SAFETY: The element, attribute, and CoreFoundation value are live for
    // this synchronous accessibility call.
    unsafe {
        AXUIElementSetAttributeValue(
            element.as_ptr(),
            CFRetained::as_ptr(&attribute_name).as_ptr(),
            value,
        ) == AX_SUCCESS
    }
}

fn delivery(element: &ElementInfo, element_id: &str, verified: Verified, moved: bool) -> Delivery {
    let delivery = Delivery::background(Route::Accessibility)
        .with_verified(verified)
        .with_target(DeliveryTarget {
            kind: "ax".into(),
            id: element_id.into(),
            role: Some(element.role.clone()),
            name: element.name.clone(),
        });
    if moved {
        delivery.with_note("element_moved")
    } else {
        delivery
    }
}

fn permission_refusal(window: &WindowInfo) -> InteractiveResult {
    InteractiveResult::refused(
        window.clone(),
        Refusal::new(
            RefusalCode::PermissionDenied,
            "Accessibility permission is required to control macOS apps.",
            "Grant Accessibility permission to Poracode in System Settings, then retry.",
        ),
    )
}

#[derive(Clone, PartialEq, Eq)]
struct InvokeWatch {
    focused: Option<bool>,
    value: Option<String>,
    name: Option<String>,
}

fn invoke_watch(element: &AxElement) -> InvokeWatch {
    InvokeWatch {
        focused: bool_attribute(element, "AXFocused"),
        value: value_string(element),
        name: string_attribute(element, "AXTitle")
            .or_else(|| string_attribute(element, "AXDescription")),
    }
}

/// A local change confirms the press. No change is not evidence of a no-op —
/// most buttons publish nothing — so the verdict stays `unverified`.
fn invoke_verdict(observation: Observation) -> Verified {
    match observation {
        Observation::Seen => Verified::Confirmed,
        Observation::Absent | Observation::Interrupted => Verified::Unverified,
    }
}

/// The verdict for a watch whose only outcomes are "it happened" and "it did
/// not". An interrupted watch reached no conclusion at all.
fn verdict(observation: Observation) -> Verified {
    match observation {
        Observation::Seen => Verified::Confirmed,
        Observation::Absent => Verified::Unchanged,
        Observation::Interrupted => Verified::Unverified,
    }
}

/// The verdict for a `toggle`. Only a natively advertised toggle with a
/// readable value can be watched honestly. Both other shapes stay `unverified`:
/// a `toggle` that reached a plain button through the `Invoke` fallback pressed
/// something real — a tab or a segmented control publishes a selected index a
/// press does not change, so calling that `unchanged` would send the agent
/// hunting elsewhere — and a native toggle with no readable value gave the
/// watch nothing to compare.
fn toggle_verdict(
    natively_advertised: bool,
    before: Option<Option<String>>,
    watch: impl FnOnce(Option<String>) -> Observation,
) -> Verified {
    if !natively_advertised {
        return Verified::Unverified;
    }
    match before {
        Some(None) | None => Verified::Unverified,
        Some(readable_before) => verdict(watch(readable_before)),
    }
}

pub fn invoke_element(
    cache: &SnapshotCache<AxElement>,
    window: &WindowInfo,
    element_id: &str,
    requested: ElementAction,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    if !is_trusted() {
        return Ok(permission_refusal(window));
    }
    let (element_info, element, moved) = match cached_element(cache, window, element_id) {
        Ok(cached) => cached,
        Err(refusal) => return Ok(InteractiveResult::refused(window.clone(), refusal)),
    };
    // `Scroll` is exempt: the node an agent asks to reveal usually does not
    // carry the action itself, and refusing here is what sent every blind
    // evaluation hunting for a container that cannot scroll.
    if requested != ElementAction::Scroll
        && !element_info.actions.contains(&requested)
        && !(requested == ElementAction::Toggle
            && element_info.actions.contains(&ElementAction::Invoke))
    {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::element_action_unsupported(requested),
        ));
    }
    // Everything a verdict will compare against has to be read *before* the
    // action. Reading it afterwards is a race that only looks correct against a
    // slow accessibility server: a native control that flips synchronously
    // would be compared against its own post-action state and reported
    // `unchanged`, which tells the agent to abandon the control that worked.
    // `None` means there is nothing to watch — an element with no value — and
    // the verdict says so rather than inventing one.
    let toggle_before = (requested == ElementAction::Toggle).then(|| value_string(&element));
    // Invoke/click/select often have no value to watch. A press that moves
    // focus or changes the published name/value is still a local effect, and
    // reporting `unverified` while the bundled observation already shows the
    // change is what sent testers to retry the button. Absence of a change
    // stays `unverified`, never `unchanged`: a button that does not publish
    // local state still pressed.
    let invoke_before = matches!(
        requested,
        ElementAction::Invoke | ElementAction::Click | ElementAction::Select
    )
    .then(|| invoke_watch(&element));
    // Scrolling reports which element moved, because it may not be the one the
    // caller named.
    let mut scrolled = None;
    let performed = match requested {
        ElementAction::Invoke
        | ElementAction::Click
        | ElementAction::Toggle
        | ElementAction::Select => perform(&element, "AXPress") || perform(&element, "AXConfirm"),
        ElementAction::ContextMenu => perform(&element, "AXShowMenu"),
        ElementAction::Scroll => {
            scrolled = scroll_into_view(&element, window);
            scrolled.is_some()
        }
        ElementAction::Expand | ElementAction::Collapse => {
            let value = CFBoolean::new(requested == ElementAction::Expand);
            set_value(&element, "AXExpanded", (value as *const CFBoolean).cast())
        }
        ElementAction::SetValue => false,
    };
    if !performed {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::element_action_unsupported(requested),
        ));
    }
    // `Confirmed` used to be unconditional here, which certified no-ops: an
    // `AXScrollToVisible` on a scroll container returns success and moves
    // nothing. Claim it only where there is something to watch, and report
    // `Unverified` — accepted, effect not observable — where there is not.
    // Each arm spends `unchanged` only when it *watched* and nothing moved.
    // Where the thing to watch could not be read, or the watch was interrupted,
    // the verdict is `unverified`: the instructions tell an agent to abandon an
    // element on `unchanged`, so spending that verdict on "could not tell"
    // costs it the control that actually worked.
    let verified = match requested {
        ElementAction::Scroll => match scrolled.as_ref() {
            // An unreadable position is not a stationary one.
            Some(scrolled) if scrolled.before.is_none() => Verified::Unverified,
            Some(scrolled) => verdict(observed(cancel, || {
                element_origin(&scrolled.element) != scrolled.before
            })),
            None => Verified::Unverified,
        },
        ElementAction::Toggle => {
            let natively_advertised = element_info.actions.contains(&ElementAction::Toggle);
            toggle_verdict(natively_advertised, toggle_before.clone(), |before| {
                observed(cancel, || value_string(&element) != before)
            })
        }
        ElementAction::Expand | ElementAction::Collapse => {
            let want = requested == ElementAction::Expand;
            match observed(cancel, || {
                bool_attribute(&element, "AXExpanded") == Some(want)
            }) {
                Observation::Seen => Verified::Confirmed,
                // The state is evidence of "did not happen" only if it can be
                // read at all: an app that never publishes `AXExpanded` has
                // told us nothing either way.
                Observation::Absent if bool_attribute(&element, "AXExpanded").is_some() => {
                    Verified::Unchanged
                }
                Observation::Absent | Observation::Interrupted => Verified::Unverified,
            }
        }
        ElementAction::Invoke | ElementAction::Click | ElementAction::Select => match invoke_before
        {
            Some(before) => invoke_verdict(observed(cancel, || invoke_watch(&element) != before)),
            None => Verified::Unverified,
        },
        _ => Verified::Unverified,
    };
    let mut result = delivery(&element_info, element_id, verified, moved);
    if scrolled.is_some_and(|scrolled| !same_element(&scrolled.element, &element)) {
        // The caller asked to reveal one node and an ancestor is what scrolled,
        // so say so rather than implying the named node moved on its own.
        result = result.with_note("scrolled_ancestor");
    }
    Ok(InteractiveResult::delivered(window.clone(), result))
}

pub fn set_element_value(
    cache: &SnapshotCache<AxElement>,
    window: &WindowInfo,
    element_id: &str,
    value: &str,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    if !is_trusted() {
        return Ok(permission_refusal(window));
    }
    let (element_info, element, moved) = match cached_element(cache, window, element_id) {
        Ok(cached) => cached,
        Err(refusal) => return Ok(InteractiveResult::refused(window.clone(), refusal)),
    };
    if !element_info.actions.contains(&ElementAction::SetValue) {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::element_action_unsupported(ElementAction::SetValue),
        ));
    }
    let requested_value = value;
    let previous_value = value_string(&element);
    let value = CFString::from_str(requested_value);
    if !set_value(
        &element,
        "AXValue",
        CFRetained::as_ptr(&value).as_ptr().cast(),
    ) {
        return Ok(capability_unavailable(
            window.clone(),
            "setting this accessibility value",
        ));
    }
    let verified = match observed(cancel, || {
        value_string(&element).as_deref() == Some(requested_value)
    }) {
        Observation::Seen => Verified::Confirmed,
        Observation::Absent if value_string(&element) == previous_value => Verified::Unchanged,
        Observation::Absent | Observation::Interrupted => Verified::Unverified,
    };
    Ok(InteractiveResult::delivered(
        window.clone(),
        delivery(&element_info, element_id, verified, moved),
    ))
}

/// True when the app already treats this window as its focused window.
///
/// Background keyboard input goes to whichever window the target app has
/// focused, so reaching a different one means making the target focused, and
/// macOS raises it inside its app when that happens. Checking first keeps the
/// common case — typing into the window the app is already on — free of any
/// focus write at all.
pub fn window_already_focused(window: &WindowInfo) -> bool {
    let Some(pid) = window.pid else {
        return false;
    };
    let Ok(application) = application(pid) else {
        return false;
    };
    copy_attribute(&application, "AXFocusedWindow")
        .map(AxElement::from_cf)
        .is_some_and(|focused| same_window(&focused, window))
}

pub fn focus_window(window: &WindowInfo, raise: bool) -> Result<bool> {
    ensure_trusted()?;
    let element = resolve(window)?;
    let value = CFBoolean::new(true);
    let focused = set_value(&element, "AXMain", (value as *const CFBoolean).cast())
        | set_value(&element, "AXFocused", (value as *const CFBoolean).cast());
    Ok(if raise {
        perform(&element, "AXRaise") || focused
    } else {
        focused
    })
}

#[cfg(test)]
mod tests {
    use super::Observation;
    use super::Verified;
    use super::toggle_verdict;
    use super::unique_title_fallback;

    fn titles(values: &[Option<&str>]) -> Vec<Option<String>> {
        values
            .iter()
            .map(|value| value.map(str::to_string))
            .collect()
    }

    /// A `toggle` that reached a plain button through the `Invoke` fallback
    /// pressed something real. A tab or a segmented control publishes its
    /// selected index as its value, and the index does not change on a press —
    /// calling that `unchanged` would send the agent hunting elsewhere.
    #[test]
    fn a_fallback_toggle_with_a_readable_value_is_never_called_unchanged() {
        let verdict = toggle_verdict(false, Some(Some("1".into())), |_| {
            panic!("a fallback press has no comparable value")
        });
        assert_eq!(verdict, Verified::Unverified);
    }

    #[test]
    fn a_native_toggle_is_judged_by_its_value() {
        assert_eq!(
            toggle_verdict(true, Some(Some("0".into())), |_| Observation::Seen),
            Verified::Confirmed
        );
        assert_eq!(
            toggle_verdict(true, Some(Some("0".into())), |_| Observation::Absent),
            Verified::Unchanged
        );
        assert_eq!(
            toggle_verdict(true, Some(Some("0".into())), |_| Observation::Interrupted),
            Verified::Unverified
        );
        assert_eq!(
            toggle_verdict(true, Some(None), |_| panic!("nothing to watch")),
            Verified::Unverified
        );
        assert_eq!(
            toggle_verdict(true, None, |_| panic!("nothing to watch")),
            Verified::Unverified
        );
    }

    #[test]
    fn accepts_the_only_window_with_the_requested_title() {
        let candidates = titles(&[Some("Calculator")]);
        assert_eq!(unique_title_fallback(&candidates, "Calculator", 1), Some(0));
    }

    #[test]
    fn accepts_the_only_window_when_the_requested_title_is_empty() {
        let candidates = titles(&[None]);
        assert_eq!(unique_title_fallback(&candidates, "", 1), Some(0));
    }

    #[test]
    fn rejects_ambiguous_titles() {
        let candidates = titles(&[Some("Calculator"), Some("Calculator")]);
        assert_eq!(unique_title_fallback(&candidates, "Calculator", 1), None);
        let untitled = titles(&[None, None]);
        assert_eq!(unique_title_fallback(&untitled, "", 1), None);
    }

    #[test]
    fn rejects_when_the_process_owns_more_than_one_cg_window() {
        let candidates = titles(&[Some("Calculator")]);
        assert_eq!(unique_title_fallback(&candidates, "Calculator", 2), None);
        assert_eq!(unique_title_fallback(&candidates, "Calculator", 0), None);
    }

    #[test]
    fn rejects_when_no_candidate_carries_the_requested_title() {
        let candidates = titles(&[Some("Preferences"), None]);
        assert_eq!(unique_title_fallback(&candidates, "Calculator", 1), None);
    }

    #[test]
    fn picks_the_single_titled_window_out_of_several_untitled_ones() {
        let candidates = titles(&[None, Some("Calculator"), None]);
        assert_eq!(unique_title_fallback(&candidates, "Calculator", 1), Some(1));
    }
}
