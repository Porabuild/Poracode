use std::ffi::c_void;
use std::path::Path;
use std::thread;
use std::time::Duration;

use windows::Win32::Foundation::{
    CloseHandle, ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS, HWND, LPARAM, PROPERTYKEY, RECT,
    RPC_E_CHANGED_MODE,
};
use windows::Win32::Graphics::Dwm::{DWMWA_CLOAKED, DwmGetWindowAttribute};
use windows::Win32::Storage::Packaging::Appx::GetApplicationUserModelId;
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx, CoUninitialize};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible,
};
use windows::core::{BOOL, BSTR, GUID, PWSTR};

use crate::backend::is_computer_use_overlay_title;
use crate::protocol::window::{WindowInfo, WindowRef, WindowSource};
use crate::protocol::{HelperError, Result};

use super::shell_apps_folder_id;

struct ComGuard(bool);

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            // SAFETY: this guard owns the successful CoInitializeEx call on
            // the current thread and drops before the thread returns.
            unsafe { CoUninitialize() };
        }
    }
}

fn initialize_com() -> Option<ComGuard> {
    // SAFETY: no reserved pointer is supplied. A changed-mode result means the
    // current thread already has a usable COM apartment initialized.
    let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if initialized.is_ok() {
        Some(ComGuard(true))
    } else if initialized == RPC_E_CHANGED_MODE {
        Some(ComGuard(false))
    } else {
        None
    }
}

pub fn hwnd_from_id(id: i64) -> HWND {
    HWND(id as isize as *mut c_void)
}

pub fn id_from_hwnd(hwnd: HWND) -> i64 {
    hwnd.0 as isize as i64
}

unsafe extern "system" fn collect_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    // SAFETY: `enumerate_handles` passes a live `Vec<HWND>` pointer and
    // `EnumWindows` invokes this callback synchronously before that vector drops.
    let handles = unsafe { &mut *(lparam.0 as *mut Vec<HWND>) };
    handles.push(hwnd);
    BOOL(1)
}

fn enumerate_handles() -> Vec<HWND> {
    let mut handles = Vec::new();
    // SAFETY: the callback only appends to the live vector passed through LPARAM.
    let _ = unsafe {
        EnumWindows(
            Some(collect_window),
            LPARAM((&mut handles as *mut Vec<HWND>) as isize),
        )
    };
    handles
}

fn window_title(hwnd: HWND) -> Option<String> {
    // SAFETY: `hwnd` came from EnumWindows/validated caller input and the buffer
    // is writable for the exact length passed to GetWindowTextW.
    unsafe {
        let length = GetWindowTextLengthW(hwnd);
        if length <= 0 {
            return None;
        }
        let mut buffer = vec![0u16; length as usize + 1];
        let written = GetWindowTextW(hwnd, &mut buffer);
        if written <= 0 {
            return None;
        }
        let title = String::from_utf16_lossy(&buffer[..written as usize]);
        (!title.trim().is_empty()).then_some(title)
    }
}

fn process_path(pid: u32) -> Option<String> {
    // SAFETY: OpenProcess returns an owned process handle. The UTF-16 buffer and
    // length pointer remain valid for QueryFullProcessImageNameW, and the handle
    // is closed before returning on every path.
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buffer = vec![0u16; 32_768];
        let mut length = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut length,
        );
        let _ = CloseHandle(process);
        result.ok()?;
        Some(String::from_utf16_lossy(&buffer[..length as usize]))
    }
}

fn process_app_id(pid: u32) -> Option<String> {
    // SAFETY: the process handle is opened read-only and closed on every path.
    // GetApplicationUserModelId first reports the required UTF-16 length, then
    // writes at most that many code units into the owned buffer.
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut length = 0u32;
        if GetApplicationUserModelId(process, &mut length, None) != ERROR_INSUFFICIENT_BUFFER
            || length == 0
        {
            let _ = CloseHandle(process);
            return None;
        }
        let mut buffer = vec![0u16; length as usize];
        let result =
            GetApplicationUserModelId(process, &mut length, Some(PWSTR(buffer.as_mut_ptr())));
        let _ = CloseHandle(process);
        if result != ERROR_SUCCESS {
            return None;
        }
        let end = buffer
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(buffer.len());
        let app_id = String::from_utf16_lossy(&buffer[..end]);
        (!app_id.is_empty()).then(|| shell_apps_folder_id(&app_id))
    }
}

