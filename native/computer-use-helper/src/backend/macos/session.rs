//! Console-session state: is the screen locked, and what does that forbid?
//!
//! Foreground routes are forbidden outright: they own the real keyboard, so a
//! `type_text` would be typed into the lock screen's password field.
//!
//! Background routes are still *accepted* — `post_to_pid` events go to a
//! specific process and never touch the lock screen — but while the login
//! window owns the display macOS renders no window content, so their effect
//! cannot be observed: every capture path returns a blank image and the
//! target's accessibility tree collapses to an app proxy exposing only the
//! menu bar. A locked Mac is therefore not controllable in practice; the
//! honest answer is to wait for the user to unlock.

use std::ptr::NonNull;

use objc2_core_foundation::{CFBoolean, CFDictionary, CFNumber, CFRetained, CFString, CFType};

use crate::protocol::actions::{InputMode, Refusal};

/// Note attached to observations and deliveries taken while the screen is
/// locked, so the agent knows why the window looks empty: macOS exposes no
/// window content or controls behind the login window, so screenshots are
/// unavailable and the accessibility tree is only an app proxy.
pub const SCREEN_LOCKED_NOTE: &str = "screen_locked";

/// Set on the session dictionary while the screen saver / login window has
/// locked the console session.
const SCREEN_IS_LOCKED_KEY: &str = "CGSSessionScreenIsLocked";

/// `kCGSessionOnConsoleKey`. False means another session owns the console
/// (fast user switching or the login window), which is equally unsafe for
/// foreground input.
const ON_CONSOLE_KEY: &str = "kCGSSessionOnConsoleKey";

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    /// Public CoreGraphics API that `objc2-core-graphics` does not bind yet.
    /// Returns a Copy-rule `CFDictionaryRef`, or null off a window server.
    fn CGSessionCopyCurrentDictionary() -> *mut CFDictionary;
}

fn session_dictionary() -> Option<CFRetained<CFDictionary<CFString, CFType>>> {
    // SAFETY: The function takes no arguments and returns either null or a
    // retained CFDictionaryRef that we own exactly one reference to.
    let raw = NonNull::new(unsafe { CGSessionCopyCurrentDictionary() })?;
    // SAFETY: Copy-rule ownership transfers to `CFRetained`, and every key in
    // the session dictionary is a CFString mapped to a CF property-list value.
    let dictionary = unsafe { CFRetained::from_raw(raw) };
    // SAFETY: see above; this only refines the dictionary's key/value types.
    Some(unsafe { CFRetained::cast_unchecked::<CFDictionary<CFString, CFType>>(dictionary) })
}

/// Session flags are documented as CFBoolean but have historically been
/// reported as CFNumber, so both are accepted.
fn flag(dictionary: &CFDictionary<CFString, CFType>, key: &str) -> Option<bool> {
    let value = dictionary.get(&CFString::from_str(key))?;
    match value.downcast::<CFBoolean>() {
        Ok(boolean) => Some(boolean.as_bool()),
        Err(value) => value
            .downcast::<CFNumber>()
            .ok()?
            .as_i64()
            .map(|number| number != 0),
    }
}

/// True when foreground input would reach the lock screen rather than the
/// user's desktop. Unknown session state is treated as unlocked so a headless
/// or unusual host is not permanently crippled.
pub fn screen_locked() -> bool {
    let Some(dictionary) = session_dictionary() else {
        return false;
    };
    let locked = flag(&dictionary, SCREEN_IS_LOCKED_KEY).unwrap_or(false);
    let on_console = flag(&dictionary, ON_CONSOLE_KEY).unwrap_or(true);
    locked || !on_console
}

/// Refusal for a coordinate/key/text/launch request, given the requested mode.
/// Background requests are always allowed: the OS accepts them and they are
/// delivered to a specific process, never to the lock screen. Whether they had
/// any effect cannot be observed while locked — see the module docs.
pub fn foreground_refusal(locked: bool, mode: InputMode) -> Option<Refusal> {
    (locked && mode == InputMode::Foreground).then(Refusal::screen_locked)
}

/// Refusal for `activate_window`, which raises a window to the front and has no
/// background variant, so a locked screen forbids it outright.
pub fn activation_refusal(locked: bool) -> Option<Refusal> {
    locked.then(Refusal::screen_locked)
}

/// Session-wide notes for passive results.
pub fn notes(locked: bool) -> Vec<String> {
    if locked {
        vec![SCREEN_LOCKED_NOTE.to_string()]
    } else {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::actions::RefusalCode;

    #[test]
    fn background_input_is_allowed_while_locked() {
        assert!(foreground_refusal(true, InputMode::Background).is_none());
        assert!(foreground_refusal(false, InputMode::Background).is_none());
    }

    #[test]
    fn foreground_input_is_refused_only_while_locked() {
        assert!(foreground_refusal(false, InputMode::Foreground).is_none());
        let refusal = foreground_refusal(true, InputMode::Foreground).expect("refusal");
        assert_eq!(refusal.code, RefusalCode::ScreenLocked);
        assert!(refusal.reason.contains("locked"));
        assert!(!refusal.hint.is_empty());
    }

    #[test]
    fn activation_is_refused_whenever_locked() {
        assert!(activation_refusal(false).is_none());
        assert_eq!(
            activation_refusal(true).expect("refusal").code,
            RefusalCode::ScreenLocked
        );
    }

    #[test]
    fn locked_sessions_annotate_passive_results() {
        assert_eq!(notes(true), vec![SCREEN_LOCKED_NOTE.to_string()]);
        assert!(notes(false).is_empty());
    }

    #[test]
    fn probing_the_real_session_does_not_panic() {
        // The console session in CI is usually unlocked; this only asserts the
        // FFI declaration and CoreFoundation ownership are sound.
        let _ = screen_locked();
    }
}
