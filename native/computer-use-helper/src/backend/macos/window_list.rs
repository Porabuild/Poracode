use objc2_app_kit::NSRunningApplication;
use objc2_core_foundation::{CFArray, CFBoolean, CFDictionary, CFNumber, CFString, CFType, CGRect};
use objc2_core_graphics::{
    CGRectMakeWithDictionaryRepresentation, CGWindowListCopyWindowInfo, CGWindowListOption,
    kCGNullWindowID, kCGWindowAlpha, kCGWindowBounds, kCGWindowIsOnscreen, kCGWindowLayer,
    kCGWindowName, kCGWindowNumber, kCGWindowOwnerName, kCGWindowOwnerPID,
};

use crate::backend::is_computer_use_overlay_title;
use crate::protocol::window::{WindowInfo, WindowRef, WindowSource};
use crate::protocol::{HelperError, Result};

type WindowDictionary = CFDictionary<CFString, CFType>;

fn number(dictionary: &WindowDictionary, key: &CFString) -> Option<i64> {
    dictionary.get(key)?.downcast::<CFNumber>().ok()?.as_i64()
}

fn decimal(dictionary: &WindowDictionary, key: &CFString) -> Option<f64> {
    dictionary.get(key)?.downcast::<CFNumber>().ok()?.as_f64()
}

fn string(dictionary: &WindowDictionary, key: &CFString) -> Option<String> {
    dictionary
        .get(key)?
        .downcast::<CFString>()
        .ok()
        .map(|value| value.to_string())
        .filter(|value| !value.is_empty())
}

fn boolean(dictionary: &WindowDictionary, key: &CFString) -> Option<bool> {
    dictionary
        .get(key)?
        .downcast::<CFBoolean>()
        .ok()
        .map(|value| value.as_bool())
}

fn bounds(dictionary: &WindowDictionary) -> Option<CGRect> {
    // SAFETY: CoreGraphics documents kCGWindowBounds as a CGRect dictionary.
    let value = dictionary.get(unsafe { kCGWindowBounds })?;
    let value = value.downcast::<CFDictionary>().ok()?;
    let mut rect = CGRect::ZERO;
    // SAFETY: `value` is a live CGRect dictionary and `rect` is writable.
    unsafe { CGRectMakeWithDictionaryRepresentation(Some(&value), &mut rect) }.then_some(rect)
}

fn app_metadata(pid: u32, owner: &str) -> (String, String) {
    let Some(application) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid as _)
    else {
        return (owner.to_string(), owner.to_string());
    };
    let display_name = application
        .localizedName()
        .map(|name| name.to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| owner.to_string());
    let app = application
        .bundleURL()
        .and_then(|url| url.path())
        .or_else(|| application.executableURL().and_then(|url| url.path()))
        .map(|path| path.to_string())
        .filter(|path| !path.is_empty())
        .unwrap_or_else(|| owner.to_string());
    (app, display_name)
}

fn parse(dictionary: &WindowDictionary) -> Option<WindowInfo> {
    // SAFETY: These are the exported CoreGraphics dictionary keys documented
    // for every CGWindowListCopyWindowInfo entry.
    let (layer_key, number_key, pid_key, owner_key, name_key, on_screen_key, alpha_key) = unsafe {
        (
            kCGWindowLayer,
            kCGWindowNumber,
            kCGWindowOwnerPID,
            kCGWindowOwnerName,
            kCGWindowName,
            kCGWindowIsOnscreen,
            kCGWindowAlpha,
        )
    };
    let layer = number(dictionary, layer_key)?;
    if layer != 0 || decimal(dictionary, alpha_key).unwrap_or(1.0) <= 0.0 {
        return None;
    }
    let id = number(dictionary, number_key)?;
    let pid = u32::try_from(number(dictionary, pid_key)?).ok()?;
    let rect = bounds(dictionary)?;
    let width = rect.size.width.round() as i32;
    let height = rect.size.height.round() as i32;
    if id <= 0 || width <= 1 || height <= 1 {
        return None;
    }
    let owner = string(dictionary, owner_key).unwrap_or_default();
    let title = string(dictionary, name_key).unwrap_or_default();
    if (owner.is_empty() && title.is_empty()) || is_computer_use_overlay_title(&title) {
        return None;
    }
    let (app, display_name) = app_metadata(pid, &owner);
    let on_screen = boolean(dictionary, on_screen_key).unwrap_or(false);
    Some(WindowInfo {
        app,
        id,
        title,
        x: rect.origin.x.round() as i32,
        y: rect.origin.y.round() as i32,
        width,
        height,
        pid: Some(pid),
        display_name: (!display_name.is_empty()).then_some(display_name),
        minimized: Some(!on_screen),
        source: Some(WindowSource::Cg),
    })
}

