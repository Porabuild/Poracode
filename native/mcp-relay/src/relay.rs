//! Core relay state machine, ported from `startMcpHttpRelay` in
//! `src/supervisor/mcp/mcpHttpRelay.ts`.
//!
//! Concurrency model: the stdin reader (main thread) only parses lines and
//! mutates shared state. Upstream POSTs run on worker threads spawned on
//! demand (bounded by `MAX_WORKERS`, idle ones exit after
//! `WORKER_IDLE_TIMEOUT`) fed by one FIFO channel, so a slow endpoint never
//! blocks framing and an idle relay keeps only the main, timer and signal
//! threads. Each
//! pending request owns a serial number; replies, timeouts, cancellations and
//! replacements settle entries by JSON-RPC id, and a worker drops its result
//! when its entry is no longer current — the same late-reply suppression the
//! JS relay gets from `AbortController` + `pending.get(id) !== entry`.
//! Request timeouts live on a single timer thread with a min-heap; each heap
//! entry carries a generation so a stale timer cannot fire for a replacement.
//! The initialize gate is a generation counter + condvar: every non-initialize
//! message waits for the latest initialize dispatch to finish, exactly like
//! awaiting the `initialized` promise captured at receive time.

use crate::config::RelayConfig;
use crate::messages::{
    self, ClientMessage, IdKey, RelayMessage, id_key, is_tools_list_result, parse_client_message,
    parse_messages,
};
use serde::Serialize;
use serde_json::Value;
use serde_json::value::RawValue;
use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap, HashSet, VecDeque};
use std::io::{self, Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock, Weak};
use std::thread;
use std::time::{Duration, Instant};
use ureq::Agent;

/// Matches the MCP SDK's stdio transport limit, counted in UTF-16 code units
/// like the JS relay's `buffer.length` — see `run_stdin_loop`.
pub const MAX_LINE_UNITS: usize = 10 * 1024 * 1024;
const DELETE_TIMEOUT: Duration = Duration::from_secs(1);
/// ureq's per-request ceiling for relayed calls and forwards: the relay
/// timeout plus slack so the relay's own timer always fires first, like the
/// JS `setTimeout`.
const REQUEST_TIMEOUT_MARGIN: Duration = Duration::from_secs(10);
/// Worker ceiling for relayed requests.
const MAX_WORKERS: usize = 16;
/// Worker ceiling for forwarded notifications/replies. Forwards have no
/// reply owed and can hang on a wedged endpoint, so they get their own
/// small pool — a stuck forward can never starve a request of a worker.
const MAX_FORWARD_WORKERS: usize = 4;
/// A worker that sees no job for this long exits, so an idle relay keeps
/// only the main, timer and signal threads.
const WORKER_IDLE_TIMEOUT: Duration = Duration::from_secs(30);

fn lock<'a, T>(mutex: &'a Mutex<T>) -> MutexGuard<'a, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

struct SessionState {
    session_id: Option<String>,
    protocol_version: Option<String>,
}

struct PendingEntry {
    method: String,
    serial: u64,
    init_gen: Option<u64>,
    id_raw: Box<RawValue>,
}

struct RequestJob {
    key: IdKey,
    serial: u64,
    line: String,
    wait_gen: Option<u64>,
    init_gen: Option<u64>,
    id_raw: Box<RawValue>,
}

enum Job {
    Request(RequestJob),
    Forward { line: String, wait_gen: u64 },
}

/// Generation gate standing in for the JS `initialized` promise. Each
/// `initialize` bumps the generation; a message captured at receive time
/// waits for exactly its own generation to resolve (or for close) — the
/// same per-dispatch promise the JS relay awaits. Generation 0 starts
/// resolved so messages received before any `initialize` never wait —
/// `server/discover` and the like pass straight through.
struct Gate {
    inner: Mutex<GateInner>,
    cv: Condvar,
}

struct GateInner {
    current_gen: u64,
    resolved: HashSet<u64>,
    /// Set under the lock by `wake_all` so the close predicate shares the
    /// condvar's mutex — a notify can never land between a waiter's check
    /// and its `cv.wait`.
    closed: bool,
}

impl Default for Gate {
    fn default() -> Self {
        Self {
            inner: Mutex::new(GateInner {
                current_gen: 0,
                resolved: HashSet::from([0]),
                closed: false,
            }),
            cv: Condvar::new(),
        }
    }
}

