//! Linux backend. X11/XWayland windows use direct X11 delivery; native
//! Wayland windows are discovered through AT-SPI and use the desktop portal.

use std::collections::HashSet;
use std::future::Future;
use std::path::{Component, Path};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::backend::{
    Backend, BackendOptions, CancelToken, HelloInfo, InputOptions, InstalledAppCache,
    KeyboardAction, PointerAction, is_computer_use_overlay_title,
};
use crate::capture::CaptureResult;
use crate::elements::SnapshotCache;
use crate::protocol::actions::{
    AccessibilityState, Capabilities, Delivered, ElementAction, FindElementsInput,
    FindElementsResult, InputMode, InteractiveResult, LaunchResult, PermissionState, Permissions,
    Refusal, RefusalCode, Verified, Verify,
};
use crate::protocol::window::{WindowInfo, WindowRef, WindowSource};
use crate::protocol::{ErrorCode, HelperError, Result};

mod apps;
mod atspi;
mod keys;
mod portal;
mod x11;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DisplayServer {
    X11,
    Wayland,
    None,
}

impl DisplayServer {
    fn detect() -> Self {
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            Self::Wayland
        } else if std::env::var_os("DISPLAY").is_some() {
            Self::X11
        } else {
            Self::None
        }
    }

    fn name(self) -> Option<String> {
        match self {
            Self::X11 => Some("x11".into()),
            Self::Wayland => Some("wayland".into()),
            Self::None => None,
        }
    }
}

pub struct LinuxBackend {
    display_server: DisplayServer,
    has_x11: bool,
    state_dir: Option<std::path::PathBuf>,
    runtime: Mutex<tokio::runtime::Runtime>,
    elements: SnapshotCache<atspi::Handle>,
    installed_apps: Arc<InstalledAppCache>,
    portal: Mutex<portal::Portal>,
}

impl LinuxBackend {
    pub fn new(options: &BackendOptions) -> Self {
        let state_dir = options.state_dir.clone();
        let installed_apps = Arc::new(InstalledAppCache::default());
        installed_apps.prewarm(apps::list);
        Self {
            display_server: DisplayServer::detect(),
            has_x11: x11::available(),
            state_dir: state_dir.clone(),
            runtime: Mutex::new(
                tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("create Linux backend async runtime"),
            ),
            elements: SnapshotCache::default(),
            installed_apps,
            portal: Mutex::new(portal::Portal::new(state_dir)),
        }
    }

    fn block_on<T>(&self, future: impl Future<Output = Result<T>>) -> Result<T> {
        self.runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .block_on(future)
    }

    fn native_wayland_refusal(window: &WindowInfo, error: &HelperError) -> InteractiveResult {
        let code = if error.code == ErrorCode::PermissionDenied {
            crate::protocol::actions::RefusalCode::PermissionDenied
        } else {
            crate::protocol::actions::RefusalCode::WaylandRawInputUnsupported
        };
        InteractiveResult::refused(
            window.clone(),
            Refusal::new(
                code,
                error.message.clone(),
                "Grant Poracode's Remote Desktop portal request and retry. The portal controls the real pointer and keyboard.",
            ),
        )
    }

    fn prepare_native_wayland_input(
        &self,
        window: &WindowInfo,
        cancel: &CancelToken,
    ) -> std::result::Result<WindowInfo, Box<InteractiveResult>> {
        let portal_result = {
            let mut portal = self
                .portal
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            self.block_on(portal.prepare(cancel))
        };
        if let Err(error) = portal_result {
            return Err(Box::new(Self::native_wayland_refusal(window, &error)));
        }
        let focus = match self.block_on(atspi::focus_window(window)) {
            Ok(result) => result,
            Err(error) => return Err(Box::new(Self::native_wayland_refusal(window, &error))),
        };
        if !focus.ok {
            return Err(Box::new(focus));
        }
        if focus
            .delivery
            .as_ref()
            .is_some_and(|delivery| delivery.delivered == Delivered::Foreground)
        {
            Ok(focus.window)
        } else {
            Err(Box::new(InteractiveResult::refused(
                focus.window,
                Refusal::new(
                    RefusalCode::WaylandRawInputUnsupported,
                    "The target window could not be proven active before portal input.",
                    "Activate the target manually and retry, or use find_elements with invoke_element or set_element_value.",
                ),
            )))
        }
    }

