use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use objc2::AnyThread as _;
use objc2::rc::Retained;
use objc2::runtime::AnyClass;
use objc2_core_foundation::{CFRetained, CGPoint, CGRect, CGSize};
use objc2_core_graphics::{
    CGBitmapContextCreate, CGColorSpace, CGContext, CGDirectDisplayID, CGDisplayCopyDisplayMode,
    CGDisplayMode, CGError, CGGetDisplaysWithPoint, CGImage, CGImageAlphaInfo,
    CGImageByteOrderInfo, CGMainDisplayID, CGPreflightScreenCaptureAccess, CGWindowImageOption,
    CGWindowListOption,
};
use objc2_foundation::NSError;
use objc2_screen_capture_kit::{
    SCContentFilter, SCScreenshotManager, SCShareableContent, SCStreamConfiguration, SCWindow,
};

use crate::capture::{CaptureResult, Frame};
use crate::protocol::window::WindowInfo;
use crate::protocol::{HelperError, Result};

const CALLBACK_TIMEOUT: Duration = Duration::from_secs(4);

/// The largest backing scale any shipping Mac display reports. Guards against a
/// nonsense display mode inflating a capture into a multi-gigabyte allocation.
const MAX_BACKING_SCALE: f64 = 4.0;

/// Emitted whenever a capture had to use the legacy CoreGraphics path because
/// ScreenCaptureKit never answered.
const SCREEN_CAPTURE_KIT_UNAVAILABLE_NOTE: &str = concat!(
    "screen_capture_kit_unavailable: ScreenCaptureKit did not respond within the capture timeout, ",
    "so this window was captured with the legacy CGWindowListCreateImage path. ",
    "Later captures in this helper process skip ScreenCaptureKit entirely."
);

/// Emitted whenever ScreenCaptureKit answered with a real failure and the
/// legacy CoreGraphics path produced the returned image instead.
const SCREEN_CAPTURE_KIT_FAILED_NOTE: &str = "screen_capture_kit_failed";

/// Returned instead of a screenshot while the console screen is locked. macOS
/// stops rendering window content behind the login window: ScreenCaptureKit
/// fails immediately with an audio/video capture error and
/// `CGWindowListCreateImage` returns a fully blank image, so there is no
/// capture path to try.
const SCREEN_LOCKED_CAPTURE_MESSAGE: &str = concat!(
    "The desktop is locked, so macOS renders no window content and every capture path returns ",
    "a blank image. The accessibility tree is no substitute while locked: it is reduced to an ",
    "app proxy exposing only the menu bar. Ask the user to unlock the screen and retry then."
);

/// Process-lifetime health flag. ScreenCaptureKit only calls its completion
/// blocks when the process has a usable window-server connection; when it goes
/// silent once it stays silent, and paying `CALLBACK_TIMEOUT` on every capture
/// would make the helper unusable.
static SCREEN_CAPTURE_KIT_UNHEALTHY: AtomicBool = AtomicBool::new(false);

/// A ScreenCaptureKit failure, split by whether the framework is permanently
/// silent in this process or merely failed this one request. Both fall back to
/// the legacy CoreGraphics path; only `TimedOut` retires ScreenCaptureKit.
enum SckError {
    /// The framework accepted the request but never called back.
    TimedOut,
    /// The framework answered with a real, usually request-specific failure.
    Failed(HelperError),
}

type SckResult<T> = std::result::Result<T, SckError>;

fn callback_error(error: *mut NSError, fallback: &str) -> String {
    // SAFETY: ScreenCaptureKit passes a live NSError for the duration of the callback.
    unsafe { error.as_ref() }
        .map(|error| error.localizedDescription().to_string())
        .unwrap_or_else(|| fallback.to_string())
}

