#![cfg(windows)]

use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex, mpsc};
use std::thread;
use std::time::{Duration, Instant};

use poracode_computer_use::backend::windows::WindowsBackend;
use poracode_computer_use::backend::{
    Backend, CancelToken, InputOptions, KeyboardAction, PointerAction,
};
use poracode_computer_use::protocol::actions::{
    FindElementsInput, FindElementsResult, InputMode, MouseButton, Verify,
};
use poracode_computer_use::protocol::keys::parse_chord;
use poracode_computer_use::protocol::window::WindowRef;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, WHITE_BRUSH};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetFocus, SetFocus};
use windows::Win32::UI::WindowsAndMessaging::{
    CS_DBLCLKS, CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW,
    GetForegroundWindow, GetMessageW, GetWindowRect, HWND_TOP, HWND_TOPMOST, MSG, PostMessageW,
    PostQuitMessage, RegisterClassW, SW_MINIMIZE, SW_SHOWNOACTIVATE, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, SetWindowPos, ShowWindow, TranslateMessage, WINDOW_EX_STYLE, WM_CHAR, WM_CLOSE,
    WM_COMMAND, WM_DESTROY, WM_LBUTTONDBLCLK, WM_LBUTTONDOWN, WNDCLASSW, WS_BORDER, WS_CHILD,
    WS_EX_NOACTIVATE, WS_EX_TOPMOST, WS_OVERLAPPEDWINDOW, WS_VISIBLE,
};
use windows::core::{BOOL, PCWSTR, w};

static CLICKS: AtomicUsize = AtomicUsize::new(0);
static DOUBLE_CLICKS: AtomicUsize = AtomicUsize::new(0);
static PRIMARY_COMMANDS: AtomicUsize = AtomicUsize::new(0);
static SECONDARY_COMMANDS: AtomicUsize = AtomicUsize::new(0);
static PRIMARY_WINDOW: AtomicIsize = AtomicIsize::new(0);
static MINIMIZE_ON_PRIMARY_COMMAND: AtomicBool = AtomicBool::new(false);
static CHARACTERS: LazyLock<Mutex<Vec<u16>>> = LazyLock::new(|| Mutex::new(Vec::new()));

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        WM_LBUTTONDOWN => {
            CLICKS.fetch_add(1, Ordering::SeqCst);
            LRESULT(0)
        }
        WM_LBUTTONDBLCLK => {
            DOUBLE_CLICKS.fetch_add(1, Ordering::SeqCst);
            LRESULT(0)
        }
        WM_CHAR => {
            CHARACTERS.lock().unwrap().push(wparam.0 as u16);
            LRESULT(0)
        }
        WM_COMMAND => {
            if hwnd.0 as isize == PRIMARY_WINDOW.load(Ordering::SeqCst) {
                PRIMARY_COMMANDS.fetch_add(1, Ordering::SeqCst);
                if MINIMIZE_ON_PRIMARY_COMMAND.swap(false, Ordering::SeqCst) {
                    // SAFETY: this is the live primary test window handling its
                    // own child-control command on the owning message thread.
                    let _ = unsafe { ShowWindow(hwnd, SW_MINIMIZE) };
                }
            } else {
                SECONDARY_COMMANDS.fetch_add(1, Ordering::SeqCst);
            }
            LRESULT(0)
        }
        WM_CLOSE => {
            // SAFETY: Windows sent WM_CLOSE for this live test window.
            let _ = unsafe { DestroyWindow(hwnd) };
            LRESULT(0)
        }
        WM_DESTROY => {
            // SAFETY: this ends the message loop on the owning test thread.
            unsafe { PostQuitMessage(0) };
            LRESULT(0)
        }
        _ => {
            // SAFETY: unhandled messages are delegated to the system window proc.
            unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
        }
    }
}

struct TestWindow {
    button: i64,
    child: i64,
    edit: i64,
    secondary: i64,
    thread: Option<thread::JoinHandle<()>>,
    window: i64,
}

