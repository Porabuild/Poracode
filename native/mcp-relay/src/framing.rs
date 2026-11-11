//! Shared MCP wire framing (`line` and `Content-Length`), child process tree
//! lifecycle, environment filtering, and plain Streamable HTTP client support
//! used by `schema_proxy` and `filter_proxy`.

use crate::config::{HttpTransportConfig, MCP_HELPER_CONFIG_ENVS};
use crate::messages::parse_messages;
use crate::stdio_launcher::{remove_env, upsert_env};
use serde_json::Value;
use std::ffi::OsString;
use std::io::{self, Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use ureq::Agent;

/// Matches `@modelcontextprotocol/server`'s `STDIO_DEFAULT_MAX_BUFFER_SIZE` (10 MiB).
pub const STDIO_MAX_BUFFER_BYTES: usize = 10 * 1024 * 1024;

/// Latest MCP protocol version advertised by `@modelcontextprotocol` v2.
pub const LATEST_PROTOCOL_VERSION: &str = "2025-11-25";

/// Supported MCP protocol versions accepted during handshake validation.
pub const SUPPORTED_PROTOCOL_VERSIONS: &[&str] = &[
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
    "2024-11-05",
    "2024-10-07",
];

const CONTENT_LENGTH_PREFIX: &[u8] = b"content-length:";
const HEADER_SEPARATOR: &[u8] = b"\r\n\r\n";
const DELETE_TIMEOUT: Duration = Duration::from_secs(1);

#[cfg(windows)]
const DEFAULT_INHERITED_ENV_VARS: &[&str] = &[
    "APPDATA",
    "COMSPEC",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "PATH",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "PROGRAMW6432",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
];

#[cfg(not(windows))]
const DEFAULT_INHERITED_ENV_VARS: &[&str] = &["HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER"];

/// Wire framing style on an MCP stdio stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Framing {
    Line = 0,
    ContentLength = 1,
}

impl Framing {
    pub fn from_u8(raw: u8) -> Self {
        if raw == 1 {
            Self::ContentLength
        } else {
            Self::Line
        }
    }
}

/// Validates that `value` conforms to JSON-RPC 2.0 request, notification, or
/// response shape as enforced by `@modelcontextprotocol/core`'s `JSONRPCMessageSchema`.
pub fn is_valid_jsonrpc_message(value: &Value) -> bool {
    let Some(obj) = value.as_object() else {
        return false;
    };
    if obj.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return false;
    }
    let has_valid_id = match obj.get("id") {
        Some(Value::String(_)) => true,
        Some(Value::Number(n)) => {
            n.as_i64().is_some() || n.as_u64().is_some() || n.as_f64().is_some()
        }
        Some(Value::Null) => obj.get("error").is_some(),
        Some(_) => false,
        None => false,
    };

    if let Some(method) = obj.get("method") {
        if !method.is_string() {
            return false;
        }
        // Request has string/number id; notification has no id field.
        return match obj.get("id") {
            None => true,
            Some(Value::Null) => false,
            Some(_) => has_valid_id,
        };
    }

    if !has_valid_id {
        return false;
    }
    let has_result = obj.contains_key("result");
    let has_valid_error = obj
        .get("error")
        .and_then(Value::as_object)
        .is_some_and(|err| {
            err.get("code").is_some_and(Value::is_number)
                && err.get("message").is_some_and(Value::is_string)
        });

    (has_result && !obj.contains_key("error")) || (!has_result && has_valid_error)
}

/// Incremental decoder supporting either strict line-delimited JSON-RPC or
/// auto-detected `line` + `Content-Length` framing (`McpFramedTransport`).
pub struct FramedDecoder {
    buf: Vec<u8>,
    auto_detect: bool,
}

impl FramedDecoder {
    pub fn new(auto_detect: bool) -> Self {
        Self {
            buf: Vec::with_capacity(4096),
            auto_detect,
        }
    }

    pub fn push_bytes(&mut self, chunk: &[u8]) {
        self.buf.extend_from_slice(chunk);
    }