    fn verify_effect(
        &self,
        window: &WindowInfo,
        before: Option<(i32, i32, u64)>,
        result: &mut InteractiveResult,
    ) {
        let Some((x, y, before)) = before else {
            return;
        };
        thread::sleep(Duration::from_millis(75));
        let after = self.capture(window, &CancelToken::default());
        if let Some(delivery) = &mut result.delivery {
            match after {
                Ok(capture) if capture.frame.crop(x, y, 32, 32).content_hash() != before => {
                    delivery.verified = Verified::Confirmed;
                }
                Ok(_) => delivery.verified = Verified::Unchanged,
                Err(_) => delivery
                    .notes
                    .push("effect_verification_unavailable".into()),
            }
        }
    }

    fn x11_window(window: &WindowInfo) -> Result<x11::ResolvedWindow> {
        x11::resolve(&WindowRef {
            app: Some(window.app.clone()),
            id: window.id,
            title: Some(window.title.clone()),
        })
    }

    fn merge_atspi_windows(&self, windows: &mut Vec<WindowInfo>) -> Result<()> {
        match self.block_on(atspi::windows()) {
            Ok(accessible) => {
                for accessible in accessible {
                    merge_discovered_window(windows, accessible.info);
                }
                Ok(())
            }
            Err(error) if !windows.is_empty() || self.display_server == DisplayServer::None => {
                log::debug!("AT-SPI window discovery unavailable: {error}");
                Ok(())
            }
            Err(error) => Err(error),
        }
    }
}

fn validate_launch_target(app: &str) -> Result<&str> {
    let app = app.trim();
    if app.is_empty() || app.contains('\0') || app.len() > 32_768 {
        return Err(HelperError::invalid_input(
            "app must be a non-empty executable name or absolute path",
        ));
    }
    if app.starts_with("//") || app.starts_with("\\\\") {
        return Err(HelperError::invalid_input(
            "UNC paths are not allowed for launch_app.",
        ));
    }
    if app.split_once(':').is_some_and(|(scheme, _)| {
        scheme
            .chars()
            .next()
            .is_some_and(|first| first.is_ascii_alphabetic())
            && scheme
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "+.-".contains(character))
    }) {
        return Err(HelperError::invalid_input(
            "URL schemes are not allowed for launch_app.",
        ));
    }
    let path = Path::new(app);
    if path
        .components()
        .any(|component| component == Component::ParentDir)
    {
        return Err(HelperError::invalid_input(
            "Parent traversal is not allowed for launch_app.",
        ));
    }
    if !path.is_absolute() && (app.contains('/') || app.contains('\\')) {
        return Err(HelperError::invalid_input(
            "Relative paths are not allowed for launch_app.",
        ));
    }
    Ok(app)
}

fn matches_launch_hints(window: &WindowInfo, hints: &[String]) -> bool {
    let display_name = window
        .display_name
        .as_deref()
        .unwrap_or_default()
        .to_lowercase();
    hints
        .iter()
        .any(|hint| window.matches_app(Some(hint)) || display_name == *hint)
}

fn pointer_verification_region(action: PointerAction) -> (i32, i32) {
    let (x, y) = match action {
        PointerAction::Click { x, y, .. } | PointerAction::Scroll { x, y, .. } => (x, y),
        PointerAction::Drag { to, .. } => to,
    };
    (x.round() as i32 - 16, y.round() as i32 - 16)
}

fn same_discovered_window(left: &WindowInfo, right: &WindowInfo) -> bool {
    if left.source == right.source {
        return left.id == right.id;
    }
    let same_process = left.pid.is_some() && left.pid == right.pid;
    let same_app = left.matches_app(Some(&right.app)) || right.matches_app(Some(&left.app));
    let close = |a: i32, b: i32| (i64::from(a) - i64::from(b)).abs() <= 32;
    (same_process || same_app)
        && !left.title.is_empty()
        && left.title == right.title
        && close(left.x, right.x)
        && close(left.y, right.y)
        && close(left.width, right.width)
        && close(left.height, right.height)
}

fn merge_discovered_window(windows: &mut Vec<WindowInfo>, candidate: WindowInfo) {
    if is_computer_use_overlay_title(&candidate.title)
        || windows
            .iter()
            .any(|window| same_discovered_window(window, &candidate))
    {
        return;
    }
    windows.push(candidate);
}

