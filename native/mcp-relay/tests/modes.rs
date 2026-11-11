//! End-to-end integration tests for the three additional launch modes in
//! `poracode-mcp-relay` (`PORACODE_MCP_STDIO_CONFIG`, `schema_proxy`, and
//! `filter_proxy`), exercising real OS processes and sockets with zero
//! external runtime dependencies.

#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use base64::Engine;
use common::*;
use serde_json::{Value, json};
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(5);

fn encode_json(value: &Value) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(value.to_string().as_bytes())
}

fn recv_json(proc: &RelayProcess) -> Value {
    let line = proc.recv(TIMEOUT).expect("expected stdout line");
    serde_json::from_str(&line).expect("expected json line")
}

#[test]
fn stdio_launcher_executes_child_with_cwd_and_scrubs_config_env() {
    let temp_dir = std::env::temp_dir();
    let cfg = encode_json(&json!({
        "version": 1,
        "server": {
            "name": "hello-check",
            "transport": {
                "type": "stdio",
                "command": RELAY_BIN,
                "args": ["--hello"],
                "cwd": temp_dir.to_string_lossy(),
                "env": { "CUSTOM_KEY": "present" }
            }
        }
    }));

    let output = Command::new(RELAY_BIN)
        .env("PORACODE_MCP_STDIO_CONFIG", &cfg)
        .stdin(Stdio::null())
        .output()
        .expect("run stdio launcher");

    assert!(output.status.success());
    let parsed: Value = serde_json::from_slice(&output.stdout).expect("hello json");
    assert_eq!(parsed["helper"], "poracode-mcp-relay");
    assert_eq!(parsed["helperVersion"], env!("CARGO_PKG_VERSION"));
}

#[test]
fn stdio_launcher_reports_clean_message_when_command_missing() {
    let cfg = encode_json(&json!({
        "version": 1,
        "server": {
            "name": "missing-bin",
            "transport": {
                "type": "stdio",
                "command": "poracode-definitely-nonexistent-binary-xyz-999",
                "args": []
            }
        }
    }));

    let output = Command::new(RELAY_BIN)
        .env("PORACODE_MCP_STDIO_CONFIG", &cfg)
        .stdin(Stdio::null())
        .output()
        .expect("run stdio launcher");

    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("Poracode could not start the MCP server."),
        "unexpected stderr: {stderr}"
    );
}

#[test]
fn schema_proxy_preserves_content_length_and_normalizes_only_tool_schemas() {
    let server = MockServer::start(Arc::new(|req, mut stream| {
        if req.method == "DELETE" {
            respond(&mut stream, 200, &[], "");
            return;
        }
        let body = req.json_body();
        let method = body["method"].as_str().unwrap_or("");
        if body.get("id").is_none() {
            respond(&mut stream, 202, &[], "");
            return;
        }
        let id = body["id"].clone();
        let result = match method {
            "initialize" => json!({
                "protocolVersion": "2025-03-26",
                "capabilities": { "tools": {}, "resources": {} },
                "serverInfo": { "name": "mock", "version": "1.0.0" }
            }),
            "tools/list" => json!({
                "tools": [{
                    "name": "validate_email",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "bad": { "type": "string", "pattern": "[" },
                            "good": { "type": "string", "pattern": "^[a-z]+$" }
                        }
                    }
                }]
            }),
            "resources/list" => json!({
                "resources": [{ "uri": "file:///keep", "name": "keep", "pattern": "[" }]
            }),
            _ => json!({}),
        };
        respond_json(
            &mut stream,
            200,
            &json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string(),
        );
    }));

    // Nest stdio_launcher -> http schema_proxy under stdio schema_proxy to
    // exercise Content-Length framing on both stdio and HTTP plus outer
    // PORACODE_MCP_FILTER_CONFIG_V2 precedence over inner PORACODE_MCP_STDIO_CONFIG.
    let inner_http_schema_cfg = encode_json(&json!({
        "version": 2,
        "omitInvalidSchemaPatterns": true,
        "schemaOnly": true,
        "disabledTools": [],
        "server": {
            "name": "inner-http",
            "transport": {
                "type": "http",
                "url": server.url()
            }
        }
    }));
    let inner_stdio_cfg = encode_json(&json!({
        "version": 1,
        "server": {
            "name": "inner-stdio",
            "transport": {
                "type": "stdio",
                "command": RELAY_BIN,
                "env": { "PORACODE_MCP_FILTER_CONFIG_V2": inner_http_schema_cfg }
            }
        }
    }));
    let schema_cfg = encode_json(&json!({
        "version": 2,
        "omitInvalidSchemaPatterns": true,
        "schemaOnly": true,
        "disabledTools": [],
        "server": {
            "name": "nested-schema",
            "transport": {
                "type": "stdio",
                "command": RELAY_BIN,
                "args": [],
                "env": { "PORACODE_MCP_STDIO_CONFIG": inner_stdio_cfg }
            }
        }
    }));

    let mut child = Command::new(RELAY_BIN)
        .env("PORACODE_MCP_STDIO_CONFIG", &inner_stdio_cfg)
        .env("PORACODE_MCP_FILTER_CONFIG_V2", &schema_cfg)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn schema proxy");

    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = child.stdout.take().unwrap();

    let write_cl = |stdin: &mut std::process::ChildStdin, msg: &Value| {
        let s = msg.to_string();
        write!(stdin, "Content-Length: {}\r\n\r\n{}", s.len(), s).unwrap();
        stdin.flush().unwrap();
    };
    let read_cl = |stdout: &mut std::process::ChildStdout| -> Value {
        let mut hdr = Vec::new();
        let mut byte = [0u8; 1];
        while !hdr.ends_with(b"\r\n\r\n") {
            stdout.read_exact(&mut byte).unwrap();
            hdr.push(byte[0]);
        }
        let hdr_str = std::str::from_utf8(&hdr).unwrap();
        let len: usize = hdr_str
            .lines()
            .find_map(|l| l.strip_prefix("Content-Length: "))
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        let mut body = vec![0u8; len];
        stdout.read_exact(&mut body).unwrap();
        serde_json::from_slice(&body).unwrap()
    };

    write_cl(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": { "name": "test", "version": "1" }
            }
        }),
    );
    let init_resp = read_cl(&mut stdout);
    assert_eq!(init_resp["result"]["protocolVersion"], "2025-03-26");

    write_cl(
        &mut stdin,
        &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
    );
    write_cl(
        &mut stdin,
        &json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }),
    );
    let tools_resp = read_cl(&mut stdout);
    let props = &tools_resp["result"]["tools"][0]["inputSchema"]["properties"];
    assert!(props["bad"].get("pattern").is_none());
    assert_eq!(props["good"]["pattern"], "^[a-z]+$");

    write_cl(
        &mut stdin,
        &json!({ "jsonrpc": "2.0", "id": 3, "method": "resources/list", "params": {} }),
    );
    let res_resp = read_cl(&mut stdout);
    assert_eq!(res_resp["result"]["resources"][0]["pattern"], "[");

    drop(stdin);
    let status = child.wait().unwrap();
    assert!(status.success());
}