impl Gate {
    fn wait(&self, generation: u64) {
        let mut guard = lock(&self.inner);
        while !guard.resolved.contains(&generation) && !guard.closed {
            guard = self
                .cv
                .wait(guard)
                .unwrap_or_else(|error| error.into_inner());
        }
    }

    fn current_gen(&self) -> u64 {
        lock(&self.inner).current_gen
    }

    fn begin_initialize(&self) -> u64 {
        let mut guard = lock(&self.inner);
        guard.current_gen += 1;
        guard.current_gen
    }

    fn complete(&self, generation: u64) {
        {
            let mut guard = lock(&self.inner);
            guard.resolved.insert(generation);
        }
        self.cv.notify_all();
    }

    fn wake_all(&self) {
        {
            let mut guard = lock(&self.inner);
            guard.closed = true;
        }
        self.cv.notify_all();
    }
}

/// One FIFO job queue with on-demand workers. Queue, worker count and idle
/// count share a single mutex so the idle-exit re-check is atomic with
/// intake: `enqueue` pushes and decides under the same lock a timing-out
/// worker holds while it re-checks the queue and decrements its counts, so
/// a job can never be orphaned by a worker exiting mid-send.
struct Pool {
    inner: Mutex<PoolInner>,
    cv: Condvar,
}

struct PoolInner {
    queue: VecDeque<Job>,
    /// `false` after close; queued jobs still drain before workers exit.
    open: bool,
    /// Live worker threads, including ones blocked in `wait_timeout`.
    workers: usize,
    /// Workers currently inside the wait loop.
    idle: usize,
}

impl Pool {
    fn new() -> Self {
        Self {
            inner: Mutex::new(PoolInner {
                queue: VecDeque::new(),
                open: true,
                workers: 0,
                idle: 0,
            }),
            cv: Condvar::new(),
        }
    }

    fn close(&self) {
        {
            let mut inner = lock(&self.inner);
            inner.open = false;
        }
        self.cv.notify_all();
    }
}

#[derive(Default)]
struct Timers {
    inner: Mutex<TimerInner>,
    cv: Condvar,
}

#[derive(Default)]
struct TimerInner {
    /// Min-heap of (deadline, serial, request key). Serials are unique per
    /// request, so a replaced request's stale timer fire is harmless.
    heap: BinaryHeap<Reverse<(Instant, u64, IdKey)>>,
}

impl Timers {
    fn schedule(&self, key: IdKey, deadline: Instant, generation: u64) {
        {
            let mut inner = lock(&self.inner);
            inner.heap.push(Reverse((deadline, generation, key)));
        }
        self.cv.notify_one();
    }

    fn wake(&self) {
        self.cv.notify_all();
    }
}

#[derive(Serialize)]
struct DisabledToolReply<'a> {
    jsonrpc: &'static str,
    id: &'a RawValue,
    result: DisabledToolResult,
}

#[derive(Serialize)]
struct DisabledToolResult {
    #[serde(rename = "isError")]
    is_error: bool,
    content: Vec<DisabledToolContent>,
}

#[derive(Serialize)]
struct DisabledToolContent {
    r#type: &'static str,
    text: String,
}

#[derive(Serialize)]
struct ErrorReply<'a> {
    jsonrpc: &'static str,
    id: &'a RawValue,
    error: ErrorDetail<'a>,
}

#[derive(Serialize)]
struct ErrorDetail<'a> {
    code: i64,
    message: &'a str,
}

#[derive(Serialize)]
struct CancelParams<'a> {
    #[serde(rename = "requestId")]
    request_id: &'a RawValue,
    reason: &'static str,
}

#[derive(Serialize)]
struct CancelNotification<'a> {
    jsonrpc: &'static str,
    method: &'static str,
    params: CancelParams<'a>,
}

struct HttpResult {
    status: u16,
    content_type: String,
    body: String,
}

pub struct Relay {
    config: RelayConfig,
    url: String,
    agent_requests: Agent,
    agent_other: Agent,
    pending: Mutex<HashMap<IdKey, PendingEntry>>,
    session: Mutex<SessionState>,
    gate: Gate,
    timers: Timers,
    out: Mutex<io::Stdout>,
    closing: AtomicBool,
    close_mu: Mutex<bool>,
    close_cv: Condvar,
    serial: AtomicU64,
    /// Request pool: relayed JSON-RPC requests needing a reply.
    request_pool: Arc<Pool>,
    /// Forward pool: notifications, server replies and cancellations. Kept
    /// separate so a wedged endpoint can never starve requests of workers.
    forward_pool: Arc<Pool>,
    /// How long a worker idles before exiting; injectable for tests.
    worker_idle_timeout: Duration,
    /// Set once `start` finishes so `enqueue` can spawn workers on demand.
    me: OnceLock<Weak<Relay>>,
}

