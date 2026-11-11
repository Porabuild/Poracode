//! Windows child-process spawning compatible with Node's `cross-spawn` and
//! `windowsHide: true` (`CREATE_NO_WINDOW`).
//!
//! Resolves `.cmd` / `.bat` command shims via `PATHEXT` + `Path` + `cwd` and
//! wraps them in `%ComSpec% /d /s /c "..."` with `cross-spawn` argument and
//! `^` meta-character escaping so quoted arguments containing spaces,
//! ampersands, and parentheses arrive intact.

use std::ffi::OsString;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

/// `CREATE_NO_WINDOW` from `winbase.h`.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Builds a `std::process::Command` with `CREATE_NO_WINDOW`, the exact
/// case-insensitive environment map in `env`, optional `cwd`, and `.cmd`/`.bat`
/// shim wrapping matching `cross-spawn`.
pub fn build_windows_command(
    command: &str,
    args: &[String],
    cwd: Option<&str>,
    env: &[(OsString, OsString)],
) -> Command {
    let resolved = resolve_executable(command, cwd, env);
    let is_batch_shim = resolved
        .as_deref()
        .and_then(|p| p.extension())
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("cmd") || ext.eq_ignore_ascii_case("bat"))
        || has_batch_extension(command);

    let mut cmd = if is_batch_shim {
        let comspec = find_env(env, "ComSpec")
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| {
                if let Some(root) = find_env(env, "SystemRoot").filter(|v| !v.is_empty()) {
                    let mut p = PathBuf::from(root);
                    p.push("System32");
                    p.push("cmd.exe");
                    p.into_os_string()
                } else {
                    OsString::from("cmd.exe")
                }
            });
        let target = resolved
            .as_ref()
            .and_then(|p| p.to_str())
            .unwrap_or(command);
        let shell_command = build_cmd_shell_line(target, args);
        let mut c = Command::new(comspec);
        c.raw_arg("/d /s /c");
        c.raw_arg(format!("\"{shell_command}\""));
        c
    } else {
        let mut c = match resolved {
            Some(path) => Command::new(path),
            None => Command::new(command),
        };
        c.args(args);
        c
    };

    cmd.creation_flags(CREATE_NO_WINDOW);
    if let Some(dir) = cwd.filter(|d| !d.is_empty()) {
        cmd.current_dir(dir);
    }
    cmd.env_clear();
    for (k, v) in env {
        cmd.env(k, v);
    }
    cmd
}

fn has_batch_extension(command: &str) -> bool {
    Path::new(command)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("cmd") || ext.eq_ignore_ascii_case("bat"))
}

fn find_env(env: &[(OsString, OsString)], name: &str) -> Option<OsString> {
    env.iter()
        .rfind(|(k, _)| k.to_string_lossy().eq_ignore_ascii_case(name))
        .map(|(_, v)| v.clone())
}

fn resolve_executable(
    command: &str,
    cwd: Option<&str>,
    env: &[(OsString, OsString)],
) -> Option<PathBuf> {
    let pathext_raw = find_env(env, "PATHEXT")
        .map(|v| v.to_string_lossy().into_owned())
        .unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".to_string());
    let exts: Vec<String> = pathext_raw
        .split(';')
        .filter(|e| !e.is_empty())
        .map(|e| {
            if e.starts_with('.') {
                e.to_string()
            } else {
                format!(".{e}")
            }
        })
        .collect();

    let cmd_path = Path::new(command);
    let has_sep = command.contains('\\') || command.contains('/') || cmd_path.is_absolute();
    if has_sep {
        let base = if cmd_path.is_absolute() {
            cmd_path.to_path_buf()
        } else if let Some(dir) = cwd.filter(|d| !d.is_empty()) {
            Path::new(dir).join(cmd_path)
        } else {
            cmd_path.to_path_buf()
        };
        return probe_with_extensions(&base, &exts);
    }

    let mut search_dirs: Vec<PathBuf> = Vec::new();
    if let Some(dir) = cwd.filter(|d| !d.is_empty()) {
        search_dirs.push(PathBuf::from(dir));
    } else if let Ok(current) = std::env::current_dir() {
        search_dirs.push(current);
    }
    if let Some(path_val) = find_env(env, "PATH") {
        search_dirs.extend(std::env::split_paths(&path_val));
    }

    for dir in search_dirs {
        if let Some(found) = probe_with_extensions(&dir.join(command), &exts) {
            return Some(found);
        }
    }
    None
}

fn probe_with_extensions(base: &Path, exts: &[String]) -> Option<PathBuf> {
    if base.is_file() {
        return Some(base.to_path_buf());
    }
    let base_os = base.as_os_str();
    for ext in exts {
        let mut candidate_os = base_os.to_os_string();
        candidate_os.push(ext);
        let candidate = PathBuf::from(candidate_os);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Escapes command and arguments identically to `cross-spawn`:
/// 1. Quote command/argument for `CommandLineToArgvW` (`\"` + doubled trailing
///    backslashes) when empty or containing `[ \t"]`.
/// 2. Prefix `^` before every `cmd.exe` metacharacter `()%!^"<>&|`.
fn build_cmd_shell_line(command: &str, args: &[String]) -> String {
    let mut parts = Vec::with_capacity(1 + args.len());
    parts.push(escape_cmd_meta(&quote_cmd_token(command, true)));
    for arg in args {
        parts.push(escape_cmd_meta(&quote_cmd_token(arg, false)));
    }
    parts.join(" ")
}

fn quote_cmd_token(token: &str, is_command: bool) -> String {
    let needs_quotes = token.is_empty()
        || token.chars().any(|c| matches!(c, ' ' | '\t' | '"'))
        || (is_command
            && token
                .chars()
                .any(|c| matches!(c, '(' | ')' | '%' | '!' | '^' | '<' | '>' | '&' | '|')));
    if !needs_quotes {
        return token.to_string();
    }
    let mut quoted = String::with_capacity(token.len() + 2);
    quoted.push('"');
    let mut backslashes = 0usize;
    for ch in token.chars() {
        if ch == '\\' {
            backslashes += 1;
        } else if ch == '"' {
            for _ in 0..(backslashes * 2 + 1) {
                quoted.push('\\');
            }
            quoted.push('"');
            backslashes = 0;
        } else {
            for _ in 0..backslashes {
                quoted.push('\\');
            }
            backslashes = 0;
            quoted.push(ch);
        }
    }
    for _ in 0..(backslashes * 2) {
        quoted.push('\\');
    }
    quoted.push('"');
    quoted
}

fn escape_cmd_meta(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 2);
    for ch in value.chars() {
        if matches!(
            ch,
            '(' | ')' | '%' | '!' | '^' | '"' | '<' | '>' | '&' | '|'
        ) {
            out.push('^');
        }
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_spaces_ampersands_and_parentheses_like_cross_spawn() {
        let line = build_cmd_shell_line(
            r"C:\Temp\fixture.cmd",
            &["value with spaces & parentheses (literal)".to_string()],
        );
        assert_eq!(
            line,
            r#"C:\Temp\fixture.cmd ^"value with spaces ^& parentheses ^(literal^)^""#
        );
    }
}