#[test]
fn filter_proxy_paginates_filters_normalizes_and_blocks_disabled_or_app_only_tools() {
    let call_count = Arc::new(AtomicUsize::new(0));
    let call_count_srv = Arc::clone(&call_count);

    let server = MockServer::start(Arc::new(move |req, mut stream| {
        if req.method == "DELETE" {
            respond(&mut stream, 200, &[], "");
            return;
        }
        let body = req.json_body();
        let method = body["method"].as_str().unwrap_or("");
        if body.get("id").is_none() {
            respond(&mut stream, 202, &[], "");
            return;
        }
        let id = body["id"].clone();
        let result = match method {
            "initialize" => json!({
                "protocolVersion": "2025-11-25",
                "capabilities": { "tools": { "listChanged": true } },
                "serverInfo": { "name": "upstream", "version": "1.0.0" }
            }),
            "tools/list" => {
                let cursor = body["params"]["cursor"].as_str();
                if cursor.is_none() {
                    json!({
                        "tools": [
                            {
                                "name": "allowed",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": { "q": { "type": "string", "pattern": "[" } }
                                }
                            },
                            {
                                "name": "blocked",
                                "inputSchema": { "type": "object" }
                            }
                        ],
                        "nextCursor": "page-2"
                    })
                } else {
                    json!({
                        "tools": [
                            {
                                "name": "app_hidden",
                                "inputSchema": { "type": "object" },
                                "_meta": { "ui": { "visibility": ["app"] } }
                            }
                        ]
                    })
                }
            }
            "tools/call" => {
                call_count_srv.fetch_add(1, Ordering::SeqCst);
                json!({
                    "content": [{ "type": "text", "text": format!("ran:{}", body["params"]["name"].as_str().unwrap_or("")) }]
                })
            }
            _ => json!({}),
        };
        respond_json(
            &mut stream,
            200,
            &json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string(),
        );
    }));

    let filter_cfg = encode_json(&json!({
        "version": 2,
        "omitInvalidSchemaPatterns": true,
        "disabledTools": ["blocked"],
        "server": {
            "name": "filtered-http",
            "timeoutMs": 5000,
            "transport": {
                "type": "http",
                "url": server.url(),
                "headers": { "x-custom": "1" }
            }
        }
    }));

    let mut proc = RelayProcess::spawn(None, &[("PORACODE_MCP_FILTER_CONFIG_V2", &filter_cfg)]);
    proc.send(
        &json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": { "name": "client", "version": "1" }
            }
        })
        .to_string(),
    );
    let init = recv_json(&proc);
    assert_eq!(init["result"]["serverInfo"]["name"], "filtered-http");

    proc.send(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }).to_string());
    proc.send(
        &json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }).to_string(),
    );
    let listed = recv_json(&proc);
    let tools = listed["result"]["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0]["name"], "allowed");
    assert!(
        tools[0]["inputSchema"]["properties"]["q"]
            .get("pattern")
            .is_none()
    );

    // Disabled tool is rejected locally without hitting upstream.
    proc.send(
        &json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": { "name": "blocked", "arguments": {} }
        })
        .to_string(),
    );
    let blocked = recv_json(&proc);
    assert_eq!(blocked["result"]["isError"], true);
    assert_eq!(
        blocked["result"]["content"][0]["text"],
        "Tool disabled by Poracode: blocked"
    );

    // App-only hidden tool is rejected locally without hitting upstream.
    proc.send(
        &json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": { "name": "app_hidden", "arguments": {} }
        })
        .to_string(),
    );
    let hidden = recv_json(&proc);
    assert_eq!(hidden["result"]["isError"], true);
    assert_eq!(
        hidden["result"]["content"][0]["text"],
        "Tool is not visible to the model: app_hidden"
    );
    assert_eq!(call_count.load(Ordering::SeqCst), 0);

    // Allowed tool forwards to upstream.
    proc.send(
        &json!({
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": { "name": "allowed", "arguments": { "q": "hi" } }
        })
        .to_string(),
    );
    let ok = recv_json(&proc);
    assert_eq!(ok["result"]["content"][0]["text"], "ran:allowed");
    assert_eq!(call_count.load(Ordering::SeqCst), 1);

    proc.close_stdin();
    let status = proc.wait_exit(TIMEOUT).expect("process exit");
    assert!(status.success());
}
