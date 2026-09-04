use std::thread;
use std::time::Duration;

use objc2_app_kit::{
    NSApplicationActivationOptions, NSEvent, NSEventModifierFlags, NSRunningApplication,
};
use objc2_core_foundation::CGPoint;
use objc2_core_graphics::{
    CGEvent, CGEventField, CGEventFlags, CGEventSource, CGEventSourceStateID, CGEventTapLocation,
    CGEventType, CGMouseButton, CGScrollEventUnit,
};

use super::ax;
use crate::backend::{CancelToken, InputOptions, KeyboardAction, PointerAction};
use crate::geometry::{drag_steps, frame_to_screen, interpolate, point_in_frame};
use crate::protocol::actions::{
    Delivery, DeliveryTarget, InputMode, InteractiveResult, MouseButton, Refusal, RefusalCode,
    Route, Verified,
};
use crate::protocol::keys::{KeyToken, Modifiers, NamedKey};
use crate::protocol::window::WindowInfo;
use crate::protocol::{HelperError, Result};

#[derive(Clone, Copy)]
enum Destination {
    Process(libc::pid_t),
    Hid,
}

fn permission_refusal(window: &WindowInfo) -> InteractiveResult {
    InteractiveResult::refused(
        window.clone(),
        Refusal::new(
            RefusalCode::PermissionDenied,
            "Accessibility permission is required to send macOS input.",
            "Grant Accessibility permission to Poracode in System Settings, then retry.",
        ),
    )
}

fn source() -> Result<objc2_core_foundation::CFRetained<CGEventSource>> {
    CGEventSource::new(CGEventSourceStateID::Private)
        .ok_or_else(|| HelperError::internal("Could not create a CoreGraphics event source."))
}

fn post(destination: Destination, event: &CGEvent) {
    match destination {
        Destination::Process(pid) => CGEvent::post_to_pid(pid, Some(event)),
        Destination::Hid => CGEvent::post(CGEventTapLocation::HIDEventTap, Some(event)),
    }
}

fn stamp_target(event: &CGEvent, window: &WindowInfo, click_count: Option<u32>) {
    if let Some(click_count) = click_count {
        CGEvent::set_integer_value_field(
            Some(event),
            CGEventField::MouseEventClickState,
            i64::from(click_count),
        );
    }
    if let Some(pid) = window.pid {
        CGEvent::set_integer_value_field(Some(event), CGEventField(40), i64::from(pid));
    }
    CGEvent::set_integer_value_field(Some(event), CGEventField(91), window.id);
    CGEvent::set_integer_value_field(Some(event), CGEventField(92), window.id);
}

fn mouse_types(button: MouseButton, drag: bool) -> (CGMouseButton, CGEventType, CGEventType) {
    match button {
        MouseButton::Left if drag => (
            CGMouseButton::Left,
            CGEventType::LeftMouseDragged,
            CGEventType::LeftMouseUp,
        ),
        MouseButton::Left => (
            CGMouseButton::Left,
            CGEventType::LeftMouseDown,
            CGEventType::LeftMouseUp,
        ),
        MouseButton::Right if drag => (
            CGMouseButton::Right,
            CGEventType::RightMouseDragged,
            CGEventType::RightMouseUp,
        ),
        MouseButton::Right => (
            CGMouseButton::Right,
            CGEventType::RightMouseDown,
            CGEventType::RightMouseUp,
        ),
        MouseButton::Middle if drag => (
            CGMouseButton::Center,
            CGEventType::OtherMouseDragged,
            CGEventType::OtherMouseUp,
        ),
        MouseButton::Middle => (
            CGMouseButton::Center,
            CGEventType::OtherMouseDown,
            CGEventType::OtherMouseUp,
        ),
    }
}

fn mouse_event(
    source: &CGEventSource,
    event_type: CGEventType,
    point: (i32, i32),
    button: CGMouseButton,
) -> Result<objc2_core_foundation::CFRetained<CGEvent>> {
    CGEvent::new_mouse_event(
        Some(source),
        event_type,
        CGPoint::new(f64::from(point.0), f64::from(point.1)),
        button,
    )
    .ok_or_else(|| HelperError::internal("Could not create a CoreGraphics mouse event."))
}

