//! Portable JSON Schema pattern sanitizer and ECMA-262 `/u` regular expression
//! syntax validator, ported from `src/supervisor/mcp/portableSchemaPatterns.ts`.
//!
//! Model gateways validate JSON Schema `pattern` fields as Unicode regular
//! expressions (`RegExp(pattern, "u")`). Malformed patterns (such as Annex B
//! unescaped `]` outside character classes) are omitted from the advertised
//! schema while leaving user data (`default`, `examples`, or a property named
//! `pattern`) untouched.

use serde_json::Value;
use std::collections::HashSet;

const MAX_REGEX_NESTING: usize = 512;

const OBJECT_MAP_SCHEMA_KEYS: &[&str] = &[
    "properties",
    "patternProperties",
    "$defs",
    "definitions",
    "dependentSchemas",
];

const ARRAY_SCHEMA_KEYS: &[&str] = &["allOf", "anyOf", "oneOf", "prefixItems"];

const SINGLE_OR_ARRAY_SCHEMA_KEYS: &[&str] = &[
    "items",
    "additionalItems",
    "additionalProperties",
    "unevaluatedItems",
    "unevaluatedProperties",
    "contains",
    "propertyNames",
    "not",
    "if",
    "then",
    "else",
];

/// Walks JSON Schema positions in `schema` and removes any `pattern` string
/// that is not a valid ECMA-262 Unicode (`u`-flag) regular expression.
pub fn omit_invalid_schema_patterns(schema: &Value) -> Value {
    let Value::Object(source) = schema else {
        return schema.clone();
    };
    let mut result = source.clone();
    if let Some(Value::String(pattern)) = result.get("pattern")
        && !is_valid_ecma_unicode_regex(pattern)
    {
        result.shift_remove("pattern");
    }

    for key in OBJECT_MAP_SCHEMA_KEYS {
        if let Some(Value::Object(children)) = result.get(*key).cloned() {
            let mut mapped = serde_json::Map::with_capacity(children.len());
            for (name, child) in children {
                mapped.insert(name, omit_invalid_schema_patterns(&child));
            }
            result.insert((*key).to_string(), Value::Object(mapped));
        }
    }

    for key in ARRAY_SCHEMA_KEYS {
        if let Some(Value::Array(items)) = result.get(*key).cloned() {
            let mapped = items.iter().map(omit_invalid_schema_patterns).collect();
            result.insert((*key).to_string(), Value::Array(mapped));
        }
    }

    for key in SINGLE_OR_ARRAY_SCHEMA_KEYS {
        if let Some(value) = result.get(*key).cloned() {
            let transformed = match value {
                Value::Array(items) => {
                    Value::Array(items.iter().map(omit_invalid_schema_patterns).collect())
                }
                other => omit_invalid_schema_patterns(&other),
            };
            result.insert((*key).to_string(), transformed);
        }
    }

    Value::Object(result)
}

/// Validates `pattern` against ECMA-262 `Pattern[+Unicode, ~UnicodeSets]`
/// (`new RegExp(pattern, "u")`).
pub fn is_valid_ecma_unicode_regex(pattern: &str) -> bool {
    let chars: Vec<char> = pattern.chars().collect();
    let mut parser = UnicodeRegexParser {
        chars: &chars,
        pos: 0,
        capturing_groups: 0,
        defined_names: HashSet::new(),
        backref_numbers: Vec::new(),
        backref_names: Vec::new(),
    };
    let mut top_names = HashSet::new();
    if !parser.parse_disjunction(0, &mut top_names) || parser.pos != chars.len() {
        return false;
    }
    for num in &parser.backref_numbers {
        if *num == 0 || *num > parser.capturing_groups {
            return false;
        }
    }
    for name in &parser.backref_names {
        if !parser.defined_names.contains(name) {
            return false;
        }
    }
    true
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ClassAtomKind {
    Char(u32),
    Set,
}

struct UnicodeRegexParser<'a> {
    chars: &'a [char],
    pos: usize,
    capturing_groups: u32,
    defined_names: HashSet<String>,
    backref_numbers: Vec<u32>,
    backref_names: Vec<String>,
}

impl<'a> UnicodeRegexParser<'a> {
    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn next_char(&mut self) -> Option<char> {
        let ch = self.peek()?;
        self.pos += 1;
        Some(ch)
    }

