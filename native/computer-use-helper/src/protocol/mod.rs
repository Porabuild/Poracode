//! NDJSON wire protocol shared with the Electron main process.
//!
//! One request per stdin line: `{ "id": <u64>, "action": <string>, "input": <object> }`.
//! One response per stdout line: `{ "id", "ok": true, "result" }` or
//! `{ "id", "ok": false, "error": <string>, "code": <ErrorCode> }`.

pub mod actions;
pub mod keys;
pub mod version;
pub mod window;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub type RequestId = u64;

#[derive(Debug, Clone, Deserialize)]
pub struct Request {
    pub id: RequestId,
    pub action: String,
    #[serde(default)]
    pub input: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidInput,
    UnknownAction,
    WindowUnavailable,
    Timeout,
    Cancelled,
    ProtocolMismatch,
    CaptureFailed,
    PermissionDenied,
    Internal,
}

/// Transport-level failure. Structured refusals (background delivery impossible,
/// etc.) are NOT errors; they ride inside an `ok: true` result. See
/// [`actions::InteractiveResult`].
#[derive(Debug, Clone, thiserror::Error)]
#[error("{message}")]
pub struct HelperError {
    pub code: ErrorCode,
    pub message: String,
}

impl HelperError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidInput, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Internal, message)
    }

    pub fn permission_denied(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::PermissionDenied, message)
    }

    pub fn capture_failed(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::CaptureFailed, message)
    }

    /// The exact wording the MCP instructions teach agents to recover from.
    pub fn window_unavailable() -> Self {
        Self::new(
            ErrorCode::WindowUnavailable,
            "Window is no longer available. Call list_windows or get_window for a fresh id and retry.",
        )
    }
}

impl From<serde_json::Error> for HelperError {
    fn from(error: serde_json::Error) -> Self {
        Self::invalid_input(error.to_string())
    }
}

pub type Result<T> = std::result::Result<T, HelperError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
    pub id: Option<RequestId>,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<ErrorCode>,
}

impl Response {
    pub fn ok(id: RequestId, result: Value) -> Self {
        Self {
            id: Some(id),
            ok: true,
            result: Some(result),
            error: None,
            code: None,
        }
    }

    pub fn err(id: Option<RequestId>, error: &HelperError) -> Self {
        Self {
            id,
            ok: false,
            result: None,
            error: Some(error.message.clone()),
            code: Some(error.code),
        }
    }

    pub fn to_line(&self) -> Vec<u8> {
        let mut line = serde_json::to_vec(self).unwrap_or_else(|_| {
            br#"{"id":null,"ok":false,"error":"failed to serialize response","code":"internal"}"#
                .to_vec()
        });
        line.push(b'\n');
        line
    }
}

/// Parse one stdin line. Malformed lines produce an `id: null` error response
/// (the TypeScript reader drops responses without a numeric id).
pub fn parse_request(line: &str) -> std::result::Result<Request, Response> {
    let trimmed = line.trim();
    serde_json::from_str::<Request>(trimmed).map_err(|error| {
        // Try to salvage the id so the caller's promise is rejected instead of hanging.
        let id = serde_json::from_str::<Value>(trimmed)
            .ok()
            .and_then(|value| value.get("id").and_then(Value::as_u64));
        Response::err(
            id,
            &HelperError::invalid_input(format!("invalid request: {error}")),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ascii_escaped_unicode() {
        let request = parse_request(r#"{"id":7,"action":"type_text","input":{"text":"héllo 🙂"}}"#)
            .expect("valid request");
        assert_eq!(request.id, 7);
        assert_eq!(request.input["text"], "héllo 🙂");
    }

    #[test]
    fn malformed_line_yields_null_id_error() {
        let response = parse_request("not json").expect_err("must fail");
        assert_eq!(response.id, None);
        assert!(!response.ok);
        assert_eq!(response.code, Some(ErrorCode::InvalidInput));
    }

    #[test]
    fn malformed_line_salvages_id() {
        let response = parse_request(r#"{"id": 12, "action": 5}"#).expect_err("must fail");
        assert_eq!(response.id, Some(12));
    }

    #[test]
    fn response_line_is_single_line_json() {
        let line = Response::ok(3, serde_json::json!({"a": "b\nc"})).to_line();
        let text = String::from_utf8(line).unwrap();
        assert_eq!(text.matches('\n').count(), 1);
        assert!(text.ends_with('\n'));
    }
}