impl Backend for LinuxBackend {
    fn hello(&self) -> HelloInfo {
        let background_x11 = self.has_x11;
        let wayland = self.display_server == DisplayServer::Wayland;
        let mut notes = Vec::new();
        if wayland {
            notes.push(
                "Native Wayland windows use AT-SPI for semantic actions and the desktop portal for coordinate input."
                    .into(),
            );
        }
        if self.state_dir.is_none() && wayland {
            notes.push("Wayland portal permission cannot be restored without --state-dir.".into());
        }
        HelloInfo {
            platform: "linux",
            display_server: self.display_server.name(),
            capabilities: Capabilities {
                background_pointer: background_x11,
                background_keyboard: background_x11,
                background_chords: false,
                accessibility_tree: true,
                element_actions: true,
                occluded_capture: background_x11,
                foreground_input: self.display_server != DisplayServer::None,
                launch_app: true,
                stable_window_ids: self.display_server == DisplayServer::X11,
            },
            permissions: Permissions {
                accessibility: PermissionState::NotRequired,
                screen_recording: if wayland {
                    PermissionState::Unknown
                } else {
                    PermissionState::NotRequired
                },
            },
            screen_locked: false,
            notes,
        }
    }

    fn list_windows(&self) -> Result<Vec<WindowInfo>> {
        let mut windows = if self.has_x11 {
            x11::list_windows()?
        } else {
            Vec::new()
        };
        self.merge_atspi_windows(&mut windows)?;
        Ok(windows)
    }

    fn search_installed_apps(&self, query: &str) -> Result<Vec<crate::protocol::actions::AppInfo>> {
        self.installed_apps.search(query, apps::list)
    }

    fn resolve_window(&self, window: &WindowRef) -> Result<WindowInfo> {
        if self.has_x11
            && window.id >= 0
            && let Ok(resolved) = x11::resolve(window)
        {
            return Ok(resolved.info);
        }
        let requested = WindowInfo {
            app: window.app.clone().unwrap_or_default(),
            id: window.id,
            title: window.title.clone().unwrap_or_default(),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            pid: None,
            display_name: None,
            minimized: None,
            source: Some(WindowSource::Atspi),
        };
        Ok(self.block_on(atspi::resolve(&requested))?.info)
    }

    fn capture(&self, window: &WindowInfo, cancel: &CancelToken) -> Result<CaptureResult> {
        cancel.check()?;
        if window.source == Some(WindowSource::X11) {
            return x11::capture::capture(&Self::x11_window(window)?);
        }
        let mut portal = self
            .portal
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let desktop_bounds = self.has_x11.then(|| x11::desktop_bounds().ok()).flatten();
        self.block_on(portal.capture(window, desktop_bounds, cancel))
    }

    fn snapshot_tree(
        &self,
        window: &WindowInfo,
        max_nodes: usize,
        cancel: &CancelToken,
    ) -> Result<AccessibilityState> {
        self.block_on(atspi::snapshot_tree(
            &self.elements,
            window,
            max_nodes,
            cancel,
        ))
    }

    fn find_elements(
        &self,
        window: &WindowInfo,
        input: &FindElementsInput,
        cancel: &CancelToken,
    ) -> Result<FindElementsResult> {
        self.block_on(atspi::find_elements(&self.elements, window, input, cancel))
    }

    fn activate(&self, window: &WindowInfo) -> Result<InteractiveResult> {
        if window.source == Some(WindowSource::X11) {
            let context = x11::connect()?;
            return x11::input::activate(&context, &Self::x11_window(window)?);
        }
        self.block_on(atspi::focus_window(window))
    }

    fn pointer(
        &self,
        window: &WindowInfo,
        action: PointerAction,
        options: InputOptions,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        if window.source != Some(WindowSource::X11) {
            if options.mode == InputMode::Background {
                return Ok(InteractiveResult::refused(
                    window.clone(),
                    Refusal::background_unavailable(
                        "This window requires foreground pointer input.",
                    ),
                ));
            }
            let focused = match self.prepare_native_wayland_input(window, cancel) {
                Ok(window) => window,
                Err(refusal) => return Ok(*refusal),
            };
            let mut portal = self
                .portal
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            return Ok(self
                .block_on(portal.pointer(&focused, action, cancel))
                .unwrap_or_else(|error| Self::native_wayland_refusal(window, &error)));
        }
        let verification_point = pointer_verification_region(action);
        let before = (options.verify == Verify::Effect)
            .then(|| {
                self.capture(window, cancel).ok().map(|capture| {
                    let (x, y) = verification_point;
                    (x, y, capture.frame.crop(x, y, 32, 32).content_hash())
                })
            })
            .flatten();
        let mut result = x11::input::pointer(
            &Self::x11_window(window)?,
            action,
            options.mode == InputMode::Foreground,
            cancel,
        )?;
        self.verify_effect(window, before, &mut result);
        Ok(result)
    }

