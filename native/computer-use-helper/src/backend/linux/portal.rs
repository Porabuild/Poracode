use std::ffi::OsString;
use std::io::Write as _;
use std::os::unix::ffi::OsStringExt as _;
use std::os::unix::fs::OpenOptionsExt as _;
use std::path::{Path, PathBuf};
use std::time::Duration;

use ashpd::desktop::remote_desktop::{
    DeviceType, KeyState, NotifyKeyboardKeysymOptions, NotifyPointerAxisOptions,
    NotifyPointerButtonOptions, NotifyPointerMotionAbsoluteOptions, RemoteDesktop,
    SelectDevicesOptions,
};
use ashpd::desktop::screencast::{
    CursorMode, Screencast, SelectSourcesOptions, SourceType, Stream,
};
use ashpd::desktop::screenshot::Screenshot;
use ashpd::desktop::{PersistMode, Session};
use serde::{Deserialize, Serialize};

use crate::backend::{CancelToken, KeyboardAction, PointerAction};
use crate::capture::{CaptureResult, Frame};
use crate::geometry::{drag_steps, interpolate};
use crate::protocol::actions::{Delivery, InteractiveResult, MouseButton, Route, Verified};
use crate::protocol::keys::Chord;
use crate::protocol::window::WindowInfo;
use crate::protocol::{HelperError, Result};

use super::keys::{keysym_for_token, modifier_keysyms};

const TOKEN_SCHEMA_VERSION: u32 = 1;
const TOKEN_FILE: &str = "wayland-portal-session.json";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPermission {
    schema_version: u32,
    restore_token: String,
}

struct ActiveSession {
    remote_desktop: RemoteDesktop,
    session: Session<RemoteDesktop>,
    streams: Vec<Stream>,
}

pub struct Portal {
    state_dir: Option<PathBuf>,
    active: Option<ActiveSession>,
}

impl Portal {
    pub fn new(state_dir: Option<PathBuf>) -> Self {
        Self {
            state_dir,
            active: None,
        }
    }

    fn token_path(&self) -> Option<PathBuf> {
        self.state_dir
            .as_ref()
            .map(|state_dir| state_dir.join(TOKEN_FILE))
    }

    fn read_restore_token(&self) -> Option<String> {
        let path = self.token_path()?;
        let stored: StoredPermission = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
        (stored.schema_version == TOKEN_SCHEMA_VERSION && !stored.restore_token.is_empty())
            .then_some(stored.restore_token)
    }

    fn write_restore_token(&self, token: &str) {
        let Some(path) = self.token_path() else {
            return;
        };
        let Some(parent) = path.parent() else {
            return;
        };
        let stored = StoredPermission {
            schema_version: TOKEN_SCHEMA_VERSION,
            restore_token: token.to_string(),
        };
        let temporary = path.with_extension(format!("tmp-{}", std::process::id()));
        let result = std::fs::create_dir_all(parent).and_then(|()| {
            let bytes = serde_json::to_vec(&stored).map_err(std::io::Error::other)?;
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .mode(0o600)
                .open(&temporary)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            std::fs::rename(&temporary, path)
        });
        if let Err(error) = result {
            let _ = std::fs::remove_file(temporary);
            log::warn!("Could not persist the Wayland portal restore token: {error}");
        }
    }

    async fn ensure_session(&mut self) -> Result<&ActiveSession> {
        if self.active.is_none() {
            let restore_token = self.read_restore_token();
            let connection = zbus::Connection::session()
                .await
                .map_err(|error| portal_error("connect to the session bus", error))?;
            let remote_desktop = RemoteDesktop::with_connection(connection.clone())
                .await
                .map_err(|error| portal_error("open RemoteDesktop", error))?;
            let screencast = Screencast::with_connection(connection)
                .await
                .map_err(|error| portal_error("open ScreenCast", error))?;
            let session = remote_desktop
                .create_session(Default::default())
                .await
                .map_err(|error| portal_error("create a session", error))?;
            remote_desktop
                .select_devices(
                    &session,
                    SelectDevicesOptions::default()
                        .set_devices(DeviceType::Keyboard | DeviceType::Pointer)
                        .set_persist_mode(PersistMode::ExplicitlyRevoked)
                        .set_restore_token(restore_token.as_deref()),
                )
                .await
                .map_err(|error| portal_error("select input devices", error))?;
            screencast
                .select_sources(
                    &session,
                    SelectSourcesOptions::default()
                        .set_cursor_mode(CursorMode::Hidden)
                        .set_sources(Some(SourceType::Monitor.into()))
                        .set_multiple(true)
                        .set_persist_mode(PersistMode::ExplicitlyRevoked)
                        .set_restore_token(restore_token.as_deref()),
                )
                .await
                .map_err(|error| portal_error("select monitors", error))?;
            let selected = remote_desktop
                .start(&session, None, Default::default())
                .await
                .map_err(|error| portal_error("start a session", error))?
                .response()
                .map_err(|error| portal_error("authorize a session", error))?;
            if !selected.devices().contains(DeviceType::Keyboard)
                || !selected.devices().contains(DeviceType::Pointer)
            {
                return Err(HelperError::permission_denied(
                    "The Wayland portal did not grant both keyboard and pointer access.",
                ));
            }
            if selected.streams().is_empty() {
                return Err(HelperError::permission_denied(
                    "The Wayland portal did not grant a monitor for coordinate input.",
                ));
            }
            if let Some(token) = selected.restore_token() {
                self.write_restore_token(token);
            }
            self.active = Some(ActiveSession {
                remote_desktop,
                session,
                streams: selected.streams().to_vec(),
            });
        }
        Ok(self.active.as_ref().expect("portal session initialized"))
    }