fn post_mouse(
    destination: Destination,
    source: &CGEventSource,
    window: &WindowInfo,
    event_type: CGEventType,
    point: (i32, i32),
    button: CGMouseButton,
    click_count: Option<u32>,
) -> Result<()> {
    let event = mouse_event(source, event_type, point, button)?;
    stamp_target(&event, window, click_count);
    post(destination, &event);
    Ok(())
}

fn delivery(window: &WindowInfo, mode: InputMode) -> InteractiveResult {
    let delivery = if mode == InputMode::Foreground {
        Delivery::foreground(Route::Input)
    } else {
        Delivery::background(Route::Event).with_target(DeliveryTarget {
            kind: "cg".into(),
            id: window.id.to_string(),
            role: None,
            name: None,
        })
    };
    InteractiveResult::delivered(window.clone(), delivery)
}

fn destination(window: &WindowInfo, mode: InputMode) -> Result<Destination> {
    if mode == InputMode::Foreground {
        Ok(Destination::Hid)
    } else {
        window
            .pid
            .map(|pid| Destination::Process(pid as libc::pid_t))
            .ok_or_else(HelperError::window_unavailable)
    }
}

fn is_chromium(window: &WindowInfo) -> bool {
    let app = window.app.to_ascii_lowercase();
    app.contains("chrome")
        || app.contains("chromium")
        || app.contains("microsoft edge")
        || std::path::Path::new(&window.app)
            .join("Contents/Frameworks/Electron Framework.framework")
            .is_dir()
}

pub fn activate(window: &WindowInfo) -> Result<InteractiveResult> {
    let pid = window.pid.ok_or_else(HelperError::window_unavailable)?;
    let application = NSRunningApplication::runningApplicationWithProcessIdentifier(pid as _)
        .ok_or_else(HelperError::window_unavailable)?;
    let _ = application.unhide();
    let requested =
        application.activateWithOptions(NSApplicationActivationOptions::ActivateAllWindows);
    let raised = ax::focus_window(window, true).unwrap_or(false);
    if !requested && !raised {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::background_unavailable("macOS declined the window activation request."),
        ));
    }
    Ok(InteractiveResult::delivered(
        window.clone(),
        Delivery::foreground(Route::Input).with_verified(Verified::Unverified),
    ))
}

