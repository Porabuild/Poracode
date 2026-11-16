//! Shared test harness: a std-only mock HTTP MCP server and a spawned
//! `poracode-mcp-relay` process. No external crates — everything runs on
//! `std::net`/`std::process`.

#![allow(dead_code)]

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub const RELAY_BIN: &str = env!("CARGO_BIN_EXE_poracode-mcp-relay");

#[derive(Clone, Debug)]
pub struct RecordedRequest {
    pub method: String,
    pub path: String,
    pub peer_port: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

impl RecordedRequest {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    pub fn json_body(&self) -> serde_json::Value {
        serde_json::from_str(&self.body).unwrap_or(serde_json::Value::Null)
    }
}

/// Handler receives the parsed request and owns the connection: write a
/// response, hold it open, or drop it.
pub type Handler = Arc<dyn Fn(RecordedRequest, TcpStream) + Send + Sync>;

pub struct MockServer {
    pub addr: SocketAddr,
    pub requests: Arc<Mutex<Vec<RecordedRequest>>>,
    shutdown: Arc<AtomicBool>,
    accept_thread: Option<thread::JoinHandle<()>>,
}

impl MockServer {
    pub fn url(&self) -> String {
        format!("http://{}", self.addr)
    }

    pub fn start(handler: Handler) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
        listener.set_nonblocking(true).expect("nonblocking");
        let addr = listener.local_addr().expect("local addr");
        let requests = Arc::new(Mutex::new(Vec::new()));
        let shutdown = Arc::new(AtomicBool::new(false));
        let accept_thread = {
            let requests = Arc::clone(&requests);
            let shutdown = Arc::clone(&shutdown);
            thread::spawn(move || {
                while !shutdown.load(Ordering::SeqCst) {
                    match listener.accept() {
                        Ok((stream, _)) => {
                            // Accepted sockets inherit O_NONBLOCK from the
                            // listener on BSD/macOS; restore blocking mode or
                            // reads fail with EAGAIN before the client sends.
                            let _ = stream.set_nonblocking(false);
                            let requests = Arc::clone(&requests);
                            let handler = Arc::clone(&handler);
                            thread::spawn(move || handle_connection(stream, requests, handler));
                        }
                        Err(_) => thread::sleep(Duration::from_millis(2)),
                    }
                }
            })
        };
        Self {
            addr,
            requests,
            shutdown,
            accept_thread: Some(accept_thread),
        }
    }

    pub fn recorded(&self) -> Vec<RecordedRequest> {
        self.requests.lock().unwrap().clone()
    }

    pub fn wait_for_requests(&self, count: usize, timeout: Duration) -> Vec<RecordedRequest> {
        let deadline = Instant::now() + timeout;
        loop {
            let recorded = self.recorded();
            if recorded.len() >= count || Instant::now() >= deadline {
                return recorded;
            }
            thread::sleep(Duration::from_millis(5));
        }
    }
}

impl Drop for MockServer {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::SeqCst);
        if let Some(thread) = self.accept_thread.take() {
            let _ = thread.join();
        }
    }
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Reads one HTTP request (headers + content-length body). Returns `None` on
/// EOF or a malformed head; the connection thread then exits.
fn read_request(stream: &mut TcpStream) -> Option<RecordedRequest> {
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .ok()?;
    let mut buf = Vec::new();
    let mut tmp = [0u8; 16 * 1024];
    let head_end = loop {
        if let Some(pos) = find_subslice(&buf, b"\r\n\r\n") {
            break pos + 4;
        }
        if buf.len() > 4 * 1024 * 1024 {
            return None;
        }
        match stream.read(&mut tmp) {
            Ok(0) | Err(_) => return None,
            Ok(count) => buf.extend_from_slice(&tmp[..count]),
        }
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).into_owned();
    let mut lines = head.split("\r\n");
    let request_line = lines.next().unwrap_or_default();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = parts.next().unwrap_or_default().to_string();
    let mut headers = Vec::new();
    let mut content_length = 0usize;
    for line in lines {
        if line.is_empty() {
            continue;
        }
        if let Some((name, value)) = line.split_once(':') {
            let name = name.trim().to_string();
            let value = value.trim().to_string();
            if name.eq_ignore_ascii_case("content-length") {
                content_length = value.parse().unwrap_or(0);
            }
            headers.push((name, value));
        }
    }
    let mut body = buf[head_end..].to_vec();
    while body.len() < content_length {
        match stream.read(&mut tmp) {
            Ok(0) | Err(_) => break,
            Ok(count) => body.extend_from_slice(&tmp[..count]),
        }
    }
    body.truncate(content_length);
    Some(RecordedRequest {
        method,
        path,
        peer_port: 0,
        headers,
        body: String::from_utf8_lossy(&body).into_owned(),
    })
}

