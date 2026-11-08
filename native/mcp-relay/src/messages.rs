//! Message-level logic ported from `mcpHttpRelay.ts` and
//! `isMcpToolVisibleTo` in `src/shared/mcpAppResources.ts`: JSON-RPC id
//! normalization, response body parsing (JSON and SSE), `tools/list`
//! filtering, and tool visibility.

use serde_json::Value;
use serde_json::value::RawValue;
use std::collections::{HashMap, HashSet};
use std::fmt;

/// A parsed response message. `raw` is the exact received JSON text (which may
/// contain insignificant newlines); unmodified messages are written back
/// byte-for-byte with only CR/LF stripped, matching the relay's improvement
/// over the JS relay's re-serialization.
pub struct RelayMessage {
    pub raw: String,
    pub value: Value,
}

/// `typeof value === "string" || typeof value === "number"`.
pub fn is_json_rpc_id(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::String(_) | Value::Number(_)))
}

/// Map key for a JSON-RPC id, mirroring JS `Map` semantics: strings compare by
/// value, numbers by numeric value (`1`, `1.0` and `-0`/`0` collapse; `NaN`
/// cannot appear in parsed JSON).
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum IdKey {
    Str(String),
    /// `f64::to_bits` of the normalized value.
    Num(u64),
}

pub fn id_key(value: &Value) -> Option<IdKey> {
    match value {
        Value::String(text) => Some(IdKey::Str(text.clone())),
        Value::Number(number) => {
            let mut value = number.as_f64()?;
            if value == 0.0 {
                value = 0.0;
            }
            Some(IdKey::Num(value.to_bits()))
        }
        _ => None,
    }
}

/// `isMcpToolVisibleTo(tool, "model")` from `src/shared/mcpAppResources.ts`.
pub fn is_mcp_tool_visible_to_model(tool: &Value) -> bool {
    let Some(ui) = tool.get("_meta").and_then(|meta| meta.get("ui")) else {
        return true;
    };
    let Some(ui) = ui.as_object() else {
        return false;
    };
    let Some(visibility) = ui.get("visibility") else {
        return true;
    };
    let Some(entries) = visibility.as_array() else {
        return false;
    };
    entries
        .iter()
        .all(|entry| matches!(entry.as_str(), Some("model" | "app")))
        && entries.iter().any(|entry| entry.as_str() == Some("model"))
}

/// Removes disabled and model-invisible tools from a `tools/list` result,
/// mirroring the `deliver` filter in `mcpHttpRelay.ts`. Returns `Err` with the
/// message the JS relay would raise when a `null` tool makes `tool.name`
/// throw; the caller decides whether that becomes a `-32603` (dispatch) or is
/// ignored (forward).
pub fn filter_tools_list(
    message: &mut Value,
    disabled_tools: &HashSet<String>,
) -> Result<bool, &'static str> {
    let Some(result) = message.get_mut("result") else {
        return Ok(false);
    };
    let Some(tools) = result.get_mut("tools").and_then(Value::as_array_mut) else {
        return Ok(false);
    };
    if tools.iter().any(Value::is_null) {
        return Err("Cannot read properties of null (reading 'name')");
    }
    tools.retain(|tool| {
        let disabled = tool
            .get("name")
            .and_then(Value::as_str)
            .is_some_and(|name| disabled_tools.contains(name));
        !disabled && is_mcp_tool_visible_to_model(tool)
    });
    Ok(true)
}

/// Whether a reply message targets the `tools/list` result shape that gets
/// filtered and re-serialized (everything else passes through raw).
pub fn is_tools_list_result(message: &Value) -> bool {
    message
        .pointer("/result/tools")
        .is_some_and(Value::is_array)
}

#[derive(Debug)]
pub enum ParseError {
    /// `JSON.parse` failure inside `parseMessages`.
    Syntax,
    /// `deliver` touching `null.method`, which the JS relay surfaces as a
    /// `TypeError` inside the dispatch `try`.
    NullMessage,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseError::Syntax => f.write_str("MCP server returned invalid JSON"),
            ParseError::NullMessage => {
                f.write_str("Cannot read properties of null (reading 'method')")
            }
        }
    }
}

