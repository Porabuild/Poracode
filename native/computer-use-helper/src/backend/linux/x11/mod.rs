use std::fs;

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{Atom, AtomEnum, ConnectionExt as _, MapState, Window, WindowClass};
use x11rb::rust_connection::RustConnection;

use crate::protocol::window::{WindowInfo, WindowRef, WindowSource};
use crate::protocol::{HelperError, Result};

pub mod capture;
pub mod input;

use super::is_computer_use_overlay_title;

#[derive(Clone, Copy)]
pub struct Atoms {
    pub active_window: Atom,
    pub client_list_stacking: Atom,
    pub frame_extents: Atom,
    pub net_wm_name: Atom,
    pub net_wm_pid: Atom,
    pub net_wm_state: Atom,
    pub net_wm_state_hidden: Atom,
    pub utf8_string: Atom,
    pub wm_class: Atom,
    pub wm_name: Atom,
    pub wm_state: Atom,
}

pub struct Context {
    pub connection: RustConnection,
    pub root: Window,
    pub screen_number: usize,
    pub atoms: Atoms,
}

#[derive(Clone)]
pub struct ResolvedWindow {
    pub info: WindowInfo,
    pub client: Window,
    pub frame: Window,
    pub client_offset_x: i32,
    pub client_offset_y: i32,
}

fn x_error(context: &str, error: impl std::fmt::Display) -> HelperError {
    HelperError::internal(format!("X11 {context}: {error}"))
}

fn intern(connection: &RustConnection, name: &[u8]) -> Result<Atom> {
    connection
        .intern_atom(false, name)
        .map_err(|error| x_error("intern atom", error))?
        .reply()
        .map(|reply| reply.atom)
        .map_err(|error| x_error("intern atom reply", error))
}

pub fn connect() -> Result<Context> {
    let (connection, screen_number) =
        x11rb::connect(None).map_err(|error| x_error("connect failed (check DISPLAY)", error))?;
    let root = connection.setup().roots[screen_number].root;
    let atoms = Atoms {
        active_window: intern(&connection, b"_NET_ACTIVE_WINDOW")?,
        client_list_stacking: intern(&connection, b"_NET_CLIENT_LIST_STACKING")?,
        frame_extents: intern(&connection, b"_NET_FRAME_EXTENTS")?,
        net_wm_name: intern(&connection, b"_NET_WM_NAME")?,
        net_wm_pid: intern(&connection, b"_NET_WM_PID")?,
        net_wm_state: intern(&connection, b"_NET_WM_STATE")?,
        net_wm_state_hidden: intern(&connection, b"_NET_WM_STATE_HIDDEN")?,
        utf8_string: intern(&connection, b"UTF8_STRING")?,
        wm_class: intern(&connection, b"WM_CLASS")?,
        wm_name: intern(&connection, b"WM_NAME")?,
        wm_state: intern(&connection, b"WM_STATE")?,
    };
    Ok(Context {
        connection,
        root,
        screen_number,
        atoms,
    })
}

pub fn available() -> bool {
    std::env::var_os("DISPLAY").is_some() && x11rb::connect(None).is_ok()
}

pub fn desktop_bounds() -> Result<(i32, i32, i32, i32)> {
    let context = connect()?;
    let screen = &context.connection.setup().roots[context.screen_number];
    Ok((
        0,
        0,
        i32::from(screen.width_in_pixels),
        i32::from(screen.height_in_pixels),
    ))
}

fn property32(context: &Context, window: Window, property: Atom, type_: Atom) -> Vec<u32> {
    context
        .connection
        .get_property(false, window, property, type_, 0, u32::MAX)
        .ok()
        .and_then(|cookie| cookie.reply().ok())
        .and_then(|reply| reply.value32().map(Iterator::collect))
        .unwrap_or_default()
}