fn handle_connection(
    stream: TcpStream,
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    handler: Handler,
) {
    let mut stream = stream;
    let peer_port = stream
        .peer_addr()
        .map(|addr| addr.port())
        .unwrap_or_default();
    // Every response is `connection: close`, so one request per connection.
    let Some(mut recorded) = read_request(&mut stream) else {
        return;
    };
    recorded.peer_port = peer_port;
    requests.lock().unwrap().push(recorded.clone());
    handler(recorded, stream.try_clone().expect("clone stream"));
    // Drain until the client closes so the final close sees an empty receive
    // buffer — closing with unread inbound bytes makes the kernel send RST
    // and the client observes a peer disconnect instead of the response it
    // already received.
    let mut sink = [0u8; 16 * 1024];
    loop {
        match stream.read(&mut sink) {
            Ok(0) | Err(_) => return,
            Ok(_) => continue,
        }
    }
}

/// Writes `HTTP/1.1 <status>` + headers + body, then half-closes the write
/// side. `Shutdown::Write` (not `Both`) so the FIN follows the response
/// without discarding unread receive data — closing both directions with
/// pending inbound bytes makes the kernel send RST and the client sees a
/// peer disconnect instead of the response.
pub fn respond(stream: &mut TcpStream, status: u16, headers: &[(&str, &str)], body: &str) {
    let reason = match status {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        404 => "Not Found",
        500 => "Internal Server Error",
        _ => "Status",
    };
    let mut head = format!("HTTP/1.1 {status} {reason}\r\nconnection: close\r\n");
    for (name, value) in headers {
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    head.push_str(&format!("content-length: {}\r\n\r\n", body.len()));
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body.as_bytes());
    let _ = stream.flush();
    let _ = stream.shutdown(Shutdown::Write);
}

pub fn respond_json(stream: &mut TcpStream, status: u16, body: &str) {
    respond(
        stream,
        status,
        &[("content-type", "application/json")],
        body,
    );
}

/// Writes raw response bytes (e.g. an SSE stream) and closes.
pub fn respond_raw(stream: &mut TcpStream, head_and_body: &str) {
    let _ = stream.write_all(head_and_body.as_bytes());
    let _ = stream.flush();
    let _ = stream.shutdown(Shutdown::Write);
}

/// Holds the connection open without responding until the process ends.
pub fn hold(stream: TcpStream) {
    let _stream = stream;
    loop {
        thread::park();
    }
}

fn base64url_encode(text: &str) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(text.as_bytes())
}

pub fn relay_config(url: &str) -> String {
    relay_config_with(url, "{}", "5000", "[]")
}

pub fn relay_config_with(url: &str, headers: &str, timeout_ms: &str, disabled: &str) -> String {
    let json = format!(
        r#"{{"version":1,"url":"{url}","headers":{headers},"timeoutMs":{timeout_ms},"disabledTools":{disabled}}}"#
    );
    base64url_encode(&json)
}

/// Runs `poracode-mcp-relay --hello` and returns the captured output.
pub fn run_hello() -> std::process::Output {
    Command::new(RELAY_BIN)
        .arg("--hello")
        .stdin(Stdio::null())
        .output()
        .expect("run --hello")
}

