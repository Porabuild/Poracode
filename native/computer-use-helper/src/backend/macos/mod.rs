use std::collections::HashSet;
use std::path::{Component, Path};
use std::process::Command;
use std::process::Stdio;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use crate::backend::{
    Backend, CancelToken, HelloInfo, InputOptions, InstalledAppCache, KeyboardAction, PointerAction,
};
use crate::capture::CaptureResult;
use crate::elements::SnapshotCache;
use crate::protocol::Result;
use crate::protocol::actions::{
    AccessibilityState, Capabilities, Delivered, ElementAction, FindElementsInput,
    FindElementsResult, InputMode, InteractiveResult, LaunchResult, PermissionState, Permissions,
};
use crate::protocol::window::{WindowInfo, WindowRef};

mod apps;
mod ax;
mod capture;
mod chromium;
mod input;
mod session;
mod window_list;

/// A launched window is first seen mid open-animation, so its frame is still
/// moving. Handing that frame to the agent makes every following element action
/// report a spurious `element_moved`. Poll until the frame repeats.
const LAUNCH_SETTLE_INTERVAL: Duration = Duration::from_millis(50);
const LAUNCH_SETTLE_TIMEOUT: Duration = Duration::from_secs(1);

/// Side of the square, in window points, that effect verification compares
/// around an action point. Matches the Windows and Linux backends.
const VERIFY_REGION: i32 = 32;

/// Hash the pixels around an action point for effect verification.
///
/// Hashing the whole window instead — which this did — reports any pixel that
/// changed anywhere as proof the action landed, and a window is full of pixels
/// that change on their own: a blinking text caret, a clock, a spinner, a
/// video. A dropped background click then came back `verified:"confirmed"`, so
/// the agent could not tell delivery from silence and escalated to a foreground
/// takeover to make progress. Windows and Linux already compare a region;
/// macOS additionally has to scale the point, because its capture is in backing
/// pixels while the action point is in window points.
pub(super) fn region_hash(window: &WindowInfo, point: (f64, f64)) -> Option<u64> {
    let capture = capture::capture(window).ok()?;
    let (x, y, width, height) = verify_region(window.width, capture.frame.width, point);
    Some(capture.frame.crop(x, y, width, height).content_hash())
}

/// Whole-window hash used only to stop a region miss becoming `unchanged`.
///
/// A successful click often changes pixels nowhere near the point — a sheet,
/// a menu, a selection. The region is still the bar for `confirmed` (a caret
/// blink must not certify a dropped click), but when the region is still the
/// same, a changed window means something happened and the verdict must not
/// tell the agent to abandon the control.
pub(super) fn window_hash(window: &WindowInfo) -> Option<u64> {
    Some(capture::capture(window).ok()?.frame.content_hash())
}

/// The crop rectangle, in capture pixels, compared around an action point.
///
/// Separate from the capture so the conversion is testable on its own: macOS
/// captures at backing scale while the action point is in window points, and a
/// point near a window edge yields a negative origin, which `Frame::crop`
/// clamps into the frame rather than rejecting.
fn verify_region(window_width: i32, capture_width: u32, point: (f64, f64)) -> (i32, i32, u32, u32) {
    let scale = if window_width > 0 {
        f64::from(capture_width) / f64::from(window_width)
    } else {
        1.0
    };
    let size = (f64::from(VERIFY_REGION) * scale).round().max(1.0);
    let origin = |value: f64| (value * scale - size / 2.0).round() as i32;
    (origin(point.0), origin(point.1), size as u32, size as u32)
}

