use std::collections::VecDeque;
use std::mem::ManuallyDrop;
use std::ptr::NonNull;

use windows::Win32::Foundation::{POINT, RECT, RPC_E_CHANGED_MODE};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree,
    CoUninitialize, SAFEARRAY,
};
use windows::Win32::System::Ole::SafeArrayDestroy;
use windows::Win32::System::Variant::{
    VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_ARRAY, VT_I4, VariantClear,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation8, IUIAutomation, IUIAutomation2, IUIAutomationCacheRequest, IUIAutomationElement,
    IUIAutomationExpandCollapsePattern, IUIAutomationInvokePattern,
    IUIAutomationSelectionItemPattern, IUIAutomationTogglePattern, IUIAutomationValuePattern,
    TreeScope_Element, TreeScope_Subtree, UIA_AppBarControlTypeId, UIA_AutomationIdPropertyId,
    UIA_BoundingRectanglePropertyId, UIA_ButtonControlTypeId, UIA_CalendarControlTypeId,
    UIA_CheckBoxControlTypeId, UIA_ComboBoxControlTypeId, UIA_ControlTypePropertyId,
    UIA_CustomControlTypeId, UIA_DataGridControlTypeId, UIA_DataItemControlTypeId,
    UIA_DocumentControlTypeId, UIA_EditControlTypeId, UIA_ExpandCollapsePatternId,
    UIA_GroupControlTypeId, UIA_HasKeyboardFocusPropertyId, UIA_HeaderControlTypeId,
    UIA_HeaderItemControlTypeId, UIA_HyperlinkControlTypeId, UIA_ImageControlTypeId,
    UIA_InvokePatternId, UIA_IsEnabledPropertyId, UIA_IsOffscreenPropertyId,
    UIA_IsPasswordPropertyId, UIA_ListControlTypeId, UIA_ListItemControlTypeId,
    UIA_MenuBarControlTypeId, UIA_MenuControlTypeId, UIA_MenuItemControlTypeId, UIA_NamePropertyId,
    UIA_PaneControlTypeId, UIA_ProgressBarControlTypeId, UIA_RadioButtonControlTypeId,
    UIA_RuntimeIdPropertyId, UIA_ScrollBarControlTypeId, UIA_SelectionItemPatternId,
    UIA_SeparatorControlTypeId, UIA_SliderControlTypeId, UIA_SpinnerControlTypeId,
    UIA_SplitButtonControlTypeId, UIA_StatusBarControlTypeId, UIA_TabControlTypeId,
    UIA_TabItemControlTypeId, UIA_TableControlTypeId, UIA_TextControlTypeId,
    UIA_ThumbControlTypeId, UIA_TitleBarControlTypeId, UIA_TogglePatternId,
    UIA_ToolBarControlTypeId, UIA_ToolTipControlTypeId, UIA_TreeControlTypeId,
    UIA_TreeItemControlTypeId, UIA_ValuePatternId, UIA_ValueValuePropertyId,
    UIA_WindowControlTypeId,
};
use windows::core::{BSTR, Interface as _};

use crate::backend::CancelToken;
use crate::elements::{MAX_TREE_BYTES, Snapshot, SnapshotCache, render_tree};
use crate::geometry::frame_to_screen;
use crate::protocol::actions::{
    AccessibilityState, Delivery, DeliveryTarget, ElementAction, ElementBounds, ElementInfo,
    FindElementsInput, FindElementsResult, InteractiveResult, Refusal, Route, Verified,
};
use crate::protocol::window::WindowInfo;
use crate::protocol::{HelperError, Result};

use super::window_list::hwnd_from_id;

struct ComGuard(bool);

struct SafeArrayGuard(NonNull<SAFEARRAY>);

impl Drop for SafeArrayGuard {
    fn drop(&mut self) {
        // SAFETY: this guard owns the SAFEARRAY returned by UI Automation.
        let _ = unsafe { SafeArrayDestroy(self.0.as_ptr()) };
    }
}

struct VariantGuard(VARIANT);

impl Drop for VariantGuard {
    fn drop(&mut self) {
        // SAFETY: this guard owns the array-valued VARIANT constructed below.
        let _ = unsafe { VariantClear(&mut self.0) };
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            // SAFETY: this thread successfully called CoInitializeEx and has not
            // balanced that call yet.
            unsafe { CoUninitialize() };
        }
    }
}

