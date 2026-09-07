mod activate;
mod apps;
mod capture;
mod input;
mod keys;
mod launch;
mod security;
mod uia;
mod window_list;

const SHELL_APPS_FOLDER_PREFIX: &str = r"shell:AppsFolder\";

fn shell_apps_folder_id(app_id: &str) -> String {
    format!("{SHELL_APPS_FOLDER_PREFIX}{app_id}")
}

use std::sync::Arc;
use std::thread;
use std::time::Duration;

use windows::Win32::UI::HiDpi::{
    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext,
};

use crate::backend::{
    Backend, CancelToken, HelloInfo, InputOptions, InstalledAppCache, KeyboardAction,
    PointerAction, verify_effect_with_early_check,
};
use crate::capture::CaptureResult;
use crate::elements::SnapshotCache;
use crate::protocol::actions::{
    AccessibilityState, Capabilities, DeliveryTarget, ElementAction, FindElementsInput,
    FindElementsResult, InputMode, InteractiveResult, LaunchResult, MouseButton, PermissionState,
    Permissions, Route, Verified, Verify,
};
use crate::protocol::keys::{KeyToken, NamedKey};
use crate::protocol::window::{WindowInfo, WindowRef};
use crate::protocol::{ErrorCode, Result};

pub struct WindowsBackend {
    elements: SnapshotCache<Vec<i32>>,
    installed_apps: Arc<InstalledAppCache>,
}

impl WindowsBackend {
    pub fn new() -> Self {
        // SAFETY: this is a process-wide idempotent DPI-awareness request made
        // before the helper starts dispatching window geometry work.
        let _ =
            unsafe { SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
        let installed_apps = Arc::new(InstalledAppCache::default());
        installed_apps.prewarm(apps::list);
        Self {
            elements: SnapshotCache::default(),
            installed_apps,
        }
    }

    fn capture_hash_at(&self, window: &WindowInfo, point: (f64, f64)) -> Option<u64> {
        capture::capture(window).ok().map(|capture| {
            capture
                .frame
                .crop(
                    point.0.round() as i32 - 16,
                    point.1.round() as i32 - 16,
                    32,
                    32,
                )
                .content_hash()
        })
    }

    fn apply_effect_verification(
        &self,
        window: &WindowInfo,
        verify: Verify,
        point: (f64, f64),
        before: Option<u64>,
        mut result: InteractiveResult,
    ) -> InteractiveResult {
        if verify != Verify::Effect || result.delivery.is_none() {
            return result;
        }
        if let Some(delivery) = &mut result.delivery {
            delivery.verified =
                verify_effect_with_early_check(before, || self.capture_hash_at(window, point));
        }
        result
    }

    fn refresh_result_window(mut result: InteractiveResult) -> InteractiveResult {
        if result.delivery.is_some() {
            // Every route can return before the target commits a resulting
            // minimize, maximize, or bounds change to the top-level window --
            // UIA Invoke and posted messages both do -- so the reported window
            // (and any `observe` state derived from it) needs a settle window.
            thread::sleep(Duration::from_millis(50));
        }
        let window = &result.window;
        if let Some(fresh) =
            window_list::window_from_hwnd(window_list::hwnd_from_id(window.id), true)
                .filter(|fresh| same_window_generation(window, fresh))
        {
            // Keep the resolved identity fields; HWND values can be recycled
            // after a window closes, while these mutable fields may legitimately change.
            result.window.x = fresh.x;
            result.window.y = fresh.y;
            result.window.width = fresh.width;
            result.window.height = fresh.height;
            result.window.minimized = fresh.minimized;
        }
        result
    }
}

fn same_window_generation(original: &WindowInfo, fresh: &WindowInfo) -> bool {
    original.id == fresh.id
        && original.app.eq_ignore_ascii_case(&fresh.app)
        && original.title == fresh.title
        && match (original.pid, fresh.pid) {
            (Some(original), Some(fresh)) => original == fresh,
            (Some(_), None) => false,
            (None, _) => true,
        }
}

impl Default for WindowsBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl Backend for WindowsBackend {
    fn hello(&self) -> HelloInfo {
        HelloInfo {
            platform: "win32",
            display_server: None,
            capabilities: Capabilities {
                background_pointer: true,
                background_keyboard: true,
                background_chords: false,
                accessibility_tree: true,
                element_actions: true,
                occluded_capture: true,
                foreground_input: true,
                launch_app: true,
                stable_window_ids: false,
            },
            permissions: Permissions {
                accessibility: PermissionState::NotRequired,
                screen_recording: PermissionState::NotRequired,
            },
            // Windows has no equivalent probe wired up here; the secure-desktop
            // refusals already cover locked-workstation input.
            screen_locked: false,
            notes: vec![
                "Background delivery uses UI Automation where possible and window messages otherwise."
                    .into(),
            ],
        }
    }

    fn list_windows(&self) -> Result<Vec<WindowInfo>> {
        Ok(window_list::list_windows())
    }

    fn search_installed_apps(&self, query: &str) -> Result<Vec<crate::protocol::actions::AppInfo>> {
        self.installed_apps.search(query, apps::list)
    }

    fn resolve_window(&self, window: &WindowRef) -> Result<WindowInfo> {
        window_list::resolve_window(window)
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
        uia::snapshot_tree(&self.elements, window, max_nodes, cancel)
    }

