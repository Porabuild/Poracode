use std::collections::VecDeque;
use std::hash::{Hash, Hasher};

use atspi::connection::{AccessibilityConnection, set_session_accessibility};
use atspi::proxy::accessible::{AccessibleProxy, ObjectRefExt as _};
use atspi::proxy::action::ActionProxy;
use atspi::proxy::component::ComponentProxy;
use atspi::proxy::editable_text::EditableTextProxy;
use atspi::proxy::text::TextProxy;
use atspi::proxy::value::ValueProxy;
use atspi::{CoordType, Interface, ObjectRefOwned, ScrollType, State};
use zbus::names::BusName;
use zbus::proxy::CacheProperties;

use crate::backend::{CancelToken, capability_unavailable};
use crate::elements::{MAX_TREE_BYTES, Snapshot, SnapshotCache, canonical_role, render_tree};
use crate::protocol::actions::{
    AccessibilityState, Delivery, DeliveryTarget, ElementAction, ElementBounds, ElementInfo,
    FindElementsInput, FindElementsResult, InteractiveResult, Refusal, RefusalCode, Route,
    Verified,
};
use crate::protocol::window::{WindowInfo, WindowSource};
use crate::protocol::{HelperError, Result};

use super::is_computer_use_overlay_title;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Handle {
    bus_name: String,
    path: String,
}

#[derive(Clone)]
pub struct AccessibleWindow {
    pub info: WindowInfo,
    handle: Handle,
}

fn atspi_error(context: &str, error: impl std::fmt::Display) -> HelperError {
    HelperError::internal(format!("AT-SPI {context}: {error}"))
}

fn object_handle(reference: &ObjectRefOwned) -> Option<Handle> {
    Some(Handle {
        bus_name: reference.name()?.to_string(),
        path: reference.path().to_string(),
    })
}

fn synthetic_id(handle: &Handle) -> i64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    handle.bus_name.hash(&mut hasher);
    handle.path.hash(&mut hasher);
    -((hasher.finish() & i64::MAX as u64) as i64).max(1)
}

async fn connect() -> Result<AccessibilityConnection> {
    let _ = set_session_accessibility(true).await;
    AccessibilityConnection::new()
        .await
        .map_err(|error| atspi_error("connection", error))
}

async fn accessible<'a>(
    connection: &'a zbus::Connection,
    handle: &'a Handle,
) -> Result<AccessibleProxy<'a>> {
    AccessibleProxy::builder(connection)
        .destination(handle.bus_name.as_str())
        .map_err(|error| atspi_error("accessible destination", error))?
        .path(handle.path.as_str())
        .map_err(|error| atspi_error("accessible path", error))?
        .cache_properties(CacheProperties::No)
        .build()
        .await
        .map_err(|error| atspi_error("accessible proxy", error))
}

macro_rules! interface_proxy {
    ($name:ident, $proxy:ident, $label:literal) => {
        async fn $name<'a>(
            connection: &'a zbus::Connection,
            handle: &'a Handle,
        ) -> Result<$proxy<'a>> {
            $proxy::builder(connection)
                .destination(handle.bus_name.as_str())
                .map_err(|error| atspi_error(concat!($label, " destination"), error))?
                .path(handle.path.as_str())
                .map_err(|error| atspi_error(concat!($label, " path"), error))?
                .cache_properties(CacheProperties::No)
                .build()
                .await
                .map_err(|error| atspi_error(concat!($label, " proxy"), error))
        }
    };
}

interface_proxy!(action, ActionProxy, "action");
interface_proxy!(component, ComponentProxy, "component");
interface_proxy!(editable_text, EditableTextProxy, "editable text");
interface_proxy!(text, TextProxy, "text");
interface_proxy!(value, ValueProxy, "value");

async fn process_id(connection: &zbus::Connection, handle: &Handle) -> Option<u32> {
    let proxy = zbus::fdo::DBusProxy::new(connection).await.ok()?;
    let name = BusName::try_from(handle.bus_name.as_str()).ok()?;
    proxy.get_connection_unix_process_id(name).await.ok()
}

