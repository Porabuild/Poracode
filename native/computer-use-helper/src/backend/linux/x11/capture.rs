use x11rb::connection::Connection;
use x11rb::protocol::composite::ConnectionExt as _;
use x11rb::protocol::xproto::{ConnectionExt as _, ImageFormat, ImageOrder, Visualtype};

use super::{Context, ResolvedWindow, x_error};
use crate::capture::{CaptureResult, Frame};
use crate::protocol::{HelperError, Result};

fn visual(context: &Context, visual_id: u32) -> Option<&Visualtype> {
    context.connection.setup().roots[context.screen_number]
        .allowed_depths
        .iter()
        .flat_map(|depth| depth.visuals.iter())
        .find(|visual| visual.visual_id == visual_id)
}

fn component(value: u32, mask: u32) -> u8 {
    if mask == 0 {
        return 0;
    }
    let shift = mask.trailing_zeros();
    let maximum = mask >> shift;
    (((value & mask) >> shift) * 255 / maximum) as u8
}

fn decode(
    context: &Context,
    width: u16,
    height: u16,
    depth: u8,
    visual_id: u32,
    data: &[u8],
) -> Result<Frame> {
    let format = context
        .connection
        .setup()
        .pixmap_formats
        .iter()
        .find(|format| format.depth == depth)
        .ok_or_else(|| {
            HelperError::capture_failed(format!("no X11 pixmap format for depth {depth}"))
        })?;
    let visual = visual(context, visual_id)
        .or_else(|| {
            let root_visual = context.connection.setup().roots[context.screen_number].root_visual;
            visual(context, root_visual)
        })
        .ok_or_else(|| HelperError::capture_failed("X11 visual metadata is unavailable"))?;
    let bits_per_pixel = usize::from(format.bits_per_pixel);
    if !matches!(bits_per_pixel, 16 | 24 | 32) {
        return Err(HelperError::capture_failed(format!(
            "unsupported X11 pixel width: {bits_per_pixel}"
        )));
    }
    let row_bits = usize::from(width) * bits_per_pixel;
    let pad = usize::from(format.scanline_pad);
    let stride = row_bits.div_ceil(pad) * pad / 8;
    if data.len() < stride * usize::from(height) {
        return Err(HelperError::capture_failed("short X11 image buffer"));
    }
    let bytes_per_pixel = bits_per_pixel / 8;
    let little_endian = context.connection.setup().image_byte_order == ImageOrder::LSB_FIRST;
    let mut bgra = Vec::with_capacity(usize::from(width) * usize::from(height) * 4);
    for y in 0..usize::from(height) {
        let row = &data[y * stride..];
        for x in 0..usize::from(width) {
            let pixel = &row[x * bytes_per_pixel..][..bytes_per_pixel];
            let mut padded = [0u8; 4];
            if little_endian {
                padded[..bytes_per_pixel].copy_from_slice(pixel);
                let value = u32::from_le_bytes(padded);
                bgra.extend_from_slice(&[
                    component(value, visual.blue_mask),
                    component(value, visual.green_mask),
                    component(value, visual.red_mask),
                    255,
                ]);
            } else {
                padded[4 - bytes_per_pixel..].copy_from_slice(pixel);
                let value = u32::from_be_bytes(padded);
                bgra.extend_from_slice(&[
                    component(value, visual.blue_mask),
                    component(value, visual.green_mask),
                    component(value, visual.red_mask),
                    255,
                ]);
            }
        }
    }
    Frame::new(u32::from(width), u32::from(height), bgra)
}

fn drawable_frame(context: &Context, drawable: u32) -> Result<Frame> {
    let geometry = context
        .connection
        .get_geometry(drawable)
        .map_err(|error| x_error("get drawable geometry", error))?
        .reply()
        .map_err(|error| x_error("get drawable geometry reply", error))?;
    let attributes = context
        .connection
        .get_window_attributes(drawable)
        .ok()
        .and_then(|cookie| cookie.reply().ok());
    let visual_id = attributes
        .map(|attributes| attributes.visual)
        .unwrap_or(context.connection.setup().roots[context.screen_number].root_visual);
    let image = context
        .connection
        .get_image(
            ImageFormat::Z_PIXMAP,
            drawable,
            0,
            0,
            geometry.width,
            geometry.height,
            u32::MAX,
        )
        .map_err(|error| x_error("get image", error))?
        .reply()
        .map_err(|error| x_error("get image reply", error))?;
    decode(
        context,
        geometry.width,
        geometry.height,
        image.depth,
        visual_id,
        &image.data,
    )
}

fn composite_frame(context: &Context, window: &ResolvedWindow) -> Result<Frame> {
    context
        .connection
        .composite_query_version(0, 4)
        .map_err(|error| x_error("query Composite", error))?
        .reply()
        .map_err(|error| x_error("query Composite reply", error))?;
    let pixmap = context
        .connection
        .generate_id()
        .map_err(|error| x_error("allocate pixmap id", error))?;
    context
        .connection
        .composite_name_window_pixmap(window.frame, pixmap)
        .map_err(|error| x_error("name window pixmap", error))?
        .check()
        .map_err(|error| x_error("name window pixmap reply", error))?;
    let frame = drawable_frame(context, pixmap);
    let _ = context.connection.free_pixmap(pixmap);
    let _ = context.connection.flush();
    frame
}

pub fn capture(window: &ResolvedWindow) -> Result<CaptureResult> {
    let context = super::connect()?;
    if let Ok(frame) = composite_frame(&context, window)
        && !frame.is_black()
    {
        return Ok(CaptureResult {
            frame,
            method: "x_composite",
            notes: Vec::new(),
        });
    }
    Err(HelperError::capture_failed(
        "XComposite could not capture this window in the background.",
    ))
}