    fn keyboard(
        &self,
        window: &WindowInfo,
        action: KeyboardAction,
        options: InputOptions,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        if window.source != Some(WindowSource::X11) {
            if options.mode == InputMode::Background {
                return Ok(InteractiveResult::refused(
                    window.clone(),
                    Refusal::background_unavailable(
                        "This window requires foreground keyboard input.",
                    ),
                ));
            }
            let focused = match self.prepare_native_wayland_input(window, cancel) {
                Ok(window) => window,
                Err(refusal) => return Ok(*refusal),
            };
            let mut portal = self
                .portal
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            return Ok(self
                .block_on(portal.keyboard(&focused, &action, cancel))
                .unwrap_or_else(|error| Self::native_wayland_refusal(window, &error)));
        }
        let mut result = x11::input::keyboard(
            &Self::x11_window(window)?,
            &action,
            options.mode == InputMode::Foreground,
            cancel,
        )?;
        if options.verify == Verify::Effect
            && let Some(delivery) = &mut result.delivery
        {
            delivery
                .notes
                .push("effect_verification_unavailable".into());
        }
        Ok(result)
    }

    fn invoke_element(
        &self,
        window: &WindowInfo,
        element_id: &str,
        action: ElementAction,
    ) -> Result<InteractiveResult> {
        self.block_on(atspi::invoke_element(
            &self.elements,
            window,
            element_id,
            action,
        ))
    }

    fn set_element_value(
        &self,
        window: &WindowInfo,
        element_id: &str,
        value: &str,
    ) -> Result<InteractiveResult> {
        self.block_on(atspi::set_element_value(
            &self.elements,
            window,
            element_id,
            value,
        ))
    }

    /// `mode` is accepted for contract parity. Neither `gio launch` nor a bare
    /// exec offers a "do not activate" switch and the resulting window normally
    /// takes focus, so the launch is reported as foreground rather than
    /// claiming a background delivery it cannot guarantee.
    fn launch_app(
        &self,
        app: &str,
        _mode: InputMode,
        cancel: &CancelToken,
    ) -> Result<LaunchResult> {
        let app = validate_launch_target(app)?;
        let before: HashSet<i64> = self
            .list_windows()?
            .into_iter()
            .map(|window| window.id)
            .collect();
        let lower = app.to_ascii_lowercase();
        let desktop_file = Path::new(app).is_absolute()
            && Path::new(app)
                .extension()
                .is_some_and(|extension| extension == "desktop");
        let (mut command, launch_name, launch_hints) = if desktop_file {
            let mut command = Command::new("gio");
            command.args(["launch", app]);
            (command, app, apps::launch_hints(Path::new(app)))
        } else {
            match lower.as_str() {
                "terminal" => (
                    Command::new("x-terminal-emulator"),
                    "x-terminal-emulator",
                    Vec::new(),
                ),
                "files" | "file manager" => {
                    let mut command = Command::new("xdg-open");
                    command.arg(".");
                    (command, "xdg-open", Vec::new())
                }
                _ => (Command::new(app), app, Vec::new()),
            }
        };
        let mut child = command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| HelperError::internal(format!("Failed to launch {app}: {error}")))?;
        let launched_pid = child.id();
        thread::spawn(move || {
            let _ = child.wait();
        });
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            cancel.check()?;
            let windows = self.list_windows()?;
            let window = windows
                .iter()
                .find(|window| !desktop_file && window.pid == Some(launched_pid))
                .or_else(|| {
                    windows.iter().find(|window| {
                        !before.contains(&window.id)
                            && (window.matches_app(Some(app))
                                || window.matches_app(Some(launch_name))
                                || matches_launch_hints(window, &launch_hints))
                    })
                })
                .cloned();
            if let Some(window) = window {
                return Ok(LaunchResult::launched(Some(window), Delivered::Foreground));
            }
            thread::sleep(Duration::from_millis(100));
        }
        Ok(LaunchResult::launched(None, Delivered::Foreground)
            .with_note("Application launched, but no window appeared within 3 seconds."))
    }
}

#[cfg(test)]
mod tests {
    use super::LinuxBackend;
    use super::{
        matches_launch_hints, merge_discovered_window, pointer_verification_region,
        validate_launch_target,
    };
    use crate::backend::{
        Backend, BackendOptions, CancelToken, InputOptions, KeyboardAction, PointerAction,
    };
    use crate::protocol::actions::{InputMode, MouseButton, RefusalCode, Verify};
    use crate::protocol::window::{WindowInfo, WindowSource};