fn message_from_raw(raw: &str) -> Result<RelayMessage, ParseError> {
    let value: Value = serde_json::from_str(raw).map_err(|_| ParseError::Syntax)?;
    Ok(RelayMessage {
        raw: raw.to_string(),
        value,
    })
}

fn parse_json_body(body: &str) -> Result<Vec<RelayMessage>, ParseError> {
    // JSON responses may be preceded by keepalive whitespace for long tool calls.
    let text = body.trim();
    if text.is_empty() {
        return Ok(Vec::new());
    }
    if text.starts_with('[') {
        let raws: Vec<Box<RawValue>> =
            serde_json::from_str(text).map_err(|_| ParseError::Syntax)?;
        raws.iter().map(|raw| message_from_raw(raw.get())).collect()
    } else {
        let raw: Box<RawValue> = serde_json::from_str(text).map_err(|_| ParseError::Syntax)?;
        Ok(vec![message_from_raw(raw.get())?])
    }
}

fn parse_sse(body: &str) -> Result<Vec<RelayMessage>, ParseError> {
    let mut messages = Vec::new();
    let mut data_lines: Vec<&str> = Vec::new();
    let mut flush = |data_lines: &mut Vec<&str>| -> Result<(), ParseError> {
        if data_lines.is_empty() {
            return Ok(());
        }
        let data = data_lines.join("\n");
        data_lines.clear();
        if data.trim().is_empty() {
            return Ok(());
        }
        let value: Value = serde_json::from_str(&data).map_err(|_| ParseError::Syntax)?;
        messages.push(RelayMessage { raw: data, value });
        Ok(())
    };
    for raw_line in body.split('\n') {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if line.is_empty() {
            flush(&mut data_lines)?;
        } else if let Some(payload) = line.strip_prefix("data:") {
            data_lines.push(payload.strip_prefix(' ').unwrap_or(payload));
        }
    }
    flush(&mut data_lines)?;
    Ok(messages)
}

/// `parseMessages` from `mcpHttpRelay.ts`: SSE when the content type carries
/// `text/event-stream`, otherwise a trimmed JSON body (single object or
/// array).
pub fn parse_messages(content_type: &str, body: &str) -> Result<Vec<RelayMessage>, ParseError> {
    if content_type.contains("text/event-stream") {
        parse_sse(body)
    } else {
        parse_json_body(body)
    }
}

/// Parsed fields of one stdin line, mirroring what `receive` extracts from
/// the JSON object: `method`, the raw `id` token (kept verbatim so generated
/// replies serialize the id byte-for-byte), `params`, and the parsed message
/// value.
pub struct ClientMessage {
    pub method: Option<String>,
    pub id_raw: Option<Box<RawValue>>,
    pub id_key: Option<IdKey>,
    pub params: Option<Value>,
}