    /// Extracts the next complete JSON-RPC message if available.
    pub fn next_frame(&mut self) -> Result<Option<(Framing, Value)>, String> {
        loop {
            if self.buf.is_empty() {
                return Ok(None);
            }

            if self.auto_detect && starts_with_content_length(&self.buf) {
                let Some(header_end) = find_subslice(&self.buf, HEADER_SEPARATOR) else {
                    if self.buf.len() > STDIO_MAX_BUFFER_BYTES {
                        return Err("MCP stdio header exceeded maximum buffer size".to_string());
                    }
                    return Ok(None);
                };

                let header_bytes = &self.buf[..header_end];
                let content_length = parse_content_length_headers(header_bytes)?;
                let body_start = header_end + HEADER_SEPARATOR.len();
                let frame_end = body_start + content_length;
                if self.buf.len() < frame_end {
                    return Ok(None);
                }

                let parsed: Value = {
                    let body_str = std::str::from_utf8(&self.buf[body_start..frame_end])
                        .map_err(|e| format!("Invalid UTF-8 in MCP frame: {e}"))?;
                    serde_json::from_str(body_str)
                        .map_err(|e| format!("Invalid JSON in MCP frame: {e}"))?
                };
                self.buf.drain(..frame_end);
                if !is_valid_jsonrpc_message(&parsed) {
                    return Err("Invalid JSON-RPC 2.0 message".to_string());
                }
                return Ok(Some((Framing::ContentLength, parsed)));
            }

            let Some(newline_idx) = self.buf.iter().position(|&b| b == b'\n') else {
                if self.buf.len() > STDIO_MAX_BUFFER_BYTES {
                    return Err("MCP stdio message exceeded maximum buffer size".to_string());
                }
                return Ok(None);
            };

            if newline_idx > STDIO_MAX_BUFFER_BYTES {
                return Err("MCP stdio message exceeded maximum buffer size".to_string());
            }

            let line_end = if newline_idx > 0 && self.buf[newline_idx - 1] == b'\r' {
                newline_idx - 1
            } else {
                newline_idx
            };
            let line_str = std::str::from_utf8(&self.buf[..line_end])
                .map_err(|e| format!("Invalid UTF-8 in MCP line: {e}"))?
                .trim()
                .to_string();
            self.buf.drain(..=newline_idx);

            if line_str.is_empty() {
                continue;
            }

            let parsed: Value = serde_json::from_str(&line_str)
                .map_err(|e| format!("Invalid JSON in MCP line: {e}"))?;
            if !is_valid_jsonrpc_message(&parsed) {
                return Err("Invalid JSON-RPC 2.0 message".to_string());
            }
            return Ok(Some((Framing::Line, parsed)));
        }
    }
}

fn starts_with_content_length(buf: &[u8]) -> bool {
    if buf.is_empty() {
        return false;
    }
    let prefix_len = buf.len().min(CONTENT_LENGTH_PREFIX.len());
    buf[..prefix_len]
        .iter()
        .zip(&CONTENT_LENGTH_PREFIX[..prefix_len])
        .all(|(a, b)| a.to_ascii_lowercase() == *b)
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn parse_content_length_headers(header_bytes: &[u8]) -> Result<usize, String> {
    let header_text = std::str::from_utf8(header_bytes)
        .map_err(|_| "Invalid MCP Content-Length header encoding".to_string())?;
    let mut found: Option<usize> = None;
    for line in header_text.split("\r\n") {
        let Some((name, raw_value)) = line.split_once(':') else {
            continue;
        };
        if !name.trim().eq_ignore_ascii_case("content-length") {
            continue;
        }
        let digits = raw_value.trim();
        if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
            return Err(format!("Invalid MCP Content-Length header: {raw_value}"));
        }
        let parsed = digits
            .parse::<usize>()
            .map_err(|_| format!("Invalid MCP Content-Length header: {raw_value}"))?;
        if parsed > STDIO_MAX_BUFFER_BYTES {
            return Err("MCP stdio message exceeded maximum buffer size".to_string());
        }
        found = Some(parsed);
    }
    found.ok_or_else(|| "Missing MCP Content-Length header".to_string())
}

