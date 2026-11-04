//! Ask the lock screen to authenticate, without a password.
//!
//! The one interaction locked use has with loginwindow: find the lock screen's
//! password field, replace its contents with a fixed placeholder, and
//! submit it with one Return key press. loginwindow ignores an empty
//! submission, and `AXConfirm` does not submit its field (macOS 27); a
//! non-empty Return starts an authorization evaluation in which the plug-in
//! branch runs first and consumes the pending approval, so the placeholder is
//! only ever checked as a password when the plug-in denies. The placeholder is
//! a constant, never the user's password. A reported nonzero character count
//! aborts. SwiftUI loginwindow omits that metadata; in that case the write
//! replaces any unfinished entry without reading it. The guard owns input
//! throughout, and physical input cancels the attempt before submission.
//!
//! The lock screen (macOS 26+) only builds the password field after a click,
//! so when it is missing the trigger first clicks once on the user's name
//! (`FocusedUser`), away from the "show all users", keyboard, and Wi-Fi
//! controls. The click and the Return are tagged so the guard passes them
//! through instead of treating them as someone at the Mac.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use objc2_app_kit::NSRunningApplication;
use objc2_core_foundation::{CFNumber, CFString, CGPoint};
use objc2_core_graphics::{
    CGEvent, CGEventField, CGEventSource, CGEventSourceStateID, CGEventTapLocation, CGEventType,
    CGMouseButton,
};
use objc2_foundation::NSString;

use super::super::ax::{self, AxElement};
use super::engine::TriggerFailure;

const LOGINWINDOW_BUNDLE_ID: &str = "com.apple.loginwindow";
const PASSWORD_FIELD_IDENTIFIER: &str = "UserPasswordTextField";
const FOCUSED_USER_IDENTIFIER: &str = "FocusedUser";
/// What the field holds when confirmed. Never a credential: the plug-in
/// decides before loginwindow would check it.
const PLACEHOLDER: &str = "-";
/// loginwindow's field picks up a set value asynchronously; confirming
/// sooner submits the old, empty value, which it ignores.
const PLACEHOLDER_SETTLE: Duration = Duration::from_millis(300);
/// `kCGEventSourceUserData` stamped on the trigger's click and Return
/// ("PLCU"), so the guard can tell them from local input.
pub(super) const TRIGGER_EVENT_TAG: i64 = 0x504c_4355;
/// `kVK_Return`.
pub(super) const RETURN_KEYCODE: u16 = 36;
const SECURE_TEXT_FIELD: &str = "AXSecureTextField";
/// Bounds on the walk: the lock screen is a small tree, and a wedged
/// loginwindow must not hold the begin for long.
const MAX_NODES: usize = 400;
const MAX_DEPTH: usize = 12;
const WALK_BUDGET: Duration = Duration::from_secs(2);
/// An asleep lock screen has not built its controls; after the wake, give it
/// this long to show the password field.
const FIELD_WAIT: Duration = Duration::from_secs(3);
const FIELD_POLL: Duration = Duration::from_millis(150);
const WAKE_ASSERTION_NAME: &str = "Poracode Locked Computer Use";
/// `kIOPMUserActiveLocal`.
const USER_ACTIVE_LOCAL: u32 = 0;

#[link(name = "IOKit", kind = "framework")]
unsafe extern "C" {
    fn IOPMAssertionDeclareUserActivity(
        name: &CFString,
        user_type: u32,
        assertion_id: *mut u32,
    ) -> i32;
    fn IOPMAssertionRelease(assertion_id: u32) -> i32;
}

/// The attributes the walk matches on.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(super) struct NodeInfo {
    pub(super) identifier: Option<String>,
    pub(super) role: Option<String>,
    pub(super) subrole: Option<String>,
}

impl NodeInfo {
    fn is_password_field(&self) -> bool {
        self.identifier.as_deref() == Some(PASSWORD_FIELD_IDENTIFIER)
    }

    fn is_focused_user(&self) -> bool {
        self.identifier.as_deref() == Some(FOCUSED_USER_IDENTIFIER)
    }

