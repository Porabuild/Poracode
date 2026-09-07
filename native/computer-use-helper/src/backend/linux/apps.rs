use std::collections::HashSet;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use crate::protocol::Result;
use crate::protocol::actions::AppInfo;

const MAX_CATALOG_APPS: usize = 4_096;
const MAX_DEPTH: usize = 2;
const MAX_DESKTOP_FILE_BYTES: u64 = 1024 * 1024;

struct DesktopEntry {
    name: String,
    exec: Option<String>,
    startup_wm_class: Option<String>,
}

fn command_exists(command: &str) -> bool {
    let path = Path::new(command);
    let is_executable = |path: &Path| {
        path.metadata()
            .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
    };
    if path.is_absolute() {
        return is_executable(path);
    }
    if command.contains('/') {
        return false;
    }
    std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
        .any(|directory| is_executable(&directory.join(command)))
}

fn desktop_entry(path: &Path) -> Option<DesktopEntry> {
    if path.metadata().ok()?.len() > MAX_DESKTOP_FILE_BYTES {
        return None;
    }
    let text = std::fs::read_to_string(path).ok()?;
    let mut in_desktop_entry = false;
    let mut name = None;
    let mut hidden = false;
    let mut application = false;
    let mut dbus_activatable = false;
    let mut exec = None;
    let mut startup_wm_class = None;
    let mut try_exec = None;
    for raw in text.lines() {
        let line = raw.trim();
        if line.starts_with('[') && line.ends_with(']') {
            if in_desktop_entry {
                break;
            }
            in_desktop_entry = line == "[Desktop Entry]";
            continue;
        }
        if !in_desktop_entry || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        match key {
            "Name" => name = Some(value.trim().to_string()),
            "Type" => application = value.trim() == "Application",
            "Hidden" | "NoDisplay" => hidden |= value.trim().eq_ignore_ascii_case("true"),
            "DBusActivatable" => dbus_activatable = value.trim().eq_ignore_ascii_case("true"),
            "Exec" => exec = Some(value.trim().to_string()).filter(|value| !value.is_empty()),
            "StartupWMClass" => {
                startup_wm_class = Some(value.trim().to_string()).filter(|value| !value.is_empty());
            }
            "TryExec" => {
                try_exec = Some(value.trim().to_string()).filter(|value| !value.is_empty())
            }
            _ => {}
        }
    }
    let name = name.filter(|name| !name.is_empty())?;
    if !application
        || hidden
        || (exec.is_none() && !dbus_activatable)
        || try_exec
            .as_deref()
            .is_some_and(|command| !command_exists(command))
    {
        return None;
    }
    Some(DesktopEntry {
        name,
        exec,
        startup_wm_class,
    })
}

fn exec_program(exec: &str) -> Option<&str> {
    let exec = exec.trim();
    if let Some(quoted) = exec.strip_prefix('"') {
        return quoted.split_once('"').map(|(program, _)| program);
    }
    exec.split_whitespace().next()
}

pub fn launch_hints(path: &Path) -> Vec<String> {
    let Some(entry) = desktop_entry(path) else {
        return Vec::new();
    };
    let mut hints = vec![entry.name.to_lowercase()];
    if let Some(class) = entry.startup_wm_class {
        hints.push(class.to_lowercase());
    }
    if let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) {
        hints.push(stem.to_lowercase());
    }
    if let Some(program) = entry.exec.as_deref().and_then(exec_program)
        && let Some(stem) = Path::new(program)
            .file_stem()
            .and_then(|stem| stem.to_str())
    {
        hints.push(stem.to_lowercase());
    }
    hints.sort();
    hints.dedup();
    hints
}