pub fn list_windows() -> Vec<WindowInfo> {
    let Some(raw) = CGWindowListCopyWindowInfo(
        CGWindowListOption::OptionOnScreenOnly | CGWindowListOption::ExcludeDesktopElements,
        kCGNullWindowID,
    ) else {
        return Vec::new();
    };
    // SAFETY: CGWindowListCopyWindowInfo returns an array of CFDictionary
    // values whose keys are CFString and whose values are CF property types.
    let dictionaries: &CFArray<WindowDictionary> = unsafe { raw.cast_unchecked() };
    dictionaries
        .iter()
        .filter_map(|dictionary| parse(&dictionary))
        .collect()
}

pub fn resolve(window: &WindowRef) -> Result<WindowInfo> {
    resolve_in(&list_windows(), window)
}

/// Strict resolution against a window list.
///
/// macOS advertises `stableWindowIds`, so an id that is no longer present means
/// that exact window is gone. Falling back to the app's largest window would
/// silently retarget a closed dialog's input at the main window, so it is not
/// done. The one tolerated recovery is a window that the app recreated under
/// the same title, and only when that title is unambiguous within the app;
/// anything else is a stale-window error the caller is told to recover from
/// with `get_window` / `list_windows`.
pub(crate) fn resolve_in(windows: &[WindowInfo], window: &WindowRef) -> Result<WindowInfo> {
    if let Some(exact) = windows
        .iter()
        .find(|candidate| candidate.id == window.id && candidate.matches_app(window.app.as_deref()))
    {
        return Ok(exact.clone());
    }
    let title = window
        .title
        .as_deref()
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .ok_or_else(HelperError::window_unavailable)?;
    let mut recreated = windows
        .iter()
        .filter(|candidate| candidate.matches_app(window.app.as_deref()))
        .filter(|candidate| candidate.title == title);
    let single = recreated
        .next()
        .ok_or_else(HelperError::window_unavailable)?;
    if recreated.next().is_some() {
        return Err(HelperError::window_unavailable());
    }
    Ok(single.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::window::WindowSource;

    fn window(id: i64, app: &str, title: &str, width: i32) -> WindowInfo {
        WindowInfo {
            app: app.into(),
            id,
            title: title.into(),
            x: 0,
            y: 0,
            width,
            height: 100,
            pid: Some(7),
            display_name: None,
            minimized: Some(false),
            source: Some(WindowSource::Cg),
        }
    }

    fn reference(id: i64, app: &str, title: Option<&str>) -> WindowRef {
        WindowRef {
            app: Some(app.into()),
            id,
            title: title.map(str::to_string),
        }
    }

    fn list() -> Vec<WindowInfo> {
        vec![
            window(1, "/Applications/Editor.app", "Main Window", 1200),
            window(2, "/Applications/Editor.app", "Preferences", 400),
            window(3, "/Applications/Other.app", "Preferences", 400),
        ]
    }

    #[test]
    fn exact_app_and_id_wins() {
        let resolved =
            resolve_in(&list(), &reference(2, "/Applications/Editor.app", None)).unwrap();
        assert_eq!(resolved.id, 2);
    }

    #[test]
    fn stale_id_without_a_title_is_an_error_instead_of_the_largest_window() {
        let error =
            resolve_in(&list(), &reference(99, "/Applications/Editor.app", None)).unwrap_err();
        assert_eq!(error.code, crate::protocol::ErrorCode::WindowUnavailable);
    }

    #[test]
    fn stale_id_resolves_a_uniquely_recreated_title() {
        let resolved = resolve_in(
            &list(),
            &reference(99, "/Applications/Editor.app", Some("  Preferences  ")),
        )
        .unwrap();
        assert_eq!(resolved.id, 2);
    }

    #[test]
    fn stale_id_with_an_ambiguous_title_is_an_error() {
        let mut windows = list();
        windows.push(window(4, "/Applications/Editor.app", "Preferences", 300));
        assert!(
            resolve_in(
                &windows,
                &reference(99, "/Applications/Editor.app", Some("Preferences")),
            )
            .is_err()
        );
    }

    #[test]
    fn stale_id_does_not_match_a_partial_or_other_app_title() {
        for title in ["Preference", "Main", "Untitled"] {
            assert!(
                resolve_in(
                    &list(),
                    &reference(99, "/Applications/Editor.app", Some(title)),
                )
                .is_err(),
                "accepted {title}"
            );
        }
        assert!(
            resolve_in(
                &list(),
                &reference(99, "/Applications/Missing.app", Some("Preferences"))
            )
            .is_err()
        );
    }

    #[test]
    fn excludes_only_the_exact_computer_use_overlay_title() {
        assert!(is_computer_use_overlay_title(
            "Poracode Computer Use Overlay"
        ));
        assert!(!is_computer_use_overlay_title("Computer Use Overlay"));
        assert!(!is_computer_use_overlay_title(
            "Poracode Computer Use Overlay - Document"
        ));
    }
}