fn shareable_content() -> SckResult<Retained<SCShareableContent>> {
    let (sender, receiver) = mpsc::sync_channel::<std::result::Result<usize, String>>(1);
    let completion = RcBlock::new(
        move |content: *mut SCShareableContent, error: *mut NSError| {
            if let Some(content) =
                // SAFETY: The callback's content pointer is live; retain it before returning.
                unsafe { Retained::retain(content) }
            {
                let raw = Retained::into_raw(content);
                if sender.send(Ok(raw as usize)).is_err() {
                    // SAFETY: Sending failed, so reclaim the +1 reference that was
                    // intended for the receiver and release it here.
                    drop(unsafe { Retained::from_raw(raw) });
                }
            } else {
                let _ = sender.send(Err(callback_error(
                    error,
                    "ScreenCaptureKit returned no shareable content",
                )));
            }
        },
    );
    // SAFETY: The copied block owns its sender and accepts the exact callback
    // signature declared by ScreenCaptureKit.
    unsafe {
        SCShareableContent::getShareableContentExcludingDesktopWindows_onScreenWindowsOnly_completionHandler(
            true,
            false,
            &completion,
        );
    }
    let address = receiver
        .recv_timeout(CALLBACK_TIMEOUT)
        .map_err(|_| SckError::TimedOut)?
        .map_err(|message| SckError::Failed(HelperError::capture_failed(message)))?;
    // SAFETY: The callback converted one retained SCShareableContent pointer
    // to this address, transferring its +1 ownership to this thread.
    unsafe { Retained::from_raw(address as *mut SCShareableContent) }.ok_or_else(|| {
        SckError::Failed(HelperError::capture_failed(
            "ScreenCaptureKit returned a null content.",
        ))
    })
}

fn find_sc_window(window_id: u32) -> SckResult<Retained<SCWindow>> {
    let content = shareable_content()?;
    // SAFETY: `content` is a live ScreenCaptureKit object.
    let windows = unsafe { content.windows() };
    windows
        .to_vec()
        .into_iter()
        // SAFETY: Each object is a retained SCWindow from the framework array.
        .find(|window| unsafe { window.windowID() } == window_id)
        .ok_or_else(|| SckError::Failed(HelperError::window_unavailable()))
}

fn screenshot_image(
    filter: &SCContentFilter,
    configuration: &SCStreamConfiguration,
) -> SckResult<CFRetained<CGImage>> {
    let (sender, receiver) = mpsc::sync_channel::<std::result::Result<usize, String>>(1);
    let completion = RcBlock::new(move |image: *mut CGImage, error: *mut NSError| {
        let Some(image) = NonNull::new(image) else {
            let _ = sender.send(Err(callback_error(
                error,
                "ScreenCaptureKit returned no image",
            )));
            return;
        };
        // SAFETY: The callback's CGImage is live; retain it before returning.
        let image = unsafe { CFRetained::retain(image) };
        let raw = CFRetained::into_raw(image);
        if sender.send(Ok(raw.as_ptr() as usize)).is_err() {
            // SAFETY: Sending failed, so reclaim the +1 reference that was
            // intended for the receiver and release it here.
            drop(unsafe { CFRetained::from_raw(raw) });
        }
    });
    // SAFETY: The filter/configuration are live and the copied block has the
    // exact ScreenCaptureKit completion signature.
    unsafe {
        SCScreenshotManager::captureImageWithFilter_configuration_completionHandler(
            filter,
            configuration,
            Some(&completion),
        );
    }
    let address = receiver
        .recv_timeout(CALLBACK_TIMEOUT)
        .map_err(|_| SckError::TimedOut)?
        .map_err(|message| SckError::Failed(HelperError::capture_failed(message)))?;
    let pointer = NonNull::new(address as *mut CGImage).ok_or_else(|| {
        SckError::Failed(HelperError::capture_failed(
            "ScreenCaptureKit returned a null image.",
        ))
    })?;
    // SAFETY: The callback transferred one retained CGImage reference here.
    Ok(unsafe { CFRetained::from_raw(pointer) })
}

/// The display that contains `point`, in global (top-left origin) point space.
fn display_containing(point: CGPoint) -> Option<CGDirectDisplayID> {
    let mut displays = [0 as CGDirectDisplayID; 1];
    let mut count: u32 = 0;
    // SAFETY: Both out pointers address local storage large enough for the
    // requested maximum of one display id.
    let status = unsafe { CGGetDisplaysWithPoint(point, 1, displays.as_mut_ptr(), &raw mut count) };
    (status == CGError::Success && count > 0).then_some(displays[0])
}