fn automation() -> Result<(ComGuard, IUIAutomation)> {
    // SAFETY: the request worker is a fresh native thread and passes no reserved
    // pointer. A changed-mode result means COM was already initialized elsewhere.
    let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let owns_initialization = if initialized.is_ok() {
        true
    } else if initialized == RPC_E_CHANGED_MODE {
        false
    } else {
        return Err(HelperError::internal(format!(
            "CoInitializeEx failed: {initialized:?}"
        )));
    };
    let guard = ComGuard(owns_initialization);
    // SAFETY: CUIAutomation8 is an in-process COM class and COM is initialized
    // for the current worker thread for the lifetime of the returned guard.
    let automation = unsafe {
        CoCreateInstance::<_, IUIAutomation>(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)
    }
    .map_err(|error| HelperError::internal(format!("UI Automation unavailable: {error}")))?;
    let automation2 = automation
        .cast::<IUIAutomation2>()
        .map_err(|error| HelperError::internal(format!("UI Automation 2 unavailable: {error}")))?;
    // SAFETY: the UIA client is local to this request. Disabling its default
    // action-time focus change is what keeps Invoke/Value patterns background-only.
    unsafe { automation2.SetAutoSetFocus(false) }
        .map_err(|error| HelperError::internal(format!("Disable UIA auto-focus: {error}")))?;
    Ok((guard, automation))
}

fn optional_bstr(value: windows::core::Result<BSTR>) -> Option<String> {
    value
        .ok()
        .map(|value| value.to_string())
        .filter(|value| !value.is_empty())
}

fn snapshot_cache_request(automation: &IUIAutomation) -> Option<IUIAutomationCacheRequest> {
    // SAFETY: the cache request is local to this UIA client and contains only
    // standard properties and patterns read by `cached_element_info`.
    unsafe {
        let request = automation.CreateCacheRequest().ok()?;
        for property in [
            UIA_AutomationIdPropertyId,
            UIA_BoundingRectanglePropertyId,
            UIA_ControlTypePropertyId,
            UIA_HasKeyboardFocusPropertyId,
            UIA_IsEnabledPropertyId,
            UIA_IsOffscreenPropertyId,
            UIA_IsPasswordPropertyId,
            UIA_NamePropertyId,
            UIA_ValueValuePropertyId,
        ] {
            request.AddProperty(property).ok()?;
        }
        for pattern in [
            UIA_InvokePatternId,
            UIA_TogglePatternId,
            UIA_SelectionItemPatternId,
            UIA_ExpandCollapsePatternId,
            UIA_ValuePatternId,
        ] {
            request.AddPattern(pattern).ok()?;
        }
        request.SetTreeScope(TreeScope_Element).ok()?;
        Some(request)
    }
}

fn role_name(control_type: windows::Win32::UI::Accessibility::UIA_CONTROLTYPE_ID) -> String {
    let role = if control_type == UIA_ButtonControlTypeId {
        "button"
    } else if control_type == UIA_CalendarControlTypeId {
        "calendar"
    } else if control_type == UIA_CheckBoxControlTypeId {
        "checkbox"
    } else if control_type == UIA_ComboBoxControlTypeId {
        "combobox"
    } else if control_type == UIA_EditControlTypeId {
        "edit"
    } else if control_type == UIA_HyperlinkControlTypeId {
        "link"
    } else if control_type == UIA_ImageControlTypeId {
        "image"
    } else if control_type == UIA_ListItemControlTypeId {
        "listitem"
    } else if control_type == UIA_ListControlTypeId {
        "list"
    } else if control_type == UIA_MenuControlTypeId {
        "menu"
    } else if control_type == UIA_MenuBarControlTypeId {
        "menubar"
    } else if control_type == UIA_MenuItemControlTypeId {
        "menuitem"
    } else if control_type == UIA_ProgressBarControlTypeId {
        "progressbar"
    } else if control_type == UIA_RadioButtonControlTypeId {
        "radiobutton"
    } else if control_type == UIA_ScrollBarControlTypeId {
        "scrollbar"
    } else if control_type == UIA_SliderControlTypeId {
        "slider"
    } else if control_type == UIA_SpinnerControlTypeId {
        "spinner"
    } else if control_type == UIA_StatusBarControlTypeId {
        "statusbar"
    } else if control_type == UIA_TabControlTypeId {
        "tablist"
    } else if control_type == UIA_TabItemControlTypeId {
        "tab"
    } else if control_type == UIA_TextControlTypeId {
        "text"
    } else if control_type == UIA_ToolBarControlTypeId {
        "toolbar"
    } else if control_type == UIA_ToolTipControlTypeId {
        "tooltip"
    } else if control_type == UIA_TreeControlTypeId {
        "tree"
    } else if control_type == UIA_TreeItemControlTypeId {
        "treeitem"
    } else if control_type == UIA_CustomControlTypeId {
        "custom"
    } else if control_type == UIA_GroupControlTypeId {
        "group"
    } else if control_type == UIA_ThumbControlTypeId {
        "thumb"
    } else if control_type == UIA_DataGridControlTypeId {
        "datagrid"
    } else if control_type == UIA_DataItemControlTypeId {
        "row"
    } else if control_type == UIA_DocumentControlTypeId {
        "document"
    } else if control_type == UIA_SplitButtonControlTypeId {
        "splitbutton"
    } else if control_type == UIA_WindowControlTypeId {
        "window"
    } else if control_type == UIA_PaneControlTypeId {
        "pane"
    } else if control_type == UIA_HeaderControlTypeId {
        "header"
    } else if control_type == UIA_HeaderItemControlTypeId {
        "headeritem"
    } else if control_type == UIA_TableControlTypeId {
        "table"
    } else if control_type == UIA_TitleBarControlTypeId {
        "titlebar"
    } else if control_type == UIA_SeparatorControlTypeId {
        "separator"
    } else if control_type == UIA_AppBarControlTypeId {
        "appbar"
    } else {
        "unknown"
    };
    role.to_string()
}

