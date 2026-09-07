use std::thread;
use std::time::{Duration, Instant};

use x11rb::CURRENT_TIME;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    AtomEnum, BUTTON_PRESS_EVENT, BUTTON_RELEASE_EVENT, ButtonPressEvent, CLIENT_MESSAGE_EVENT,
    ClientMessageData, ClientMessageEvent, ConnectionExt as _, EventMask, KEY_PRESS_EVENT,
    KEY_RELEASE_EVENT, KeyButMask, KeyPressEvent, MOTION_NOTIFY_EVENT, Motion, MotionNotifyEvent,
    Window,
};
use x11rb::protocol::xtest::ConnectionExt as _;

use super::{Context, ResolvedWindow, x_error};
use crate::backend::linux::keys::{keysym_for_token, modifier_keysyms};
use crate::backend::{CancelToken, KeyboardAction, PointerAction};
use crate::geometry::{drag_steps, frame_to_client_with_extents, frame_to_screen, interpolate};
use crate::protocol::actions::{
    Delivery, DeliveryTarget, InteractiveResult, MouseButton, Refusal, RefusalCode, Route, Verified,
};
use crate::protocol::keys::{Chord, Modifiers};
use crate::protocol::{HelperError, Result};

#[derive(Clone, Copy)]
struct EventPoint {
    event_x: i16,
    event_y: i16,
    root_x: i16,
    root_y: i16,
    target: Window,
}

#[derive(Clone, Copy)]
struct KeyStroke {
    code: u8,
    shift: bool,
}

struct KeyboardMap {
    min_keycode: u8,
    keysyms: Vec<u32>,
    keysyms_per_keycode: usize,
}

fn i16_coord(value: i32) -> i16 {
    value.clamp(i32::from(i16::MIN), i32::from(i16::MAX)) as i16
}

fn selects_core_events(context: &Context, window: Window, required: EventMask) -> bool {
    context
        .connection
        .get_window_attributes(window)
        .ok()
        .and_then(|cookie| cookie.reply().ok())
        .is_some_and(|attributes| attributes.all_event_masks.contains(required))
}

fn deepest_target(
    context: &Context,
    window: &ResolvedWindow,
    frame_x: i32,
    frame_y: i32,
) -> std::result::Result<EventPoint, Refusal> {
    let Some((mut x, mut y)) = frame_to_client_with_extents(
        frame_x,
        frame_y,
        window.client_offset_x,
        window.client_offset_y,
    ) else {
        return Err(Refusal::new(
            RefusalCode::DecorationTarget,
            "The coordinate is on the window decoration, outside the X11 client area.",
            "Choose a point inside the app content from the latest screenshot.",
        ));
    };
    let mut target = window.client;
    for _ in 0..32 {
        let child = context
            .connection
            .translate_coordinates(target, target, i16_coord(x), i16_coord(y))
            .ok()
            .and_then(|cookie| cookie.reply().ok())
            .map(|reply| reply.child)
            .unwrap_or(0);
        if child == 0 || child == target {
            break;
        }
        let Some(translated) = context
            .connection
            .translate_coordinates(target, child, i16_coord(x), i16_coord(y))
            .ok()
            .and_then(|cookie| cookie.reply().ok())
        else {
            break;
        };
        target = child;
        x = i32::from(translated.dst_x);
        y = i32::from(translated.dst_y);
    }
    let (root_x, root_y) = frame_to_screen(&window.info, f64::from(frame_x), f64::from(frame_y));
    Ok(EventPoint {
        event_x: i16_coord(x),
        event_y: i16_coord(y),
        root_x: i16_coord(root_x),
        root_y: i16_coord(root_y),
        target,
    })
}