impl TestWindow {
    fn spawn() -> Self {
        let (tx, rx) = mpsc::sync_channel(1);
        let thread = thread::spawn(move || {
            let class_name: Vec<u16> = "PoracodeComputerUseTest"
                .encode_utf16()
                .chain([0])
                .collect();
            // SAFETY: class strings stay alive through registration/window creation,
            // and every created HWND is owned by this message-loop thread.
            unsafe {
                let module = GetModuleHandleW(None).unwrap();
                let class = WNDCLASSW {
                    style: CS_DBLCLKS,
                    lpfnWndProc: Some(window_proc),
                    hInstance: HINSTANCE(module.0),
                    lpszClassName: PCWSTR(class_name.as_ptr()),
                    hbrBackground: HBRUSH(GetStockObject(WHITE_BRUSH).0),
                    ..Default::default()
                };
                assert_ne!(RegisterClassW(&class), 0);
                let window = CreateWindowExW(
                    WS_EX_NOACTIVATE | WS_EX_TOPMOST,
                    PCWSTR(class_name.as_ptr()),
                    w!("Poracode Computer Use Test Window"),
                    WS_OVERLAPPEDWINDOW,
                    600,
                    100,
                    420,
                    260,
                    None,
                    None,
                    Some(HINSTANCE(module.0)),
                    None,
                )
                .unwrap();
                PRIMARY_WINDOW.store(window.0 as isize, Ordering::SeqCst);
                let child = CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    PCWSTR(class_name.as_ptr()),
                    w!(""),
                    WS_CHILD | WS_VISIBLE | WS_BORDER,
                    12,
                    18,
                    90,
                    60,
                    Some(window),
                    None,
                    Some(HINSTANCE(module.0)),
                    None,
                )
                .unwrap();
                let edit = CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    w!("EDIT"),
                    w!("Initial field value"),
                    WS_CHILD | WS_VISIBLE | WS_BORDER,
                    120,
                    18,
                    220,
                    32,
                    Some(window),
                    None,
                    Some(HINSTANCE(module.0)),
                    None,
                )
                .unwrap();
                let button = CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    w!("BUTTON"),
                    w!("Invoke me"),
                    WS_CHILD | WS_VISIBLE,
                    120,
                    70,
                    140,
                    36,
                    Some(window),
                    None,
                    Some(HINSTANCE(module.0)),
                    None,
                )
                .unwrap();
                let secondary = CreateWindowExW(
                    WS_EX_NOACTIVATE,
                    PCWSTR(class_name.as_ptr()),
                    w!("Poracode Secondary Test Window"),
                    WS_OVERLAPPEDWINDOW,
                    100,
                    100,
                    320,
                    180,
                    None,
                    None,
                    Some(HINSTANCE(module.0)),
                    None,
                )
                .unwrap();
                let secondary_button = CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    w!("BUTTON"),
                    w!("Do not invoke"),
                    WS_CHILD | WS_VISIBLE,
                    120,
                    70,
                    140,
                    36,
                    Some(secondary),
                    None,
                    Some(HINSTANCE(module.0)),
                    None,
                )
                .unwrap();
                let _ = ShowWindow(window, SW_SHOWNOACTIVATE);
                let _ = ShowWindow(secondary, SW_SHOWNOACTIVATE);
                SetWindowPos(
                    window,
                    Some(HWND_TOPMOST),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                )
                .unwrap();
                let _ = SetFocus(Some(secondary_button));
                assert_eq!(GetFocus(), secondary_button);
                tx.send((
                    window.0 as isize as i64,
                    child.0 as isize as i64,
                    edit.0 as isize as i64,
                    button.0 as isize as i64,
                    secondary.0 as isize as i64,
                ))
                .unwrap();
                let mut message = MSG::default();
                while GetMessageW(&mut message, None, 0, 0) != BOOL(0) {
                    let _ = TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            }
        });
        let (window, child, edit, button, secondary) =
            rx.recv_timeout(Duration::from_secs(5)).unwrap();
        Self {
            button,
            child,
            edit,
            secondary,
            thread: Some(thread),
            window,
        }
    }
}

impl Drop for TestWindow {
    fn drop(&mut self) {
        // SAFETY: the id is the live top-level HWND created by the test thread.
        let _ = unsafe {
            PostMessageW(
                Some(HWND(self.window as isize as *mut _)),
                WM_CLOSE,
                WPARAM(0),
                LPARAM(0),
            )
        };
        if let Some(thread) = self.thread.take() {
            thread.join().unwrap();
        }
    }
}

fn rect(id: i64) -> RECT {
    let mut rect = RECT::default();
    // SAFETY: the id belongs to a live test HWND.
    unsafe { GetWindowRect(HWND(id as isize as *mut _), &mut rect) }.unwrap();
    rect
}