fn property_string(context: &Context, window: Window, property: Atom, type_: Atom) -> String {
    context
        .connection
        .get_property(false, window, property, type_, 0, u32::MAX)
        .ok()
        .and_then(|cookie| cookie.reply().ok())
        .map(|reply| {
            String::from_utf8_lossy(&reply.value)
                .trim_matches('\0')
                .trim()
                .to_string()
        })
        .unwrap_or_default()
}

fn title(context: &Context, window: Window) -> String {
    let utf8 = property_string(
        context,
        window,
        context.atoms.net_wm_name,
        context.atoms.utf8_string,
    );
    if utf8.is_empty() {
        property_string(
            context,
            window,
            context.atoms.wm_name,
            AtomEnum::STRING.into(),
        )
    } else {
        utf8
    }
}

fn window_class(context: &Context, window: Window) -> String {
    let value = property_string(
        context,
        window,
        context.atoms.wm_class,
        AtomEnum::STRING.into(),
    );
    value
        .split('\0')
        .rfind(|part| !part.is_empty())
        .unwrap_or(&value)
        .to_string()
}

fn process_path(pid: Option<u32>, fallback: &str) -> String {
    pid.and_then(|pid| fs::read_link(format!("/proc/{pid}/exe")).ok())
        .map(|path| path.to_string_lossy().into_owned())
        .filter(|path| !path.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn top_level_frame(context: &Context, client: Window) -> Window {
    let mut current = client;
    for _ in 0..32 {
        let Ok(cookie) = context.connection.query_tree(current) else {
            break;
        };
        let Ok(tree) = cookie.reply() else {
            break;
        };
        if tree.parent == context.root || tree.parent == 0 || tree.parent == current {
            break;
        }
        current = tree.parent;
    }
    current
}

fn client_in_frame(context: &Context, frame: Window) -> Window {
    let mut pending = vec![frame];
    let mut visited = 0usize;
    while let Some(window) = pending.pop() {
        if !property32(
            context,
            window,
            context.atoms.wm_state,
            context.atoms.wm_state,
        )
        .is_empty()
        {
            return window;
        }
        visited += 1;
        if visited >= 256 {
            break;
        }
        if let Ok(cookie) = context.connection.query_tree(window)
            && let Ok(tree) = cookie.reply()
        {
            pending.extend(tree.children);
        }
    }
    frame
}

fn resolve_one(context: &Context, client: Window) -> Option<ResolvedWindow> {
    let attributes = context
        .connection
        .get_window_attributes(client)
        .ok()?
        .reply()
        .ok()?;
    if attributes.class == WindowClass::INPUT_ONLY {
        return None;
    }
    let states = property32(
        context,
        client,
        context.atoms.net_wm_state,
        AtomEnum::ATOM.into(),
    );
    let minimized = states.contains(&context.atoms.net_wm_state_hidden)
        || attributes.map_state != MapState::VIEWABLE;
    if attributes.map_state != MapState::VIEWABLE && !minimized {
        return None;
    }

    let frame = top_level_frame(context, client);
    let frame_geometry = context.connection.get_geometry(frame).ok()?.reply().ok()?;
    if frame_geometry.width == 0 || frame_geometry.height == 0 {
        return None;
    }
    let frame_position = context
        .connection
        .translate_coordinates(frame, context.root, 0, 0)
        .ok()?
        .reply()
        .ok()?;
    let client_position = context
        .connection
        .translate_coordinates(client, context.root, 0, 0)
        .ok()?
        .reply()
        .ok()?;

    let extents = property32(
        context,
        client,
        context.atoms.frame_extents,
        AtomEnum::CARDINAL.into(),
    );
    let client_geometry = context.connection.get_geometry(client).ok()?.reply().ok()?;
    let (x, y, width, height, offset_x, offset_y) = if extents.len() >= 4 {
        let left = i32::try_from(extents[0]).ok()?;
        let right = i32::try_from(extents[1]).ok()?;
        let top = i32::try_from(extents[2]).ok()?;
        let bottom = i32::try_from(extents[3]).ok()?;
        (
            i32::from(client_position.dst_x) - left,
            i32::from(client_position.dst_y) - top,
            i32::from(client_geometry.width) + left + right,
            i32::from(client_geometry.height) + top + bottom,
            left,
            top,
        )
    } else {
        (
            i32::from(frame_position.dst_x),
            i32::from(frame_position.dst_y),
            i32::from(frame_geometry.width),
            i32::from(frame_geometry.height),
            i32::from(client_position.dst_x) - i32::from(frame_position.dst_x),
            i32::from(client_position.dst_y) - i32::from(frame_position.dst_y),
        )
    };

    let pid = property32(
        context,
        client,
        context.atoms.net_wm_pid,
        AtomEnum::CARDINAL.into(),
    )
    .first()
    .copied();
    let display_name = window_class(context, client);
    let window_title = title(context, client);
    if is_computer_use_overlay_title(&window_title) {
        return None;
    }
    let app = process_path(
        pid,
        if display_name.is_empty() {
            &window_title
        } else {
            &display_name
        },
    );
    if app.is_empty() && window_title.is_empty() {
        return None;
    }
    Some(ResolvedWindow {
        info: WindowInfo {
            app,
            id: i64::from(client),
            title: window_title,
            x,
            y,
            width,
            height,
            pid,
            display_name: (!display_name.is_empty()).then_some(display_name),
            minimized: Some(minimized),
            source: Some(WindowSource::X11),
        },
        client,
        frame,
        client_offset_x: offset_x,
        client_offset_y: offset_y,
    })
}

pub fn resolved_windows() -> Result<Vec<ResolvedWindow>> {
    let context = connect()?;
    let mut ids = property32(
        &context,
        context.root,
        context.atoms.client_list_stacking,
        AtomEnum::WINDOW.into(),
    );
    if ids.is_empty() {
        ids = context
            .connection
            .query_tree(context.root)
            .map_err(|error| x_error("query root tree", error))?
            .reply()
            .map_err(|error| x_error("query root tree reply", error))?
            .children
            .into_iter()
            .map(|frame| client_in_frame(&context, frame))
            .collect();
    } else {
        ids.reverse();
    }
    let mut windows = Vec::new();
    for id in ids {
        if let Some(window) = resolve_one(&context, id)
            && !windows
                .iter()
                .any(|existing: &ResolvedWindow| existing.client == window.client)
        {
            windows.push(window);
        }
    }
    Ok(windows)
}

pub fn list_windows() -> Result<Vec<WindowInfo>> {
    Ok(resolved_windows()?
        .into_iter()
        .map(|window| window.info)
        .collect())
}

pub fn resolve(window: &WindowRef) -> Result<ResolvedWindow> {
    let windows = resolved_windows()?;
    if let Some(exact) = windows.iter().find(|candidate| {
        candidate.info.id == window.id && candidate.info.matches_app(window.app.as_deref())
    }) {
        return Ok(exact.clone());
    }
    let mut matches = windows
        .into_iter()
        .filter(|candidate| candidate.info.matches_app(window.app.as_deref()))
        .filter(|candidate| {
            window
                .title
                .as_deref()
                .map(str::trim)
                .filter(|title| !title.is_empty())
                .is_none_or(|title| candidate.info.title.contains(title))
        })
        .collect::<Vec<_>>();
    matches.sort_by_key(|candidate| std::cmp::Reverse(candidate.info.area()));
    matches
        .into_iter()
        .next()
        .ok_or_else(HelperError::window_unavailable)
}

#[cfg(test)]
mod tests {
    use super::is_computer_use_overlay_title;

    #[test]
    fn overlay_exclusion_uses_the_exact_title_marker() {
        assert!(is_computer_use_overlay_title(
            "Poracode Computer Use Overlay"
        ));
        assert!(!is_computer_use_overlay_title("Computer Use Overlay"));
        assert!(!is_computer_use_overlay_title(
            "Poracode Computer Use Overlay - app"
        ));
    }
}