/// Parses a client line like `receive` does: invalid JSON and non-object
/// values (arrays included) are ignored.
pub fn parse_client_message(line: &str) -> Option<ClientMessage> {
    let fields: HashMap<String, Box<RawValue>> = serde_json::from_str(line).ok()?;
    let method = fields
        .get("method")
        .and_then(|raw| serde_json::from_str::<Value>(raw.get()).ok())
        .and_then(|value| value.as_str().map(str::to_string));
    let id = fields.get("id");
    let id_value = id.and_then(|raw| serde_json::from_str::<Value>(raw.get()).ok());
    let key = id_value.as_ref().and_then(id_key);
    let params = fields
        .get("params")
        .and_then(|raw| serde_json::from_str::<Value>(raw.get()).ok());
    Some(ClientMessage {
        method,
        id_raw: id.cloned(),
        id_key: if is_json_rpc_id(id_value.as_ref()) {
            key
        } else {
            None
        },
        params,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_key_matches_js_map_semantics() {
        let cases: &[(&str, IdKey)] = &[
            (r#""abc""#, IdKey::Str("abc".into())),
            ("1", IdKey::Num(1f64.to_bits())),
            ("1.0", IdKey::Num(1f64.to_bits())),
            ("-0", IdKey::Num(0f64.to_bits())),
            ("0", IdKey::Num(0f64.to_bits())),
            ("1e2", IdKey::Num(100f64.to_bits())),
        ];
        for (text, expected) in cases {
            let value: Value = serde_json::from_str(text).unwrap();
            assert_eq!(id_key(&value), Some(expected.clone()), "id {text}");
        }
        for text in ["null", "true", "{}", "[]"] {
            let value: Value = serde_json::from_str(text).unwrap();
            assert_eq!(id_key(&value), None, "id {text}");
        }
        // Empty string is a valid JSON-RPC id (`typeof "" === "string"`).
        let empty: Value = serde_json::from_str(r#""""#).unwrap();
        assert_eq!(id_key(&empty), Some(IdKey::Str(String::new())));
        // null/true/objects are not JSON-RPC ids even though they parse.
        assert!(!is_json_rpc_id(Some(&Value::Null)));
        assert!(is_json_rpc_id(Some(&Value::from(3))));
        assert!(is_json_rpc_id(Some(&Value::from("x"))));
        assert!(!is_json_rpc_id(None));
    }

    #[test]
    fn tool_visibility_matches_shared_helper() {
        let visible =
            |json: &str| is_mcp_tool_visible_to_model(&serde_json::from_str(json).unwrap());
        assert!(visible(r#"{"name":"t"}"#));
        assert!(visible(r#"{"name":"t","_meta":{}}"#));
        assert!(visible(r#"{"name":"t","_meta":{"ui":{}}}"#));
        assert!(visible(
            r#"{"name":"t","_meta":{"ui":{"visibility":["model"]}}}"#
        ));
        assert!(visible(
            r#"{"name":"t","_meta":{"ui":{"visibility":["model","app"]}}}"#
        ));
        assert!(visible(
            r#"{"name":"t","_meta":{"ui":{"visibility":["app","model"]}}}"#
        ));
        assert!(!visible(
            r#"{"name":"t","_meta":{"ui":{"visibility":["app"]}}}"#
        ));
        assert!(!visible(r#"{"name":"t","_meta":{"ui":{"visibility":[]}}}"#));
        assert!(!visible(
            r#"{"name":"t","_meta":{"ui":{"visibility":["model","x"]}}}"#
        ));
        assert!(!visible(
            r#"{"name":"t","_meta":{"ui":{"visibility":"model"}}}"#
        ));
        assert!(!visible(r#"{"name":"t","_meta":{"ui":null}}"#));
        assert!(!visible(r#"{"name":"t","_meta":{"ui":[]}}"#));
        assert!(!visible(r#"{"name":"t","_meta":{"ui":"x"}}"#));
        assert!(!visible(
            r#"{"name":"t","_meta":{"ui":{"visibility":null}}}"#
        ));
        // Non-object tools are visible, matching `tool._meta?.ui === undefined`.
        assert!(is_mcp_tool_visible_to_model(&Value::Null));
        assert!(is_mcp_tool_visible_to_model(&Value::from(5)));
    }

    #[test]
    fn filters_disabled_and_invisible_tools() {
        let mut message: Value = serde_json::from_str(
            r#"{"jsonrpc":"2.0","id":1,"result":{"tools":[
                {"name":"ok"},
                {"name":"blocked"},
                {"name":"app_only","_meta":{"ui":{"visibility":["app"]}}},
                {"name":"both","_meta":{"ui":{"visibility":["model","app"]}}},
                5
            ]}}"#,
        )
        .unwrap();
        let disabled: HashSet<String> = ["blocked".to_string()].into_iter().collect();
        assert!(filter_tools_list(&mut message, &disabled).unwrap());
        let tools = message
            .pointer("/result/tools")
            .unwrap()
            .as_array()
            .unwrap();
        let names: Vec<&str> = tools
            .iter()
            .filter_map(|tool| tool.get("name").and_then(Value::as_str))
            .collect();
        assert_eq!(names, vec!["ok", "both"]);
        assert!(tools.iter().any(|tool| tool == &Value::from(5)));
    }

    #[test]
    fn filter_tools_list_leaves_other_shapes_alone() {
        let disabled = HashSet::new();
        for json in [
            r#"{"id":1,"result":{"tools":"nope"}}"#,
            r#"{"id":1,"result":{}}"#,
            r#"{"id":1}"#,
            r#"{"id":1,"result":{"tools":[null]}}"#,
        ] {
            let mut message: Value = serde_json::from_str(json).unwrap();
            let before = message.to_string();
            let filtered = filter_tools_list(&mut message, &disabled);
            if json.contains("null") {
                assert!(filtered.is_err());
            } else {
                assert!(!filtered.unwrap());
                assert_eq!(message.to_string(), before);
            }
        }
    }

    #[test]
    fn parses_json_body_single_and_array() {
        let single = parse_messages("application/json", " {\"id\":1,\"result\":{}} ").unwrap();
        assert_eq!(single.len(), 1);
        assert_eq!(single[0].raw, r#"{"id":1,"result":{}}"#);
        let array = parse_messages("application/json", r#"[{"id":1},{"id":2}]"#).unwrap();
        assert_eq!(array.len(), 2);
        assert_eq!(array[1].raw, r#"{"id":2}"#);
        assert!(
            parse_messages("application/json", "  \n\t ")
                .unwrap()
                .is_empty()
        );
        assert!(parse_messages("application/json", "").unwrap().is_empty());
        assert!(parse_messages("application/json", "not json").is_err());
        assert!(parse_messages("application/json", r#"{"a":1} trailing"#).is_err());
    }

    #[test]
    fn keeps_raw_text_for_unmodified_messages() {
        let body = "{\n  \"jsonrpc\": \"2.0\",\n  \"id\": 7,\n  \"result\": { \"x\" : 1 }\n}";
        let messages = parse_messages("application/json", body).unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(
            messages[0].raw,
            "{\n  \"jsonrpc\": \"2.0\",\n  \"id\": 7,\n  \"result\": { \"x\" : 1 }\n}"
        );
    }

    #[test]
    fn parses_sse_events() {
        // Multi-line data: payloads join with "\n" into one JSON value.
        let body = "event: message\ndata: {\"id\":1,\ndata:  \"ok\":true}\n\n\
                    : keepalive\n\n\
                    data:{\"id\":3}\n\n\
                    data: not-json\n\n";
        // The last event fails to parse, so the whole parse fails like JS.
        assert!(parse_messages("text/event-stream", body).is_err());
        let ok = "event: message\ndata: {\"id\":1,\ndata:  \"ok\":true}\n\n\
                  : keepalive\n\n\
                  data:{\"id\":3}\n\n\
                  data: {\"id\":4}\n\ndata: {\"id\":5}\n\n";
        let messages = parse_messages("text/event-stream", ok).unwrap();
        assert_eq!(messages.len(), 4);
        // One leading space stripped per data: line; the join keeps "\n".
        assert_eq!(messages[0].raw, "{\"id\":1,\n \"ok\":true}");
        assert_eq!(messages[0].value["ok"], Value::Bool(true));
        assert_eq!(messages[2].raw, "{\"id\":4}");
        assert_eq!(messages[3].raw, "{\"id\":5}");
    }

    #[test]
    fn sse_trailing_event_without_blank_line_still_parses() {
        let messages = parse_messages("text/event-stream", "data: {\"id\":9}").unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].raw, "{\"id\":9}");
    }

    #[test]
    fn parses_client_message_fields() {
        let message = parse_client_message(
            r#"{"jsonrpc":"2.0","id":1e2,"method":"tools/call","params":{"name":"t"}}"#,
        )
        .unwrap();
        assert_eq!(message.method.as_deref(), Some("tools/call"));
        assert_eq!(message.id_key, Some(IdKey::Num(100f64.to_bits())));
        assert_eq!(message.id_raw.unwrap().get(), "1e2");

        assert!(parse_client_message("not json").is_none());
        assert!(parse_client_message("[1,2]").is_none());
        assert!(parse_client_message("42").is_none());
        assert!(parse_client_message("null").is_none());

        let no_id = parse_client_message(r#"{"method":"notifications/initialized"}"#).unwrap();
        assert!(no_id.id_key.is_none());
        assert!(no_id.id_raw.is_none());
        assert_eq!(no_id.method.as_deref(), Some("notifications/initialized"));
    }
}
