//! Raw window frames → downscaled, encoded, base64 screenshots.

use std::borrow::Cow;

use base64::Engine as _;
use fast_image_resize::images::Image;
use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer};
use image::ImageEncoder as _;

use crate::geometry::plan_downscale;
use crate::protocol::actions::{ImageFormat, Screenshot};
use crate::protocol::window::WindowInfo;
use crate::protocol::{HelperError, Result};

pub const JPEG_QUALITY: u8 = 75;

/// Top-down 32-bit BGRA pixels, stride = width * 4.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
}

impl Frame {
    pub fn new(width: u32, height: u32, bgra: Vec<u8>) -> Result<Self> {
        let expected = (width as usize) * (height as usize) * 4;
        if width == 0 || height == 0 || bgra.len() != expected {
            return Err(HelperError::capture_failed(format!(
                "frame buffer size mismatch: {width}x{height} needs {expected} bytes, got {}",
                bgra.len()
            )));
        }
        Ok(Self {
            width,
            height,
            bgra,
        })
    }

    /// Solid-color detection on a 16×16 sample grid. Used to spot the black
    /// frames `PrintWindow` returns for DirectComposition-backed windows.
    pub fn is_uniform(&self) -> bool {
        let first = &self.bgra[..3];
        let step_x = (self.width / 16).max(1);
        let step_y = (self.height / 16).max(1);
        let mut y = 0;
        while y < self.height {
            let mut x = 0;
            while x < self.width {
                let offset = ((y * self.width + x) * 4) as usize;
                if &self.bgra[offset..offset + 3] != first {
                    return false;
                }
                x += step_x;
            }
            y += step_y;
        }
        true
    }

    pub fn is_black(&self) -> bool {
        self.is_uniform() && self.bgra[..3] == [0, 0, 0]
    }

    /// Crop a region (clamped to the frame). Used by effect verification.
    pub fn crop(&self, x: i32, y: i32, width: u32, height: u32) -> Frame {
        let x0 = x.clamp(0, self.width as i32 - 1) as u32;
        let y0 = y.clamp(0, self.height as i32 - 1) as u32;
        let w = width.min(self.width - x0).max(1);
        let h = height.min(self.height - y0).max(1);
        let mut out = Vec::with_capacity((w * h * 4) as usize);
        for row in y0..y0 + h {
            let start = ((row * self.width + x0) * 4) as usize;
            out.extend_from_slice(&self.bgra[start..start + (w * 4) as usize]);
        }
        Frame {
            width: w,
            height: h,
            bgra: out,
        }
    }

    /// Cheap content hash for before/after comparisons.
    pub fn content_hash(&self) -> u64 {
        // FNV-1a over the pixel bytes (alpha ignored).
        let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
        for pixel in self.bgra.as_chunks::<4>().0 {
            for byte in &pixel[..3] {
                hash ^= u64::from(*byte);
                hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
            }
        }
        hash
    }
}

#[derive(Debug, Clone)]
pub struct CaptureResult {
    pub frame: Frame,
    pub method: &'static str,
    pub notes: Vec<String>,
}

pub struct EncodeOptions {
    pub max_dimension: u32,
    pub format: ImageFormat,
}

fn resize(frame: &Frame, width: u32, height: u32) -> Result<Vec<u8>> {
    let src = Image::from_vec_u8(
        frame.width,
        frame.height,
        frame.bgra.clone(),
        PixelType::U8x4,
    )
    .map_err(|e| HelperError::capture_failed(format!("resize source: {e}")))?;
    let mut dst = Image::new(width, height, PixelType::U8x4);
    let mut resizer = Resizer::new();
    let options = ResizeOptions::new()
        .resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3))
        .use_alpha(false);
    resizer
        .resize(&src, &mut dst, &options)
        .map_err(|e| HelperError::capture_failed(format!("resize: {e}")))?;
    Ok(dst.into_vec())
}

fn bgra_to_rgb(bgra: &[u8]) -> Vec<u8> {
    let mut rgb = Vec::with_capacity(bgra.len() / 4 * 3);
    for pixel in bgra.as_chunks::<4>().0 {
        rgb.extend_from_slice(&[pixel[2], pixel[1], pixel[0]]);
    }
    rgb
}

fn bgra_to_rgba_opaque(bgra: &[u8]) -> Vec<u8> {
    let mut rgba = Vec::with_capacity(bgra.len());
    for pixel in bgra.as_chunks::<4>().0 {
        // Window captures frequently carry alpha 0 for opaque pixels; force opaque.
        rgba.extend_from_slice(&[pixel[2], pixel[1], pixel[0], 255]);
    }
    rgba
}

