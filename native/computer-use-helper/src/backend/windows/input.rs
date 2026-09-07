use std::thread;
use std::time::Duration;

use windows::Win32::Foundation::{ERROR_ACCESS_DENIED, HWND, LPARAM, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    MAPVK_VK_TO_VSC, MOUSE_EVENT_FLAGS, MOUSEEVENTF_HWHEEL, MOUSEEVENTF_LEFTDOWN,
    MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN,
    MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL, MOUSEINPUT, MapVirtualKeyW, SendInput, VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CS_DBLCLKS, CWP_SKIPDISABLED, CWP_SKIPINVISIBLE, CWP_SKIPTRANSPARENT, ChildWindowFromPointEx,
    GCL_STYLE, GUITHREADINFO, GetClassLongPtrW, GetGUIThreadInfo, GetWindowThreadProcessId,
    IsChild, PostMessageW, SetCursorPos, WM_CHAR, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDBLCLK,
    WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDBLCLK, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEMOVE,
    WM_MOUSEWHEEL, WM_RBUTTONDBLCLK, WM_RBUTTONDOWN, WM_RBUTTONUP,
};
use windows::core::HRESULT;

use crate::backend::{CancelToken, KeyboardAction, PointerAction};
use crate::geometry::{drag_steps, frame_to_screen, interpolate, make_lparam, point_in_frame};
use crate::protocol::actions::{
    Delivery, InputMode, InteractiveResult, MouseButton, Refusal, RefusalCode, Route,
};
use crate::protocol::keys::KeyToken;
use crate::protocol::window::WindowInfo;
use crate::protocol::{HelperError, Result};

use super::keys::to_virtual_chord;
use super::security::probe_background;
use super::window_list::{class_name, hwnd_from_id};

fn post_refusal(error: windows::core::Error) -> Refusal {
    if error.code() == HRESULT::from_win32(ERROR_ACCESS_DENIED.0) {
        return Refusal::new(
            RefusalCode::ElevatedTarget,
            "Windows blocked background messages at the target's integrity boundary.",
            "Run Poracode at the same integrity level as the target, or retry with mode:\"foreground\".",
        );
    }
    Refusal::background_unavailable(format!("Windows rejected the background message: {error}"))
}

fn post(
    hwnd: HWND,
    message: u32,
    wparam: usize,
    lparam: isize,
) -> std::result::Result<(), Refusal> {
    // SAFETY: the target HWND has been resolved immediately before dispatch and
    // message parameters contain only packed scalar values.
    unsafe { PostMessageW(Some(hwnd), message, WPARAM(wparam), LPARAM(lparam)) }
        .map_err(post_refusal)
}

fn deepest_child(root: HWND, screen: POINT) -> (HWND, POINT) {
    let mut target = root;
    let mut client = screen;
    // SAFETY: ScreenToClient mutates the live POINT and ChildWindowFromPointEx
    // only queries descendants of the resolved target window.
    unsafe {
        let _ = ScreenToClient(target, &mut client);
        for _ in 0..16 {
            let child = ChildWindowFromPointEx(
                target,
                client,
                CWP_SKIPINVISIBLE | CWP_SKIPDISABLED | CWP_SKIPTRANSPARENT,
            );
            if child.0.is_null() || child == target {
                break;
            }
            target = child;
            client = screen;
            let _ = ScreenToClient(target, &mut client);
        }
    }
    (target, client)
}

fn pointer_target(window: &WindowInfo, x: f64, y: f64) -> Result<(HWND, POINT, POINT)> {
    if !point_in_frame(window, x, y) {
        return Err(HelperError::invalid_input(format!(
            "coordinate ({x},{y}) is outside the {}x{} window frame",
            window.width, window.height
        )));
    }
    let (screen_x, screen_y) = frame_to_screen(window, x, y);
    let screen = POINT {
        x: screen_x,
        y: screen_y,
    };
    let (target, client) = deepest_child(hwnd_from_id(window.id), screen);
    Ok((target, client, screen))
}

