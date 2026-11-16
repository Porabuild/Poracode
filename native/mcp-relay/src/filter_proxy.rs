//! Tool-filtering and schema-normalizing MCP proxy (`PORACODE_MCP_FILTER_CONFIG*`
//! when `!schemaOnly` and `!isolateConnectionFailures`), ported from
//! `src/supervisor/mcp/mcpToolFilterProxy.ts`.

use crate::config::{FilterConfig, UpstreamTransportConfig};
use crate::framing::{
    Framing, HttpPeer, LATEST_PROTOCOL_VERSION, ManagedChild, SUPPORTED_PROTOCOL_VERSIONS,
    mcp_filtered_stdio_environment, read_framed_stream, write_framed_message,
};
use crate::messages::{IdKey, id_key, is_mcp_tool_visible_to_model};
use crate::schema::{limit_tool_schema_depth, omit_invalid_schema_patterns};
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{self, BufWriter};
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

type PendingSlot = Arc<(Mutex<Option<Result<Value, Value>>>, Condvar)>;

struct ActiveCall {
    cancelled: AtomicBool,
    upstream_id: AtomicU64,
}

enum UpstreamBackend {
    Stdio {
        child: Arc<ManagedChild>,
        pending: Mutex<HashMap<u64, PendingSlot>>,
    },
    Http(Arc<HttpPeer>),
}

struct ToolCacheState {
    known_tools: Option<HashMap<String, Value>>,
    discovery_revision: u64,
}

struct LifecycleState {
    upstream_ready: bool,
    upstream_has_tools: bool,
    closed: bool,
    pre_ready_queue: VecDeque<Value>,
    active_calls: HashMap<IdKey, Arc<ActiveCall>>,
    in_flight_workers: usize,
}

struct FilterProxyCtx {
    server_name: String,
    disabled_tools: HashSet<String>,
    omit_invalid_patterns: bool,
    max_schema_depth: Option<usize>,
    timeout: Duration,
    backend: UpstreamBackend,
    next_req_id: AtomicU64,
    stdout_writer: Mutex<BufWriter<io::Stdout>>,
    cache: Mutex<ToolCacheState>,
    lifecycle: Mutex<LifecycleState>,
    lifecycle_cv: Condvar,
    stdin_eof: AtomicBool,
}

impl FilterProxyCtx {
    fn write_downstream(&self, message: &Value) -> io::Result<()> {
        let mut out = self
            .stdout_writer
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        write_framed_message(&mut *out, message, Framing::Line)
    }

    fn flush_downstream(&self) {
        let mut out = self
            .stdout_writer
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let _ = io::Write::flush(&mut *out);
    }

    fn close_backend(&self) {
        match &self.backend {
            UpstreamBackend::Stdio { child, pending } => {
                child.close();
                let slots: Vec<PendingSlot> = {
                    let mut map = pending
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    map.drain().map(|(_, s)| s).collect()
                };
                for slot in slots {
                    let (lock, cv) = &*slot;
                    let mut guard = lock
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    if guard.is_none() {
                        *guard = Some(Err(json!({
                            "code": -32000,
                            "message": "Connection closed"
                        })));
                    }
                    cv.notify_all();
                }
            }
            UpstreamBackend::Http(http) => {
                http.close();
            }
        }
    }

    fn shutdown(&self, exit_code_if_peer: i32) {
        let was_closed = {
            let mut guard = self
                .lifecycle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let prev = guard.closed;
            guard.closed = true;
            guard.pre_ready_queue.clear();
            guard.active_calls.clear();
            prev
        };
        if !was_closed {
            self.flush_downstream();
            self.close_backend();
            self.lifecycle_cv.notify_all();
            if !self.stdin_eof.load(Ordering::Acquire) {
                std::process::exit(exit_code_if_peer);
            }
        }
    }

    fn invalidate_tool_cache(&self) {
        let mut guard = self
            .cache
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        guard.known_tools = None;
        guard.discovery_revision = guard.discovery_revision.wrapping_add(1);
    }

