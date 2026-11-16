//! The guard: this binary in `--locked-use-guard` mode.
//!
//! While a locked-use session holds the desktop, the guard is what stands
//! between it and anyone at the keyboard:
//!
//! * an opaque borderless window on every screen at the screen-saver level,
//!   on all Spaces, saying who is using the Mac and how to take over;
//! * kiosk presentation options (no Dock, menu bar, app switching, Force Quit,
//!   or log-out) while it is the active app;
//! * an active event tap at the HID level that swallows the first local
//!   keyboard, mouse, or scroll event, relocks at once, prints `local_input`,
//!   and exits;
//! * a `PreventUserIdleDisplaySleep` power assertion for as long as it lives.
//!
//! It prints `ready` only once the windows and the tap are up. EOF on stdin
//! (the helper ended the session, or died) relocks and exits, so the guard
//! fails safe on its own.

use std::cell::RefCell;
use std::ffi::c_void;
use std::io::{Read, Write};
use std::ptr::NonNull;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSApplicationPresentationOptions,
    NSBackingStoreType, NSColor, NSFont, NSScreen, NSScreenSaverWindowLevel, NSTextAlignment,
    NSTextField, NSWindow, NSWindowCollectionBehavior, NSWindowStyleMask,
};
use objc2_core_foundation::{
    CFMachPort, CFRetained, CFRunLoop, CFString, CGPoint, CGRect, CGSize, kCFRunLoopCommonModes,
};
use objc2_core_graphics::{
    CGDirectDisplayID, CGDisplayChangeSummaryFlags, CGDisplayRegisterReconfigurationCallback,
    CGEvent, CGEventField, CGEventMask, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventTapProxy, CGEventType,
};
use objc2_foundation::NSString;

use super::brightness::Snapshot;
use super::guard_process::{DISPLAY_CHANGED_LINE, LOCAL_INPUT_LINE, READY_LINE};
use super::relock::relock;
use super::trigger::{RETURN_KEYCODE, TRIGGER_EVENT_TAG};
use crate::backend::COMPUTER_USE_OVERLAY_TITLE;

/// Exit status when the guard could not come up; the parent sees no `ready`.
const EXIT_SETUP_FAILED: i32 = 3;
const ASSERTION_NAME: &str = "Poracode Locked Computer Use";
/// `kIOPMAssertionLevelOn`.
const ASSERTION_LEVEL_ON: u32 = 255;

#[link(name = "IOKit", kind = "framework")]
unsafe extern "C" {
    fn IOPMAssertionCreateWithName(
        assertion_type: &CFString,
        level: u32,
        name: &CFString,
        assertion_id: *mut u32,
    ) -> i32;
}

/// Every local input event that means "someone is at this Mac".
const WATCHED_EVENTS: [CGEventType; 16] = [
    CGEventType::LeftMouseDown,
    CGEventType::LeftMouseUp,
    CGEventType::RightMouseDown,
    CGEventType::RightMouseUp,
    CGEventType::MouseMoved,
    CGEventType::LeftMouseDragged,
    CGEventType::RightMouseDragged,
    CGEventType::KeyDown,
    CGEventType::KeyUp,
    CGEventType::FlagsChanged,
    CGEventType::ScrollWheel,
    CGEventType::TabletPointer,
    CGEventType::TabletProximity,
    CGEventType::OtherMouseDown,
    CGEventType::OtherMouseUp,
    CGEventType::OtherMouseDragged,
];
/// `NX_SYSDEFINED`: media, brightness, and power keys.
const SYSTEM_DEFINED_EVENT: u32 = 14;

fn event_mask() -> CGEventMask {
    WATCHED_EVENTS
        .iter()
        .fold(1 << SYSTEM_DEFINED_EVENT, |mask, kind| mask | (1 << kind.0))
}

thread_local! {
    /// The tap, for re-enabling it from its own callback (main thread only).
    static TAP: RefCell<Option<CFRetained<CFMachPort>>> = const { RefCell::new(None) };
}

fn announce(line: &str) {
    let mut stdout = std::io::stdout().lock();
    let _ = writeln!(stdout, "{line}");
    let _ = stdout.flush();
}