fn mouse_messages(button: MouseButton) -> (u32, u32, u32) {
    match button {
        MouseButton::Left => (WM_LBUTTONDOWN, WM_LBUTTONUP, WM_LBUTTONDBLCLK),
        MouseButton::Right => (WM_RBUTTONDOWN, WM_RBUTTONUP, WM_RBUTTONDBLCLK),
        MouseButton::Middle => (WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MBUTTONDBLCLK),
    }
}

fn supports_double_clicks(hwnd: HWND) -> bool {
    // SAFETY: this is a read-only class-style query on the resolved target HWND.
    unsafe { GetClassLongPtrW(hwnd, GCL_STYLE) as u32 & CS_DBLCLKS.0 != 0 }
}

fn packed_wheel(delta: i32) -> usize {
    ((delta as i16 as u16 as u32) << 16) as usize
}

fn message_input_refusal(window: &WindowInfo) -> Option<Refusal> {
    let class = class_name(hwnd_from_id(window.id)).to_ascii_lowercase();
    (class.contains("corewindow")
        || class.contains("applicationframewindow")
        || class.contains("xaml"))
    .then(|| {
        Refusal::background_unavailable(
            "This Windows UI host does not accept reliable background window messages.",
        )
    })
}

fn background_pointer(
    window: &WindowInfo,
    action: PointerAction,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    if let Some(refusal) = probe_background(window.id) {
        return Ok(InteractiveResult::refused(window.clone(), refusal));
    }
    if let Some(refusal) = message_input_refusal(window) {
        return Ok(InteractiveResult::refused(window.clone(), refusal));
    }
    let mut delivery = Delivery::background(Route::Message);
    let refused = match action {
        PointerAction::Click {
            x,
            y,
            button,
            count,
        } => {
            let (target, client, _) = pointer_target(window, x, y)?;
            let (down, up, double_click) = mouse_messages(button);
            let supports_double_clicks = count == 2 && supports_double_clicks(target);
            let mut result = post(target, WM_MOUSEMOVE, 0, make_lparam(client.x, client.y));
            for index in 0..count {
                if result.is_err() {
                    break;
                }
                cancel.check()?;
                let down = if index == 1 && supports_double_clicks {
                    double_click
                } else {
                    down
                };
                result = post(target, down, 0, make_lparam(client.x, client.y))
                    .and_then(|_| post(target, up, 0, make_lparam(client.x, client.y)));
            }
            if button == MouseButton::Right {
                delivery
                    .notes
                    .push("context_menu_position_unreliable".into());
            }
            if class_name(target).contains("Chrome_WidgetWin") {
                delivery
                    .notes
                    .push("chromium_synthetic_input_may_be_ignored".into());
            }
            result.err()
        }
        PointerAction::Scroll { x, y, dx, dy } => {
            let (target, _client, screen) = pointer_target(window, x, y)?;
            let mut result = Ok(());
            if dy.round() as i32 != 0 {
                result = post(
                    target,
                    WM_MOUSEWHEEL,
                    packed_wheel(-(dy.round() as i32)),
                    make_lparam(screen.x, screen.y),
                );
            }
            if result.is_ok() && dx.round() as i32 != 0 {
                result = post(
                    target,
                    windows::Win32::UI::WindowsAndMessaging::WM_MOUSEHWHEEL,
                    packed_wheel(dx.round() as i32),
                    make_lparam(screen.x, screen.y),
                );
            }
            result.err()
        }
        PointerAction::Drag { from, to, steps } => {
            let (target, from_client, _) = pointer_target(window, from.0, from.1)?;
            if !point_in_frame(window, to.0, to.1) {
                return Err(HelperError::invalid_input(
                    "drag endpoint is outside the window",
                ));
            }
            let (to_screen_x, to_screen_y) = frame_to_screen(window, to.0, to.1);
            let mut to_client = POINT {
                x: to_screen_x,
                y: to_screen_y,
            };
            // SAFETY: the target is the resolved start child and the POINT is live.
            unsafe {
                let _ = ScreenToClient(target, &mut to_client);
            }
            let steps = drag_steps(
                (from_client.x, from_client.y),
                (to_client.x, to_client.y),
                steps,
            );
            let mut result = post(
                target,
                WM_MOUSEMOVE,
                0,
                make_lparam(from_client.x, from_client.y),
            )
            .and_then(|_| {
                post(
                    target,
                    WM_LBUTTONDOWN,
                    1,
                    make_lparam(from_client.x, from_client.y),
                )
            });
            if result.is_ok() {
                for (x, y) in interpolate(
                    (from_client.x, from_client.y),
                    (to_client.x, to_client.y),
                    steps,
                ) {
                    if let Err(error) = cancel.check() {
                        let _ = post(target, WM_LBUTTONUP, 0, make_lparam(x, y));
                        return Err(error);
                    }
                    if let Err(error) = post(target, WM_MOUSEMOVE, 1, make_lparam(x, y)) {
                        result = Err(error);
                        break;
                    }
                    thread::sleep(Duration::from_millis(8));
                }
                let release = post(
                    target,
                    WM_LBUTTONUP,
                    0,
                    make_lparam(to_client.x, to_client.y),
                );
                if result.is_ok() {
                    result = release;
                }
            }
            result.err()
        }
    };
    Ok(match refused {
        Some(refusal) => InteractiveResult::refused(window.clone(), refusal),
        None => InteractiveResult::delivered(window.clone(), delivery),
    })
}