pub struct RelayProcess {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: Arc<Mutex<std::sync::mpsc::Receiver<String>>>,
    stderr_lines: Arc<Mutex<Vec<String>>>,
    exited: bool,
}

impl RelayProcess {
    pub fn spawn(config: Option<&str>, extra_env: &[(&str, &str)]) -> Self {
        let mut command = Command::new(RELAY_BIN);
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for key in poracode_mcp_relay::config::MCP_HELPER_CONFIG_ENVS {
            command.env_remove(key);
        }
        if let Some(config) = config {
            command.env("PORACODE_MCP_HTTP_RELAY_CONFIG", config);
        }
        for (name, value) in extra_env {
            command.env(name, value);
        }
        let mut child = command.spawn().expect("spawn relay");
        let stdin = child.stdin.take().expect("stdin");
        let stdout = child.stdout.take().expect("stdout");
        let stderr = child.stderr.take().expect("stderr");
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(line) => {
                        if tx.send(line).is_err() {
                            return;
                        }
                    }
                    Err(_) => return,
                }
            }
        });
        let stderr_lines = Arc::new(Mutex::new(Vec::new()));
        {
            let stderr_lines = Arc::clone(&stderr_lines);
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    match line {
                        Ok(line) => stderr_lines.lock().unwrap().push(line),
                        Err(_) => return,
                    }
                }
            });
        }
        Self {
            child,
            stdin: Some(stdin),
            lines: Arc::new(Mutex::new(rx)),
            stderr_lines,
            exited: false,
        }
    }

    fn stdin(&mut self) -> &mut ChildStdin {
        self.stdin.as_mut().expect("stdin open")
    }

    pub fn send(&mut self, line: &str) {
        writeln!(self.stdin(), "{line}").expect("write stdin");
        self.stdin().flush().expect("flush stdin");
    }

    pub fn send_raw(&mut self, bytes: &[u8]) {
        self.stdin().write_all(bytes).expect("write stdin");
        self.stdin().flush().expect("flush stdin");
    }

    /// For tests where the relay may close stdin mid-write (oversize line).
    pub fn send_raw_lossy(&mut self, bytes: &[u8]) {
        if let Some(stdin) = self.stdin.as_mut() {
            let _ = stdin.write_all(bytes);
            let _ = stdin.flush();
        }
    }

    /// Reads one stdout line, returning `None` on timeout.
    pub fn recv(&self, timeout: Duration) -> Option<String> {
        self.lines.lock().unwrap().recv_timeout(timeout).ok()
    }

    /// Reads up to `count` lines within `timeout` total; returns what arrived.
    pub fn recv_lines(&self, count: usize, timeout: Duration) -> Vec<String> {
        let deadline = Instant::now() + timeout;
        let mut out = Vec::new();
        while out.len() < count {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            match self.recv(remaining) {
                Some(line) => out.push(line),
                None => break,
            }
        }
        out
    }

    /// Collects whatever arrives within `timeout`.
    pub fn expect_silence(&self, timeout: Duration) -> Vec<String> {
        self.recv_lines(usize::MAX, timeout)
    }

    /// Closes stdin, producing EOF for the relay like the JS worker's `end`.
    pub fn close_stdin(&mut self) {
        drop(self.stdin.take());
    }

    pub fn stderr(&self) -> Vec<String> {
        self.stderr_lines.lock().unwrap().clone()
    }

    /// Waits for exit; kills the child if it is still running after `timeout`.
    pub fn wait_exit(&mut self, timeout: Duration) -> Option<ExitStatus> {
        let deadline = Instant::now() + timeout;
        loop {
            match self.child.try_wait() {
                Ok(Some(status)) => {
                    self.exited = true;
                    return Some(status);
                }
                Ok(None) => {
                    if Instant::now() >= deadline {
                        let _ = self.child.kill();
                        let _ = self.child.wait();
                        self.exited = true;
                        return None;
                    }
                    thread::sleep(Duration::from_millis(5));
                }
                Err(_) => return None,
            }
        }
    }
}

impl Drop for RelayProcess {
    fn drop(&mut self) {
        if !self.exited {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}