    fn handle_upstream_stdio_frame(&self, message: Value) {
        let has_method = message
            .as_object()
            .is_some_and(|obj| obj.contains_key("method"));

        if has_method {
            let method = message.get("method").and_then(Value::as_str);
            if method == Some("notifications/tools/list_changed") {
                self.invalidate_tool_cache();
                return;
            }
            if let Some(req_id) = message.get("id").cloned()
                && let UpstreamBackend::Stdio { child, .. } = &self.backend
            {
                let reply = if method == Some("ping") {
                    json!({ "jsonrpc": "2.0", "id": req_id, "result": {} })
                } else {
                    json!({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": { "code": -32601, "message": "Method not found" }
                    })
                };
                let _ = child.send(&reply, Framing::Line);
            }
            return;
        }

        let Some(id_u64) = message.get("id").and_then(Value::as_u64) else {
            return;
        };

        let UpstreamBackend::Stdio { pending, .. } = &self.backend else {
            return;
        };

        let slot = {
            let mut map = pending
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            map.remove(&id_u64)
        };
        let Some(slot) = slot else {
            return;
        };

        let outcome = if let Some(err) = message.get("error") {
            Err(err.clone())
        } else {
            Ok(message.get("result").cloned().unwrap_or(Value::Null))
        };

        let (lock, cv) = &*slot;
        let mut guard = lock
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *guard = Some(outcome);
        cv.notify_all();
    }

    fn send_upstream_notification(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<(), String> {
        let mut obj = Map::new();
        obj.insert("jsonrpc".to_string(), Value::String("2.0".to_string()));
        obj.insert("method".to_string(), Value::String(method.to_string()));
        if let Some(p) = params {
            obj.insert("params".to_string(), p);
        }
        let notif = Value::Object(obj);

        match &self.backend {
            UpstreamBackend::Stdio { child, .. } => {
                child.send(&notif, Framing::Line).map_err(|e| e.to_string())
            }
            UpstreamBackend::Http(http) => {
                let replies = http.post_json(&notif, self.timeout)?;
                for reply in replies {
                    if reply.get("method").and_then(Value::as_str)
                        == Some("notifications/tools/list_changed")
                    {
                        self.invalidate_tool_cache();
                    }
                }
                Ok(())
            }
        }
    }

    fn call_upstream(
        &self,
        method: &str,
        params: Value,
        timeout: Duration,
        active_call: Option<&ActiveCall>,
    ) -> Result<Value, Value> {
        let req_id = self.next_req_id.fetch_add(1, Ordering::Relaxed);
        if let Some(call) = active_call {
            call.upstream_id.store(req_id, Ordering::Release);
            if call.cancelled.load(Ordering::Acquire) {
                return Err(json!({ "code": -32800, "message": "Request cancelled" }));
            }
        }

        let req = json!({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params,
        });

        match &self.backend {
            UpstreamBackend::Stdio { child, pending } => {
                let slot: PendingSlot = Arc::new((Mutex::new(None), Condvar::new()));
                {
                    let mut map = pending
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    map.insert(req_id, Arc::clone(&slot));
                }

                if let Err(e) = child.send(&req, Framing::Line) {
                    let mut map = pending
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    map.remove(&req_id);
                    return Err(json!({ "code": -32000, "message": e.to_string() }));
                }

                let deadline = Instant::now() + timeout;
                let (lock, cv) = &*slot;
                let mut guard = lock
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                while guard.is_none() {
                    let now = Instant::now();
                    if now >= deadline {
                        break;
                    }
                    let (next_guard, _) = cv
                        .wait_timeout(guard, deadline - now)
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    guard = next_guard;
                }

                if let Some(result) = guard.take() {
                    result
                } else {
                    {
                        let mut map = pending
                            .lock()
                            .unwrap_or_else(std::sync::PoisonError::into_inner);
                        map.remove(&req_id);
                    }
                    let _ = self.send_upstream_notification(
                        "notifications/cancelled",
                        Some(json!({
                            "requestId": req_id,
                            "reason": "Request timed out"
                        })),
                    );
                    Err(json!({ "code": -32001, "message": "Request timed out" }))
                }
            }
            UpstreamBackend::Http(http) => {
                let replies = http
                    .post_json(&req, timeout)
                    .map_err(|e| json!({ "code": -32000, "message": e }))?;
                let mut matched: Option<Result<Value, Value>> = None;
                for reply in replies {
                    if reply.get("method").and_then(Value::as_str)
                        == Some("notifications/tools/list_changed")
                    {
                        self.invalidate_tool_cache();
                        continue;
                    }
                    if reply.get("id").and_then(Value::as_u64) == Some(req_id) {
                        if let Some(err) = reply.get("error") {
                            matched = Some(Err(err.clone()));
                        } else {
                            matched = Some(Ok(reply.get("result").cloned().unwrap_or(Value::Null)));
                        }
                    }
                }
                matched.unwrap_or_else(|| {
                    Err(json!({ "code": -32000, "message": "Missing MCP HTTP response" }))
                })
            }
        }
    }

    fn connect_upstream(&self) -> Result<bool, String> {
        let deadline = Instant::now() + self.timeout;
        let init_res = self
            .call_upstream(
                "initialize",
                json!({
                    "protocolVersion": LATEST_PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {
                        "name": "poracode-mcp-filter",
                        "version": "1.0.0"
                    }
                }),
                self.timeout,
                None,
            )
            .map_err(|err| {
                err.get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("MCP upstream initialize failed")
                    .to_string()
            })?;

        let pv = init_res
            .get("protocolVersion")
            .and_then(Value::as_str)
            .filter(|v| SUPPORTED_PROTOCOL_VERSIONS.contains(v))
            .ok_or_else(|| "Unsupported MCP protocolVersion from upstream".to_string())?;

        if let UpstreamBackend::Http(http) = &self.backend {
            http.set_protocol_version(pv.to_string());
        }

        let has_tools = init_res
            .get("capabilities")
            .and_then(Value::as_object)
            .is_some_and(|caps| caps.get("tools").is_some_and(|t| !t.is_null()));

        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("MCP upstream initialize timed out".to_string());
        }
        self.send_upstream_notification("notifications/initialized", None)?;
        Ok(has_tools)
    }