    fn window(id: i64, title: &str, x: i32, source: WindowSource) -> WindowInfo {
        WindowInfo {
            app: "/usr/bin/editor".into(),
            id,
            title: title.into(),
            x,
            y: 20,
            width: 800,
            height: 600,
            pid: Some(42),
            display_name: Some("Editor".into()),
            minimized: Some(false),
            source: Some(source),
        }
    }

    #[test]
    fn refuses_background_portal_input_before_connecting_or_focusing() {
        let backend = LinuxBackend::new(&BackendOptions { state_dir: None });
        let window = window(-1, "No actual window", 0, WindowSource::Atspi);
        let options = InputOptions {
            mode: InputMode::Background,
            verify: Verify::None,
        };
        let cancel = CancelToken::default();
        let pointer = backend
            .pointer(
                &window,
                PointerAction::Click {
                    x: 10.0,
                    y: 10.0,
                    button: MouseButton::Left,
                    count: 1,
                },
                options,
                &cancel,
            )
            .unwrap();
        let keyboard = backend
            .keyboard(
                &window,
                KeyboardAction::Type("test".into()),
                options,
                &cancel,
            )
            .unwrap();
        for result in [pointer, keyboard] {
            assert!(!result.ok);
            assert!(result.delivery.is_none());
            assert_eq!(
                result.refused.unwrap().code,
                RefusalCode::BackgroundUnavailable
            );
        }
    }

    #[test]
    fn validates_linux_launch_targets() {
        assert_eq!(validate_launch_target("gedit").unwrap(), "gedit");
        assert_eq!(
            validate_launch_target("/usr/bin/gedit").unwrap(),
            "/usr/bin/gedit"
        );
        for invalid in [
            "",
            "foo\0bar",
            "./tool",
            "folder/tool",
            "../tool",
            "/usr/../bin/tool",
            "//server/share/tool",
            "\\\\server\\share\\tool",
            "https://example.test/tool",
            "file:/tmp/tool",
        ] {
            assert!(
                validate_launch_target(invalid).is_err(),
                "accepted {invalid:?}"
            );
        }
    }

    #[test]
    fn desktop_launch_hints_do_not_accept_unrelated_titled_windows() {
        let firefox = WindowInfo {
            app: "/usr/bin/firefox".into(),
            id: 1,
            title: "Notes - Mozilla Firefox".into(),
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pid: Some(10),
            display_name: Some("Firefox".into()),
            minimized: Some(false),
            source: Some(WindowSource::X11),
        };
        assert!(!matches_launch_hints(&firefox, &["notes".into()]));

        let exact_title = WindowInfo {
            title: "Notes".into(),
            ..firefox.clone()
        };
        assert!(!matches_launch_hints(&exact_title, &["notes".into()]));

        let notes = WindowInfo {
            display_name: Some("Notes".into()),
            ..firefox
        };
        assert!(matches_launch_hints(&notes, &["notes".into()]));
    }

    #[test]
    fn verifies_pointer_effects_around_the_action_point() {
        assert_eq!(
            pointer_verification_region(PointerAction::Click {
                x: 40.0,
                y: 50.0,
                button: MouseButton::Left,
                count: 1,
            }),
            (24, 34)
        );
        assert_eq!(
            pointer_verification_region(PointerAction::Drag {
                from: (10.0, 20.0),
                to: (90.0, 100.0),
                steps: None,
            }),
            (74, 84)
        );
    }

    #[test]
    fn merges_only_equivalent_cross_source_windows() {
        let mut windows = vec![window(10, "First", 10, WindowSource::X11)];
        merge_discovered_window(&mut windows, window(-10, "First", 12, WindowSource::Atspi));
        assert_eq!(windows.len(), 1);

        merge_discovered_window(
            &mut windows,
            window(-11, "Second", 100, WindowSource::Atspi),
        );
        merge_discovered_window(&mut windows, window(-12, "Third", 200, WindowSource::Atspi));
        assert_eq!(windows.len(), 3);
    }

    #[test]
    fn excludes_only_the_exact_overlay_from_atspi_merging() {
        let mut windows = Vec::new();
        merge_discovered_window(
            &mut windows,
            window(
                -10,
                "Poracode Computer Use Overlay",
                10,
                WindowSource::Atspi,
            ),
        );
        merge_discovered_window(
            &mut windows,
            window(
                -11,
                "Poracode Computer Use Overlay - Document",
                20,
                WindowSource::Atspi,
            ),
        );
        assert_eq!(windows.len(), 1);
    }
}