fn window_app_id(hwnd: HWND) -> Option<String> {
    const APP_USER_MODEL_ID: PROPERTYKEY = PROPERTYKEY {
        fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
        pid: 5,
    };
    let _com = initialize_com()?;
    // SAFETY: hwnd is a live candidate from EnumWindows. The property store
    // and returned PROPVARIANT are owned wrappers released on return.
    let store = unsafe { SHGetPropertyStoreForWindow::<IPropertyStore>(hwnd) }.ok()?;
    // SAFETY: APP_USER_MODEL_ID is a valid PROPERTYKEY and the store owns the
    // returned PROPVARIANT allocation.
    let value = unsafe { store.GetValue(&APP_USER_MODEL_ID) }.ok()?;
    let app_id = BSTR::try_from(&value).ok()?.to_string();
    (!app_id.is_empty()).then(|| shell_apps_folder_id(&app_id))
}

fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked = 0u32;
    // SAFETY: `cloaked` is a writable u32 and the supplied size matches it.
    unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            (&mut cloaked as *mut u32).cast(),
            std::mem::size_of::<u32>() as u32,
        )
        .is_ok()
            && cloaked != 0
    }
}

pub fn window_from_hwnd(hwnd: HWND, allow_hidden: bool) -> Option<WindowInfo> {
    // SAFETY: all calls are read-only queries on a candidate HWND. RECT and pid
    // output pointers are valid for the duration of each call.
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool()
            || (!allow_hidden && !IsWindowVisible(hwnd).as_bool())
            || (!allow_hidden && is_cloaked(hwnd))
        {
            return None;
        }
        let title = window_title(hwnd)?;
        if is_computer_use_overlay_title(&title) {
            return None;
        }
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).ok()?;
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 0 || height <= 0 {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let process_path = process_path(pid).unwrap_or_else(|| format!("pid:{pid}"));
        let process_name = Path::new(&process_path)
            .file_stem()
            .and_then(|value| value.to_str())
            .map(str::to_string);
        let display_name = if process_name
            .as_deref()
            .is_some_and(|name| name.eq_ignore_ascii_case("ApplicationFrameHost"))
        {
            Some(title.clone())
        } else {
            process_name
        };
        let app = window_app_id(hwnd)
            .or_else(|| process_app_id(pid))
            .unwrap_or(process_path);
        Some(WindowInfo {
            app,
            id: id_from_hwnd(hwnd),
            title,
            x: rect.left,
            y: rect.top,
            width,
            height,
            pid: Some(pid),
            display_name,
            minimized: Some(IsIconic(hwnd).as_bool()),
            source: Some(WindowSource::Win32),
        })
    }
}

pub fn list_windows() -> Vec<WindowInfo> {
    enumerate_handles()
        .into_iter()
        .filter_map(|hwnd| window_from_hwnd(hwnd, false))
        .collect()
}

pub fn resolve_window(reference: &WindowRef) -> Result<WindowInfo> {
    let hwnd = hwnd_from_id(reference.id);
    if let Some(window) = window_from_hwnd(hwnd, true) {
        if window.matches_app(reference.app.as_deref()) {
            return Ok(window);
        }
        return Err(HelperError::window_unavailable());
    }

    for attempt in 0..8 {
        let mut candidates: Vec<_> = list_windows()
            .into_iter()
            .filter(|window| window.matches_app(reference.app.as_deref()))
            .collect();
        if let Some(title) = reference.title.as_deref() {
            let exact: Vec<_> = candidates
                .iter()
                .filter(|window| window.title.eq_ignore_ascii_case(title))
                .cloned()
                .collect();
            if !exact.is_empty() {
                candidates = exact;
            }
        }
        // SAFETY: GetForegroundWindow takes no pointers and returns a borrowed HWND.
        let foreground = unsafe { GetForegroundWindow() };
        if let Some(window) = candidates
            .iter()
            .find(|window| hwnd_from_id(window.id) == foreground)
            .cloned()
            .or_else(|| candidates.into_iter().max_by_key(WindowInfo::area))
        {
            return Ok(window);
        }
        if attempt < 7 {
            thread::sleep(Duration::from_millis(100));
        }
    }
    Err(HelperError::window_unavailable())
}

pub fn class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    // SAFETY: the class-name buffer is writable and bounded by its slice length.
    let written =
        unsafe { windows::Win32::UI::WindowsAndMessaging::GetClassNameW(hwnd, &mut buffer) };
    String::from_utf16_lossy(&buffer[..written.max(0) as usize])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_only_the_exact_computer_use_overlay_title() {
        assert!(is_computer_use_overlay_title(
            "Poracode Computer Use Overlay"
        ));
        assert!(!is_computer_use_overlay_title(
            "Poracode Computer Use Overlay "
        ));
        assert!(!is_computer_use_overlay_title("Poracode"));
    }
}
