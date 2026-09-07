use std::collections::HashMap;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use crossbeam_channel::{Receiver, Sender, bounded, unbounded};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::backend::{
    Backend, CancelToken, InputOptions, KeyboardAction, PointerAction, build_hello,
};
use crate::capture::{EncodeOptions, downscale_note, encode_screenshot};
use crate::geometry::point_in_frame;
use crate::protocol::actions::{
    ClickInput, DragInput, FindElementsInput, GetWindowStateInput, HelloInput, InvokeElementInput,
    LaunchAppInput, ListAppsInput, PressKeyInput, ScrollInput, SetElementValueInput, TypeTextInput,
    WindowOnlyInput, WindowStateResult,
};
use crate::protocol::keys::parse_chord;
use crate::protocol::version::{MIN_CLIENT_PROTOCOL_VERSION, PROTOCOL_VERSION};
use crate::protocol::window::WindowRef;
use crate::protocol::{ErrorCode, HelperError, Request, RequestId, Response, Result};

use super::writer::LineWriter;

const MAX_ABANDONED_THREADS: usize = 3;

/// Prefix of the `get_window_state` note that explains why `screenshots` is
/// empty even though the caller asked for one.
const CAPTURE_FAILED_NOTE: &str = "capture_failed";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Lane {
    Input,
    Passive,
}

struct Job {
    request: Request,
    cancel: CancelToken,
}

pub struct SubmitError {
    pub id: Option<RequestId>,
    pub error: HelperError,
}

pub struct Dispatcher {
    input_tx: Option<Sender<Job>>,
    passive_tx: Option<Sender<Job>>,
    threads: Vec<JoinHandle<()>>,
    cancellations: Arc<Mutex<HashMap<RequestId, CancelToken>>>,
}

impl Dispatcher {
    pub fn new(backend: Arc<dyn Backend>, writer: LineWriter) -> Self {
        let cancellations = Arc::new(Mutex::new(HashMap::new()));
        let abandoned = Arc::new(AtomicUsize::new(0));
        let (input_tx, input_rx) = unbounded();
        let (passive_tx, passive_rx) = unbounded();
        let threads = vec![
            spawn_lane(
                "computer-use-input",
                input_rx,
                backend.clone(),
                writer.clone(),
                cancellations.clone(),
                abandoned.clone(),
            ),
            spawn_lane(
                "computer-use-passive",
                passive_rx,
                backend,
                writer,
                cancellations.clone(),
                abandoned,
            ),
        ];
        Self {
            input_tx: Some(input_tx),
            passive_tx: Some(passive_tx),
            threads,
            cancellations,
        }
    }

    pub fn submit(&self, request: Request) -> std::result::Result<(), SubmitError> {
        let id = request.id;
        let cancel = CancelToken::default();
        {
            let mut cancellations = self.cancellations.lock().unwrap_or_else(|p| p.into_inner());
            if cancellations.contains_key(&id) {
                return Err(SubmitError {
                    id: Some(id),
                    error: HelperError::invalid_input(format!("request id {id} is already active")),
                });
            }
            cancellations.insert(id, cancel.clone());
        }
        let sender = match lane_for(&request.action) {
            Lane::Input => self.input_tx.as_ref(),
            Lane::Passive => self.passive_tx.as_ref(),
        };
        if sender.is_none_or(|sender| sender.send(Job { request, cancel }).is_err()) {
            self.cancellations
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .remove(&id);
            return Err(SubmitError {
                id: Some(id),
                error: HelperError::internal("dispatcher is shutting down"),
            });
        }
        Ok(())
    }

    pub fn cancel(&self, id: RequestId) -> bool {
        let cancellations = self.cancellations.lock().unwrap_or_else(|p| p.into_inner());
        cancellations.get(&id).is_some_and(|token| {
            token.cancel();
            true
        })
    }

    pub fn shutdown(&mut self) {
        self.input_tx.take();
        self.passive_tx.take();
        for thread in self.threads.drain(..) {
            let _ = thread.join();
        }
        self.cancellations
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clear();
    }
}