    pub async fn prepare(&mut self, cancel: &CancelToken) -> Result<()> {
        cancel.check()?;
        self.ensure_session().await?;
        cancel.check()
    }

    pub async fn pointer(
        &mut self,
        window: &WindowInfo,
        action: PointerAction,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        let active = self.ensure_session().await?;
        match action {
            PointerAction::Click {
                x,
                y,
                button,
                count,
            } => {
                move_pointer(active, window, x, y).await?;
                let button = evdev_button(button);
                for index in 0..count {
                    cancel.check()?;
                    notify_button(active, button, KeyState::Pressed).await?;
                    let released = notify_button(active, button, KeyState::Released).await;
                    released?;
                    if index + 1 < count {
                        tokio::time::sleep(Duration::from_millis(50)).await;
                    }
                }
            }
            PointerAction::Scroll { x, y, dx, dy } => {
                move_pointer(active, window, x, y).await?;
                active
                    .remote_desktop
                    .notify_pointer_axis(
                        &active.session,
                        dx,
                        dy,
                        NotifyPointerAxisOptions::default().set_finish(true),
                    )
                    .await
                    .map_err(|error| portal_error("send scroll input", error))?;
            }
            PointerAction::Drag { from, to, steps } => {
                move_pointer(active, window, from.0, from.1).await?;
                notify_button(active, evdev_button(MouseButton::Left), KeyState::Pressed).await?;
                let from = (from.0.round() as i32, from.1.round() as i32);
                let to = (to.0.round() as i32, to.1.round() as i32);
                let mut movement = Ok(());
                for (x, y) in interpolate(from, to, drag_steps(from, to, steps)) {
                    if let Err(error) = cancel.check() {
                        movement = Err(error);
                        break;
                    }
                    if let Err(error) =
                        move_pointer(active, window, f64::from(x), f64::from(y)).await
                    {
                        movement = Err(error);
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(8)).await;
                }
                let released =
                    notify_button(active, evdev_button(MouseButton::Left), KeyState::Released)
                        .await;
                movement?;
                released?;
            }
        }
        Ok(delivered(window))
    }

    pub async fn keyboard(
        &mut self,
        window: &WindowInfo,
        action: &KeyboardAction,
        cancel: &CancelToken,
    ) -> Result<InteractiveResult> {
        let active = self.ensure_session().await?;
        match action {
            KeyboardAction::Type(text) => {
                for character in text.chars() {
                    cancel.check()?;
                    let pressed = notify_key(
                        active,
                        xkeysym::Keysym::from_char(character).raw(),
                        KeyState::Pressed,
                    )
                    .await;
                    let released = notify_key(
                        active,
                        xkeysym::Keysym::from_char(character).raw(),
                        KeyState::Released,
                    )
                    .await;
                    pressed?;
                    released?;
                }
            }
            KeyboardAction::Chord(chord) => send_chord(active, chord, cancel).await?,
        }
        Ok(delivered(window))
    }

