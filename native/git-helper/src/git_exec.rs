//! Bounded, timeout-enforced `git` subprocess execution with concurrency gating.

use std::io::Read;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

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
    /// Numeric exit code when the process terminated normally.
    pub exit_code: Option<i32>,
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
/// acquiring a slot from `limiter` and enforcing `timeout` without busy-polling.
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

    // Event-driven timeout guard: sleeps on a Condvar woken immediately when
    // `child.wait()` finishes; kills the child only if `timeout` elapses first!
    let done_pair = Arc::new((Mutex::new(false), Condvar::new()));
    let done_for_watchdog = Arc::clone(&done_pair);

    let exit_status_res = thread::scope(|scope| {
        let stdout_handle = scope.spawn(move || {
            stdout_pipe.map_or_else(|| Ok(Vec::new()), |p| read_bounded(p, MAX_STDOUT_BYTES))
        });
        let stderr_handle = scope.spawn(move || {
            stderr_pipe.map_or_else(|| Ok(Vec::new()), |p| read_bounded(p, MAX_STDERR_BYTES))
        });

        let child_mutex = Arc::new(Mutex::new(child));
        let child_for_watchdog = Arc::clone(&child_mutex);
        let timed_out = Arc::new(Mutex::new(false));
        let timed_out_for_watchdog = Arc::clone(&timed_out);

        let watchdog = scope.spawn(move || {
            let (lock, cvar) = &*done_for_watchdog;
            let guard = match lock.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            if *guard {
                return;
            }
            let wait_res = match cvar.wait_timeout_while(guard, timeout, |finished| !*finished) {
                Ok(pair) => pair,
                Err(p) => p.into_inner(),
            };
            if !*wait_res.0 {
                if let Ok(mut flag) = timed_out_for_watchdog.lock() {
                    *flag = true;
                }
                if let Ok(mut c) = child_for_watchdog.lock() {
                    let _ = c.kill();
                }
            }
        });

        let status_res = wait_child_unlockable(&child_mutex, &done_pair);

        {
            let (lock, cvar) = &*done_pair;
            let mut guard = match lock.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            *guard = true;
            cvar.notify_all();
        }
        let _ = watchdog.join();

        let stdout_bytes = stdout_handle
            .join()
            .map_err(|_| "stdout reader thread panicked".to_owned())??;
        let stderr_bytes = stderr_handle
            .join()
            .map_err(|_| "stderr reader thread panicked".to_owned())??;
        let did_time_out = timed_out.lock().map(|g| *g).unwrap_or(false);

        Ok::<_, String>((status_res?, did_time_out, stdout_bytes, stderr_bytes))
    })?;

    let (exit_status, did_time_out, stdout_bytes, stderr_bytes) = exit_status_res;
    if did_time_out {
        return Err(format!(
            "git {:?} timed out after {}ms",
            args.first().unwrap_or(&""),
            timeout.as_millis()
        ));
    }

    Ok(GitOutput {
        ok: exit_status.success(),
        exit_code: exit_status.code(),
        stdout: String::from_utf8_lossy(&stdout_bytes).into_owned(),
        stderr: String::from_utf8_lossy(&stderr_bytes).into_owned(),
    })
}

fn wait_child_unlockable(
    child_mutex: &Mutex<std::process::Child>,
    done_pair: &(Mutex<bool>, Condvar),
) -> Result<std::process::ExitStatus, String> {
    let mut sleep_ms = 1u64;
    loop {
        let poll = {
            let mut c = match child_mutex.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            c.try_wait()
        };
        match poll {
            Ok(Some(status)) => return Ok(status),
            Ok(None) => {
                let (lock, cvar) = done_pair;
                let guard = match lock.lock() {
                    Ok(g) => g,
                    Err(p) => p.into_inner(),
                };
                if *guard {
                    let mut c = match child_mutex.lock() {
                        Ok(g) => g,
                        Err(p) => p.into_inner(),
                    };
                    return c.wait().map_err(|e| e.to_string());
                }
                let _ = cvar.wait_timeout(guard, Duration::from_millis(sleep_ms));
                sleep_ms = (sleep_ms * 2).min(10);
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}
