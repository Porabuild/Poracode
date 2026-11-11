//! Bounded, timeout-enforced `git` subprocess execution with concurrency gating.

use std::io::Read;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::{Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const MAX_STDOUT_BYTES: usize = 50 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 1024 * 1024;

/// Counting semaphore bounding the number of concurrent `git` child processes
/// spawned inside a single `statusBatch` request.
pub struct SubprocessLimiter {
    state: Mutex<usize>,
    cond: Condvar,
    limit: usize,
}

/// RAII permit releasing one slot on drop.
pub struct Permit<'a> {
    limiter: &'a SubprocessLimiter,
}

impl SubprocessLimiter {
    /// Create a limiter allowing at least 1 and at most `limit` concurrent spawns.
    #[must_use]
    pub fn new(limit: usize) -> Self {
        Self {
            state: Mutex::new(0),
            cond: Condvar::new(),
            limit: limit.max(1),
        }
    }

    /// Acquire one subprocess slot, blocking the worker thread until available.
    pub fn acquire(&self) -> Permit<'_> {
        let mut active = match self.state.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        while *active >= self.limit {
            active = match self.cond.wait(active) {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
        }
        *active += 1;
        Permit { limiter: self }
    }
}

impl Drop for Permit<'_> {
    fn drop(&mut self) {
        let mut active = match self.limiter.state.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        *active = active.saturating_sub(1);
        self.limiter.cond.notify_one();
    }
}

/// Result of running a `git` command.
#[derive(Debug, Clone)]
pub struct GitOutput {
    /// Whether `git` exited with code `0`.
    pub ok: bool,
    /// Decoded UTF-8 stdout.
    pub stdout: String,
    /// Decoded UTF-8 stderr.
    pub stderr: String,
}

fn read_bounded<R: Read>(mut reader: R, max_bytes: usize) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut chunk = [0u8; 16 * 1024];
    loop {
        let n = reader.read(&mut chunk).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        if out.len() + n > max_bytes {
            return Err(format!("Git output exceeded the {max_bytes}-byte limit"));
        }
        out.extend_from_slice(&chunk[..n]);
    }
    Ok(out)
}

/// Execute `git -c core.quotepath=false <args...>` in `cwd` with `GIT_OPTIONAL_LOCKS=0`,
/// acquiring a slot from `limiter` and enforcing `timeout`.
pub fn run_git_command(
    cwd: &str,
    args: &[&str],
    timeout: Duration,
    limiter: &SubprocessLimiter,
) -> Result<GitOutput, String> {
    let _permit = limiter.acquire();

    let mut cmd = Command::new("git");
    cmd.arg("-c")
        .arg("core.quotepath=false")
        .args(args)
        .current_dir(cwd)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();

    let stdout_handle = thread::spawn(move || {
        stdout_pipe.map_or_else(|| Ok(Vec::new()), |p| read_bounded(p, MAX_STDOUT_BYTES))
    });
    let stderr_handle = thread::spawn(move || {
        stderr_pipe.map_or_else(|| Ok(Vec::new()), |p| read_bounded(p, MAX_STDERR_BYTES))
    });

    let deadline = Instant::now() + timeout;
    let mut timed_out = false;
    let exit_status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => {
                if Instant::now() >= deadline {
                    timed_out = true;
                    let _ = child.kill();
                    break child.wait().map_err(|e| e.to_string());
                }
                thread::sleep(Duration::from_millis(1));
            }
            Err(e) => break Err(e.to_string()),
        }
    }?;

    let stdout_bytes = stdout_handle
        .join()
        .map_err(|_| "stdout reader thread panicked".to_owned())??;
    let stderr_bytes = stderr_handle
        .join()
        .map_err(|_| "stderr reader thread panicked".to_owned())??;

    if timed_out {
        return Err(format!(
            "git {:?} timed out after {}ms",
            args.first().unwrap_or(&""),
            timeout.as_millis()
        ));
    }

    Ok(GitOutput {
        ok: exit_status.success(),
        stdout: String::from_utf8_lossy(&stdout_bytes).into_owned(),
        stderr: String::from_utf8_lossy(&stderr_bytes).into_owned(),
    })
}