fn point_for_target(
    context: &Context,
    window: &ResolvedWindow,
    target: Window,
    frame_x: i32,
    frame_y: i32,
) -> std::result::Result<EventPoint, Refusal> {
    let Some((client_x, client_y)) = frame_to_client_with_extents(
        frame_x,
        frame_y,
        window.client_offset_x,
        window.client_offset_y,
    ) else {
        return Err(Refusal::new(
            RefusalCode::DecorationTarget,
            "The coordinate is on the window decoration, outside the X11 client area.",
            "Choose a point inside the app content from the latest screenshot.",
        ));
    };
    let translated = context
        .connection
        .translate_coordinates(
            window.client,
            target,
            i16_coord(client_x),
            i16_coord(client_y),
        )
        .map_err(|_| Refusal::background_unavailable("Could not translate the drag coordinate."))?
        .reply()
        .map_err(|_| Refusal::background_unavailable("Could not translate the drag coordinate."))?;
    let (root_x, root_y) = frame_to_screen(&window.info, f64::from(frame_x), f64::from(frame_y));
    Ok(EventPoint {
        event_x: translated.dst_x,
        event_y: translated.dst_y,
        root_x: i16_coord(root_x),
        root_y: i16_coord(root_y),
        target,
    })
}

fn core_event_refusal(window: &ResolvedWindow) -> InteractiveResult {
    InteractiveResult::refused(
        window.info.clone(),
        Refusal::background_unavailable(
            "The target has not selected core X11 events, so synthetic core events cannot be reported as delivered.",
        ),
    )
}

fn motion_event(context: &Context, point: EventPoint, state: KeyButMask) -> Result<()> {
    let event = MotionNotifyEvent {
        response_type: MOTION_NOTIFY_EVENT,
        detail: Motion::NORMAL,
        sequence: 0,
        time: CURRENT_TIME,
        root: context.root,
        event: point.target,
        child: 0,
        root_x: point.root_x,
        root_y: point.root_y,
        event_x: point.event_x,
        event_y: point.event_y,
        state,
        same_screen: true,
    };
    context
        .connection
        .send_event(
            false,
            point.target,
            if state == KeyButMask::default() {
                EventMask::POINTER_MOTION
            } else {
                EventMask::BUTTON_MOTION
            },
            event,
        )
        .map_err(|error| x_error("send motion", error))?
        .check()
        .map_err(|error| x_error("send motion reply", error))
}

fn button_event(context: &Context, point: EventPoint, button: u8, pressed: bool) -> Result<()> {
    let event = ButtonPressEvent {
        response_type: if pressed {
            BUTTON_PRESS_EVENT
        } else {
            BUTTON_RELEASE_EVENT
        },
        detail: button,
        sequence: 0,
        time: CURRENT_TIME,
        root: context.root,
        event: point.target,
        child: 0,
        root_x: point.root_x,
        root_y: point.root_y,
        event_x: point.event_x,
        event_y: point.event_y,
        state: if pressed {
            KeyButMask::default()
        } else {
            button_mask(button)
        },
        same_screen: true,
    };
    context
        .connection
        .send_event(
            false,
            point.target,
            if pressed {
                EventMask::BUTTON_PRESS
            } else {
                EventMask::BUTTON_RELEASE
            },
            event,
        )
        .map_err(|error| x_error("send button", error))?
        .check()
        .map_err(|error| x_error("send button reply", error))
}

fn button_number(button: MouseButton) -> u8 {
    match button {
        MouseButton::Left => 1,
        MouseButton::Middle => 2,
        MouseButton::Right => 3,
    }
}

fn button_mask(button: u8) -> KeyButMask {
    match button {
        1 => KeyButMask::BUTTON1,
        2 => KeyButMask::BUTTON2,
        3 => KeyButMask::BUTTON3,
        4 => KeyButMask::BUTTON4,
        5 => KeyButMask::BUTTON5,
        _ => KeyButMask::default(),
    }
}