    fn is_secure_text_field(&self) -> bool {
        self.role.as_deref() == Some(SECURE_TEXT_FIELD)
            || self.subrole.as_deref() == Some(SECURE_TEXT_FIELD)
    }
}

/// The click target that reveals the password field: the only `FocusedUser`.
pub(super) fn reveal_target(nodes: &[NodeInfo]) -> Option<usize> {
    let mut users = nodes
        .iter()
        .enumerate()
        .filter(|(_, node)| node.is_focused_user());
    let index = users.next()?.0;
    users.next().is_none().then_some(index)
}

/// Pick the password field: the node identified as `UserPasswordTextField`,
/// else the only secure text field. Two secure fields and no identifier is
/// ambiguous, so nothing is picked.
pub(super) fn choose(nodes: &[NodeInfo]) -> Option<usize> {
    if let Some(index) = nodes.iter().position(NodeInfo::is_password_field) {
        return Some(index);
    }
    let mut secure = nodes
        .iter()
        .enumerate()
        .filter(|(_, node)| node.is_secure_text_field());
    let index = secure.next()?.0;
    secure.next().is_none().then_some(index)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Emptiness {
    Empty,
    NotEmpty,
    /// Character-count metadata is unavailable.
    Unknown,
}

/// Interpret count metadata without ever retrieving password contents.
pub(super) fn emptiness(characters: Option<i64>) -> Emptiness {
    match characters {
        Some(0) => Emptiness::Empty,
        Some(_) => Emptiness::NotEmpty,
        None => Emptiness::Unknown,
    }
}

fn loginwindow_pid() -> Option<u32> {
    let bundle = NSString::from_str(LOGINWINDOW_BUNDLE_ID);
    // Only applications in this login session are listed, which is the
    // session whose lock screen we want.
    let applications = NSRunningApplication::runningApplicationsWithBundleIdentifier(&bundle);
    let application = applications.iter().next()?;
    u32::try_from(application.processIdentifier()).ok()
}

fn node_info(element: &AxElement) -> NodeInfo {
    NodeInfo {
        identifier: ax::string_attribute(element, "AXIdentifier"),
        role: ax::string_attribute(element, "AXRole"),
        subrole: ax::string_attribute(element, "AXSubrole"),
    }
}

/// Breadth-first over `AXChildren`, bounded by node count, depth, and time.
/// Stops early at the identified password field.
fn walk(application: &AxElement, cancelled: &dyn Fn() -> bool) -> Vec<(AxElement, NodeInfo)> {
    let started = Instant::now();
    let mut found = Vec::new();
    let mut queue = VecDeque::from([(application.clone(), 0usize)]);
    let mut visited = 0;
    while let Some((element, depth)) = queue.pop_front() {
        if cancelled() || visited >= MAX_NODES || started.elapsed() > WALK_BUDGET {
            break;
        }
        visited += 1;
        let info = node_info(&element);
        let done = info.is_password_field();
        if done || info.is_secure_text_field() || info.is_focused_user() {
            found.push((element.clone(), info));
        }
        if done {
            break;
        }
        if depth < MAX_DEPTH {
            queue.extend(
                ax::array_attribute(&element, "AXChildren")
                    .into_iter()
                    .map(|child| (child, depth + 1)),
            );
        }
    }
    found
}

fn field_emptiness(field: &AxElement) -> Emptiness {
    // Never request AXValue: loginwindow may expose the user's actual password.
    let characters = ax::copy_attribute(field, "AXNumberOfCharacters")
        .and_then(|value| value.downcast::<CFNumber>().ok())
        .and_then(|value| value.as_i64());
    emptiness(characters)
}

/// Wake the display the way user activity does; no input event is posted.
fn wake_display() {
    let name = CFString::from_str(WAKE_ASSERTION_NAME);
    let mut assertion = 0u32;
    // SAFETY: `name` is live and `assertion` is writable.
    let status =
        unsafe { IOPMAssertionDeclareUserActivity(&name, USER_ACTIVE_LOCAL, &mut assertion) };
    if status != 0 {
        log::warn!("locked-use: declaring user activity failed ({status})");
        return;
    }
    // SAFETY: `assertion` was just created by the call above. The display stays
    // on through the guard's display-sleep assertion, not this one.
    unsafe { IOPMAssertionRelease(assertion) };
}

/// One tagged left click at `point`, through the HID stream so loginwindow
/// receives it like a real click.
fn post_reveal_click(point: CGPoint) -> bool {
    let Some(source) = CGEventSource::new(CGEventSourceStateID::Private) else {
        return false;
    };
    for kind in [CGEventType::LeftMouseDown, CGEventType::LeftMouseUp] {
        let Some(event) = CGEvent::new_mouse_event(Some(&source), kind, point, CGMouseButton::Left)
        else {
            return false;
        };
        CGEvent::set_integer_value_field(
            Some(&event),
            CGEventField::EventSourceUserData,
            TRIGGER_EVENT_TAG,
        );
        CGEvent::post(CGEventTapLocation::HIDEventTap, Some(&event));
    }
    true
}

/// One tagged Return press, through the HID stream to the focused field.
fn post_return() -> bool {
    let Some(source) = CGEventSource::new(CGEventSourceStateID::Private) else {
        return false;
    };
    for down in [true, false] {
        let Some(event) = CGEvent::new_keyboard_event(Some(&source), RETURN_KEYCODE, down) else {
            return false;
        };
        CGEvent::set_integer_value_field(
            Some(&event),
            CGEventField::EventSourceUserData,
            TRIGGER_EVENT_TAG,
        );
        CGEvent::post(CGEventTapLocation::HIDEventTap, Some(&event));
    }
    true
}

/// Poll the lock screen until it shows an unambiguous password field,
/// clicking the user's name once if the field has not been built yet.
fn find_password_field(application: &AxElement, cancelled: &dyn Fn() -> bool) -> Option<AxElement> {
    let started = Instant::now();
    let mut clicked = false;
    loop {
        if cancelled() {
            return None;
        }
        let candidates = walk(application, cancelled);
        let infos = candidates
            .iter()
            .map(|(_, info)| info.clone())
            .collect::<Vec<_>>();
        if let Some(index) = choose(&infos) {
            return candidates
                .into_iter()
                .nth(index)
                .map(|(element, _)| element);
        }
        if !clicked && let Some(index) = reveal_target(&infos) {
            clicked = true;
            match ax::center(&candidates[index].0) {
                Some(point) if !cancelled() && post_reveal_click(point) => {}
                _ => log::warn!("locked-use: could not click the lock screen's user name"),
            }
        }
        if started.elapsed() >= FIELD_WAIT {
            log::warn!(
                "locked-use: no unambiguous lock-screen password field ({} nodes)",
                infos.len()
            );
            return None;
        }
        std::thread::sleep(FIELD_POLL);
    }
}

/// Replace the guarded password field with the approved constant and submit it.
/// No AXValue read is used for preflight, read-back, or cleanup.
pub(super) fn submit_placeholder(
    cancelled: &dyn Fn() -> bool,
    placeholder_written: &AtomicBool,
) -> Result<(), TriggerFailure> {
    if cancelled() {
        return Err(TriggerFailure::Cancelled);
    }
    let Some(pid) = loginwindow_pid() else {
        log::warn!("locked-use: loginwindow is not running");
        return Err(TriggerFailure::NoPasswordField);
    };
    let application = ax::application(pid).map_err(|_| TriggerFailure::NoPasswordField)?;
    wake_display();
    let Some(field) = find_password_field(&application, cancelled) else {
        return Err(TriggerFailure::NoPasswordField);
    };
    let field = &field;
    match field_emptiness(field) {
        Emptiness::Empty | Emptiness::Unknown => {}
        state => {
            log::warn!(
                "locked-use: the lock-screen password field is not provably empty ({state:?})"
            );
            return Err(TriggerFailure::PasswordFieldNotEmpty);
        }
    }
    if cancelled() {
        return Err(TriggerFailure::Cancelled);
    }
    if !ax::set_string_value(field, PLACEHOLDER) {
        log::warn!("locked-use: could not fill the lock-screen password field");
        return Err(TriggerFailure::NoPasswordField);
    }
    placeholder_written.store(true, Ordering::SeqCst);
    // Once ours is written, the guard blocks all further user input. Clear it
    // on every failed/cancelled trigger, before asking the guard to go away.
    std::thread::sleep(PLACEHOLDER_SETTLE);
    if cancelled() {
        return Err(TriggerFailure::Cancelled);
    }
    if cancelled() {
        return Err(TriggerFailure::Cancelled);
    }
    if !post_return() {
        return Err(TriggerFailure::NoPasswordField);
    }
    Ok(())
}

/// Clear the current attempt's write while the guard still owns input.
/// The caller tracks ownership; this never reads AXValue.
pub(super) fn clear_placeholder(guard_alive: &dyn Fn() -> bool) {
    if !guard_alive() {
        return;
    }
    let Some(pid) = loginwindow_pid() else {
        return;
    };
    let Ok(application) = ax::application(pid) else {
        return;
    };
    let candidates = walk(&application, &|| !guard_alive());
    let infos = candidates
        .iter()
        .map(|(_, info)| info.clone())
        .collect::<Vec<_>>();
    let Some(index) = choose(&infos) else {
        return;
    };
    let field = &candidates[index].0;
    // The current attempt wrote this field and the guard still owns all
    // input. No other contents are inspected to clean up our own write.
    if guard_alive() {
        let _ = ax::set_string_value(field, "");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(identifier: Option<&str>, role: &str, subrole: Option<&str>) -> NodeInfo {
        NodeInfo {
            identifier: identifier.map(str::to_string),
            role: Some(role.to_string()),
            subrole: subrole.map(str::to_string),
        }
    }

    #[test]
    fn prefers_the_identified_password_field() {
        let nodes = [
            node(None, "AXTextField", Some(SECURE_TEXT_FIELD)),
            node(
                Some("UserPasswordTextField"),
                "AXTextField",
                Some(SECURE_TEXT_FIELD),
            ),
            node(None, "AXTextField", Some(SECURE_TEXT_FIELD)),
        ];
        assert_eq!(choose(&nodes), Some(1));
    }

    #[test]
    fn reveals_by_the_only_focused_user() {
        let user = node(Some("FocusedUser"), "AXStaticText", None);
        let other = node(None, "AXButton", None);
        assert_eq!(reveal_target(&[other.clone(), user.clone()]), Some(1));
        assert_eq!(reveal_target(&[other]), None);
        assert_eq!(reveal_target(&[user.clone(), user]), None);
    }

    #[test]
    fn falls_back_to_a_single_secure_field_only() {
        let one = [
            node(None, "AXButton", None),
            node(None, SECURE_TEXT_FIELD, None),
        ];
        assert_eq!(choose(&one), Some(1));
        let by_subrole = [node(None, "AXTextField", Some(SECURE_TEXT_FIELD))];
        assert_eq!(choose(&by_subrole), Some(0));
        let two = [
            node(None, SECURE_TEXT_FIELD, None),
            node(None, "AXTextField", Some(SECURE_TEXT_FIELD)),
        ];
        assert_eq!(choose(&two), None);
        assert_eq!(choose(&[node(Some("Other"), "AXTextField", None)]), None);
        assert_eq!(choose(&[]), None);
    }

    #[test]
    fn distinguishes_empty_nonempty_and_unavailable_count_metadata() {
        assert_eq!(emptiness(Some(0)), Emptiness::Empty);
        assert_eq!(emptiness(Some(1)), Emptiness::NotEmpty);
        assert_eq!(emptiness(Some(3)), Emptiness::NotEmpty);
        assert_eq!(emptiness(None), Emptiness::Unknown);
    }
}
