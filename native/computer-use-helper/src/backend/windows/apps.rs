use std::collections::HashSet;
use std::io::Read as _;
use std::path::PathBuf;
use std::process::{Child, Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;

use crate::protocol::Result;
use crate::protocol::actions::AppInfo;

use super::shell_apps_folder_id;

const MAX_RESULTS: usize = 50;

#[derive(Deserialize)]
struct StartApp {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "AppID")]
    app_id: String,
}

fn wait_for_output(mut child: Child, timeout: Duration) -> Option<Output> {
    let mut stdout = child.stdout.take()?;
    let mut stderr = child.stderr.take()?;
    let stdout_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stdout.read_to_end(&mut bytes);
        bytes
    });
    let stderr_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stderr.read_to_end(&mut bytes);
        bytes
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(25)),
            Ok(None) | Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };
    let stdout = stdout_reader.join().unwrap_or_default();
    let stderr = stderr_reader.join().unwrap_or_default();
    status.map(|status| Output {
        status,
        stdout,
        stderr,
    })
}

fn parse_start_apps(json: &str, query: &str) -> Vec<AppInfo> {
    let value = serde_json::from_str::<serde_json::Value>(json).unwrap_or_default();
    let items = match value {
        serde_json::Value::Array(items) => items,
        object @ serde_json::Value::Object(_) => vec![object],
        _ => Vec::new(),
    };
    let query = query.to_lowercase();
    let mut seen = HashSet::new();
    let mut apps = items
        .into_iter()
        .filter_map(|value| serde_json::from_value::<StartApp>(value).ok())
        .filter_map(|app| {
            let name = app.name.trim();
            let app_id = app.app_id.trim();
            if name.is_empty()
                || app_id.is_empty()
                || (!name.to_lowercase().contains(&query)
                    && !app_id.to_lowercase().contains(&query))
            {
                return None;
            }
            let id = shell_apps_folder_id(app_id);
            seen.insert(id.to_lowercase())
                .then(|| AppInfo::installed(id, name.to_string()))
        })
        .collect::<Vec<_>>();
    apps.sort_by_key(|app| app.display_name.to_lowercase());
    apps.truncate(MAX_RESULTS);
    apps
}

pub fn search(query: &str) -> Result<Vec<AppInfo>> {
    let powershell = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
        .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
    let child = Command::new(powershell)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $items=Get-StartApps | Select-Object Name,AppID; ConvertTo-Json -InputObject @($items) -Compress -Depth 3",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let Ok(child) = child else {
        log::debug!("Windows installed-app discovery could not start PowerShell");
        return Ok(Vec::new());
    };
    let Some(output) = wait_for_output(child, Duration::from_secs(5)) else {
        log::debug!("Windows installed-app discovery timed out or failed");
        return Ok(Vec::new());
    };
    if !output.status.success() {
        log::debug!(
            "Windows installed-app discovery failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
        return Ok(Vec::new());
    }
    Ok(parse_start_apps(
        &String::from_utf8_lossy(&output.stdout),
        query,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_filters_start_apps_into_launchable_ids() {
        let apps = parse_start_apps(
            r#"[{"Name":"Calculator","AppID":"Microsoft.WindowsCalculator!App"},{"Name":"Paint","AppID":"Microsoft.Paint!App"}]"#,
            "calc",
        );

        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].display_name, "Calculator");
        assert_eq!(
            apps[0].id,
            r"shell:AppsFolder\Microsoft.WindowsCalculator!App"
        );
        assert!(!apps[0].is_running);
    }

    #[test]
    fn filters_start_apps_with_unicode_case() {
        let apps = parse_start_apps(
            r#"[{"Name":"КАЛЬКУЛЯТОР","AppID":"Microsoft.Calculator!App"}]"#,
            "калькулятор",
        );
        assert_eq!(apps.len(), 1);
    }

    #[test]
    fn drains_child_output_while_waiting() {
        let powershell = std::env::var_os("SystemRoot")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
            .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
        let child = Command::new(powershell)
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[Console]::Out.Write('x' * 100000)",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();

        let output = wait_for_output(child, Duration::from_secs(5)).unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout.len(), 100_000);
    }
}
