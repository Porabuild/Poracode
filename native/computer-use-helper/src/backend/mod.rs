//! Platform backend trait. One implementation per OS lives in a `cfg`-gated
//! submodule; `current()` picks it at startup.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::capture::CaptureResult;
use crate::protocol::actions::{
    AccessibilityState, AppInfo, Capabilities, ElementAction, FindElementsInput,
    FindElementsResult, Hello, InputMode, InteractiveResult, LaunchResult, MouseButton,
    PermissionState, Permissions, Refusal, RefusalCode, Verify, group_apps, merge_installed_apps,
};
use crate::protocol::keys::Chord;
use crate::protocol::version::{HELPER_VERSION, MIN_CLIENT_PROTOCOL_VERSION, PROTOCOL_VERSION};
use crate::protocol::window::{WindowInfo, WindowRef};
use crate::protocol::{ErrorCode, HelperError, Result};

#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(windows)]
pub mod windows;

pub(crate) const COMPUTER_USE_OVERLAY_TITLE: &str = "Poracode Computer Use Overlay";

pub(crate) fn is_computer_use_overlay_title(title: &str) -> bool {
    title == COMPUTER_USE_OVERLAY_TITLE
}

/// Cooperative cancellation. Long loops check it between steps; native calls
/// in flight are not interrupted.
#[derive(Debug, Clone, Default)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }

    pub fn check(&self) -> Result<()> {
        if self.is_cancelled() {
            Err(HelperError::new(ErrorCode::Cancelled, "request cancelled"))
        } else {
            Ok(())
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PointerAction {
    Click {
        x: f64,
        y: f64,
        button: MouseButton,
        count: u32,
    },
    Scroll {
        x: f64,
        y: f64,
        dx: f64,
        dy: f64,
    },
    Drag {
        from: (f64, f64),
        to: (f64, f64),
        steps: Option<u32>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KeyboardAction {
    Type(String),
    Chord(Chord),
}

#[derive(Debug, Clone, Copy)]
pub struct InputOptions {
    pub mode: InputMode,
    pub verify: Verify,
}

pub struct HelloInfo {
    pub platform: &'static str,
    pub display_server: Option<String>,
    pub capabilities: Capabilities,
    pub permissions: Permissions,
    pub notes: Vec<String>,
}

pub fn arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    }
}

pub fn build_hello(info: HelloInfo) -> Hello {
    Hello {
        protocol_version: PROTOCOL_VERSION,
        min_client_protocol_version: MIN_CLIENT_PROTOCOL_VERSION,
        helper_version: HELPER_VERSION.to_string(),
        platform: info.platform,
        arch: arch(),
        display_server: info.display_server,
        capabilities: info.capabilities,
        permissions: info.permissions,
        notes: info.notes,
    }
}

pub fn capability_unavailable(window: WindowInfo, what: &str) -> InteractiveResult {
    InteractiveResult::refused(
        window,
        Refusal::new(
            RefusalCode::CapabilityUnavailable,
            format!("{what} is not available on this platform."),
            "Use coordinate actions from the latest get_window_state screenshot instead.",
        ),
    )
}

pub trait Backend: Send + Sync {
    fn hello(&self) -> HelloInfo;

    fn list_windows(&self) -> Result<Vec<WindowInfo>>;

    fn search_installed_apps(&self, _query: &str) -> Result<Vec<AppInfo>> {
        Ok(Vec::new())
    }

    fn list_apps(&self, query: Option<&str>) -> Result<Vec<AppInfo>> {
        let mut running = group_apps(self.list_windows()?);
        let Some(query) = query else {
            return Ok(running);
        };
        running.retain(|app| app.matches_query(query));
        Ok(merge_installed_apps(
            running,
            self.search_installed_apps(query)?,
        ))
    }

    /// Exact id first, then recovery by app/title (parity with the PowerShell
    /// `Require-Window`), else `window_unavailable`.
    fn resolve_window(&self, window: &WindowRef) -> Result<WindowInfo>;

    fn capture(&self, window: &WindowInfo, cancel: &CancelToken) -> Result<CaptureResult>;

    fn snapshot_tree(
        &self,
        window: &WindowInfo,
        _max_nodes: usize,
        _cancel: &CancelToken,
    ) -> Result<AccessibilityState> {
        let _ = window;
        Err(HelperError::internal(
            "accessibility tree is not available on this platform",
        ))
    }

    fn find_elements(
        &self,
        window: &WindowInfo,
        _input: &FindElementsInput,
        _cancel: &CancelToken,
    ) -> Result<FindElementsResult> {
        let _ = window;
        Err(HelperError::internal(
            "find_elements is not available on this platform",
        ))
    }

    fn activate(&self, window: &WindowInfo) -> Result<InteractiveResult>;

    fn pointer(
        &self,
        window: &WindowInfo,
        action: PointerAction,
        options: InputOptions,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult>;

    fn keyboard(
        &self,
        window: &WindowInfo,
        action: KeyboardAction,
        options: InputOptions,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult>;

    fn invoke_element(
        &self,
        window: &WindowInfo,
        _element_id: &str,
        _action: ElementAction,
    ) -> Result<InteractiveResult> {
        Ok(capability_unavailable(window.clone(), "invoke_element"))
    }

    fn set_element_value(
        &self,
        window: &WindowInfo,
        _element_id: &str,
        _value: &str,
    ) -> Result<InteractiveResult> {
        Ok(capability_unavailable(window.clone(), "set_element_value"))
    }

    fn launch_app(&self, app: &str, cancel: &CancelToken) -> Result<LaunchResult>;
}

/// Backend for hosts we cannot drive at all (no display, unknown OS).
pub struct UnsupportedBackend {
    pub reason: String,
}

impl UnsupportedBackend {
    fn unavailable<T>(&self) -> Result<T> {
        Err(HelperError::internal(self.reason.clone()))
    }
}

impl Backend for UnsupportedBackend {
    fn hello(&self) -> HelloInfo {
        HelloInfo {
            platform: current_platform_name(),
            display_server: None,
            capabilities: Capabilities::default(),
            permissions: Permissions {
                accessibility: PermissionState::Unknown,
                screen_recording: PermissionState::Unknown,
            },
            notes: vec![self.reason.clone()],
        }
    }

    fn list_windows(&self) -> Result<Vec<WindowInfo>> {
        self.unavailable()
    }

    fn resolve_window(&self, _window: &WindowRef) -> Result<WindowInfo> {
        Err(HelperError::window_unavailable())
    }

    fn capture(&self, _window: &WindowInfo, _cancel: &CancelToken) -> Result<CaptureResult> {
        self.unavailable()
    }

    fn activate(&self, _window: &WindowInfo) -> Result<InteractiveResult> {
        self.unavailable()
    }

    fn pointer(
        &self,
        _window: &WindowInfo,
        _action: PointerAction,
        _options: InputOptions,
        _cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        self.unavailable()
    }

    fn keyboard(
        &self,
        _window: &WindowInfo,
        _action: KeyboardAction,
        _options: InputOptions,
        _cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        self.unavailable()
    }

    fn launch_app(&self, _app: &str, _cancel: &CancelToken) -> Result<LaunchResult> {
        self.unavailable()
    }
}

pub fn current_platform_name() -> &'static str {
    if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        std::env::consts::OS
    }
}

pub struct BackendOptions {
    pub state_dir: Option<std::path::PathBuf>,
}

/// Pick the backend for this host.
pub fn current(options: &BackendOptions) -> Arc<dyn Backend> {
    let _ = options;
    #[cfg(windows)]
    {
        return Arc::new(windows::WindowsBackend::new());
    }
    #[cfg(target_os = "linux")]
    {
        return Arc::new(linux::LinuxBackend::new(options));
    }
    #[cfg(target_os = "macos")]
    {
        return Arc::new(macos::MacOsBackend::new());
    }
    #[allow(unreachable_code)]
    Arc::new(UnsupportedBackend {
        reason: format!(
            "The background computer-use backend for {} is not available in this build.",
            std::env::consts::OS
        ),
    })
}
