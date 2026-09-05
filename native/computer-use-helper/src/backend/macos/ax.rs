use std::collections::VecDeque;
use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::OnceLock;

use objc2_core_foundation::{
    CFArray, CFBoolean, CFNumber, CFRetained, CFString, CFType, CGPoint, CGSize,
};

use crate::backend::{CancelToken, capability_unavailable};
use crate::elements::{MAX_TREE_BYTES, Snapshot, SnapshotCache, canonical_role, render_tree};
use crate::protocol::actions::{
    AccessibilityState, Delivery, DeliveryTarget, ElementAction, ElementBounds, ElementInfo,
    FindElementsInput, FindElementsResult, InteractiveResult, Refusal, RefusalCode, Route,
    Verified,
};
use crate::protocol::window::WindowInfo;
use crate::protocol::{HelperError, Result};

const AX_SUCCESS: i32 = 0;
const AX_VALUE_POINT: u32 = 1;
const AX_VALUE_SIZE: u32 = 2;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXUIElementCreateApplication(pid: libc::pid_t) -> *mut c_void;
    fn AXUIElementCopyAttributeValue(
        element: *const c_void,
        attribute: *const CFString,
        value: *mut *mut CFType,
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

fn bool_attribute(element: &AxElement, name: &str) -> Option<bool> {
    copy_attribute(element, name)?
        .downcast::<CFBoolean>()
        .ok()
        .map(|value| value.as_bool())
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

fn mapped_actions(element: &AxElement, role: &str, native: &[String]) -> Vec<ElementAction> {
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
    if is_settable(element, "AXExpanded") {
        actions.extend([ElementAction::Expand, ElementAction::Collapse]);
    }
    if is_settable(element, "AXValue") {
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
    let role = string_attribute(element, "AXRole").unwrap_or_else(|| "AXUnknown".into());
    let title = string_attribute(element, "AXTitle");
    let description = string_attribute(element, "AXDescription");
    let name = title.or(description);
    let point = position(element).unwrap_or(CGPoint::ZERO);
    let size = size(element).unwrap_or(CGSize::ZERO);
    let native_actions = action_names(element);
    let actions = mapped_actions(element, &role, &native_actions);
    let children = array_attribute(element, "AXChildren");
    (
        ElementInfo {
            id: String::new(),
            role: canonical_role(&role),
            name,
            value: value_string(element),
            automation_id: string_attribute(element, "AXIdentifier"),
            bounds: ElementBounds {
                x: point.x.round() as i32 - window.x,
                y: point.y.round() as i32 - window.y,
                width: size.width.round().max(0.0) as i32,
                height: size.height.round().max(0.0) as i32,
            },
            enabled: bool_attribute(element, "AXEnabled").unwrap_or(true),
            focused: bool_attribute(element, "AXFocused").unwrap_or(false),
            offscreen: !bool_attribute(element, "AXVisible").unwrap_or(true),
            actions,
            depth,
        },
        children,
    )
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

fn is_chromium(window: &WindowInfo) -> bool {
    let app = window.app.to_ascii_lowercase();
    app.contains("chrome")
        || app.contains("chromium")
        || app.contains("microsoft edge")
        || std::path::Path::new(&window.app)
            .join("Contents/Frameworks/Electron Framework.framework")
            .is_dir()
}

fn enable_manual_accessibility(application: &AxElement) -> bool {
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

fn find_window(application: &AxElement, window: &WindowInfo) -> Option<AxElement> {
    array_attribute(application, "AXWindows")
        .into_iter()
        .find(|element| same_window(element, window))
}

fn resolve(window: &WindowInfo) -> Result<AxElement> {
    let pid = window.pid.ok_or_else(HelperError::window_unavailable)?;
    let application = application(pid)?;
    if let Some(element) = find_window(&application, window) {
        return Ok(element);
    }
    if is_chromium(window) && enable_manual_accessibility(&application) {
        return find_window(&application, window).ok_or_else(HelperError::window_unavailable);
    }
    Err(HelperError::window_unavailable())
}

fn walk_snapshot(
    window: &WindowInfo,
    root: AxElement,
    max_nodes: usize,
    cancel: &CancelToken,
) -> Result<Snapshot<AxElement>> {
    let mut snapshot = Snapshot::new(window.id);
    let mut discovered = Vec::new();
    let mut queue = VecDeque::from([(root, 0u32, Vec::<usize>::new())]);
    while let Some((element, depth, path)) = queue.pop_front() {
        cancel.check()?;
        if discovered.len() >= max_nodes {
            snapshot.truncated = true;
            break;
        }
        let (info, children) = element_info(&element, window, depth);
        discovered.push((path.clone(), info, element));
        for (child_index, child) in children.into_iter().enumerate() {
            if discovered.len() + queue.len() >= max_nodes {
                snapshot.truncated = true;
                break;
            }
            let mut child_path = path.clone();
            child_path.push(child_index);
            queue.push_back((child, depth + 1, child_path));
        }
    }
    discovered.sort_by(|left, right| left.0.cmp(&right.0));
    for (_, info, handle) in discovered {
        snapshot.push(info, handle);
    }
    Ok(snapshot)
}

fn build_snapshot(
    window: &WindowInfo,
    max_nodes: usize,
    cancel: &CancelToken,
) -> Result<Snapshot<AxElement>> {
    ensure_trusted()?;
    let mut snapshot = walk_snapshot(window, resolve(window)?, max_nodes, cancel)?;
    if snapshot.elements.len() == 1 && is_chromium(window) {
        let pid = window.pid.ok_or_else(HelperError::window_unavailable)?;
        let application = application(pid)?;
        if enable_manual_accessibility(&application)
            && let Some(root) = find_window(&application, window)
        {
            snapshot = walk_snapshot(window, root, max_nodes, cancel)?;
        }
    }
    Ok(snapshot)
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
    let (tree, text_truncated) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
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
            let (elements, filtered_truncated) = snapshot.find(input);
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

pub fn invoke_element(
    cache: &SnapshotCache<AxElement>,
    window: &WindowInfo,
    element_id: &str,
    requested: ElementAction,
) -> Result<InteractiveResult> {
    if !is_trusted() {
        return Ok(permission_refusal(window));
    }
    let (element_info, element, moved) = match cached_element(cache, window, element_id) {
        Ok(cached) => cached,
        Err(refusal) => return Ok(InteractiveResult::refused(window.clone(), refusal)),
    };
    if !element_info.actions.contains(&requested)
        && !(requested == ElementAction::Toggle
            && element_info.actions.contains(&ElementAction::Invoke))
    {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::element_action_unsupported(requested),
        ));
    }
    let performed = match requested {
        ElementAction::Invoke
        | ElementAction::Click
        | ElementAction::Toggle
        | ElementAction::Select => perform(&element, "AXPress") || perform(&element, "AXConfirm"),
        ElementAction::ContextMenu => perform(&element, "AXShowMenu"),
        ElementAction::Scroll => perform(&element, "AXScrollToVisible"),
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
    Ok(InteractiveResult::delivered(
        window.clone(),
        delivery(&element_info, element_id, Verified::Confirmed, moved),
    ))
}

pub fn set_element_value(
    cache: &SnapshotCache<AxElement>,
    window: &WindowInfo,
    element_id: &str,
    value: &str,
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
    let current_value = value_string(&element);
    let verified = if current_value.as_deref() == Some(requested_value) {
        Verified::Confirmed
    } else if current_value == previous_value {
        Verified::Unchanged
    } else {
        Verified::Unverified
    };
    Ok(InteractiveResult::delivered(
        window.clone(),
        delivery(&element_info, element_id, verified, moved),
    ))
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

pub fn press_at_position(
    window: &WindowInfo,
    screen_x: f64,
    screen_y: f64,
) -> Result<Option<DeliveryTarget>> {
    ensure_trusted()?;
    let pid = window.pid.ok_or_else(HelperError::window_unavailable)?;
    let application = application(pid)?;
    let mut element = std::ptr::null_mut();
    // SAFETY: The application is live and `element` is a writable Create-rule output.
    let status = unsafe {
        AXUIElementCopyElementAtPosition(application.as_ptr(), screen_x, screen_y, &mut element)
    };
    if status != AX_SUCCESS {
        return Ok(None);
    }
    let Some(element) = AxElement::from_created(element) else {
        return Ok(None);
    };
    if !belongs_to_window(&element, window) || !perform(&element, "AXPress") {
        return Ok(None);
    }
    Ok(Some(DeliveryTarget {
        kind: "ax".into(),
        id: window_id(&element)
            .map(|id| id.to_string())
            .unwrap_or_else(|| "position".into()),
        role: string_attribute(&element, "AXRole").map(|role| canonical_role(&role)),
        name: string_attribute(&element, "AXTitle")
            .or_else(|| string_attribute(&element, "AXDescription")),
    }))
}
