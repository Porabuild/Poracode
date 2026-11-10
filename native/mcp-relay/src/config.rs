//! Relay configuration envelope, ported from `readMcpHttpRelayConfig` in
//! `src/supervisor/mcp/mcpToolFilterConfig.ts`. The binary only accepts
//! `http:` URLs; `https:` stays on the JS relay, which owns TLS.

use base64::Engine;
use serde_json::Value;
use std::collections::HashSet;
use std::time::Duration;

/// `Number.isSafeInteger` upper bound: 2^53 - 1.
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfigError {
    Missing,
    Unsupported,
}

impl ConfigError {
    pub fn message(self) -> &'static str {
        match self {
            ConfigError::Missing => "Missing MCP relay configuration",
            ConfigError::Unsupported => "Unsupported MCP relay configuration",
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

fn decode_base64url(encoded: &str) -> Option<Vec<u8>> {
    use base64::engine::DecodePaddingMode;
    use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
    let engine = GeneralPurpose::new(
        &base64::alphabet::URL_SAFE,
        GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent),
    );
    engine.decode(encoded).ok()
}

/// `new URL(url).protocol === "http:"` with an authority, the only shape the
/// native relay can serve.
fn is_plain_http_url(url: &str) -> bool {
    let Ok(uri) = url.parse::<ureq::http::Uri>() else {
        return false;
    };
    uri.scheme_str() == Some("http") && uri.authority().is_some()
}

/// Every header value must be a string — the JS `readMcpHttpRelayConfig`
/// rejects the same envelopes, so both relays fail closed identically.
fn parse_headers(value: Option<&Value>) -> Option<Vec<(String, String)>> {
    let map = value?.as_object()?;
    let mut headers = Vec::with_capacity(map.len());
    for (name, header_value) in map {
        headers.push((name.clone(), header_value.as_str()?.to_string()));
    }
    Some(headers)
}

/// Parses and validates the envelope. `encoded` is the raw env value; `None`
/// or an empty string is the missing case, everything else malformed is
/// unsupported and fails closed before any network use.
pub fn parse_relay_config(encoded: Option<&str>) -> Result<RelayConfig, ConfigError> {
    let Some(encoded) = encoded.filter(|value| !value.is_empty()) else {
        return Err(ConfigError::Missing);
    };
    let bytes = decode_base64url(encoded).ok_or(ConfigError::Unsupported)?;
    let text = String::from_utf8(bytes).map_err(|_| ConfigError::Unsupported)?;
    let value: Value = serde_json::from_str(&text).map_err(|_| ConfigError::Unsupported)?;
    let Some(object) = value.as_object() else {
        return Err(ConfigError::Unsupported);
    };

    if object.get("version").and_then(Value::as_f64) != Some(1.0) {
        return Err(ConfigError::Unsupported);
    }
    let url = object
        .get("url")
        .and_then(Value::as_str)
        .filter(|url| is_plain_http_url(url))
        .map(str::to_string);
    let headers = parse_headers(object.get("headers")).ok_or(ConfigError::Unsupported)?;
    let timeout_ms = object
        .get("timeoutMs")
        .and_then(Value::as_f64)
        .filter(|ms| ms.fract() == 0.0 && *ms >= 1.0 && *ms <= MAX_SAFE_INTEGER);
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

    let (Some(url), Some(timeout_ms), Some(disabled_tools)) = (url, timeout_ms, disabled_tools)
    else {
        return Err(ConfigError::Unsupported);
    };

    Ok(RelayConfig {
        url,
        headers,
        timeout: Duration::from_millis(timeout_ms as u64),
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
            // wrong version
            r#"{"version":2,"url":"http://h/","headers":{},"timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":"1","url":"http://h/","headers":{},"timeoutMs":1,"disabledTools":[]}"#,
            // https is unsupported natively
            r#"{"version":1,"url":"https://h/","headers":{},"timeoutMs":1,"disabledTools":[]}"#,
            // non-http scheme
            r#"{"version":1,"url":"ftp://h/","headers":{},"timeoutMs":1,"disabledTools":[]}"#,
            // invalid url
            r#"{"version":1,"url":"not a url","headers":{},"timeoutMs":1,"disabledTools":[]}"#,
            // missing fields
            r#"{"version":1}"#,
            // bad timeout values
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":0,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":-5,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":1.5,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":"500","disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":9007199254740992,"disabledTools":[]}"#,
            // headers must be an object
            r#"{"version":1,"url":"http://h/","headers":[],"timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":"x","timeoutMs":1,"disabledTools":[]}"#,
            // header values must be strings
            r#"{"version":1,"url":"http://h/","headers":{"a":5},"timeoutMs":1,"disabledTools":[]}"#,
            r#"{"version":1,"url":"http://h/","headers":{"a":null},"timeoutMs":1,"disabledTools":[]}"#,
            // disabledTools must be an array
            r#"{"version":1,"url":"http://h/","headers":{},"timeoutMs":1,"disabledTools":{}}"#,
            // not an object at all
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
        // Valid base64url of non-JSON text.
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
}