/// Pixels per point for the display showing the middle of `window`.
///
/// macOS window geometry is in points, so a 2x display must be captured at
/// twice the window's point size to keep Retina detail. Reads CoreGraphics
/// display modes rather than `NSScreen`, which would require the main thread.
fn backing_scale(window: &WindowInfo) -> f64 {
    let center = CGPoint::new(
        f64::from(window.x) + f64::from(window.width.max(1)) / 2.0,
        f64::from(window.y) + f64::from(window.height.max(1)) / 2.0,
    );
    let display = display_containing(center).unwrap_or_else(|| CGMainDisplayID());
    let Some(mode) = CGDisplayCopyDisplayMode(display) else {
        return 1.0;
    };
    display_mode_scale(
        CGDisplayMode::pixel_width(Some(&mode)),
        CGDisplayMode::width(Some(&mode)),
    )
}

/// Pure part of [`backing_scale`], kept separate so the math is testable.
fn display_mode_scale(pixel_width: usize, point_width: usize) -> f64 {
    if pixel_width == 0 || point_width == 0 {
        return 1.0;
    }
    let scale = pixel_width as f64 / point_width as f64;
    if scale.is_finite() {
        scale.clamp(1.0, MAX_BACKING_SCALE)
    } else {
        1.0
    }
}

/// Window point size scaled up to the display's pixel grid.
fn capture_pixel_size(window: &WindowInfo, scale: f64) -> (usize, usize) {
    let dimension = |points: i32| {
        ((f64::from(points.max(1)) * scale).round().max(1.0) as usize).min(u32::MAX as usize)
    };
    (dimension(window.width), dimension(window.height))
}

fn screen_capture_kit(window: &WindowInfo, scale: f64) -> SckResult<CFRetained<CGImage>> {
    let id = u32::try_from(window.id)
        .map_err(|_| SckError::Failed(HelperError::window_unavailable()))?;
    let sc_window = find_sc_window(id)?;
    // SAFETY: `sc_window` is retained and valid for the filter initializer.
    let filter = unsafe {
        SCContentFilter::initWithDesktopIndependentWindow(SCContentFilter::alloc(), &sc_window)
    };
    // SAFETY: ScreenCaptureKit configuration initialization and property
    // setters accept these bounded scalar values.
    let configuration = unsafe { SCStreamConfiguration::new() };
    let (width, height) = capture_pixel_size(window, scale);
    // SAFETY: These setters synchronously copy bounded scalar configuration
    // values into the live ScreenCaptureKit object. Width/height are in pixels,
    // so they carry the display's backing scale.
    unsafe {
        configuration.setWidth(width);
        configuration.setHeight(height);
        configuration.setShowsCursor(false);
        configuration.setIgnoreShadowsSingleWindow(true);
        configuration.setPixelFormat(u32::from_be_bytes(*b"BGRA"));
    }
    screenshot_image(&filter, &configuration)
}

fn legacy_window_image(window: &WindowInfo) -> Result<CFRetained<CGImage>> {
    type CreateWindowImage =
        unsafe extern "C" fn(CGRect, CGWindowListOption, u32, CGWindowImageOption) -> *mut CGImage;

    // SAFETY: RTLD_DEFAULT is a process-global read-only symbol lookup and the
    // symbol is invoked only with its documented CoreGraphics ABI.
    let symbol = unsafe { libc::dlsym(libc::RTLD_DEFAULT, c"CGWindowListCreateImage".as_ptr()) };
    if symbol.is_null() {
        return Err(HelperError::capture_failed(
            "This macOS version exposes neither ScreenCaptureKit screenshots nor CGWindowListCreateImage.",
        ));
    }
    // SAFETY: `symbol` was resolved by the exact exported function name.
    let create: CreateWindowImage = unsafe { std::mem::transmute(symbol) };
    let id = u32::try_from(window.id).map_err(|_| HelperError::window_unavailable())?;
    // SAFETY: CGRectNull with OptionIncludingWindow requests the given window's
    // full bounds. The return follows CoreFoundation's Create ownership rule.
    let image = unsafe {
        create(
            objc2_core_graphics::CGRectNull,
            CGWindowListOption::OptionIncludingWindow,
            id,
            // BestResolution returns the window's backing-store pixels, so this
            // path is already Retina-native.
            CGWindowImageOption::BoundsIgnoreFraming | CGWindowImageOption::BestResolution,
        )
    };
    let pointer = NonNull::new(image)
        .ok_or_else(|| HelperError::capture_failed("CoreGraphics returned no window image."))?;
    // SAFETY: CGWindowListCreateImage returned this pointer at +1 ownership.
    Ok(unsafe { CFRetained::from_raw(pointer) })
}

