//! End-to-end parity tests: spawn the real `poracode-mcp-relay` binary and
//! drive it against a std-only mock HTTP MCP server. Covers the checklist in
//! `src/supervisor/mcp/mcpHttpRelay.ts`: framing, disabled tools, duplicate
//! ids, timeouts, the initialize gate, headers/session, response parsing,
//! delivery, forwarding, cancellation, close, and config fail-closed.

// Integration tests are separate crates, so the crate-level `unwrap_used` /
// `expect_used` denies in Cargo.toml do not exempt them; tests stay idiomatic.
#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::*;
use serde_json::{Value, json};
use std::net::TcpStream;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(5);

fn request_line(id: &Value, method: &str, params: Option<Value>) -> String {
    let mut message = json!({"jsonrpc": "2.0", "id": id, "method": method});
    if let Some(params) = params {
        message["params"] = params;
    }
    message.to_string()
}

fn notification_line(method: &str, params: Option<Value>) -> String {
    let mut message = json!({"jsonrpc": "2.0", "method": method});
    if let Some(params) = params {
        message["params"] = params;
    }
    message.to_string()
}

fn result_body(request: &RecordedRequest, result: Value) -> String {
    let id = request
        .json_body()
        .get("id")
        .cloned()
        .unwrap_or(Value::Null);
    json!({"jsonrpc": "2.0", "id": id, "result": result}).to_string()
}

fn method_of(request: &RecordedRequest) -> String {
    request.json_body()["method"]
        .as_str()
        .unwrap_or("")
        .to_string()
}

/// Replies to requests, answers notifications with an empty 202 — matching
/// how a real MCP server treats forwarded notifications (no reply owed).
fn mcp_respond(stream: &mut TcpStream, request: &RecordedRequest, result: Value) {
    if request.json_body().get("id").is_some() {
        respond_json(stream, 200, &result_body(request, result));
    } else {
        respond(stream, 202, &[], "");
    }
}

/// Standard initialize response with a session id and protocol version.
fn initialize_response(request: &RecordedRequest, stream: &mut TcpStream) {
    let body = result_body(
        request,
        json!({
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "serverInfo": {"name": "mock", "version": "1.0"}
        }),
    );
    respond(
        stream,
        200,
        &[
            ("content-type", "application/json"),
            ("mcp-session-id", "sess-1"),
        ],
        &body,
    );
}

