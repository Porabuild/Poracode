//! Coordinate math shared by every backend.
//!
//! Agents send FRAME-relative coordinates: (0,0) is the top-left of the window
//! frame (title bar included), which is pixel (0,0) of the last screenshot.

use crate::protocol::window::WindowInfo;

/// Frame-relative → screen coordinates (physical px on Windows/X11, points on macOS).
pub fn frame_to_screen(window: &WindowInfo, fx: f64, fy: f64) -> (i32, i32) {
    (window.x + fx.round() as i32, window.y + fy.round() as i32)
}

pub fn point_in_frame(window: &WindowInfo, fx: f64, fy: f64) -> bool {
    fx >= 0.0
        && fy >= 0.0
        && fx < f64::from(window.width.max(1))
        && fy < f64::from(window.height.max(1))
}

/// X11 / decorated frames: subtract the WM decoration extents to reach the
/// client area. `None` means the point lands on the decoration itself.
pub fn frame_to_client_with_extents(fx: i32, fy: i32, left: i32, top: i32) -> Option<(i32, i32)> {
    let cx = fx - left;
    let cy = fy - top;
    (cx >= 0 && cy >= 0).then_some((cx, cy))
}

/// Win32 `MAKELPARAM` that survives negative client coordinates (a child
/// window's client origin can sit above/left of the point).
pub fn make_lparam(x: i32, y: i32) -> isize {
    let lo = (x as i16) as u16 as u32;
    let hi = (y as i16) as u16 as u32;
    ((hi << 16) | lo) as i32 as isize
}

pub fn lparam_to_point(lparam: isize) -> (i32, i32) {
    let value = lparam as i32 as u32;
    let x = (value & 0xffff) as u16 as i16;
    let y = (value >> 16) as u16 as i16;
    (i32::from(x), i32::from(y))
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DownscalePlan {
    pub width: u32,
    pub height: u32,
    /// Output / source ratio (≤ 1). Agents divide screenshot px by this to get
    /// frame-relative coordinates.
    pub scale: f64,
}

/// Plan a downscale so the largest side is at most `max_dimension`.
/// `max_dimension == 0` disables downscaling.
pub fn plan_downscale(width: u32, height: u32, max_dimension: u32) -> DownscalePlan {
    let width = width.max(1);
    let height = height.max(1);
    let largest = width.max(height);
    if max_dimension == 0 || largest <= max_dimension {
        return DownscalePlan {
            width,
            height,
            scale: 1.0,
        };
    }
    let ratio = f64::from(max_dimension) / f64::from(largest);
    let out_w = ((f64::from(width) * ratio).round() as u32).max(1);
    let out_h = ((f64::from(height) * ratio).round() as u32).max(1);
    // Report the ratio actually applied on the largest side so coordinates
    // divide back exactly.
    let scale = if width >= height {
        f64::from(out_w) / f64::from(width)
    } else {
        f64::from(out_h) / f64::from(height)
    };
    DownscalePlan {
        width: out_w,
        height: out_h,
        scale: (scale * 10_000.0).round() / 10_000.0,
    }
}

/// Number of intermediate drag steps: one per ~16 px, clamped to 4..=40 unless
/// the caller asked for a specific count.
pub fn drag_steps(from: (i32, i32), to: (i32, i32), requested: Option<u32>) -> u32 {
    if let Some(steps) = requested {
        return steps.clamp(1, 200);
    }
    let dx = f64::from(to.0 - from.0);
    let dy = f64::from(to.1 - from.1);
    let distance = (dx * dx + dy * dy).sqrt();
    ((distance / 16.0).round() as u32).clamp(4, 40)
}

/// Points strictly between `from` and `to` plus `to` itself (`steps` entries).
pub fn interpolate(from: (i32, i32), to: (i32, i32), steps: u32) -> Vec<(i32, i32)> {
    let steps = steps.max(1);
    (1..=steps)
        .map(|i| {
            let t = f64::from(i) / f64::from(steps);
            (
                (f64::from(from.0) + f64::from(to.0 - from.0) * t).round() as i32,
                (f64::from(from.1) + f64::from(to.1 - from.1) * t).round() as i32,
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lparam_round_trips_negative_coordinates() {
        for (x, y) in [(0, 0), (10, 20), (-5, 7), (300, -40), (-32768, 32767)] {
            assert_eq!(lparam_to_point(make_lparam(x, y)), (x, y), "({x},{y})");
        }
    }

    #[test]
    fn downscale_plan() {
        assert_eq!(
            plan_downscale(800, 600, 1280),
            DownscalePlan {
                width: 800,
                height: 600,
                scale: 1.0
            }
        );
        assert_eq!(plan_downscale(2560, 1440, 0).scale, 1.0);
        let plan = plan_downscale(2560, 1440, 1280);
        assert_eq!((plan.width, plan.height), (1280, 720));
        assert_eq!(plan.scale, 0.5);
        let tall = plan_downscale(1000, 4000, 1000);
        assert_eq!((tall.width, tall.height), (250, 1000));
        assert_eq!(tall.scale, 0.25);
    }

    #[test]
    fn extents_reject_decoration_points() {
        assert_eq!(frame_to_client_with_extents(40, 50, 4, 30), Some((36, 20)));
        assert_eq!(frame_to_client_with_extents(2, 50, 4, 30), None);
        assert_eq!(frame_to_client_with_extents(40, 10, 4, 30), None);
    }

    #[test]
    fn drag_step_bounds() {
        assert_eq!(drag_steps((0, 0), (10, 0), None), 4);
        assert_eq!(drag_steps((0, 0), (5000, 0), None), 40);
        assert_eq!(drag_steps((0, 0), (320, 0), None), 20);
        assert_eq!(drag_steps((0, 0), (320, 0), Some(3)), 3);
        let points = interpolate((0, 0), (100, 50), 4);
        assert_eq!(points, vec![(25, 13), (50, 25), (75, 38), (100, 50)]);
    }
}