    fn discover_tools(&self, active_call: Option<&ActiveCall>) -> Result<Vec<Value>, Value> {
        let has_tools = {
            let guard = self
                .lifecycle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            guard.upstream_has_tools
        };
        if !has_tools {
            let mut cache = self
                .cache
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            cache.known_tools = Some(HashMap::new());
            return Ok(Vec::new());
        }

        let started_rev = {
            let cache = self
                .cache
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            cache.discovery_revision
        };

        let mut discovered: HashMap<String, Value> = HashMap::new();
        let mut visible_tools: Vec<Value> = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let params = match &cursor {
                Some(c) => json!({ "cursor": c }),
                None => json!({}),
            };
            let page = self.call_upstream("tools/list", params, self.timeout, active_call)?;
            if let Some(items) = page.get("tools").and_then(Value::as_array) {
                for tool in items {
                    let Some(name) = tool.get("name").and_then(Value::as_str) else {
                        continue;
                    };
                    discovered.insert(name.to_string(), tool.clone());
                    if !self.disabled_tools.contains(name) && is_mcp_tool_visible_to_model(tool) {
                        visible_tools.push(tool.clone());
                    }
                }
            }
            cursor = page
                .get("nextCursor")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            if cursor.is_none() {
                break;
            }
        }

        {
            let mut cache = self
                .cache
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if cache.discovery_revision == started_rev {
                cache.known_tools = Some(discovered);
            }
        }

        if self.max_schema_depth.is_some() || self.omit_invalid_patterns {
            for tool in &mut visible_tools {
                let Some(obj) = tool.as_object_mut() else {
                    continue;
                };
                if let Some(max_depth) = self.max_schema_depth {
                    limit_tool_schema_depth(obj, max_depth);
                }
                if self.omit_invalid_patterns
                    && let Some(schema) = obj.get("inputSchema").cloned()
                {
                    obj.insert(
                        "inputSchema".to_string(),
                        omit_invalid_schema_patterns(&schema),
                    );
                }
            }
        }