fn background_pointer(
    context: &Context,
    window: &ResolvedWindow,
    action: PointerAction,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    if window.info.minimized == Some(true) {
        return Ok(InteractiveResult::refused(
            window.info.clone(),
            Refusal::window_minimized(),
        ));
    }
    let target_id = match action {
        PointerAction::Click {
            x,
            y,
            button,
            count,
        } => {
            let point = match deepest_target(context, window, x.round() as i32, y.round() as i32) {
                Ok(point) => point,
                Err(refusal) => {
                    return Ok(InteractiveResult::refused(window.info.clone(), refusal));
                }
            };
            if !selects_core_events(
                context,
                point.target,
                EventMask::BUTTON_PRESS | EventMask::BUTTON_RELEASE,
            ) {
                return Ok(core_event_refusal(window));
            }
            motion_event(context, point, KeyButMask::default())?;
            let button = button_number(button);
            for index in 0..count {
                cancel.check()?;
                button_event(context, point, button, true)?;
                button_event(context, point, button, false)?;
                if index + 1 < count {
                    thread::sleep(Duration::from_millis(50));
                }
            }
            point.target
        }
        PointerAction::Scroll { x, y, dx, dy } => {
            let point = match deepest_target(context, window, x.round() as i32, y.round() as i32) {
                Ok(point) => point,
                Err(refusal) => {
                    return Ok(InteractiveResult::refused(window.info.clone(), refusal));
                }
            };
            if !selects_core_events(
                context,
                point.target,
                EventMask::BUTTON_PRESS | EventMask::BUTTON_RELEASE,
            ) {
                return Ok(core_event_refusal(window));
            }
            motion_event(context, point, KeyButMask::default())?;
            for (delta, negative, positive) in [(dy, 4, 5), (dx, 6, 7)] {
                let button = if delta < 0.0 { negative } else { positive };
                let count = (delta.abs() / 120.0).ceil().clamp(0.0, 100.0) as u32;
                for _ in 0..count {
                    cancel.check()?;
                    button_event(context, point, button, true)?;
                    button_event(context, point, button, false)?;
                }
            }
            point.target
        }
        PointerAction::Drag { from, to, steps } => {
            let from_frame = (from.0.round() as i32, from.1.round() as i32);
            let to_frame = (to.0.round() as i32, to.1.round() as i32);
            let start = match deepest_target(context, window, from_frame.0, from_frame.1) {
                Ok(point) => point,
                Err(refusal) => {
                    return Ok(InteractiveResult::refused(window.info.clone(), refusal));
                }
            };
            if !selects_core_events(
                context,
                start.target,
                EventMask::BUTTON_PRESS | EventMask::BUTTON_RELEASE | EventMask::BUTTON_MOTION,
            ) {
                return Ok(core_event_refusal(window));
            }
            motion_event(context, start, KeyButMask::default())?;
            button_event(context, start, 1, true)?;
            let mut last = start;
            let result: Result<()> = (|| {
                for (x, y) in interpolate(
                    from_frame,
                    to_frame,
                    drag_steps(from_frame, to_frame, steps),
                ) {
                    cancel.check()?;
                    let point = point_for_target(context, window, start.target, x, y)
                        .map_err(|refusal| HelperError::invalid_input(refusal.reason))?;
                    last = point;
                    motion_event(context, last, KeyButMask::BUTTON1)?;
                    thread::sleep(Duration::from_millis(8));
                }
                Ok(())
            })();
            let release = button_event(context, last, 1, false);
            result?;
            release?;
            start.target
        }
    };
    context
        .connection
        .flush()
        .map_err(|error| x_error("flush input", error))?;
    Ok(InteractiveResult::delivered(
        window.info.clone(),
        Delivery::background(Route::Event).with_target(DeliveryTarget {
            kind: "x11".into(),
            id: target_id.to_string(),
            role: None,
            name: None,
        }),
    ))
}

fn keyboard_map(context: &Context) -> Result<KeyboardMap> {
    let setup = context.connection.setup();
    let count = setup.max_keycode - setup.min_keycode + 1;
    let mapping = context
        .connection
        .get_keyboard_mapping(setup.min_keycode, count)
        .map_err(|error| x_error("get keyboard mapping", error))?
        .reply()
        .map_err(|error| x_error("get keyboard mapping reply", error))?;
    Ok(KeyboardMap {
        min_keycode: setup.min_keycode,
        keysyms: mapping.keysyms,
        keysyms_per_keycode: usize::from(mapping.keysyms_per_keycode),
    })
}