fn keyboard_target(window: &WindowInfo) -> (HWND, bool) {
    let root = hwnd_from_id(window.id);
    let mut process_id = 0u32;
    // SAFETY: GUITHREADINFO is initialized with its required byte size and all
    // pointers passed to the read-only thread queries are valid.
    unsafe {
        let thread_id = GetWindowThreadProcessId(root, Some(&mut process_id));
        let mut info = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        if thread_id != 0
            && GetGUIThreadInfo(thread_id, &mut info).is_ok()
            && !info.hwndFocus.0.is_null()
            && (info.hwndFocus == root || IsChild(root, info.hwndFocus).as_bool())
        {
            return (info.hwndFocus, false);
        }
    }
    (root, true)
}

fn key_lparam(key: VIRTUAL_KEY, up: bool) -> isize {
    // SAFETY: MapVirtualKeyW is a pure table lookup for the supplied VK code.
    let scan = unsafe { MapVirtualKeyW(u32::from(key.0), MAPVK_VK_TO_VSC) };
    let mut value = 1u32 | ((scan & 0xff) << 16);
    if up {
        value |= 1 << 30 | 1 << 31;
    }
    value as i32 as isize
}

fn post_virtual_keys(target: HWND, keys: &[VIRTUAL_KEY]) -> std::result::Result<(), Refusal> {
    let mut pressed = Vec::new();
    let mut result = Ok(());
    for key in keys {
        if let Err(error) = post(
            target,
            WM_KEYDOWN,
            usize::from(key.0),
            key_lparam(*key, false),
        ) {
            result = Err(error);
            break;
        }
        pressed.push(*key);
    }
    for key in pressed.into_iter().rev() {
        if let Err(error) = post(target, WM_KEYUP, usize::from(key.0), key_lparam(key, true))
            && result.is_ok()
        {
            result = Err(error);
        }
    }
    result
}