pub fn pointer(
    window: &WindowInfo,
    action: PointerAction,
    options: InputOptions,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    if !ax::is_trusted() {
        return Ok(permission_refusal(window));
    }
    if options.mode == InputMode::Foreground {
        let activation = activate(window)?;
        if activation.refused.is_some() {
            return Ok(activation);
        }
    }
    let event_source = source()?;
    match action {
        PointerAction::Click {
            x,
            y,
            button,
            count,
        } => {
            if !point_in_frame(window, x, y) {
                return Err(HelperError::invalid_input(
                    "click coordinate is outside the window",
                ));
            }
            let point = frame_to_screen(window, x, y);
            if options.mode == InputMode::Background
                && let Some(target) =
                    ax::press_at_position(window, f64::from(point.0), f64::from(point.1))?
            {
                return Ok(InteractiveResult::delivered(
                    window.clone(),
                    Delivery::background(Route::Accessibility)
                        .with_verified(Verified::Confirmed)
                        .with_target(target),
                ));
            }
            if options.mode == InputMode::Background && is_chromium(window) {
                return Ok(InteractiveResult::refused(
                    window.clone(),
                    Refusal::background_unavailable(
                        "This Chromium/Electron target exposes no accessibility press action at the coordinate and ignores process-targeted mouse events.",
                    ),
                ));
            }
            let (button, down, up) = mouse_types(button, false);
            post_mouse(
                destination(window, options.mode)?,
                &event_source,
                window,
                CGEventType::MouseMoved,
                point,
                button,
                None,
            )?;
            for index in 0..count {
                cancel.check()?;
                post_mouse(
                    destination(window, options.mode)?,
                    &event_source,
                    window,
                    down,
                    point,
                    button,
                    Some(index + 1),
                )?;
                post_mouse(
                    destination(window, options.mode)?,
                    &event_source,
                    window,
                    up,
                    point,
                    button,
                    Some(index + 1),
                )?;
                if index + 1 < count {
                    thread::sleep(Duration::from_millis(50));
                }
            }
        }
        PointerAction::Scroll { x, y, dx, dy } => {
            if !point_in_frame(window, x, y) {
                return Err(HelperError::invalid_input(
                    "scroll coordinate is outside the window",
                ));
            }
            if options.mode == InputMode::Background && is_chromium(window) {
                return Ok(InteractiveResult::refused(
                    window.clone(),
                    Refusal::background_unavailable(
                        "Chromium/Electron scroll gestures require foreground input on macOS.",
                    ),
                ));
            }
            let point = frame_to_screen(window, x, y);
            let event = CGEvent::new_scroll_wheel_event2(
                Some(&event_source),
                CGScrollEventUnit::Pixel,
                2,
                -(dy.round() as i32),
                dx.round() as i32,
                0,
            )
            .ok_or_else(|| HelperError::internal("Could not create a scroll event."))?;
            CGEvent::set_location(
                Some(&event),
                CGPoint::new(f64::from(point.0), f64::from(point.1)),
            );
            stamp_target(&event, window, None);
            post(destination(window, options.mode)?, &event);
        }
        PointerAction::Drag { from, to, steps } => {
            if !point_in_frame(window, from.0, from.1) || !point_in_frame(window, to.0, to.1) {
                return Err(HelperError::invalid_input(
                    "drag coordinate is outside the window",
                ));
            }
            if options.mode == InputMode::Background && is_chromium(window) {
                return Ok(InteractiveResult::refused(
                    window.clone(),
                    Refusal::background_unavailable(
                        "Chromium/Electron drag gestures require foreground input on macOS.",
                    ),
                ));
            }
            let from = frame_to_screen(window, from.0, from.1);
            let to = frame_to_screen(window, to.0, to.1);
            let (button, dragged, up) = mouse_types(MouseButton::Left, true);
            post_mouse(
                destination(window, options.mode)?,
                &event_source,
                window,
                CGEventType::MouseMoved,
                from,
                button,
                None,
            )?;
            post_mouse(
                destination(window, options.mode)?,
                &event_source,
                window,
                CGEventType::LeftMouseDown,
                from,
                button,
                Some(1),
            )?;
            let mut movement = Ok(());
            for point in interpolate(from, to, drag_steps(from, to, steps)) {
                if let Err(error) = cancel.check() {
                    movement = Err(error);
                    break;
                }
                if let Err(error) = post_mouse(
                    destination(window, options.mode)?,
                    &event_source,
                    window,
                    dragged,
                    point,
                    button,
                    Some(1),
                ) {
                    movement = Err(error);
                    break;
                }
                thread::sleep(Duration::from_millis(8));
            }
            let released = post_mouse(
                destination(window, options.mode)?,
                &event_source,
                window,
                up,
                to,
                button,
                Some(1),
            );
            movement?;
            released?;
        }
    }
    Ok(delivery(window, options.mode))
}

fn flags(modifiers: Modifiers, implicit: CGEventFlags) -> CGEventFlags {
    let mut flags = implicit;
    if modifiers.shift {
        flags.insert(CGEventFlags::MaskShift);
    }
    if modifiers.control {
        flags.insert(CGEventFlags::MaskControl);
    }
    if modifiers.alt {
        flags.insert(CGEventFlags::MaskAlternate);
    }
    if modifiers.meta {
        flags.insert(CGEventFlags::MaskCommand);
    }
    flags
}