    /// `Disjunction` — alternatives share duplicate-group-name allowance across
    /// `|` branches (ES2025), while duplicate names within the same alternative
    /// path remain a SyntaxError.
    fn parse_disjunction(&mut self, depth: usize, names_out: &mut HashSet<String>) -> bool {
        if depth > MAX_REGEX_NESTING {
            return false;
        }
        loop {
            let mut branch_names = HashSet::new();
            if !self.parse_alternative(depth, &mut branch_names) {
                return false;
            }
            for name in branch_names {
                names_out.insert(name);
            }
            if self.peek() == Some('|') {
                self.pos += 1;
            } else {
                break;
            }
        }
        true
    }

    fn parse_alternative(&mut self, depth: usize, active_names: &mut HashSet<String>) -> bool {
        while let Some(ch) = self.peek() {
            if ch == '|' || ch == ')' {
                break;
            }
            let is_atom = match ch {
                '^' | '$' => {
                    self.pos += 1;
                    false
                }
                '.' => {
                    self.pos += 1;
                    true
                }
                '*' | '+' | '?' | '{' | '}' | ']' => {
                    return false;
                }
                '[' => {
                    if !self.parse_character_class() {
                        return false;
                    }
                    true
                }
                '(' => match self.parse_group(depth + 1, active_names) {
                    Some(quantifiable) => quantifiable,
                    None => return false,
                },
                '\\' => {
                    self.pos += 1;
                    match self.parse_atom_or_assertion_escape() {
                        Some(quantifiable) => quantifiable,
                        None => return false,
                    }
                }
                _ => {
                    self.pos += 1;
                    true
                }
            };

            if self.has_quantifier_prefix() && (!is_atom || !self.parse_quantifier()) {
                return false;
            }
        }
        true
    }

    fn has_quantifier_prefix(&self) -> bool {
        matches!(self.peek(), Some('*' | '+' | '?' | '{'))
    }

    fn parse_quantifier(&mut self) -> bool {
        match self.next_char() {
            Some('*' | '+' | '?') => {}
            Some('{') => {
                let Some(min) = self.parse_decimal_u32() else {
                    return false;
                };
                if self.peek() == Some(',') {
                    self.pos += 1;
                    if self.peek() != Some('}') {
                        let Some(max) = self.parse_decimal_u32() else {
                            return false;
                        };
                        if min > max {
                            return false;
                        }
                    }
                }
                if self.next_char() != Some('}') {
                    return false;
                }
            }
            _ => return false,
        }
        if self.peek() == Some('?') {
            self.pos += 1;
        }
        true
    }

    fn parse_decimal_u32(&mut self) -> Option<u32> {
        let start = self.pos;
        let mut value: u32 = 0;
        while let Some(ch) = self.peek() {
            let Some(digit) = ch.to_digit(10) else {
                break;
            };
            self.pos += 1;
            value = value.saturating_mul(10).saturating_add(digit);
        }
        (self.pos > start).then_some(value)
    }

    /// Returns `Some(true)` for a quantifiable group, `Some(false)` for a
    /// lookaround assertion (never quantifiable in `/u`), or `None` on syntax error.
    fn parse_group(&mut self, depth: usize, active_names: &mut HashSet<String>) -> Option<bool> {
        if depth > MAX_REGEX_NESTING || self.next_char() != Some('(') {
            return None;
        }
        let mut quantifiable = true;
        let mut group_names = HashSet::new();
        if self.peek() == Some('?') {
            self.pos += 1;
            match self.peek()? {
                ':' => {
                    self.pos += 1;
                }
                '=' | '!' => {
                    self.pos += 1;
                    quantifiable = false;
                }
                '<' => {
                    self.pos += 1;
                    match self.peek()? {
                        '=' | '!' => {
                            self.pos += 1;
                            quantifiable = false;
                        }
                        _ => {
                            let name = self.parse_group_name()?;
                            if active_names.contains(&name) {
                                return None;
                            }
                            self.capturing_groups = self.capturing_groups.saturating_add(1);
                            self.defined_names.insert(name.clone());
                            active_names.insert(name);
                        }
                    }
                }
                'i' | 'm' | 's' | '-' => {
                    if !self.parse_modifier_specifier() {
                        return None;
                    }
                }
                _ => return None,
            }
        } else {
            self.capturing_groups = self.capturing_groups.saturating_add(1);
        }

        if !self.parse_disjunction(depth, &mut group_names) {
            return None;
        }
        for name in group_names {
            if !active_names.insert(name) {
                return None;
            }
        }
        if self.next_char() != Some(')') {
            return None;
        }
        Some(quantifiable)
    }