/// Which action patterns an element exposes. The live and cached readers probe
/// these differently but must classify them identically.
struct ElementPatterns {
    invoke: bool,
    toggle: bool,
    select: bool,
    expand_collapse: bool,
    set_value: bool,
}

/// Action order is part of the element contract an agent sees, so it is derived
/// once for both the live and the cached reader.
fn element_actions(patterns: &ElementPatterns, rect: RECT) -> Vec<ElementAction> {
    let mut actions = Vec::new();
    if patterns.invoke {
        actions.push(ElementAction::Invoke);
    }
    if patterns.toggle {
        actions.push(ElementAction::Toggle);
    }
    if patterns.select {
        actions.push(ElementAction::Select);
    }
    if patterns.expand_collapse {
        actions.push(ElementAction::Expand);
        actions.push(ElementAction::Collapse);
    }
    if patterns.set_value {
        actions.push(ElementAction::SetValue);
    }
    if rect.right > rect.left && rect.bottom > rect.top {
        actions.push(ElementAction::Click);
    }
    actions
}

fn element_info(element: &IUIAutomationElement, window: &WindowInfo, depth: u32) -> ElementInfo {
    // SAFETY: all UIA property and pattern calls are read-only on a live COM
    // interface obtained from the current tree walk. Failures become defaults.
    unsafe {
        let rect = element.CurrentBoundingRectangle().unwrap_or_default();
        let password = element
            .CurrentIsPassword()
            .is_ok_and(|value| value.as_bool());
        let value_pattern = (!password)
            .then(|| element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId))
            .and_then(std::result::Result::ok);
        let actions = element_actions(
            &ElementPatterns {
                invoke: element
                    .GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId)
                    .is_ok(),
                toggle: element
                    .GetCurrentPatternAs::<IUIAutomationTogglePattern>(UIA_TogglePatternId)
                    .is_ok(),
                select: element
                    .GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(
                        UIA_SelectionItemPatternId,
                    )
                    .is_ok(),
                expand_collapse: element
                    .GetCurrentPatternAs::<IUIAutomationExpandCollapsePattern>(
                        UIA_ExpandCollapsePatternId,
                    )
                    .is_ok(),
                set_value: value_pattern.is_some(),
            },
            rect,
        );
        ElementInfo {
            id: String::new(),
            role: role_name(element.CurrentControlType().unwrap_or_default()),
            name: optional_bstr(element.CurrentName()),
            value: value_pattern.and_then(|pattern| optional_bstr(pattern.CurrentValue())),
            automation_id: optional_bstr(element.CurrentAutomationId()),
            bounds: ElementBounds {
                x: rect.left - window.x,
                y: rect.top - window.y,
                width: (rect.right - rect.left).max(0),
                height: (rect.bottom - rect.top).max(0),
            },
            enabled: element
                .CurrentIsEnabled()
                .is_ok_and(|value| value.as_bool()),
            focused: element
                .CurrentHasKeyboardFocus()
                .is_ok_and(|value| value.as_bool()),
            offscreen: element
                .CurrentIsOffscreen()
                .is_ok_and(|value| value.as_bool()),
            actions,
            depth,
        }
    }
}

