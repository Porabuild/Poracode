use crate::protocol::keys::{KeyToken, Modifiers, NamedKey};

pub(super) fn keysym_for_token(token: KeyToken) -> u32 {
    match token {
        KeyToken::Char(character) => xkeysym::Keysym::from_char(character).raw(),
        KeyToken::Named(key) => match key {
            NamedKey::Return => xkeysym::key::Return,
            NamedKey::Tab => xkeysym::key::Tab,
            NamedKey::Escape => xkeysym::key::Escape,
            NamedKey::Space => xkeysym::key::space,
            NamedKey::Backspace => xkeysym::key::BackSpace,
            NamedKey::Delete => xkeysym::key::Delete,
            NamedKey::Insert => xkeysym::key::Insert,
            NamedKey::CapsLock => xkeysym::key::Caps_Lock,
            NamedKey::Left => xkeysym::key::Left,
            NamedKey::Up => xkeysym::key::Up,
            NamedKey::Right => xkeysym::key::Right,
            NamedKey::Down => xkeysym::key::Down,
            NamedKey::Home => xkeysym::key::Home,
            NamedKey::End => xkeysym::key::End,
            NamedKey::PageUp => xkeysym::key::Page_Up,
            NamedKey::PageDown => xkeysym::key::Page_Down,
            NamedKey::Period => xkeysym::key::period,
            NamedKey::Comma => xkeysym::key::comma,
            NamedKey::Slash => xkeysym::key::slash,
            NamedKey::Minus => xkeysym::key::minus,
            NamedKey::Plus => xkeysym::key::plus,
            NamedKey::Function(number) => xkeysym::key::F1 + u32::from(number - 1),
            NamedKey::Numpad(number) => xkeysym::key::KP_0 + u32::from(number),
        },
    }
}

pub(super) fn modifier_keysyms(modifiers: Modifiers) -> Vec<u32> {
    let mut keysyms = Vec::new();
    if modifiers.control {
        keysyms.push(xkeysym::key::Control_L);
    }
    if modifiers.shift {
        keysyms.push(xkeysym::key::Shift_L);
    }
    if modifiers.alt {
        keysyms.push(xkeysym::key::Alt_L);
    }
    if modifiers.meta {
        keysyms.push(xkeysym::key::Super_L);
    }
    keysyms
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_all_named_key_groups_and_characters() {
        let fixed = [
            (NamedKey::Return, xkeysym::key::Return),
            (NamedKey::Tab, xkeysym::key::Tab),
            (NamedKey::Escape, xkeysym::key::Escape),
            (NamedKey::Space, xkeysym::key::space),
            (NamedKey::Backspace, xkeysym::key::BackSpace),
            (NamedKey::Delete, xkeysym::key::Delete),
            (NamedKey::Insert, xkeysym::key::Insert),
            (NamedKey::CapsLock, xkeysym::key::Caps_Lock),
            (NamedKey::Left, xkeysym::key::Left),
            (NamedKey::Up, xkeysym::key::Up),
            (NamedKey::Right, xkeysym::key::Right),
            (NamedKey::Down, xkeysym::key::Down),
            (NamedKey::Home, xkeysym::key::Home),
            (NamedKey::End, xkeysym::key::End),
            (NamedKey::PageUp, xkeysym::key::Page_Up),
            (NamedKey::PageDown, xkeysym::key::Page_Down),
            (NamedKey::Period, xkeysym::key::period),
            (NamedKey::Comma, xkeysym::key::comma),
            (NamedKey::Slash, xkeysym::key::slash),
            (NamedKey::Minus, xkeysym::key::minus),
            (NamedKey::Plus, xkeysym::key::plus),
        ];
        for (key, expected) in fixed {
            assert_eq!(keysym_for_token(KeyToken::Named(key)), expected);
        }
        assert_eq!(
            keysym_for_token(KeyToken::Named(NamedKey::Function(24))),
            xkeysym::key::F1 + 23
        );
        assert_eq!(
            keysym_for_token(KeyToken::Named(NamedKey::Numpad(9))),
            xkeysym::key::KP_0 + 9
        );
        assert_eq!(
            keysym_for_token(KeyToken::Char('é')),
            xkeysym::Keysym::from_char('é').raw()
        );
    }

    #[test]
    fn maps_modifiers_in_stable_press_order() {
        assert_eq!(
            modifier_keysyms(Modifiers {
                control: true,
                shift: true,
                alt: true,
                meta: true,
            }),
            vec![
                xkeysym::key::Control_L,
                xkeysym::key::Shift_L,
                xkeysym::key::Alt_L,
                xkeysym::key::Super_L,
            ]
        );
    }
}