fn process_path(pid: Option<u32>, fallback: &str) -> String {
    pid.and_then(|pid| std::fs::read_link(format!("/proc/{pid}/exe")).ok())
        .map(|path| path.to_string_lossy().into_owned())
        .filter(|path| !path.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

async fn bounds(connection: &zbus::Connection, handle: &Handle) -> Option<(i32, i32, i32, i32)> {
    component(connection, handle)
        .await
        .ok()?
        .get_extents(CoordType::Screen)
        .await
        .ok()
}

pub async fn windows() -> Result<Vec<AccessibleWindow>> {
    let atspi = connect().await?;
    let root = atspi
        .root_accessible_on_registry()
        .await
        .map_err(|error| atspi_error("registry root", error))?;
    let applications = root
        .get_children()
        .await
        .map_err(|error| atspi_error("list applications", error))?;
    let mut windows = Vec::new();
    for application in applications {
        let Some(application_handle) = object_handle(&application) else {
            continue;
        };
        let Ok(application_proxy) = application.as_accessible_proxy(atspi.connection()).await
        else {
            continue;
        };
        let app_name = application_proxy.name().await.unwrap_or_default();
        let pid = process_id(atspi.connection(), &application_handle).await;
        let Ok(children) = application_proxy.get_children().await else {
            continue;
        };
        for child in children {
            let Some(child_handle) = object_handle(&child) else {
                continue;
            };
            let Ok(proxy) = child.as_accessible_proxy(atspi.connection()).await else {
                continue;
            };
            let role = proxy
                .get_role_name()
                .await
                .unwrap_or_default()
                .to_ascii_lowercase();
            if !["frame", "window", "dialog", "alert"]
                .iter()
                .any(|candidate| role.contains(candidate))
            {
                continue;
            }
            let Some((x, y, width, height)) = bounds(atspi.connection(), &child_handle).await
            else {
                continue;
            };
            if width <= 0 || height <= 0 {
                continue;
            }
            let state = proxy.get_state().await.unwrap_or_default();
            let title = proxy.name().await.unwrap_or_default();
            if is_computer_use_overlay_title(&title) {
                continue;
            }
            let app = process_path(pid, &app_name);
            windows.push(AccessibleWindow {
                info: WindowInfo {
                    app,
                    id: synthetic_id(&child_handle),
                    title,
                    x,
                    y,
                    width,
                    height,
                    pid,
                    display_name: (!app_name.is_empty()).then_some(app_name.clone()),
                    minimized: Some(state.contains(State::Iconified)),
                    source: Some(WindowSource::Atspi),
                },
                handle: child_handle,
            });
        }
    }
    Ok(windows)
}

pub async fn resolve(window: &WindowInfo) -> Result<AccessibleWindow> {
    let windows = windows().await?;
    windows
        .iter()
        .find(|candidate| {
            candidate.info.id == window.id && candidate.info.matches_app(Some(&window.app))
        })
        .cloned()
        .or_else(|| {
            windows.into_iter().find(|candidate| {
                candidate.info.matches_app(Some(&window.app))
                    && (window.title.is_empty() || candidate.info.title.contains(&window.title))
            })
        })
        .ok_or_else(HelperError::window_unavailable)
}

fn map_action(name: &str) -> Option<ElementAction> {
    let name = name.to_ascii_lowercase();
    if name.contains("toggle") || name.contains("check") {
        Some(ElementAction::Toggle)
    } else if name.contains("select") {
        Some(ElementAction::Select)
    } else if name.contains("collapse") {
        Some(ElementAction::Collapse)
    } else if name.contains("expand") {
        Some(ElementAction::Expand)
    } else if name.contains("showmenu") || name.contains("context") {
        Some(ElementAction::ContextMenu)
    } else if name.contains("click") || name.contains("press") || name.contains("activate") {
        Some(ElementAction::Invoke)
    } else {
        None
    }
}

fn element_role(native: &str, editable: bool) -> String {
    let role = canonical_role(native);
    if role == "text" && editable {
        "edit".into()
    } else {
        role
    }
}

async fn element_info(
    connection: &zbus::Connection,
    handle: &Handle,
    window: &WindowInfo,
    depth: u32,
) -> Result<(ElementInfo, Vec<ObjectRefOwned>)> {
    let proxy = accessible(connection, handle).await?;
    let interfaces = proxy.get_interfaces().await.unwrap_or_default();
    let state = proxy.get_state().await.unwrap_or_default();
    let name = proxy.name().await.ok().filter(|name| !name.is_empty());
    let automation_id = proxy.accessible_id().await.ok().filter(|id| !id.is_empty());
    let role = proxy
        .get_role_name()
        .await
        .unwrap_or_else(|_| "unknown".into());
    let (x, y, width, height) = if interfaces.contains(Interface::Component) {
        bounds(connection, handle).await.unwrap_or_default()
    } else {
        (0, 0, 0, 0)
    };
    let mut actions = Vec::new();
    if interfaces.contains(Interface::Action)
        && let Ok(proxy) = action(connection, handle).await
        && let Ok(native_actions) = proxy.get_actions().await
    {
        for native in native_actions {
            if let Some(mapped) = map_action(&native.name)
                && !actions.contains(&mapped)
            {
                actions.push(mapped);
            }
        }
    }
    if interfaces.contains(Interface::EditableText) || interfaces.contains(Interface::Value) {
        actions.push(ElementAction::SetValue);
    }
    if interfaces.contains(Interface::Component) {
        actions.push(ElementAction::Scroll);
    }
    let value = if interfaces.contains(Interface::Text) {
        if let Ok(proxy) = text(connection, handle).await {
            let count = proxy
                .character_count()
                .await
                .unwrap_or_default()
                .clamp(0, 2_000);
            proxy
                .get_text(0, count)
                .await
                .ok()
                .filter(|text| !text.is_empty())
        } else {
            None
        }
    } else if interfaces.contains(Interface::Value) {
        if let Ok(proxy) = value(connection, handle).await {
            proxy.text().await.ok().filter(|text| !text.is_empty())
        } else {
            None
        }
    } else {
        None
    };
    let children = proxy.get_children().await.unwrap_or_default();
    Ok((
        ElementInfo {
            id: String::new(),
            role: element_role(&role, interfaces.contains(Interface::EditableText)),
            name,
            value,
            automation_id,
            bounds: ElementBounds {
                x: x - window.x,
                y: y - window.y,
                width: width.max(0),
                height: height.max(0),
            },
            enabled: state.contains(State::Enabled) || state.contains(State::Sensitive),
            focused: state.contains(State::Focused),
            offscreen: !state.contains(State::Showing),
            actions,
            depth,
        },
        children,
    ))
}

async fn build_snapshot(
    window: &WindowInfo,
    max_nodes: usize,
    cancel: &CancelToken,
) -> Result<Snapshot<Handle>> {
    let atspi = connect().await?;
    let root = resolve(window).await?;
    let mut snapshot = Snapshot::new(window.id);
    let mut discovered = Vec::new();
    let mut queue = VecDeque::from([(root.handle, 0u32, Vec::<usize>::new())]);
    while let Some((handle, depth, path)) = queue.pop_front() {
        cancel.check()?;
        if discovered.len() >= max_nodes {
            snapshot.truncated = true;
            break;
        }
        let Ok((info, children)) = element_info(atspi.connection(), &handle, window, depth).await
        else {
            continue;
        };
        discovered.push((path.clone(), info, handle));
        for (child_index, child) in children.into_iter().enumerate() {
            let Some(handle) = object_handle(&child) else {
                continue;
            };
            if discovered.len() + queue.len() >= max_nodes {
                snapshot.truncated = true;
                break;
            }
            let mut child_path = path.clone();
            child_path.push(child_index);
            queue.push_back((handle, depth + 1, child_path));
        }
    }
    discovered.sort_by(|left, right| left.0.cmp(&right.0));
    for (_, info, handle) in discovered {
        snapshot.push(info, handle);
    }
    Ok(snapshot)
}

pub async fn snapshot_tree(
    cache: &SnapshotCache<Handle>,
    window: &WindowInfo,
    max_nodes: usize,
    cancel: &CancelToken,
) -> Result<AccessibilityState> {
    let snapshot = build_snapshot(window, max_nodes, cancel).await?;
    let (tree, text_truncated) = render_tree(&snapshot.elements, MAX_TREE_BYTES);
    let state = AccessibilityState {
        source: "atspi".into(),
        tree,
        snapshot_id: snapshot.id.clone(),
        element_count: snapshot.elements.len(),
        truncated: snapshot.truncated || text_truncated,
    };
    cache.insert(snapshot);
    Ok(state)
}

pub async fn find_elements(
    cache: &SnapshotCache<Handle>,
    window: &WindowInfo,
    input: &FindElementsInput,
    cancel: &CancelToken,
) -> Result<FindElementsResult> {
    let snapshot_id = if let Some(snapshot_id) = input.snapshot_id.as_deref() {
        snapshot_id.to_string()
    } else {
        let snapshot = build_snapshot(window, 2_000, cancel).await?;
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
    cache: &SnapshotCache<Handle>,
    window: &WindowInfo,
    element_id: &str,
) -> std::result::Result<(ElementInfo, Handle), Refusal> {
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

fn same_element(cached: &ElementInfo, live: &ElementInfo) -> bool {
    cached.role == live.role
        && match cached.automation_id.as_deref() {
            Some(id) => live.automation_id.as_deref() == Some(id),
            None => cached.name == live.name,
        }
}

async fn belongs_to_window(connection: &zbus::Connection, element: &Handle, root: &Handle) -> bool {
    let mut current = element.clone();
    for _ in 0..256 {
        if &current == root {
            return true;
        }
        let Ok(proxy) = accessible(connection, &current).await else {
            return false;
        };
        let Ok(parent) = proxy.parent().await else {
            return false;
        };
        let Some(parent) = object_handle(&parent) else {
            return false;
        };
        if parent == current {
            return false;
        }
        current = parent;
    }
    false
}

async fn live_cached_element(
    connection: &zbus::Connection,
    cache: &SnapshotCache<Handle>,
    window: &WindowInfo,
    element_id: &str,
) -> std::result::Result<(ElementInfo, Handle, bool, WindowInfo), Refusal> {
    let (cached, handle) = cached_element(cache, window, element_id)?;
    let resolved = resolve(window)
        .await
        .map_err(|_| Refusal::stale_snapshot())?;
    if !belongs_to_window(connection, &handle, &resolved.handle).await {
        return Err(Refusal::stale_snapshot());
    }
    let (live, _) = element_info(connection, &handle, &resolved.info, cached.depth)
        .await
        .map_err(|_| Refusal::stale_snapshot())?;
    if !same_element(&cached, &live) {
        return Err(Refusal::stale_snapshot());
    }
    let moved = cached.bounds != live.bounds;
    Ok((live, handle, moved, resolved.info))
}

fn delivery(element: &ElementInfo, element_id: &str, moved: bool) -> Delivery {
    let delivery = Delivery::background(Route::Accessibility)
        .with_verified(Verified::Confirmed)
        .with_target(DeliveryTarget {
            kind: "atspi".into(),
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

fn action_matches(requested: ElementAction, native: &str) -> bool {
    let native = native.to_ascii_lowercase();
    match requested {
        ElementAction::Invoke | ElementAction::Click => ["click", "press", "activate", "invoke"]
            .iter()
            .any(|name| native.contains(name)),
        ElementAction::Toggle => native.contains("toggle") || native.contains("check"),
        ElementAction::Select => native.contains("select"),
        ElementAction::Expand => native.contains("expand"),
        ElementAction::Collapse => native.contains("collapse"),
        ElementAction::ContextMenu => native.contains("showmenu") || native.contains("context"),
        _ => false,
    }
}

pub async fn invoke_element(
    cache: &SnapshotCache<Handle>,
    window: &WindowInfo,
    element_id: &str,
    requested: ElementAction,
) -> Result<InteractiveResult> {
    let atspi = connect().await?;
    let (element, handle, moved, resolved_window) =
        match live_cached_element(atspi.connection(), cache, window, element_id).await {
            Ok(cached) => cached,
            Err(refusal) => return Ok(InteractiveResult::refused(window.clone(), refusal)),
        };
    if !element.actions.contains(&requested)
        && !(requested == ElementAction::Click && element.actions.contains(&ElementAction::Invoke))
    {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::element_action_unsupported(requested),
        ));
    }
    let performed = match requested {
        ElementAction::Scroll => component(atspi.connection(), &handle)
            .await?
            .scroll_to(ScrollType::Anywhere)
            .await
            .map_err(|error| atspi_error("scroll", error))?,
        _ => {
            let proxy = action(atspi.connection(), &handle).await?;
            let actions = proxy
                .get_actions()
                .await
                .map_err(|error| atspi_error("list actions", error))?;
            let Some(index) = actions
                .iter()
                .position(|action| action_matches(requested, &action.name))
            else {
                return Ok(InteractiveResult::refused(
                    window.clone(),
                    Refusal::element_action_unsupported(requested),
                ));
            };
            proxy
                .do_action(index as i32)
                .await
                .map_err(|error| atspi_error("perform action", error))?
        }
    };
    if !performed {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::new(
                RefusalCode::ElementActionUnsupported,
                "The application declined the AT-SPI action.",
                "Refresh the accessibility tree and check the element's actions, or use a coordinate click.",
            ),
        ));
    }
    Ok(InteractiveResult::delivered(
        resolved_window,
        delivery(&element, element_id, moved),
    ))
}

pub async fn set_element_value(
    cache: &SnapshotCache<Handle>,
    window: &WindowInfo,
    element_id: &str,
    new_value: &str,
) -> Result<InteractiveResult> {
    let atspi = connect().await?;
    let (element, handle, moved, resolved_window) =
        match live_cached_element(atspi.connection(), cache, window, element_id).await {
            Ok(cached) => cached,
            Err(refusal) => return Ok(InteractiveResult::refused(window.clone(), refusal)),
        };
    if !element.actions.contains(&ElementAction::SetValue) {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::element_action_unsupported(ElementAction::SetValue),
        ));
    }
    let set = if let Ok(proxy) = editable_text(atspi.connection(), &handle).await {
        proxy
            .set_text_contents(new_value)
            .await
            .map_err(|error| atspi_error("set text", error))?
    } else if let Ok(number) = new_value.parse::<f64>() {
        let proxy = value(atspi.connection(), &handle).await?;
        proxy
            .set_current_value(number)
            .await
            .map_err(|error| atspi_error("set numeric value", error))?;
        proxy
            .current_value()
            .await
            .is_ok_and(|value| value == number)
    } else {
        return Ok(capability_unavailable(
            window.clone(),
            "non-numeric value assignment for this AT-SPI element",
        ));
    };
    if !set {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::new(
                RefusalCode::ElementActionUnsupported,
                "The application declined the AT-SPI value change.",
                "Refresh the accessibility tree and retry with a current editable element.",
            ),
        ));
    }
    Ok(InteractiveResult::delivered(
        resolved_window,
        delivery(&element, element_id, moved),
    ))
}

