//! Platform-neutral key chord grammar, ported from the PowerShell helper's
//! `Resolve-Key` / `Press-Chord`: tokens separated by `+`, modifiers in any
//! order, a single base key or several, `+` itself allowed as a literal.

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Modifiers {
    pub shift: bool,
    pub control: bool,
    pub alt: bool,
    pub meta: bool,
}

impl Modifiers {
    pub fn any(&self) -> bool {
        self.shift || self.control || self.alt || self.meta
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NamedKey {
    Return,
    Tab,
    Escape,
    Space,
    Backspace,
    Delete,
    Insert,
    CapsLock,
    Left,
    Up,
    Right,
    Down,
    Home,
    End,
    PageUp,
    PageDown,
    Period,
    Comma,
    Slash,
    Minus,
    Plus,
    /// F1..F24
    Function(u8),
    /// Numpad 0..9
    Numpad(u8),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyToken {
    Named(NamedKey),
    Char(char),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Chord {
    pub modifiers: Modifiers,
    pub keys: Vec<KeyToken>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyParseError(pub String);

impl fmt::Display for KeyParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for KeyParseError {}

fn modifier_for(token: &str) -> Option<fn(&mut Modifiers)> {
    match token {
        "control" | "ctrl" | "control_l" | "control_r" => Some(|m| m.control = true),
        "shift" | "shift_l" | "shift_r" => Some(|m| m.shift = true),
        "alt" | "alt_l" | "alt_r" | "option" => Some(|m| m.alt = true),
        "win" | "super" | "meta" | "cmd" | "command" => Some(|m| m.meta = true),
        _ => None,
    }
}

pub fn named_key(token: &str) -> Option<NamedKey> {
    use NamedKey::*;
    let key = match token {
        "return" | "enter" => Return,
        "tab" => Tab,
        "escape" | "esc" => Escape,
        "space" => Space,
        "backspace" => Backspace,
        "delete" | "del" => Delete,
        "insert" | "ins" => Insert,
        "capslock" | "caps_lock" => CapsLock,
        "left" | "arrowleft" => Left,
        "up" | "arrowup" => Up,
        "right" | "arrowright" => Right,
        "down" | "arrowdown" => Down,
        "home" => Home,
        "end" => End,
        "page_up" | "pageup" | "prior" => PageUp,
        "page_down" | "pagedown" | "next" => PageDown,
        "period" => Period,
        "comma" => Comma,
        "slash" => Slash,
        "minus" => Minus,
        "plus" | "equal" => Plus,
        _ => {
            if let Some(rest) = token.strip_prefix('f')
                && let Ok(n) = rest.parse::<u8>()
                && (1..=24).contains(&n)
                && !rest.starts_with('0')
            {
                return Some(Function(n));
            }
            let numpad = token
                .strip_prefix("kp_")
                .or_else(|| token.strip_prefix("numpad_"));
            if let Some(digit) = numpad
                && digit.len() == 1
                && let Ok(n) = digit.parse::<u8>()
            {
                return Some(Numpad(n));
            }
            return None;
        }
    };
    Some(key)
}

/// Split on `+` while keeping a standalone or trailing `+` as a literal key
/// (`"+"`, `"ctrl++"`), exactly like the PowerShell implementation.
pub fn tokenize(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed == "+" {
        return vec!["+".to_string()];
    }
    let mut tokens: Vec<String> = trimmed
        .split('+')
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(String::from)
        .collect();
    if trimmed.ends_with('+') {
        tokens.push("+".to_string());
    }
    tokens
}

pub fn parse_chord(raw: &str) -> Result<Chord, KeyParseError> {
    let tokens = tokenize(raw);
    if tokens.is_empty() {
        return Err(KeyParseError("key is required".into()));
    }
    let mut modifiers = Modifiers::default();
    let mut keys = Vec::new();
    for token in &tokens {
        let lower = token.to_ascii_lowercase();
        if let Some(apply) = modifier_for(&lower) {
            apply(&mut modifiers);
            continue;
        }
        if let Some(named) = named_key(&lower) {
            keys.push(KeyToken::Named(named));
            continue;
        }
        let mut chars = token.chars();
        match (chars.next(), chars.next()) {
            (Some(c), None) => keys.push(KeyToken::Char(c)),
            _ => return Err(KeyParseError(format!("Unsupported key: {token}"))),
        }
    }
    Ok(Chord { modifiers, keys })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_modifier_chords() {
        let chord = parse_chord("Control_L+a").unwrap();
        assert!(chord.modifiers.control);
        assert_eq!(chord.keys, vec![KeyToken::Char('a')]);
        let chord = parse_chord("ctrl+shift+Escape").unwrap();
        assert!(chord.modifiers.control && chord.modifiers.shift);
        assert_eq!(chord.keys, vec![KeyToken::Named(NamedKey::Escape)]);
    }

    #[test]
    fn plus_literal_handling() {
        assert_eq!(parse_chord("+").unwrap().keys, vec![KeyToken::Char('+')]);
        let chord = parse_chord("ctrl++").unwrap();
        assert!(chord.modifiers.control);
        assert_eq!(chord.keys, vec![KeyToken::Char('+')]);
    }

    #[test]
    fn function_and_numpad_keys() {
        assert_eq!(
            parse_chord("F24").unwrap().keys,
            vec![KeyToken::Named(NamedKey::Function(24))]
        );
        assert!(parse_chord("F25").is_err());
        assert!(parse_chord("f01").is_err());
        assert_eq!(
            parse_chord("KP_0").unwrap().keys,
            vec![KeyToken::Named(NamedKey::Numpad(0))]
        );
        assert_eq!(
            parse_chord("numpad_7").unwrap().keys,
            vec![KeyToken::Named(NamedKey::Numpad(7))]
        );
    }

    #[test]
    fn modifiers_only_chord_has_no_keys() {
        let chord = parse_chord("shift").unwrap();
        assert!(chord.modifiers.shift);
        assert!(chord.keys.is_empty());
    }

    #[test]
    fn rejects_empty_and_multi_char_tokens() {
        assert!(parse_chord("").is_err());
        assert!(parse_chord("   ").is_err());
        assert!(parse_chord("hello").is_err());
    }

    #[test]
    fn mac_synonyms() {
        let chord = parse_chord("option+cmd+q").unwrap();
        assert!(chord.modifiers.alt && chord.modifiers.meta);
        assert_eq!(chord.keys, vec![KeyToken::Char('q')]);
    }
}