enum LaunchTarget<'a> {
    ApplicationName(&'a str),
    BundlePath(&'a str),
}

impl LaunchTarget<'_> {
    fn parse(app: &str) -> Result<LaunchTarget<'_>> {
        let app = app.trim();
        if app.is_empty() || app.contains('\0') || app.len() > 32_768 {
            return Err(crate::protocol::HelperError::invalid_input(
                "app must be a non-empty application name or absolute .app path",
            ));
        }
        if app.starts_with("//") || app.starts_with("\\\\") {
            return Err(crate::protocol::HelperError::invalid_input(
                "UNC paths are not supported on macOS",
            ));
        }
        let path = Path::new(app);
        if path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
        {
            return Err(crate::protocol::HelperError::invalid_input(
                "app paths may not contain relative path components",
            ));
        }
        if path.is_absolute() {
            if path.extension().is_some_and(|extension| extension == "app") {
                return Ok(LaunchTarget::BundlePath(app));
            }
            return Err(crate::protocol::HelperError::invalid_input(
                "absolute macOS application paths must end in .app",
            ));
        }
        if app.starts_with('-') || app.contains('/') || app.contains('\\') || has_url_scheme(app) {
            return Err(crate::protocol::HelperError::invalid_input(
                "app must be an application name or absolute .app path",
            ));
        }
        Ok(LaunchTarget::ApplicationName(app))
    }

    fn argument(&self) -> &str {
        match self {
            Self::ApplicationName(name) | Self::BundlePath(name) => name,
        }
    }

    fn matches(&self, window: &WindowInfo) -> bool {
        match self {
            Self::BundlePath(path) => same_bundle_path(path, &window.app),
            Self::ApplicationName(name) => {
                window
                    .display_name
                    .as_deref()
                    .is_some_and(|display_name| display_name.eq_ignore_ascii_case(name))
                    || window.app_leaf().eq_ignore_ascii_case(name)
            }
        }
    }
}

fn same_bundle_path(requested: &str, actual: &str) -> bool {
    requested == actual
        || std::fs::canonicalize(requested)
            .ok()
            .zip(std::fs::canonicalize(actual).ok())
            .is_some_and(|(requested, actual)| requested == actual)
}

fn has_url_scheme(value: &str) -> bool {
    let Some((scheme, _)) = value.split_once(':') else {
        return false;
    };
    let mut bytes = scheme.bytes();
    bytes.next().is_some_and(|byte| byte.is_ascii_alphabetic())
        && bytes.all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'-' | b'.'))
}

pub struct MacOsBackend {
    elements: SnapshotCache<ax::AxElement>,
    installed_apps: Arc<InstalledAppCache>,
}

impl MacOsBackend {
    pub fn new() -> Self {
        let installed_apps = Arc::new(InstalledAppCache::default());
        installed_apps.prewarm(apps::list);
        Self {
            elements: SnapshotCache::default(),
            installed_apps,
        }
    }

    /// Wait for a freshly launched window's frame to stop moving.
    ///
    /// A window is listed as soon as it exists, which is mid open-animation, so
    /// the first snapshot's geometry is already wrong by the time the agent
    /// uses it. Poll every 50 ms (capped at ~1 s) and return the first frame
    /// that two consecutive polls agree on. If the window disappears or never
    /// settles, the newest frame we saw is returned rather than failing.
    fn settle_window(&self, window: WindowInfo, cancel: &CancelToken) -> WindowInfo {
        let deadline = Instant::now() + LAUNCH_SETTLE_TIMEOUT;
        let mut previous = window;
        while Instant::now() < deadline {
            if cancel.is_cancelled() {
                return previous;
            }
            thread::sleep(LAUNCH_SETTLE_INTERVAL);
            let Some(current) = window_list::list_windows()
                .into_iter()
                .find(|candidate| candidate.id == previous.id)
            else {
                return previous;
            };
            if current.frame() == previous.frame() {
                return current;
            }
            previous = current;
        }
        previous
    }
}

impl Default for MacOsBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl Backend for MacOsBackend {
    fn hello(&self) -> HelloInfo {
        HelloInfo {
            platform: "darwin",
            display_server: None,
            capabilities: Capabilities {
                background_pointer: true,
                background_keyboard: true,
                background_chords: true,
                accessibility_tree: true,
                element_actions: true,
                occluded_capture: true,
                foreground_input: true,
                launch_app: true,
                stable_window_ids: true,
            },
            permissions: Permissions {
                accessibility: if ax::is_trusted() {
                    PermissionState::Granted
                } else {
                    PermissionState::Denied
                },
                screen_recording: if capture::screen_recording_granted() {
                    PermissionState::Granted
                } else {
                    PermissionState::Denied
                },
            },
            screen_locked: session::screen_locked(),
            notes: Vec::new(),
        }
    }

    fn session_notes(&self) -> Vec<String> {
        session::notes(session::screen_locked())
    }

    fn list_windows(&self) -> Result<Vec<WindowInfo>> {
        Ok(window_list::list_windows())
    }

