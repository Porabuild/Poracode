use crate::protocol::NativeProjectTreeEntry;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

const MAX_CHILD_WORKERS: usize = 8;

fn contained(root: &Path, target: PathBuf) -> io::Result<PathBuf> {
    if !target.starts_with(root) {
        return Err(io::Error::other("Path escapes the project root."));
    }
    Ok(target)
}

fn visible_children(path: &Path) -> bool {
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    for entry in entries {
        match entry {
            Ok(entry) if entry.file_name() != ".git" => return true,
            Ok(_) => {}
            Err(_) => return false,
        }
    }
    false
}

pub(super) fn list(
    root_path: &str,
    directory_path: &str,
    timeout_ms: u64,
) -> io::Result<Vec<NativeProjectTreeEntry>> {
    let start = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    let normalized = directory_path.replace('\\', "/");
    let parts: Vec<&str> = normalized
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect();
    if parts.contains(&"..") {
        return Err(io::Error::other("Path traversal is not allowed."));
    }
    let directory_path = parts.join("/");
    let root = fs::canonicalize(root_path)?;
    let directory = if directory_path.is_empty() {
        root.clone()
    } else {
        let lexical = contained(
            &root,
            parts
                .iter()
                .fold(root.clone(), |path, part| path.join(part)),
        )?;
        contained(&root, fs::canonicalize(lexical)?)?
    };
    let mut entries = Vec::new();
    for entry in fs::read_dir(directory)? {
        if start.elapsed() >= timeout {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "listTree timed out",
            ));
        }
        let entry = entry?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Non-Unicode file name"))?;
        if name == ".git" {
            continue;
        }
        let file_type = entry.file_type()?;
        let child_directory = if file_type.is_dir() {
            Some(entry.path())
        } else if file_type.is_symlink() {
            fs::canonicalize(entry.path())
                .and_then(|target| contained(&root, target))
                .ok()
                .filter(|target| target.is_dir())
        } else {
            None
        };
        let path = if directory_path.is_empty() {
            name.clone()
        } else {
            format!("{directory_path}/{name}")
        };
        entries.push((
            NativeProjectTreeEntry {
                path,
                name,
                entry_type: if child_directory.is_some() {
                    "directory"
                } else {
                    "file"
                }
                .into(),
                has_children: child_directory.as_ref().map(|_| false),
            },
            child_directory,
        ));
    }
    let mut directories: Vec<_> = entries
        .iter_mut()
        .filter(|(_, path)| path.is_some())
        .collect();
    if !directories.is_empty() {
        let chunk_size = directories.len().div_ceil(MAX_CHILD_WORKERS);
        thread::scope(|scope| -> io::Result<()> {
            for chunk in directories.chunks_mut(chunk_size) {
                thread::Builder::new().spawn_scoped(scope, || {
                    for (entry, path) in chunk {
                        if start.elapsed() >= timeout {
                            break;
                        }
                        entry.has_children = path.as_ref().map(|path| visible_children(path));
                    }
                })?;
            }
            Ok(())
        })?;
    }
    if start.elapsed() >= timeout {
        return Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "listTree timed out",
        ));
    }
    // Sort once in the host, using its locale and libuv's platform tie order.
    Ok(entries.into_iter().map(|(entry, _)| entry).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_before_accessing_root() {
        for path in ["..", "src/../file", "src\\..\\file"] {
            let result = list("/missing-root", path, 10_000);
            assert!(result.is_err_and(|error| error.to_string().contains("traversal")));
        }
    }
}