static RELOCKING: AtomicBool = AtomicBool::new(false);
static END_REQUESTED: AtomicBool = AtomicBool::new(false);

static BRIGHTNESS: Mutex<Option<Snapshot>> = Mutex::new(None);

fn restore_brightness() {
    if let Some(snapshot) = BRIGHTNESS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .take()
    {
        snapshot.restore();
    }
}

static RELOCK_WORKER: OnceLock<std::thread::Thread> = OnceLock::new();

fn start_relock_worker() -> std::io::Result<()> {
    let worker = std::thread::Builder::new()
        .name("locked-use-relock".into())
        .spawn(|| {
            loop {
                if RELOCKING.load(Ordering::SeqCst) {
                    if super::super::session::screen_locked() {
                        if END_REQUESTED.load(Ordering::SeqCst) {
                            restore_brightness();
                            std::process::exit(0);
                        }
                    } else if let Err(error) = relock() {
                        eprintln!("locked-use guard: relock failed; keeping protection: {error}");
                    }
                }
                std::thread::park_timeout(Duration::from_millis(50));
            }
        })?;
    let _ = RELOCK_WORKER.set(worker.thread().clone());
    Ok(())
}

/// Keep the windows and tap alive until the helper has withdrawn its approval
/// and the OS confirms the lock. Never wait inside the event-tap callback.
fn request_relock(interruption: Option<&str>) {
    if RELOCKING.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(reason) = interruption {
        eprintln!("locked-use guard: interrupted ({reason})");
        announce(reason);
    }
    if let Some(worker) = RELOCK_WORKER.get() {
        worker.unpark();
    }
}

/// Any display reconfiguration invalidates the covers. Interrupt immediately
/// (including the begin phase), rather than letting work run on a new display.
unsafe extern "C-unwind" fn display_changed(
    _display: CGDirectDisplayID,
    _flags: CGDisplayChangeSummaryFlags,
    _user_info: *mut c_void,
) {
    request_relock(Some(DISPLAY_CHANGED_LINE));
}

/// The trigger's tagged events: the click on the lock screen's user name and
/// the Return that submits the placeholder.
fn is_trigger_event(kind: CGEventType, user_data: i64, keycode: i64) -> bool {
    if user_data != TRIGGER_EVENT_TAG {
        return false;
    }
    match kind {
        CGEventType::LeftMouseDown | CGEventType::LeftMouseUp => true,
        CGEventType::KeyDown | CGEventType::KeyUp => keycode == i64::from(RETURN_KEYCODE),
        _ => false,
    }
}

/// A pointer "move" with no movement is synthetic noise, not a person.
fn is_local_input(kind: CGEventType, event: &CGEvent) -> bool {
    if kind != CGEventType::MouseMoved {
        return true;
    }
    CGEvent::integer_value_field(Some(event), CGEventField::MouseEventDeltaX) != 0
        || CGEvent::integer_value_field(Some(event), CGEventField::MouseEventDeltaY) != 0
}

unsafe extern "C-unwind" fn on_event(
    _proxy: CGEventTapProxy,
    kind: CGEventType,
    event: NonNull<CGEvent>,
    _user_info: *mut c_void,
) -> *mut CGEvent {
    if kind == CGEventType::TapDisabledByTimeout || kind == CGEventType::TapDisabledByUserInput {
        TAP.with_borrow(|tap| {
            if let Some(tap) = tap {
                CGEvent::tap_enable(tap, true);
            }
        });
        return event.as_ptr();
    }
    // SAFETY: CoreGraphics hands the callback a live event for its duration.
    let event_ref = unsafe { event.as_ref() };
    let user_data =
        CGEvent::integer_value_field(Some(event_ref), CGEventField::EventSourceUserData);
    let keycode = CGEvent::integer_value_field(Some(event_ref), CGEventField::KeyboardEventKeycode);
    if !RELOCKING.load(Ordering::SeqCst) && is_trigger_event(kind, user_data, keycode) {
        // Delivered: the lock screen needs them to show and submit its field.
        return event.as_ptr();
    }
    if is_local_input(kind, event_ref) {
        request_relock(Some(LOCAL_INPUT_LINE));
    }
    // Swallowed: nothing reaches the desktop under the guard.
    std::ptr::null_mut()
}