fn cached_element_info(
    element: &IUIAutomationElement,
    window: &WindowInfo,
    depth: u32,
) -> ElementInfo {
    // SAFETY: the element was returned by a BuildCache call using the request
    // from `snapshot_cache_request`. Missing provider values become defaults.
    unsafe {
        let rect = element.CachedBoundingRectangle().unwrap_or_default();
        let password = element
            .CachedIsPassword()
            .is_ok_and(|value| value.as_bool());
        let value_pattern = (!password)
            .then(|| element.GetCachedPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId))
            .and_then(std::result::Result::ok);
        let actions = element_actions(
            &ElementPatterns {
                invoke: element
                    .GetCachedPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId)
                    .is_ok(),
                toggle: element
                    .GetCachedPatternAs::<IUIAutomationTogglePattern>(UIA_TogglePatternId)
                    .is_ok(),
                select: element
                    .GetCachedPatternAs::<IUIAutomationSelectionItemPattern>(
                        UIA_SelectionItemPatternId,
                    )
                    .is_ok(),
                expand_collapse: element
                    .GetCachedPatternAs::<IUIAutomationExpandCollapsePattern>(
                        UIA_ExpandCollapsePatternId,
                    )
                    .is_ok(),
                set_value: value_pattern.is_some(),
            },
            rect,
        );
        ElementInfo {
            id: String::new(),
            role: role_name(element.CachedControlType().unwrap_or_default()),
            name: optional_bstr(element.CachedName()),
            value: value_pattern.and_then(|pattern| optional_bstr(pattern.CachedValue())),
            automation_id: optional_bstr(element.CachedAutomationId()),
            bounds: ElementBounds {
                x: rect.left - window.x,
                y: rect.top - window.y,
                width: (rect.right - rect.left).max(0),
                height: (rect.bottom - rect.top).max(0),
            },
            enabled: element.CachedIsEnabled().is_ok_and(|value| value.as_bool()),
            focused: element
                .CachedHasKeyboardFocus()
                .is_ok_and(|value| value.as_bool()),
            offscreen: element
                .CachedIsOffscreen()
                .is_ok_and(|value| value.as_bool()),
            actions,
            depth,
        }
    }
}

fn runtime_id(automation: &IUIAutomation, element: &IUIAutomationElement) -> Result<Vec<i32>> {
    // SAFETY: GetRuntimeId returns an owned SAFEARRAY. UI Automation allocates
    // the converted native array with CoTaskMemAlloc; both allocations are
    // released before returning.
    unsafe {
        let array = element
            .GetRuntimeId()
            .map_err(|error| HelperError::internal(format!("GetRuntimeId failed: {error}")))?;
        let array = NonNull::new(array)
            .map(SafeArrayGuard)
            .ok_or_else(|| HelperError::internal("GetRuntimeId returned null"))?;
        let mut values = std::ptr::null_mut();
        let count = automation
            .IntSafeArrayToNativeArray(array.0.as_ptr(), &mut values)
            .map_err(|error| HelperError::internal(format!("Convert RuntimeId failed: {error}")))?;
        let values = NonNull::new(values)
            .ok_or_else(|| HelperError::internal("RuntimeId conversion returned null"))?;
        let result = std::slice::from_raw_parts(values.as_ptr(), count.max(0) as usize).to_vec();
        CoTaskMemFree(Some(values.as_ptr().cast()));
        if result.is_empty() {
            return Err(HelperError::internal(
                "UI Automation returned an empty RuntimeId",
            ));
        }
        Ok(result)
    }
}

fn runtime_id_variant(automation: &IUIAutomation, runtime_id: &[i32]) -> Result<VariantGuard> {
    // SAFETY: IntNativeArrayToSafeArray copies the bounded slice into a new
    // SAFEARRAY. VariantClear owns and releases that array through VariantGuard.
    let array = unsafe { automation.IntNativeArrayToSafeArray(runtime_id) }.map_err(|error| {
        HelperError::internal(format!("Create RuntimeId array failed: {error}"))
    })?;
    if array.is_null() {
        return Err(HelperError::internal(
            "Create RuntimeId array returned null",
        ));
    }
    Ok(VariantGuard(VARIANT {
        Anonymous: VARIANT_0 {
            Anonymous: ManuallyDrop::new(VARIANT_0_0 {
                vt: VT_ARRAY | VT_I4,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: VARIANT_0_0_0 { parray: array },
            }),
        },
    }))
}

