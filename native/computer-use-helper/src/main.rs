use std::io::Write as _;
use std::path::PathBuf;

use poracode_computer_use::backend::{self, BackendOptions};
use poracode_computer_use::host::run;
use poracode_computer_use::protocol::locked_use::{
    DEFAULT_OVERLAY_SUBTITLE, DEFAULT_OVERLAY_TITLE, GUARD_BRIGHTNESS_FLAG, GUARD_FLAG,
    GUARD_SUBTITLE_FLAG, GUARD_TITLE_FLAG,
};

#[derive(Default)]
struct Arguments {
    hello: bool,
    state_dir: Option<PathBuf>,
    version: bool,
    /// `--locked-use-guard`: run as the Locked Computer Use guard (macOS).
    locked_use_guard: bool,
    overlay_title: Option<String>,
    overlay_subtitle: Option<String>,
    brightness: Option<String>,
}

fn string_value(
    args: &mut impl Iterator<Item = std::ffi::OsString>,
    flag: &str,
) -> Result<String, String> {
    args.next()
        .and_then(|value| value.into_string().ok())
        .ok_or_else(|| format!("{flag} requires a UTF-8 value"))
}

fn parse_arguments() -> Result<Arguments, String> {
    let mut parsed = Arguments::default();
    let mut args = std::env::args_os().skip(1);
    while let Some(arg) = args.next() {
        match arg.to_str() {
            Some("--hello") => parsed.hello = true,
            Some("--version") => parsed.version = true,
            Some(GUARD_FLAG) => parsed.locked_use_guard = true,
            Some(GUARD_TITLE_FLAG) => {
                parsed.overlay_title = Some(string_value(&mut args, GUARD_TITLE_FLAG)?);
            }
            Some(GUARD_SUBTITLE_FLAG) => {
                parsed.overlay_subtitle = Some(string_value(&mut args, GUARD_SUBTITLE_FLAG)?);
            }
            Some(GUARD_BRIGHTNESS_FLAG) => {
                parsed.brightness = Some(string_value(&mut args, GUARD_BRIGHTNESS_FLAG)?);
            }
            Some("--state-dir") => {
                let value = args
                    .next()
                    .ok_or_else(|| "--state-dir requires a path".to_string())?;
                parsed.state_dir = Some(PathBuf::from(value));
            }
            _ => return Err(format!("unknown argument: {}", arg.to_string_lossy())),
        }
    }
    Ok(parsed)
}

#[cfg(target_os = "macos")]
fn run_locked_use_guard(title: &str, subtitle: &str, brightness: Option<&str>) -> i32 {
    backend::macos::run_locked_use_guard(title, subtitle, brightness)
}

#[cfg(not(target_os = "macos"))]
fn run_locked_use_guard(_title: &str, _subtitle: &str, _brightness: Option<&str>) -> i32 {
    eprintln!("{GUARD_FLAG} is only available on macOS");
    2
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default())
        .target(env_logger::Target::Stderr)
        .init();

    let arguments = match parse_arguments() {
        Ok(arguments) => arguments,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    };
    if arguments.version {
        println!(
            "{}",
            poracode_computer_use::protocol::version::HELPER_VERSION
        );
        return;
    }
    if arguments.locked_use_guard {
        let title = arguments
            .overlay_title
            .as_deref()
            .unwrap_or(DEFAULT_OVERLAY_TITLE);
        let subtitle = arguments
            .overlay_subtitle
            .as_deref()
            .unwrap_or(DEFAULT_OVERLAY_SUBTITLE);
        std::process::exit(run_locked_use_guard(
            title,
            subtitle,
            arguments.brightness.as_deref(),
        ));
    }

    let backend = backend::current(&BackendOptions {
        state_dir: arguments.state_dir,
    });
    if arguments.hello {
        let hello = backend::build_hello(backend.as_ref());
        let mut stdout = std::io::stdout().lock();
        if serde_json::to_writer(&mut stdout, &hello).is_err() || stdout.write_all(b"\n").is_err() {
            std::process::exit(1);
        }
        return;
    }

    if let Err(error) = run(std::io::stdin().lock(), std::io::stdout(), backend) {
        eprintln!("computer-use host failed: {error}");
        std::process::exit(1);
    }
}
