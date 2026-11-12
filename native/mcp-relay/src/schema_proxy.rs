//! Wire-level MCP schema proxy (`PORACODE_MCP_FILTER_CONFIG_V2` / `V3` with
//! `schemaOnly: true`), ported from `src/supervisor/mcp/mcpSchemaProxy.ts`.
//!
//! Preserves all MCP capabilities (tools, resources, prompts, roots, sampling,
//! notifications, and `line` / `Content-Length` framing) while rewriting only
//! `tools/list` response tool definitions through
//! [`crate::schema::limit_tool_schema_depth`] and
//! [`crate::schema::omit_invalid_schema_patterns`].

use crate::config::{FilterConfig, UpstreamTransportConfig};
use crate::framing::{
    Framing, HttpPeer, ManagedChild, SUPPORTED_PROTOCOL_VERSIONS, mcp_owned_stdio_environment,
    read_framed_stream, write_framed_message,
};
use crate::messages::{IdKey, id_key};
use crate::schema::{limit_tool_schema_depth, omit_invalid_schema_patterns};
use serde_json::Value;
use std::collections::{HashSet, VecDeque};
use std::io::{self, BufWriter};
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

enum UpstreamHandle {
    Stdio(Arc<ManagedChild>),
    Http(Arc<HttpPeer>),
}

impl UpstreamHandle {
    fn close(&self) {
        match self {
            Self::Stdio(child) => child.close(),
            Self::Http(http) => http.close(),
        }
    }
}

struct ProxyInner {
    lists: HashSet<IdKey>,
    initializations: HashSet<IdKey>,
    queued: HashSet<IdKey>,
    init_in_flight: usize,
    deferred_after_init: VecDeque<(Option<IdKey>, Value)>,
    in_flight_workers: usize,
    closed: bool,
}

struct SchemaProxyCtx {
    upstream: UpstreamHandle,
    timeout: Duration,
    omit_invalid_patterns: bool,
    max_schema_depth: Option<usize>,
    downstream_framing: AtomicU8,
    stdout_writer: Mutex<BufWriter<io::Stdout>>,
    inner: Mutex<ProxyInner>,
    idle_cv: Condvar,
    stdin_eof: AtomicBool,
}

impl SchemaProxyCtx {
    fn current_framing(&self) -> Framing {
        Framing::from_u8(self.downstream_framing.load(Ordering::Acquire))
    }

    fn write_downstream(&self, message: &Value) -> io::Result<()> {
        let framing = self.current_framing();
        let mut out = self
            .stdout_writer
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        write_framed_message(&mut *out, message, framing)
    }

    fn flush_downstream(&self) {
        let mut out = self
            .stdout_writer
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let _ = io::Write::flush(&mut *out);
    }

    fn shutdown(&self) {
        let was_closed = {
            let mut guard = self
                .inner
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let prev = guard.closed;
            guard.closed = true;
            guard.lists.clear();
            guard.initializations.clear();
            guard.queued.clear();
            guard.deferred_after_init.clear();
            prev
        };
        if !was_closed {
            self.flush_downstream();
            self.upstream.close();
            self.idle_cv.notify_all();
            if !self.stdin_eof.load(Ordering::Acquire) {
                std::process::exit(0);
            }
        }
    }

    fn handle_upstream_message(&self, mut message: Value) {
        {
            let guard = self
                .inner
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if guard.closed {
                return;
            }
        }

        let is_response = message
            .as_object()
            .is_some_and(|obj| !obj.contains_key("method"));

        if is_response && let Some(resp_id) = message.get("id").and_then(id_key) {
            let (was_init, was_list) = {
                let mut guard = self
                    .inner
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                (
                    guard.initializations.remove(&resp_id),
                    guard.lists.remove(&resp_id),
                )
            };

            if was_init && let Some(result_obj) = message.get("result").and_then(Value::as_object) {
                let valid_version = result_obj
                    .get("protocolVersion")
                    .and_then(Value::as_str)
                    .filter(|pv| SUPPORTED_PROTOCOL_VERSIONS.contains(pv));
                let Some(pv) = valid_version else {
                    self.shutdown();
                    return;
                };
                if let UpstreamHandle::Http(http) = &self.upstream {
                    http.set_protocol_version(pv.to_string());
                }
            }

            if was_list
                && let Some(tools) = message
                    .get_mut("result")
                    .and_then(Value::as_object_mut)
                    .and_then(|res| res.get_mut("tools"))
                    .and_then(Value::as_array_mut)
            {
                for tool in tools.iter_mut() {
                    let Some(tool_obj) = tool.as_object_mut() else {
                        continue;
                    };
                    if !tool_obj.contains_key("inputSchema") {
                        continue;
                    }
                    if let Some(max_depth) = self.max_schema_depth {
                        limit_tool_schema_depth(tool_obj, max_depth);
                    }
                    if self.omit_invalid_patterns
                        && let Some(schema) = tool_obj.get("inputSchema").cloned()
                    {
                        tool_obj.insert(
                            "inputSchema".to_string(),
                            omit_invalid_schema_patterns(&schema),
                        );
                    }
                }
            }
        }

        if self.write_downstream(&message).is_err() {
            self.shutdown();
        }
    }