    fn parse_modifier_specifier(&mut self) -> bool {
        let mut seen = [false; 3]; // i, m, s
        let mut pos_count = 0usize;
        let mut neg_count = 0usize;
        let mut in_neg = false;
        loop {
            match self.peek() {
                Some(':') => {
                    self.pos += 1;
                    return pos_count + neg_count > 0 && (!in_neg || neg_count > 0);
                }
                Some('-') if !in_neg => {
                    self.pos += 1;
                    in_neg = true;
                }
                Some(flag @ ('i' | 'm' | 's')) => {
                    let idx = match flag {
                        'i' => 0,
                        'm' => 1,
                        _ => 2,
                    };
                    if seen[idx] {
                        return false;
                    }
                    seen[idx] = true;
                    if in_neg {
                        neg_count += 1;
                    } else {
                        pos_count += 1;
                    }
                    self.pos += 1;
                }
                _ => return false,
            }
        }
    }

    fn parse_group_name(&mut self) -> Option<String> {
        let mut name = String::new();
        let mut first = true;
        loop {
            match self.peek()? {
                '>' => {
                    self.pos += 1;
                    return (!name.is_empty()).then_some(name);
                }
                '\\' => {
                    self.pos += 1;
                    if self.next_char() != Some('u') {
                        return None;
                    }
                    let cp = self.parse_unicode_escape_value()?;
                    let ch = char::from_u32(cp)?;
                    if !is_identifier_char(ch, first) {
                        return None;
                    }
                    name.push(ch);
                }
                ch => {
                    if !is_identifier_char(ch, first) {
                        return None;
                    }
                    self.pos += 1;
                    name.push(ch);
                }
            }
            first = false;
        }
    }

    /// Parses the sequence after `\` outside `[...]`.
    /// Returns `Some(true)` for AtomEscape, `Some(false)` for `\b` / `\B`
    /// Assertion, or `None` on invalid escape.
    fn parse_atom_or_assertion_escape(&mut self) -> Option<bool> {
        let ch = self.next_char()?;
        match ch {
            'b' | 'B' => Some(false),
            'f' | 'n' | 'r' | 't' | 'v' | 'd' | 'D' | 's' | 'S' | 'w' | 'W' => Some(true),
            'c' => match self.next_char()? {
                'a'..='z' | 'A'..='Z' => Some(true),
                _ => None,
            },
            '0' => {
                if matches!(self.peek(), Some('0'..='9')) {
                    return None;
                }
                Some(true)
            }
            '1'..='9' => {
                let mut value = ch.to_digit(10)?;
                while let Some(digit) = self.peek().and_then(|c| c.to_digit(10)) {
                    self.pos += 1;
                    value = value.saturating_mul(10).saturating_add(digit);
                }
                self.backref_numbers.push(value);
                Some(true)
            }
            'x' => {
                self.parse_hex_digits(2)?;
                Some(true)
            }
            'u' => {
                self.parse_unicode_escape_value()?;
                Some(true)
            }
            'k' => {
                if self.next_char() != Some('<') {
                    return None;
                }
                let name = self.parse_group_name()?;
                self.backref_names.push(name);
                Some(true)
            }
            'p' | 'P' => {
                if self.parse_unicode_property_escape() {
                    Some(true)
                } else {
                    None
                }
            }
            '^' | '$' | '\\' | '.' | '*' | '+' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '|'
            | '/' => Some(true),
            _ => None,
        }
    }

    fn parse_character_class(&mut self) -> bool {
        if self.next_char() != Some('[') {
            return false;
        }
        if self.peek() == Some('^') {
            self.pos += 1;
        }
        loop {
            match self.peek() {
                None => return false,
                Some(']') => {
                    self.pos += 1;
                    return true;
                }
                _ => {}
            }
            let Some(first) = self.parse_class_atom() else {
                return false;
            };
            if self.peek() == Some('-') {
                if self.chars.get(self.pos + 1) == Some(&']') {
                    // Trailing `-` before `]` is a literal `-`.
                    self.pos += 1;
                    continue;
                }
                self.pos += 1;
                let Some(second) = self.parse_class_atom() else {
                    return false;
                };
                match (first, second) {
                    (ClassAtomKind::Char(lo), ClassAtomKind::Char(hi)) if lo <= hi => {}
                    _ => return false,
                }
            }
        }
    }