/// `keepAlive: false` parity plus the no-proxy rule: `node:http` ignores
/// proxy environment variables, so the agent is built with `.proxy(None)`
/// and pooling disabled — every request opens a fresh connection.
fn build_agent(timeout: Option<Duration>) -> Agent {
    Agent::config_builder()
        .proxy(None)
        .http_status_as_error(false)
        .max_redirects(0)
        .max_idle_connections(0)
        .user_agent("")
        .accept("")
        .timeout_global(timeout)
        .build()
        .into()
}

fn header_value(response: &ureq::http::Response<ureq::Body>, name: &str) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
}

fn push_header(headers: &mut Vec<(String, String)>, name: &str, value: &str) {
    headers.retain(|(existing, _)| !existing.eq_ignore_ascii_case(name));
    headers.push((name.to_string(), value.to_string()));
}

fn cancel_notification_line(id_raw: &RawValue) -> String {
    serde_json::to_string(&CancelNotification {
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: CancelParams {
            request_id: id_raw,
            reason: "Request timed out",
        },
    })
    .unwrap_or_default()
}

impl Relay {
    pub fn start(config: RelayConfig) -> Arc<Self> {
        Self::start_inner(config, WORKER_IDLE_TIMEOUT)
    }

    fn start_inner(config: RelayConfig, worker_idle_timeout: Duration) -> Arc<Self> {
        let url = config.url.clone();
        // Single source for the upstream ceiling: the relay timeout plus
        // slack, applied to both agents so the relay's own timer fires first.
        let request_timeout = config.timeout.saturating_add(REQUEST_TIMEOUT_MARGIN);
        let relay = Arc::new(Self {
            config,
            url,
            agent_requests: build_agent(Some(request_timeout)),
            agent_other: build_agent(Some(request_timeout)),
            pending: Mutex::new(HashMap::new()),
            session: Mutex::new(SessionState {
                session_id: None,
                protocol_version: None,
            }),
            gate: Gate::default(),
            timers: Timers::default(),
            out: Mutex::new(io::stdout()),
            closing: AtomicBool::new(false),
            close_mu: Mutex::new(false),
            close_cv: Condvar::new(),
            serial: AtomicU64::new(0),
            request_pool: Arc::new(Pool::new()),
            forward_pool: Arc::new(Pool::new()),
            worker_idle_timeout,
            me: OnceLock::new(),
        });
        let _ = relay.me.set(Arc::downgrade(&relay));
        {
            let relay = Arc::clone(&relay);
            thread::spawn(move || timer_loop(&relay));
        }
        relay
    }

    pub fn is_closed(&self) -> bool {
        self.closing.load(Ordering::SeqCst)
    }

    /// Idempotent and blocking: concurrent callers wait until cleanup
    /// (pending drain + session DELETE) has finished, then every caller may
    /// exit. Mirrors `close()` + the worker's `closed.then(exit)`.
    pub fn close(&self) {
        if self.closing.swap(true, Ordering::SeqCst) {
            let mut done = lock(&self.close_mu);
            while !*done {
                done = self
                    .close_cv
                    .wait(done)
                    .unwrap_or_else(|error| error.into_inner());
            }
            return;
        }
        self.gate.wake_all();
        self.timers.wake();
        // Close both pools: workers drain queued jobs (which see `closing`)
        // and exit once the queue empties.
        self.request_pool.close();
        self.forward_pool.close();
        let entries: Vec<PendingEntry> = {
            let mut pending = lock(&self.pending);
            pending.drain().map(|(_, entry)| entry).collect()
        };
        for entry in &entries {
            self.complete_init(entry);
        }
        let session_id = lock(&self.session).session_id.clone();
        if session_id.is_some_and(|id| !id.is_empty()) {
            self.delete_session();
        }
        *lock(&self.close_mu) = true;
        self.close_cv.notify_all();
    }

    /// One stdin line, already stripped of its newline and trailing CR.
    pub fn receive(&self, line: String) {
        let Some(message) = parse_client_message(&line) else {
            return;
        };
        let ClientMessage {
            method,
            id_raw,
            id_key,
            params,
        } = message;
        match (method, id_key, id_raw) {
            (Some(method), Some(key), Some(id_raw)) => {
                self.receive_request(method, key, id_raw, params, line);
            }
            (method, _, _) => {
                if method.as_deref() == Some("notifications/cancelled") {
                    self.receive_cancel(params, line);
                } else {
                    self.enqueue_forward(line);
                }
            }
        }
    }