/// Downscale + encode + base64 a frame captured at the window's native size.
pub fn encode_screenshot(
    frame: &Frame,
    window: &WindowInfo,
    method: &str,
    options: &EncodeOptions,
) -> Result<Screenshot> {
    let plan = plan_downscale(frame.width, frame.height, options.max_dimension);
    let pixels: Cow<'_, [u8]> = if plan.width == frame.width && plan.height == frame.height {
        Cow::Borrowed(&frame.bgra)
    } else {
        Cow::Owned(resize(frame, plan.width, plan.height)?)
    };
    let mut buffer = Vec::with_capacity(pixels.len() / 4);
    let mime_type = match options.format {
        ImageFormat::Jpeg => {
            let rgb = bgra_to_rgb(pixels.as_ref());
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, JPEG_QUALITY)
                .write_image(
                    &rgb,
                    plan.width,
                    plan.height,
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|e| HelperError::capture_failed(format!("jpeg encode: {e}")))?;
            "image/jpeg"
        }
        ImageFormat::Png => {
            let rgba = bgra_to_rgba_opaque(pixels.as_ref());
            image::codecs::png::PngEncoder::new(&mut buffer)
                .write_image(
                    &rgba,
                    plan.width,
                    plan.height,
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|e| HelperError::capture_failed(format!("png encode: {e}")))?;
            "image/png"
        }
    };
    Ok(Screenshot {
        id: "window".into(),
        mime_type: mime_type.into(),
        data: base64::engine::general_purpose::STANDARD.encode(&buffer),
        width: plan.width,
        height: plan.height,
        origin_x: window.x,
        origin_y: window.y,
        z_index: 0,
        scale: plan.scale,
        source_width: frame.width,
        source_height: frame.height,
        capture_method: method.to_string(),
    })
}

/// Note text agents rely on to convert screenshot pixels back to window coordinates.
pub fn downscale_note(shot: &Screenshot) -> Option<String> {
    if (shot.scale - 1.0).abs() < f64::EPSILON {
        return None;
    }
    Some(format!(
        "Screenshot was downscaled to {}x{} px (scale {}) from the {}x{} window to shrink the payload. To convert a coordinate you read from this screenshot into the window-relative coordinate for click/scroll/drag, DIVIDE it by {} (both x and y).",
        shot.width, shot.height, shot.scale, shot.source_width, shot.source_height, shot.scale
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window() -> WindowInfo {
        WindowInfo {
            app: "a".into(),
            id: 1,
            title: String::new(),
            x: 10,
            y: 20,
            width: 200,
            height: 100,
            pid: None,
            display_name: None,
            minimized: None,
            source: None,
        }
    }

    fn gradient(width: u32, height: u32) -> Frame {
        let mut bgra = Vec::with_capacity((width * height * 4) as usize);
        for y in 0..height {
            for x in 0..width {
                bgra.extend_from_slice(&[(x % 256) as u8, (y % 256) as u8, 128, 0]);
            }
        }
        Frame::new(width, height, bgra).unwrap()
    }

    #[test]
    fn rejects_mismatched_buffers() {
        assert!(Frame::new(2, 2, vec![0; 15]).is_err());
        assert!(Frame::new(0, 2, vec![]).is_err());
    }

    #[test]
    fn uniform_detection() {
        assert!(Frame::new(4, 4, vec![0; 64]).unwrap().is_black());
        assert!(!gradient(32, 32).is_black());
        let white = Frame::new(4, 4, vec![255; 64]).unwrap();
        assert!(white.is_uniform() && !white.is_black());
    }

    #[test]
    fn encodes_jpeg_with_downscale_and_note() {
        let frame = gradient(400, 200);
        let shot = encode_screenshot(
            &frame,
            &window(),
            "test",
            &EncodeOptions {
                max_dimension: 200,
                format: ImageFormat::Jpeg,
            },
        )
        .unwrap();
        assert_eq!((shot.width, shot.height), (200, 100));
        assert_eq!(shot.scale, 0.5);
        assert_eq!(shot.mime_type, "image/jpeg");
        assert_eq!((shot.origin_x, shot.origin_y), (10, 20));
        assert!(!shot.data.is_empty());
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(&shot.data)
            .unwrap();
        assert_eq!(&decoded[..2], &[0xff, 0xd8], "jpeg magic");
        assert!(downscale_note(&shot).unwrap().contains("DIVIDE it by 0.5"));
    }

    #[test]
    fn encodes_png_without_downscale() {
        let frame = gradient(30, 20);
        let shot = encode_screenshot(
            &frame,
            &window(),
            "test",
            &EncodeOptions {
                max_dimension: 1280,
                format: ImageFormat::Png,
            },
        )
        .unwrap();
        assert_eq!(shot.scale, 1.0);
        assert_eq!(shot.mime_type, "image/png");
        assert!(downscale_note(&shot).is_none());
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(&shot.data)
            .unwrap();
        assert_eq!(&decoded[1..4], b"PNG");
    }

    #[test]
    fn crop_and_hash() {
        let frame = gradient(64, 64);
        let a = frame.crop(0, 0, 16, 16);
        let b = frame.crop(16, 16, 16, 16);
        assert_eq!((a.width, a.height), (16, 16));
        assert_ne!(a.content_hash(), b.content_hash());
        let edge = frame.crop(60, 60, 16, 16);
        assert_eq!((edge.width, edge.height), (4, 4));
    }
}