fn named_keycode(key: NamedKey) -> Option<(u16, CGEventFlags)> {
    let code = match key {
        NamedKey::Return => 36,
        NamedKey::Tab => 48,
        NamedKey::Escape => 53,
        NamedKey::Space => 49,
        NamedKey::Backspace => 51,
        NamedKey::Delete => 117,
        NamedKey::Insert => 114,
        NamedKey::CapsLock => 57,
        NamedKey::Left => 123,
        NamedKey::Up => 126,
        NamedKey::Right => 124,
        NamedKey::Down => 125,
        NamedKey::Home => 115,
        NamedKey::End => 119,
        NamedKey::PageUp => 116,
        NamedKey::PageDown => 121,
        NamedKey::Period => 47,
        NamedKey::Comma => 43,
        NamedKey::Slash => 44,
        NamedKey::Minus => 27,
        NamedKey::Plus => return Some((24, CGEventFlags::MaskShift)),
        NamedKey::Function(number) => {
            const FUNCTION_KEYS: [u16; 20] = [
                122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111, 105, 107, 113, 106, 64, 79,
                80, 90,
            ];
            *FUNCTION_KEYS.get(usize::from(number - 1))?
        }
        NamedKey::Numpad(number) => [82, 83, 84, 85, 86, 87, 88, 89, 91, 92][usize::from(number)],
    };
    Some((code, CGEventFlags::empty()))
}

fn current_layout_character_keycode(
    event_source: &CGEventSource,
    character: char,
) -> Option<(u16, CGEventFlags)> {
    let expected = character.to_string();
    let modifiers = [
        (CGEventFlags::empty(), NSEventModifierFlags::empty()),
        (CGEventFlags::MaskShift, NSEventModifierFlags::Shift),
        (CGEventFlags::MaskAlternate, NSEventModifierFlags::Option),
        (
            CGEventFlags::MaskShift | CGEventFlags::MaskAlternate,
            NSEventModifierFlags::Shift | NSEventModifierFlags::Option,
        ),
    ];
    for (event_flags, event_modifiers) in modifiers {
        for keycode in 0_u16..=127 {
            let Some(event) = CGEvent::new_keyboard_event(Some(event_source), keycode, true) else {
                continue;
            };
            CGEvent::set_flags(Some(&event), event_flags);
            let Some(event) = NSEvent::eventWithCGEvent(&event) else {
                continue;
            };
            if event
                .charactersByApplyingModifiers(event_modifiers)
                .is_some_and(|characters| characters.to_string() == expected)
            {
                return Some((keycode, event_flags));
            }
        }
    }
    None
}

fn ansi_character_keycode(character: char) -> Option<(u16, CGEventFlags)> {
    let shifted = character.is_ascii_uppercase();
    let character = character.to_ascii_lowercase();
    let (code, symbol_shift) = match character {
        'a' => (0, false),
        's' => (1, false),
        'd' => (2, false),
        'f' => (3, false),
        'h' => (4, false),
        'g' => (5, false),
        'z' => (6, false),
        'x' => (7, false),
        'c' => (8, false),
        'v' => (9, false),
        'b' => (11, false),
        'q' => (12, false),
        'w' => (13, false),
        'e' => (14, false),
        'r' => (15, false),
        'y' => (16, false),
        't' => (17, false),
        '1' => (18, false),
        '2' => (19, false),
        '3' => (20, false),
        '4' => (21, false),
        '6' => (22, false),
        '5' => (23, false),
        '=' => (24, false),
        '9' => (25, false),
        '7' => (26, false),
        '-' => (27, false),
        '8' => (28, false),
        '0' => (29, false),
        ']' => (30, false),
        'o' => (31, false),
        'u' => (32, false),
        '[' => (33, false),
        'i' => (34, false),
        'p' => (35, false),
        'l' => (37, false),
        'j' => (38, false),
        '\'' => (39, false),
        'k' => (40, false),
        ';' => (41, false),
        '\\' => (42, false),
        ',' => (43, false),
        '/' => (44, false),
        'n' => (45, false),
        'm' => (46, false),
        '.' => (47, false),
        '`' => (50, false),
        '+' => (24, true),
        '_' => (27, true),
        '?' => (44, true),
        '<' => (43, true),
        '>' => (47, true),
        ':' => (41, true),
        '"' => (39, true),
        '{' => (33, true),
        '}' => (30, true),
        '|' => (42, true),
        '~' => (50, true),
        '!' => (18, true),
        '@' => (19, true),
        '#' => (20, true),
        '$' => (21, true),
        '%' => (23, true),
        '^' => (22, true),
        '&' => (26, true),
        '*' => (28, true),
        '(' => (25, true),
        ')' => (29, true),
        _ => return None,
    };
    Some((
        code,
        if shifted || symbol_shift {
            CGEventFlags::MaskShift
        } else {
            CGEventFlags::empty()
        },
    ))
}