    fn enqueue(&self, job: Job) {
        let (pool, max_workers) = match &job {
            Job::Request(_) => (&self.request_pool, MAX_WORKERS),
            Job::Forward { .. } => (&self.forward_pool, MAX_FORWARD_WORKERS),
        };
        let mut inner = lock(&pool.inner);
        if !inner.open {
            return;
        }
        inner.queue.push_back(job);
        pool.cv.notify_one();
        // Spawn on demand: only when no live worker is idle and the pool is
        // below its bound. This check shares the queue lock, so it is atomic
        // with a worker's idle-exit re-check — a job is never left queued
        // behind a worker that intake failed to replace.
        if self.closing.load(Ordering::SeqCst) || inner.idle > 0 || inner.workers >= max_workers {
            return;
        }
        inner.workers += 1;
        let Some(relay) = self.me.get().and_then(|weak| weak.upgrade()) else {
            inner.workers -= 1;
            return;
        };
        let pool = Arc::clone(pool);
        drop(inner);
        thread::spawn(move || worker_loop(&relay, &pool));
    }

    fn enqueue_forward(&self, line: String) {
        self.enqueue(Job::Forward {
            line,
            wait_gen: self.gate.current_gen(),
        });
    }

    fn receive_request(
        &self,
        method: String,
        key: IdKey,
        id_raw: Box<RawValue>,
        params: Option<Value>,
        line: String,
    ) {
        if method == "tools/call" {
            let name = params
                .as_ref()
                .and_then(|value| value.get("name"))
                .and_then(Value::as_str);
            if let Some(name) = name
                && self.config.disabled_tools.contains(name)
            {
                self.emit_disabled_tool_call(&id_raw, name);
                return;
            }
        }
        // A reused id replaces the pending request: settle the old one; its
        // worker sees a stale serial and drops the late response.
        self.settle_external(&key);
        let serial = self.serial.fetch_add(1, Ordering::SeqCst) + 1;
        let init_gen = if method == "initialize" {
            Some(self.gate.begin_initialize())
        } else {
            None
        };
        let entry = PendingEntry {
            method: method.clone(),
            serial,
            init_gen,
            id_raw: id_raw.clone(),
        };
        lock(&self.pending).insert(key.clone(), entry);
        let deadline = Instant::now()
            .checked_add(self.config.timeout)
            .unwrap_or_else(Instant::now);
        self.timers.schedule(key.clone(), deadline, serial);
        let wait_gen = if method == "initialize" {
            None
        } else {
            Some(self.gate.current_gen())
        };
        self.enqueue(Job::Request(RequestJob {
            key,
            serial,
            line,
            wait_gen,
            init_gen,
            id_raw,
        }));
    }

    fn receive_cancel(&self, params: Option<Value>, line: String) {
        let request_key = params
            .as_ref()
            .and_then(|value| value.get("requestId"))
            .and_then(id_key);
        if let Some(key) = request_key
            && let Some(entry) = self.settle_external(&key)
        {
            // Initialize is never cancelled upstream; the in-flight
            // request is released by the settle alone. Other methods get
            // the client's cancellation line forwarded first.
            if entry.method != "initialize" {
                self.enqueue_forward(line);
            }
            return;
        }
        self.enqueue_forward(line);
    }

    fn run_job(&self, job: Job) {
        match job {
            Job::Request(job) => {
                self.request_inner(&job);
                if let Some(generation) = job.init_gen {
                    self.gate.complete(generation);
                }
            }
            Job::Forward { line, wait_gen } => self.forward(line, wait_gen),
        }
    }

