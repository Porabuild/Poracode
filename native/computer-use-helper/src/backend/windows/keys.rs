use windows::Win32::UI::Input::KeyboardAndMouse::{VIRTUAL_KEY, VkKeyScanW};

use crate::protocol::keys::{Chord, KeyToken, Modifiers, NamedKey};
use crate::protocol::{HelperError, Result};

pub const VK_SHIFT_CODE: VIRTUAL_KEY = VIRTUAL_KEY(0x10);
pub const VK_CONTROL_CODE: VIRTUAL_KEY = VIRTUAL_KEY(0x11);
pub const VK_MENU_CODE: VIRTUAL_KEY = VIRTUAL_KEY(0x12);
pub const VK_LWIN_CODE: VIRTUAL_KEY = VIRTUAL_KEY(0x5b);

pub struct VirtualChord {
    pub modifiers: Vec<VIRTUAL_KEY>,
    pub keys: Vec<VIRTUAL_KEY>,
}

fn named_virtual_key(key: NamedKey) -> VIRTUAL_KEY {
    use NamedKey::*;
    let code = match key {
        Return => 0x0d,
        Tab => 0x09,
        Escape => 0x1b,
        Space => 0x20,
        Backspace => 0x08,
        Delete => 0x2e,
        Insert => 0x2d,
        CapsLock => 0x14,
        Left => 0x25,
        Up => 0x26,
        Right => 0x27,
        Down => 0x28,
        Home => 0x24,
        End => 0x23,
        PageUp => 0x21,
        PageDown => 0x22,
        Period => 0xbe,
        Comma => 0xbc,
        Slash => 0xbf,
        Minus => 0xbd,
        Plus => 0xbb,
        Function(number) => 0x70 + u16::from(number - 1),
        Numpad(number) => 0x60 + u16::from(number),
    };
    VIRTUAL_KEY(code)
}

fn push_modifier(modifiers: &mut Vec<VIRTUAL_KEY>, key: VIRTUAL_KEY) {
    if !modifiers.contains(&key) {
        modifiers.push(key);
    }
}

fn add_declared_modifiers(out: &mut Vec<VIRTUAL_KEY>, modifiers: Modifiers) {
    if modifiers.control {
        push_modifier(out, VK_CONTROL_CODE);
    }
    if modifiers.shift {
        push_modifier(out, VK_SHIFT_CODE);
    }
    if modifiers.alt {
        push_modifier(out, VK_MENU_CODE);
    }
    if modifiers.meta {
        push_modifier(out, VK_LWIN_CODE);
    }
}

pub fn to_virtual_chord(chord: &Chord) -> Result<VirtualChord> {
    let mut modifiers = Vec::new();
    add_declared_modifiers(&mut modifiers, chord.modifiers);
    let mut keys = Vec::with_capacity(chord.keys.len());
    for key in &chord.keys {
        match key {
            KeyToken::Named(key) => keys.push(named_virtual_key(*key)),
            KeyToken::Char(character) => {
                let mut utf16 = [0u16; 2];
                let encoded = character.encode_utf16(&mut utf16);
                if encoded.len() != 1 {
                    return Err(HelperError::invalid_input(format!(
                        "Unsupported key: {character}"
                    )));
                }
                // SAFETY: VkKeyScanW reads only the supplied UTF-16 code unit.
                let mapped = unsafe { VkKeyScanW(encoded[0]) };
                if mapped == -1 {
                    return Err(HelperError::invalid_input(format!(
                        "Unsupported key: {character}"
                    )));
                }
                let flags = ((mapped as u16) >> 8) as u8;
                if flags & 1 != 0 {
                    push_modifier(&mut modifiers, VK_SHIFT_CODE);
                }
                if flags & 2 != 0 {
                    push_modifier(&mut modifiers, VK_CONTROL_CODE);
                }
                if flags & 4 != 0 {
                    push_modifier(&mut modifiers, VK_MENU_CODE);
                }
                keys.push(VIRTUAL_KEY(mapped as u16 & 0xff));
            }
        }
    }
    Ok(VirtualChord { modifiers, keys })
}