    fn search_installed_apps(&self, query: &str) -> Result<Vec<crate::protocol::actions::AppInfo>> {
        self.installed_apps.search(query, apps::list)
    }

    fn resolve_window(&self, window: &WindowRef) -> Result<WindowInfo> {
        window_list::resolve(window)
    }

    fn capture(&self, window: &WindowInfo, cancel: &CancelToken) -> Result<CaptureResult> {
        cancel.check()?;
        capture::capture(window)
    }

    fn snapshot_tree(
        &self,
        window: &WindowInfo,
        max_nodes: usize,
        cancel: &CancelToken,
    ) -> Result<AccessibilityState> {
        ax::snapshot_tree(&self.elements, window, max_nodes, cancel)
    }

    fn find_elements(
        &self,
        window: &WindowInfo,
        input: &FindElementsInput,
        cancel: &CancelToken,
    ) -> Result<FindElementsResult> {
        ax::find_elements(&self.elements, window, input, cancel)
    }

    fn activate(&self, window: &WindowInfo) -> Result<InteractiveResult> {
        if let Some(refusal) = session::activation_refusal(session::screen_locked()) {
            return Ok(InteractiveResult::refused(window.clone(), refusal));
        }
        input::activate(window)
    }

    fn pointer(
        &self,
        window: &WindowInfo,
        action: PointerAction,
        options: InputOptions,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        let locked = session::screen_locked();
        if let Some(refusal) = session::foreground_refusal(locked, options.mode) {
            return Ok(InteractiveResult::refused(window.clone(), refusal));
        }
        // Effect verification lives in the event path itself: the baseline has
        // to be sampled immediately before the events go out — the accessibility
        // route ahead of it can spend a whole tree walk — and only synthetic
        // pointer input produces an effect near the point to compare.
        let result = input::pointer(&self.elements, window, action, options, cancel)?;
        Ok(annotate_session(result, locked))
    }

    fn keyboard(
        &self,
        window: &WindowInfo,
        action: KeyboardAction,
        options: InputOptions,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        let locked = session::screen_locked();
        if let Some(refusal) = session::foreground_refusal(locked, options.mode) {
            return Ok(InteractiveResult::refused(window.clone(), refusal));
        }
        Ok(annotate_session(
            input::keyboard(window, &action, options, cancel)?,
            locked,
        ))
    }

    fn invoke_element(
        &self,
        window: &WindowInfo,
        element_id: &str,
        action: ElementAction,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        ax::invoke_element(&self.elements, window, element_id, action, cancel)
    }

    fn set_element_value(
        &self,
        window: &WindowInfo,
        element_id: &str,
        value: &str,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        ax::set_element_value(&self.elements, window, element_id, value, cancel)
    }

    fn launch_app(&self, app: &str, mode: InputMode, cancel: &CancelToken) -> Result<LaunchResult> {
        let target = LaunchTarget::parse(app)?;
        let locked = session::screen_locked();
        if let Some(refusal) = session::foreground_refusal(locked, mode) {
            return Ok(LaunchResult::refused(refusal));
        }
        let before = self.list_windows()?;
        let before_ids: HashSet<i64> = before.iter().map(|window| window.id).collect();
        let before_pids: HashSet<u32> = before
            .iter()
            .filter(|window| target.matches(window))
            .filter_map(|window| window.pid)
            .collect();
        let mut command = Command::new("/usr/bin/open");
        // `-g` ("do not bring the application to the foreground") is what keeps
        // a background launch from stealing the user's focus.
        if mode == InputMode::Background {
            command.arg("-g");
        }
        match &target {
            LaunchTarget::ApplicationName(name) => {
                command.args(["-a", name]);
            }
            LaunchTarget::BundlePath(path) => {
                command.arg(path);
            }
        }
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let status = command.status().map_err(|error| {
            crate::protocol::HelperError::internal(format!(
                "Failed to launch {}: {error}",
                target.argument()
            ))
        })?;
        if !status.success() {
            return Err(crate::protocol::HelperError::internal(format!(
                "/usr/bin/open could not launch {}",
                target.argument()
            )));
        }
        let delivered = match mode {
            InputMode::Background => Delivered::Background,
            InputMode::Foreground => Delivered::Foreground,
        };
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            cancel.check()?;
            let windows = self
                .list_windows()?
                .into_iter()
                .filter(|window| target.matches(window))
                .collect::<Vec<_>>();
            if let Some(window) = windows
                .iter()
                .find(|window| {
                    !before_ids.contains(&window.id)
                        || window.pid.is_some_and(|pid| !before_pids.contains(&pid))
                })
                .or_else(|| windows.first())
            {
                let window = self.settle_window(window.clone(), cancel);
                let result = LaunchResult::launched(Some(window), delivered);
                return Ok(annotate_launch_session(result, locked));
            }
            thread::sleep(Duration::from_millis(100));
        }
        let result = LaunchResult::launched(None, delivered)
            .with_note("Application launched, but no window appeared within 3 seconds.");
        Ok(annotate_launch_session(result, locked))
    }
}