impl Drop for Dispatcher {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn lane_for(action: &str) -> Lane {
    match action {
        "activate_window" | "click" | "press_key" | "type_text" | "scroll" | "drag"
        | "launch_app" | "invoke_element" | "set_element_value" => Lane::Input,
        _ => Lane::Passive,
    }
}

fn timeout_for(action: &str) -> Duration {
    match action {
        "launch_app" => Duration::from_secs(20),
        "list_apps" | "get_window_state" | "find_elements" => Duration::from_secs(6),
        "activate_window" | "click" | "press_key" | "type_text" | "scroll" | "drag"
        | "invoke_element" | "set_element_value" => Duration::from_secs(5),
        _ => Duration::from_secs(3),
    }
}

fn spawn_lane(
    name: &'static str,
    jobs: Receiver<Job>,
    backend: Arc<dyn Backend>,
    writer: LineWriter,
    cancellations: Arc<Mutex<HashMap<RequestId, CancelToken>>>,
    abandoned: Arc<AtomicUsize>,
) -> JoinHandle<()> {
    std::thread::Builder::new()
        .name(name.into())
        .spawn(move || {
            for job in jobs {
                let id = job.request.id;
                let action = job.request.action.clone();
                let (result_tx, result_rx) = bounded(1);
                let backend = backend.clone();
                let worker_cancel = job.cancel.clone();
                std::thread::Builder::new()
                    .name(format!("computer-use-{action}-{id}"))
                    .spawn(move || {
                        let result = catch_unwind(AssertUnwindSafe(|| {
                            dispatch_platform_request(
                                backend.as_ref(),
                                &job.request,
                                &worker_cancel,
                            )
                        }))
                        .unwrap_or_else(|_| Err(HelperError::internal("request handler panicked")));
                        let _ = result_tx.send(result);
                    })
                    .expect("spawn request worker");

                let response = match result_rx.recv_timeout(timeout_for(&action)) {
                    Ok(Ok(result)) => Response::ok(id, result),
                    Ok(Err(error)) => Response::err(Some(id), &error),
                    Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                        job.cancel.cancel();
                        let error =
                            HelperError::new(ErrorCode::Timeout, format!("{action} timed out"));
                        let response = Response::err(Some(id), &error);
                        let _ = writer.send(response.to_line());
                        cancellations
                            .lock()
                            .unwrap_or_else(|p| p.into_inner())
                            .remove(&id);
                        if abandoned.fetch_add(1, Ordering::SeqCst) + 1 >= MAX_ABANDONED_THREADS {
                            log::error!(
                                "too many timed-out native calls; exiting for host recycle"
                            );
                            std::process::exit(3);
                        }
                        continue;
                    }
                    Err(crossbeam_channel::RecvTimeoutError::Disconnected) => Response::err(
                        Some(id),
                        &HelperError::internal("request worker disconnected"),
                    ),
                };
                cancellations
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .remove(&id);
                if !writer.send(response.to_line()) {
                    break;
                }
            }
        })
        .expect("spawn dispatcher lane")
}

fn dispatch_platform_request(
    backend: &dyn Backend,
    request: &Request,
    cancel: &CancelToken,
) -> Result<Value> {
    #[cfg(target_os = "macos")]
    {
        objc2::rc::autoreleasepool(|_| dispatch_request(backend, request, cancel))
    }
    #[cfg(not(target_os = "macos"))]
    {
        dispatch_request(backend, request, cancel)
    }
}

fn parse<T: DeserializeOwned>(input: &Value) -> Result<T> {
    serde_json::from_value(input.clone()).map_err(HelperError::from)
}

fn serialize<T: Serialize>(result: T) -> Result<Value> {
    serde_json::to_value(result).map_err(|error| HelperError::internal(error.to_string()))
}

fn parse_window(input: &Value) -> Result<WindowRef> {
    if let Ok(input) = serde_json::from_value::<WindowOnlyInput>(input.clone()) {
        return Ok(input.window);
    }
    parse(input)
}