    fn parse_class_atom(&mut self) -> Option<ClassAtomKind> {
        let ch = self.next_char()?;
        if ch != '\\' {
            return Some(ClassAtomKind::Char(ch as u32));
        }
        let esc = self.next_char()?;
        match esc {
            'b' => Some(ClassAtomKind::Char(0x0008)),
            'f' => Some(ClassAtomKind::Char(0x000C)),
            'n' => Some(ClassAtomKind::Char(0x000A)),
            'r' => Some(ClassAtomKind::Char(0x000D)),
            't' => Some(ClassAtomKind::Char(0x0009)),
            'v' => Some(ClassAtomKind::Char(0x000B)),
            '-' => Some(ClassAtomKind::Char('-' as u32)),
            'c' => match self.next_char()? {
                c @ ('a'..='z' | 'A'..='Z') => Some(ClassAtomKind::Char((c as u32) % 32)),
                _ => None,
            },
            '0' => {
                if matches!(self.peek(), Some('0'..='9')) {
                    return None;
                }
                Some(ClassAtomKind::Char(0))
            }
            'x' => self.parse_hex_digits(2).map(ClassAtomKind::Char),
            'u' => self.parse_unicode_escape_value().map(ClassAtomKind::Char),
            'd' | 'D' | 's' | 'S' | 'w' | 'W' => Some(ClassAtomKind::Set),
            'p' | 'P' => self
                .parse_unicode_property_escape()
                .then_some(ClassAtomKind::Set),
            '^' | '$' | '\\' | '.' | '*' | '+' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '|'
            | '/' => Some(ClassAtomKind::Char(esc as u32)),
            _ => None,
        }
    }

    fn parse_hex_digits(&mut self, count: usize) -> Option<u32> {
        let mut value = 0u32;
        for _ in 0..count {
            let digit = self.next_char()?.to_digit(16)?;
            value = (value << 4) | digit;
        }
        Some(value)
    }

    /// Parses either `HHHH` (combining surrogate pairs `\uD8xx\uDCxx` like
    /// ECMA-262 `RegExpUnicodeEscapeSequence[+Unicode]`) or `{H+}` (`<= 0x10FFFF`).
    fn parse_unicode_escape_value(&mut self) -> Option<u32> {
        if self.peek() == Some('{') {
            self.pos += 1;
            let start = self.pos;
            let mut value: u32 = 0;
            while let Some(ch) = self.peek() {
                if ch == '}' {
                    break;
                }
                let digit = ch.to_digit(16)?;
                self.pos += 1;
                value = value.checked_mul(16)?.checked_add(digit)?;
                if value > 0x10FFFF {
                    return None;
                }
            }
            if self.pos == start || self.next_char() != Some('}') {
                return None;
            }
            return Some(value);
        }
        let unit = self.parse_hex_digits(4)?;
        if (0xD800..=0xDBFF).contains(&unit)
            && self.peek() == Some('\\')
            && self.chars.get(self.pos + 1) == Some(&'u')
            && self.chars.get(self.pos + 2) != Some(&'{')
        {
            let save = self.pos;
            self.pos += 2;
            if let Some(trail) = self.parse_hex_digits(4)
                && (0xDC00..=0xDFFF).contains(&trail)
            {
                let combined = 0x10000 + ((unit - 0xD800) << 10) + (trail - 0xDC00);
                return Some(combined);
            }
            self.pos = save;
        }
        Some(unit)
    }

    fn parse_unicode_property_escape(&mut self) -> bool {
        if self.next_char() != Some('{') {
            return false;
        }
        let start = self.pos;
        while let Some(ch) = self.peek() {
            if ch == '}' {
                break;
            }
            if !(ch.is_ascii_alphanumeric() || ch == '_' || ch == '=') {
                return false;
            }
            self.pos += 1;
        }
        let end = self.pos;
        if self.next_char() != Some('}') || start == end {
            return false;
        }
        let expr: String = self.chars[start..end].iter().collect();
        is_valid_unicode_property_expression(&expr)
    }
}

fn is_identifier_char(ch: char, first: bool) -> bool {
    if ch == '$' || ch == '_' || ch.is_alphabetic() {
        return true;
    }
    !first && (ch.is_alphanumeric() || ch == '\u{200C}' || ch == '\u{200D}')
}