        Ok(visible_tools)
    }

    fn receive_downstream_message(self: &Arc<Self>, message: Value) -> bool {
        let should_dispatch = {
            let mut guard = self
                .lifecycle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if guard.closed {
                return false;
            }
            if !guard.upstream_ready {
                guard.pre_ready_queue.push_back(message);
                return true;
            }
            true
        };
        if should_dispatch {
            self.dispatch_downstream_message(message);
        }
        true
    }

    fn dispatch_downstream_message(self: &Arc<Self>, message: Value) {
        let method = message
            .get("method")
            .and_then(Value::as_str)
            .map(str::to_string);
        let Some(method_name) = method else {
            return;
        };

        if method_name == "notifications/initialized" {
            return;
        }

        if method_name == "notifications/cancelled" {
            let params_obj = message.get("params").and_then(Value::as_object);
            let Some(cid) = params_obj.and_then(|p| p.get("requestId")).and_then(id_key) else {
                return;
            };
            let reason = params_obj
                .and_then(|p| p.get("reason"))
                .and_then(Value::as_str)
                .map(str::to_string);

            let active = {
                let guard = self
                    .lifecycle
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                guard.active_calls.get(&cid).cloned()
            };
            if let Some(call) = active {
                call.cancelled.store(true, Ordering::Release);
                let up_id = call.upstream_id.load(Ordering::Acquire);
                if up_id != 0 {
                    let mut cancel_params = Map::new();
                    cancel_params.insert("requestId".to_string(), json!(up_id));
                    if let Some(r) = reason {
                        cancel_params.insert("reason".to_string(), Value::String(r));
                    }
                    let _ = self.send_upstream_notification(
                        "notifications/cancelled",
                        Some(Value::Object(cancel_params)),
                    );
                }
            }
            return;
        }

        let Some(raw_id) = message.get("id").cloned() else {
            return;
        };

        if method_name == "initialize" {
            let requested = message
                .get("params")
                .and_then(Value::as_object)
                .and_then(|p| p.get("protocolVersion"))
                .and_then(Value::as_str);
            let negotiated = requested
                .filter(|v| SUPPORTED_PROTOCOL_VERSIONS.contains(v))
                .unwrap_or(LATEST_PROTOCOL_VERSION);

            let reply = json!({
                "jsonrpc": "2.0",
                "id": raw_id,
                "result": {
                    "protocolVersion": negotiated,
                    "capabilities": { "tools": {} },
                    "serverInfo": {
                        "name": self.server_name,
                        "version": "1.0.0"
                    }
                }
            });
            if self.write_downstream(&reply).is_err() {
                self.shutdown(0);
            }
            return;
        }

        if method_name == "ping" {
            let reply = json!({ "jsonrpc": "2.0", "id": raw_id, "result": {} });
            if self.write_downstream(&reply).is_err() {
                self.shutdown(0);
            }
            return;
        }

        if method_name != "tools/list" && method_name != "tools/call" {
            let reply = json!({
                "jsonrpc": "2.0",
                "id": raw_id,
                "error": { "code": -32601, "message": "Method not found" }
            });
            if self.write_downstream(&reply).is_err() {
                self.shutdown(0);
            }
            return;
        }

        let call_key = id_key(&raw_id);
        let call_state = Arc::new(ActiveCall {
            cancelled: AtomicBool::new(false),
            upstream_id: AtomicU64::new(0),
        });

        {
            let mut guard = self
                .lifecycle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if guard.closed {
                return;
            }
            if let Some(k) = &call_key {
                guard
                    .active_calls
                    .insert(k.clone(), Arc::clone(&call_state));
            }
            guard.in_flight_workers += 1;
        }

        let ctx = Arc::clone(self);
        std::thread::spawn(move || {
            let outcome = if method_name == "tools/list" {
                ctx.discover_tools(Some(&call_state))
                    .map(|tools| json!({ "tools": tools }))
            } else {
                ctx.execute_tool_call(&message, &call_state)
            };

            if !call_state.cancelled.load(Ordering::Acquire) {
                let reply = match outcome {
                    Ok(result) => json!({ "jsonrpc": "2.0", "id": raw_id, "result": result }),
                    Err(error) => json!({ "jsonrpc": "2.0", "id": raw_id, "error": error }),
                };
                if ctx.write_downstream(&reply).is_err() {
                    ctx.shutdown(0);
                }
            }

            let mut guard = ctx
                .lifecycle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if let Some(k) = &call_key {
                guard.active_calls.remove(k);
            }
            guard.in_flight_workers = guard.in_flight_workers.saturating_sub(1);
            if guard.in_flight_workers == 0 {
                ctx.lifecycle_cv.notify_all();
            }
        });
    }

    fn execute_tool_call(&self, message: &Value, call_state: &ActiveCall) -> Result<Value, Value> {
        let params_obj = message
            .get("params")
            .and_then(Value::as_object)
            .ok_or_else(|| json!({ "code": -32602, "message": "Invalid params" }))?;
        let name = params_obj
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| json!({ "code": -32602, "message": "Missing tool name" }))?;

        if self.disabled_tools.contains(name) {
            return Ok(json!({
                "isError": true,
                "content": [{
                    "type": "text",
                    "text": format!("Tool disabled by Poracode: {name}")
                }]
            }));
        }

        let needs_discovery = {
            let cache = self
                .cache
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            cache.known_tools.is_none()
        };
        if needs_discovery {
            let _ = self.discover_tools(Some(call_state))?;
        }

        let hidden = {
            let cache = self
                .cache
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            cache
                .known_tools
                .as_ref()
                .and_then(|map| map.get(name))
                .is_some_and(|tool| !is_mcp_tool_visible_to_model(tool))
        };
        if hidden {
            return Ok(json!({
                "isError": true,
                "content": [{
                    "type": "text",
                    "text": format!("Tool is not visible to the model: {name}")
                }]
            }));
        }

        self.call_upstream(
            "tools/call",
            Value::Object(params_obj.clone()),
            self.timeout,
            Some(call_state),
        )
    }

    fn wait_workers(&self) {
        let mut guard = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        while guard.in_flight_workers > 0 && !guard.closed {
            guard = self
                .lifecycle_cv
                .wait(guard)
                .unwrap_or_else(std::sync::PoisonError::into_inner);
        }
    }
}

