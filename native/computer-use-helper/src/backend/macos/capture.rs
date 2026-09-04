use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use objc2::AnyThread as _;
use objc2::rc::Retained;
use objc2::runtime::AnyClass;
use objc2_core_foundation::{CFRetained, CGPoint, CGRect, CGSize};
use objc2_core_graphics::{
    CGBitmapContextCreate, CGColorSpace, CGContext, CGImage, CGImageAlphaInfo,
    CGImageByteOrderInfo, CGPreflightScreenCaptureAccess, CGWindowImageOption, CGWindowListOption,
};
use objc2_foundation::NSError;
use objc2_screen_capture_kit::{
    SCContentFilter, SCScreenshotManager, SCShareableContent, SCStreamConfiguration, SCWindow,
};

use crate::capture::{CaptureResult, Frame};
use crate::protocol::window::WindowInfo;
use crate::protocol::{HelperError, Result};

const CALLBACK_TIMEOUT: Duration = Duration::from_secs(4);

fn callback_error(error: *mut NSError, fallback: &str) -> String {
    // SAFETY: ScreenCaptureKit passes a live NSError for the duration of the callback.
    unsafe { error.as_ref() }
        .map(|error| error.localizedDescription().to_string())
        .unwrap_or_else(|| fallback.to_string())
}

fn shareable_content() -> Result<Retained<SCShareableContent>> {
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
        .map_err(|_| HelperError::capture_failed("Timed out listing ScreenCaptureKit windows."))?
        .map_err(HelperError::capture_failed)?;
    // SAFETY: The callback converted one retained SCShareableContent pointer
    // to this address, transferring its +1 ownership to this thread.
    unsafe { Retained::from_raw(address as *mut SCShareableContent) }
        .ok_or_else(|| HelperError::capture_failed("ScreenCaptureKit returned a null content."))
}

fn find_sc_window(window_id: u32) -> Result<Retained<SCWindow>> {
    let content = shareable_content()?;
    // SAFETY: `content` is a live ScreenCaptureKit object.
    let windows = unsafe { content.windows() };
    windows
        .to_vec()
        .into_iter()
        // SAFETY: Each object is a retained SCWindow from the framework array.
        .find(|window| unsafe { window.windowID() } == window_id)
        .ok_or_else(HelperError::window_unavailable)
}

fn screenshot_image(
    filter: &SCContentFilter,
    configuration: &SCStreamConfiguration,
) -> Result<CFRetained<CGImage>> {
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
        .map_err(|_| HelperError::capture_failed("Timed out waiting for ScreenCaptureKit."))?
        .map_err(HelperError::capture_failed)?;
    let pointer = NonNull::new(address as *mut CGImage)
        .ok_or_else(|| HelperError::capture_failed("ScreenCaptureKit returned a null image."))?;
    // SAFETY: The callback transferred one retained CGImage reference here.
    Ok(unsafe { CFRetained::from_raw(pointer) })
}

fn screen_capture_kit(window: &WindowInfo) -> Result<CFRetained<CGImage>> {
    let id = u32::try_from(window.id).map_err(|_| HelperError::window_unavailable())?;
    let sc_window = find_sc_window(id)?;
    // SAFETY: `sc_window` is retained and valid for the filter initializer.
    let filter = unsafe {
        SCContentFilter::initWithDesktopIndependentWindow(SCContentFilter::alloc(), &sc_window)
    };
    // SAFETY: ScreenCaptureKit configuration initialization and property
    // setters accept these bounded scalar values.
    let configuration = unsafe { SCStreamConfiguration::new() };
    // SAFETY: These setters synchronously copy bounded scalar configuration
    // values into the live ScreenCaptureKit object.
    unsafe {
        configuration.setWidth(window.width.max(1) as usize);
        configuration.setHeight(window.height.max(1) as usize);
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
            CGWindowImageOption::BoundsIgnoreFraming | CGWindowImageOption::BestResolution,
        )
    };
    let pointer = NonNull::new(image)
        .ok_or_else(|| HelperError::capture_failed("CoreGraphics returned no window image."))?;
    // SAFETY: CGWindowListCreateImage returned this pointer at +1 ownership.
    Ok(unsafe { CFRetained::from_raw(pointer) })
}

fn frame_from_image(image: &CGImage, width: u32, height: u32) -> Result<Frame> {
    let width = width.max(1);
    let height = height.max(1);
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
    CGContext::translate_ctm(Some(&context), 0.0, f64::from(height));
    CGContext::scale_ctm(Some(&context), 1.0, -1.0);
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

pub fn capture(window: &WindowInfo) -> Result<CaptureResult> {
    if !screen_recording_granted() {
        return Err(HelperError::permission_denied(
            "Screen Recording permission is required to capture macOS windows.",
        ));
    }
    let (image, method) = if AnyClass::get(c"SCScreenshotManager").is_some() {
        (screen_capture_kit(window)?, "screen_capture_kit")
    } else {
        (legacy_window_image(window)?, "cg_window")
    };
    Ok(CaptureResult {
        frame: frame_from_image(&image, window.width as u32, window.height as u32)?,
        method,
        notes: Vec::new(),
    })
}
