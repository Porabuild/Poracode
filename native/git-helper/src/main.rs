//! `poracode-git-helper` — standalone stdio NDJSON daemon.
//!
//! - `--hello` prints the staging handshake (`helper`, `helperVersion`,
//!   `protocolVersion`, `platform`, `arch`) and exits 0.
//! - `--serve-v1` runs the bounded worker-pool request loop until stdin EOF.
//! - Any unknown argument or mismatched `protocolVersion` fails closed.

use poracode_git_helper::protocol::{
    GIT_HELPER_PROTOCOL_VERSION, HELLO_HELPER, HelperRequest, HelperResponse,
};
use poracode_git_helper::service::GitHelperService;
use std::collections::VecDeque;
use std::io::{self, BufRead, Write};
use std::process::ExitCode;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;

const MAX_REQUEST_WORKERS: usize = 4;
const MAX_QUEUE_CAPACITY: usize = 64;
const MAX_LINE_BYTES: usize = 2 * 1024 * 1024;

struct RequestQueue {
    state: Mutex<(VecDeque<HelperRequest>, bool)>,
    not_empty: Condvar,
    not_full: Condvar,
}

impl RequestQueue {
    fn new() -> Self {
        Self {
            state: Mutex::new((VecDeque::with_capacity(MAX_QUEUE_CAPACITY), false)),
            not_empty: Condvar::new(),
            not_full: Condvar::new(),
        }
    }

    fn send(&self, req: HelperRequest) -> bool {
        let mut guard = match self.state.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        while guard.0.len() >= MAX_QUEUE_CAPACITY && !guard.1 {
            guard = match self.not_full.wait(guard) {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
        }
        if guard.1 {
            return false;
        }
        guard.0.push_back(req);
        self.not_empty.notify_one();
        true
    }

    fn recv(&self) -> Option<HelperRequest> {
        let mut guard = match self.state.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        loop {
            if let Some(req) = guard.0.pop_front() {
                self.not_full.notify_one();
                return Some(req);
            }
            if guard.1 {
                return None;
            }
            guard = match self.not_empty.wait(guard) {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
        }
    }

    fn close(&self) {
        let mut guard = match self.state.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        guard.1 = true;
        self.not_empty.notify_all();
        self.not_full.notify_all();
    }
}

fn platform_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
}

fn arch_name() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    }
}

fn hello_line() -> String {
    serde_json::json!({
        "helper": HELLO_HELPER,
        "helperVersion": env!("CARGO_PKG_VERSION"),
        "protocolVersion": GIT_HELPER_PROTOCOL_VERSION,
        "platform": platform_name(),
        "arch": arch_name(),
    })
    .to_string()
}

fn write_response(writer: &Mutex<io::BufWriter<io::Stdout>>, response: &HelperResponse) {
    let Ok(serialized) = serde_json::to_string(response) else {
        return;
    };
    let mut guard = match writer.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let _ = guard.write_all(serialized.as_bytes());
    let _ = guard.write_all(b"\n");
    let _ = guard.flush();
}

fn handle_request(service: &GitHelperService, req: HelperRequest) -> HelperResponse {
    if req.protocol_version != GIT_HELPER_PROTOCOL_VERSION {
        return HelperResponse::err(
            req.id,
            format!(
                "Incompatible protocolVersion {} (expected {GIT_HELPER_PROTOCOL_VERSION})",
                req.protocol_version
            ),
        );
    }
    match req.kind.as_str() {
        "ping" => HelperResponse::ok_empty(req.id),
        "statusBatch" => {
            let statuses =
                service.status_batch(&req.paths, req.detail, req.timeout_ms, req.max_concurrency);
            HelperResponse::ok_statuses(req.id, statuses)
        }
        other => HelperResponse::err(req.id, format!("Unknown request kind: {other}")),
    }
}

fn run_daemon() -> ExitCode {
    let service = Arc::new(GitHelperService::new());
    let writer = Arc::new(Mutex::new(io::BufWriter::new(io::stdout())));
    let queue = Arc::new(RequestQueue::new());

    let mut workers = Vec::with_capacity(MAX_REQUEST_WORKERS);
    for _ in 0..MAX_REQUEST_WORKERS {
        let q_clone = Arc::clone(&queue);
        let svc_clone = Arc::clone(&service);
        let writer_clone = Arc::clone(&writer);
        workers.push(thread::spawn(move || {
            while let Some(req) = q_clone.recv() {
                let response = handle_request(&svc_clone, req);
                write_response(&writer_clone, &response);
            }
        }));
    }

    let stdin = io::stdin();
    let mut reader = io::BufReader::new(stdin.lock());
    let mut line_buf = Vec::with_capacity(4096);

    loop {
        line_buf.clear();
        let read_res = reader.read_until(b'\n', &mut line_buf);
        let Ok(n) = read_res else {
            break;
        };
        if n == 0 {
            break;
        }
        if line_buf.len() > MAX_LINE_BYTES {
            let _ = writeln!(
                io::stderr(),
                "[poracode-git-helper] request line exceeded {MAX_LINE_BYTES} bytes; closing"
            );
            queue.close();
            for w in workers {
                let _ = w.join();
            }
            return ExitCode::from(1);
        }
        let Ok(line_str) = std::str::from_utf8(&line_buf) else {
            continue;
        };
        let trimmed = line_str.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<HelperRequest>(trimmed) {
            Ok(req) => {
                if req.protocol_version != GIT_HELPER_PROTOCOL_VERSION {
                    let resp = handle_request(&service, req);
                    write_response(&writer, &resp);
                    queue.close();
                    for w in workers {
                        let _ = w.join();
                    }
                    return ExitCode::from(2);
                }
                if !queue.send(req) {
                    break;
                }
            }
            Err(err) => {
                let resp = HelperResponse::err(0, format!("Invalid request JSON: {err}"));
                write_response(&writer, &resp);
            }
        }
    }

    queue.close();
    for w in workers {
        let _ = w.join();
    }
    ExitCode::SUCCESS
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        [flag] if flag == "--hello" => {
            println!("{}", hello_line());
            ExitCode::SUCCESS
        }
        [flag] if flag == "--serve-v1" => run_daemon(),
        _ => {
            let _ = writeln!(
                io::stderr(),
                "Usage: poracode-git-helper (--hello | --serve-v1)"
            );
            ExitCode::from(2)
        }
    }
}
