//! Platform backend trait. One implementation per OS lives in a `cfg`-gated
//! submodule; `current()` picks it at startup.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::capture::CaptureResult;
#[cfg(any(target_os = "windows", target_os = "macos", test))]
use crate::protocol::actions::Verified;
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
const INSTALLED_APP_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
const MAX_INSTALLED_APP_RESULTS: usize = 50;
#[cfg(any(target_os = "windows", target_os = "macos", test))]
const EFFECT_EARLY_CHECK: Duration = Duration::from_millis(25);
#[cfg(any(target_os = "windows", target_os = "macos", test))]
const EFFECT_FINAL_CHECK: Duration = Duration::from_millis(150);

pub(crate) fn is_computer_use_overlay_title(title: &str) -> bool {
    title == COMPUTER_USE_OVERLAY_TITLE
}

struct CachedInstalledApps {
    loaded_at: Instant,
    apps: Vec<AppInfo>,
}

#[derive(Default)]
pub(crate) struct InstalledAppCache {
    cached: Mutex<Option<CachedInstalledApps>>,
}

impl InstalledAppCache {
    fn lock(&self) -> std::sync::MutexGuard<'_, Option<CachedInstalledApps>> {
        self.cached
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub(crate) fn search(
        &self,
        query: &str,
        load: impl FnOnce() -> Result<Vec<AppInfo>>,
    ) -> Result<Vec<AppInfo>> {
        // The loader shells out on Windows and walks the application
        // directories elsewhere, so it must never run while the mutex is held:
        // `list_apps` shares one passive lane with capture and element queries,
        // and the prewarm thread would otherwise stall that whole lane.
        let stale = self
            .lock()
            .as_ref()
            .is_none_or(|cached| cached.loaded_at.elapsed() >= INSTALLED_APP_CACHE_TTL);
        if stale {
            let started = Instant::now();
            let apps = load()?;
            let mut cached = self.lock();
            // A concurrent loader (typically `prewarm`) may have finished while
            // this one was running; keep whichever snapshot is newer.
            if cached
                .as_ref()
                .is_none_or(|cached| cached.loaded_at <= started)
            {
                *cached = Some(CachedInstalledApps {
                    loaded_at: Instant::now(),
                    apps,
                });
            }
        }
        let mut matches = self
            .lock()
            .as_ref()
            .map(|cached| {
                cached
                    .apps
                    .iter()
                    .filter(|app| app.matches_query(query))
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        matches.truncate(MAX_INSTALLED_APP_RESULTS);
        Ok(matches)
    }

    pub(crate) fn prewarm(self: &Arc<Self>, load: fn() -> Result<Vec<AppInfo>>) {
        let cache = Arc::clone(self);
        let _ = thread::Builder::new()
            .name("computer-use-app-catalog".into())
            .spawn(move || {
                let _ = cache.search("", load);
            });
    }
}

#[cfg(any(target_os = "windows", target_os = "macos", test))]
pub(crate) fn verify_effect_with_early_check(
    before: Option<u64>,
    capture: impl Fn() -> Option<u64>,
) -> Verified {
    let Some(before) = before else {
        return Verified::Unverified;
    };
    thread::sleep(EFFECT_EARLY_CHECK);
    match capture() {
        Some(after) if after != before => return Verified::Confirmed,
        Some(_) | None => {}
    }
    thread::sleep(EFFECT_FINAL_CHECK.saturating_sub(EFFECT_EARLY_CHECK));
    match capture() {
        Some(after) if after != before => Verified::Confirmed,
        Some(_) => Verified::Unchanged,
        None => Verified::Unverified,
    }
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
    /// Whether the console screen is locked right now. Hosts that cannot tell
    /// report `false`.
    pub screen_locked: bool,
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
        screen_locked: info.screen_locked,
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
        let installed = match self.search_installed_apps(query) {
            Ok(installed) => installed,
            Err(error) => {
                log::debug!("installed-app discovery failed; returning running matches: {error}");
                Vec::new()
            }
        };
        Ok(merge_installed_apps(running, installed))
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

    /// Launch an app. `mode` is the caller's request: `background` must not
    /// take the user's focus. A backend that cannot honor `background` still
    /// launches and reports `delivered: "foreground"` honestly.
    fn launch_app(&self, app: &str, mode: InputMode, cancel: &CancelToken) -> Result<LaunchResult>;

    /// Notes that describe the whole desktop session rather than one window
    /// (for example a locked screen). Appended to every passive observation.
    fn session_notes(&self) -> Vec<String> {
        Vec::new()
    }
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
            screen_locked: false,
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

    fn launch_app(
        &self,
        _app: &str,
        _mode: InputMode,
        _cancel: &CancelToken,
    ) -> Result<LaunchResult> {
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

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    #[test]
    fn installed_app_cache_loads_once_and_filters_unicode_queries() {
        let cache = InstalledAppCache::default();
        let loads = AtomicUsize::new(0);
        let load = || {
            loads.fetch_add(1, Ordering::SeqCst);
            Ok(vec![
                AppInfo::installed("calculator".into(), "КАЛЬКУЛЯТОР".into()),
                AppInfo::installed("paint".into(), "Paint".into()),
            ])
        };

        assert_eq!(cache.search("калькулятор", load).unwrap().len(), 1);
        assert_eq!(cache.search("paint", load).unwrap().len(), 1);
        assert_eq!(loads.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn installed_app_cache_retries_after_a_loader_failure() {
        let cache = InstalledAppCache::default();
        assert!(
            cache
                .search("paint", || Err(HelperError::internal("temporary")))
                .is_err()
        );
        assert_eq!(
            cache
                .search("paint", || {
                    Ok(vec![AppInfo::installed("paint".into(), "Paint".into())])
                })
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn effect_verification_without_a_baseline_returns_immediately() {
        let captures = AtomicUsize::new(0);
        let verified = verify_effect_with_early_check(None, || {
            captures.fetch_add(1, Ordering::SeqCst);
            Some(1)
        });

        assert_eq!(verified, Verified::Unverified);
        assert_eq!(captures.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn effect_verification_retries_after_an_unavailable_early_capture() {
        let captures = AtomicUsize::new(0);
        let verified = verify_effect_with_early_check(Some(1), || {
            if captures.fetch_add(1, Ordering::SeqCst) == 0 {
                None
            } else {
                Some(2)
            }
        });

        assert_eq!(verified, Verified::Confirmed);
        assert_eq!(captures.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn effect_verification_is_unverified_when_both_captures_are_unavailable() {
        let captures = AtomicUsize::new(0);
        let verified = verify_effect_with_early_check(Some(1), || {
            captures.fetch_add(1, Ordering::SeqCst);
            None
        });

        assert_eq!(verified, Verified::Unverified);
        assert_eq!(captures.load(Ordering::SeqCst), 2);
    }
}
