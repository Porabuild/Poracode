//! Execution-only stdio launcher (`PORACODE_MCP_STDIO_CONFIG`), ported from
//! `src/supervisor/mcp/mcpStdioWorker.ts`.
//!
//! Spawns the configured MCP server with its `cwd` and merged environment while
//! inheriting stdin/stdout/stderr directly so zero bytes are copied through
//! user space after spawn and every server capability is preserved.

use crate::config::StdioLauncherConfig;
use std::ffi::OsString;
#[cfg(not(windows))]
use std::process::Command;
use std::process::{Child, ExitCode, Stdio};
#[cfg(unix)]
use std::sync::Arc;
#[cfg(unix)]
use std::sync::atomic::{AtomicI32, Ordering};

const STDIO_CONFIG_ENV: &str = "PORACODE_MCP_STDIO_CONFIG";

/// Builds the child environment matching `mcpStdioWorker.ts`:
/// `{ ...process.env, ...transport.env }` with `PORACODE_MCP_STDIO_CONFIG`
/// deleted afterward.
pub fn build_launcher_env(explicit: &[(String, String)]) -> Vec<(OsString, OsString)> {
    let mut entries: Vec<(OsString, OsString)> = std::env::vars_os().collect();
    for (key, value) in explicit {
        upsert_env(&mut entries, key, value);
    }
    remove_env(&mut entries, STDIO_CONFIG_ENV);
    entries
}

fn env_key_eq(existing: &std::ffi::OsStr, target: &str) -> bool {
    #[cfg(windows)]
    {
        existing.to_string_lossy().eq_ignore_ascii_case(target)
    }
    #[cfg(not(windows))]
    {
        existing == std::ffi::OsStr::new(target)
    }
}

pub(crate) fn upsert_env(entries: &mut Vec<(OsString, OsString)>, key: &str, value: &str) {
    if let Some(slot) = entries.iter_mut().find(|(k, _)| env_key_eq(k, key)) {
        slot.1 = OsString::from(value);
    } else {
        entries.push((OsString::from(key), OsString::from(value)));
    }
}

pub(crate) fn remove_env(entries: &mut Vec<(OsString, OsString)>, key: &str) {
    entries.retain(|(k, _)| !env_key_eq(k, key));
}

fn spawn_inherited_child(config: &StdioLauncherConfig) -> std::io::Result<Child> {
    let transport = &config.transport;
    let env = build_launcher_env(&transport.env);

    #[cfg(windows)]
    let mut cmd = crate::win_spawn::build_windows_command(
        &transport.command,
        &transport.args,
        transport.cwd.as_deref(),
        &env,
    );

    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new(&transport.command);
        c.args(&transport.args);
        if let Some(dir) = transport.cwd.as_deref().filter(|d| !d.is_empty()) {
            c.current_dir(dir);
        }
        c.env_clear();
        for (k, v) in &env {
            c.env(k, v);
        }
        c
    };

    cmd.stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Restore default SIGINT/SIGTERM mask in the child before exec so it
        // does not inherit our sigwait mask.
        unsafe {
            cmd.pre_exec(|| {
                let mut empty: libc::sigset_t = std::mem::zeroed();
                libc::sigemptyset(&mut empty);
                libc::pthread_sigmask(libc::SIG_SETMASK, &empty, std::ptr::null_mut());
                Ok(())
            });
        }
    }

    cmd.spawn()
}

/// Runs the stdio launcher until the child exits.
pub fn run_stdio_launcher(
    config: StdioLauncherConfig,
    #[cfg(unix)] signal_set: libc::sigset_t,
) -> ExitCode {
    let mut child = match spawn_inherited_child(&config) {
        Ok(child) => child,
        Err(_) => {
            eprintln!("Poracode could not start the MCP server.");
            return ExitCode::from(1);
        }
    };

    #[cfg(unix)]
    let active_pid = Arc::new(AtomicI32::new(child.id() as i32));

    #[cfg(unix)]
    {
        let pid_ref = Arc::clone(&active_pid);
        std::thread::spawn(move || {
            let mut sig: libc::c_int = 0;
            if unsafe { libc::sigwait(&signal_set, &mut sig) } != 0 {
                return;
            }
            let pid = pid_ref.load(Ordering::Acquire);
            if pid > 0 {
                unsafe {
                    libc::kill(pid, sig);
                }
                std::thread::sleep(std::time::Duration::from_secs(1));
                let still_active = pid_ref.load(Ordering::Acquire);
                if still_active > 0 {
                    unsafe {
                        libc::kill(still_active, libc::SIGKILL);
                    }
                }
            }
        });
    }

    let status = child.wait();
    #[cfg(unix)]
    active_pid.store(0, Ordering::Release);

    match status {
        Ok(exit) => match exit.code() {
            Some(0) => ExitCode::SUCCESS,
            Some(code) => {
                let low = (code & 0xff) as u8;
                ExitCode::from(if low == 0 { 1 } else { low })
            }
            None => ExitCode::from(1),
        },
        Err(_) => ExitCode::from(1),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_env_with_overrides_and_scrubs_stdio_config_key() {
        let explicit = vec![
            ("PORACODE_STDIO_UNIT_FIXTURE".to_string(), "ok".to_string()),
            (STDIO_CONFIG_ENV.to_string(), "must-be-removed".to_string()),
        ];
        let env = build_launcher_env(&explicit);
        assert!(
            env.iter()
                .any(|(k, v)| k == "PORACODE_STDIO_UNIT_FIXTURE" && v == "ok")
        );
        assert!(!env.iter().any(|(k, _)| env_key_eq(k, STDIO_CONFIG_ENV)));
    }
}
