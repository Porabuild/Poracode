use std::collections::HashSet;
use std::thread;
use std::time::{Duration, Instant};

use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use windows::core::{PCWSTR, w};

use crate::backend::CancelToken;
use crate::protocol::actions::{Delivered, LaunchResult};
use crate::protocol::{HelperError, Result};

use super::{SHELL_APPS_FOLDER_PREFIX, shell_apps_folder_id, window_list::list_windows};

fn validate(app: &str) -> Result<()> {
    let app = app.trim();
    if app.is_empty() || app.contains('\0') {
        return Err(HelperError::invalid_input("app is required"));
    }
    if app.starts_with(r"\\") {
        return Err(HelperError::invalid_input(
            "UNC paths are not allowed for launch_app.",
        ));
    }
    let shell_apps = app
        .get(..SHELL_APPS_FOLDER_PREFIX.len())
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(SHELL_APPS_FOLDER_PREFIX));
    let bytes = app.as_bytes();
    let drive_path = bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/');
    let scheme = app.find(':').is_some_and(|colon| {
        colon > 0
            && app[..colon]
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '.' | '-'))
    });
    if !shell_apps && !drive_path && scheme {
        return Err(HelperError::invalid_input(
            "URL schemes are not allowed for launch_app.",
        ));
    }
    if !shell_apps && !drive_path && (app.contains('\\') || app.contains('/')) {
        return Err(HelperError::invalid_input(
            "Relative paths are not allowed for launch_app.",
        ));
    }
    Ok(())
}

fn launch_targets(app: &str) -> Vec<String> {
    match app.trim().to_ascii_lowercase().as_str() {
        "calc" | "calculator" => vec![
            "calc.exe".into(),
            shell_apps_folder_id("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
        ],
        "notepad" => vec!["notepad.exe".into()],
        _ => vec![app.trim().into()],
    }
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain([0]).collect()
}

fn shell_execute(target: &str) -> bool {
    let target = wide(target);
    // SAFETY: all PCWSTR pointers refer to NUL-terminated buffers that remain
    // alive through the synchronous ShellExecuteW call.
    let result = unsafe {
        ShellExecuteW(
            None,
            w!("open"),
            PCWSTR(target.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    result.0 as isize > 32
}

pub fn launch_app(app: &str, cancel: &CancelToken) -> Result<LaunchResult> {
    validate(app)?;
    let before: HashSet<_> = list_windows().into_iter().map(|window| window.id).collect();
    let hints: Vec<String> = match app.trim().to_ascii_lowercase().as_str() {
        "calc" | "calculator" => vec![
            "calculator".into(),
            "calculatorapp".into(),
            "applicationframehost".into(),
        ],
        "notepad" => vec!["notepad".into()],
        _ => std::path::Path::new(app)
            .file_stem()
            .and_then(|value| value.to_str())
            .map(|value| vec![value.to_ascii_lowercase()])
            .unwrap_or_default(),
    };
    let mut launched = false;
    for target in launch_targets(app) {
        cancel.check()?;
        if !shell_execute(&target) {
            continue;
        }
        launched = true;
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            cancel.check()?;
            if let Some(window) = list_windows().into_iter().find(|window| {
                let is_new = !before.contains(&window.id);
                let app = window.app_leaf().to_ascii_lowercase();
                let title = window.title.to_ascii_lowercase();
                is_new
                    && (hints.is_empty()
                        || hints
                            .iter()
                            .any(|hint| app.contains(hint) || title.contains(hint)))
            }) {
                return Ok(LaunchResult::launched(Some(window), Delivered::Foreground));
            }
            thread::sleep(Duration::from_millis(150));
        }
    }
    if !launched {
        return Err(HelperError::internal(format!(
            "Unable to launch app: {app}"
        )));
    }
    Ok(LaunchResult::launched(None, Delivered::Foreground).with_note(
        "App launched but no window became available within the timeout. Call list_windows to find it.",
    ))
}

#[cfg(test)]
mod tests {
    use super::validate;

    #[test]
    fn rejects_embedded_nul_in_every_windows_launch_form() {
        for app in [
            "notepad.exe\0ignored",
            "C:\\Windows\\notepad.exe\0ignored",
            "shell:AppsFolder\\Calculator\0ignored",
        ] {
            assert!(validate(app).is_err(), "accepted {app:?}");
        }
    }
}