fn keymap(mapping: &KeyboardMap, keysym: u32) -> Result<KeyStroke> {
    mapping
        .keysyms
        .chunks(mapping.keysyms_per_keycode)
        .enumerate()
        .find_map(|(index, symbols)| {
            symbols
                .iter()
                .position(|symbol| *symbol == keysym)
                .map(|column| KeyStroke {
                    code: mapping.min_keycode + index as u8,
                    shift: column % 2 == 1,
                })
        })
        .ok_or_else(|| {
            HelperError::invalid_input(format!("No X11 keycode maps keysym 0x{keysym:x}"))
        })
}

fn modifier_state(modifiers: Modifiers) -> KeyButMask {
    let mut state = KeyButMask::default();
    if modifiers.shift {
        state |= KeyButMask::SHIFT;
    }
    if modifiers.control {
        state |= KeyButMask::CONTROL;
    }
    if modifiers.alt {
        state |= KeyButMask::MOD1;
    }
    if modifiers.meta {
        state |= KeyButMask::MOD4;
    }
    state
}

fn key_event(
    context: &Context,
    window: &ResolvedWindow,
    stroke: KeyStroke,
    state: KeyButMask,
) -> Result<()> {
    let (root_x, root_y) = frame_to_screen(&window.info, 0.0, 0.0);
    let base = KeyPressEvent {
        response_type: KEY_PRESS_EVENT,
        detail: stroke.code,
        sequence: 0,
        time: CURRENT_TIME,
        root: context.root,
        event: window.client,
        child: 0,
        root_x: i16_coord(root_x),
        root_y: i16_coord(root_y),
        event_x: 0,
        event_y: 0,
        state: if stroke.shift {
            state | KeyButMask::SHIFT
        } else {
            state
        },
        same_screen: true,
    };
    let pressed = context
        .connection
        .send_event(false, window.client, EventMask::KEY_PRESS, base)
        .map_err(|error| x_error("send key press", error))?
        .check()
        .map_err(|error| x_error("send key press reply", error));
    let released = context
        .connection
        .send_event(
            false,
            window.client,
            EventMask::KEY_RELEASE,
            KeyPressEvent {
                response_type: KEY_RELEASE_EVENT,
                ..base
            },
        )
        .map_err(|error| x_error("send key release", error))?
        .check()
        .map_err(|error| x_error("send key release reply", error));
    pressed?;
    released
}

fn background_keyboard(
    context: &Context,
    window: &ResolvedWindow,
    action: &KeyboardAction,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    if window.info.minimized == Some(true) {
        return Ok(InteractiveResult::refused(
            window.info.clone(),
            Refusal::window_minimized(),
        ));
    }
    if !selects_core_events(
        context,
        window.client,
        EventMask::KEY_PRESS | EventMask::KEY_RELEASE,
    ) {
        return Ok(core_event_refusal(window));
    }
    let mapping = keyboard_map(context)?;
    let mut delivery = Delivery::background(Route::Event).with_target(DeliveryTarget {
        kind: "x11".into(),
        id: window.client.to_string(),
        role: None,
        name: None,
    });
    match action {
        KeyboardAction::Type(text) => {
            for character in text.chars() {
                cancel.check()?;
                let stroke = keymap(&mapping, xkeysym::Keysym::from_char(character).raw())?;
                key_event(context, window, stroke, KeyButMask::default())?;
            }
        }
        KeyboardAction::Chord(chord) => {
            let state = modifier_state(chord.modifiers);
            for token in &chord.keys {
                cancel.check()?;
                key_event(
                    context,
                    window,
                    keymap(&mapping, keysym_for_token(*token))?,
                    state,
                )?;
            }
            if chord.modifiers.any() {
                delivery.notes.push("modifiers_in_event_only".into());
            }
        }
    }
    context
        .connection
        .flush()
        .map_err(|error| x_error("flush keyboard", error))?;
    Ok(InteractiveResult::delivered(window.info.clone(), delivery))
}

