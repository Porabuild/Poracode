use std::thread;
use std::time::Duration;

use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput, VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId,
    IsIconic, SW_RESTORE, SW_SHOW, SetForegroundWindow, ShowWindow,
};

use crate::protocol::window::{WindowInfo, WindowRef};
use crate::protocol::{HelperError, Result};

use super::window_list::{hwnd_from_id, resolve_window, window_from_hwnd};

fn alt_input(up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0x12),
                wScan: 0,
                dwFlags: if up {
                    KEYEVENTF_KEYUP
                } else {
                    Default::default()
                },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn try_foreground(hwnd: windows::Win32::Foundation::HWND) {
    // SAFETY: all calls operate on current/resolved window and thread ids. Any
    // temporary input-queue attachment is balanced before returning.
    unsafe {
        let _ = AllowSetForegroundWindow(u32::MAX);
        let foreground = GetForegroundWindow();
        let foreground_thread = GetWindowThreadProcessId(foreground, None);
        let current_thread = GetCurrentThreadId();
        let attached = foreground_thread != 0
            && foreground_thread != current_thread
            && AttachThreadInput(foreground_thread, current_thread, true).as_bool();
        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);
        if attached {
            let _ = AttachThreadInput(foreground_thread, current_thread, false);
        }
    }
}

pub fn activate(window: &WindowInfo) -> Result<WindowInfo> {
    let mut hwnd = hwnd_from_id(window.id);
    // SAFETY: ShowWindow only updates state for the resolved HWND.
    unsafe {
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
            thread::sleep(Duration::from_millis(40));
        } else {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }
    }

    let mut used_alt = false;
    for attempt in 0..3 {
        // SAFETY: GetForegroundWindow returns a borrowed HWND for comparison.
        if unsafe { GetForegroundWindow() } == hwnd {
            break;
        }
        try_foreground(hwnd);
        thread::sleep(Duration::from_millis(60));
        // SAFETY: GetForegroundWindow returns a borrowed HWND for comparison.
        if unsafe { GetForegroundWindow() } == hwnd {
            break;
        }
        if attempt == 0 {
            used_alt = true;
            // SAFETY: INPUT has the exact ABI layout and both Alt events are
            // supplied in one live slice, so the modifier cannot remain down.
            unsafe {
                let _ = SendInput(
                    &[alt_input(false), alt_input(true)],
                    std::mem::size_of::<INPUT>() as i32,
                );
            }
        }
        if let Ok(recovered) = resolve_window(&WindowRef {
            app: Some(window.app.clone()),
            id: window.id,
            title: Some(window.title.clone()),
        }) {
            hwnd = hwnd_from_id(recovered.id);
        }
    }

    // SAFETY: GetForegroundWindow returns a borrowed HWND for comparison.
    if unsafe { GetForegroundWindow() } != hwnd {
        return Err(HelperError::permission_denied(
            "Focus did not reach the target window. The desktop may be locked or another secure surface may be active.",
        ));
    }
    if used_alt {
        // Clear menu mode left by the Alt foreground-lock nudge.
        let escape = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0x1b),
                    wScan: 0,
                    dwFlags: Default::default(),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let mut escape_up = escape;
        escape_up.Anonymous.ki.dwFlags = KEYEVENTF_KEYUP;
        // SAFETY: both Escape events use initialized INPUT values.
        unsafe {
            let _ = SendInput(&[escape, escape_up], std::mem::size_of::<INPUT>() as i32);
        }
    }
    window_from_hwnd(hwnd, true).ok_or_else(HelperError::window_unavailable)
}
