#![cfg(target_os = "macos")]

use poracode_computer_use::backend::macos::MacOsBackend;
use poracode_computer_use::backend::{
    Backend, CancelToken, InputOptions, PointerAction, build_hello,
};
use poracode_computer_use::protocol::ErrorCode;
use poracode_computer_use::protocol::actions::{
    InputMode, MouseButton, PermissionState, RefusalCode, Verify,
};

#[test]
fn reports_tcc_state_and_returns_structured_permission_failures() {
    let backend = MacOsBackend::new();
    let hello = build_hello(backend.hello());
    assert_eq!(hello.platform, "darwin");
    assert!(hello.capabilities.accessibility_tree);
    assert!(hello.capabilities.element_actions);
    assert!(hello.capabilities.occluded_capture);

    let windows = backend.list_windows().expect("list macOS windows");
    assert!(
        windows
            .iter()
            .all(|window| window.title != "Poracode Computer Use Overlay")
    );
    let launch_error = backend
        .launch_app(
            "../Untrusted.app",
            InputMode::Background,
            &CancelToken::default(),
        )
        .expect_err("relative launch path must be rejected");
    assert_eq!(launch_error.code, ErrorCode::InvalidInput);
    // The lock state depends on the machine running the suite: background
    // control stays available either way, but the hello flag and the session
    // notes must agree with each other.
    if hello.screen_locked {
        assert!(
            backend
                .session_notes()
                .iter()
                .any(|note| note == "screen_locked")
        );
    } else {
        assert!(backend.session_notes().is_empty());
    }
    let Some(window) = windows.first() else {
        return;
    };
    if hello.permissions.screen_recording == PermissionState::Denied {
        let error = backend
            .capture(window, &CancelToken::default())
            .expect_err("capture must be denied without Screen Recording permission");
        assert_eq!(error.code, ErrorCode::PermissionDenied);
    }
    if hello.permissions.accessibility == PermissionState::Denied {
        let result = backend
            .pointer(
                window,
                PointerAction::Click {
                    x: 1.0,
                    y: 1.0,
                    button: MouseButton::Left,
                    count: 1,
                },
                InputOptions {
                    mode: InputMode::Background,
                    verify: Verify::None,
                },
                &CancelToken::default(),
            )
            .expect("permission refusal is an interactive result");
        assert_eq!(
            result.refused.expect("refusal").code,
            RefusalCode::PermissionDenied
        );
    }
}