fn install_event_tap() -> Option<CFRetained<CFMachPort>> {
    // SAFETY: The callback matches CGEventTapCallBack and uses no user info.
    let tap = unsafe {
        CGEvent::tap_create(
            CGEventTapLocation::HIDEventTap,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::Default,
            event_mask(),
            Some(on_event),
            std::ptr::null_mut(),
        )
    }?;
    let source = CFMachPort::new_run_loop_source(None, Some(&tap), 0)?;
    let run_loop = CFRunLoop::main()?;
    // SAFETY: Reading an immutable CoreFoundation constant.
    let mode = unsafe { kCFRunLoopCommonModes };
    run_loop.add_source(Some(&source), mode);
    CGEvent::tap_enable(&tap, true);
    TAP.with_borrow_mut(|slot| *slot = Some(tap.clone()));
    Some(tap)
}

fn hold_display_awake() {
    let kind = CFString::from_str("PreventUserIdleDisplaySleep");
    let name = CFString::from_str(ASSERTION_NAME);
    let mut assertion = 0u32;
    // SAFETY: Both strings are live and `assertion` is writable. The assertion
    // is released by the kernel when this process exits.
    let status =
        unsafe { IOPMAssertionCreateWithName(&kind, ASSERTION_LEVEL_ON, &name, &mut assertion) };
    if status != 0 {
        eprintln!("locked-use guard: display-sleep assertion failed ({status})");
    }
}

/// Relock and exit when the helper closes our stdin.
fn watch_stdin() -> std::io::Result<()> {
    std::thread::Builder::new()
        .name("locked-use-guard-stdin".into())
        .spawn(|| {
            let mut stdin = std::io::stdin().lock();
            let mut buffer = [0u8; 64];
            loop {
                match stdin.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(_) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
                    Err(_) => break,
                }
            }
            END_REQUESTED.store(true, Ordering::SeqCst);
            request_relock(None);
        })
        .map(drop)
}

fn label(text: &str, font: &NSFont, frame: CGRect, mtm: MainThreadMarker) -> Retained<NSTextField> {
    let label = NSTextField::labelWithString(&NSString::from_str(text), mtm);
    label.setFont(Some(font));
    label.setTextColor(Some(&NSColor::whiteColor()));
    label.setAlignment(NSTextAlignment::Center);
    label.setFrame(frame);
    label
}

fn cover(
    screen: &NSScreen,
    title: &str,
    subtitle: &str,
    mtm: MainThreadMarker,
) -> Retained<NSWindow> {
    let frame = screen.frame();
    // SAFETY: A fresh allocation initialised once on the main thread.
    let window = unsafe {
        NSWindow::initWithContentRect_styleMask_backing_defer(
            mtm.alloc(),
            frame,
            NSWindowStyleMask::Borderless,
            NSBackingStoreType::Buffered,
            false,
        )
    };
    // SAFETY: The window is owned by the returned `Retained` for the life of
    // the guard; AppKit must not release it on close as well.
    unsafe { window.setReleasedWhenClosed(false) };
    window.setFrame_display(frame, false);
    // Window lists skip this title, so the agent never sees the guard.
    window.setTitle(&NSString::from_str(COMPUTER_USE_OVERLAY_TITLE));
    window.setLevel(NSScreenSaverWindowLevel);
    window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle
            | NSWindowCollectionBehavior::FullScreenAuxiliary,
    );
    window.setOpaque(true);
    window.setHasShadow(false);
    window.setHidesOnDeactivate(false);
    window.setCanHide(false);
    window.setBackgroundColor(Some(&NSColor::colorWithWhite_alpha(0.08, 1.0)));
    if let Some(content) = window.contentView() {
        let width = (frame.size.width - 80.0).max(1.0);
        let middle = frame.size.height / 2.0;
        content.addSubview(&label(
            title,
            &NSFont::boldSystemFontOfSize(34.0),
            CGRect::new(CGPoint::new(40.0, middle + 8.0), CGSize::new(width, 48.0)),
            mtm,
        ));
        content.addSubview(&label(
            subtitle,
            &NSFont::systemFontOfSize(18.0),
            CGRect::new(CGPoint::new(40.0, middle - 36.0), CGSize::new(width, 28.0)),
            mtm,
        ));
    }
    window.orderFrontRegardless();
    window
}