    fn handle_downstream_message(self: &Arc<Self>, framing: Framing, message: Value) -> bool {
        self.downstream_framing
            .store(framing as u8, Ordering::Release);

        let method = message
            .get("method")
            .and_then(Value::as_str)
            .map(str::to_string);

        if method.as_deref() == Some("notifications/initialized") {
            {
                let mut guard = self
                    .inner
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                if guard.closed {
                    return false;
                }
                guard.init_in_flight += 1;
            }
            self.dispatch_initialized_notification(message);
            return true;
        }

        if method.as_deref() == Some("notifications/cancelled") {
            let cancelled_id = message
                .get("params")
                .and_then(Value::as_object)
                .and_then(|p| p.get("requestId"))
                .and_then(id_key);

            let dropped_queued = {
                let mut guard = self
                    .inner
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                if guard.closed {
                    return false;
                }
                if let Some(cid) = &cancelled_id {
                    guard.lists.remove(cid);
                    guard.initializations.remove(cid);
                    guard.queued.remove(cid)
                } else {
                    false
                }
            };

            if !dropped_queued {
                self.dispatch_upstream_send(message);
            }
            return true;
        }

        let req_id = if method.is_some() {
            message.get("id").and_then(id_key)
        } else {
            None
        };

        let should_wait_init = method
            .as_deref()
            .is_some_and(|m| m != "initialize" && m != "notifications/cancelled");

        let dispatch_now = {
            let mut guard = self
                .inner
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if guard.closed {
                return false;
            }
            if let Some(id) = &req_id {
                if method.as_deref() == Some("tools/list") {
                    guard.lists.insert(id.clone());
                } else if method.as_deref() == Some("initialize") {
                    guard.initializations.insert(id.clone());
                }
            }
            if should_wait_init && guard.init_in_flight > 0 {
                if let Some(id) = &req_id {
                    guard.queued.insert(id.clone());
                }
                guard.deferred_after_init.push_back((req_id, message));
                None
            } else {
                Some(message)
            }
        };

        if let Some(msg) = dispatch_now {
            self.dispatch_upstream_send(msg);
        }
        true
    }

    fn dispatch_initialized_notification(self: &Arc<Self>, message: Value) {
        match &self.upstream {
            UpstreamHandle::Stdio(child) => {
                let res = child.send(&message, self.current_framing());
                if res.is_err() {
                    self.finish_initialized(false);
                    self.shutdown();
                } else {
                    self.finish_initialized(true);
                }
            }
            UpstreamHandle::Http(http) => {
                let ctx = Arc::clone(self);
                let http = Arc::clone(http);
                self.track_worker(move || match http.post_json(&message, ctx.timeout) {
                    Ok(replies) => {
                        ctx.finish_initialized(true);
                        for reply in replies {
                            ctx.handle_upstream_message(reply);
                        }
                    }
                    Err(_) => {
                        ctx.finish_initialized(false);
                        ctx.shutdown();
                    }
                });
            }
        }
    }

    fn finish_initialized(self: &Arc<Self>, ok: bool) {
        let ready_batch = {
            let mut guard = self
                .inner
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            guard.init_in_flight = guard.init_in_flight.saturating_sub(1);
            if !ok || guard.closed || guard.init_in_flight > 0 {
                Vec::new()
            } else {
                let mut batch = Vec::with_capacity(guard.deferred_after_init.len());
                while let Some((opt_id, msg)) = guard.deferred_after_init.pop_front() {
                    if let Some(id) = opt_id
                        && !guard.queued.remove(&id)
                    {
                        continue;
                    }
                    batch.push(msg);
                }
                batch
            }
        };

        for msg in ready_batch {
            self.dispatch_upstream_send(msg);
        }
    }