fn validate_pointer_action(
    window: &crate::protocol::window::WindowInfo,
    action: &PointerAction,
) -> Result<()> {
    let validate = |label: &str, x: f64, y: f64| {
        if point_in_frame(window, x, y) {
            Ok(())
        } else {
            Err(HelperError::invalid_input(format!(
                "{label} coordinate ({x},{y}) is outside the {}x{} window frame",
                window.width, window.height
            )))
        }
    };
    match action {
        PointerAction::Click { x, y, .. } => validate("click", *x, *y),
        PointerAction::Scroll { x, y, .. } => validate("scroll", *x, *y),
        PointerAction::Drag { from, to, .. } => {
            validate("drag start", from.0, from.1)?;
            validate("drag end", to.0, to.1)
        }
    }
}

fn validate_pointer_action_before_dispatch(
    window: &crate::protocol::window::WindowInfo,
    action: &PointerAction,
) -> Result<()> {
    #[cfg(target_os = "windows")]
    if window.minimized == Some(true) {
        // GetWindowRect reports the small iconic frame while a window is
        // minimized. The Windows backend must either refuse background input
        // or restore and re-resolve the window before validating foreground
        // coordinates against its usable frame.
        return Ok(());
    }
    validate_pointer_action(window, action)
}

pub fn dispatch_request(
    backend: &dyn Backend,
    request: &Request,
    cancel: &CancelToken,
) -> Result<Value> {
    cancel.check()?;
    match request.action.as_str() {
        "hello" => {
            let input: HelloInput = parse(&request.input)?;
            if let Some(version) = input.protocol_version
                && !(MIN_CLIENT_PROTOCOL_VERSION..=PROTOCOL_VERSION).contains(&version)
            {
                return Err(HelperError::new(
                    ErrorCode::ProtocolMismatch,
                    format!(
                        "client protocol {version} is incompatible with helper protocol {PROTOCOL_VERSION}"
                    ),
                ));
            }
            serialize(build_hello(backend.hello()))
        }
        "list_windows" => serialize(backend.list_windows()?),
        "list_apps" => {
            let input: ListAppsInput = parse(&request.input)?;
            serialize(backend.list_apps(input.query())?)
        }
        "get_window" => serialize(backend.resolve_window(&parse_window(&request.input)?)?),
        "get_window_state" => {
            let input: GetWindowStateInput = parse(&request.input)?;
            let window = backend.resolve_window(&input.window)?;
            let mut notes = backend.session_notes();
            let mut screenshots = Vec::new();
            if input.wants_screenshot() {
                match backend.capture(&window, cancel) {
                    Ok(captured) => {
                        notes.extend(captured.notes);
                        let screenshot = encode_screenshot(
                            &captured.frame,
                            &window,
                            captured.method,
                            &EncodeOptions {
                                max_dimension: input.max_dimension(),
                                format: input.format.unwrap_or_default(),
                            },
                        )?;
                        if let Some(note) = downscale_note(&screenshot) {
                            notes.push(note);
                        }
                        screenshots.push(screenshot);
                    }
                    // A window whose pixels are unavailable — a locked macOS
                    // console, a missing Screen Recording grant, a compositor
                    // that will not redirect it — can still be read through the
                    // accessibility tree. Degrade to text-only rather than
                    // failing an observation the caller can still use, and say
                    // why in a note. A caller that asked only for a screenshot
                    // gets the error, and so does any other failure class
                    // (cancellation, a stale window) where the tree is no more
                    // trustworthy than the capture.
                    Err(error)
                        if input.wants_text()
                            && matches!(
                                error.code,
                                ErrorCode::CaptureFailed | ErrorCode::PermissionDenied
                            ) =>
                    {
                        notes.push(format!("{CAPTURE_FAILED_NOTE}: {}", error.message));
                    }
                    Err(error) => return Err(error),
                }
            }
            cancel.check()?;
            let accessibility = if input.wants_text() {
                Some(backend.snapshot_tree(&window, input.tree_max_nodes(), cancel)?)
            } else {
                None
            };
            serialize(WindowStateResult {
                window,
                mode: "passive",
                notes,
                screenshots,
                accessibility,
            })
        }
        "activate_window" => {
            let window =
                backend.resolve_window(&parse::<WindowOnlyInput>(&request.input)?.window)?;
            serialize(backend.activate(&window)?)
        }
        "click" => {
            let input: ClickInput = parse(&request.input)?;
            let button = input.button().map_err(HelperError::invalid_input)?;
            let count = input.click_count().map_err(HelperError::invalid_input)?;
            let window = backend.resolve_window(&input.window)?;
            let action = PointerAction::Click {
                x: input.x,
                y: input.y,
                button,
                count,
            };
            validate_pointer_action_before_dispatch(&window, &action)?;
            serialize(backend.pointer(
                &window,
                action,
                InputOptions {
                    mode: input.mode,
                    verify: input.verify,
                },
                cancel,
            )?)
        }
        "press_key" => {
            let input: PressKeyInput = parse(&request.input)?;
            let chord = parse_chord(&input.key)
                .map_err(|error| HelperError::invalid_input(error.to_string()))?;
            let window = backend.resolve_window(&input.window)?;
            serialize(backend.keyboard(
                &window,
                KeyboardAction::Chord(chord),
                InputOptions {
                    mode: input.mode,
                    verify: input.verify,
                },
                cancel,
            )?)
        }
        "type_text" => {
            let input: TypeTextInput = parse(&request.input)?;
            let window = backend.resolve_window(&input.window)?;
            serialize(backend.keyboard(
                &window,
                KeyboardAction::Type(input.text),
                InputOptions {
                    mode: input.mode,
                    verify: input.verify,
                },
                cancel,
            )?)
        }
        "scroll" => {
            let input: ScrollInput = parse(&request.input)?;
            let window = backend.resolve_window(&input.window)?;
            let action = PointerAction::Scroll {
                x: input.x,
                y: input.y,
                dx: input.scroll_x,
                dy: input.scroll_y,
            };
            validate_pointer_action_before_dispatch(&window, &action)?;
            serialize(backend.pointer(
                &window,
                action,
                InputOptions {
                    mode: input.mode,
                    verify: input.verify,
                },
                cancel,
            )?)
        }
        "drag" => {
            let input: DragInput = parse(&request.input)?;
            let window = backend.resolve_window(&input.window)?;
            let action = PointerAction::Drag {
                from: (input.from_x, input.from_y),
                to: (input.to_x, input.to_y),
                steps: input.steps,
            };
            validate_pointer_action_before_dispatch(&window, &action)?;
            serialize(backend.pointer(
                &window,
                action,
                InputOptions {
                    mode: input.mode,
                    verify: input.verify,
                },
                cancel,
            )?)
        }
        "launch_app" => {
            let input: LaunchAppInput = parse(&request.input)?;
            serialize(backend.launch_app(&input.app, input.mode, cancel)?)
        }
        "find_elements" => {
            let input: FindElementsInput = parse(&request.input)?;
            let window = backend.resolve_window(&input.window)?;
            serialize(backend.find_elements(&window, &input, cancel)?)
        }
        "invoke_element" => {
            let input: InvokeElementInput = parse(&request.input)?;
            let window = backend.resolve_window(&input.window)?;
            serialize(backend.invoke_element(&window, &input.element_id, input.action)?)
        }
        "set_element_value" => {
            let input: SetElementValueInput = parse(&request.input)?;
            let window = backend.resolve_window(&input.window)?;
            serialize(backend.set_element_value(&window, &input.element_id, &input.value)?)
        }
        "cancel" | "shutdown" => Err(HelperError::invalid_input(format!(
            "{} must be handled by the host",
            request.action
        ))),
        _ => Err(HelperError::new(
            ErrorCode::UnknownAction,
            format!("unknown action: {}", request.action),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::{HelloInfo, UnsupportedBackend};
    use crate::protocol::actions::{Capabilities, PermissionState, Permissions};
    use serde_json::json;

    fn backend() -> UnsupportedBackend {
        UnsupportedBackend {
            reason: "test backend".into(),
        }
    }

    fn window() -> crate::protocol::window::WindowInfo {
        crate::protocol::window::WindowInfo {
            app: "test".into(),
            id: 1,
            title: "test".into(),
            x: 0,
            y: 0,
            width: 100,
            height: 80,
            pid: None,
            display_name: None,
            minimized: None,
            source: None,
        }
    }

    /// Resolves one window, always fails capture with a configurable error, and
    /// always has an accessibility tree.
    struct CaptureFailsBackend {
        error: HelperError,
    }

    impl Backend for CaptureFailsBackend {
        fn hello(&self) -> HelloInfo {
            unreachable!()
        }
        fn list_windows(&self) -> Result<Vec<crate::protocol::window::WindowInfo>> {
            Ok(vec![window()])
        }
        fn resolve_window(
            &self,
            _window: &WindowRef,
        ) -> Result<crate::protocol::window::WindowInfo> {
            Ok(window())
        }
        fn capture(
            &self,
            _window: &crate::protocol::window::WindowInfo,
            _cancel: &CancelToken,
        ) -> Result<crate::capture::CaptureResult> {
            Err(self.error.clone())
        }
        fn snapshot_tree(
            &self,
            _window: &crate::protocol::window::WindowInfo,
            _max_nodes: usize,
            _cancel: &CancelToken,
        ) -> Result<crate::protocol::actions::AccessibilityState> {
            Ok(crate::protocol::actions::AccessibilityState {
                source: "test".into(),
                tree: "window \"test\"".into(),
                snapshot_id: "snap-1".into(),
                element_count: 1,
                truncated: false,
            })
        }
        fn activate(
            &self,
            _window: &crate::protocol::window::WindowInfo,
        ) -> Result<crate::protocol::actions::InteractiveResult> {
            unreachable!()
        }
        fn pointer(
            &self,
            _window: &crate::protocol::window::WindowInfo,
            _action: PointerAction,
            _options: InputOptions,
            _cancel: &CancelToken,
        ) -> Result<crate::protocol::actions::InteractiveResult> {
            unreachable!()
        }
        fn keyboard(
            &self,
            _window: &crate::protocol::window::WindowInfo,
            _action: KeyboardAction,
            _options: InputOptions,
            _cancel: &CancelToken,
        ) -> Result<crate::protocol::actions::InteractiveResult> {
            unreachable!()
        }
        fn launch_app(
            &self,
            _app: &str,
            _mode: crate::protocol::actions::InputMode,
            _cancel: &CancelToken,
        ) -> Result<crate::protocol::actions::LaunchResult> {
            unreachable!()
        }
    }

    fn window_state(error: HelperError, input: Value) -> Result<Value> {
        dispatch_request(
            &CaptureFailsBackend { error },
            &Request {
                id: 1,
                action: "get_window_state".into(),
                input,
            },
            &CancelToken::default(),
        )
    }

    #[test]
    fn returns_the_tree_with_a_capture_failed_note_when_capture_fails() {
        let result = window_state(
            HelperError::capture_failed("The desktop is locked."),
            json!({
                "window": { "id": 1 },
                "include_screenshot": true,
                "include_text": true,
            }),
        )
        .expect("text-only degrade");
        assert_eq!(result["screenshots"].as_array().expect("array").len(), 0);
        assert_eq!(result["accessibility"]["snapshotId"], "snap-1");
        assert_eq!(
            result["notes"],
            json!(["capture_failed: The desktop is locked."])
        );
    }

    #[test]
    fn degrades_for_a_denied_screen_recording_grant_too() {
        let result = window_state(
            HelperError::permission_denied("Screen Recording permission is required."),
            json!({
                "window": { "id": 1 },
                "include_screenshot": true,
                "include_text": true,
            }),
        )
        .expect("text-only degrade");
        assert!(
            result["notes"][0]
                .as_str()
                .expect("note")
                .starts_with("capture_failed: Screen Recording")
        );
    }

    #[test]
    fn still_fails_when_only_a_screenshot_was_requested() {
        let error = window_state(
            HelperError::capture_failed("The desktop is locked."),
            json!({ "window": { "id": 1 }, "include_screenshot": true }),
        )
        .expect_err("screenshot-only request");
        assert_eq!(error.code, ErrorCode::CaptureFailed);
    }

    #[test]
    fn never_degrades_a_cancellation_into_a_partial_observation() {
        let error = window_state(
            HelperError::new(ErrorCode::Cancelled, "cancelled"),
            json!({
                "window": { "id": 1 },
                "include_screenshot": true,
                "include_text": true,
            }),
        )
        .expect_err("cancelled request");
        assert_eq!(error.code, ErrorCode::Cancelled);
    }

    #[test]
    fn rejects_pointer_coordinates_outside_the_target_frame() {
        let window = window();
        assert!(
            validate_pointer_action_before_dispatch(
                &window,
                &PointerAction::Click {
                    x: 100.0,
                    y: 20.0,
                    button: crate::protocol::actions::MouseButton::Left,
                    count: 1,
                },
            )
            .is_err()
        );
        assert!(
            validate_pointer_action_before_dispatch(
                &window,
                &PointerAction::Scroll {
                    x: 10.0,
                    y: -1.0,
                    dx: 0.0,
                    dy: 120.0,
                },
            )
            .is_err()
        );
        assert!(
            validate_pointer_action_before_dispatch(
                &window,
                &PointerAction::Drag {
                    from: (10.0, 10.0),
                    to: (100.0, 79.0),
                    steps: None,
                },
            )
            .is_err()
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn leaves_minimized_pointer_validation_to_the_windows_backend() {
        let mut window = window();
        window.width = 160;
        window.height = 28;
        window.minimized = Some(true);

        assert!(
            validate_pointer_action_before_dispatch(
                &window,
                &PointerAction::Click {
                    x: 50.0,
                    y: 50.0,
                    button: crate::protocol::actions::MouseButton::Left,
                    count: 1,
                },
            )
            .is_ok()
        );
    }

    #[test]
    fn rejects_unknown_action() {
        let request = Request {
            id: 1,
            action: "wat".into(),
            input: json!({}),
        };
        let error = dispatch_request(&backend(), &request, &CancelToken::default()).unwrap_err();
        assert_eq!(error.code, ErrorCode::UnknownAction);
    }

    #[test]
    fn negotiates_protocol_version() {
        struct HelloBackend;
        impl Backend for HelloBackend {
            fn hello(&self) -> HelloInfo {
                HelloInfo {
                    platform: "test",
                    display_server: None,
                    capabilities: Capabilities::default(),
                    permissions: Permissions {
                        accessibility: PermissionState::NotRequired,
                        screen_recording: PermissionState::NotRequired,
                    },
                    screen_locked: false,
                    notes: vec![],
                }
            }
            fn list_windows(&self) -> Result<Vec<crate::protocol::window::WindowInfo>> {
                unreachable!()
            }
            fn resolve_window(
                &self,
                _window: &WindowRef,
            ) -> Result<crate::protocol::window::WindowInfo> {
                unreachable!()
            }
            fn capture(
                &self,
                _window: &crate::protocol::window::WindowInfo,
                _cancel: &CancelToken,
            ) -> Result<crate::capture::CaptureResult> {
                unreachable!()
            }
            fn activate(
                &self,
                _window: &crate::protocol::window::WindowInfo,
            ) -> Result<crate::protocol::actions::InteractiveResult> {
                unreachable!()
            }
            fn pointer(
                &self,
                _window: &crate::protocol::window::WindowInfo,
                _action: PointerAction,
                _options: InputOptions,
                _cancel: &CancelToken,
            ) -> Result<crate::protocol::actions::InteractiveResult> {
                unreachable!()
            }
            fn keyboard(
                &self,
                _window: &crate::protocol::window::WindowInfo,
                _action: KeyboardAction,
                _options: InputOptions,
                _cancel: &CancelToken,
            ) -> Result<crate::protocol::actions::InteractiveResult> {
                unreachable!()
            }
            fn launch_app(
                &self,
                _app: &str,
                _mode: crate::protocol::actions::InputMode,
                _cancel: &CancelToken,
            ) -> Result<crate::protocol::actions::LaunchResult> {
                unreachable!()
            }
        }

        let good = Request {
            id: 1,
            action: "hello".into(),
            input: json!({ "protocolVersion": PROTOCOL_VERSION }),
        };
        assert_eq!(
            dispatch_request(&HelloBackend, &good, &CancelToken::default()).unwrap()["protocolVersion"],
            PROTOCOL_VERSION
        );
        let bad = Request {
            id: 2,
            action: "hello".into(),
            input: json!({ "protocolVersion": PROTOCOL_VERSION + 1 }),
        };
        assert_eq!(
            dispatch_request(&HelloBackend, &bad, &CancelToken::default())
                .unwrap_err()
                .code,
            ErrorCode::ProtocolMismatch
        );
    }
}