    pub async fn capture(
        &mut self,
        window: &WindowInfo,
        desktop_bounds: Option<(i32, i32, i32, i32)>,
        cancel: &CancelToken,
    ) -> Result<CaptureResult> {
        cancel.check()?;
        let response = Screenshot::request()
            .interactive(false)
            .modal(false)
            .send()
            .await
            .map_err(|error| capture_error("request screenshot", error))?
            .response()
            .map_err(|error| capture_error("capture screenshot", error))?;
        cancel.check()?;
        let path = file_uri_path(response.uri().as_str())?;
        let bytes = std::fs::read(&path).map_err(|error| {
            HelperError::capture_failed(format!(
                "Could not read Wayland portal screenshot {}: {error}",
                path.display()
            ))
        })?;
        let image = image::load_from_memory(&bytes)
            .map_err(|error| HelperError::capture_failed(format!("Decode portal image: {error}")))?
            .to_rgba8();
        // The passive Screenshot portal does not expose monitor origins. An
        // available XWayland root provides the compositor's logical desktop
        // geometry without requesting remote-control permission. Pure-Wayland
        // sessions fall back to the screenshot's own pixel bounds.
        let (desktop_x, desktop_y, desktop_width, desktop_height) =
            desktop_bounds.unwrap_or((0, 0, image.width() as i32, image.height() as i32));
        if desktop_width <= 0 || desktop_height <= 0 {
            return Err(HelperError::capture_failed(
                "The Wayland desktop geometry is invalid.",
            ));
        }
        let scale_x = f64::from(image.width()) / f64::from(desktop_width);
        let scale_y = f64::from(image.height()) / f64::from(desktop_height);
        let crop_x = (f64::from(window.x - desktop_x) * scale_x).round() as i64;
        let crop_y = (f64::from(window.y - desktop_y) * scale_y).round() as i64;
        let crop_width = (f64::from(window.width) * scale_x).round().max(1.0) as u32;
        let crop_height = (f64::from(window.height) * scale_y).round().max(1.0) as u32;
        if crop_x < 0
            || crop_y < 0
            || crop_x >= i64::from(image.width())
            || crop_y >= i64::from(image.height())
        {
            return Err(HelperError::capture_failed(
                "The target window is outside the monitors shared through the Wayland portal.",
            ));
        }
        let crop_x = crop_x as u32;
        let crop_y = crop_y as u32;
        let crop_width = crop_width.min(image.width() - crop_x);
        let crop_height = crop_height.min(image.height() - crop_y);
        let cropped =
            image::imageops::crop_imm(&image, crop_x, crop_y, crop_width, crop_height).to_image();
        let normalized = if cropped.width() != window.width.max(1) as u32
            || cropped.height() != window.height.max(1) as u32
        {
            image::imageops::resize(
                &cropped,
                window.width.max(1) as u32,
                window.height.max(1) as u32,
                image::imageops::FilterType::Lanczos3,
            )
        } else {
            cropped
        };
        let mut bgra = normalized.into_raw();
        for pixel in bgra.as_chunks_mut::<4>().0 {
            pixel.swap(0, 2);
        }
        Ok(CaptureResult {
            frame: Frame::new(
                window.width.max(1) as u32,
                window.height.max(1) as u32,
                bgra,
            )?,
            method: "portal",
            notes: vec!["visible_region_only".into()],
        })
    }
}

fn delivered(window: &WindowInfo) -> InteractiveResult {
    InteractiveResult::delivered(
        window.clone(),
        Delivery::foreground(Route::Input)
            .with_verified(Verified::Unverified)
            .with_note("wayland_portal_fallback"),
    )
}

fn portal_error(context: &str, error: impl std::fmt::Display) -> HelperError {
    HelperError::permission_denied(format!("Wayland portal could not {context}: {error}"))
}

fn capture_error(context: &str, error: impl std::fmt::Display) -> HelperError {
    HelperError::capture_failed(format!("Wayland portal could not {context}: {error}"))
}

fn evdev_button(button: MouseButton) -> i32 {
    match button {
        MouseButton::Left => 0x110,
        MouseButton::Right => 0x111,
        MouseButton::Middle => 0x112,
    }
}

async fn notify_button(active: &ActiveSession, button: i32, state: KeyState) -> Result<()> {
    active
        .remote_desktop
        .notify_pointer_button(
            &active.session,
            button,
            state,
            NotifyPointerButtonOptions::default(),
        )
        .await
        .map_err(|error| portal_error("send pointer button input", error))
}

fn stream_point(streams: &[Stream], screen_x: f64, screen_y: f64) -> Option<(u32, f64, f64)> {
    streams.iter().find_map(|stream| {
        let (x, y) = stream.position().unwrap_or_default();
        let (width, height) = stream.size()?;
        let relative_x = screen_x - f64::from(x);
        let relative_y = screen_y - f64::from(y);
        (relative_x >= 0.0
            && relative_y >= 0.0
            && relative_x < f64::from(width)
            && relative_y < f64::from(height))
        .then_some((stream.pipe_wire_node_id(), relative_x, relative_y))
    })
}