pub fn activate(context: &Context, window: &ResolvedWindow) -> Result<InteractiveResult> {
    let event = ClientMessageEvent::new(
        32,
        window.client,
        context.atoms.active_window,
        ClientMessageData::from([1, CURRENT_TIME, 0, 0, 0]),
    );
    debug_assert_eq!(event.response_type, CLIENT_MESSAGE_EVENT);
    context
        .connection
        .send_event(
            false,
            context.root,
            EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
            event,
        )
        .map_err(|error| x_error("request activation", error))?
        .check()
        .map_err(|error| x_error("activation reply", error))?;
    context
        .connection
        .flush()
        .map_err(|error| x_error("flush activation", error))?;
    let deadline = Instant::now() + Duration::from_millis(500);
    while Instant::now() < deadline {
        let active = context
            .connection
            .get_property(
                false,
                context.root,
                context.atoms.active_window,
                AtomEnum::WINDOW,
                0,
                1,
            )
            .ok()
            .and_then(|cookie| cookie.reply().ok())
            .and_then(|reply| reply.value32().and_then(|mut values| values.next()));
        let focus = context
            .connection
            .get_input_focus()
            .ok()
            .and_then(|cookie| cookie.reply().ok())
            .map(|reply| reply.focus);
        if active.is_some_and(|active| active == window.client || active == window.frame)
            || focus.is_some_and(|focus| belongs_to_window(context, focus, window))
        {
            return Ok(InteractiveResult::delivered(
                window.info.clone(),
                Delivery::foreground(Route::Input).with_verified(Verified::Confirmed),
            ));
        }
        thread::sleep(Duration::from_millis(10));
    }
    Ok(InteractiveResult::refused(
        window.info.clone(),
        Refusal::new(
            RefusalCode::TargetNotResponding,
            "The window manager did not confirm foreground activation within 500 ms.",
            "Activate the target window manually and retry, or use background element actions.",
        ),
    ))
}

fn belongs_to_window(context: &Context, mut candidate: Window, window: &ResolvedWindow) -> bool {
    for _ in 0..32 {
        if candidate == window.client || candidate == window.frame {
            return true;
        }
        let Some(parent) = context
            .connection
            .query_tree(candidate)
            .ok()
            .and_then(|cookie| cookie.reply().ok())
            .map(|tree| tree.parent)
        else {
            return false;
        };
        if parent == 0 || parent == candidate {
            return false;
        }
        candidate = parent;
    }
    false
}

fn xtest_button(context: &Context, button: u8, pressed: bool) -> Result<()> {
    context
        .connection
        .xtest_fake_input(
            if pressed {
                BUTTON_PRESS_EVENT
            } else {
                BUTTON_RELEASE_EVENT
            },
            button,
            CURRENT_TIME,
            context.root,
            0,
            0,
            0,
        )
        .map_err(|error| x_error("XTEST button", error))?
        .check()
        .map_err(|error| x_error("XTEST button reply", error))
}

fn xtest_motion(context: &Context, x: i32, y: i32) -> Result<()> {
    context
        .connection
        .xtest_fake_input(
            MOTION_NOTIFY_EVENT,
            0,
            CURRENT_TIME,
            context.root,
            i16_coord(x),
            i16_coord(y),
            0,
        )
        .map_err(|error| x_error("XTEST motion", error))?
        .check()
        .map_err(|error| x_error("XTEST motion reply", error))
}

fn foreground_pointer(
    context: &Context,
    window: &ResolvedWindow,
    action: PointerAction,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    let activation = activate(context, window)?;
    if activation.delivery.is_none() {
        return Ok(activation);
    }
    match action {
        PointerAction::Click {
            x,
            y,
            button,
            count,
        } => {
            let (x, y) = frame_to_screen(&window.info, x, y);
            xtest_motion(context, x, y)?;
            let button = button_number(button);
            for _ in 0..count {
                cancel.check()?;
                let pressed = xtest_button(context, button, true);
                let released = xtest_button(context, button, false);
                pressed?;
                released?;
            }
        }
        PointerAction::Scroll { x, y, dx, dy } => {
            let (x, y) = frame_to_screen(&window.info, x, y);
            xtest_motion(context, x, y)?;
            for (delta, negative, positive) in [(dy, 4, 5), (dx, 6, 7)] {
                let button = if delta < 0.0 { negative } else { positive };
                for _ in 0..(delta.abs() / 120.0).ceil().clamp(0.0, 100.0) as u32 {
                    cancel.check()?;
                    xtest_button(context, button, true)?;
                    xtest_button(context, button, false)?;
                }
            }
        }
        PointerAction::Drag { from, to, steps } => {
            let from = frame_to_screen(&window.info, from.0, from.1);
            let to = frame_to_screen(&window.info, to.0, to.1);
            xtest_motion(context, from.0, from.1)?;
            xtest_button(context, 1, true)?;
            let result: Result<()> = (|| {
                for (x, y) in interpolate(from, to, drag_steps(from, to, steps)) {
                    cancel.check()?;
                    xtest_motion(context, x, y)?;
                    thread::sleep(Duration::from_millis(8));
                }
                Ok(())
            })();
            let release = xtest_button(context, 1, false);
            result?;
            release?;
        }
    }
    context
        .connection
        .flush()
        .map_err(|error| x_error("flush XTEST", error))?;
    Ok(InteractiveResult::delivered(
        window.info.clone(),
        Delivery::foreground(Route::Input),
    ))
}