/// Runs initialize against `relay` and the mock and returns the init reply.
fn initialize(relay: &mut RelayProcess, server: &MockServer) -> Value {
    relay.send(&request_line(&json!(1), "initialize", Some(json!({"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}))));
    let line = relay.recv(TIMEOUT).expect("initialize reply");
    let reply: Value = serde_json::from_str(&line).expect("reply json");
    assert!(
        reply["result"]["protocolVersion"].is_string(),
        "init reply: {line}"
    );
    server.wait_for_requests(1, TIMEOUT);
    reply
}

#[test]
fn hello_reports_helper_and_config_version() {
    let output = run_hello();
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    let hello: Value = serde_json::from_str(stdout.trim()).unwrap();
    assert_eq!(hello["helper"], "poracode-mcp-relay");
    assert_eq!(hello["helperVersion"], env!("CARGO_PKG_VERSION"));
    assert_eq!(hello["relayConfigVersion"], 1);
    assert!(hello["platform"].is_string());
    assert!(hello["arch"].is_string());
}

#[test]
fn missing_config_fails_closed() {
    let mut relay = RelayProcess::spawn(None, &[]);
    let status = relay.wait_exit(Duration::from_secs(3)).expect("exit");
    assert!(!status.success());
    assert!(
        relay
            .stderr()
            .iter()
            .any(|line| line.contains("Missing MCP relay configuration"))
    );
}

#[test]
fn unsupported_config_versions_and_https_fail_closed() {
    for config in [
        // version 2
        {
            use base64::Engine;
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(
                r#"{"version":2,"url":"http://127.0.0.1:9/","headers":{},"timeoutMs":5000,"disabledTools":[]}"#,
            )
        },
        // https is unsupported natively
        {
            use base64::Engine;
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(
                r#"{"version":1,"url":"https://example.test/mcp","headers":{},"timeoutMs":5000,"disabledTools":[]}"#,
            )
        },
        // garbage
        "!!!".to_string(),
    ] {
        let mut relay = RelayProcess::spawn(Some(&config), &[]);
        let status = relay.wait_exit(Duration::from_secs(3)).expect("exit");
        assert!(!status.success(), "config {config} should fail");
        assert!(
            relay
                .stderr()
                .iter()
                .any(|line| line.contains("Unsupported MCP relay configuration")),
            "stderr: {:?}",
            relay.stderr()
        );
    }
}

#[test]
fn initialize_and_request_roundtrip_with_session_headers() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "initialize" => initialize_response(&request, &mut stream),
            "tools/list" => respond_json(
                &mut stream,
                200,
                &result_body(&request, json!({"tools": []})),
            ),
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let config = relay_config_with(&server.url(), r#"{"x-custom":"yes"}"#, "5000", "[]");
    let mut relay = RelayProcess::spawn(Some(&config), &[]);
    initialize(&mut relay, &server);
    relay.send(&request_line(&json!(2), "tools/list", None));
    let line = relay.recv(TIMEOUT).expect("tools/list reply");
    assert!(line.contains("\"tools\""), "{line}");

    let recorded = server.wait_for_requests(2, TIMEOUT);
    assert_eq!(recorded.len(), 2);
    let init = &recorded[0];
    let list = &recorded[1];
    // Configured + protocol headers on every POST.
    for request in [&init, &list] {
        assert_eq!(request.header("x-custom"), Some("yes"));
        assert_eq!(request.header("content-type"), Some("application/json"));
        assert_eq!(
            request.header("accept"),
            Some("application/json, text/event-stream")
        );
    }
    // Session id captured from initialize response, sent afterwards.
    assert_eq!(init.header("mcp-session-id"), None);
    assert_eq!(list.header("mcp-session-id"), Some("sess-1"));
    assert_eq!(list.header("mcp-protocol-version"), Some("2025-03-26"));
    // Fresh connection per request (keepAlive:false parity).
    assert_ne!(init.peer_port, list.peer_port);
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn disabled_tool_call_replies_immediately_without_forwarding() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| {
            respond_json(&mut stream, 200, &result_body(&request, json!({})));
        },
    ));
    let config = relay_config_with(&server.url(), "{}", "5000", r#"["blocked"]"#);
    let mut relay = RelayProcess::spawn(Some(&config), &[]);
    // Even before initialize, a disabled tools/call short-circuits.
    relay.send(&request_line(
        &json!("d1"),
        "tools/call",
        Some(json!({"name": "blocked", "arguments": {}})),
    ));
    let line = relay.recv(TIMEOUT).expect("disabled reply");
    let reply: Value = serde_json::from_str(&line).unwrap();
    assert_eq!(reply["id"], "d1");
    assert_eq!(reply["result"]["isError"], true);
    assert_eq!(
        reply["result"]["content"][0]["text"],
        "Tool disabled by Poracode: blocked"
    );
    // Nothing reached the server.
    assert!(server.recorded().is_empty());
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn framing_ignores_blank_invalid_and_non_object_lines() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| {
            initialize_response(&request, &mut stream);
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send_raw(b"\n   \n");
    relay.send_raw(b"this is not json\n");
    relay.send_raw(b"[1,2,3]\n");
    relay.send_raw(b"42\n");
    relay.send_raw(b"null\n");
    relay.send_raw(b"{\"method\":\"ping\"}\n"); // no id -> forwarded, not a request
    relay.send(&request_line(&json!(1), "initialize", None));
    let reply = relay.recv(TIMEOUT).expect("init reply");
    assert!(reply.contains("protocolVersion"), "{reply}");
    // The forwarded ping produced no client output; only the server saw it.
    relay.send(&notification_line("notifications/initialized", None));
    let recorded = server.wait_for_requests(3, TIMEOUT);
    let methods: Vec<String> = recorded.iter().map(method_of).collect();
    assert!(methods.contains(&"ping".to_string()), "{methods:?}");
    assert!(methods.contains(&"initialize".to_string()), "{methods:?}");
    assert!(
        methods.contains(&"notifications/initialized".to_string()),
        "{methods:?}"
    );
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn crlf_lines_and_trailing_cr_are_stripped() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| {
            initialize_response(&request, &mut stream);
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send_raw(b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}\r\n");
    let reply = relay.recv(TIMEOUT).expect("init reply");
    assert!(reply.contains("protocolVersion"), "{reply}");
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn initialize_gate_holds_other_traffic_until_it_completes() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "initialize" => {
                thread::sleep(Duration::from_millis(300));
                initialize_response(&request, &mut stream);
            }
            "tools/list" => respond_json(
                &mut stream,
                200,
                &result_body(&request, json!({"tools": []})),
            ),
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send(&request_line(&json!(1), "initialize", None));
    relay.send(&request_line(&json!(2), "tools/list", None));
    relay.send(&notification_line("notifications/initialized", None));
    let init_reply = relay.recv(TIMEOUT).expect("init reply");
    assert!(init_reply.contains("protocolVersion"));
    let list_reply = relay.recv(TIMEOUT).expect("tools/list reply");
    assert!(list_reply.contains("tools"), "{list_reply}");
    let recorded = server.wait_for_requests(3, TIMEOUT);
    assert_eq!(recorded.len(), 3);
    assert_eq!(method_of(&recorded[0]), "initialize");
    // tools/list and the notification were gated behind initialize.
    assert!(matches!(
        method_of(&recorded[1]).as_str(),
        "tools/list" | "notifications/initialized"
    ));
    assert!(matches!(
        method_of(&recorded[2]).as_str(),
        "tools/list" | "notifications/initialized"
    ));
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn requests_settled_while_gated_are_never_sent() {
    // A stalled initialize holds the gate. Requests queued behind it that are
    // client-cancelled or replaced by a duplicate id must never reach the
    // server — `dispatch`'s `pending.get(id) !== entry` check after the gate
    // await. (Timing out while gated is unreachable: every request shares
    // `timeoutMs` and initialize is always received first, so its deadline
    // is earliest and it always settles before a gated request's timer.)
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "initialize" => {
                thread::sleep(Duration::from_millis(1200));
                initialize_response(&request, &mut stream);
            }
            "tools/call" => {
                let body_json = request.json_body();
                let name = body_json["params"]["name"].as_str().unwrap_or("");
                let body = result_body(&request, json!({"called": name}));
                respond_json(&mut stream, 200, &body);
            }
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send(&request_line(&json!(1), "initialize", None));
    server.wait_for_requests(1, TIMEOUT);
    // All of these queue behind the stalled initialize.
    relay.send(&request_line(
        &json!(2),
        "tools/call",
        Some(json!({"name": "pending"})),
    ));
    relay.send(&request_line(
        &json!(3),
        "tools/call",
        Some(json!({"name": "cancelled"})),
    ));
    relay.send(&request_line(
        &json!(4),
        "tools/call",
        Some(json!({"name": "replaced"})),
    ));
    relay.send(&request_line(
        &json!(4),
        "tools/call",
        Some(json!({"name": "replacement"})),
    ));
    relay.send(&notification_line(
        "notifications/cancelled",
        Some(json!({"requestId": 3})),
    ));
    // initialize completes at ~1.2s; its result and the surviving replies
    // reach the client. id 3 gets no reply.
    let mut replies: Vec<Value> = Vec::new();
    for _ in 0..3 {
        let line = relay.recv(TIMEOUT).expect("reply");
        replies.push(serde_json::from_str(&line).unwrap());
    }
    let ids: Vec<i64> = replies
        .iter()
        .filter_map(|reply| reply["id"].as_i64())
        .collect();
    assert!(ids.contains(&1), "init reply missing: {replies:?}");
    assert!(ids.contains(&2), "pending reply missing: {replies:?}");
    assert!(ids.contains(&4), "replacement reply missing: {replies:?}");
    assert!(!ids.contains(&3), "cancelled request replied: {replies:?}");
    // Upstream saw initialize + the forwarded cancel + exactly the two
    // surviving tools/call — never "cancelled" or "replaced".
    let recorded = server.wait_for_requests(4, TIMEOUT);
    assert_eq!(recorded.len(), 4, "{recorded:?}");
    let mut calls: Vec<String> = recorded
        .iter()
        .filter(|request| method_of(request) == "tools/call")
        .filter_map(|request| {
            request.json_body()["params"]["name"]
                .as_str()
                .map(str::to_string)
        })
        .collect();
    calls.sort();
    assert_eq!(
        calls,
        vec!["pending", "replacement"],
        "unexpected tools/call set: {calls:?}"
    );
    assert!(
        recorded
            .iter()
            .any(|request| method_of(request) == "notifications/cancelled")
    );
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn server_discover_before_initialize_is_forwarded_and_errors_normally() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "server/discover" => respond_json(&mut stream, 400, r#"{"error":"unsupported"}"#),
            "initialize" => initialize_response(&request, &mut stream),
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send(&request_line(
        &json!("d1"),
        "server/discover",
        Some(json!({})),
    ));
    let line = relay.recv(TIMEOUT).expect("discover reply");
    let reply: Value = serde_json::from_str(&line).unwrap();
    assert_eq!(reply["id"], "d1");
    assert_eq!(reply["error"]["code"], -32603);
    assert!(
        reply["error"]["message"]
            .as_str()
            .unwrap()
            .contains("HTTP 400"),
        "{line}"
    );
    // initialize still works afterwards (client falls back to it).
    initialize(&mut relay, &server);
    let recorded = server.recorded();
    assert_eq!(recorded.len(), 2);
    assert_eq!(method_of(&recorded[0]), "server/discover");
    assert_eq!(method_of(&recorded[1]), "initialize");
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn duplicate_id_replaces_pending_request_and_drops_late_reply() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| {
            let body = request.json_body();
            let marker = body["params"]["marker"].as_str().unwrap_or("");
            if marker == "first" {
                thread::sleep(Duration::from_millis(300));
                respond_json(&mut stream, 200, &result_body(&request, json!("first")));
            } else {
                respond_json(&mut stream, 200, &result_body(&request, json!("second")));
            }
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send(&request_line(
        &json!(7),
        "tools/call",
        Some(json!({"name": "t", "marker": "first"})),
    ));
    // Ensure the first request is on the wire before the replacement lands;
    // whether the relay dispatches it before settling is a scheduling race,
    // and both outcomes are correct — the late reply must be dropped either
    // way. Waiting makes the recorded-count assertion deterministic.
    server.wait_for_requests(1, TIMEOUT);
    // Replace id 7 before the first response lands.
    relay.send(&request_line(
        &json!(7),
        "tools/call",
        Some(json!({"name": "t", "marker": "second"})),
    ));
    let line = relay.recv(TIMEOUT).expect("reply");
    assert!(line.contains("second"), "{line}");
    assert!(!line.contains("first"), "{line}");
    // The late "first" response must not produce another line.
    let extra = relay.expect_silence(Duration::from_millis(500));
    assert!(extra.is_empty(), "unexpected lines: {extra:?}");
    assert_eq!(server.wait_for_requests(2, TIMEOUT).len(), 2);
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn request_timeout_emits_error_cancels_upstream_and_drops_late_reply() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "tools/call" => {
                thread::sleep(Duration::from_millis(800));
                respond_json(&mut stream, 200, &result_body(&request, json!("late")));
            }
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let config = relay_config_with(&server.url(), "{}", "100", "[]");
    let mut relay = RelayProcess::spawn(Some(&config), &[]);
    relay.send(&request_line(
        &json!(5),
        "tools/call",
        Some(json!({"name": "slow"})),
    ));
    let line = relay.recv(TIMEOUT).expect("timeout error");
    let reply: Value = serde_json::from_str(&line).unwrap();
    assert_eq!(reply["id"], 5);
    assert_eq!(reply["error"]["code"], -32001);
    assert_eq!(reply["error"]["message"], "Request timed out");
    // The synthesized cancellation is forwarded upstream.
    let recorded = server.wait_for_requests(2, TIMEOUT);
    assert_eq!(recorded.len(), 2);
    assert_eq!(method_of(&recorded[0]), "tools/call");
    assert_eq!(method_of(&recorded[1]), "notifications/cancelled");
    let cancel = recorded[1].json_body();
    assert_eq!(cancel["params"]["requestId"], 5);
    assert_eq!(cancel["params"]["reason"], "Request timed out");
    // The late response at ~800ms produces no further output.
    relay.expect_silence(Duration::from_millis(900));
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn initialize_timeout_releases_gate_without_cancel() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "initialize" => {
                thread::sleep(Duration::from_millis(800));
                initialize_response(&request, &mut stream);
            }
            "tools/list" => respond_json(
                &mut stream,
                200,
                &result_body(&request, json!({"tools": []})),
            ),
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let config = relay_config_with(&server.url(), "{}", "100", "[]");
    let mut relay = RelayProcess::spawn(Some(&config), &[]);
    relay.send(&request_line(&json!(1), "initialize", None));
    let line = relay.recv(TIMEOUT).expect("timeout error");
    let reply: Value = serde_json::from_str(&line).unwrap();
    assert_eq!(reply["error"]["code"], -32001);
    // Later traffic is released: tools/list goes through and succeeds.
    relay.send(&request_line(&json!(2), "tools/list", None));
    let line = relay.recv(TIMEOUT).expect("tools/list reply");
    assert!(line.contains("tools"), "{line}");
    let recorded = server.wait_for_requests(2, TIMEOUT);
    assert_eq!(method_of(&recorded[0]), "initialize");
    assert_eq!(method_of(&recorded[1]), "tools/list");
    // No notifications/cancelled was sent for initialize.
    assert!(
        !recorded
            .iter()
            .any(|r| method_of(r) == "notifications/cancelled")
    );
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn client_cancel_settles_request_and_forwards_notification() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "tools/call" => {
                thread::sleep(Duration::from_millis(500));
                respond_json(&mut stream, 200, &result_body(&request, json!("late")));
            }
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send(&request_line(
        &json!(9),
        "tools/call",
        Some(json!({"name": "t"})),
    ));
    // Give the POST a moment to reach the server, then cancel.
    server.wait_for_requests(1, TIMEOUT);
    relay.send(&notification_line(
        "notifications/cancelled",
        Some(json!({"requestId": 9})),
    ));
    let recorded = server.wait_for_requests(2, TIMEOUT);
    assert_eq!(recorded.len(), 2);
    assert_eq!(method_of(&recorded[1]), "notifications/cancelled");
    assert_eq!(recorded[1].json_body()["params"]["requestId"], 9);
    // No reply for id 9 ever arrives; the late response is dropped.
    let lines = relay.expect_silence(Duration::from_millis(700));
    assert!(lines.is_empty(), "unexpected: {lines:?}");
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn cancel_for_unknown_id_is_forwarded_unchanged() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| {
            mcp_respond(&mut stream, &request, json!({}));
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send(&notification_line(
        "notifications/cancelled",
        Some(json!({"requestId": 4242, "reason": "never pending"})),
    ));
    let recorded = server.wait_for_requests(1, TIMEOUT);
    assert_eq!(recorded.len(), 1);
    assert_eq!(method_of(&recorded[0]), "notifications/cancelled");
    assert_eq!(
        recorded[0].body,
        notification_line(
            "notifications/cancelled",
            Some(json!({"requestId": 4242, "reason": "never pending"}))
        )
    );
    relay.expect_silence(Duration::from_millis(200));
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn cancel_initialize_aborts_without_forwarding() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "initialize" => {
                thread::sleep(Duration::from_millis(500));
                initialize_response(&request, &mut stream);
            }
            _ => respond_json(
                &mut stream,
                200,
                &result_body(&request, json!({"tools": []})),
            ),
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send(&request_line(&json!(1), "initialize", None));
    server.wait_for_requests(1, TIMEOUT);
    relay.send(&notification_line(
        "notifications/cancelled",
        Some(json!({"requestId": 1})),
    ));
    // initialize's late reply is dropped; the gate still releases.
    relay.send(&request_line(&json!(2), "tools/list", None));
    let line = relay.recv(TIMEOUT).expect("tools/list reply");
    assert!(line.contains("tools"), "{line}");
    let recorded = server.wait_for_requests(2, TIMEOUT);
    assert_eq!(method_of(&recorded[0]), "initialize");
    assert_eq!(method_of(&recorded[1]), "tools/list");
    assert!(
        !recorded
            .iter()
            .any(|r| method_of(r) == "notifications/cancelled")
    );
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn sse_responses_parse_events_and_multiline_data() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "initialize" => initialize_response(&request, &mut stream),
            "tools/call" => {
                let id = request.json_body()["id"].clone();
                let sse = format!(
                    "event: message\ndata: {{\"jsonrpc\":\"2.0\",\"id\":{},\"result\":{{\"a\":1}}}}\n\ndata: {{\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\",\"params\":{{\"p\":2}}}}\n\n",
                    id
                );
                respond_raw(
                    &mut stream,
                    &format!(
                        "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\nconnection: close\r\n\r\n{sse}"
                    ),
                );
            }
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    initialize(&mut relay, &server);
    relay.send(&request_line(
        &json!(3),
        "tools/call",
        Some(json!({"name": "t"})),
    ));
    let reply = relay.recv(TIMEOUT).expect("sse reply");
    assert!(reply.contains("\"a\":1"), "{reply}");
    let note = relay.recv(TIMEOUT).expect("sse notification");
    assert!(note.contains("notifications/progress"), "{note}");
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn json_array_and_keepalive_whitespace_bodies_parse() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "initialize" => initialize_response(&request, &mut stream),
            "tools/call" => {
                let id = request.json_body()["id"].clone();
                let body = format!(
                    "\n\n  [{{\"jsonrpc\":\"2.0\",\"id\":{id},\"result\":{{}}}},{{\"jsonrpc\":\"2.0\",\"method\":\"notifications/tick\"}}]  \n"
                );
                respond(
                    &mut stream,
                    200,
                    &[("content-type", "application/json")],
                    &body,
                );
            }
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    initialize(&mut relay, &server);
    relay.send(&request_line(
        &json!(4),
        "tools/call",
        Some(json!({"name": "t"})),
    ));
    let reply = relay.recv(TIMEOUT).expect("array reply");
    assert!(reply.contains("\"id\":4"), "{reply}");
    let note = relay.recv(TIMEOUT).expect("array notification");
    assert!(note.contains("notifications/tick"), "{note}");
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn http_error_status_becomes_internal_error() {
    let server = MockServer::start(Arc::new(
        |_request: RecordedRequest, mut stream: TcpStream| {
            respond_json(&mut stream, 500, r#"{"error":"boom"}"#);
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send(&request_line(&json!(1), "tools/list", None));
    let line = relay.recv(TIMEOUT).expect("error reply");
    let reply: Value = serde_json::from_str(&line).unwrap();
    assert_eq!(reply["error"]["code"], -32603);
    assert_eq!(
        reply["error"]["message"],
        "MCP server responded with HTTP 500"
    );
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn transport_failure_becomes_internal_error() {
    // Port 9 (discard) is never listening.
    let mut relay = RelayProcess::spawn(Some(&relay_config("http://127.0.0.1:9/mcp")), &[]);
    relay.send(&request_line(&json!(1), "tools/list", None));
    let line = relay.recv(TIMEOUT).expect("error reply");
    let reply: Value = serde_json::from_str(&line).unwrap();
    assert_eq!(reply["error"]["code"], -32603);
    assert!(!reply["error"]["message"].as_str().unwrap().is_empty());
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn empty_and_notification_only_responses_report_no_response() {
    for body in [
        "",
        "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/tick\"}",
    ] {
        let server = MockServer::start(Arc::new(
            move |_request: RecordedRequest, mut stream: TcpStream| {
                respond(
                    &mut stream,
                    200,
                    &[("content-type", "application/json")],
                    body,
                );
            },
        ));
        let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
        relay.send(&request_line(&json!(1), "tools/list", None));
        if body.is_empty() {
            let line = relay.recv(TIMEOUT).expect("error reply");
            let reply: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(reply["error"]["code"], -32603, "body {body:?}");
            assert_eq!(reply["error"]["message"], "MCP server returned no response");
        } else {
            // The notification is delivered first, then the no-response error.
            let note = relay.recv(TIMEOUT).expect("notification");
            assert!(note.contains("notifications/tick"), "{note}");
            let line = relay.recv(TIMEOUT).expect("error reply");
            let reply: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(reply["error"]["code"], -32603, "body {body:?}");
            assert_eq!(reply["error"]["message"], "MCP server returned no response");
        }
        relay.close_stdin();
        assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
    }
}

#[test]
fn tools_list_result_is_filtered_for_disabled_and_visibility() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "initialize" => initialize_response(&request, &mut stream),
            "tools/list" => {
                let id = request.json_body()["id"].clone();
                let body = json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {"tools": [
                        {"name": "keep"},
                        {"name": "blocked"},
                        {"name": "app_only", "_meta": {"ui": {"visibility": ["app"]}}},
                        {"name": "both", "_meta": {"ui": {"visibility": ["model", "app"]}}},
                        {"name": "hidden_null_ui", "_meta": {"ui": null}}
                    ]}
                });
                respond_json(&mut stream, 200, &body.to_string());
            }
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let config = relay_config_with(&server.url(), "{}", "5000", r#"["blocked"]"#);
    let mut relay = RelayProcess::spawn(Some(&config), &[]);
    initialize(&mut relay, &server);
    relay.send(&request_line(&json!(2), "tools/list", None));
    let line = relay.recv(TIMEOUT).expect("tools/list reply");
    let reply: Value = serde_json::from_str(&line).unwrap();
    let names: Vec<&str> = reply["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|tool| tool["name"].as_str())
        .collect();
    assert_eq!(names, vec!["keep", "both"]);
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn unmodified_messages_pass_through_byte_for_byte() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| {
            let id = request.json_body()["id"].clone();
            // Weird-but-valid JSON text: extra spaces, newlines, key order.
            let body = format!(
                "{{\n  \"result\" : {{ \"x\" : [1,  2] }},\n  \"id\" : {id},\n  \"jsonrpc\" : \"2.0\"\n}}"
            );
            respond(
                &mut stream,
                200,
                &[("content-type", "application/json")],
                &body,
            );
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send(&request_line(&json!(42), "tools/list", None));
    let line = relay.recv(TIMEOUT).expect("reply");
    // CR/LF stripped; every other byte preserved.
    let expected = "{  \"result\" : { \"x\" : [1,  2] },  \"id\" : 42,  \"jsonrpc\" : \"2.0\"}";
    assert_eq!(line, expected);
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn session_delete_runs_on_close_with_session_headers() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match (
            request.method.as_str(),
            method_of(&request).as_str(),
        ) {
            ("DELETE", _) => respond(&mut stream, 200, &[], ""),
            (_, "initialize") => initialize_response(&request, &mut stream),
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let config = relay_config_with(&server.url(), r#"{"x-a":"b"}"#, "5000", "[]");
    let mut relay = RelayProcess::spawn(Some(&config), &[]);
    initialize(&mut relay, &server);
    relay.close_stdin();
    let status = relay.wait_exit(TIMEOUT).expect("exit");
    assert!(status.success());
    let recorded = server.wait_for_requests(2, TIMEOUT);
    assert_eq!(recorded.len(), 2);
    let delete = &recorded[1];
    assert_eq!(delete.method, "DELETE");
    assert_eq!(delete.header("mcp-session-id"), Some("sess-1"));
    assert_eq!(delete.header("mcp-protocol-version"), Some("2025-03-26"));
    assert_eq!(delete.header("x-a"), Some("b"));
}

#[test]
fn proxy_environment_variables_are_ignored() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| {
            initialize_response(&request, &mut stream);
        },
    ));
    let env = [
        ("HTTP_PROXY", "http://127.0.0.1:9"),
        ("http_proxy", "http://127.0.0.1:9"),
        ("ALL_PROXY", "http://127.0.0.1:9"),
        ("all_proxy", "http://127.0.0.1:9"),
        ("HTTPS_PROXY", "http://127.0.0.1:9"),
        ("https_proxy", "http://127.0.0.1:9"),
    ];
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &env);
    let reply = initialize(&mut relay, &server);
    assert!(reply["result"]["protocolVersion"].is_string());
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn oversized_unterminated_line_closes_the_relay() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| {
            respond_json(&mut stream, 200, &result_body(&request, json!({})));
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    // 10 MiB + 1 byte without a newline exceeds the buffer limit.
    let oversized = vec![b'x'; 10 * 1024 * 1024 + 1];
    relay.send_raw_lossy(&oversized);
    let status = relay.wait_exit(TIMEOUT).expect("exit");
    assert!(status.success());
}

#[test]
fn oversized_line_of_invalid_utf8_closes_the_relay() {
    // 0x80 is never a valid UTF-8 start byte: StringDecoder emits U+FFFD
    // per byte, so 10 MiB + 1 of them exceeds the cap even though no valid
    // multi-byte sequence ever completes.
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| {
            respond_json(&mut stream, 200, &result_body(&request, json!({})));
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    let oversized = vec![0x80u8; 10 * 1024 * 1024 + 1];
    relay.send_raw_lossy(&oversized);
    let status = relay.wait_exit(TIMEOUT).expect("exit");
    assert!(status.success());
}

#[test]
fn forwarded_notification_response_messages_reach_the_client() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| {
            match method_of(&request).as_str() {
                "initialize" => initialize_response(&request, &mut stream),
                "notifications/initialized" => {
                    // The forward's response carries a server-initiated request.
                    respond_json(
                        &mut stream,
                        200,
                        r#"{"jsonrpc":"2.0","id":"srv-1","method":"elicitation/create","params":{"message":"hi"}}"#,
                    );
                }
                _ => mcp_respond(&mut stream, &request, json!({})),
            }
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    initialize(&mut relay, &server);
    relay.send(&notification_line("notifications/initialized", None));
    let line = relay.recv(TIMEOUT).expect("server request");
    assert!(line.contains("elicitation/create"), "{line}");
    assert!(line.contains("srv-1"), "{line}");
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn later_initialize_does_not_release_earlier_waiters() {
    // The gate resolves generations individually: init id 1 is delayed,
    // tools/list id 2 queues behind it, and init id 3 answers immediately.
    // tools/list must wait for init 1 specifically — a later generation
    // completing must not release earlier waiters (the JS relay awaits the
    // `initialized` promise captured at receive time).
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "initialize" => {
                if request.json_body()["id"] == json!(1) {
                    // 1.5 s leaves a wide margin over the ~400 ms it takes
                    // to observe init 3's reply plus the check sleep below.
                    thread::sleep(Duration::from_millis(1500));
                }
                initialize_response(&request, &mut stream);
            }
            "tools/list" => respond_json(
                &mut stream,
                200,
                &result_body(&request, json!({"tools": []})),
            ),
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    relay.send(&request_line(&json!(1), "initialize", None));
    relay.send(&request_line(&json!(2), "tools/list", None));
    relay.send(&request_line(&json!(3), "initialize", None));
    // init 3 replies almost immediately; at that point upstream must have
    // seen only the two initializes — tools/list is still gated on init 1.
    let mut saw_init3 = false;
    let deadline = std::time::Instant::now() + Duration::from_secs(4);
    while std::time::Instant::now() < deadline && !saw_init3 {
        if let Some(line) = relay.recv(Duration::from_millis(100)) {
            let reply: Value = serde_json::from_str(&line).unwrap();
            saw_init3 = reply["id"] == json!(3);
        }
    }
    assert!(saw_init3, "init 3 reply never arrived");
    // Give a wrong implementation every chance to post tools/list early.
    thread::sleep(Duration::from_millis(300));
    let early = server.recorded();
    assert_eq!(
        early.len(),
        2,
        "tools/list escaped the gate before init 1 finished: {early:?}"
    );
    // Drain the remaining replies (init 1, then tools/list).
    let mut replies: Vec<Value> = Vec::new();
    for _ in 0..2 {
        let line = relay.recv(TIMEOUT).expect("reply");
        replies.push(serde_json::from_str(&line).unwrap());
    }
    let ids: Vec<i64> = replies
        .iter()
        .filter_map(|reply| reply["id"].as_i64())
        .collect();
    assert!(ids.contains(&1) && ids.contains(&2), "{replies:?}");
    let recorded = server.wait_for_requests(3, TIMEOUT);
    assert_eq!(recorded.len(), 3, "{recorded:?}");
    assert_eq!(method_of(&recorded[0]), "initialize");
    assert_eq!(method_of(&recorded[1]), "initialize");
    assert_eq!(method_of(&recorded[2]), "tools/list");
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn line_cap_counts_utf16_units_not_bytes() {
    // 4M '€' is 12 MB of UTF-8 but only 4M UTF-16 code units — under the
    // 10 Mi-unit cap the JS `buffer.length` enforces. The relay must stay
    // alive and still answer a following initialize.
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| {
            initialize_response(&request, &mut stream);
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    // 62 * 64Ki '€' = ~4M '€' = ~12 MB of UTF-8 but only ~4M UTF-16 code
    // units — under the cap, where a byte count would already have closed.
    let chunk = "€".repeat(64 * 1024);
    for _ in 0..62 {
        relay.send_raw(chunk.as_bytes());
    }
    // Terminate the giant (invalid, ignored) line, then a real initialize.
    relay.send_raw(b"\n");
    relay.send(&request_line(&json!(1), "initialize", None));
    let reply = relay.recv(TIMEOUT).expect("initialize reply");
    assert!(reply.contains("protocolVersion"), "{reply}");
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn hung_forwards_cannot_starve_requests() {
    // Notifications get their own bounded forward pool: a mock that accepts
    // but never answers them must not pin the workers relayed requests need.
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            method if method.starts_with("notifications/") => hold(stream),
            "tools/call" => {
                let body = result_body(&request, json!({"ok": true}));
                respond_json(&mut stream, 200, &body);
            }
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    // 17 notifications overflow the 4-worker forward pool; the request must
    // still reach upstream on the separate request pool.
    for index in 0..17 {
        relay.send(&notification_line(
            "notifications/tick",
            Some(json!({"index": index})),
        ));
    }
    relay.send(&request_line(
        &json!(99),
        "tools/call",
        Some(json!({"name": "ping"})),
    ));
    let reply = relay.recv(TIMEOUT).expect("tools/call reply");
    let parsed: Value = serde_json::from_str(&reply).unwrap();
    assert_eq!(parsed["id"], json!(99), "{reply}");
    assert_eq!(parsed["result"]["ok"], json!(true), "{reply}");
    // The forward pool caps the hung notification POSTs, so not all 17 are
    // guaranteed to reach upstream — wait for the tools/call itself.
    let deadline = std::time::Instant::now() + TIMEOUT;
    let mut saw_call = false;
    while std::time::Instant::now() < deadline && !saw_call {
        saw_call = server
            .recorded()
            .iter()
            .any(|request| method_of(request) == "tools/call");
        if !saw_call {
            thread::sleep(Duration::from_millis(5));
        }
    }
    assert!(
        saw_call,
        "tools/call never reached upstream: {:?}",
        server.recorded()
    );
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn late_initialize_reply_does_not_capture_session() {
    // init id 1 times out; its late reply (with a session id) arrives after
    // the entry settled and must not establish a session — the retried
    // initialize and later requests must not carry it.
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "initialize" => {
                if request.json_body()["id"] == json!(1) {
                    thread::sleep(Duration::from_millis(600));
                    respond(
                        &mut stream,
                        200,
                        &[
                            ("content-type", "application/json"),
                            ("mcp-session-id", "sess-late"),
                        ],
                        &result_body(
                            &request,
                            json!({
                                "protocolVersion": "2025-03-26",
                                "capabilities": {},
                                "serverInfo": {"name": "mock", "version": "1.0"}
                            }),
                        ),
                    );
                } else {
                    respond(
                        &mut stream,
                        200,
                        &[
                            ("content-type", "application/json"),
                            ("mcp-session-id", "sess-2"),
                        ],
                        &result_body(
                            &request,
                            json!({
                                "protocolVersion": "2025-03-26",
                                "capabilities": {},
                                "serverInfo": {"name": "mock", "version": "1.0"}
                            }),
                        ),
                    );
                }
            }
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let mut relay = RelayProcess::spawn(
        Some(&relay_config_with(&server.url(), "{}", "300", "[]")),
        &[],
    );
    relay.send(&request_line(&json!(1), "initialize", None));
    let error = relay.recv(TIMEOUT).expect("timeout error");
    let parsed: Value = serde_json::from_str(&error).unwrap();
    assert_eq!(parsed["error"]["code"], json!(-32001), "{error}");
    // Wait until the late initialize reply (~600ms) has certainly arrived
    // and been dropped; it must produce no client output. The margin over
    // the mock delay keeps a slow runner from racing it.
    thread::sleep(Duration::from_millis(1000));
    assert!(
        relay.expect_silence(Duration::from_millis(200)).is_empty(),
        "late reply leaked to the client"
    );
    relay.send(&request_line(&json!(2), "initialize", None));
    let reply = relay.recv(TIMEOUT).expect("retry reply");
    assert!(reply.contains("protocolVersion"), "{reply}");
    relay.send(&request_line(
        &json!(3),
        "tools/call",
        Some(json!({"name": "x"})),
    ));
    let reply = relay.recv(TIMEOUT).expect("call reply");
    assert!(reply.contains("\"id\":3"), "{reply}");
    let recorded = server.wait_for_requests(3, TIMEOUT);
    assert_eq!(recorded.len(), 3, "{recorded:?}");
    assert_eq!(method_of(&recorded[0]), "initialize");
    assert_eq!(method_of(&recorded[1]), "initialize");
    assert_eq!(method_of(&recorded[2]), "tools/call");
    // Neither the retried initialize nor the call may carry the late
    // session; the call carries the retried initialize's session.
    assert_eq!(recorded[1].header("mcp-session-id"), None);
    assert_eq!(recorded[2].header("mcp-session-id"), Some("sess-2"));
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}

#[test]
fn replies_to_server_requests_are_forwarded_upstream() {
    let server = MockServer::start(Arc::new(
        |request: RecordedRequest, mut stream: TcpStream| match method_of(&request).as_str() {
            "initialize" => initialize_response(&request, &mut stream),
            "elicitation/create" => respond_json(
                &mut stream,
                200,
                &result_body(&request, json!({"action": "accept"})),
            ),
            _ => mcp_respond(&mut stream, &request, json!({})),
        },
    ));
    let mut relay = RelayProcess::spawn(Some(&relay_config(&server.url())), &[]);
    initialize(&mut relay, &server);
    // A client reply to a server request has an id but no method: forwarded.
    relay.send(r#"{"jsonrpc":"2.0","id":"srv-1","result":{"action":"accept"}}"#);
    let recorded = server.wait_for_requests(2, TIMEOUT);
    assert_eq!(recorded.len(), 2);
    assert_eq!(recorded[1].json_body()["id"], "srv-1");
    assert!(recorded[1].json_body().get("method").is_none());
    relay.close_stdin();
    assert!(relay.wait_exit(TIMEOUT).is_some_and(|s| s.success()));
}