    fn dispatch_upstream_send(self: &Arc<Self>, message: Value) {
        match &self.upstream {
            UpstreamHandle::Stdio(child) => {
                if child.send(&message, self.current_framing()).is_err() {
                    self.shutdown();
                }
            }
            UpstreamHandle::Http(http) => {
                let ctx = Arc::clone(self);
                let http = Arc::clone(http);
                self.track_worker(move || match http.post_json(&message, ctx.timeout) {
                    Ok(replies) => {
                        for reply in replies {
                            ctx.handle_upstream_message(reply);
                        }
                    }
                    Err(_) => {
                        ctx.shutdown();
                    }
                });
            }
        }
    }

    fn track_worker<F>(self: &Arc<Self>, f: F)
    where
        F: FnOnce() + Send + 'static,
    {
        {
            let mut guard = self
                .inner
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if guard.closed {
                return;
            }
            guard.in_flight_workers += 1;
        }
        let ctx = Arc::clone(self);
        std::thread::spawn(move || {
            f();
            let mut guard = ctx
                .inner
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            guard.in_flight_workers = guard.in_flight_workers.saturating_sub(1);
            if guard.in_flight_workers == 0 {
                ctx.idle_cv.notify_all();
            }
        });
    }

    fn wait_workers(&self) {
        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        while guard.in_flight_workers > 0 {
            guard = self
                .idle_cv
                .wait(guard)
                .unwrap_or_else(std::sync::PoisonError::into_inner);
        }
    }
}

/// Runs the wire-level schema proxy until either transport closes.
pub fn run_schema_proxy(config: FilterConfig, #[cfg(unix)] signal_set: libc::sigset_t) -> ExitCode {
    let (upstream, child_stdout) = match &config.transport {
        UpstreamTransportConfig::Stdio(stdio) => {
            let env = mcp_owned_stdio_environment(&stdio.env);
            match ManagedChild::spawn(&stdio.command, &stdio.args, stdio.cwd.as_deref(), &env) {
                Ok((child, stdout)) => (UpstreamHandle::Stdio(child), Some(stdout)),
                Err(e) => {
                    eprintln!("Poracode could not start the MCP server: {e}");
                    return ExitCode::from(1);
                }
            }
        }
        UpstreamTransportConfig::Http(http) => {
            (UpstreamHandle::Http(Arc::new(HttpPeer::new(http))), None)
        }
    };

    let ctx = Arc::new(SchemaProxyCtx {
        upstream,
        timeout: config.timeout,
        omit_invalid_patterns: config.omit_invalid_schema_patterns,
        max_schema_depth: config.max_schema_depth,
        downstream_framing: AtomicU8::new(Framing::Line as u8),
        stdout_writer: Mutex::new(BufWriter::new(io::stdout())),
        inner: Mutex::new(ProxyInner {
            lists: HashSet::new(),
            initializations: HashSet::new(),
            queued: HashSet::new(),
            init_in_flight: 0,
            deferred_after_init: VecDeque::new(),
            in_flight_workers: 0,
            closed: false,
        }),
        idle_cv: Condvar::new(),
        stdin_eof: AtomicBool::new(false),
    });

    #[cfg(unix)]
    {
        let sig_ctx = Arc::clone(&ctx);
        std::thread::spawn(move || {
            let mut sig: libc::c_int = 0;
            if unsafe { libc::sigwait(&signal_set, &mut sig) } == 0 {
                sig_ctx.shutdown();
                std::process::exit(0);
            }
        });
    }

    let upstream_reader = child_stdout.map(|stdout| {
        let up_ctx = Arc::clone(&ctx);
        std::thread::spawn(move || {
            let res = read_framed_stream(stdout, true, |_framing, msg| {
                up_ctx.handle_upstream_message(msg);
                true
            });
            let _ = res;
            up_ctx.shutdown();
        })
    });

    let stdin = io::stdin();
    let read_res = read_framed_stream(stdin.lock(), true, |framing, msg| {
        ctx.handle_downstream_message(framing, msg)
    });
    ctx.stdin_eof.store(true, Ordering::Release);
    if read_res.is_err() {
        ctx.shutdown();
    } else {
        // Wait for any active HTTP posts triggered before stdin EOF, then close.
        ctx.wait_workers();
        ctx.shutdown();
    }

    if let Some(handle) = upstream_reader {
        let _ = handle.join();
    }

    ExitCode::SUCCESS
}
