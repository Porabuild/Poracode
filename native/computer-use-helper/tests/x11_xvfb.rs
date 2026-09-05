#![cfg(target_os = "linux")]

use std::time::{Duration, Instant};

use poracode_computer_use::backend::linux::LinuxBackend;
use poracode_computer_use::backend::{
    Backend, BackendOptions, CancelToken, InputOptions, KeyboardAction, PointerAction,
};
use poracode_computer_use::protocol::actions::{
    Delivered, InputMode, MouseButton, RefusalCode, Route, Verify,
};
use poracode_computer_use::protocol::window::{WindowRef, WindowSource};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::composite::{ConnectionExt as _, Redirect};
use x11rb::protocol::xproto::{
    AtomEnum, ConnectionExt as _, CreateWindowAux, EventMask, PropMode, WindowClass,
};
use x11rb::wrapper::ConnectionExt as _;

#[test]
fn sends_background_events_and_captures_an_xwayland_window() {
    if std::env::var_os("DISPLAY").is_none() {
        eprintln!("skipping X11 integration test without DISPLAY");
        return;
    }
    let (connection, screen_number) = x11rb::connect(None).expect("connect to X server");
    let screen = &connection.setup().roots[screen_number];
    let window_id = connection.generate_id().expect("allocate window id");
    connection
        .create_window(
            screen.root_depth,
            window_id,
            screen.root,
            40,
            50,
            240,
            160,
            0,
            WindowClass::INPUT_OUTPUT,
            screen.root_visual,
            &CreateWindowAux::new()
                .background_pixel(screen.black_pixel ^ 0x00ff00)
                .event_mask(
                    EventMask::EXPOSURE
                        | EventMask::BUTTON_PRESS
                        | EventMask::BUTTON_RELEASE
                        | EventMask::KEY_PRESS
                        | EventMask::KEY_RELEASE
                        | EventMask::POINTER_MOTION,
                ),
        )
        .expect("create test window");
    connection
        .change_property8(
            PropMode::REPLACE,
            window_id,
            AtomEnum::WM_NAME,
            AtomEnum::STRING,
            b"Poracode Xvfb Test",
        )
        .expect("set window title");
    connection
        .change_property8(
            PropMode::REPLACE,
            window_id,
            AtomEnum::WM_CLASS,
            AtomEnum::STRING,
            b"poracode-test\0PoracodeTest\0",
        )
        .expect("set window class");
    let pid_atom = connection
        .intern_atom(false, b"_NET_WM_PID")
        .expect("intern pid atom")
        .reply()
        .expect("read pid atom")
        .atom;
    connection
        .change_property32(
            PropMode::REPLACE,
            window_id,
            pid_atom,
            AtomEnum::CARDINAL,
            &[std::process::id()],
        )
        .expect("set window pid");
    connection.map_window(window_id).expect("map test window");

    let first_child = connection.generate_id().expect("allocate first child");
    let second_child = connection.generate_id().expect("allocate second child");
    for (child, x) in [(first_child, 10), (second_child, 120)] {
        connection
            .create_window(
                screen.root_depth,
                child,
                window_id,
                x,
                80,
                80,
                50,
                0,
                WindowClass::INPUT_OUTPUT,
                screen.root_visual,
                &CreateWindowAux::new().event_mask(
                    EventMask::BUTTON_PRESS | EventMask::BUTTON_RELEASE | EventMask::BUTTON_MOTION,
                ),
            )
            .expect("create drag child");
        connection.map_window(child).expect("map drag child");
    }

    let no_core_events = connection.generate_id().expect("allocate no-event window");
    connection
        .create_window(
            screen.root_depth,
            no_core_events,
            screen.root,
            320,
            50,
            100,
            80,
            0,
            WindowClass::INPUT_OUTPUT,
            screen.root_visual,
            &CreateWindowAux::new(),
        )
        .expect("create no-event window");
    connection
        .change_property8(
            PropMode::REPLACE,
            no_core_events,
            AtomEnum::WM_NAME,
            AtomEnum::STRING,
            b"Poracode no core events",
        )
        .expect("set no-event title");
    connection
        .change_property8(
            PropMode::REPLACE,
            no_core_events,
            AtomEnum::WM_CLASS,
            AtomEnum::STRING,
            b"poracode-no-events\0PoracodeNoEvents\0",
        )
        .expect("set no-event class");
    connection
        .map_window(no_core_events)
        .expect("map no-event window");

    let overlay = connection.generate_id().expect("allocate overlay window");
    connection
        .create_window(
            screen.root_depth,
            overlay,
            screen.root,
            440,
            50,
            100,
            80,
            0,
            WindowClass::INPUT_OUTPUT,
            screen.root_visual,
            &CreateWindowAux::new(),
        )
        .expect("create overlay window");
    connection
        .change_property8(
            PropMode::REPLACE,
            overlay,
            AtomEnum::WM_NAME,
            AtomEnum::STRING,
            b"Poracode Computer Use Overlay",
        )
        .expect("set overlay title");
    connection
        .change_property8(
            PropMode::REPLACE,
            overlay,
            AtomEnum::WM_CLASS,
            AtomEnum::STRING,
            b"poracode-overlay\0PoracodeOverlay\0",
        )
        .expect("set overlay class");
    connection.map_window(overlay).expect("map overlay window");

    // XWayland compositors such as WSLg may omit _NET_CLIENT_LIST_STACKING and
    // reparent clients below an untitled frame. WM_STATE identifies the actual
    // client when window discovery falls back to the root tree.
    let frame = connection
        .generate_id()
        .expect("allocate reparenting frame");
    let reparented = connection
        .generate_id()
        .expect("allocate reparented client");
    connection
        .create_window(
            screen.root_depth,
            frame,
            screen.root,
            560,
            50,
            160,
            100,
            0,
            WindowClass::INPUT_OUTPUT,
            screen.root_visual,
            &CreateWindowAux::new(),
        )
        .expect("create reparenting frame");
    connection
        .create_window(
            screen.root_depth,
            reparented,
            frame,
            8,
            12,
            140,
            80,
            0,
            WindowClass::INPUT_OUTPUT,
            screen.root_visual,
            &CreateWindowAux::new(),
        )
        .expect("create reparented client");
    connection
        .change_property8(
            PropMode::REPLACE,
            reparented,
            AtomEnum::WM_NAME,
            AtomEnum::STRING,
            b"Poracode reparented XWayland test",
        )
        .expect("set reparented title");
    connection
        .change_property8(
            PropMode::REPLACE,
            reparented,
            AtomEnum::WM_CLASS,
            AtomEnum::STRING,
            b"poracode-reparented\0PoracodeReparented\0",
        )
        .expect("set reparented class");
    let wm_state = connection
        .intern_atom(false, b"WM_STATE")
        .expect("intern WM_STATE")
        .reply()
        .expect("read WM_STATE atom")
        .atom;
    connection
        .change_property32(PropMode::REPLACE, reparented, wm_state, wm_state, &[1, 0])
        .expect("set reparented WM_STATE");
    connection.map_window(frame).expect("map reparenting frame");
    connection
        .map_window(reparented)
        .expect("map reparented client");
    connection.flush().expect("flush test window");

    // SAFETY: this integration-test binary contains one test, so no concurrent
    // Rust code can observe the temporary session variable mutation.
    unsafe { std::env::set_var("WAYLAND_DISPLAY", "poracode-test-wayland") };
    let backend = LinuxBackend::new(&BackendOptions { state_dir: None });
    let hello = backend.hello();
    assert_eq!(hello.display_server.as_deref(), Some("wayland"));
    assert!(hello.capabilities.background_pointer);
    assert!(hello.capabilities.background_keyboard);
    let deadline = Instant::now() + Duration::from_secs(2);
    let window = loop {
        let windows = backend.list_windows().expect("list X11 windows");
        assert!(windows.iter().all(|window| window.id != i64::from(overlay)));
        assert!(
            windows
                .iter()
                .any(|window| window.id == i64::from(reparented)),
            "reparented XWayland client was not discovered"
        );
        if let Some(window) = windows
            .into_iter()
            .find(|window| window.id == i64::from(window_id))
        {
            break window;
        }
        assert!(Instant::now() < deadline, "test window was not discovered");
        std::thread::sleep(Duration::from_millis(20));
    };
    assert!(
        backend
            .resolve_window(&WindowRef {
                app: Some("PoracodeOverlay".into()),
                id: i64::from(overlay),
                title: Some("Poracode Computer Use Overlay".into()),
            })
            .is_err(),
        "overlay must not be selected by exact-id or recovery resolution"
    );
    assert_eq!(window.source, Some(WindowSource::X11));
    let resolved = backend
        .resolve_window(&WindowRef {
            app: Some(window.app.clone()),
            id: window.id,
            title: Some(window.title.clone()),
        })
        .expect("resolve X11 window");
    match backend.capture(&resolved, &CancelToken::default()) {
        Ok(capture) => assert_eq!(capture.method, "x_composite"),
        Err(error) => {
            assert_eq!(
                error.code,
                poracode_computer_use::protocol::ErrorCode::CaptureFailed
            );
            assert!(error.message.contains("XComposite"));
        }
    }
    connection
        .composite_redirect_window(window_id, Redirect::AUTOMATIC)
        .expect("redirect test window")
        .check()
        .expect("confirm test window redirection");
    let capture = backend
        .capture(&resolved, &CancelToken::default())
        .expect("capture X11 window");
    assert_eq!(
        (capture.frame.width, capture.frame.height),
        (resolved.width as u32, resolved.height as u32)
    );
    assert!(capture.frame.width >= 240 && capture.frame.height >= 160);
    assert!(!capture.frame.is_black());
    assert_eq!(capture.method, "x_composite");

    let options = InputOptions {
        mode: InputMode::Background,
        verify: Verify::None,
    };
    let click = backend
        .pointer(
            &resolved,
            PointerAction::Click {
                x: 30.0,
                y: 40.0,
                button: MouseButton::Left,
                count: 1,
            },
            options,
            &CancelToken::default(),
        )
        .expect("send background click");
    let delivery = click.delivery.expect("click delivery report");
    assert_eq!(delivery.delivered, Delivered::Background);
    assert_eq!(delivery.route, Route::Event);
    backend
        .keyboard(
            &resolved,
            KeyboardAction::Type("a".into()),
            options,
            &CancelToken::default(),
        )
        .expect("send background key");

    let deadline = Instant::now() + Duration::from_secs(2);
    let mut button = None;
    let mut key = None;
    while Instant::now() < deadline && (button.is_none() || key.is_none()) {
        match connection.poll_for_event().expect("poll X11 event") {
            Some(Event::ButtonPress(event)) => button = Some(event),
            Some(Event::KeyPress(event)) => key = Some(event),
            Some(_) | None => std::thread::sleep(Duration::from_millis(5)),
        }
    }
    let button = button.expect("background ButtonPress event");
    assert_eq!(button.event, window_id);
    assert_eq!((button.event_x, button.event_y), (30, 40));
    assert_ne!(key.expect("background KeyPress event").detail, 0);

    let no_core_window = backend
        .list_windows()
        .expect("list no-event window")
        .into_iter()
        .find(|window| window.id == i64::from(no_core_events))
        .expect("discover no-event window");
    let no_core_result = backend
        .pointer(
            &no_core_window,
            PointerAction::Click {
                x: 10.0,
                y: 10.0,
                button: MouseButton::Left,
                count: 1,
            },
            options,
            &CancelToken::default(),
        )
        .expect("evaluate no-event background click");
    assert_eq!(
        no_core_result.refused.expect("core-event refusal").code,
        RefusalCode::BackgroundUnavailable
    );

    let pointer_before = connection
        .query_pointer(screen.root)
        .expect("query pointer before refused foreground action")
        .reply()
        .expect("read pointer before refused foreground action");
    let refused_foreground = backend
        .pointer(
            &no_core_window,
            PointerAction::Click {
                x: 70.0,
                y: 60.0,
                button: MouseButton::Left,
                count: 1,
            },
            InputOptions {
                mode: InputMode::Foreground,
                verify: Verify::None,
            },
            &CancelToken::default(),
        )
        .expect("refuse unconfirmed foreground click");
    assert_eq!(
        refused_foreground.refused.expect("activation refusal").code,
        RefusalCode::TargetNotResponding
    );
    let pointer_after = connection
        .query_pointer(screen.root)
        .expect("query pointer after refused foreground action")
        .reply()
        .expect("read pointer after refused foreground action");
    assert_eq!(
        (pointer_after.root_x, pointer_after.root_y),
        (pointer_before.root_x, pointer_before.root_y),
        "XTEST must not move the pointer before foreground activation is confirmed"
    );

    while connection
        .poll_for_event()
        .expect("drain events before drag")
        .is_some()
    {}
    backend
        .pointer(
            &resolved,
            PointerAction::Drag {
                from: (20.0, 100.0),
                to: (150.0, 100.0),
                steps: Some(2),
            },
            options,
            &CancelToken::default(),
        )
        .expect("send cross-child background drag");
    let deadline = Instant::now() + Duration::from_secs(2);
    let final_motion = loop {
        if let Some(Event::MotionNotify(event)) =
            connection.poll_for_event().expect("poll drag motion")
            && event.event == first_child
            && event.event_x == 140
        {
            break event;
        }
        assert!(
            Instant::now() < deadline,
            "final drag motion was not delivered"
        );
        std::thread::sleep(Duration::from_millis(5));
    };
    assert_eq!((final_motion.event_x, final_motion.event_y), (140, 20));

    connection
        .destroy_window(window_id)
        .expect("destroy test window");
    connection.flush().expect("flush teardown");
}
