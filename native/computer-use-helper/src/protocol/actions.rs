//! Per-action input and result shapes. Field names are the wire contract with
//! `src/main/computer-use/mcp/types.ts`; keep them stable and additive.

use serde::{Deserialize, Deserializer, Serialize};

use super::window::{WindowInfo, WindowRef};

// ---------------------------------------------------------------------------
// Shared input helpers
// ---------------------------------------------------------------------------

/// Accept a JSON number or a strictly numeric string (parity with the
/// TypeScript `readNumber`, which rejects `""`/`null`/`true`).
pub fn deserialize_number<'de, D: Deserializer<'de>>(deserializer: D) -> Result<f64, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    number_from_value(&value).ok_or_else(|| serde::de::Error::custom("expected a number"))
}

pub fn deserialize_opt_number<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<f64>, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    match value {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(value) => number_from_value(&value)
            .map(Some)
            .ok_or_else(|| serde::de::Error::custom("expected a number")),
    }
}

fn number_from_value(value: &serde_json::Value) -> Option<f64> {
    match value {
        serde_json::Value::Number(number) => number.as_f64().filter(|f| f.is_finite()),
        serde_json::Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                return None;
            }
            trimmed.parse::<f64>().ok().filter(|f| f.is_finite())
        }
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InputMode {
    #[default]
    Background,
    Foreground,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verify {
    None,
    #[default]
    Fast,
    Effect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageFormat {
    #[default]
    Jpeg,
    Png,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

impl MouseButton {
    pub fn parse(value: Option<&str>) -> Result<Self, String> {
        match value.map(|v| v.trim().to_ascii_lowercase()).as_deref() {
            None | Some("") | Some("left") | Some("l") => Ok(Self::Left),
            Some("right") | Some("r") => Ok(Self::Right),
            Some("middle") | Some("m") => Ok(Self::Middle),
            Some(other) => Err(format!(
                "mouse_button must be left, right, or middle (got {other:?})"
            )),
        }
    }
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct HelloInput {
    #[serde(default, rename = "protocolVersion")]
    pub protocol_version: Option<u32>,
    #[serde(default, rename = "clientVersion")]
    pub client_version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CancelInput {
    pub id: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WindowOnlyInput {
    pub window: WindowRef,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GetWindowStateInput {
    pub window: WindowRef,
    #[serde(default)]
    pub include_screenshot: Option<bool>,
    #[serde(default)]
    pub include_text: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_number")]
    pub max_dimension: Option<f64>,
    #[serde(default)]
    pub format: Option<ImageFormat>,
    #[serde(default)]
    pub tree_max_nodes: Option<usize>,
}

impl GetWindowStateInput {
    pub const DEFAULT_MAX_DIMENSION: u32 = 1280;
    pub const DEFAULT_TREE_MAX_NODES: usize = 2000;

    pub fn wants_screenshot(&self) -> bool {
        self.include_screenshot != Some(false)
    }

    pub fn wants_text(&self) -> bool {
        self.include_text == Some(true)
    }

    pub fn max_dimension(&self) -> u32 {
        match self.max_dimension {
            Some(value) if value >= 0.0 => value as u32,
            _ => Self::DEFAULT_MAX_DIMENSION,
        }
    }

    pub fn tree_max_nodes(&self) -> usize {
        self.tree_max_nodes
            .unwrap_or(Self::DEFAULT_TREE_MAX_NODES)
            .clamp(1, 20_000)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClickInput {
    pub window: WindowRef,
    #[serde(deserialize_with = "deserialize_number")]
    pub x: f64,
    #[serde(deserialize_with = "deserialize_number")]
    pub y: f64,
    #[serde(default, deserialize_with = "deserialize_opt_number")]
    pub click_count: Option<f64>,
    #[serde(default)]
    pub mouse_button: Option<String>,
    #[serde(default)]
    pub mode: InputMode,
    #[serde(default)]
    pub verify: Verify,
}

impl ClickInput {
    pub fn click_count(&self) -> Result<u32, String> {
        match self.click_count {
            None => Ok(1),
            Some(count) if count == 1.0 || count == 2.0 => Ok(count as u32),
            Some(_) => Err("click_count must be 1 or 2".to_string()),
        }
    }

    pub fn button(&self) -> Result<MouseButton, String> {
        MouseButton::parse(self.mouse_button.as_deref())
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct PressKeyInput {
    pub window: WindowRef,
    pub key: String,
    #[serde(default)]
    pub mode: InputMode,
    #[serde(default)]
    pub verify: Verify,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TypeTextInput {
    pub window: WindowRef,
    pub text: String,
    #[serde(default)]
    pub mode: InputMode,
    #[serde(default)]
    pub verify: Verify,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ScrollInput {
    pub window: WindowRef,
    #[serde(deserialize_with = "deserialize_number")]
    pub x: f64,
    #[serde(deserialize_with = "deserialize_number")]
    pub y: f64,
    #[serde(rename = "scrollX", deserialize_with = "deserialize_number")]
    pub scroll_x: f64,
    #[serde(rename = "scrollY", deserialize_with = "deserialize_number")]
    pub scroll_y: f64,
    #[serde(default)]
    pub mode: InputMode,
    #[serde(default)]
    pub verify: Verify,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DragInput {
    pub window: WindowRef,
    #[serde(deserialize_with = "deserialize_number")]
    pub from_x: f64,
    #[serde(deserialize_with = "deserialize_number")]
    pub from_y: f64,
    #[serde(deserialize_with = "deserialize_number")]
    pub to_x: f64,
    #[serde(deserialize_with = "deserialize_number")]
    pub to_y: f64,
    #[serde(default)]
    pub mode: InputMode,
    #[serde(default)]
    pub steps: Option<u32>,
    #[serde(default)]
    pub verify: Verify,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LaunchAppInput {
    pub app: String,
    /// `background` (the default) launches without bringing the app forward.
    /// `foreground` is the classic activating launch and takes the user's focus.
    #[serde(default)]
    pub mode: InputMode,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ListAppsInput {
    #[serde(default)]
    pub query: Option<String>,
}

impl ListAppsInput {
    pub fn query(&self) -> Option<&str> {
        self.query
            .as_deref()
            .map(str::trim)
            .filter(|query| !query.is_empty())
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct FindElementsInput {
    pub window: WindowRef,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub automation_id: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub max_results: Option<usize>,
    #[serde(default)]
    pub snapshot_id: Option<String>,
}

impl FindElementsInput {
    pub fn max_results(&self) -> usize {
        self.max_results.unwrap_or(50).clamp(1, 200)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ElementAction {
    #[default]
    Invoke,
    Toggle,
    Select,
    Expand,
    Collapse,
    SetValue,
    Scroll,
    ContextMenu,
    Click,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InvokeElementInput {
    pub window: WindowRef,
    pub element_id: String,
    #[serde(default)]
    pub action: ElementAction,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetElementValueInput {
    pub window: WindowRef,
    pub element_id: String,
    pub value: String,
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Delivered {
    Background,
    Foreground,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Route {
    Accessibility,
    Message,
    Event,
    Input,
    /// The host launcher (`open`, `Start-Process`, `gio launch`) rather than an
    /// input or accessibility route.
    Launch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verified {
    Confirmed,
    Unverified,
    Unchanged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeliveryTarget {
    pub kind: String,
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Delivery {
    pub delivered: Delivered,
    pub route: Route,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<DeliveryTarget>,
    pub verified: Verified,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<String>,
}

impl Delivery {
    pub fn new(delivered: Delivered, route: Route) -> Self {
        Self {
            delivered,
            route,
            target: None,
            verified: Verified::Unverified,
            notes: Vec::new(),
        }
    }

    pub fn background(route: Route) -> Self {
        Self::new(Delivered::Background, route)
    }

    pub fn foreground(route: Route) -> Self {
        Self::new(Delivered::Foreground, route)
    }

    pub fn with_note(mut self, note: impl Into<String>) -> Self {
        self.notes.push(note.into());
        self
    }

    pub fn with_verified(mut self, verified: Verified) -> Self {
        self.verified = verified;
        self
    }

    pub fn with_target(mut self, target: DeliveryTarget) -> Self {
        self.target = Some(target);
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RefusalCode {
    BackgroundUnavailable,
    BackgroundOccludedUnsupported,
    WaylandRawInputUnsupported,
    WindowMinimized,
    ElevatedTarget,
    SecureDesktop,
    TargetNotResponding,
    DecorationTarget,
    PermissionDenied,
    StaleSnapshot,
    ElementActionUnsupported,
    UnsupportedButton,
    CapabilityUnavailable,
    ScreenLocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Refusal {
    pub code: RefusalCode,
    pub reason: String,
    pub hint: String,
}

impl Refusal {
    pub fn new(code: RefusalCode, reason: impl Into<String>, hint: impl Into<String>) -> Self {
        Self {
            code,
            reason: reason.into(),
            hint: hint.into(),
        }
    }

    pub const FOREGROUND_HINT: &'static str = "Retry with mode:\"foreground\" (takes over the real mouse/keyboard and shows the takeover border), or use find_elements + invoke_element / set_element_value.";

    pub fn background_unavailable(reason: impl Into<String>) -> Self {
        Self::new(
            RefusalCode::BackgroundUnavailable,
            reason,
            Self::FOREGROUND_HINT,
        )
    }

    pub fn window_minimized() -> Self {
        Self::new(
            RefusalCode::WindowMinimized,
            "The target window is minimized; background input cannot reach it.",
            "Call activate_window (or retry with mode:\"foreground\") to restore it, or use invoke_element / set_element_value which work on minimized windows where the app exposes accessibility.",
        )
    }

    pub fn stale_snapshot() -> Self {
        Self::new(
            RefusalCode::StaleSnapshot,
            "The element id belongs to a snapshot that is no longer cached.",
            "Call find_elements (or get_window_state with include_text:true) again and use the fresh element ids.",
        )
    }

    pub fn screen_locked() -> Self {
        Self::new(
            RefusalCode::ScreenLocked,
            "The desktop is locked, so foreground input would land on the lock screen instead of the target window.",
            "Ask the user to unlock the screen and wait; do not retry until they do. A locked desktop exposes no window content or controls, so no background action can substitute: captures come back blank and the accessibility tree is reduced to an app proxy with only the menu bar. Background coordinate events are still accepted by the OS, but their effect cannot be observed.",
        )
    }

    pub fn element_action_unsupported(action: ElementAction) -> Self {
        Self::new(
            RefusalCode::ElementActionUnsupported,
            format!("The element does not support the {action:?} action."),
            "Check the element's `actions` list from find_elements, or click its bounds instead.",
        )
    }
}

/// Result of every input action. Either delivered (with a report) or refused
/// (with a structured reason). Both are transport-level `ok: true` responses.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteractiveResult {
    pub ok: bool,
    pub mode: &'static str,
    pub window: WindowInfo,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivery: Option<Delivery>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refused: Option<Refusal>,
}

impl InteractiveResult {
    pub fn delivered(window: WindowInfo, delivery: Delivery) -> Self {
        Self {
            ok: true,
            mode: "interactive",
            window,
            delivery: Some(delivery),
            refused: None,
        }
    }

    pub fn refused(window: WindowInfo, refusal: Refusal) -> Self {
        Self {
            ok: false,
            mode: "interactive",
            window,
            delivery: None,
            refused: Some(refusal),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ElementBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl ElementBounds {
    pub fn center(&self) -> (i32, i32) {
        (self.x + self.width / 2, self.y + self.height / 2)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ElementInfo {
    pub id: String,
    pub role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(
        default,
        rename = "automationId",
        skip_serializing_if = "Option::is_none"
    )]
    pub automation_id: Option<String>,
    pub bounds: ElementBounds,
    pub enabled: bool,
    pub focused: bool,
    pub offscreen: bool,
    pub actions: Vec<ElementAction>,
    pub depth: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoundElements {
    #[serde(rename = "snapshotId")]
    pub snapshot_id: String,
    pub truncated: bool,
    pub elements: Vec<ElementInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum FindElementsResult {
    Found(FoundElements),
    Refused(Box<InteractiveResult>),
}

impl FindElementsResult {
    pub fn found(snapshot_id: String, truncated: bool, elements: Vec<ElementInfo>) -> Self {
        Self::Found(FoundElements {
            snapshot_id,
            truncated,
            elements,
        })
    }

    pub fn refused(window: WindowInfo, refusal: Refusal) -> Self {
        Self::Refused(Box::new(InteractiveResult::refused(window, refusal)))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Screenshot {
    pub id: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    pub data: String,
    pub width: u32,
    pub height: u32,
    #[serde(rename = "originX")]
    pub origin_x: i32,
    #[serde(rename = "originY")]
    pub origin_y: i32,
    #[serde(rename = "zIndex")]
    pub z_index: u32,
    pub scale: f64,
    #[serde(rename = "sourceWidth")]
    pub source_width: u32,
    #[serde(rename = "sourceHeight")]
    pub source_height: u32,
    #[serde(rename = "captureMethod")]
    pub capture_method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessibilityState {
    pub source: String,
    pub tree: String,
    #[serde(rename = "snapshotId")]
    pub snapshot_id: String,
    #[serde(rename = "elementCount")]
    pub element_count: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowStateResult {
    pub window: WindowInfo,
    pub mode: &'static str,
    pub notes: Vec<String>,
    pub screenshots: Vec<Screenshot>,
    pub accessibility: Option<AccessibilityState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchResult {
    pub ok: bool,
    pub window: Option<WindowInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Reports whether the launch actually took the user's focus, so the
    /// activity overlay can show the background badge instead of the takeover
    /// border. Absent only on hosts that predate the field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivery: Option<Delivery>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refused: Option<Refusal>,
}

impl LaunchResult {
    /// A launch that ran. `delivered` must describe what the host launcher
    /// really did, not what the caller asked for.
    pub fn launched(window: Option<WindowInfo>, delivered: Delivered) -> Self {
        let verified = if window.is_some() {
            Verified::Confirmed
        } else {
            Verified::Unverified
        };
        Self {
            ok: true,
            window,
            note: None,
            delivery: Some(Delivery::new(delivered, Route::Launch).with_verified(verified)),
            refused: None,
        }
    }

    pub fn with_note(mut self, note: impl Into<String>) -> Self {
        self.note = Some(note.into());
        self
    }

    pub fn with_delivery_note(mut self, note: impl Into<String>) -> Self {
        if let Some(delivery) = &mut self.delivery {
            delivery.notes.push(note.into());
        }
        self
    }

    pub fn refused(refusal: Refusal) -> Self {
        Self {
            ok: false,
            window: None,
            note: None,
            delivery: None,
            refused: Some(refusal),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "isRunning")]
    pub is_running: bool,
    pub windows: Vec<WindowInfo>,
}

impl AppInfo {
    pub fn installed(id: String, display_name: String) -> Self {
        Self {
            id,
            display_name,
            is_running: false,
            windows: Vec::new(),
        }
    }

    /// Only the final component of `id` is matched. An installed entry's id is a
    /// launch id -- a bundle path, a `.desktop` path, or
    /// `shell:AppsFolder\<AUMID>` -- so matching the whole string makes every
    /// catalog entry match a shared directory segment like "applications" or
    /// "system". The final component still carries the package or file name,
    /// which often differs from the display name
    /// (`org.gnome.Nautilus.desktop` vs "Files").
    pub fn matches_query(&self, query: &str) -> bool {
        let query = query.to_lowercase();
        self.display_name.to_lowercase().contains(&query)
            || id_leaf(&self.id).to_lowercase().contains(&query)
            || self.windows.iter().any(|window| {
                window.title.to_lowercase().contains(&query)
                    || window.app.to_lowercase().contains(&query)
            })
    }
}

/// Final path component of a launch id. Unlike `window::app_leaf` this keeps the
/// extension, because an AUMID such as
/// `Microsoft.WindowsCalculator_8wekyb3d8bbwe!App` would otherwise be truncated
/// at its first dot down to the vendor prefix.
fn id_leaf(id: &str) -> &str {
    id.rsplit(['/', '\\']).next().unwrap_or(id)
}

/// Group windows by `app` (parity with the PowerShell `list_apps`).
pub fn group_apps(windows: Vec<WindowInfo>) -> Vec<AppInfo> {
    let mut apps: Vec<AppInfo> = Vec::new();
    for window in windows {
        if let Some(existing) = apps.iter_mut().find(|app| app.id == window.app) {
            existing.windows.push(window);
            continue;
        }
        apps.push(AppInfo {
            id: window.app.clone(),
            display_name: window
                .display_name
                .clone()
                .unwrap_or_else(|| window.app_leaf()),
            is_running: true,
            windows: vec![window],
        });
    }
    apps
}

pub fn merge_installed_apps(mut running: Vec<AppInfo>, installed: Vec<AppInfo>) -> Vec<AppInfo> {
    for mut app in installed {
        if let Some(index) = running.iter().position(|candidate| {
            candidate.id.to_lowercase() == app.id.to_lowercase()
                || candidate.display_name.to_lowercase() == app.display_name.to_lowercase()
        }) {
            let active = running.remove(index);
            app.is_running = true;
            app.windows = active.windows;
        }
        running.push(app);
    }
    running.sort_by(|left, right| {
        right.is_running.cmp(&left.is_running).then_with(|| {
            left.display_name
                .to_lowercase()
                .cmp(&right.display_name.to_lowercase())
        })
    });
    // `dedup_by` only removes adjacent equals, and the sort key is not the id,
    // so duplicates have to be dropped by identity rather than by adjacency.
    let mut seen = std::collections::HashSet::new();
    running.retain(|app| seen.insert(app.id.to_lowercase()));
    running
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    Granted,
    Denied,
    Unknown,
    NotRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    pub accessibility: PermissionState,
    pub screen_recording: PermissionState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub background_pointer: bool,
    pub background_keyboard: bool,
    pub background_chords: bool,
    pub accessibility_tree: bool,
    pub element_actions: bool,
    pub occluded_capture: bool,
    pub foreground_input: bool,
    pub launch_app: bool,
    pub stable_window_ids: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hello {
    pub protocol_version: u32,
    pub min_client_protocol_version: u32,
    pub helper_version: String,
    pub platform: &'static str,
    pub arch: &'static str,
    pub display_server: Option<String>,
    pub capabilities: Capabilities,
    pub permissions: Permissions,
    /// True when the console session's screen is locked (or this session does
    /// not own the console). Background control keeps working; foreground
    /// operations are refused with `screen_locked`.
    pub screen_locked: bool,
    pub notes: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn click_input_accepts_numeric_strings_and_defaults() {
        let input: ClickInput =
            serde_json::from_str(r#"{"window":{"app":"a","id":1},"x":"12","y":34.5}"#).unwrap();
        assert_eq!(input.x, 12.0);
        assert_eq!(input.y, 34.5);
        assert_eq!(input.mode, InputMode::Background);
        assert_eq!(input.click_count().unwrap(), 1);
        assert_eq!(input.button().unwrap(), MouseButton::Left);
    }

    #[test]
    fn click_input_rejects_blank_coordinates() {
        let error =
            serde_json::from_str::<ClickInput>(r#"{"window":{"app":"a","id":1},"x":"","y":1}"#)
                .unwrap_err();
        assert!(error.to_string().contains("expected a number"));
    }

    #[test]
    fn click_count_validation() {
        let input: ClickInput =
            serde_json::from_str(r#"{"window":{"app":"a","id":1},"x":1,"y":1,"click_count":3}"#)
                .unwrap();
        assert!(input.click_count().is_err());
    }

    #[test]
    fn scroll_uses_camel_case_deltas() {
        let input: ScrollInput = serde_json::from_str(
            r#"{"window":{"app":"a","id":1},"x":1,"y":2,"scrollX":-3,"scrollY":240,"mode":"foreground"}"#,
        )
        .unwrap();
        assert_eq!(input.scroll_x, -3.0);
        assert_eq!(input.scroll_y, 240.0);
        assert_eq!(input.mode, InputMode::Foreground);
    }

    #[test]
    fn interactive_result_serializes_refusal_shape() {
        let window = WindowInfo {
            app: "a".into(),
            id: 1,
            title: String::new(),
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            pid: None,
            display_name: None,
            minimized: None,
            source: None,
        };
        let value = serde_json::to_value(InteractiveResult::refused(
            window,
            Refusal::window_minimized(),
        ))
        .unwrap();
        assert_eq!(value["ok"], false);
        assert_eq!(value["mode"], "interactive");
        assert_eq!(value["refused"]["code"], "window_minimized");
        assert!(value.get("delivery").is_none());
    }

    #[test]
    fn find_elements_serializes_stale_snapshot_as_a_normal_refusal() {
        let window = WindowInfo {
            app: "a".into(),
            id: 1,
            title: String::new(),
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            pid: None,
            display_name: None,
            minimized: None,
            source: None,
        };
        let value = serde_json::to_value(FindElementsResult::refused(
            window,
            Refusal::stale_snapshot(),
        ))
        .unwrap();
        assert_eq!(value["ok"], false);
        assert_eq!(value["mode"], "interactive");
        assert_eq!(value["refused"]["code"], "stale_snapshot");
        assert!(value.get("snapshotId").is_none());
    }

    #[test]
    fn hello_uses_camel_case() {
        let hello = Hello {
            protocol_version: 1,
            min_client_protocol_version: 1,
            helper_version: "0.1.0".into(),
            platform: "win32",
            arch: "x64",
            display_server: None,
            capabilities: Capabilities::default(),
            permissions: Permissions {
                accessibility: PermissionState::NotRequired,
                screen_recording: PermissionState::NotRequired,
            },
            screen_locked: false,
            notes: vec![],
        };
        let value = serde_json::to_value(hello).unwrap();
        assert_eq!(value["protocolVersion"], 1);
        assert_eq!(value["capabilities"]["backgroundPointer"], false);
        assert_eq!(value["permissions"]["screenRecording"], "not_required");
        assert_eq!(value["screenLocked"], false);
    }

    #[test]
    fn launch_result_reports_the_delivery_that_really_happened() {
        let background =
            serde_json::to_value(LaunchResult::launched(None, Delivered::Background)).unwrap();
        assert_eq!(background["ok"], true);
        assert_eq!(background["delivery"]["delivered"], "background");
        assert_eq!(background["delivery"]["route"], "launch");
        assert_eq!(background["delivery"]["verified"], "unverified");

        let refused =
            serde_json::to_value(LaunchResult::refused(Refusal::screen_locked())).unwrap();
        assert_eq!(refused["ok"], false);
        assert_eq!(refused["refused"]["code"], "screen_locked");
        assert!(refused.get("delivery").is_none());
    }

    #[test]
    fn launch_app_input_defaults_to_background_mode() {
        let input: LaunchAppInput = serde_json::from_str(r#"{"app":"TextEdit"}"#).unwrap();
        assert_eq!(input.mode, InputMode::Background);
        let input: LaunchAppInput =
            serde_json::from_str(r#"{"app":"TextEdit","mode":"foreground"}"#).unwrap();
        assert_eq!(input.mode, InputMode::Foreground);
    }

    #[test]
    fn groups_windows_by_app() {
        let mk = |app: &str, id: i64| WindowInfo {
            app: app.into(),
            id,
            title: String::new(),
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            pid: None,
            display_name: None,
            minimized: None,
            source: None,
        };
        let apps = group_apps(vec![mk("a.exe", 1), mk("b.exe", 2), mk("a.exe", 3)]);
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0].windows.len(), 2);
        assert_eq!(apps[0].display_name, "a");
    }

    #[test]
    fn merges_installed_app_with_matching_running_id() {
        let running = group_apps(vec![WindowInfo {
            app: r"shell:AppsFolder\Microsoft.WindowsCalculator!App".into(),
            id: 1,
            title: "Calculator".into(),
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pid: Some(10),
            display_name: Some("ApplicationFrameHost".into()),
            minimized: Some(false),
            source: None,
        }]);
        let apps = merge_installed_apps(
            running,
            vec![AppInfo::installed(
                r"shell:AppsFolder\Microsoft.WindowsCalculator!App".into(),
                "Calculator".into(),
            )],
        );

        assert_eq!(apps.len(), 1);
        assert!(apps[0].is_running);
        assert_eq!(apps[0].windows.len(), 1);
        assert!(apps[0].id.starts_with("shell:AppsFolder"));
    }

    #[test]
    fn does_not_merge_an_unrelated_window_that_only_mentions_the_app_in_its_title() {
        let running = group_apps(vec![WindowInfo {
            app: "firefox".into(),
            id: 1,
            title: "Notes - Mozilla Firefox".into(),
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pid: Some(10),
            display_name: Some("Firefox".into()),
            minimized: Some(false),
            source: None,
        }]);
        let apps = merge_installed_apps(
            running,
            vec![AppInfo::installed("notes".into(), "Notes".into())],
        );

        assert_eq!(apps.len(), 2);
        assert!(apps.iter().any(|app| app.id == "firefox" && app.is_running));
        assert!(apps.iter().any(|app| app.id == "notes" && !app.is_running));
    }

    #[test]
    fn app_search_matches_non_ascii_case() {
        let app = AppInfo::installed("editor".into(), "Éditeur".into());
        assert!(app.matches_query("éditeur"));
    }

    #[test]
    fn app_search_ignores_launch_id_path_segments() {
        let installed = AppInfo::installed(
            "/System/Applications/Calculator.app".into(),
            "Calculator".into(),
        );
        assert!(installed.matches_query("calculator"));
        assert!(!installed.matches_query("system"));
        assert!(!installed.matches_query("applications"));
    }

    #[test]
    fn app_search_matches_a_launch_id_filename_that_differs_from_the_display_name() {
        let nautilus = AppInfo::installed(
            "/usr/share/applications/org.gnome.Nautilus.desktop".into(),
            "Files".into(),
        );
        assert!(nautilus.matches_query("nautilus"));
        assert!(nautilus.matches_query("files"));
        assert!(!nautilus.matches_query("applications"));
        assert!(!nautilus.matches_query("share"));
    }

    #[test]
    fn app_search_matches_an_aumid_package_name_without_truncating_at_the_vendor() {
        let calculator = AppInfo::installed(
            r"shell:AppsFolder\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App".into(),
            "Calculator".into(),
        );
        assert!(calculator.matches_query("windowscalculator"));
        assert!(!calculator.matches_query("appsfolder"));
    }

    #[test]
    fn app_search_still_matches_a_running_app_by_executable_path() {
        let running = group_apps(vec![WindowInfo {
            app: r"C:\Program Files\Notepad++\notepad++.exe".into(),
            id: 1,
            title: "readme.txt".into(),
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            pid: None,
            display_name: Some("Notepad++".into()),
            minimized: None,
            source: None,
        }]);
        assert!(running[0].matches_query("program files"));
        assert!(running[0].matches_query("readme"));
    }
}