fn collect_apps(root: &Path, depth: usize, apps: &mut Vec<AppInfo>) {
    if depth > MAX_DEPTH || apps.len() >= MAX_CATALOG_APPS {
        return;
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        if apps.len() >= MAX_CATALOG_APPS {
            break;
        }
        let path = entry.path();
        if path
            .extension()
            .is_some_and(|extension| extension == "desktop")
        {
            let Some(entry) = desktop_entry(&path) else {
                continue;
            };
            let id = path.to_string_lossy().into_owned();
            apps.push(AppInfo::installed(id, entry.name));
        } else if path.is_dir() && !entry.file_name().to_string_lossy().starts_with('.') {
            collect_apps(&path, depth + 1, apps);
        }
    }
}

pub fn list() -> Result<Vec<AppInfo>> {
    let mut roots = Vec::new();
    if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
        roots.push(PathBuf::from(data_home).join("applications"));
    } else if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join(".local/share/applications"));
    }
    let data_dirs =
        std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    roots.extend(
        data_dirs
            .split(':')
            .filter(|path| !path.is_empty())
            .map(|path| PathBuf::from(path).join("applications")),
    );

    let mut apps = Vec::new();
    for root in roots {
        collect_apps(&root, 0, &mut apps);
    }
    let mut seen = HashSet::new();
    apps.retain(|app| seen.insert(app.id.clone()));
    apps.sort_by_key(|app| app.display_name.to_lowercase());
    Ok(apps)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_visible_application_desktop_entries() {
        let root = tempfile::tempdir().unwrap();
        let visible = root.path().join("calculator.desktop");
        let hidden = root.path().join("hidden.desktop");
        std::fs::write(
            &visible,
            "[Desktop Entry]\nType=Application\nName=Calculator\nExec=calc\n",
        )
        .unwrap();
        std::fs::write(
            &hidden,
            "[Desktop Entry]\nType=Application\nName=Hidden\nNoDisplay=true\n",
        )
        .unwrap();

        assert_eq!(
            desktop_entry(&visible).map(|entry| entry.name).as_deref(),
            Some("Calculator")
        );
        assert!(desktop_entry(&hidden).is_none());
    }

    #[test]
    fn rejects_desktop_entries_without_a_launch_mechanism_or_available_try_exec() {
        let root = tempfile::tempdir().unwrap();
        let missing_exec = root.path().join("missing.desktop");
        let missing_try_exec = root.path().join("try.desktop");
        std::fs::write(
            &missing_exec,
            "[Desktop Entry]\nType=Application\nName=Missing\n",
        )
        .unwrap();
        std::fs::write(
            &missing_try_exec,
            "[Desktop Entry]\nType=Application\nName=Missing\nExec=missing\nTryExec=poracode-command-that-does-not-exist\n",
        )
        .unwrap();

        assert!(desktop_entry(&missing_exec).is_none());
        assert!(desktop_entry(&missing_try_exec).is_none());
    }

    #[test]
    fn try_exec_requires_an_executable_file() {
        let root = tempfile::tempdir().unwrap();
        let command = root.path().join("editor");
        let desktop = root.path().join("editor.desktop");
        std::fs::write(&command, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&command, std::fs::Permissions::from_mode(0o644)).unwrap();
        std::fs::write(
            &desktop,
            format!(
                "[Desktop Entry]\nType=Application\nName=Editor\nExec=editor\nTryExec={}\n",
                command.display()
            ),
        )
        .unwrap();
        assert!(desktop_entry(&desktop).is_none());

        std::fs::set_permissions(&command, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(desktop_entry(&desktop).is_some());
    }

    #[test]
    fn accepts_dbus_activated_entries_and_builds_specific_launch_hints() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("org.example.Éditeur.desktop");
        std::fs::write(
            &path,
            "[Desktop Entry]\nType=Application\nName=ÉDITEUR\nDBusActivatable=true\nStartupWMClass=ExampleEditor\n",
        )
        .unwrap();

        let mut apps = Vec::new();
        collect_apps(root.path(), 0, &mut apps);
        assert_eq!(apps.len(), 1);
        assert!(launch_hints(&path).contains(&"exampleeditor".into()));
    }
}