fn background_keyboard(
    window: &WindowInfo,
    action: &KeyboardAction,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    if let Some(refusal) = probe_background(window.id) {
        return Ok(InteractiveResult::refused(window.clone(), refusal));
    }
    if let Some(refusal) = message_input_refusal(window) {
        return Ok(InteractiveResult::refused(window.clone(), refusal));
    }
    let (target, focus_unknown) = keyboard_target(window);
    let mut delivery = Delivery::background(Route::Message);
    if focus_unknown {
        delivery.notes.push("focus_unknown".into());
    }
    if class_name(hwnd_from_id(window.id)).contains("Chrome_WidgetWin") {
        delivery
            .notes
            .push("chromium_synthetic_input_may_be_ignored".into());
    }
    let refused = match action {
        KeyboardAction::Type(text) => {
            let mut result = Ok(());
            for (index, unit) in text.encode_utf16().enumerate() {
                if index % 64 == 0 {
                    cancel.check()?;
                }
                let next = match unit {
                    9 => {
                        let key = VIRTUAL_KEY(0x09);
                        post(
                            target,
                            WM_KEYDOWN,
                            usize::from(key.0),
                            key_lparam(key, false),
                        )
                        .and_then(|_| {
                            post(target, WM_KEYUP, usize::from(key.0), key_lparam(key, true))
                        })
                    }
                    10 | 13 => {
                        let key = VIRTUAL_KEY(0x0d);
                        post(
                            target,
                            WM_KEYDOWN,
                            usize::from(key.0),
                            key_lparam(key, false),
                        )
                        .and_then(|_| {
                            post(target, WM_KEYUP, usize::from(key.0), key_lparam(key, true))
                        })
                    }
                    _ => post(target, WM_CHAR, usize::from(unit), 1),
                };
                if let Err(error) = next {
                    result = Err(error);
                    break;
                }
            }
            result.err()
        }
        KeyboardAction::Chord(chord) => {
            let virtual_chord = to_virtual_chord(chord)?;
            if !virtual_chord.modifiers.is_empty() {
                return Ok(InteractiveResult::refused(
                    window.clone(),
                    Refusal::background_unavailable(
                        "Windows background messages cannot reliably deliver modifier keys. Use an accessibility action or type_text for literal text.",
                    ),
                ));
            }
            let result = post_virtual_keys(target, &virtual_chord.keys);
            if result.is_ok()
                && chord.keys.len() == 1
                && let KeyToken::Char(character) = chord.keys[0]
            {
                let mut utf16 = [0u16; 2];
                for unit in character.encode_utf16(&mut utf16) {
                    if let Err(error) = post(target, WM_CHAR, usize::from(*unit), 1) {
                        return Ok(InteractiveResult::refused(window.clone(), error));
                    }
                }
            }
            result.err()
        }
    };
    Ok(match refused {
        Some(refusal) => InteractiveResult::refused(window.clone(), refusal),
        None => InteractiveResult::delivered(window.clone(), delivery),
    })
}