pub async fn focus_window(window: &WindowInfo) -> Result<InteractiveResult> {
    let atspi = connect().await?;
    let resolved = resolve(window).await?;
    let focused = component(atspi.connection(), &resolved.handle)
        .await?
        .grab_focus()
        .await
        .map_err(|error| atspi_error("focus window", error))?;
    if !focused {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::background_unavailable("The compositor declined the AT-SPI focus request."),
        ));
    }
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(500);
    loop {
        let state = accessible(atspi.connection(), &resolved.handle)
            .await?
            .get_state()
            .await
            .map_err(|error| atspi_error("verify focused window", error))?;
        if state.contains(State::Active) || state.contains(State::Focused) {
            break;
        }
        if tokio::time::Instant::now() >= deadline {
            return Ok(InteractiveResult::refused(
                resolved.info,
                Refusal::new(
                    RefusalCode::WaylandRawInputUnsupported,
                    "The target window did not become active after the AT-SPI focus request.",
                    "Activate the target manually and retry, or use find_elements with invoke_element or set_element_value.",
                ),
            ));
        }
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
    Ok(InteractiveResult::delivered(
        resolved.info,
        Delivery::foreground(Route::Accessibility)
            .with_verified(Verified::Confirmed)
            .with_note("in_app_focus_changed"),
    ))
}

#[cfg(test)]
mod tests {
    use super::{element_role, same_element};
    use crate::protocol::actions::{ElementBounds, ElementInfo};

    fn element() -> ElementInfo {
        ElementInfo {
            id: "s1:1".into(),
            role: "button".into(),
            name: Some("Run".into()),
            value: None,
            automation_id: Some("run-button".into()),
            bounds: ElementBounds {
                x: 10,
                y: 20,
                width: 30,
                height: 40,
            },
            enabled: true,
            focused: false,
            offscreen: false,
            actions: Vec::new(),
            depth: 1,
        }
    }

    #[test]
    fn distinguishes_editable_text_views_from_static_text() {
        assert_eq!(element_role("text", true), "edit");
        assert_eq!(element_role("text", false), "text");
        assert_eq!(element_role("entry", true), "edit");
        assert_eq!(element_role("push button", false), "button");
    }

    #[test]
    fn live_identity_allows_movement_but_rejects_replaced_elements() {
        let cached = element();
        let mut moved = element();
        moved.bounds.x = 100;
        assert!(same_element(&cached, &moved));

        let mut replaced = element();
        replaced.automation_id = Some("other-button".into());
        assert!(!same_element(&cached, &replaced));
    }
}