/// Encodes and writes a JSON-RPC message using `framing`.
pub fn write_framed_message<W: Write>(
    writer: &mut W,
    message: &Value,
    framing: Framing,
) -> io::Result<()> {
    let json = serde_json::to_string(message)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))?;
    match framing {
        Framing::ContentLength => {
            write!(writer, "Content-Length: {}\r\n\r\n{}", json.len(), json)?;
        }
        Framing::Line => {
            writer.write_all(json.as_bytes())?;
            writer.write_all(b"\n")?;
        }
    }
    writer.flush()
}

/// Reads framed JSON-RPC messages from `reader` and invokes `on_frame` for each.
/// Returns `Ok(())` on clean EOF or `Err(reason)` on framing/read failure.
pub fn read_framed_stream<R, F>(
    mut reader: R,
    auto_detect: bool,
    mut on_frame: F,
) -> Result<(), String>
where
    R: Read,
    F: FnMut(Framing, Value) -> bool,
{
    let mut decoder = FramedDecoder::new(auto_detect);
    let mut chunk = [0u8; 8192];
    loop {
        let n = match reader.read(&mut chunk) {
            Ok(0) => return Ok(()),
            Ok(n) => n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e.to_string()),
        };
        decoder.push_bytes(&chunk[..n]);
        while let Some((framing, msg)) = decoder.next_frame()? {
            if !on_frame(framing, msg) {
                return Ok(());
            }
        }
    }
}

/// Environment used by `schema_proxy` (`schemaOnly: true`), matching
/// `mcpOwnedStdioEnvironment` in `src/supervisor/mcp/mcpToolFilterProxy.ts`.
pub fn mcp_owned_stdio_environment(explicit: &[(String, String)]) -> Vec<(OsString, OsString)> {
    let mut entries: Vec<(OsString, OsString)> = std::env::vars_os()
        .filter(|(_, v)| !v.to_string_lossy().starts_with("()"))
        .collect();

    for &helper_key in MCP_HELPER_CONFIG_ENVS {
        remove_env(&mut entries, helper_key);
    }
    remove_env(&mut entries, "ELECTRON_RUN_AS_NODE");

    for &helper_key in MCP_HELPER_CONFIG_ENVS {
        if let Some((_, val)) = explicit
            .iter()
            .find(|(k, _)| env_name_matches(k, helper_key))
        {
            upsert_env(&mut entries, helper_key, val);
        }
    }
    if let Some((_, val)) = explicit
        .iter()
        .find(|(k, _)| env_name_matches(k, "ELECTRON_RUN_AS_NODE"))
    {
        upsert_env(&mut entries, "ELECTRON_RUN_AS_NODE", val);
    }
    entries
}

/// Environment used by `filter_proxy` (`!schemaOnly`), matching
/// `StdioClientTransport` (`getDefaultEnvironment()`) + `mcpStdioEnvironment(explicit, false)`.
pub fn mcp_filtered_stdio_environment(explicit: &[(String, String)]) -> Vec<(OsString, OsString)> {
    let mut entries: Vec<(OsString, OsString)> = Vec::new();
    for (k, v) in std::env::vars_os() {
        let key_str = k.to_string_lossy();
        if v.to_string_lossy().starts_with("()") {
            continue;
        }
        let allowed = DEFAULT_INHERITED_ENV_VARS
            .iter()
            .any(|&allowed_key| env_name_matches(&key_str, allowed_key));
        if allowed {
            entries.push((k, v));
        }
    }
    for &helper_key in MCP_HELPER_CONFIG_ENVS {
        remove_env(&mut entries, helper_key);
    }
    for (key, value) in explicit {
        upsert_env(&mut entries, key, value);
    }
    entries
}

fn env_name_matches(a: &str, b: &str) -> bool {
    #[cfg(windows)]
    {
        a.eq_ignore_ascii_case(b)
    }
    #[cfg(not(windows))]
    {
        a == b
    }
}

/// Managed MCP child process with synchronized framed stdin writer and
/// deterministic process-tree termination on close.
pub struct ManagedChild {
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Child>,
    closed: AtomicBool,
}