/// Window proc for the class-chain test. Deliberately stateless — the main
/// harness counters are shared with the test above, and Rust runs tests in
/// parallel.
unsafe extern "system" fn chain_window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if message == WM_DESTROY {
        // SAFETY: this ends the message loop on the owning test thread.
        unsafe { PostQuitMessage(0) };
        return LRESULT(0);
    }
    // SAFETY: unhandled messages are delegated to the system window proc.
    unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
}

/// A top-level window of one class hosting a child of another, so a delivery
/// can be aimed at a child whose class differs from its frame's — the shape
/// Chromium resolves a page-area target to.
struct ChainedWindow {
    child: i64,
    thread: Option<thread::JoinHandle<()>>,
    window: i64,
}

impl ChainedWindow {
    fn spawn(root_class: &'static str, child_class: &'static str, title: &'static str) -> Self {
        let (tx, rx) = mpsc::sync_channel(1);
        let thread = thread::spawn(move || {
            let root_class: Vec<u16> = root_class.encode_utf16().chain([0]).collect();
            let child_class: Vec<u16> = child_class.encode_utf16().chain([0]).collect();
            let title: Vec<u16> = title.encode_utf16().chain([0]).collect();
            // SAFETY: class strings stay alive through registration/window creation,
            // and every created HWND is owned by this message-loop thread.
            unsafe {
                let module = GetModuleHandleW(None).unwrap();
                let root = WNDCLASSW {
                    lpfnWndProc: Some(chain_window_proc),
                    hInstance: HINSTANCE(module.0),
                    lpszClassName: PCWSTR(root_class.as_ptr()),
                    ..Default::default()
                };
                assert_ne!(RegisterClassW(&root), 0);
                let child = WNDCLASSW {
                    lpfnWndProc: Some(chain_window_proc),
                    hInstance: HINSTANCE(module.0),
                    lpszClassName: PCWSTR(child_class.as_ptr()),
                    ..Default::default()
                };
                assert_ne!(RegisterClassW(&child), 0);
                let window = CreateWindowExW(
                    WS_EX_NOACTIVATE,
                    PCWSTR(root_class.as_ptr()),
                    PCWSTR(title.as_ptr()),
                    WS_OVERLAPPEDWINDOW,
                    1100,
                    400,
                    300,
                    200,
                    None,
                    None,
                    Some(HINSTANCE(module.0)),
                    None,
                )
                .unwrap();
                let child = CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    PCWSTR(child_class.as_ptr()),
                    w!(""),
                    WS_CHILD | WS_VISIBLE,
                    12,
                    18,
                    200,
                    120,
                    Some(window),
                    None,
                    Some(HINSTANCE(module.0)),
                    None,
                )
                .unwrap();
                let _ = ShowWindow(window, SW_SHOWNOACTIVATE);
                tx.send((window.0 as isize as i64, child.0 as isize as i64))
                    .unwrap();
                let mut message = MSG::default();
                while GetMessageW(&mut message, None, 0, 0) != BOOL(0) {
                    let _ = TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            }
        });
        let (window, child) = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        Self {
            child,
            thread: Some(thread),
            window,
        }
    }
}

impl Drop for ChainedWindow {
    fn drop(&mut self) {
        // SAFETY: the id is the live top-level HWND created by the test thread.
        let _ = unsafe {
            PostMessageW(
                Some(HWND(self.window as isize as *mut _)),
                WM_CLOSE,
                WPARAM(0),
                LPARAM(0),
            )
        };
        if let Some(thread) = self.thread.take() {
            thread.join().unwrap();
        }
    }
}

/// Chromium resolves a page-area target to a render-widget descendant whose
/// own class is not the frame's, so the note must come from the whole class
/// chain — and must stay absent for ordinary class chains.
/// Center of `child` in the frame coordinates a pointer action takes.
fn center(child: i64, frame: i64) -> (f64, f64) {
    let child = rect(child);
    let frame = rect(frame);
    (
        f64::from(child.left + (child.right - child.left) / 2 - frame.left),
        f64::from(child.top + (child.bottom - child.top) / 2 - frame.top),
    )
}

fn carries_note(notes: &[String], note: &str) -> bool {
    notes.iter().any(|carried| carried == note)
}

