use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Dwm::{DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute};
use windows::Win32::Graphics::Gdi::{
    BI_RGB, BITMAPINFO, CreateCompatibleBitmap, CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC,
    DeleteObject, GetDC, GetDIBits, HGDIOBJ, ReleaseDC, SelectObject,
};
use windows::Win32::Storage::Xps::{PRINT_WINDOW_FLAGS, PrintWindow};
use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize};

use crate::capture::{CaptureResult, Frame};
use crate::protocol::window::WindowInfo;
use crate::protocol::{HelperError, Result};

use super::window_list::hwnd_from_id;

fn align_wgc_frame(window: &WindowInfo, frame: Frame) -> Result<Frame> {
    let target_width = window.width.max(1) as u32;
    let target_height = window.height.max(1) as u32;
    if frame.width == target_width && frame.height == target_height {
        return Ok(frame);
    }
    let mut visible = RECT::default();
    // SAFETY: `visible` is writable for the exact structure size and hwnd was
    // resolved immediately before capture.
    unsafe {
        DwmGetWindowAttribute(
            hwnd_from_id(window.id),
            DWMWA_EXTENDED_FRAME_BOUNDS,
            (&mut visible as *mut RECT).cast(),
            std::mem::size_of::<RECT>() as u32,
        )
    }
    .map_err(|error| HelperError::capture_failed(format!("Read WGC frame bounds: {error}")))?;
    pad_wgc_frame(window, visible, frame)
}

fn pad_wgc_frame(window: &WindowInfo, visible: RECT, frame: Frame) -> Result<Frame> {
    let target_width = window.width.max(1) as u32;
    let target_height = window.height.max(1) as u32;
    let visible_width = (visible.right - visible.left).max(0) as u32;
    let visible_height = (visible.bottom - visible.top).max(0) as u32;
    let offset_x = visible.left - window.x;
    let offset_y = visible.top - window.y;
    if frame.width != visible_width
        || frame.height != visible_height
        || offset_x < 0
        || offset_y < 0
        || offset_x as u32 + frame.width > target_width
        || offset_y as u32 + frame.height > target_height
    {
        return Err(HelperError::capture_failed(format!(
            "WGC frame {}x{} does not align with window {}x{}",
            frame.width, frame.height, target_width, target_height
        )));
    }
    let mut pixels = vec![0u8; target_width as usize * target_height as usize * 4];
    let source_stride = frame.width as usize * 4;
    let target_stride = target_width as usize * 4;
    for row in 0..frame.height as usize {
        let source = row * source_stride;
        let target = (row + offset_y as usize) * target_stride + offset_x as usize * 4;
        pixels[target..target + source_stride]
            .copy_from_slice(&frame.bgra[source..source + source_stride]);
    }
    Frame::new(target_width, target_height, pixels)
}

fn capture_wgc(hwnd: HWND, window: &WindowInfo) -> Result<Frame> {
    if !wgc::is_wgc_supported()
        .map_err(|error| HelperError::capture_failed(format!("Check WGC support: {error}")))?
    {
        return Err(HelperError::capture_failed(
            "Windows Graphics Capture is unavailable on this Windows version.",
        ));
    }
    // SAFETY: This request worker is a fresh thread. The guard balances the
    // successful per-thread WinRT initialization before returning.
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
        .map_err(|error| HelperError::capture_failed(format!("Initialize WinRT: {error}")))?;
    struct WinRtGuard;
    impl Drop for WinRtGuard {
        fn drop(&mut self) {
            // SAFETY: The worker thread successfully called RoInitialize once.
            unsafe { RoUninitialize() };
        }
    }
    let _winrt = WinRtGuard;
    let item = wgc::new_item_from_hwnd(hwnd)
        .map_err(|error| HelperError::capture_failed(format!("Create WGC item: {error}")))?;
    let mut settings = wgc::WgcSettings {
        pixel_format: wgc::PixelFormat::BGRA8,
        frame_queue_length: 1,
        ..Default::default()
    };
    if wgc::is_cursor_configurable().unwrap_or(false) {
        settings.capture_cursor = Some(false);
    }
    let mut capture = wgc::Wgc::new(item, settings)
        .map_err(|error| HelperError::capture_failed(format!("Start WGC: {error}")))?;
    let frame = capture
        .next()
        .ok_or_else(|| HelperError::capture_failed("WGC session ended without a frame."))?
        .map_err(|error| HelperError::capture_failed(format!("Read WGC frame: {error}")))?;
    let size = frame
        .size()
        .map_err(|error| HelperError::capture_failed(format!("Read WGC frame size: {error}")))?;
    let width = size.width;
    let height = size.height;
    if width == 0 || height == 0 {
        return Err(HelperError::capture_failed(
            "WGC returned invalid frame dimensions.",
        ));
    }
    let pixels = frame
        .read_pixels(None)
        .map_err(|error| HelperError::capture_failed(format!("Copy WGC pixels: {error}")))?;
    align_wgc_frame(window, Frame::new(width, height, pixels)?)
}