fn is_valid_unicode_property_expression(expr: &str) -> bool {
    if let Some((name, value)) = expr.split_once('=') {
        if value.is_empty() || value.contains('=') {
            return false;
        }
        match name {
            "General_Category" | "gc" => is_valid_general_category(value),
            "Script" | "sc" | "Script_Extensions" | "scx" => {
                value.chars().all(|c| c.is_ascii_alphabetic() || c == '_')
            }
            _ => false,
        }
    } else {
        is_valid_general_category(expr) || is_valid_unicode_binary_property(expr)
    }
}

fn is_valid_general_category(val: &str) -> bool {
    matches!(
        val,
        "C" | "Other"
            | "Cc"
            | "Control"
            | "cntrl"
            | "Cf"
            | "Format"
            | "Cn"
            | "Unassigned"
            | "Co"
            | "Private_Use"
            | "Cs"
            | "Surrogate"
            | "L"
            | "Letter"
            | "LC"
            | "Cased_Letter"
            | "Ll"
            | "Lowercase_Letter"
            | "Lm"
            | "Modifier_Letter"
            | "Lo"
            | "Other_Letter"
            | "Lt"
            | "Titlecase_Letter"
            | "Lu"
            | "Uppercase_Letter"
            | "M"
            | "Mark"
            | "Combining_Mark"
            | "Mc"
            | "Spacing_Mark"
            | "Me"
            | "Enclosing_Mark"
            | "Mn"
            | "Nonspacing_Mark"
            | "N"
            | "Number"
            | "Nd"
            | "Decimal_Number"
            | "digit"
            | "Nl"
            | "Letter_Number"
            | "No"
            | "Other_Number"
            | "P"
            | "Punctuation"
            | "punct"
            | "Pc"
            | "Connector_Punctuation"
            | "Pd"
            | "Dash_Punctuation"
            | "Pe"
            | "Close_Punctuation"
            | "Pf"
            | "Final_Punctuation"
            | "Pi"
            | "Initial_Punctuation"
            | "Po"
            | "Other_Punctuation"
            | "Ps"
            | "Open_Punctuation"
            | "S"
            | "Symbol"
            | "Sc"
            | "Currency_Symbol"
            | "Sk"
            | "Modifier_Symbol"
            | "Sm"
            | "Math_Symbol"
            | "So"
            | "Other_Symbol"
            | "Z"
            | "Separator"
            | "Zl"
            | "Line_Separator"
            | "Zp"
            | "Paragraph_Separator"
            | "Zs"
            | "Space_Separator"
    )
}