/// Runs the MCP tool-filtering proxy until either side disconnects.
pub fn run_filter_proxy(config: FilterConfig, #[cfg(unix)] signal_set: libc::sigset_t) -> ExitCode {
    let (backend, child_stdout) = match &config.transport {
        UpstreamTransportConfig::Stdio(stdio) => {
            let env = mcp_filtered_stdio_environment(&stdio.env);
            match ManagedChild::spawn(&stdio.command, &stdio.args, stdio.cwd.as_deref(), &env) {
                Ok((child, stdout)) => (
                    UpstreamBackend::Stdio {
                        child,
                        pending: Mutex::new(HashMap::new()),
                    },
                    Some(stdout),
                ),
                Err(e) => {
                    eprintln!("Poracode could not start the MCP server: {e}");
                    return ExitCode::from(1);
                }
            }
        }
        UpstreamTransportConfig::Http(http) => {
            (UpstreamBackend::Http(Arc::new(HttpPeer::new(http))), None)
        }
    };

    let ctx = Arc::new(FilterProxyCtx {
        server_name: config.server_name,
        disabled_tools: config.disabled_tools,
        omit_invalid_patterns: config.omit_invalid_schema_patterns,
        max_schema_depth: config.max_schema_depth,
        timeout: config.timeout,
        backend,
        next_req_id: AtomicU64::new(1),
        stdout_writer: Mutex::new(BufWriter::new(io::stdout())),
        cache: Mutex::new(ToolCacheState {
            known_tools: None,
            discovery_revision: 0,
        }),
        lifecycle: Mutex::new(LifecycleState {
            upstream_ready: false,
            upstream_has_tools: false,
            closed: false,
            pre_ready_queue: VecDeque::new(),
            active_calls: HashMap::new(),
            in_flight_workers: 0,
        }),
        lifecycle_cv: Condvar::new(),
        stdin_eof: AtomicBool::new(false),
    });

    #[cfg(unix)]
    {
        let sig_ctx = Arc::clone(&ctx);
        std::thread::spawn(move || {
            let mut sig: libc::c_int = 0;
            if unsafe { libc::sigwait(&signal_set, &mut sig) } == 0 {
                sig_ctx.shutdown(0);
                std::process::exit(0);
            }
        });
    }

    let upstream_reader = child_stdout.map(|stdout| {
        let up_ctx = Arc::clone(&ctx);
        std::thread::spawn(move || {
            let _ = read_framed_stream(stdout, false, |_framing, msg| {
                up_ctx.handle_upstream_stdio_frame(msg);
                true
            });
            let was_ready = {
                let guard = up_ctx
                    .lifecycle
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                guard.upstream_ready
            };
            up_ctx.shutdown(if was_ready { 0 } else { 1 });
        })
    });

    // Read downstream stdin concurrently so early stdin EOF during upstream
    // startup immediately cancels upstream initialization.
    let stdin_ctx = Arc::clone(&ctx);
    let stdin_reader = std::thread::spawn(move || {
        let stdin = io::stdin();
        let res = read_framed_stream(stdin.lock(), false, |_framing, msg| {
            stdin_ctx.receive_downstream_message(msg)
        });
        stdin_ctx.stdin_eof.store(true, Ordering::Release);
        let was_ready = {
            let guard = stdin_ctx
                .lifecycle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            guard.upstream_ready
        };
        if !was_ready {
            eprintln!("MCP proxy disconnected during startup");
            stdin_ctx.close_backend();
            std::process::exit(1);
        }
        if res.is_ok() {
            stdin_ctx.wait_workers();
        }
        stdin_ctx.shutdown(0);
    });

    let has_tools = match ctx.connect_upstream() {
        Ok(has_tools) => has_tools,
        Err(err) => {
            eprintln!("{err}");
            ctx.stdin_eof.store(true, Ordering::Release);
            ctx.close_backend();
            return ExitCode::from(1);
        }
    };

    let queued: Vec<Value> = {
        let mut guard = ctx
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if guard.closed {
            return ExitCode::from(1);
        }
        guard.upstream_ready = true;
        guard.upstream_has_tools = has_tools;
        guard.pre_ready_queue.drain(..).collect()
    };

    for msg in queued {
        ctx.dispatch_downstream_message(msg);
    }

    let _ = stdin_reader.join();
    if let Some(handle) = upstream_reader {
        let _ = handle.join();
    }

    ExitCode::SUCCESS
}