fn capture_pixels(hwnd: HWND, window: &WindowInfo) -> Result<(Frame, &'static str, Vec<String>)> {
    let width = window.width.max(1);
    let height = window.height.max(1);
    // SAFETY: every GDI handle is checked before use, selected objects are
    // restored before deletion, and all acquired handles are released below.
    unsafe {
        let screen_dc = GetDC(None);
        if screen_dc.0.is_null() {
            return Err(HelperError::capture_failed("GetDC failed"));
        }
        let memory_dc = CreateCompatibleDC(Some(screen_dc));
        if memory_dc.0.is_null() {
            let _ = ReleaseDC(None, screen_dc);
            return Err(HelperError::capture_failed("CreateCompatibleDC failed"));
        }
        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        if bitmap.0.is_null() {
            let _ = DeleteDC(memory_dc);
            let _ = ReleaseDC(None, screen_dc);
            return Err(HelperError::capture_failed("CreateCompatibleBitmap failed"));
        }
        let old = SelectObject(memory_dc, HGDIOBJ(bitmap.0));

        let mut method = "print_window";
        let printed = PrintWindow(hwnd, memory_dc, PRINT_WINDOW_FLAGS(2)).as_bool();

        let read_pixels = || -> Result<Frame> {
            let mut info = BITMAPINFO::default();
            info.bmiHeader.biSize = std::mem::size_of_val(&info.bmiHeader) as u32;
            info.bmiHeader.biWidth = width;
            info.bmiHeader.biHeight = -height;
            info.bmiHeader.biPlanes = 1;
            info.bmiHeader.biBitCount = 32;
            info.bmiHeader.biCompression = BI_RGB.0;
            let mut pixels = vec![0u8; width as usize * height as usize * 4];
            let lines = GetDIBits(
                memory_dc,
                bitmap,
                0,
                height as u32,
                Some(pixels.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS,
            );
            if lines != height {
                return Err(HelperError::capture_failed(format!(
                    "GetDIBits returned {lines} of {height} rows"
                )));
            }
            Frame::new(width as u32, height as u32, pixels)
        };

        let mut frame = read_pixels();
        if !printed || frame.as_ref().is_ok_and(Frame::is_black) {
            if let Ok(captured) = capture_wgc(hwnd, window)
                && !captured.is_black()
            {
                frame = Ok(captured);
                method = "windows_graphics_capture";
            } else {
                frame = Err(HelperError::capture_failed(
                    "PrintWindow and Windows Graphics Capture could not capture this window in the background.",
                ));
            }
        }

        let _ = SelectObject(memory_dc, old);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteDC(memory_dc);
        let _ = ReleaseDC(None, screen_dc);
        frame.map(|frame| (frame, method, Vec::new()))
    }
}

pub fn capture(window: &WindowInfo) -> Result<CaptureResult> {
    let (frame, method, notes) = capture_pixels(hwnd_from_id(window.id), window)?;
    Ok(CaptureResult {
        frame,
        method,
        notes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::window::WindowSource;

    #[test]
    fn pads_visible_wgc_bounds_into_window_coordinates() {
        let window = WindowInfo {
            app: "test.exe".into(),
            id: 1,
            title: "test".into(),
            x: 10,
            y: 20,
            width: 6,
            height: 5,
            pid: None,
            display_name: None,
            minimized: Some(false),
            source: Some(WindowSource::Win32),
        };
        let source = Frame::new(4, 3, vec![7; 4 * 3 * 4]).unwrap();
        let aligned = pad_wgc_frame(
            &window,
            RECT {
                left: 11,
                top: 21,
                right: 15,
                bottom: 24,
            },
            source,
        )
        .unwrap();
        assert_eq!((aligned.width, aligned.height), (6, 5));
        assert_eq!(&aligned.bgra[(6 * 4 + 4)..(6 * 4 + 8)], &[7; 4]);
        assert_eq!(&aligned.bgra[..4], &[0; 4]);
    }
}
