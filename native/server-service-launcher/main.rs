#![cfg_attr(windows, windows_subsystem = "windows")]

const HELPER_VERSION: &str = "1.0.0";

#[cfg(windows)]
mod launcher {
    use std::ffi::OsString;
    use std::fs::{self, File, OpenOptions};
    use std::io::{self, Write};
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    use std::os::windows::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};

    const VERSION: &str = "--run-v1";
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x00200000;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

    struct Selection {
        node: PathBuf,
        prefix: PathBuf,
        release: PathBuf,
        profile: PathBuf,
        config: Option<PathBuf>,
    }

    fn invalid() -> io::Error {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "Unsupported service launcher selection",
        )
    }

    fn absolute(value: &OsString) -> io::Result<PathBuf> {
        let path = PathBuf::from(value);
        let text = value.to_str().ok_or_else(invalid)?;
        if !path.is_absolute() || text.chars().any(char::is_control) {
            return Err(invalid());
        }
        Ok(path)
    }

    fn regular(path: &Path) -> io::Result<()> {
        let stat = fs::symlink_metadata(path)?;
        if !stat.is_file() || stat.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(invalid());
        }
        Ok(())
    }

    fn select(args: &[OsString]) -> io::Result<Selection> {
        // Closed protocol1: future/extra input refuses before filesystem writes or spawn.
        if args.len() != 6 || args[0] != VERSION {
            return Err(invalid());
        }
        let nonce = args[1].to_str().ok_or_else(invalid)?;
        if nonce.len() != 48 || !nonce.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(invalid());
        }
        let node = absolute(&args[2])?;
        let prefix = absolute(&args[3])?;
        let profile = absolute(&args[4])?;
        let config = if args[5].is_empty() {
            None
        } else {
            Some(absolute(&args[5])?)
        };
        if !node
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case("node.exe"))
        {
            return Err(invalid());
        }
        regular(&node)?;
        let physical_prefix = fs::canonicalize(&prefix)?;
        let executable = fs::canonicalize(std::env::current_exe()?)?;
        if executable != physical_prefix.join("service-launcher-v1.exe") {
            return Err(invalid());
        }
        let release = fs::canonicalize(prefix.join("current"))?;
        if release.parent() != Some(physical_prefix.join("releases").as_path()) {
            return Err(invalid());
        }
        regular(&release.join("lib").join("server.cjs"))?;
        if let Some(path) = &config {
            regular(path)?;
        }
        Ok(Selection {
            node,
            prefix,
            release,
            profile,
            config,
        })
    }

    fn startup_log(prefix: &Path) -> io::Result<File> {
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(prefix.join("service-startup.log"))?;
        if file.metadata()?.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(invalid());
        }
        Ok(file)
    }

    pub fn run() -> io::Result<i32> {
        let selection = select(&std::env::args_os().skip(1).collect::<Vec<_>>())?;
        let mut log = startup_log(&selection.prefix)?;
        let mut command = Command::new(&selection.node);
        command
            .arg(selection.release.join("lib").join("server.cjs"))
            .arg("--base-dir")
            .arg(&selection.profile)
            .arg("serve")
            .current_dir(&selection.prefix)
            .stdin(Stdio::null())
            .stdout(log.try_clone()?)
            .stderr(log.try_clone()?)
            .creation_flags(CREATE_NO_WINDOW);
        if let Some(path) = &selection.config {
            command.arg("--config").arg(path);
        }
        for name in [
            "NODE_OPTIONS",
            "NODE_PATH",
            "ELECTRON_RUN_AS_NODE",
            "PORACODE_BASE_DIR",
            "PORACODE_APP_VERSION",
            "PORACODE_UPGRADE_STAGING",
        ] {
            command.env_remove(name);
        }
        let mut child = command.spawn()?;
        // The prefix log is diagnostic output, never a PID lock or ownership grant.
        let recorded = writeln!(
            log,
            "[service-launcher-v1] host started (pid {})",
            child.id()
        )
        .and_then(|()| log.flush());
        let status = child.wait()?;
        recorded?;
        let code = status.code().unwrap_or(1);
        writeln!(log, "[service-launcher-v1] host joined (exit {})", code)?;
        log.flush()?;
        Ok(code)
    }
}

fn main() {
    if std::env::args_os().skip(1).collect::<Vec<_>>() == ["--version"] {
        println!("poracode-service-launcher {HELPER_VERSION}");
        return;
    }
    #[cfg(windows)]
    std::process::exit(launcher::run().unwrap_or(1));
    #[cfg(not(windows))]
    std::process::exit(64);
}