    fn request_inner(&self, job: &RequestJob) {
        if let Some(generation) = job.wait_gen {
            self.gate.wait(generation);
        }
        // `dispatch` parity: after the gate await, a request that was
        // timed out, cancelled or replaced while queued is never sent.
        if self.closing.load(Ordering::SeqCst) || !self.is_current(&job.key, job.serial) {
            return;
        }
        match self.post(
            &job.line,
            &self.agent_requests,
            Some((&job.key, job.serial)),
        ) {
            Err(message) => {
                if self.settle_if_current(&job.key, job.serial).is_none() {
                    return;
                }
                self.fail_raw(&job.id_raw, -32603, &message);
            }
            Ok(result) => {
                if result.status >= 300 {
                    if self.settle_if_current(&job.key, job.serial).is_some() {
                        self.fail_raw(
                            &job.id_raw,
                            -32603,
                            &format!("MCP server responded with HTTP {}", result.status),
                        );
                    }
                    return;
                }
                let messages = match parse_messages(&result.content_type, &result.body) {
                    Ok(messages) => messages,
                    Err(error) => {
                        if self.settle_if_current(&job.key, job.serial).is_some() {
                            self.fail_raw(&job.id_raw, -32603, &error.to_string());
                        }
                        return;
                    }
                };
                let mut deliver_error = None;
                for message in messages {
                    if let Err(error) = self.deliver(message) {
                        deliver_error = Some(error);
                        break;
                    }
                }
                if let Some(error) = deliver_error {
                    if self.settle_if_current(&job.key, job.serial).is_some() {
                        self.fail_raw(&job.id_raw, -32603, &error);
                    }
                    return;
                }
                if self.settle_if_current(&job.key, job.serial).is_some() {
                    self.fail_raw(&job.id_raw, -32603, "MCP server returned no response");
                }
            }
        }
    }

    fn forward(&self, line: String, wait_gen: u64) {
        self.gate.wait(wait_gen);
        if self.closing.load(Ordering::SeqCst) {
            return;
        }
        let Ok(result) = self.post(&line, &self.agent_other, None) else {
            return;
        };
        if result.status >= 300 {
            return;
        }
        let Ok(messages) = parse_messages(&result.content_type, &result.body) else {
            return;
        };
        for message in messages {
            if self.deliver(message).is_err() {
                break;
            }
        }
    }

    fn request_timeout(&self, key: &IdKey, serial: u64) {
        let entry = {
            let mut pending = lock(&self.pending);
            match pending.get(key) {
                Some(entry) if entry.serial == serial => pending.remove(key),
                _ => None,
            }
        };
        let Some(entry) = entry else {
            return;
        };
        self.complete_init(&entry);
        // Initialize is never cancelled upstream; anything else gets the
        // synthesized cancellation forwarded before the client is told.
        if entry.method != "initialize" {
            self.enqueue(Job::Forward {
                line: cancel_notification_line(&entry.id_raw),
                wait_gen: self.gate.current_gen(),
            });
        }
        self.fail_raw(&entry.id_raw, -32001, "Request timed out");
    }

    /// `deliver` from the JS relay: replies settle their pending request;
    /// everything else — and replies that arrive too late — writes through
    /// (or drops). Unmodified messages keep their received bytes.
    fn deliver(&self, message: RelayMessage) -> Result<(), String> {
        if message.value.is_null() {
            return Err("Cannot read properties of null (reading 'method')".to_string());
        }
        let reply_key = if message.value.get("method").is_none() {
            message.value.get("id").and_then(id_key)
        } else {
            None
        };
        if let Some(key) = reply_key {
            let Some(entry) = self.settle_plain(&key) else {
                // Late response after timeout, cancellation or replacement.
                return Ok(());
            };
            if entry.method == "initialize"
                && let Some(version) = message
                    .value
                    .pointer("/result/protocolVersion")
                    .and_then(Value::as_str)
            {
                lock(&self.session).protocol_version = Some(version.to_string());
            }
            if entry.method == "tools/list" && is_tools_list_result(&message.value) {
                let mut value = message.value.clone();
                match messages::filter_tools_list(&mut value, &self.config.disabled_tools) {
                    Ok(_) => {
                        self.emit_json(&value);
                        return Ok(());
                    }
                    Err(error) => return Err(error.to_string()),
                }
            }
        }
        self.emit_raw(&message.raw);
        Ok(())
    }

    fn session_headers(&self) -> Vec<(String, String)> {
        let session = lock(&self.session);
        let mut headers = self.config.headers.clone();
        if let Some(session_id) = session.session_id.as_deref().filter(|id| !id.is_empty()) {
            push_header(&mut headers, "mcp-session-id", session_id);
        }
        if let Some(version) = session
            .protocol_version
            .as_deref()
            .filter(|version| !version.is_empty())
        {
            push_header(&mut headers, "mcp-protocol-version", version);
        }
        headers
    }

