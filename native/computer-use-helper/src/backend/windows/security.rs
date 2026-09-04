use windows::Win32::Foundation::{HANDLE, LPARAM, WPARAM};
use windows::Win32::System::StationsAndDesktops::{
    CloseDesktop, DESKTOP_CONTROL_FLAGS, DESKTOP_READOBJECTS, GetUserObjectInformationW,
    OpenInputDesktop, UOI_NAME,
};
use windows::Win32::UI::WindowsAndMessaging::{
    IsIconic, SMTO_ABORTIFHUNG, SMTO_BLOCK, SendMessageTimeoutW, WM_NULL,
};

use crate::protocol::actions::{Refusal, RefusalCode};

use super::window_list::hwnd_from_id;

fn input_desktop_is_default() -> bool {
    // SAFETY: the desktop handle is owned by this function, the queried buffer
    // is valid for its advertised byte size, and the handle is always closed.
    unsafe {
        let desktop = match OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_READOBJECTS) {
            Ok(desktop) => desktop,
            Err(_) => return false,
        };
        let mut needed = 0u32;
        let _ = GetUserObjectInformationW(HANDLE(desktop.0), UOI_NAME, None, 0, Some(&mut needed));
        let mut buffer = vec![0u16; (needed as usize / 2).max(1)];
        let result = GetUserObjectInformationW(
            HANDLE(desktop.0),
            UOI_NAME,
            Some(buffer.as_mut_ptr().cast()),
            needed,
            Some(&mut needed),
        );
        let _ = CloseDesktop(desktop);
        if result.is_err() {
            return false;
        }
        let end = buffer
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(buffer.len());
        String::from_utf16_lossy(&buffer[..end]).eq_ignore_ascii_case("Default")
    }
}

pub fn probe_background(window_id: i64) -> Option<Refusal> {
    let hwnd = hwnd_from_id(window_id);
    // SAFETY: IsIconic and SendMessageTimeoutW operate on the validated target
    // HWND and the optional result pointer remains live for the call.
    unsafe {
        if IsIconic(hwnd).as_bool() {
            return Some(Refusal::window_minimized());
        }
        if !input_desktop_is_default() {
            return Some(Refusal::new(
                RefusalCode::SecureDesktop,
                "The interactive desktop is not the user's Default desktop.",
                "Unlock or dismiss the secure desktop, then retry.",
            ));
        }
        let mut result = 0usize;
        if SendMessageTimeoutW(
            hwnd,
            WM_NULL,
            WPARAM(0),
            LPARAM(0),
            SMTO_ABORTIFHUNG | SMTO_BLOCK,
            200,
            Some(&mut result),
        )
        .0 == 0
        {
            return Some(Refusal::new(
                RefusalCode::TargetNotResponding,
                "The target window did not answer a bounded message probe.",
                "Wait for the app to respond, then retry or use mode:\"foreground\".",
            ));
        }
    }
    None
}