#[test]
fn notes_chromium_class_chains_but_not_ordinary_ones() {
    const CHROMIUM_NOTE: &str = "chromium_synthetic_input_may_be_ignored";
    let backend = WindowsBackend::new();
    let chromium = ChainedWindow::spawn(
        "Chrome_WidgetWin_1",
        "Chrome_RenderWidgetHostHWND",
        "Poracode Chromium Class Test",
    );
    let plain = ChainedWindow::spawn(
        "PoracodePlainFrame",
        "PoracodePlainChild",
        "Poracode Plain Class Test",
    );
    let window = backend
        .resolve_window(&WindowRef {
            app: None,
            id: chromium.window,
            title: Some("Poracode Chromium Class Test".into()),
        })
        .unwrap();
    let (x, y) = center(chromium.child, chromium.window);
    let options = InputOptions {
        mode: InputMode::Background,
        verify: Verify::None,
    };

    let clicked = backend
        .pointer(
            &window,
            PointerAction::Click {
                x,
                y,
                button: MouseButton::Left,
                count: 1,
            },
            options,
            &CancelToken::default(),
        )
        .unwrap();
    assert!(
        clicked.ok,
        "background click was refused: {:?}",
        clicked.refused
    );
    let notes = clicked.delivery.expect("click was delivered").notes;
    assert!(
        carries_note(&notes, CHROMIUM_NOTE),
        "a click on a Chrome_WidgetWin descendant must carry the note: {notes:?}"
    );

    let scrolled = backend
        .pointer(
            &window,
            PointerAction::Scroll {
                x,
                y,
                dx: 0.0,
                dy: -240.0,
            },
            options,
            &CancelToken::default(),
        )
        .unwrap();
    assert!(
        scrolled.ok,
        "background scroll was refused: {:?}",
        scrolled.refused
    );
    let notes = scrolled.delivery.expect("scroll was delivered").notes;
    assert!(
        carries_note(&notes, CHROMIUM_NOTE),
        "a scroll on a Chrome_WidgetWin descendant must carry the note: {notes:?}"
    );

    let dragged = backend
        .pointer(
            &window,
            PointerAction::Drag {
                from: (x, y),
                to: (x + 8.0, y + 8.0),
                steps: Some(2),
            },
            options,
            &CancelToken::default(),
        )
        .unwrap();
    assert!(
        dragged.ok,
        "background drag was refused: {:?}",
        dragged.refused
    );
    let notes = dragged.delivery.expect("drag was delivered").notes;
    assert!(
        carries_note(&notes, CHROMIUM_NOTE),
        "a drag on a Chrome_WidgetWin descendant must carry the note: {notes:?}"
    );

    let typed = backend
        .keyboard(
            &window,
            KeyboardAction::Type("hi".into()),
            options,
            &CancelToken::default(),
        )
        .unwrap();
    assert!(
        typed.ok,
        "background typing was refused: {:?}",
        typed.refused
    );
    let notes = typed.delivery.expect("typing was delivered").notes;
    assert!(
        carries_note(&notes, CHROMIUM_NOTE),
        "typing into a Chrome_WidgetWin window must carry the note: {notes:?}"
    );

    // The same gestures on an ordinary class chain stay clean.
    let plain_window = backend
        .resolve_window(&WindowRef {
            app: None,
            id: plain.window,
            title: Some("Poracode Plain Class Test".into()),
        })
        .unwrap();
    let (x, y) = center(plain.child, plain.window);
    let clicked = backend
        .pointer(
            &plain_window,
            PointerAction::Click {
                x,
                y,
                button: MouseButton::Left,
                count: 1,
            },
            options,
            &CancelToken::default(),
        )
        .unwrap();
    assert!(clicked.ok, "plain click was refused: {:?}", clicked.refused);
    let notes = clicked.delivery.expect("plain click was delivered").notes;
    assert!(
        !carries_note(&notes, CHROMIUM_NOTE),
        "an ordinary class chain must not carry the note: {notes:?}"
    );
}