    /// `reply_to` identifies the pending request this POST answers. Its
    /// session headers are captured only while that request is still
    /// current — a late initialize reply must not establish a session a
    /// retried initialize would then carry. `None` (forwards) keeps the
    /// JS relay's behaviour of capturing from every response.
    fn post(
        &self,
        line: &str,
        agent: &Agent,
        reply_to: Option<(&IdKey, u64)>,
    ) -> Result<HttpResult, String> {
        let mut request = agent.post(self.url.as_str());
        for (name, value) in self.session_headers() {
            request = request.header(name.as_str(), value.as_str());
        }
        request = request
            .header("content-type", "application/json")
            .header("accept", "application/json, text/event-stream");
        let mut response = request.send(line).map_err(|error| error.to_string())?;
        let capture = match reply_to {
            Some((key, serial)) => self.is_current(key, serial),
            None => true,
        };
        if capture {
            self.capture_session(&response);
        }
        let status = response.status().as_u16();
        let content_type = header_value(&response, "content-type").unwrap_or_default();
        let body = read_body(&mut response)?;
        Ok(HttpResult {
            status,
            content_type,
            body,
        })
    }

    fn capture_session(&self, response: &ureq::http::Response<ureq::Body>) {
        let Some(session_id) = header_value(response, "mcp-session-id") else {
            return;
        };
        let mut session = lock(&self.session);
        if session.session_id.is_none() {
            session.session_id = Some(session_id);
        }
    }

    fn delete_session(&self) {
        let mut request = self.agent_other.delete(self.url.as_str());
        for (name, value) in self.session_headers() {
            request = request.header(name.as_str(), value.as_str());
        }
        let request = request
            .config()
            .timeout_global(Some(DELETE_TIMEOUT))
            .build();
        let _ = request.call();
    }

    fn settle_plain(&self, key: &IdKey) -> Option<PendingEntry> {
        lock(&self.pending).remove(key)
    }

    /// Removes the pending entry only while `serial` is still current — the
    /// serial check and the remove share one lock, so a same-id replacement
    /// cannot slip between them and be evicted with its reply dropped.
    fn settle_if_current(&self, key: &IdKey, serial: u64) -> Option<PendingEntry> {
        let mut pending = lock(&self.pending);
        match pending.get(key) {
            Some(entry) if entry.serial == serial => pending.remove(key),
            _ => None,
        }
    }

    /// Settles like `settle` plus the gate side effect an aborted initialize
    /// dispatch would have had in the JS relay.
    fn settle_external(&self, key: &IdKey) -> Option<PendingEntry> {
        let entry = self.settle_plain(key);
        if let Some(entry) = &entry {
            self.complete_init(entry);
        }
        entry
    }

    fn complete_init(&self, entry: &PendingEntry) {
        if let Some(generation) = entry.init_gen {
            self.gate.complete(generation);
        }
    }

    fn is_current(&self, key: &IdKey, serial: u64) -> bool {
        lock(&self.pending)
            .get(key)
            .is_some_and(|entry| entry.serial == serial)
    }

    fn fail_raw(&self, id_raw: &RawValue, code: i64, message: &str) {
        self.emit_struct(&ErrorReply {
            jsonrpc: "2.0",
            id: id_raw,
            error: ErrorDetail { code, message },
        });
    }

    fn emit_disabled_tool_call(&self, id_raw: &RawValue, name: &str) {
        self.emit_struct(&DisabledToolReply {
            jsonrpc: "2.0",
            id: id_raw,
            result: DisabledToolResult {
                is_error: true,
                content: vec![DisabledToolContent {
                    r#type: "text",
                    text: format!("Tool disabled by Poracode: {name}"),
                }],
            },
        });
    }

    fn emit_json(&self, value: &Value) {
        self.emit_raw(&value.to_string());
    }

    fn emit_struct<T: Serialize>(&self, value: &T) {
        if let Ok(text) = serde_json::to_string(value) {
            self.emit_raw(&text);
        }
    }

    fn emit_raw(&self, raw: &str) {
        if !self.write_line(raw) {
            self.output_failed();
        }
    }

    /// Writes one NDJSON line. Unmodified messages go out byte-for-byte with
    /// only CR/LF stripped — raw newlines inside a JSON text are insignificant
    /// whitespace, and stripping them keeps the line delimiter intact.
    fn write_line(&self, text: &str) -> bool {
        let mut out = lock(&self.out);
        if self.closing.load(Ordering::SeqCst) {
            return true;
        }
        write_stripped(&mut *out, text).is_ok()
    }

    fn output_failed(&self) {
        self.close();
        std::process::exit(0);
    }
}