/// Copy a `CGImage` into a top-down BGRA [`Frame`] at the image's own pixel size.
///
/// `CGContextDrawImage` into a `CGBitmapContext` already writes the image's top
/// row into the first row of the buffer, so the CTM stays identity here. A
/// `translate`/`scale(1, -1)` pair would flip every capture upside down.
fn frame_from_image(image: &CGImage) -> Result<Frame> {
    let width = u32::try_from(CGImage::width(Some(image)))
        .map_err(|_| HelperError::capture_failed("Window image is too wide to encode."))?
        .max(1);
    let height = u32::try_from(CGImage::height(Some(image)))
        .map_err(|_| HelperError::capture_failed("Window image is too tall to encode."))?
        .max(1);
    let stride = width as usize * 4;
    let mut bgra = vec![0u8; stride * height as usize];
    let color_space = CGColorSpace::new_device_rgb()
        .ok_or_else(|| HelperError::capture_failed("Create RGB color space."))?;
    let bitmap_info =
        CGImageAlphaInfo::PremultipliedFirst.0 | CGImageByteOrderInfo::Order32Little.0;
    // SAFETY: `bgra` provides exactly stride*height writable bytes and remains
    // fixed in memory until the context is dropped below.
    let context = unsafe {
        CGBitmapContextCreate(
            bgra.as_mut_ptr().cast::<c_void>(),
            width as usize,
            height as usize,
            8,
            stride,
            Some(&color_space),
            bitmap_info,
        )
    }
    .ok_or_else(|| HelperError::capture_failed("Create bitmap context."))?;
    CGContext::draw_image(
        Some(&context),
        CGRect::new(
            CGPoint::ZERO,
            CGSize::new(f64::from(width), f64::from(height)),
        ),
        Some(image),
    );
    drop(context);
    Frame::new(width, height, bgra)
}

pub fn screen_recording_granted() -> bool {
    CGPreflightScreenCaptureAccess()
}

fn screen_capture_kit_available() -> bool {
    AnyClass::get(c"SCScreenshotManager").is_some()
        && !SCREEN_CAPTURE_KIT_UNHEALTHY.load(Ordering::Relaxed)
}

fn legacy_capture(window: &WindowInfo, notes: Vec<String>) -> Result<CaptureResult> {
    let image = legacy_window_image(window)?;
    Ok(CaptureResult {
        frame: frame_from_image(&image)?,
        method: "cg_window",
        notes,
    })
}

/// Which capture path, if any, is worth attempting for this observation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CaptureAttempt {
    /// Nothing can produce pixels; fail with [`SCREEN_LOCKED_CAPTURE_MESSAGE`].
    NoneScreenLocked,
    /// Try ScreenCaptureKit, with legacy CoreGraphics as the fallback.
    ScreenCaptureKit,
    /// Go straight to legacy CoreGraphics.
    Legacy,
}

/// Decide the capture path from the two facts that rule it out.
///
/// A locked console short-circuits everything: measured on real hardware,
/// ScreenCaptureKit returns "Failed to start stream due to audio/video capture
/// failure" and `CGWindowListCreateImage` yields a blank image, so trying
/// either only costs ~150 ms and reports a misleading reason.
fn capture_attempt(screen_locked: bool, screen_capture_kit_available: bool) -> CaptureAttempt {
    if screen_locked {
        return CaptureAttempt::NoneScreenLocked;
    }
    if screen_capture_kit_available {
        CaptureAttempt::ScreenCaptureKit
    } else {
        CaptureAttempt::Legacy
    }
}

