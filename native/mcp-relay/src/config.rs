//! Launch helper configuration envelopes, ported from
//! `src/supervisor/mcp/mcpToolFilterConfig.ts` and `mcpStdioWorker.ts`.
//!
//! Supported envelopes:
//! - `PORACODE_MCP_HTTP_RELAY_CONFIG`: plain-`http:` host endpoint relay
//! - `PORACODE_MCP_STDIO_CONFIG`: execution-only stdio `cwd`/`env` wrapper
//! - `PORACODE_MCP_FILTER_CONFIG_V2` / `V1` / `PORACODE_MCP_FILTER_CONFIG`:
//!   protocol-preserving schema proxy (`schemaOnly: true`) and tool-filtering
//!   proxy (`isolateConnectionFailures: false`, `stdio` or plain-`http:`
//!   upstream). `https:`, `sse`, and `isolateConnectionFailures: true` stay on
//!   the JavaScript fallback and fail closed here.

use base64::Engine;
use serde_json::Value;
use std::collections::HashSet;
use std::time::Duration;

/// `Number.isSafeInteger` upper bound: 2^53 - 1.
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

/// Matches `DEFAULT_REQUEST_TIMEOUT_MSEC` in `@modelcontextprotocol/client`.
pub const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_millis(60_000);

/// Envelope keys of every Poracode MCP launch helper, matching
/// `MCP_HELPER_CONFIG_ENVS` in `mcpToolFilterConfig.ts`.
pub const MCP_HELPER_CONFIG_ENVS: &[&str] = &[
    "PORACODE_MCP_FILTER_CONFIG",
    "PORACODE_MCP_FILTER_CONFIG_V1",
    "PORACODE_MCP_FILTER_CONFIG_V2",
    "PORACODE_MCP_STDIO_CONFIG",
    "PORACODE_MCP_HTTP_RELAY_CONFIG",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfigError {
    Missing,
    Unsupported,
    MissingStdio,
    UnsupportedStdio,
    MissingFilter,
    UnsupportedFilterVersion,
    InvalidSchemaOnly,
    UnsupportedFilter,
}

impl ConfigError {
    pub fn message(self) -> &'static str {
        match self {
            ConfigError::Missing => "Missing MCP relay configuration",
            ConfigError::Unsupported => "Unsupported MCP relay configuration",
            ConfigError::MissingStdio => "Missing MCP stdio launch configuration",
            ConfigError::UnsupportedStdio => "Unsupported MCP stdio launch configuration",
            ConfigError::MissingFilter => "Missing MCP filter configuration",
            ConfigError::UnsupportedFilterVersion => "Unsupported MCP filter configuration version",
            ConfigError::InvalidSchemaOnly => {
                "Schema-only MCP configuration cannot filter tools or isolate failures"
            }
            ConfigError::UnsupportedFilter => "Unsupported MCP filter configuration",
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct RelayConfig {
    pub url: String,
    /// Configured headers in document order; session/protocol headers are
    /// appended per request, replacing any same-named configured entry.
    pub headers: Vec<(String, String)>,
    pub timeout: Duration,
    pub disabled_tools: HashSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StdioTransportConfig {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub env: Vec<(String, String)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpTransportConfig {
    pub url: String,
    pub headers: Vec<(String, String)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UpstreamTransportConfig {
    Stdio(StdioTransportConfig),
    Http(HttpTransportConfig),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StdioLauncherConfig {
    pub transport: StdioTransportConfig,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FilterConfig {
    pub server_name: String,
    pub timeout: Duration,
    pub transport: UpstreamTransportConfig,
    pub disabled_tools: HashSet<String>,
    pub omit_invalid_schema_patterns: bool,
    pub schema_only: bool,
}

fn decode_base64url(encoded: &str) -> Option<Vec<u8>> {
    use base64::engine::DecodePaddingMode;
    use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
    let engine = GeneralPurpose::new(
        &base64::alphabet::URL_SAFE,
        GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent),
    );
    engine.decode(encoded).ok()
}

fn decode_json_object(encoded: &str) -> Option<serde_json::Map<String, Value>> {
    let bytes = decode_base64url(encoded)?;
    let text = String::from_utf8(bytes).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    match value {
        Value::Object(map) => Some(map),
        _ => None,
    }
}

/// `new URL(url).protocol === "http:"` with an authority, the only HTTP shape
/// the native helper serves (TLS stays on Node).
pub fn is_plain_http_url(url: &str) -> bool {
    let Ok(uri) = url.parse::<ureq::http::Uri>() else {
        return false;
    };
    uri.scheme_str() == Some("http") && uri.authority().is_some()
}

/// Every map value must be a string — the JS helpers reject non-string header
/// and env values, so both helpers fail closed identically.
fn parse_string_map(value: Option<&Value>) -> Option<Vec<(String, String)>> {
    let map = value?.as_object()?;
    let mut entries = Vec::with_capacity(map.len());
    for (name, entry_value) in map {
        entries.push((name.clone(), entry_value.as_str()?.to_string()));
    }
    Some(entries)
}

fn parse_string_vec(value: Option<&Value>) -> Option<Vec<String>> {
    let list = value?.as_array()?;
    let mut items = Vec::with_capacity(list.len());
    for item in list {
        items.push(item.as_str()?.to_string());
    }
    Some(items)
}

fn parse_positive_timeout_ms(value: Option<&Value>) -> Option<Duration> {
    let ms = value
        .and_then(Value::as_f64)
        .filter(|ms| ms.fract() == 0.0 && *ms >= 1.0 && *ms <= MAX_SAFE_INTEGER)?;
    Some(Duration::from_millis(ms as u64))
}

fn parse_stdio_transport(
    transport: &serde_json::Map<String, Value>,
) -> Option<StdioTransportConfig> {
    if transport.get("type").and_then(Value::as_str) != Some("stdio") {
        return None;
    }
    let command = transport
        .get("command")
        .and_then(Value::as_str)
        .filter(|cmd| !cmd.is_empty())?
        .to_string();
    let args = match transport.get("args") {
        None | Some(Value::Null) => Vec::new(),
        other => parse_string_vec(other)?,
    };
    let cwd = match transport.get("cwd") {
        None | Some(Value::Null) => None,
        Some(Value::String(dir)) if dir.is_empty() => None,
        Some(Value::String(dir)) => Some(dir.clone()),
        Some(_) => return None,
    };
    let env = match transport.get("env") {
        None | Some(Value::Null) => Vec::new(),
        other => parse_string_map(other)?,
    };
    Some(StdioTransportConfig {
        command,
        args,
        cwd,
        env,
    })
}

fn parse_upstream_transport(value: Option<&Value>) -> Option<UpstreamTransportConfig> {
    let transport = value?.as_object()?;
    match transport.get("type").and_then(Value::as_str)? {
        "stdio" => parse_stdio_transport(transport).map(UpstreamTransportConfig::Stdio),
        "http" => {
            let url = transport
                .get("url")
                .and_then(Value::as_str)
                .filter(|url| is_plain_http_url(url))?
                .to_string();
            let headers = match transport.get("headers") {
                None | Some(Value::Null) => Vec::new(),
                other => parse_string_map(other)?,
            };
            Some(UpstreamTransportConfig::Http(HttpTransportConfig {
                url,
                headers,
            }))
        }
        _ => None,
    }
}

/// Parses and validates the `PORACODE_MCP_HTTP_RELAY_CONFIG` envelope.
/// `encoded` is the raw env value; `None` or an empty string is the missing
/// case, everything else malformed is unsupported and fails closed before any
/// network use.
pub fn parse_relay_config(encoded: Option<&str>) -> Result<RelayConfig, ConfigError> {
    let Some(encoded) = encoded.filter(|value| !value.is_empty()) else {
        return Err(ConfigError::Missing);
    };
    let object = decode_json_object(encoded).ok_or(ConfigError::Unsupported)?;

    if object.get("version").and_then(Value::as_f64) != Some(1.0) {
        return Err(ConfigError::Unsupported);
    }
    let url = object
        .get("url")
        .and_then(Value::as_str)
        .filter(|url| is_plain_http_url(url))
        .map(str::to_string);
    let headers = parse_string_map(object.get("headers")).ok_or(ConfigError::Unsupported)?;
    let timeout = parse_positive_timeout_ms(object.get("timeoutMs"));
    let disabled_tools = object
        .get("disabledTools")
        .and_then(Value::as_array)
        .map(|tools| {
            tools
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        });

    let (Some(url), Some(timeout), Some(disabled_tools)) = (url, timeout, disabled_tools) else {
        return Err(ConfigError::Unsupported);
    };

    Ok(RelayConfig {
        url,
        headers,
        timeout,
        disabled_tools,
    })
}

/// Reads `PORACODE_MCP_HTTP_RELAY_CONFIG` from the process environment.
pub fn read_relay_config() -> Result<RelayConfig, ConfigError> {
    parse_relay_config(
        std::env::var("PORACODE_MCP_HTTP_RELAY_CONFIG")
            .ok()
            .as_deref(),
    )
}

/// Parses and validates `PORACODE_MCP_STDIO_CONFIG` (version 1).
pub fn parse_stdio_config(encoded: Option<&str>) -> Result<StdioLauncherConfig, ConfigError> {
    let Some(encoded) = encoded.filter(|value| !value.is_empty()) else {
        return Err(ConfigError::MissingStdio);
    };
    let object = decode_json_object(encoded).ok_or(ConfigError::UnsupportedStdio)?;
    if object.get("version").and_then(Value::as_f64) != Some(1.0) {
        return Err(ConfigError::UnsupportedStdio);
    }
    let transport = object
        .get("server")
        .and_then(Value::as_object)
        .and_then(|server| server.get("transport"))
        .and_then(Value::as_object)
        .and_then(parse_stdio_transport)
        .ok_or(ConfigError::UnsupportedStdio)?;
    Ok(StdioLauncherConfig { transport })
}

/// Reads `PORACODE_MCP_STDIO_CONFIG` from the process environment.
pub fn read_stdio_config() -> Result<StdioLauncherConfig, ConfigError> {
    parse_stdio_config(std::env::var("PORACODE_MCP_STDIO_CONFIG").ok().as_deref())
}

/// Parses and validates `PORACODE_MCP_FILTER_CONFIG_V2` / `V1` / unversioned
/// envelopes, matching `readMcpToolFilterConfig` in `mcpToolFilterConfig.ts`.
pub fn parse_filter_config(
    v2: Option<&str>,
    v1: Option<&str>,
    unversioned: Option<&str>,
) -> Result<FilterConfig, ConfigError> {
    let v2 = v2.filter(|value| !value.is_empty());
    let v1 = v1.filter(|value| !value.is_empty());
    let unversioned = unversioned.filter(|value| !value.is_empty());
    let versioned = v2.or(v1);
    let Some(encoded) = versioned.or(unversioned) else {
        return Err(ConfigError::MissingFilter);
    };
    let object = decode_json_object(encoded).ok_or(ConfigError::UnsupportedFilter)?;

    if versioned.is_some() {
        let expected = if v2.is_some() { 2.0 } else { 1.0 };
        if object.get("version").and_then(Value::as_f64) != Some(expected) {
            return Err(ConfigError::UnsupportedFilterVersion);
        }
    }

    let disabled_tools: HashSet<String> = object
        .get("disabledTools")
        .and_then(Value::as_array)
        .ok_or(ConfigError::UnsupportedFilter)?
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect();

    let isolate_connection_failures = match object.get("isolateConnectionFailures") {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::Bool(true)) => true,
        Some(_) => return Err(ConfigError::UnsupportedFilter),
    };
    let omit_invalid_schema_patterns = match object.get("omitInvalidSchemaPatterns") {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::Bool(true)) => true,
        Some(_) => return Err(ConfigError::UnsupportedFilter),
    };
    let schema_only = match object.get("schemaOnly") {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::Bool(true)) => true,
        Some(_) => return Err(ConfigError::UnsupportedFilter),
    };

    if schema_only && (v2.is_none() || !disabled_tools.is_empty() || isolate_connection_failures) {
        return Err(ConfigError::InvalidSchemaOnly);
    }
    if isolate_connection_failures {
        return Err(ConfigError::UnsupportedFilter);
    }

    let server = object
        .get("server")
        .and_then(Value::as_object)
        .ok_or(ConfigError::UnsupportedFilter)?;
    let server_name = server
        .get("name")
        .and_then(Value::as_str)
        .ok_or(ConfigError::UnsupportedFilter)?
        .to_string();
    let timeout = match server.get("timeoutMs") {
        None | Some(Value::Null) => DEFAULT_REQUEST_TIMEOUT,
        other => parse_positive_timeout_ms(other).ok_or(ConfigError::UnsupportedFilter)?,
    };
    let transport =
        parse_upstream_transport(server.get("transport")).ok_or(ConfigError::UnsupportedFilter)?;

    Ok(FilterConfig {
        server_name,
        timeout,
        transport,
        disabled_tools,
        omit_invalid_schema_patterns,
        schema_only,
    })
}

/// Reads the highest-precedence MCP filter envelope from the environment.
pub fn read_filter_config() -> Result<FilterConfig, ConfigError> {
    let v2 = std::env::var("PORACODE_MCP_FILTER_CONFIG_V2").ok();
    let v1 = std::env::var("PORACODE_MCP_FILTER_CONFIG_V1").ok();
    let unversioned = std::env::var("PORACODE_MCP_FILTER_CONFIG").ok();
    parse_filter_config(v2.as_deref(), v1.as_deref(), unversioned.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode(config: &str) -> String {
        use base64::engine::general_purpose::URL_SAFE_NO_PAD;
        URL_SAFE_NO_PAD.encode(config)
    }

    fn valid_json() -> String {
        r#"{"version":1,"url":"http://127.0.0.1:8123/mcp","headers":{"x-a":"b"},"timeoutMs":5000,"disabledTools":["slow_tool"]}"#
            .to_string()
    }

    #[test]
    fn parses_valid_config() {
        let config = parse_relay_config(Some(&encode(&valid_json()))).unwrap();
        assert_eq!(config.url, "http://127.0.0.1:8123/mcp");
        assert_eq!(config.headers, vec![("x-a".to_string(), "b".to_string())]);
        assert_eq!(config.timeout, Duration::from_millis(5000));
        assert!(config.disabled_tools.contains("slow_tool"));
    }

    #[test]
    fn accepts_padded_base64url() {
        use base64::engine::general_purpose::URL_SAFE;
        let padded = URL_SAFE.encode(valid_json());
        assert!(parse_relay_config(Some(&padded)).is_ok());
    }

    #[test]
    fn missing_or_empty_is_missing() {
        assert_eq!(parse_relay_config(None), Err(ConfigError::Missing));
        assert_eq!(parse_relay_config(Some("")), Err(ConfigError::Missing));
    }

    #[test]
    fn rejects_bad_envelopes() {
        for json in [
            r#"{"version":2,"url":"http://h/","headers":{},"timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":"1","url":"http://h/","headers":{},"timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":1,"url":"https://h/","headers":{},"timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":1,"url":"ftp://h/","headers":{},"timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":1,"url":"not a url","headers":{},"timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":1}"#,
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":0,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":-5,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":1.5,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":"500","disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":9007199254740992,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":[],"timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":"x","timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{"a":5},"timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{"a":null},"timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":1,"disabledTools":{}}"#,
            r#"[1,2,3]"#,
            r#""str""#,
            r#"null"#,
        ] {
            assert_eq!(
                parse_relay_config(Some(&encode(json))),
                Err(ConfigError::Unsupported),
                "expected rejection: {json}"
            );
        }
    }

    #[test]
    fn rejects_malformed_base64_and_json() {
        assert_eq!(
            parse_relay_config(Some("!!!not-base64!!!")),
            Err(ConfigError::Unsupported)
        );
        let not_json = encode("this is not json");
        assert_eq!(
            parse_relay_config(Some(&not_json)),
            Err(ConfigError::Unsupported)
        );
    }

    #[test]
    fn non_string_disabled_tools_are_ignored_like_the_js_set() {
        let config = parse_relay_config(Some(&encode(
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":1,"disabledTools":["a",5,null,{"x":1}]}"#,
        )))
        .unwrap();
        assert_eq!(config.disabled_tools.len(), 1);
        assert!(config.disabled_tools.contains("a"));
    }

    #[test]
    fn parses_stdio_launcher_config_and_rejects_bad_versions() {
        let ok = parse_stdio_config(Some(&encode(
            r#"{"version":1,"server":{"transport":{"type":"stdio","command":"node","args":["s.js"],"cwd":"/tmp","env":{"A":"1"}}}}"#,
        )))
        .unwrap();
        assert_eq!(ok.transport.command, "node");
        assert_eq!(ok.transport.args, vec!["s.js"]);
        assert_eq!(ok.transport.cwd.as_deref(), Some("/tmp"));
        assert_eq!(ok.transport.env, vec![("A".to_string(), "1".to_string())]);

        assert_eq!(
            parse_stdio_config(Some(&encode(
                r#"{"version":0,"server":{"transport":{"type":"stdio","command":"node","args":[],"env":{}}}}"#,
            ))),
            Err(ConfigError::UnsupportedStdio)
        );
    }

    #[test]
    fn parses_filter_configs_and_enforces_version_and_schema_only_guards() {
        let v2_schema = encode(
            r#"{"version":2,"schemaOnly":true,"omitInvalidSchemaPatterns":true,"disabledTools":[],"server":{"name":"s","timeoutMs":1000,"transport":{"type":"stdio","command":"node","args":[],"env":{}}}}"#,
        );
        let parsed = parse_filter_config(Some(&v2_schema), None, None).unwrap();
        assert!(parsed.schema_only);
        assert!(parsed.omit_invalid_schema_patterns);

        // schemaOnly with disabled tools fails closed.
        let bad_schema = encode(
            r#"{"version":2,"schemaOnly":true,"disabledTools":["x"],"server":{"name":"s","timeoutMs":1000,"transport":{"type":"stdio","command":"node","args":[],"env":{}}}}"#,
        );
        assert_eq!(
            parse_filter_config(Some(&bad_schema), None, None),
            Err(ConfigError::InvalidSchemaOnly)
        );

        // isolateConnectionFailures stays on JS fallback and fails closed here.
        let isolated = encode(
            r#"{"version":1,"isolateConnectionFailures":true,"disabledTools":[],"server":{"name":"s","timeoutMs":1000,"transport":{"type":"stdio","command":"node","args":[],"env":{}}}}"#,
        );
        assert_eq!(
            parse_filter_config(None, Some(&isolated), None),
            Err(ConfigError::UnsupportedFilter)
        );

        // https upstream fails closed natively.
        let https_filter = encode(
            r#"{"disabledTools":["x"],"server":{"name":"s","timeoutMs":1000,"transport":{"type":"http","url":"https://example.com/mcp","headers":{}}}}"#,
        );
        assert_eq!(
            parse_filter_config(None, None, Some(&https_filter)),
            Err(ConfigError::UnsupportedFilter)
        );
    }
}
