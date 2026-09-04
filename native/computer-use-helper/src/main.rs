use std::io::Write as _;
use std::path::PathBuf;

use poracode_computer_use::backend::{self, BackendOptions};
use poracode_computer_use::host::run;

#[derive(Default)]
struct Arguments {
    hello: bool,
    state_dir: Option<PathBuf>,
    version: bool,
}

fn parse_arguments() -> Result<Arguments, String> {
    let mut parsed = Arguments::default();
    let mut args = std::env::args_os().skip(1);
    while let Some(arg) = args.next() {
        match arg.to_str() {
            Some("--hello") => parsed.hello = true,
            Some("--version") => parsed.version = true,
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

    let backend = backend::current(&BackendOptions {
        state_dir: arguments.state_dir,
    });
    if arguments.hello {
        let hello = backend::build_hello(backend.hello());
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
