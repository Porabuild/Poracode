//! Windows child-process spawning compatible with Node's `cross-spawn` and
//! `windowsHide: true` (`CREATE_NO_WINDOW`).
//!
//! Resolves `.cmd` / `.bat` command shims via `PATHEXT` + `Path` + `cwd` and
//! wraps them in `%ComSpec% /d /s /c "..."` with `cross-spawn` argument and
//! `^` meta-character escaping so quoted arguments containing spaces,
//! ampersands, and parentheses arrive intact.

use std::ffi::OsString;
use std::fs::File;
use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::{Component, Path, PathBuf};
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

    let mut effective_command = command.to_string();
    let mut effective_args = args.to_vec();
    let mut effective_path = resolved.clone();
    let mut has_shebang = false;
    if let (Some(path), Some(interpreter)) = (
        resolved.as_deref(),
        resolved.as_deref().and_then(read_shebang_command),
    ) {
        let mut script_args = Vec::with_capacity(args.len() + 1);
        script_args.push(path.to_string_lossy().into_owned());
        script_args.extend_from_slice(args);
        effective_command = interpreter;
        effective_args = script_args;
        effective_path = resolve_executable(&effective_command, cwd, env);
        has_shebang = true;
    }

    let mut cmd = if is_batch_shim && !has_shebang {
        build_cmd_wrapped(command, args, env, resolved.as_deref())
    } else if effective_path.is_none() && !has_shebang {
        // Keep missing commands as spawn errors so the launcher can emit its
        // concise failure message instead of cmd.exe's diagnostic.
        let mut c = Command::new(&effective_command);
        c.args(&effective_args);
        c
    } else if effective_path
        .as_deref()
        .and_then(Path::extension)
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("com") || ext.eq_ignore_ascii_case("exe"))
    {
        let mut c =
            Command::new(effective_path.unwrap_or_else(|| PathBuf::from(&effective_command)));
        c.args(&effective_args);
        c
    } else {
        build_cmd_wrapped(
            &effective_command,
            &effective_args,
            env,
            effective_path.as_deref(),
        )
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

fn build_cmd_wrapped(
    command: &str,
    args: &[String],
    env: &[(OsString, OsString)],
    resolved: Option<&Path>,
) -> Command {
    let comspec = find_env(env, "ComSpec")
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            if let Some(root) = find_env(env, "SystemRoot").filter(|value| !value.is_empty()) {
                let mut path = PathBuf::from(root);
                path.push("System32");
                path.push("cmd.exe");
                path.into_os_string()
            } else {
                OsString::from("cmd.exe")
            }
        });
    let double_escape_meta_chars = resolved
        .and_then(Path::to_str)
        .is_some_and(is_node_modules_bin_cmd);
    let shell_command = build_cmd_shell_line(command, args, double_escape_meta_chars);
    let mut cmd = Command::new(comspec);
    cmd.raw_arg("/d /s /c");
    cmd.raw_arg(format!("\"{shell_command}\""));
    cmd
}

fn absolute_command_path(path: &Path, cwd: Option<&str>) -> PathBuf {
    if path.is_absolute() {
        return path.to_path_buf();
    }
    let base = cwd
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_default();
    std::env::current_dir()
        .unwrap_or_default()
        .join(base)
        .join(path)
}