/// Binary Unicode properties supported by ECMA-262 `Pattern[+Unicode, ~UnicodeSets]`
/// (intentionally excludes `/v`-only properties of strings such as `Basic_Emoji`).
fn is_valid_unicode_binary_property(val: &str) -> bool {
    matches!(
        val,
        "ASCII"
            | "ASCII_Hex_Digit"
            | "AHex"
            | "Alphabetic"
            | "Alpha"
            | "Any"
            | "Assigned"
            | "Bidi_Control"
            | "Bidi_C"
            | "Bidi_Mirrored"
            | "Bidi_M"
            | "Case_Ignorable"
            | "CI"
            | "Cased"
            | "Changes_When_Casefolded"
            | "CWCF"
            | "Changes_When_Casemapped"
            | "CWCM"
            | "Changes_When_Lowercased"
            | "CWL"
            | "Changes_When_NFKC_Casefolded"
            | "CWKCF"
            | "Changes_When_Titlecased"
            | "CWT"
            | "Changes_When_Uppercased"
            | "CWU"
            | "Dash"
            | "Default_Ignorable_Code_Point"
            | "DI"
            | "Deprecated"
            | "Dep"
            | "Diacritic"
            | "Dia"
            | "Emoji"
            | "Emoji_Component"
            | "EComp"
            | "Emoji_Modifier"
            | "EMod"
            | "Emoji_Modifier_Base"
            | "EBase"
            | "Emoji_Presentation"
            | "EPres"
            | "Extended_Pictographic"
            | "ExtPict"
            | "Extender"
            | "Ext"
            | "Grapheme_Base"
            | "Gr_Base"
            | "Grapheme_Extend"
            | "Gr_Ext"
            | "Hex_Digit"
            | "Hex"
            | "IDS_Binary_Operator"
            | "IDSB"
            | "IDS_Trinary_Operator"
            | "IDST"
            | "IDS_Unary_Operator"
            | "IDSU"
            | "ID_Continue"
            | "IDC"
            | "ID_Start"
            | "IDS"
            | "Ideographic"
            | "Ideo"
            | "Join_Control"
            | "Join_C"
            | "Logical_Order_Exception"
            | "LOE"
            | "Lowercase"
            | "Lower"
            | "Math"
            | "Modifier_Combining_Mark"
            | "MCM"
            | "Noncharacter_Code_Point"
            | "NChar"
            | "Pattern_Syntax"
            | "Pat_Syn"
            | "Pattern_White_Space"
            | "Pat_WS"
            | "Quotation_Mark"
            | "QMark"
            | "Radical"
            | "Regional_Indicator"
            | "RI"
            | "Sentence_Terminal"
            | "STerm"
            | "Soft_Dotted"
            | "SD"
            | "Terminal_Punctuation"
            | "Term"
            | "Unified_Ideograph"
            | "UIdeo"
            | "Uppercase"
            | "Upper"
            | "Variation_Selector"
            | "VS"
            | "White_Space"
            | "space"
            | "XID_Continue"
            | "XIDC"
            | "XID_Start"
            | "XIDS"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const REJECTED_EMAIL_PATTERN: &str = r#"^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$"#;

    #[test]
    fn validates_unicode_regex_cases() {
        for valid in [
            r"^[a-z]+$",
            r"^\p{L}+",
            r"^\p{Script=Latin}+",
            r"^[a-zA-Z\-0-9]+$",
            r"^(?<word>\w+)\s+\k<word>$",
            r"^(?:(?<x>a)|(?<x>b))\k<x>$",
            r"(?i:abc)",
            r"[\u{1F600}-\u{1F64F}]",
            r"[\b-\n]",
        ] {
            assert!(
                is_valid_ecma_unicode_regex(valid),
                "expected valid regex: {valid}"
            );
        }

        for invalid in [
            "[",
            "]",
            "{",
            "}",
            r"\a",
            r"\-",
            r"\01",
            r"(a)\2",
            r"\k<missing>",
            r"(?<a>x)(?<a>y)",
            r"(?=a)*",
            r"[z-a]",
            r"[\d-z]",
            r"\p{Basic_Emoji}",
            REJECTED_EMAIL_PATTERN,
        ] {
            assert!(
                !is_valid_ecma_unicode_regex(invalid),
                "expected invalid regex: {invalid}"
            );
        }
    }

    #[test]
    fn omits_rejected_patterns_across_nested_schemas_without_touching_data() {
        let schema = json!({
            "type": "object",
            "properties": {
                "email": { "type": "string", "format": "email", "pattern": REJECTED_EMAIL_PATTERN },
                "pattern": { "type": "string", "pattern": "^[a-z]+$" },
                "contacts": {
                    "type": "array",
                    "items": { "anyOf": [{ "$ref": "#/$defs/email" }, { "type": "string", "pattern": "[" }] }
                }
            },
            "$defs": { "email": { "type": "string", "pattern": REJECTED_EMAIL_PATTERN } },
            "required": ["email"],
            "additionalProperties": false,
            "default": { "pattern": "[" },
            "examples": [{ "pattern": "[" }]
        });
        let result = omit_invalid_schema_patterns(&schema);
        assert_eq!(
            result["properties"]["email"],
            json!({ "type": "string", "format": "email" })
        );
        assert_eq!(result["$defs"]["email"], json!({ "type": "string" }));
        assert_eq!(
            result["properties"]["contacts"]["items"]["anyOf"][1],
            json!({ "type": "string" })
        );
        assert_eq!(
            result["properties"]["pattern"],
            json!({ "type": "string", "pattern": "^[a-z]+$" })
        );
        assert_eq!(result["default"], json!({ "pattern": "[" }));
        assert_eq!(result["examples"], json!([{ "pattern": "[" }]));
    }

    #[test]
    fn retains_valid_unicode_patterns_boolean_schemas_and_tuple_items() {
        let input = json!({
            "items": [false, { "pattern": "[" }],
            "not": true,
            "if": { "pattern": "[" },
            "then": { "pattern": "^\\p{L}+$" }
        });
        assert_eq!(
            omit_invalid_schema_patterns(&input),
            json!({
                "items": [false, {}],
                "not": true,
                "if": {},
                "then": { "pattern": "^\\p{L}+$" }
            })
        );
    }
}