pub fn capture(window: &WindowInfo) -> Result<CaptureResult> {
    if !screen_recording_granted() {
        return Err(HelperError::permission_denied(
            "Screen Recording permission is required to capture macOS windows.",
        ));
    }
    match capture_attempt(
        super::session::screen_locked(),
        screen_capture_kit_available(),
    ) {
        CaptureAttempt::NoneScreenLocked => {
            Err(HelperError::capture_failed(SCREEN_LOCKED_CAPTURE_MESSAGE))
        }
        CaptureAttempt::Legacy => {
            let notes = if SCREEN_CAPTURE_KIT_UNHEALTHY.load(Ordering::Relaxed) {
                vec![SCREEN_CAPTURE_KIT_UNAVAILABLE_NOTE.to_string()]
            } else {
                Vec::new()
            };
            legacy_capture(window, notes)
        }
        CaptureAttempt::ScreenCaptureKit => match screen_capture_kit(window, backing_scale(window))
        {
            Ok(image) => Ok(CaptureResult {
                frame: frame_from_image(&image)?,
                method: "screen_capture_kit",
                notes: Vec::new(),
            }),
            Err(SckError::TimedOut) => {
                // A silent ScreenCaptureKit stays silent for the life of the
                // process, so stop paying the timeout on every later capture.
                SCREEN_CAPTURE_KIT_UNHEALTHY.store(true, Ordering::Relaxed);
                log::warn!(
                    "ScreenCaptureKit did not answer within {:?}; falling back to CGWindowListCreateImage",
                    CALLBACK_TIMEOUT
                );
                // If CGWindowListCreateImage is missing too, its own error explains
                // that this system exposes no window capture path at all.
                legacy_capture(
                    window,
                    vec![SCREEN_CAPTURE_KIT_UNAVAILABLE_NOTE.to_string()],
                )
            }
            // A reported failure is usually transient (a stream the window
            // server refused to start for this one window), so try the legacy
            // path once but leave ScreenCaptureKit healthy for later captures.
            // If legacy fails too, ScreenCaptureKit's reason is the useful one.
            Err(SckError::Failed(error)) => legacy_capture(
                window,
                vec![format!(
                    "{SCREEN_CAPTURE_KIT_FAILED_NOTE}: {}",
                    error.message
                )],
            )
            .map_err(|_| error),
        },
    }
}

#[cfg(test)]
mod tests {
    use objc2_core_graphics::{CGBitmapInfo, CGColorRenderingIntent, CGDataProvider};

    use super::*;

    /// Frees the boxed pixel buffer handed to `CGDataProvider::with_data`.
    ///
    /// # Safety
    ///
    /// `info` must be the `Box<Vec<u8>>` raw pointer passed as the provider's
    /// `info` argument.
    unsafe extern "C-unwind" fn release_boxed_pixels(
        info: *mut c_void,
        _data: NonNull<c_void>,
        _size: usize,
    ) {
        // SAFETY: The caller guarantees `info` is the leaked Box<Vec<u8>>.
        drop(unsafe { Box::from_raw(info.cast::<Vec<u8>>()) });
    }

    /// A `width`x`height` BGRA image whose top half is `top` and bottom half is
    /// `bottom`, built with `CGImageCreate` so the byte order is unambiguous:
    /// row 0 of the buffer is the top row of the image.
    fn image_with_rows(
        width: u32,
        height: u32,
        top: [u8; 3],
        bottom: [u8; 3],
    ) -> CFRetained<CGImage> {
        let mut pixels = Vec::with_capacity((width * height * 4) as usize);
        for y in 0..height {
            let color = if y < height / 2 { top } else { bottom };
            for _ in 0..width {
                pixels.extend_from_slice(&[color[0], color[1], color[2], 255]);
            }
        }
        let stride = width as usize * 4;
        let size = pixels.len();
        let boxed = Box::into_raw(Box::new(pixels));
        // SAFETY: `boxed` owns a live Vec<u8> of `size` bytes; the release
        // callback reclaims exactly that box when CoreGraphics is done.
        let data = unsafe { (*boxed).as_ptr().cast::<c_void>() };
        // SAFETY: `data`/`size` describe the boxed buffer and the release
        // callback matches the `info` pointer handed in here.
        let provider = unsafe {
            CGDataProvider::with_data(
                boxed.cast::<c_void>(),
                data,
                size,
                Some(release_boxed_pixels),
            )
        }
        .expect("data provider");
        let color_space = CGColorSpace::new_device_rgb().expect("color space");
        let bitmap_info = CGBitmapInfo(
            CGImageAlphaInfo::PremultipliedFirst.0 | CGImageByteOrderInfo::Order32Little.0,
        );
        // SAFETY: The geometry matches the provider's buffer and `decode` is null.
        unsafe {
            CGImage::new(
                width as usize,
                height as usize,
                8,
                32,
                stride,
                Some(&color_space),
                bitmap_info,
                Some(&provider),
                std::ptr::null(),
                false,
                CGColorRenderingIntent::RenderingIntentDefault,
            )
        }
        .expect("image")
    }