fn build_snapshot(
    window: &WindowInfo,
    max_nodes: usize,
    cancel: &CancelToken,
) -> Result<Snapshot<Vec<i32>>> {
    let (_guard, automation) = automation()?;
    if let Some(request) = snapshot_cache_request(&automation) {
        // SAFETY: the HWND was resolved immediately before this call; returned UIA
        // interfaces are reference-counted and stored in the snapshot cache.
        let cached_root =
            unsafe { automation.ElementFromHandleBuildCache(hwnd_from_id(window.id), &request) };
        if let Ok(root) = cached_root
            && let Some(snapshot) =
                traverse_snapshot(&automation, root, window, max_nodes, cancel, Some(&request))?
        {
            return Ok(snapshot);
        }
    }

    // Cached UIA access is an optimization. Providers that reject BuildCache
    // must retain the ordinary traversal behavior.
    // SAFETY: the HWND was resolved immediately before this call and the
    // returned interface is reference-counted.
    let root = unsafe { automation.ElementFromHandle(hwnd_from_id(window.id)) }
        .map_err(|error| HelperError::internal(format!("ElementFromHandle failed: {error}")))?;
    traverse_snapshot(&automation, root, window, max_nodes, cancel, None)?.ok_or_else(|| {
        HelperError::internal("uncached UI Automation traversal unexpectedly requested a retry")
    })
}

fn traverse_snapshot(
    automation: &IUIAutomation,
    root: IUIAutomationElement,
    window: &WindowInfo,
    max_nodes: usize,
    cancel: &CancelToken,
    cache_request: Option<&IUIAutomationCacheRequest>,
) -> Result<Option<Snapshot<Vec<i32>>>> {
    // SAFETY: ControlViewWalker returns a reference-counted walker owned locally.
    let walker = unsafe { automation.ControlViewWalker() }
        .map_err(|error| HelperError::internal(format!("ControlViewWalker failed: {error}")))?;
    let mut snapshot = Snapshot::new(window.id);
    let mut discovered = Vec::new();
    let mut queue = VecDeque::from([(root, 0u32, Vec::<usize>::new())]);
    let mut cache_unavailable = false;
    while let Some((element, depth, path)) = queue.pop_front() {
        cancel.check()?;
        if discovered.len() >= max_nodes {
            snapshot.truncated = true;
            break;
        }
        discovered.push((
            path.clone(),
            if cache_request.is_some() {
                cached_element_info(&element, window, depth)
            } else {
                element_info(&element, window, depth)
            },
            runtime_id(automation, &element),
        ));

        // SAFETY: walker navigation only reads the current UIA tree. A missing
        // child/sibling is represented by an error/null interface and ends that branch.
        let mut child = if let Some(request) = cache_request {
            // SAFETY: `element` is a live element from this walker traversal,
            // and the cache request remains alive for the call.
            let cached_child = unsafe { walker.GetFirstChildElementBuildCache(&element, request) };
            match cached_child {
                Ok(child) => Some(child),
                Err(error) if error.code().0 == 0 => None,
                Err(_) => {
                    cache_unavailable = true;
                    None
                }
            }
        } else {
            // SAFETY: `element` is a live element from this walker traversal.
            unsafe { walker.GetFirstChildElement(&element) }.ok()
        };
        if cache_unavailable {
            break;
        }
        let mut child_index = 0usize;
        while let Some(current) = child {
            if discovered.len() + queue.len() >= max_nodes {
                snapshot.truncated = true;
                break;
            }
            let mut child_path = path.clone();
            child_path.push(child_index);
            queue.push_back((current.clone(), depth + 1, child_path));
            child_index += 1;
            // SAFETY: `current` is a live element from this walker traversal.
            child = if let Some(request) = cache_request {
                // SAFETY: the cache request remains alive for the call.
                let cached_sibling =
                    unsafe { walker.GetNextSiblingElementBuildCache(&current, request) };
                match cached_sibling {
                    Ok(sibling) => Some(sibling),
                    Err(error) if error.code().0 == 0 => None,
                    Err(_) => {
                        cache_unavailable = true;
                        None
                    }
                }
            } else {
                // SAFETY: `current` is a live element from this walker traversal.
                unsafe { walker.GetNextSiblingElement(&current) }.ok()
            };
        }
        if cache_unavailable {
            break;
        }
    }
    if cache_unavailable {
        return Ok(None);
    }
    discovered.sort_by(|left, right| left.0.cmp(&right.0));
    for (path, info, handle) in discovered {
        match handle {
            Ok(handle) => {
                snapshot.push(info, handle);
            }
            Err(error) if path.is_empty() => return Err(error),
            // An unaddressable child must not hide the rest of the window.
            Err(_) => snapshot.truncated = true,
        }
    }
    Ok(Some(snapshot))
}

fn accessibility(snapshot: &Snapshot<Vec<i32>>) -> AccessibilityState {
    let (tree, text_truncated) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
    AccessibilityState {
        source: "uia".into(),
        tree,
        snapshot_id: snapshot.id.clone(),
        element_count: snapshot.elements.len(),
        truncated: snapshot.truncated || text_truncated,
    }
}