fn write_stripped<W: Write>(out: &mut W, text: &str) -> io::Result<()> {
    let bytes = text.as_bytes();
    let mut start = 0;
    for (index, byte) in bytes.iter().enumerate() {
        if matches!(byte, b'\n' | b'\r') {
            out.write_all(&bytes[start..index])?;
            start = index + 1;
        }
    }
    out.write_all(&bytes[start..])?;
    out.write_all(b"\n")?;
    out.flush()
}

fn read_body(response: &mut ureq::http::Response<ureq::Body>) -> Result<String, String> {
    let mut bytes = Vec::new();
    response
        .body_mut()
        .as_reader()
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Pulls jobs from the pool until the idle timeout expires or the pool
/// closes and drains. The timeout re-check, count decrement and queue drain
/// all happen under the pool lock, atomically with `enqueue`'s intake
/// decision — a job sent while this worker exits is either taken here or
/// triggers a replacement spawn, never orphaned.
fn worker_loop(relay: &Arc<Relay>, pool: &Arc<Pool>) {
    loop {
        let job = {
            let mut inner = lock(&pool.inner);
            loop {
                if let Some(job) = inner.queue.pop_front() {
                    break Some(job);
                }
                if !inner.open || relay.closing.load(Ordering::SeqCst) {
                    // Pool closed and drained: this worker exits. Counts are
                    // decremented under the same lock `enqueue` uses, so a
                    // racing send sees the freed slot and spawns a
                    // replacement instead of orphaning the job.
                    inner.workers -= 1;
                    return;
                }
                inner.idle += 1;
                let (guard, timeout) = pool
                    .cv
                    .wait_timeout(inner, relay.worker_idle_timeout)
                    .unwrap_or_else(|error| error.into_inner());
                inner = guard;
                inner.idle -= 1;
                // Exit only when the full idle timeout elapsed; a notify or
                // spurious wakeup loops back to the queue check instead.
                if timeout.timed_out() && inner.queue.is_empty() {
                    // Counts drop under the same lock `enqueue` uses, so a
                    // racing send sees the freed slot and spawns a
                    // replacement instead of orphaning the job.
                    inner.workers -= 1;
                    return;
                }
            }
        };
        if let Some(job) = job {
            relay.run_job(job);
        }
    }
}

fn timer_loop(relay: &Arc<Relay>) {
    loop {
        let fired = {
            let mut inner = lock(&relay.timers.inner);
            loop {
                if relay.closing.load(Ordering::SeqCst) {
                    return;
                }
                let deadline = match inner.heap.peek() {
                    None => {
                        inner = relay
                            .timers
                            .cv
                            .wait(inner)
                            .unwrap_or_else(|error| error.into_inner());
                        continue;
                    }
                    Some(Reverse((deadline, ..))) => *deadline,
                };
                let now = Instant::now();
                if deadline <= now {
                    break inner.heap.pop().map(|Reverse(entry)| entry);
                }
                let (guard, _) = relay
                    .timers
                    .cv
                    .wait_timeout(inner, deadline - now)
                    .unwrap_or_else(|error| error.into_inner());
                inner = guard;
            }
        };
        if let Some((_, generation, key)) = fired {
            relay.request_timeout(&key, generation);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::RelayConfig;
    use std::collections::HashSet;

    fn test_config() -> RelayConfig {
        RelayConfig {
            url: "http://127.0.0.1:9/mcp".to_string(),
            headers: Vec::new(),
            timeout: Duration::from_secs(5),
            disabled_tools: HashSet::new(),
        }
    }

    /// Answers every request with 202 at once. Pool tests use it instead of a
    /// closed port: Windows retries loopback SYNs for about 2 s before
    /// refusing, which would make them measure the OS rather than the pool.
    fn accepting_config() -> RelayConfig {
        use std::io::BufRead;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                thread::spawn(move || {
                    let mut reader = io::BufReader::new(stream.try_clone().unwrap());
                    let mut length = 0usize;
                    loop {
                        let mut line = String::new();
                        if reader.read_line(&mut line).unwrap_or(0) == 0 {
                            return;
                        }
                        let line = line.trim_end().to_ascii_lowercase();
                        if line.is_empty() {
                            break;
                        }
                        if let Some(value) = line.strip_prefix("content-length:") {
                            length = value.trim().parse().unwrap_or(0);
                        }
                    }
                    let mut body = vec![0; length];
                    let _ = reader.read_exact(&mut body);
                    let _ = stream.write_all(
                        b"HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    );
                });
            }
        });
        RelayConfig {
            url: format!("http://127.0.0.1:{port}/mcp"),
            ..test_config()
        }
    }

    fn pool_workers(pool: &Pool) -> usize {
        lock(&pool.inner).workers
    }

    fn wait_for(mut check: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if check() {
                return;
            }
            thread::sleep(Duration::from_millis(5));
        }
        assert!(check(), "condition not met in time");
    }

    #[test]
    fn workers_spawn_on_demand_and_stop_on_close() {
        let relay = Relay::start(accepting_config());
        // An idle relay has no worker threads at all.
        assert_eq!(pool_workers(&relay.request_pool), 0);
        assert_eq!(pool_workers(&relay.forward_pool), 0);
        relay.receive(r#"{"jsonrpc":"2.0","method":"notifications/tick"}"#.to_string());
        // The forwarded job spawned exactly one worker.
        wait_for(|| pool_workers(&relay.forward_pool) == 1);
        relay.close();
        // The closed pool drains and the worker exits.
        wait_for(|| pool_workers(&relay.forward_pool) == 0);
    }

    #[test]
    fn workers_exit_cleanly_around_the_idle_boundary() {
        // A short injectable idle timeout stresses jobs racing worker
        // exit: every enqueued job must be taken — the queue drains and the
        // pool settles at zero workers. An orphaned job would leave the
        // queue non-empty forever and fail the wait.
        let relay = Relay::start_inner(accepting_config(), Duration::from_millis(50));
        for index in 0..200 {
            relay.enqueue(Job::Forward {
                line: format!(
                    r#"{{"jsonrpc":"2.0","method":"notifications/tick","params":{{"i":{index}}}}}"#
                ),
                wait_gen: 0,
            });
            thread::sleep(Duration::from_millis(2));
        }
        wait_for(|| {
            let inner = lock(&relay.forward_pool.inner);
            inner.queue.is_empty() && inner.workers == 0
        });
        relay.close();
    }

    #[test]
    fn settle_if_current_only_removes_the_current_serial() {
        // The serial check and the remove share one lock: a stale worker
        // must not evict a same-id replacement that arrived in between.
        let relay = Relay::start(test_config());
        let key = crate::messages::id_key(&serde_json::json!(7)).unwrap();
        let entry = |serial: u64| PendingEntry {
            method: "tools/call".to_string(),
            serial,
            init_gen: None,
            id_raw: serde_json::value::RawValue::from_string("7".to_string()).unwrap(),
        };
        lock(&relay.pending).insert(key.clone(), entry(1));
        assert!(relay.settle_if_current(&key, 2).is_none());
        assert!(relay.is_current(&key, 1));
        assert!(relay.settle_if_current(&key, 1).is_some());
        assert!(!relay.is_current(&key, 1));
        relay.close();
    }

    #[test]
    fn write_stripped_removes_only_cr_and_lf() {
        let mut buf = Vec::new();
        write_stripped(&mut buf, "{\"a\":1,\n  \"b\": [1,\r\n2]}\r\n").unwrap();
        assert_eq!(
            String::from_utf8(buf).unwrap(),
            "{\"a\":1,  \"b\": [1,2]}\n"
        );
        let mut buf = Vec::new();
        write_stripped(&mut buf, "plain").unwrap();
        assert_eq!(String::from_utf8(buf).unwrap(), "plain\n");
    }

    #[test]
    fn cancel_line_embeds_raw_id() {
        let raw: Box<RawValue> = serde_json::from_str("1e2").unwrap();
        let line = cancel_notification_line(&raw);
        assert_eq!(
            line,
            r#"{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1e2,"reason":"Request timed out"}}"#
        );
        let raw: Box<RawValue> = serde_json::from_str(r#""id-1""#).unwrap();
        let line = cancel_notification_line(&raw);
        assert!(line.contains(r#""requestId":"id-1""#));
    }

    #[test]
    fn fail_reply_preserves_raw_id_lexeme() {
        let raw: Box<RawValue> = serde_json::from_str("1.50").unwrap();
        let text = serde_json::to_string(&ErrorReply {
            jsonrpc: "2.0",
            id: &raw,
            error: ErrorDetail {
                code: -32001,
                message: "Request timed out",
            },
        })
        .unwrap();
        assert_eq!(
            text,
            r#"{"jsonrpc":"2.0","id":1.50,"error":{"code":-32001,"message":"Request timed out"}}"#
        );
    }
}