fn annotate_session(mut result: InteractiveResult, locked: bool) -> InteractiveResult {
    if locked && let Some(delivery) = &mut result.delivery {
        delivery.notes.push(session::SCREEN_LOCKED_NOTE.to_string());
    }
    result
}

fn annotate_launch_session(result: LaunchResult, locked: bool) -> LaunchResult {
    if locked {
        return result.with_delivery_note(session::SCREEN_LOCKED_NOTE);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::window::WindowSource;

    /// Effect verification compares capture pixels, and a macOS capture is at
    /// backing scale while the action point is in window points. Getting the
    /// conversion wrong compares the wrong part of the window, which reads as
    /// an action that did nothing.
    #[test]
    fn scales_the_verification_region_into_capture_pixels() {
        // Retina: a 1728-point window captured at 3456 px.
        assert_eq!(
            verify_region(1728, 3456, (100.0, 100.0)),
            (168, 168, 64, 64),
            "64 px square centred on the point"
        );
        // Non-Retina, and a downscaled capture.
        assert_eq!(verify_region(1000, 1000, (100.0, 200.0)), (84, 184, 32, 32));
        assert_eq!(verify_region(1000, 500, (100.0, 200.0)), (42, 92, 16, 16));
    }

    /// Two degenerate inputs that must not panic or divide by zero: a window
    /// with no reported width, and a point close enough to an edge that the
    /// region starts outside the frame (`Frame::crop` clamps it).
    #[test]
    fn tolerates_a_zero_width_window_and_an_edge_point() {
        assert_eq!(verify_region(0, 3456, (10.0, 10.0)), (-6, -6, 32, 32));
        assert_eq!(verify_region(1728, 3456, (5.0, 5.0)), (-22, -22, 64, 64));
    }

    fn window(app: &str, display_name: &str) -> WindowInfo {
        WindowInfo {
            app: app.into(),
            id: 1,
            title: "Document".into(),
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pid: Some(7),
            display_name: Some(display_name.into()),
            minimized: Some(false),
            source: Some(WindowSource::Cg),
        }
    }

    #[test]
    fn launch_target_accepts_names_and_absolute_app_paths() {
        assert!(matches!(
            LaunchTarget::parse("Visual Studio Code").unwrap(),
            LaunchTarget::ApplicationName("Visual Studio Code")
        ));
        assert!(matches!(
            LaunchTarget::parse("/Applications/TextEdit.app").unwrap(),
            LaunchTarget::BundlePath("/Applications/TextEdit.app")
        ));
    }

    #[test]
    fn launch_target_rejects_paths_and_urls_outside_the_contract() {
        for invalid in [
            "../TextEdit.app",
            "Applications/TextEdit.app",
            "/usr/bin/osascript",
            "//server/share/App.app",
            r"\\server\share\App.app",
            "https://example.com",
            "file:///Applications/TextEdit.app",
            "-W",
        ] {
            assert!(LaunchTarget::parse(invalid).is_err(), "accepted {invalid}");
        }
    }

    #[test]
    fn launch_target_matches_only_the_requested_application() {
        let target = LaunchTarget::parse("TextEdit").unwrap();
        assert!(target.matches(&window("/System/Applications/TextEdit.app", "TextEdit")));
        assert!(!target.matches(&window("/System/Applications/Finder.app", "Finder")));

        let target = LaunchTarget::parse("/Applications/Preview.app").unwrap();
        assert!(target.matches(&window("/Applications/Preview.app", "Preview")));
        assert!(!target.matches(&window("/Applications/Preview Beta.app", "Preview")));
    }
}