fn xtest_key(context: &Context, code: u8, pressed: bool) -> Result<()> {
    context
        .connection
        .xtest_fake_input(
            if pressed {
                KEY_PRESS_EVENT
            } else {
                KEY_RELEASE_EVENT
            },
            code,
            CURRENT_TIME,
            context.root,
            0,
            0,
            0,
        )
        .map_err(|error| x_error("XTEST key", error))?
        .check()
        .map_err(|error| x_error("XTEST key reply", error))
}

fn foreground_keyboard(
    context: &Context,
    window: &ResolvedWindow,
    action: &KeyboardAction,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    let activation = activate(context, window)?;
    if activation.delivery.is_none() {
        return Ok(activation);
    }
    let mapping = keyboard_map(context)?;
    match action {
        KeyboardAction::Type(text) => {
            for character in text.chars() {
                cancel.check()?;
                let stroke = keymap(&mapping, xkeysym::Keysym::from_char(character).raw())?;
                let shift = stroke
                    .shift
                    .then(|| keymap(&mapping, xkeysym::key::Shift_L))
                    .transpose()?;
                if let Some(shift) = shift {
                    xtest_key(context, shift.code, true)?;
                }
                let pressed = xtest_key(context, stroke.code, true);
                let released = xtest_key(context, stroke.code, false);
                if let Some(shift) = shift {
                    let shift_released = xtest_key(context, shift.code, false);
                    pressed?;
                    released?;
                    shift_released?;
                } else {
                    pressed?;
                    released?;
                }
            }
        }
        KeyboardAction::Chord(Chord { modifiers, keys }) => {
            let modifier_codes = modifier_keysyms(*modifiers)
                .into_iter()
                .map(|keysym| keymap(&mapping, keysym))
                .collect::<Result<Vec<_>>>()?;
            for modifier in &modifier_codes {
                xtest_key(context, modifier.code, true)?;
            }
            let result: Result<()> = (|| {
                for token in keys {
                    cancel.check()?;
                    let stroke = keymap(&mapping, keysym_for_token(*token))?;
                    let pressed = xtest_key(context, stroke.code, true);
                    let released = xtest_key(context, stroke.code, false);
                    pressed?;
                    released?;
                }
                Ok(())
            })();
            for modifier in modifier_codes.iter().rev() {
                let _ = xtest_key(context, modifier.code, false);
            }
            result?;
        }
    }
    context
        .connection
        .flush()
        .map_err(|error| x_error("flush XTEST", error))?;
    Ok(InteractiveResult::delivered(
        window.info.clone(),
        Delivery::foreground(Route::Input),
    ))
}

pub fn pointer(
    window: &ResolvedWindow,
    action: PointerAction,
    foreground: bool,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    let context = super::connect()?;
    if foreground {
        foreground_pointer(&context, window, action, cancel)
    } else {
        background_pointer(&context, window, action, cancel)
    }
}

pub fn keyboard(
    window: &ResolvedWindow,
    action: &KeyboardAction,
    foreground: bool,
    cancel: &CancelToken,
) -> Result<InteractiveResult> {
    let context = super::connect()?;
    if foreground {
        foreground_keyboard(&context, window, action, cancel)
    } else {
        background_keyboard(&context, window, action, cancel)
    }
}