fn keyboard_input(
    key: VIRTUAL_KEY,
    scan: u16,
    flags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS,
) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: scan,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn mouse_input(flags: MOUSE_EVENT_FLAGS, data: u32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: data,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn send_inputs(inputs: &[INPUT]) -> Result<()> {
    // SAFETY: INPUT is the exact ABI type and the slice stays live for SendInput.
    let sent = unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent == inputs.len() as u32 {
        Ok(())
    } else {
        Err(HelperError::internal(format!(
            "SendInput delivered {sent} of {} events",
            inputs.len()
        )))
    }
}

fn foreground_pointer(
    window: &WindowInfo,
    action: PointerAction,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    let set_cursor = |x: f64, y: f64| -> Result<()> {
        if !point_in_frame(window, x, y) {
            return Err(HelperError::invalid_input(
                "pointer coordinate is outside the window",
            ));
        }
        let (x, y) = frame_to_screen(window, x, y);
        // SAFETY: SetCursorPos accepts scalar virtual-screen coordinates.
        unsafe { SetCursorPos(x, y) }
            .map_err(|error| HelperError::internal(format!("SetCursorPos failed: {error}")))
    };
    match action {
        PointerAction::Click {
            x,
            y,
            button,
            count,
        } => {
            set_cursor(x, y)?;
            let (down, up) = match button {
                MouseButton::Left => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
                MouseButton::Right => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
                MouseButton::Middle => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
            };
            for _ in 0..count {
                cancel.check()?;
                let pressed = send_inputs(&[mouse_input(down, 0)]);
                let released = send_inputs(&[mouse_input(up, 0)]);
                pressed?;
                released?;
            }
        }
        PointerAction::Scroll { x, y, dx, dy } => {
            set_cursor(x, y)?;
            let mut inputs = Vec::new();
            if dy.round() as i32 != 0 {
                inputs.push(mouse_input(
                    MOUSEEVENTF_WHEEL,
                    (-(dy.round() as i32)) as u32,
                ));
            }
            if dx.round() as i32 != 0 {
                inputs.push(mouse_input(MOUSEEVENTF_HWHEEL, dx.round() as i32 as u32));
            }
            if !inputs.is_empty() {
                send_inputs(&inputs)?;
            }
        }
        PointerAction::Drag { from, to, steps } => {
            set_cursor(from.0, from.1)?;
            send_inputs(&[mouse_input(MOUSEEVENTF_LEFTDOWN, 0)])?;
            let from = frame_to_screen(window, from.0, from.1);
            let to = frame_to_screen(window, to.0, to.1);
            let movement: Result<()> = (|| {
                for (x, y) in interpolate(from, to, drag_steps(from, to, steps)) {
                    cancel.check()?;
                    // SAFETY: SetCursorPos accepts scalar virtual-screen coordinates.
                    unsafe { SetCursorPos(x, y) }.map_err(|error| {
                        HelperError::internal(format!("SetCursorPos failed: {error}"))
                    })?;
                    thread::sleep(Duration::from_millis(8));
                }
                Ok(())
            })();
            let release = send_inputs(&[mouse_input(MOUSEEVENTF_LEFTUP, 0)]);
            movement?;
            release?;
        }
    }
    Ok(InteractiveResult::delivered(
        window.clone(),
        Delivery::foreground(Route::Input),
    ))
}

fn foreground_keyboard(
    window: &WindowInfo,
    action: &KeyboardAction,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    match action {
        KeyboardAction::Type(text) => {
            for units in text.encode_utf16().collect::<Vec<_>>().chunks(64) {
                cancel.check()?;
                let mut inputs = Vec::with_capacity(units.len() * 2);
                for unit in units {
                    inputs.push(keyboard_input(VIRTUAL_KEY(0), *unit, KEYEVENTF_UNICODE));
                    inputs.push(keyboard_input(
                        VIRTUAL_KEY(0),
                        *unit,
                        KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    ));
                }
                let sent = send_inputs(&inputs);
                if sent.is_err() {
                    let releases = units
                        .iter()
                        .map(|unit| {
                            keyboard_input(
                                VIRTUAL_KEY(0),
                                *unit,
                                KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                            )
                        })
                        .collect::<Vec<_>>();
                    let _ = send_inputs(&releases);
                }
                sent?;
            }
        }
        KeyboardAction::Chord(chord) => {
            let chord = to_virtual_chord(chord)?;
            let mut pressed = Vec::new();
            let mut result = Ok(());
            for key in chord.modifiers.iter().chain(&chord.keys) {
                if let Err(error) = send_inputs(&[keyboard_input(*key, 0, Default::default())]) {
                    result = Err(error);
                    break;
                }
                pressed.push(*key);
            }
            for key in pressed.into_iter().rev() {
                if let Err(error) = send_inputs(&[keyboard_input(key, 0, KEYEVENTF_KEYUP)])
                    && result.is_ok()
                {
                    result = Err(error);
                }
            }
            result?;
        }
    }
    Ok(InteractiveResult::delivered(
        window.clone(),
        Delivery::foreground(Route::Input),
    ))
}

pub fn pointer(
    window: &WindowInfo,
    action: PointerAction,
    mode: InputMode,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    match mode {
        InputMode::Background => background_pointer(window, action, cancel),
        InputMode::Foreground => foreground_pointer(window, action, cancel),
    }
}

pub fn keyboard(
    window: &WindowInfo,
    action: &KeyboardAction,
    mode: InputMode,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    match mode {
        InputMode::Background => background_keyboard(window, action, cancel),
        InputMode::Foreground => foreground_keyboard(window, action, cancel),
    }
}