    fn find_elements(
        &self,
        window: &WindowInfo,
        input: &FindElementsInput,
        cancel: &CancelToken,
    ) -> Result<FindElementsResult> {
        uia::find_elements(&self.elements, window, input, cancel)
    }

    fn activate(&self, window: &WindowInfo) -> Result<InteractiveResult> {
        let window = activate::activate(window)?;
        Ok(InteractiveResult::delivered(
            window,
            crate::protocol::actions::Delivery::foreground(Route::Input)
                .with_verified(Verified::Confirmed),
        ))
    }

    fn pointer(
        &self,
        window: &WindowInfo,
        action: PointerAction,
        options: InputOptions,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        let window = if options.mode == InputMode::Foreground {
            activate::activate(window)?
        } else {
            window.clone()
        };
        let verification_point = match action {
            PointerAction::Click { x, y, .. } | PointerAction::Scroll { x, y, .. } => (x, y),
            PointerAction::Drag { to, .. } => to,
        };
        let before = (options.verify == Verify::Effect)
            .then(|| self.capture_hash_at(&window, verification_point))
            .flatten();
        let semantic = if options.mode == InputMode::Background
            && let PointerAction::Click {
                x,
                y,
                button: MouseButton::Left,
                count: 1,
            } = action
        {
            match uia::invoke_at_position(&self.elements, &window, x, y, cancel) {
                Ok(result) => result,
                Err(error) if error.code == ErrorCode::Cancelled => return Err(error),
                Err(_) => None,
            }
        } else {
            None
        };
        let result = if let Some(result) = semantic {
            result
        } else {
            input::pointer(&window, action, options.mode, cancel)?
        };
        Ok(Self::refresh_result_window(self.apply_effect_verification(
            &window,
            options.verify,
            verification_point,
            before,
            result,
        )))
    }

    fn keyboard(
        &self,
        window: &WindowInfo,
        action: KeyboardAction,
        options: InputOptions,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        let window = if options.mode == InputMode::Foreground {
            activate::activate(window)?
        } else {
            window.clone()
        };
        let is_semantic_activation = matches!(
            &action,
            KeyboardAction::Chord(chord)
                if !chord.modifiers.any()
                    && matches!(chord.keys.as_slice(), [KeyToken::Named(NamedKey::Return | NamedKey::Space)])
        );
        let result = if options.mode == InputMode::Background && is_semantic_activation {
            match uia::invoke_focused(&window) {
                Ok(Some(result)) => result,
                Ok(None) | Err(_) => input::keyboard(&window, &action, options.mode, cancel)?,
            }
        } else {
            input::keyboard(&window, &action, options.mode, cancel)?
        };
        Ok(Self::refresh_result_window(result))
    }

    fn invoke_element(
        &self,
        window: &WindowInfo,
        element_id: &str,
        action: ElementAction,
    ) -> Result<InteractiveResult> {
        if action != ElementAction::Click {
            let result = uia::invoke_element(&self.elements, window, element_id, action)?;
            return Ok(Self::refresh_result_window(result));
        }
        let (element, moved) = match uia::live_element_info(&self.elements, window, element_id) {
            Ok(element) => element,
            Err(refusal) => return Ok(InteractiveResult::refused(window.clone(), refusal)),
        };
        if element.actions.contains(&ElementAction::Invoke) {
            let mut result =
                uia::invoke_element(&self.elements, window, element_id, ElementAction::Invoke)?;
            if moved && let Some(delivery) = &mut result.delivery {
                delivery.notes.push("element_moved".into());
            }
            return Ok(Self::refresh_result_window(result));
        }
        let (x, y) = element.bounds.center();
        let mut result = input::pointer(
            window,
            PointerAction::Click {
                x: f64::from(x),
                y: f64::from(y),
                button: crate::protocol::actions::MouseButton::Left,
                count: 1,
            },
            InputMode::Background,
            &CancelToken::default(),
        )?;
        if let Some(delivery) = &mut result.delivery {
            if moved {
                delivery.notes.push("element_moved".into());
            }
            delivery.target = Some(DeliveryTarget {
                kind: "uia".into(),
                id: element_id.into(),
                role: Some(element.role),
                name: element.name,
            });
        }
        Ok(Self::refresh_result_window(result))
    }

    fn set_element_value(
        &self,
        window: &WindowInfo,
        element_id: &str,
        value: &str,
    ) -> Result<InteractiveResult> {
        let result = uia::set_element_value(&self.elements, window, element_id, value)?;
        Ok(Self::refresh_result_window(result))
    }

    /// `mode` is accepted for contract parity. `ShellExecute` activates the
    /// launched app, so the result honestly reports a foreground delivery.
    fn launch_app(
        &self,
        app: &str,
        _mode: InputMode,
        cancel: &CancelToken,
    ) -> Result<LaunchResult> {
        launch::launch_app(app, cancel)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::window::WindowSource;

    fn window(pid: u32, title: &str) -> WindowInfo {
        WindowInfo {
            app: "C:\\Program Files\\Example\\app.exe".into(),
            id: 42,
            title: title.into(),
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pid: Some(pid),
            display_name: Some("app".into()),
            minimized: Some(false),
            source: Some(WindowSource::Win32),
        }
    }

    #[test]
    fn rejects_reused_window_handles_from_another_process_or_title() {
        let original = window(10, "Original");
        assert!(same_window_generation(&original, &window(10, "Original")));
        assert!(!same_window_generation(&original, &window(11, "Original")));
        assert!(!same_window_generation(
            &original,
            &window(10, "Replacement")
        ));
    }
}
