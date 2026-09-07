//! Window identity as it travels over the wire.

use serde::{Deserialize, Deserializer, Serialize};

/// The window object an agent sends back to us. Field names are the JSON
/// contract shared with `src/main/computer-use/mcp/types.ts`; extra fields are
/// tolerated because the TypeScript side forwards whatever it received.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct WindowRef {
    #[serde(default)]
    pub app: Option<String>,
    #[serde(deserialize_with = "deserialize_id")]
    pub id: i64,
    #[serde(default)]
    pub title: Option<String>,
}

fn deserialize_id<'de, D: Deserializer<'de>>(deserializer: D) -> Result<i64, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_f64().map(|f| f as i64))
            .ok_or_else(|| serde::de::Error::custom("window.id must be an integer")),
        serde_json::Value::String(text) => text
            .trim()
            .parse::<i64>()
            .map_err(|_| serde::de::Error::custom("window.id must be an integer")),
        _ => Err(serde::de::Error::custom("window.id must be an integer")),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowSource {
    Win32,
    Cg,
    X11,
    Atspi,
}

/// Fully resolved window returned by every action. Geometry is the window
/// FRAME (title bar included) in the platform's screen coordinate space; the
/// frame's top-left is pixel (0,0) of a `get_window_state` screenshot.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WindowInfo {
    pub app: String,
    pub id: i64,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(
        default,
        rename = "displayName",
        skip_serializing_if = "Option::is_none"
    )]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minimized: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<WindowSource>,
}

impl WindowInfo {
    /// Frame geometry only. Comparing frames detects that a freshly launched
    /// window has stopped animating.
    pub fn frame(&self) -> (i32, i32, i32, i32) {
        (self.x, self.y, self.width, self.height)
    }

    pub fn area(&self) -> i64 {
        i64::from(self.width.max(0)) * i64::from(self.height.max(0))
    }

    /// Leaf name used for app matching (`C:\Apps\Foo.exe` → `Foo`).
    pub fn app_leaf(&self) -> String {
        app_leaf(&self.app)
    }

    /// Parity with the PowerShell `Window-MatchesApp`: exact app match, or the
    /// leaf of the wanted app matches our display name or our app leaf.
    pub fn matches_app(&self, wanted: Option<&str>) -> bool {
        let Some(wanted) = wanted.map(str::trim).filter(|w| !w.is_empty()) else {
            return true;
        };
        if self.app.eq_ignore_ascii_case(wanted) {
            return true;
        }
        let wanted_leaf = app_leaf(wanted);
        if wanted_leaf.is_empty() {
            return false;
        }
        if let Some(display) = &self.display_name
            && display.eq_ignore_ascii_case(&wanted_leaf)
        {
            return true;
        }
        self.app_leaf().eq_ignore_ascii_case(&wanted_leaf)
    }
}

pub fn app_leaf(app: &str) -> String {
    let file = app.rsplit(['\\', '/']).next().unwrap_or(app);
    match file.rfind('.') {
        Some(index) if index > 0 => file[..index].to_string(),
        _ => file.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(app: &str, display: Option<&str>) -> WindowInfo {
        WindowInfo {
            app: app.into(),
            id: 1,
            title: "t".into(),
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            pid: None,
            display_name: display.map(String::from),
            minimized: None,
            source: None,
        }
    }

    #[test]
    fn window_ref_accepts_string_ids_and_extra_fields() {
        let parsed: WindowRef =
            serde_json::from_str(r#"{"app":"notepad","id":"42","title":"x","width":3}"#).unwrap();
        assert_eq!(parsed.id, 42);
        assert_eq!(parsed.app.as_deref(), Some("notepad"));
    }

    #[test]
    fn window_info_uses_the_typescript_display_name_field() {
        let value = serde_json::to_value(window("notepad", Some("Notepad"))).unwrap();
        assert_eq!(value["displayName"], "Notepad");
        assert!(value.get("display_name").is_none());

        let parsed: WindowInfo = serde_json::from_value(value).unwrap();
        assert_eq!(parsed.display_name.as_deref(), Some("Notepad"));
    }

    #[test]
    fn app_matching_uses_leaf_names() {
        let w = window(r"C:\Windows\notepad.exe", Some("notepad"));
        assert!(w.matches_app(None));
        assert!(w.matches_app(Some(r"c:\windows\NOTEPAD.EXE")));
        assert!(w.matches_app(Some("Notepad")));
        assert!(w.matches_app(Some("notepad.exe")));
        assert!(!w.matches_app(Some("calc")));
    }
}