pub fn snapshot_tree(
    cache: &SnapshotCache<Vec<i32>>,
    window: &WindowInfo,
    max_nodes: usize,
    cancel: &CancelToken,
) -> Result<AccessibilityState> {
    let snapshot = build_snapshot(window, max_nodes, cancel)?;
    let state = accessibility(&snapshot);
    cache.insert(snapshot);
    Ok(state)
}

pub fn find_elements(
    cache: &SnapshotCache<Vec<i32>>,
    window: &WindowInfo,
    input: &FindElementsInput,
    cancel: &CancelToken,
) -> Result<FindElementsResult> {
    let snapshot_id = if let Some(snapshot_id) = input.snapshot_id.as_deref() {
        snapshot_id.to_string()
    } else {
        let snapshot = build_snapshot(window, 2_000, cancel)?;
        let id = snapshot.id.clone();
        cache.insert(snapshot);
        id
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

pub fn lookup_element(
    cache: &SnapshotCache<Vec<i32>>,
    window: &WindowInfo,
    element_id: &str,
) -> std::result::Result<(ElementInfo, Vec<i32>), Refusal> {
    cache
        .with_element(element_id, |snapshot, index| {
            (snapshot.window_id == window.id).then(|| {
                (
                    snapshot.elements[index].clone(),
                    snapshot.handles[index].clone(),
                )
            })
        })
        .flatten()
        .ok_or_else(Refusal::stale_snapshot)
}

fn resolve_runtime_id(
    window: &WindowInfo,
    runtime_id: &[i32],
) -> Result<(ComGuard, IUIAutomationElement)> {
    let (guard, automation) = automation()?;
    // SAFETY: the HWND is freshly resolved. The property condition copies the
    // array-valued RuntimeId, and FindFirst is constrained to this window root.
    let root = unsafe { automation.ElementFromHandle(hwnd_from_id(window.id)) }
        .map_err(|error| HelperError::internal(format!("ElementFromHandle failed: {error}")))?;
    let value = runtime_id_variant(&automation, runtime_id)?;
    // SAFETY: the VARIANT owns a valid VT_ARRAY|VT_I4 RuntimeId for this call.
    let condition =
        unsafe { automation.CreatePropertyCondition(UIA_RuntimeIdPropertyId, &value.0) }.map_err(
            |error| HelperError::internal(format!("RuntimeId condition failed: {error}")),
        )?;
    // SAFETY: the root and condition are live reference-counted UIA objects.
    let element = unsafe { root.FindFirst(TreeScope_Subtree, &condition) }
        .map_err(|_| HelperError::window_unavailable())?;
    Ok((guard, element))
}

fn same_element(cached: &ElementInfo, live: &ElementInfo) -> bool {
    cached.role == live.role
        && match cached.automation_id.as_deref() {
            Some(id) => live.automation_id.as_deref() == Some(id),
            None => cached.name == live.name,
        }
}

fn contains_point(element: &ElementInfo, x: f64, y: f64) -> bool {
    x >= f64::from(element.bounds.x)
        && y >= f64::from(element.bounds.y)
        && x < f64::from(element.bounds.x + element.bounds.width)
        && y < f64::from(element.bounds.y + element.bounds.height)
}

pub fn live_element_info(
    cache: &SnapshotCache<Vec<i32>>,
    window: &WindowInfo,
    element_id: &str,
) -> std::result::Result<(ElementInfo, bool), Refusal> {
    let (cached, runtime_id) = lookup_element(cache, window, element_id)?;
    let (_guard, element) =
        resolve_runtime_id(window, &runtime_id).map_err(|_| Refusal::stale_snapshot())?;
    let live = element_info(&element, window, cached.depth);
    if !same_element(&cached, &live) {
        return Err(Refusal::stale_snapshot());
    }
    let moved = cached.bounds != live.bounds;
    Ok((live, moved))
}

fn delivery(element: &ElementInfo, element_id: &str) -> Delivery {
    Delivery::background(Route::Accessibility)
        .with_verified(Verified::Confirmed)
        .with_target(DeliveryTarget {
            kind: "uia".into(),
            id: element_id.into(),
            role: Some(element.role.clone()),
            name: element.name.clone(),
        })
}

fn invoke_or_toggle(element: &IUIAutomationElement) -> windows::core::Result<()> {
    // SAFETY: the element is freshly resolved and each queried UIA pattern is
    // reference-counted for the duration of the synchronous action.
    unsafe {
        if let Ok(pattern) =
            element.GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId)
        {
            return pattern.Invoke();
        }
        element
            .GetCurrentPatternAs::<IUIAutomationTogglePattern>(UIA_TogglePatternId)?
            .Toggle()
    }
}

pub fn invoke_at_position(
    cache: &SnapshotCache<Vec<i32>>,
    window: &WindowInfo,
    x: f64,
    y: f64,
    cancel: &CancelToken,
) -> Result<Option<InteractiveResult>> {
    cancel.check()?;
    let (_guard, automation) = automation()?;
    let (screen_x, screen_y) = frame_to_screen(window, x, y);
    // SAFETY: the screen coordinate was bounded to the requested window frame
    // before backend dispatch; UIA returns a reference-counted topmost element.
    let element = match unsafe {
        automation.ElementFromPoint(POINT {
            x: screen_x,
            y: screen_y,
        })
    } {
        Ok(element) if belongs_to_window(&automation, &element, window) => element,
        _ => return Ok(None),
    };
    let info = element_info(&element, window, 0);
    if !info.enabled
        || info.offscreen
        || !contains_point(&info, x, y)
        || (!info.actions.contains(&ElementAction::Invoke)
            && !info.actions.contains(&ElementAction::Toggle))
    {
        return Ok(None);
    }
    let mut snapshot = Snapshot::new(window.id);
    snapshot.push(info, runtime_id(&automation, &element)?);
    let info = snapshot.elements[0].clone();
    if invoke_or_toggle(&element).is_err() {
        return Ok(None);
    }
    cache.insert(snapshot);
    Ok(Some(InteractiveResult::delivered(
        window.clone(),
        delivery(&info, &info.id),
    )))
}

fn belongs_to_window(
    automation: &IUIAutomation,
    element: &IUIAutomationElement,
    window: &WindowInfo,
) -> bool {
    // SAFETY: the HWND is freshly resolved and UIA returns reference-counted
    // root/walker objects used only for read-only identity and parent queries.
    let Ok(root) = (unsafe { automation.ElementFromHandle(hwnd_from_id(window.id)) }) else {
        return false;
    };
    // SAFETY: RawViewWalker returns a reference-counted walker owned locally.
    let Ok(walker) = (unsafe { automation.RawViewWalker() }) else {
        return false;
    };
    let mut current = element.clone();
    for _ in 0..256 {
        // SAFETY: both elements are live UIA references from this automation client.
        if unsafe { automation.CompareElements(&root, &current) }.is_ok_and(|same| same.as_bool()) {
            return true;
        }
        // SAFETY: `current` is a live element and parent traversal is read-only.
        let Ok(parent) = (unsafe { walker.GetParentElement(&current) }) else {
            return false;
        };
        current = parent;
    }
    false
}

pub fn invoke_focused(window: &WindowInfo) -> Result<Option<InteractiveResult>> {
    let (_guard, automation) = automation()?;
    // SAFETY: UI Automation returns a reference-counted element. Process-id
    // and pattern queries are read-only until the explicit Invoke/Toggle call.
    let element = match unsafe { automation.GetFocusedElement() } {
        Ok(element) => element,
        Err(_) => return Ok(None),
    };
    // SAFETY: `element` is a live UIA element and this reads one scalar property.
    let process_id = unsafe { element.CurrentProcessId() }.ok();
    if process_id != window.pid.map(|pid| pid as i32)
        || !belongs_to_window(&automation, &element, window)
    {
        return Ok(None);
    }
    let info = element_info(&element, window, 0);
    if invoke_or_toggle(&element).is_err() {
        return Ok(None);
    }
    Ok(Some(InteractiveResult::delivered(
        window.clone(),
        delivery(&info, "focused"),
    )))
}

pub fn invoke_element(
    cache: &SnapshotCache<Vec<i32>>,
    window: &WindowInfo,
    element_id: &str,
    action: ElementAction,
) -> Result<InteractiveResult> {
    let (cached, runtime_id) = match lookup_element(cache, window, element_id) {
        Ok(element) => element,
        Err(refusal) => return Ok(InteractiveResult::refused(window.clone(), refusal)),
    };
    if !cached.actions.contains(&action) {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::element_action_unsupported(action),
        ));
    }
    let (_guard, element) = match resolve_runtime_id(window, &runtime_id) {
        Ok(resolved) => resolved,
        Err(_) => {
            return Ok(InteractiveResult::refused(
                window.clone(),
                Refusal::stale_snapshot(),
            ));
        }
    };
    let info = element_info(&element, window, cached.depth);
    if !same_element(&cached, &info) {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::stale_snapshot(),
        ));
    }
    // SAFETY: the freshly resolved element stays live for each pattern action.
    let result = unsafe {
        match action {
            ElementAction::Invoke => element
                .GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId)
                .and_then(|pattern| pattern.Invoke()),
            ElementAction::Toggle => element
                .GetCurrentPatternAs::<IUIAutomationTogglePattern>(UIA_TogglePatternId)
                .and_then(|pattern| pattern.Toggle()),
            ElementAction::Select => element
                .GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(
                    UIA_SelectionItemPatternId,
                )
                .and_then(|pattern| pattern.Select()),
            ElementAction::Expand => element
                .GetCurrentPatternAs::<IUIAutomationExpandCollapsePattern>(
                    UIA_ExpandCollapsePatternId,
                )
                .and_then(|pattern| pattern.Expand()),
            ElementAction::Collapse => element
                .GetCurrentPatternAs::<IUIAutomationExpandCollapsePattern>(
                    UIA_ExpandCollapsePatternId,
                )
                .and_then(|pattern| pattern.Collapse()),
            _ => {
                return Ok(InteractiveResult::refused(
                    window.clone(),
                    Refusal::element_action_unsupported(action),
                ));
            }
        }
    };
    if let Err(error) = result {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::new(
                crate::protocol::actions::RefusalCode::ElementActionUnsupported,
                format!("UI Automation could not perform {action:?}: {error}"),
                "Refresh the accessibility tree and check the element's actions, or use a coordinate click.",
            ),
        ));
    }
    Ok(InteractiveResult::delivered(
        window.clone(),
        delivery(&info, element_id),
    ))
}