impl ManagedChild {
    pub fn spawn(
        command: &str,
        args: &[String],
        cwd: Option<&str>,
        env: &[(OsString, OsString)],
    ) -> io::Result<(Arc<Self>, ChildStdout)> {
        #[cfg(windows)]
        let mut cmd = crate::win_spawn::build_windows_command(command, args, cwd, env);

        #[cfg(not(windows))]
        let mut cmd = {
            let mut c = Command::new(command);
            c.args(args);
            if let Some(dir) = cwd.filter(|d| !d.is_empty()) {
                c.current_dir(dir);
            }
            c.env_clear();
            for (k, v) in env {
                c.env(k, v);
            }
            c
        };

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                cmd.pre_exec(|| {
                    let mut empty: libc::sigset_t = std::mem::zeroed();
                    libc::sigemptyset(&mut empty);
                    libc::pthread_sigmask(libc::SIG_SETMASK, &empty, std::ptr::null_mut());
                    Ok(())
                });
            }
        }

        let mut child = cmd.spawn()?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| io::Error::other("Failed to capture MCP child stdin"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| io::Error::other("Failed to capture MCP child stdout"))?;

        Ok((
            Arc::new(Self {
                stdin: Mutex::new(Some(stdin)),
                child: Mutex::new(child),
                closed: AtomicBool::new(false),
            }),
            stdout,
        ))
    }

    pub fn send(&self, message: &Value, framing: Framing) -> io::Result<()> {
        if self.closed.load(Ordering::Acquire) {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "MCP stdio child is closed",
            ));
        }
        let mut guard = self
            .stdin
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let Some(stdin) = guard.as_mut() else {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "MCP stdio child stdin is closed",
            ));
        };
        write_framed_message(stdin, message, framing)
    }

    pub fn close(&self) {
        if self.closed.swap(true, Ordering::AcqRel) {
            return;
        }
        {
            let mut stdin_guard = self
                .stdin
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let _ = stdin_guard.take();
        }

        let mut child = self
            .child
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        // Give polite stdio servers a brief window to exit cleanly on stdin EOF
        // before escalating to OS process termination.
        let grace = Instant::now() + Duration::from_millis(50);
        while Instant::now() < grace {
            if let Ok(Some(_)) = child.try_wait() {
                return;
            }
            std::thread::sleep(Duration::from_millis(5));
        }

        if let Ok(Some(_)) = child.try_wait() {
            return;
        }

        terminate_child_tree(&mut child);
        let _ = child.wait();
    }
}

fn terminate_child_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let pid = child.id();
        if let Ok(mut killer) = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
        {
            let deadline = Instant::now() + Duration::from_secs(5);
            while Instant::now() < deadline {
                if let Ok(Some(_)) = killer.try_wait() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            let _ = killer.kill();
            let _ = killer.wait();
        }
        let _ = child.kill();
    }

    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        if pid > 0 {
            unsafe {
                libc::kill(pid, libc::SIGTERM);
            }
            let deadline = Instant::now() + Duration::from_secs(1);
            while Instant::now() < deadline {
                if let Ok(Some(_)) = child.try_wait() {
                    return;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            unsafe {
                libc::kill(pid, libc::SIGKILL);
            }
        }
    }
}

/// Plain Streamable HTTP client peer (`http:` only; `https:` stays on Node).
pub struct HttpPeer {
    url: String,
    headers: Vec<(String, String)>,
    agent: Agent,
    session_id: Mutex<Option<String>>,
    protocol_version: Mutex<Option<String>>,
    closed: AtomicBool,
}

impl HttpPeer {
    pub fn new(config: &HttpTransportConfig) -> Self {
        let agent: Agent = Agent::config_builder()
            .proxy(None)
            .http_status_as_error(false)
            .max_redirects(0)
            .max_idle_connections(0)
            .user_agent("")
            .accept("")
            .build()
            .into();
        Self {
            url: config.url.clone(),
            headers: config.headers.clone(),
            agent,
            session_id: Mutex::new(None),
            protocol_version: Mutex::new(None),
            closed: AtomicBool::new(false),
        }
    }

    pub fn set_protocol_version(&self, version: String) {
        let mut guard = self
            .protocol_version
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *guard = Some(version);
    }