#[test]
fn drives_a_window_in_the_background_without_changing_foreground() {
    CLICKS.store(0, Ordering::SeqCst);
    DOUBLE_CLICKS.store(0, Ordering::SeqCst);
    SECONDARY_COMMANDS.store(0, Ordering::SeqCst);
    MINIMIZE_ON_PRIMARY_COMMAND.store(false, Ordering::SeqCst);
    CHARACTERS.lock().unwrap().clear();
    let backend = WindowsBackend::new();
    let test = TestWindow::spawn();
    PRIMARY_COMMANDS.store(0, Ordering::SeqCst);
    let window = backend
        .resolve_window(&WindowRef {
            app: None,
            id: test.window,
            title: Some("Poracode Computer Use Test Window".into()),
        })
        .unwrap();
    // SAFETY: this is a read-only foreground HWND query.
    let foreground = unsafe { GetForegroundWindow() };
    let frame = rect(test.window);
    let child = rect(test.child);
    let x = f64::from(child.left + (child.right - child.left) / 2 - frame.left);
    let y = f64::from(child.top + (child.bottom - child.top) / 2 - frame.top);

    let clicked = backend
        .pointer(
            &window,
            PointerAction::Click {
                x,
                y,
                button: MouseButton::Left,
                count: 1,
            },
            InputOptions {
                mode: InputMode::Background,
                verify: Verify::None,
            },
            &CancelToken::default(),
        )
        .unwrap();
    assert!(
        clicked.ok,
        "background click was refused: {:?}",
        clicked.refused
    );
    let deadline = Instant::now() + Duration::from_secs(2);
    while CLICKS.load(Ordering::SeqCst) == 0 && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(CLICKS.load(Ordering::SeqCst), 1);

    CLICKS.store(0, Ordering::SeqCst);
    let double_clicked = backend
        .pointer(
            &window,
            PointerAction::Click {
                x,
                y,
                button: MouseButton::Left,
                count: 2,
            },
            InputOptions {
                mode: InputMode::Background,
                verify: Verify::None,
            },
            &CancelToken::default(),
        )
        .unwrap();
    assert!(double_clicked.ok);
    let deadline = Instant::now() + Duration::from_secs(2);
    while DOUBLE_CLICKS.load(Ordering::SeqCst) == 0 && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(CLICKS.load(Ordering::SeqCst), 1);
    assert_eq!(DOUBLE_CLICKS.load(Ordering::SeqCst), 1);

    let chord = backend
        .keyboard(
            &window,
            KeyboardAction::Chord(parse_chord("Control+a").unwrap()),
            InputOptions {
                mode: InputMode::Background,
                verify: Verify::None,
            },
            &CancelToken::default(),
        )
        .unwrap();
    assert_eq!(
        chord.refused.unwrap().code,
        poracode_computer_use::protocol::actions::RefusalCode::BackgroundUnavailable
    );

    let typed = backend
        .keyboard(
            &window,
            KeyboardAction::Type("héllo 🙂".into()),
            InputOptions {
                mode: InputMode::Background,
                verify: Verify::None,
            },
            &CancelToken::default(),
        )
        .unwrap();
    assert!(
        typed.ok,
        "background typing was refused: {:?}",
        typed.refused
    );
    let deadline = Instant::now() + Duration::from_secs(2);
    while CHARACTERS.lock().unwrap().len() < 8 && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(
        String::from_utf16(&CHARACTERS.lock().unwrap()).unwrap(),
        "héllo 🙂"
    );
    // SAFETY: this is a read-only foreground HWND query.
    assert_eq!(unsafe { GetForegroundWindow() }, foreground);

    let pressed = backend
        .keyboard(
            &window,
            KeyboardAction::Chord(parse_chord("return").unwrap()),
            InputOptions {
                mode: InputMode::Background,
                verify: Verify::None,
            },
            &CancelToken::default(),
        )
        .unwrap();
    assert!(
        pressed.ok,
        "background key was refused: {:?}",
        pressed.refused
    );
    thread::sleep(Duration::from_millis(100));
    assert_eq!(
        SECONDARY_COMMANDS.load(Ordering::SeqCst),
        0,
        "Return targeted the focused control in a different same-process window"
    );

    let button = rect(test.button);
    let button_x = f64::from(button.left + (button.right - button.left) / 2 - frame.left);
    let button_y = f64::from(button.top + (button.bottom - button.top) / 2 - frame.top);
    let invoked = backend
        .pointer(
            &window,
            PointerAction::Click {
                x: button_x,
                y: button_y,
                button: MouseButton::Left,
                count: 1,
            },
            InputOptions {
                mode: InputMode::Background,
                verify: Verify::None,
            },
            &CancelToken::default(),
        )
        .unwrap();
    let target_id = invoked
        .delivery
        .as_ref()
        .and_then(|delivery| delivery.target.as_ref())
        .map(|target| target.id.clone())
        .unwrap_or_else(|| {
            panic!("UIA-first click returns a cached actionable element id: {invoked:?}")
        });
    let reinvoked = backend
        .invoke_element(
            &window,
            &target_id,
            poracode_computer_use::protocol::actions::ElementAction::Invoke,
            &CancelToken::default(),
        )
        .unwrap();
    assert!(reinvoked.ok, "cached UIA target was not actionable");
    let deadline = Instant::now() + Duration::from_secs(2);
    while PRIMARY_COMMANDS.load(Ordering::SeqCst) < 2 && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(PRIMARY_COMMANDS.load(Ordering::SeqCst), 2);

    // Put the secondary window and its button directly over the requested
    // window's button. UIA hit-testing must reject that foreign topmost element
    // and let background window messages target the requested HWND instead.
    // SAFETY: the HWND belongs to the live test window; this only moves it.
    unsafe {
        SetWindowPos(
            HWND(test.secondary as isize as *mut _),
            Some(HWND_TOPMOST),
            100,
            100,
            320,
            180,
            SWP_NOACTIVATE,
        )
    }
    .unwrap();
    let overlapped = backend
        .pointer(
            &window,
            PointerAction::Click {
                x: button_x,
                y: button_y,
                button: MouseButton::Left,
                count: 1,
            },
            InputOptions {
                mode: InputMode::Background,
                verify: Verify::None,
            },
            &CancelToken::default(),
        )
        .unwrap();
    assert!(overlapped.ok);
    let deadline = Instant::now() + Duration::from_secs(2);
    while PRIMARY_COMMANDS.load(Ordering::SeqCst) < 3 && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(PRIMARY_COMMANDS.load(Ordering::SeqCst), 3);
    assert_eq!(
        SECONDARY_COMMANDS.load(Ordering::SeqCst),
        0,
        "topmost overlapping window was invoked instead of the requested HWND"
    );

    let captured = backend.capture(&window, &CancelToken::default()).unwrap();
    assert!(!captured.frame.is_black());
    assert!(matches!(
        captured.method,
        "print_window" | "windows_graphics_capture"
    ));

    let accessibility = backend
        .snapshot_tree(&window, 200, &CancelToken::default())
        .unwrap()
        .state;
    let found = backend
        .find_elements(
            &window,
            &FindElementsInput {
                window: WindowRef {
                    app: Some(window.app.clone()),
                    id: window.id,
                    title: Some(window.title.clone()),
                },
                role: Some("edit".into()),
                name: None,
                automation_id: None,
                text: None,
                max_results: Some(5),
                snapshot_id: Some(accessibility.snapshot_id),
            },
            &CancelToken::default(),
        )
        .unwrap();
    let FindElementsResult::Found(found) = found else {
        panic!("fresh accessibility snapshot was refused");
    };
    assert!(!found.elements.is_empty());
    assert_eq!(
        found.elements[0].value.as_deref(),
        Some("Initial field value")
    );
    // Reorder the edit among its siblings after the snapshot. RuntimeId-based
    // resolution must still locate the original element.
    // SAFETY: the HWND belongs to the live test window; flags preserve geometry.
    unsafe {
        SetWindowPos(
            HWND(test.edit as isize as *mut _),
            Some(HWND_TOP),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )
    }
    .unwrap();
    let set = backend
        .set_element_value(
            &window,
            &found.elements[0].id,
            "set through UIA",
            &CancelToken::default(),
        )
        .unwrap();
    assert!(set.ok, "set_element_value was refused: {:?}", set.refused);
    let updated = backend
        .snapshot_tree(&window, 200, &CancelToken::default())
        .unwrap()
        .state;
    assert!(updated.tree.contains("set through UIA"));
    assert_eq!(rect(test.edit).right - rect(test.edit).left, 220);

    let FindElementsResult::Found(buttons) = backend
        .find_elements(
            &window,
            &FindElementsInput {
                window: WindowRef {
                    app: Some(window.app.clone()),
                    id: window.id,
                    title: Some(window.title.clone()),
                },
                role: Some("button".into()),
                name: Some("Invoke me".into()),
                automation_id: None,
                text: None,
                max_results: Some(1),
                snapshot_id: Some(updated.snapshot_id),
            },
            &CancelToken::default(),
        )
        .unwrap()
    else {
        panic!("updated accessibility snapshot was refused");
    };

    MINIMIZE_ON_PRIMARY_COMMAND.store(true, Ordering::SeqCst);
    let minimized = backend
        .invoke_element(
            &window,
            &buttons.elements[0].id,
            poracode_computer_use::protocol::actions::ElementAction::Invoke,
            &CancelToken::default(),
        )
        .unwrap();
    assert!(
        minimized.ok,
        "minimize invoke was refused: {:?}",
        minimized.refused
    );
    assert_eq!(minimized.window.minimized, Some(true));
}