fn read_shebang_command(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let mut buffer = [0u8; 150];
    let count = file.read(&mut buffer).ok()?;
    let contents = String::from_utf8_lossy(&buffer[..count]);
    let without_prefix = contents.strip_prefix("#!")?;
    let line = without_prefix.strip_prefix(' ').unwrap_or(without_prefix);
    let shebang = line.split(['\n', '\r']).next()?;
    let mut parts = shebang.split(' ');
    let path = parts.next()?;
    if path.is_empty() {
        return None;
    }
    let argument = parts.next().unwrap_or_default();
    let binary = path.rsplit('/').next().unwrap_or(path);
    if binary == "env" {
        return (!argument.is_empty()).then(|| argument.to_string());
    }
    Some(if argument.is_empty() {
        binary.to_string()
    } else {
        format!("{binary} {argument}")
    })
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
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| ".EXE;.CMD;.BAT;.COM".to_string());
    let exts: Vec<String> = pathext_raw
        .split(';')
        .map(|e| {
            if e.is_empty() || e.starts_with('.') {
                e.to_string()
            } else {
                format!(".{e}")
            }
        })
        .collect();

    let cmd_path = Path::new(command);
    let has_sep = command.contains('\\') || command.contains('/') || cmd_path.is_absolute();
    if has_sep {
        let base = absolute_command_path(cmd_path, cwd);
        return probe_with_extensions(&base, &exts, command.contains('.'))
            .or_else(|| base.is_file().then_some(base));
    }

    let mut search_dirs: Vec<PathBuf> = Vec::new();
    if let Some(dir) = cwd.filter(|d| !d.is_empty()) {
        search_dirs.push(absolute_command_path(Path::new(dir), None));
    } else if let Ok(current) = std::env::current_dir() {
        search_dirs.push(current);
    }
    if let Some(path_val) = find_env(env, "PATH") {
        let base = cwd
            .filter(|d| !d.is_empty())
            .map(|dir| absolute_command_path(Path::new(dir), None))
            .or_else(|| std::env::current_dir().ok());
        search_dirs.extend(std::env::split_paths(&path_val).map(|dir| {
            if dir.is_absolute() {
                dir
            } else {
                base.as_deref().map_or(dir.clone(), |base| base.join(dir))
            }
        }));
    }

    for dir in &search_dirs {
        if let Some(found) = probe_with_extensions(&dir.join(command), &exts, command.contains('.'))
        {
            return Some(found);
        }
    }
    for dir in search_dirs {
        let candidate = dir.join(command);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn probe_with_extensions(base: &Path, exts: &[String], try_exact: bool) -> Option<PathBuf> {
    let is_pathext_executable = |path: &Path| {
        exts.iter().any(|ext| {
            ext.is_empty()
                || path
                    .as_os_str()
                    .to_string_lossy()
                    .to_ascii_lowercase()
                    .ends_with(&ext.to_ascii_lowercase())
        })
    };
    if try_exact && base.is_file() && is_pathext_executable(base) {
        return Some(base.to_path_buf());
    }
    let base_os = base.as_os_str();
    for ext in exts {
        let mut candidate_os = base_os.to_os_string();
        candidate_os.push(ext);
        let candidate = PathBuf::from(candidate_os);
        if candidate.is_file() && is_pathext_executable(&candidate) {
            return Some(candidate);
        }
    }
    None
}

fn is_node_modules_bin_cmd(path: &str) -> bool {
    let normalized = path.replace('/', "\\");
    let parts: Vec<_> = normalized.split('\\').collect();
    let Some(name) = parts.last() else {
        return false;
    };
    parts.len() >= 3
        && parts[parts.len() - 3].eq_ignore_ascii_case("node_modules")
        && parts[parts.len() - 2].eq_ignore_ascii_case(".bin")
        && name.to_ascii_lowercase().ends_with(".cmd")
        && name.len() > 4
}

fn normalize_windows_command(command: &str) -> String {
    if command.is_empty() {
        return ".".to_string();
    }
    let mut normalized = PathBuf::new();
    for component in Path::new(command).components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if normalized
                    .file_name()
                    .is_some_and(|name| name != std::ffi::OsStr::new(".."))
                {
                    normalized.pop();
                } else if !normalized.has_root() {
                    normalized.push("..");
                }
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    if normalized.as_os_str().is_empty() {
        normalized.push(".");
    }
    normalized.to_string_lossy().replace('/', "\\")
}

fn build_cmd_shell_line(command: &str, args: &[String], double_escape_meta_chars: bool) -> String {
    let mut parts = Vec::with_capacity(1 + args.len());
    parts.push(escape_cmd_meta(&normalize_windows_command(command)));
    for arg in args {
        parts.push(escape_cmd_argument(arg, double_escape_meta_chars));
    }
    parts.join(" ")
}

fn escape_cmd_argument(argument: &str, double_escape_meta_chars: bool) -> String {
    let mut quoted = String::with_capacity(argument.len() + 2);
    quoted.push('"');
    let mut backslashes = 0usize;
    for ch in argument.chars() {
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
    let quoted = escape_cmd_meta(&quoted);
    if double_escape_meta_chars {
        escape_cmd_meta(&quoted)
    } else {
        quoted
    }
}

fn escape_cmd_meta(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 2);
    for ch in value.chars() {
        if matches!(
            ch,
            '(' | ')'
                | '['
                | ']'
                | '%'
                | '!'
                | '^'
                | '"'
                | '`'
                | '<'
                | '>'
                | '&'
                | '|'
                | ';'
                | ','
                | ' '
                | '*'
                | '?'
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
    use crate::stdio_launcher::upsert_env;
    use std::fs;

    #[test]
    fn escapes_spaces_ampersands_and_parentheses_like_cross_spawn() {
        let line = build_cmd_shell_line(
            r"C:\Temp\fixture.cmd",
            &["value with spaces & parentheses (literal)".to_string()],
            false,
        );
        assert_eq!(
            line,
            r#"C:\Temp\fixture.cmd ^"value^ with^ spaces^ ^&^ parentheses^ ^(literal^)^""#
        );
    }

    struct TestDir(PathBuf);

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn node_modules_cmd_shim_forwards_arguments_without_running_shell_syntax() {
        let root = std::env::temp_dir().join(format!(
            "poracode mcp relay win spawn-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _cleanup = TestDir(root.clone());
        let shim_dir = root.join("node_modules").join(".bin");
        fs::create_dir_all(&shim_dir).unwrap();
        let args = vec![
            "a=1&echo.INJECTED".to_string(),
            "https://host/mcp?a=1&b=2".to_string(),
            "pipe|arg".to_string(),
            "lt<arg".to_string(),
            "gt>arg".to_string(),
            "%TEMP%".to_string(),
            "!bang!".to_string(),
            "^caret".to_string(),
            "a\"b".to_string(),
            "tick`x".to_string(),
            "semi;comma,".to_string(),
            "space value".to_string(),
            "star*".to_string(),
            "question?".to_string(),
            "[brackets]".to_string(),
            "trailing\\".to_string(),
        ];
        let mut env: Vec<(OsString, OsString)> = std::env::vars_os().collect();
        upsert_env(&mut env, "PATHEXT", ".COM;.EXE;.BAT;.CMD");
        let mut path = root.as_os_str().to_os_string();
        path.push(";");
        if let Some(original_path) = find_env(&env, "PATH") {
            path.push(original_path);
        }
        upsert_env(&mut env, "PATH", &path.to_string_lossy());
        for shim in [
            shim_dir.join("fixture.cmd"),
            root.join("ordinary.cmd"),
            root.join("ordinary.bat"),
        ] {
            let script = shim.with_file_name("argv.js");
            fs::write(&shim, "@echo off\r\nnode \"%~dp0argv.js\" %*\r\n").unwrap();
            fs::write(
                &script,
                "process.stdout.write(JSON.stringify(process.argv.slice(2)))",
            )
            .unwrap();
            let output = build_windows_command(
                shim.to_str().unwrap(),
                &args,
                Some(root.to_str().unwrap()),
                &env,
            )
            .output()
            .unwrap();

            assert!(output.status.success(), "shim: {}", shim.display());
            assert_eq!(
                serde_json::from_slice::<Vec<String>>(&output.stdout).unwrap(),
                args,
                "shim: {}",
                shim.display()
            );
        }

        let bare_shim = root.join("lookup.cmd");
        let bare_script = root.join("argv.js");
        fs::write(root.join("lookup"), "extensionless POSIX shim").unwrap();
        fs::write(&bare_shim, "@echo off\r\nnode \"%~dp0argv.js\" %*\r\n").unwrap();
        fs::write(
            &bare_script,
            "process.stdout.write(JSON.stringify(process.argv.slice(2)))",
        )
        .unwrap();
        for (command, cwd) in [
            ("lookup".to_string(), None),
            (r".\lookup".to_string(), Some(root.to_str().unwrap())),
            (root.join("lookup").to_str().unwrap().to_string(), None),
        ] {
            let output = build_windows_command(&command, &args, cwd, &env)
                .output()
                .unwrap();

            assert!(output.status.success(), "command: {command}");
            assert_eq!(
                serde_json::from_slice::<Vec<String>>(&output.stdout).unwrap(),
                args,
                "command: {command}"
            );
        }
    }

    #[test]
    fn launches_extensionless_and_js_shebang_scripts_like_cross_spawn() {
        let root = std::env::temp_dir().join(format!(
            "poracode mcp relay shebang-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _cleanup = TestDir(root.clone());
        fs::create_dir_all(&root).unwrap();
        let args = vec![
            "a&b".to_string(),
            "space value".to_string(),
            "%TEMP%".to_string(),
            "quote\"value".to_string(),
        ];
        let env: Vec<(OsString, OsString)> = std::env::vars_os().collect();
        let mut env_with_cwd = env;
        upsert_env(&mut env_with_cwd, "PATH", &std::env::var("PATH").unwrap());
        for (name, shebang) in [
            (
                "fixture-server-without-extension",
                "#! /usr/bin/env node\r\n",
            ),
            ("fixture-server-with-js.js", "#!/usr/bin/env node\r\n"),
        ] {
            let script = root.join(name);
            fs::write(
                &script,
                format!(
                    "{shebang}process.stdout.write(JSON.stringify(process.argv.slice(2)));\r\n"
                ),
            )
            .unwrap();
            let output = build_windows_command(
                script.to_str().unwrap(),
                &args,
                Some(root.to_str().unwrap()),
                &env_with_cwd,
            )
            .output()
            .unwrap();

            assert!(output.status.success(), "script: {}", script.display());
            assert_eq!(
                serde_json::from_slice::<Vec<String>>(&output.stdout).unwrap(),
                args,
                "script: {}",
                script.display()
            );
        }

        let current = std::env::current_dir().unwrap();
        let relative_root = current.join("tmp").join(format!(
            "poracode mcp relay relative shebang-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _relative_cleanup = TestDir(relative_root.clone());
        fs::create_dir_all(&relative_root).unwrap();
        let script = relative_root.join("relative-server.js");
        fs::write(
            &script,
            "#!/usr/bin/env node\r\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\r\n",
        )
        .unwrap();
        let relative_cwd = relative_root
            .strip_prefix(&current)
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let output = build_windows_command(
            r".\relative-server.js",
            &args,
            Some(&relative_cwd),
            &env_with_cwd,
        )
        .output()
        .unwrap();
        assert!(output.status.success(), "relative cwd: {relative_cwd}");
        assert_eq!(
            serde_json::from_slice::<Vec<String>>(&output.stdout).unwrap(),
            args
        );
    }

    #[test]
    fn searches_all_pathext_directories_before_literal_files() {
        let root = std::env::temp_dir().join(format!(
            "poracode mcp relay search order-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _cleanup = TestDir(root.clone());
        let first_dir = root.join("first");
        let second_dir = root.join("second");
        fs::create_dir_all(&first_dir).unwrap();
        fs::create_dir_all(&second_dir).unwrap();
        fs::write(first_dir.join("ordered"), "extensionless script").unwrap();
        fs::write(
            second_dir.join("ordered.cmd"),
            "@echo off\r\nnode \"%~dp0argv.js\" %*\r\n",
        )
        .unwrap();
        fs::write(
            second_dir.join("argv.js"),
            "process.stdout.write(JSON.stringify(process.argv.slice(2)))",
        )
        .unwrap();
        let args = vec!["from-cmd".to_string()];
        let mut env: Vec<(OsString, OsString)> = std::env::vars_os().collect();
        upsert_env(&mut env, "PATHEXT", ".COM;.EXE;.BAT;.CMD");
        let mut path_dirs = vec![first_dir, second_dir];
        path_dirs.extend(
            std::env::split_paths(&find_env(&env, "PATH").unwrap_or_default()).collect::<Vec<_>>(),
        );
        let path = std::env::join_paths(path_dirs).unwrap();
        upsert_env(&mut env, "PATH", &path.to_string_lossy());

        let output = build_windows_command("ordered", &args, None, &env)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "status: {}; stderr: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            serde_json::from_slice::<Vec<String>>(&output.stdout).unwrap(),
            args
        );
    }

    #[test]
    fn matches_cross_spawn_escape_for_cmd_shims_and_node_modules_bin() {
        assert_eq!(
            build_cmd_shell_line("C:/x/npx.cmd", &["a=1&b=2".to_string()], false),
            r#"C:\x\npx.cmd ^"a=1^&b=2^""#
        );
        assert_eq!(
            build_cmd_shell_line("C:/x/../npx.cmd", &[], false),
            r#"C:\npx.cmd"#
        );
        assert_eq!(
            build_cmd_shell_line(
                "C:/x/node_modules/.bin/npx.cmd",
                &["a=1&b=2".to_string()],
                true
            ),
            r#"C:\x\node_modules\.bin\npx.cmd ^^^"a=1^^^&b=2^^^""#
        );
        assert!(is_node_modules_bin_cmd(r"C:\x\node_modules\.bin\npx.cmd"));
        assert!(is_node_modules_bin_cmd(r"C:/x/NODE_MODULES/.BIN/npx.CMD"));
        assert!(!is_node_modules_bin_cmd(r"C:\x\node_modules\npx.cmd"));
        assert!(!is_node_modules_bin_cmd(r"C:\x\node_modules\.bin\npx.bat"));
    }
}