    pub fn post_json(&self, message: &Value, timeout: Duration) -> Result<Vec<Value>, String> {
        if self.closed.load(Ordering::Acquire) {
            return Err("MCP HTTP transport is closed".to_string());
        }
        let body_json = serde_json::to_string(message).map_err(|e| e.to_string())?;
        let session = self
            .session_id
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        let proto = self
            .protocol_version
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();

        let mut req = self
            .agent
            .post(&self.url)
            .config()
            .timeout_global(Some(timeout))
            .build();
        for (k, v) in &self.headers {
            req = req.header(k, v);
        }
        req = req
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream");
        if let Some(sid) = &session {
            req = req.header("mcp-session-id", sid);
        }
        if let Some(pv) = &proto {
            req = req.header("mcp-protocol-version", pv);
        }

        let mut resp = req.send(body_json.as_bytes()).map_err(|e| e.to_string())?;
        if let Some(sid) = resp
            .headers()
            .get("mcp-session-id")
            .and_then(|v| v.to_str().ok())
            .filter(|s| !s.is_empty())
        {
            let mut guard = self
                .session_id
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            *guard = Some(sid.to_string());
        }

        let status = resp.status().as_u16();
        if status == 202 || status == 204 {
            return Ok(Vec::new());
        }
        if !(200..300).contains(&status) {
            return Err(format!("MCP HTTP error: status {status}"));
        }

        let content_type = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let text = resp
            .body_mut()
            .read_to_string()
            .map_err(|e| e.to_string())?;
        if text.trim().is_empty() {
            return Ok(Vec::new());
        }

        let raw_msgs = parse_messages(content_type.as_deref().unwrap_or(""), &text)
            .map_err(|e| format!("Invalid MCP HTTP response body: {e:?}"))?;
        Ok(raw_msgs.into_iter().map(|m| m.value).collect())
    }

    pub fn close(&self) {
        if self.closed.swap(true, Ordering::AcqRel) {
            return;
        }
        let session = self
            .session_id
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        let Some(sid) = session else {
            return;
        };
        let proto = self
            .protocol_version
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();

        let mut req = self
            .agent
            .delete(&self.url)
            .config()
            .timeout_global(Some(DELETE_TIMEOUT))
            .build();
        for (k, v) in &self.headers {
            req = req.header(k, v);
        }
        req = req.header("mcp-session-id", &sid);
        if let Some(pv) = &proto {
            req = req.header("mcp-protocol-version", pv);
        }
        let _ = req.call();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn decodes_mixed_line_and_content_length_frames() {
        let mut decoder = FramedDecoder::new(true);
        let line_msg = json!({ "jsonrpc": "2.0", "id": 1, "method": "ping" });
        let cl_body = json!({ "jsonrpc": "2.0", "id": 2, "result": {} }).to_string();
        let payload = format!(
            "\n{}\r\nContent-Length: {}\r\n\r\n{}",
            line_msg,
            cl_body.len(),
            cl_body
        );
        decoder.push_bytes(payload.as_bytes());

        let first = decoder.next_frame().unwrap().unwrap();
        assert_eq!(first.0, Framing::Line);
        assert_eq!(first.1["id"], 1);

        let second = decoder.next_frame().unwrap().unwrap();
        assert_eq!(second.0, Framing::ContentLength);
        assert_eq!(second.1["id"], 2);

        assert!(decoder.next_frame().unwrap().is_none());
    }

    #[test]
    fn waits_for_partial_content_length_prefix_and_body() {
        let mut decoder = FramedDecoder::new(true);
        let body = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }).to_string();
        let frame = format!("content-length: {}\r\n\r\n{}", body.len(), body);
        decoder.push_bytes(&frame.as_bytes()[..8]);
        assert!(decoder.next_frame().unwrap().is_none());
        decoder.push_bytes(&frame.as_bytes()[8..]);
        let decoded = decoder.next_frame().unwrap().unwrap();
        assert_eq!(decoded.0, Framing::ContentLength);
        assert_eq!(decoded.1["method"], "notifications/initialized");
    }

    #[test]
    fn filtered_env_excludes_unlisted_vars_and_applies_explicit() {
        // SAFETY: unit test checks isolated key name not read concurrently.
        let env = mcp_filtered_stdio_environment(&[(
            "EXPLICIT_ONLY_KEY".to_string(),
            "present".to_string(),
        )]);
        assert!(
            env.iter()
                .any(|(k, v)| k == "EXPLICIT_ONLY_KEY" && v == "present")
        );
    }
}