async fn move_pointer(
    active: &ActiveSession,
    window: &WindowInfo,
    frame_x: f64,
    frame_y: f64,
) -> Result<()> {
    let screen_x = f64::from(window.x) + frame_x;
    let screen_y = f64::from(window.y) + frame_y;
    let Some((stream, x, y)) = stream_point(&active.streams, screen_x, screen_y) else {
        return Err(HelperError::permission_denied(
            "The target coordinate is outside the monitors shared through the Wayland portal.",
        ));
    };
    active
        .remote_desktop
        .notify_pointer_motion_absolute(
            &active.session,
            stream,
            x,
            y,
            NotifyPointerMotionAbsoluteOptions::default(),
        )
        .await
        .map_err(|error| portal_error("move the pointer", error))
}

async fn notify_key(active: &ActiveSession, keysym: u32, state: KeyState) -> Result<()> {
    let keysym = i32::try_from(keysym)
        .map_err(|_| HelperError::invalid_input(format!("keysym 0x{keysym:x} is out of range")))?;
    active
        .remote_desktop
        .notify_keyboard_keysym(
            &active.session,
            keysym,
            state,
            NotifyKeyboardKeysymOptions::default(),
        )
        .await
        .map_err(|error| portal_error("send keyboard input", error))
}

async fn send_chord(active: &ActiveSession, chord: &Chord, cancel: &CancelToken) -> Result<()> {
    let modifiers = modifier_keysyms(chord.modifiers);
    let mut pressed = Vec::new();
    let mut result = Ok(());
    for keysym in &modifiers {
        if let Err(error) = notify_key(active, *keysym, KeyState::Pressed).await {
            result = Err(error);
            break;
        }
        pressed.push(*keysym);
    }
    if result.is_ok() {
        for token in &chord.keys {
            if let Err(error) = cancel.check() {
                result = Err(error);
                break;
            }
            let keysym = keysym_for_token(*token);
            let pressed = notify_key(active, keysym, KeyState::Pressed).await;
            let released = notify_key(active, keysym, KeyState::Released).await;
            if let Err(error) = pressed {
                result = Err(error);
                break;
            }
            if let Err(error) = released {
                result = Err(error);
                break;
            }
        }
    }
    for keysym in pressed.into_iter().rev() {
        if let Err(error) = notify_key(active, keysym, KeyState::Released).await
            && result.is_ok()
        {
            result = Err(error);
        }
    }
    result
}

fn file_uri_path(uri: &str) -> Result<PathBuf> {
    let encoded = uri
        .strip_prefix("file://")
        .ok_or_else(|| HelperError::capture_failed("Portal screenshot URI is not a local file."))?;
    let encoded = encoded.strip_prefix("localhost").unwrap_or(encoded);
    if !encoded.starts_with('/') {
        return Err(HelperError::capture_failed(
            "Portal screenshot URI contains a remote host.",
        ));
    }
    let mut bytes = Vec::with_capacity(encoded.len());
    let mut index = 0;
    let raw = encoded.as_bytes();
    while index < raw.len() {
        if raw[index] == b'%' {
            if index + 2 >= raw.len() {
                return Err(HelperError::capture_failed(
                    "Portal screenshot URI contains an incomplete escape.",
                ));
            }
            let high = hex(raw[index + 1]).ok_or_else(|| {
                HelperError::capture_failed("Portal screenshot URI contains an invalid escape.")
            })?;
            let low = hex(raw[index + 2]).ok_or_else(|| {
                HelperError::capture_failed("Portal screenshot URI contains an invalid escape.")
            })?;
            bytes.push(high << 4 | low);
            index += 3;
        } else {
            bytes.push(raw[index]);
            index += 1;
        }
    }
    Ok(Path::new(&OsString::from_vec(bytes)).to_path_buf())
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_local_file_uris() {
        assert_eq!(
            file_uri_path("file:///tmp/a%20b.png").unwrap(),
            PathBuf::from("/tmp/a b.png")
        );
        assert!(file_uri_path("https://example.test/image.png").is_err());
        assert!(file_uri_path("file://server/image.png").is_err());
        assert!(file_uri_path("file:///tmp/%zz").is_err());
    }

    #[test]
    fn maps_screen_coordinates_to_portal_streams() {
        assert!(stream_point(&[], 10.0, 20.0).is_none());
    }

    #[test]
    fn maps_evdev_buttons() {
        assert_eq!(evdev_button(MouseButton::Left), 0x110);
        assert_eq!(evdev_button(MouseButton::Right), 0x111);
        assert_eq!(evdev_button(MouseButton::Middle), 0x112);
    }
}