fn keycode(event_source: &CGEventSource, token: KeyToken) -> Option<(u16, CGEventFlags)> {
    match token {
        KeyToken::Named(key) => named_keycode(key),
        KeyToken::Char(character) => current_layout_character_keycode(event_source, character)
            .or_else(|| ansi_character_keycode(character)),
    }
}

fn post_key(
    destination: Destination,
    event_source: &CGEventSource,
    keycode: u16,
    down: bool,
    flags: CGEventFlags,
    unicode: Option<&[u16]>,
) -> Result<()> {
    let event = CGEvent::new_keyboard_event(Some(event_source), keycode, down)
        .ok_or_else(|| HelperError::internal("Could not create a keyboard event."))?;
    CGEvent::set_flags(Some(&event), flags);
    if let Some(unicode) = unicode {
        // SAFETY: The UTF-16 slice stays live for this synchronous setter.
        unsafe {
            CGEvent::keyboard_set_unicode_string(
                Some(&event),
                unicode
                    .len()
                    .try_into()
                    .expect("Unicode chunks contain at most 20 code units"),
                unicode.as_ptr(),
            );
        }
    }
    post(destination, &event);
    Ok(())
}

pub fn keyboard(
    window: &WindowInfo,
    action: &KeyboardAction,
    options: InputOptions,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    if !ax::is_trusted() {
        return Ok(permission_refusal(window));
    }
    let mut notes = Vec::new();
    if options.mode == InputMode::Foreground {
        let activation = activate(window)?;
        if activation.refused.is_some() {
            return Ok(activation);
        }
    } else if !ax::focus_window(window, false)? {
        return Ok(InteractiveResult::refused(
            window.clone(),
            Refusal::background_unavailable(
                "The target app did not accept an in-app accessibility focus change.",
            ),
        ));
    } else {
        notes.push("in_app_focus_changed".into());
    }
    let event_source = source()?;
    match action {
        KeyboardAction::Type(text) => {
            let utf16 = text.encode_utf16().collect::<Vec<_>>();
            for chunk in utf16.chunks(20) {
                cancel.check()?;
                post_key(
                    destination(window, options.mode)?,
                    &event_source,
                    0,
                    true,
                    CGEventFlags::empty(),
                    Some(chunk),
                )?;
                post_key(
                    destination(window, options.mode)?,
                    &event_source,
                    0,
                    false,
                    CGEventFlags::empty(),
                    Some(chunk),
                )?;
            }
        }
        KeyboardAction::Chord(chord) => {
            for token in &chord.keys {
                cancel.check()?;
                let Some((keycode, implicit_flags)) = keycode(&event_source, *token) else {
                    return Err(HelperError::invalid_input(format!(
                        "The key {token:?} has no macOS virtual-key mapping."
                    )));
                };
                let flags = flags(chord.modifiers, implicit_flags);
                post_key(
                    destination(window, options.mode)?,
                    &event_source,
                    keycode,
                    true,
                    flags,
                    None,
                )?;
                post_key(
                    destination(window, options.mode)?,
                    &event_source,
                    keycode,
                    false,
                    flags,
                    None,
                )?;
            }
        }
    }
    let mut result = delivery(window, options.mode);
    if let Some(delivery) = &mut result.delivery {
        delivery.notes.extend(notes);
    }
    Ok(result)
}