/// Run the guard until local input, stdin EOF, or death. Returns only when it
/// could not come up.
pub(crate) fn run(title: &str, subtitle: &str, brightness: Option<&str>) -> i32 {
    let Some(snapshot) = Snapshot::decode(brightness) else {
        eprintln!("locked-use guard: invalid brightness snapshot");
        return EXIT_SETUP_FAILED;
    };
    *BRIGHTNESS.lock().unwrap_or_else(|error| error.into_inner()) = Some(snapshot);
    let result = run_app(title, subtitle);
    restore_brightness();
    result
}

fn run_app(title: &str, subtitle: &str) -> i32 {
    let Some(mtm) = MainThreadMarker::new() else {
        eprintln!("locked-use guard: must run on the main thread");
        return EXIT_SETUP_FAILED;
    };
    if let Err(error) = start_relock_worker() {
        eprintln!("locked-use guard: cannot start relock worker: {error}");
        return EXIT_SETUP_FAILED;
    }
    if let Err(error) = watch_stdin() {
        eprintln!("locked-use guard: cannot watch stdin: {error}");
        return EXIT_SETUP_FAILED;
    }
    hold_display_awake();

    // SAFETY: Static callback, no borrowed context. It lives for this process.
    let registration = unsafe {
        CGDisplayRegisterReconfigurationCallback(Some(display_changed), std::ptr::null_mut())
    };
    if registration.0 != 0 {
        eprintln!("locked-use guard: cannot watch display configuration");
        return EXIT_SETUP_FAILED;
    }
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
    let windows = NSScreen::screens(mtm)
        .iter()
        .map(|screen| cover(&screen, title, subtitle, mtm))
        .collect::<Vec<_>>();
    if windows.is_empty() {
        eprintln!("locked-use guard: no screens to cover");
        return EXIT_SETUP_FAILED;
    }
    let Some(_tap) = install_event_tap() else {
        // Without the tap nobody could take over; never report ready.
        eprintln!("locked-use guard: the event tap could not be created");
        return EXIT_SETUP_FAILED;
    };
    // Kiosk options apply while the guard is the active app.
    app.setPresentationOptions(
        NSApplicationPresentationOptions::HideDock
            | NSApplicationPresentationOptions::HideMenuBar
            | NSApplicationPresentationOptions::DisableProcessSwitching
            | NSApplicationPresentationOptions::DisableForceQuit
            | NSApplicationPresentationOptions::DisableSessionTermination,
    );
    #[allow(deprecated)]
    app.activateIgnoringOtherApps(true);
    if RELOCKING.load(Ordering::SeqCst) {
        return EXIT_SETUP_FAILED;
    }
    {
        let brightness = BRIGHTNESS.lock().unwrap_or_else(|error| error.into_inner());
        if RELOCKING.load(Ordering::SeqCst) {
            return EXIT_SETUP_FAILED;
        }
        if let Some(snapshot) = brightness.as_ref() {
            snapshot.dim();
        }
    }
    announce(READY_LINE);
    app.run();
    drop(windows);
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_tagged_click_and_return_pass_through() {
        let tag = TRIGGER_EVENT_TAG;
        let ret = i64::from(RETURN_KEYCODE);
        assert!(is_trigger_event(CGEventType::LeftMouseDown, tag, 0));
        assert!(is_trigger_event(CGEventType::LeftMouseUp, tag, 0));
        assert!(is_trigger_event(CGEventType::KeyDown, tag, ret));
        assert!(is_trigger_event(CGEventType::KeyUp, tag, ret));
        assert!(!is_trigger_event(CGEventType::LeftMouseDown, 0, 0));
        assert!(!is_trigger_event(CGEventType::KeyDown, 0, ret));
        assert!(!is_trigger_event(CGEventType::KeyDown, tag, 0));
        assert!(!is_trigger_event(CGEventType::RightMouseDown, tag, 0));
        assert!(!is_trigger_event(CGEventType::MouseMoved, tag, 0));
    }
}