    fn row(frame: &Frame, y: u32) -> [u8; 3] {
        let offset = (y * frame.width * 4) as usize;
        [
            frame.bgra[offset],
            frame.bgra[offset + 1],
            frame.bgra[offset + 2],
        ]
    }

    #[test]
    fn a_locked_screen_skips_every_capture_path() {
        assert_eq!(
            capture_attempt(true, true),
            CaptureAttempt::NoneScreenLocked
        );
        assert_eq!(
            capture_attempt(true, false),
            CaptureAttempt::NoneScreenLocked
        );
    }

    #[test]
    fn an_unlocked_screen_prefers_screen_capture_kit_when_it_is_healthy() {
        assert_eq!(
            capture_attempt(false, true),
            CaptureAttempt::ScreenCaptureKit
        );
        assert_eq!(capture_attempt(false, false), CaptureAttempt::Legacy);
    }

    /// The message must not offer the accessibility tree as a workaround: while
    /// locked it holds no window content either. It must ask for an unlock.
    #[test]
    fn the_locked_screen_message_asks_for_an_unlock_without_promising_a_fallback() {
        assert!(SCREEN_LOCKED_CAPTURE_MESSAGE.contains("locked"));
        assert!(SCREEN_LOCKED_CAPTURE_MESSAGE.contains("unlock"));
        assert!(!SCREEN_LOCKED_CAPTURE_MESSAGE.contains("include_text"));
    }

    /// Both capture paths (ScreenCaptureKit and CGWindowListCreateImage) hand
    /// their CGImage to `frame_from_image`, so this one test covers the vertical
    /// orientation of every macOS screenshot.
    #[test]
    fn frame_from_image_keeps_the_top_row_on_top() {
        let top = [16u8, 32, 200];
        let bottom = [200u8, 32, 16];
        let image = image_with_rows(8, 8, top, bottom);
        let frame = frame_from_image(&image).expect("frame");
        assert_eq!((frame.width, frame.height), (8, 8));
        assert_eq!(row(&frame, 0), top, "row 0 must be the image's top row");
        assert_eq!(row(&frame, 3), top);
        assert_eq!(row(&frame, 4), bottom);
        assert_eq!(row(&frame, 7), bottom);
    }

    /// The frame takes its size from the CGImage, not from the window's point
    /// size, so a Retina capture is not resampled back down to 1x.
    #[test]
    fn frame_from_image_uses_the_image_pixel_size() {
        let image = image_with_rows(24, 12, [1, 2, 3], [4, 5, 6]);
        let frame = frame_from_image(&image).expect("frame");
        assert_eq!((frame.width, frame.height), (24, 12));
    }

    #[test]
    fn display_mode_scale_reports_pixels_per_point() {
        assert_eq!(display_mode_scale(2880, 1440), 2.0);
        assert_eq!(display_mode_scale(1920, 1920), 1.0);
        // Degenerate or absurd modes must never inflate the capture request.
        assert_eq!(display_mode_scale(0, 1440), 1.0);
        assert_eq!(display_mode_scale(2880, 0), 1.0);
        assert_eq!(display_mode_scale(1440, 2880), 1.0);
        assert_eq!(display_mode_scale(usize::MAX, 1), MAX_BACKING_SCALE);
    }

    #[test]
    fn capture_pixel_size_scales_window_points() {
        let window = WindowInfo {
            app: "a".into(),
            id: 1,
            title: String::new(),
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            pid: None,
            display_name: None,
            minimized: None,
            source: None,
        };
        assert_eq!(capture_pixel_size(&window, 2.0), (1600, 1200));
        assert_eq!(capture_pixel_size(&window, 1.0), (800, 600));
        let degenerate = WindowInfo {
            width: 0,
            height: 0,
            ..window
        };
        assert_eq!(capture_pixel_size(&degenerate, 2.0), (2, 2));
    }
}