pub fn set_element_value(
    cache: &SnapshotCache<Vec<i32>>,
    window: &WindowInfo,
    element_id: &str,
    value: &str,
) -> Result<InteractiveResult> {
    let (cached, runtime_id) = match lookup_element(cache, window, element_id) {
        Ok(element) => element,
        Err(refusal) => return Ok(InteractiveResult::refused(window.clone(), refusal)),
    };
    if !cached.actions.contains(&ElementAction::SetValue) {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::element_action_unsupported(ElementAction::SetValue),
        ));
    }
    let (_guard, element) = match resolve_runtime_id(window, &runtime_id) {
        Ok(resolved) => resolved,
        Err(_) => {
            return Ok(InteractiveResult::refused(
                window.clone(),
                Refusal::stale_snapshot(),
            ));
        }
    };
    let info = element_info(&element, window, cached.depth);
    if !same_element(&cached, &info) {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::stale_snapshot(),
        ));
    }
    // SAFETY: the pattern is queried from the freshly resolved element, and BSTR owns
    // the UTF-16 value for the full SetValue call.
    let read_back = unsafe {
        let pattern = element
            .GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
            .map_err(|error| HelperError::internal(format!("ValuePattern unavailable: {error}")))?;
        pattern
            .SetValue(&BSTR::from(value))
            .map_err(|error| HelperError::permission_denied(format!("SetValue failed: {error}")))?;
        pattern.CurrentValue().ok().map(|value| value.to_string())
    };
    let verified = if read_back.as_deref() == Some(value) {
        Verified::Confirmed
    } else {
        Verified::Unverified
    };
    Ok(InteractiveResult::delivered(
        window.clone(),
        delivery(&info, element_id).with_verified(verified),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn element_actions_keep_a_stable_order_for_live_and_cached_readers() {
        let patterns = ElementPatterns {
            invoke: true,
            toggle: true,
            select: true,
            expand_collapse: true,
            set_value: true,
        };
        let visible = RECT {
            left: 0,
            top: 0,
            right: 10,
            bottom: 10,
        };

        assert_eq!(
            element_actions(&patterns, visible),
            vec![
                ElementAction::Invoke,
                ElementAction::Toggle,
                ElementAction::Select,
                ElementAction::Expand,
                ElementAction::Collapse,
                ElementAction::SetValue,
                ElementAction::Click,
            ]
        );
    }

    #[test]
    fn element_actions_omit_click_for_a_zero_area_element() {
        let patterns = ElementPatterns {
            invoke: true,
            toggle: false,
            select: false,
            expand_collapse: false,
            set_value: false,
        };
        let collapsed = RECT {
            left: 5,
            top: 5,
            right: 5,
            bottom: 5,
        };

        assert_eq!(
            element_actions(&patterns, collapsed),
            vec![ElementAction::Invoke]
        );
    }

    #[test]
    fn disables_uia_action_time_focus_changes() {
        let (_guard, automation) = automation().unwrap();
        let automation2 = automation.cast::<IUIAutomation2>().unwrap();
        // SAFETY: this reads the local UIA client's boolean configuration.
        assert!(!unsafe { automation2.AutoSetFocus() }.unwrap().as_bool());
    }
}
