//! `poracode-mcp-relay` — standalone stdio entry point. Mirrors
//! `mcpHttpRelayWorker.ts`: configuration comes from
//! `PORACODE_MCP_HTTP_RELAY_CONFIG`, stdin is newline-delimited JSON-RPC,
//! stdout carries replies, and SIGINT/SIGTERM close like stdin EOF.

use poracode_mcp_relay::config::{
    ConfigError, read_filter_config, read_relay_config, read_stdio_config,
};
use poracode_mcp_relay::filter_proxy::run_filter_proxy;
use poracode_mcp_relay::relay::{MAX_LINE_UNITS, Relay};
use poracode_mcp_relay::schema_proxy::run_schema_proxy;
use poracode_mcp_relay::stdio_launcher::run_stdio_launcher;
use std::io::{self, Read};
use std::process::ExitCode;
#[cfg(unix)]
use std::sync::Arc;

const HELLO_HELPER: &str = "poracode-mcp-relay";
/// Must match `MCP_HTTP_RELAY_CONFIG_VERSION` in
/// `src/supervisor/mcp/mcpToolFilterConfig.ts`; staging verifies it.
const RELAY_CONFIG_VERSION: u64 = 1;

fn platform_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
}

fn arch_name() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    }
}

fn hello_line() -> String {
    serde_json::json!({
        "helper": HELLO_HELPER,
        "helperVersion": env!("CARGO_PKG_VERSION"),
        "relayConfigVersion": RELAY_CONFIG_VERSION,
        "platform": platform_name(),
        "arch": arch_name(),
    })
    .to_string()
}

/// Incremental UTF-16-unit counter equivalent to Node's `StringDecoder`:
/// state carries across chunks so a sequence split between reads counts
/// once. A completed scalar costs 1 unit (BMP) or 2 (astral — emitted only
/// when the sequence completes); each U+FFFD for an invalid byte or an
/// interrupted sequence costs 1; continuation bytes inside a valid
/// sequence cost 0.
#[derive(Default)]
struct Utf16Units {
    /// Continuation bytes still expected; 0 means not mid-sequence.
    needed: u8,
    /// Bounds for the next byte. The WHATWG lead-byte rules restrict only
    /// the first continuation (overlongs, surrogates, >U+10FFFF); bytes
    /// after it always take 0x80..=0xBF.
    lower: u8,
    upper: u8,
    /// The in-flight sequence is 4 bytes, so its scalar is astral.
    astral: bool,
}

impl Utf16Units {
    /// UTF-16 units `byte` emits, matching WHATWG UTF-8 decode.
    fn feed(&mut self, byte: u8) -> usize {
        if self.needed > 0 {
            if (self.lower..=self.upper).contains(&byte) {
                self.needed -= 1;
                if self.needed == 0 {
                    let units = if self.astral { 2 } else { 1 };
                    self.astral = false;
                    return units;
                }
                self.lower = 0x80;
                self.upper = 0xBF;
                return 0;
            }
            // Interrupted sequence: StringDecoder emits one U+FFFD for the
            // bytes consumed so far, then reprocesses this byte.
            self.needed = 0;
            self.astral = false;
            return 1 + self.feed(byte);
        }
        match byte {
            0x00..=0x7F => 1,
            0xC2..=0xDF => {
                self.needed = 1;
                self.lower = 0x80;
                self.upper = 0xBF;
                0
            }
            0xE0..=0xEF => {
                self.needed = 2;
                (self.lower, self.upper) = match byte {
                    0xE0 => (0xA0, 0xBF),
                    0xED => (0x80, 0x9F),
                    _ => (0x80, 0xBF),
                };
                0
            }
            0xF0..=0xF4 => {
                self.needed = 3;
                (self.lower, self.upper) = match byte {
                    0xF0 => (0x90, 0xBF),
                    0xF4 => (0x80, 0x8F),
                    _ => (0x80, 0xBF),
                };
                self.astral = true;
                0
            }
            // Lone continuation, overlong lead (0xC0/0xC1) or out-of-range
            // lead (0xF5..=0xFF): one U+FFFD each.
            _ => 1,
        }
    }
}

/// UTF-16 units `bytes` contribute from a clean decoder state — used for
/// appended chunks through the persistent counter in `run_stdin_loop`, and
/// to subtract consumed lines, which always begin right after a newline
/// where the decoder state is clean.
fn utf16_units(bytes: &[u8]) -> usize {
    let mut counter = Utf16Units::default();
    bytes.iter().map(|byte| counter.feed(*byte)).sum()
}

/// Reads stdin until EOF/error, an oversized unterminated line, or the relay
/// closing underneath us; every outcome leads to the same graceful close +
/// exit 0, like the JS worker.
fn run_stdin_loop(relay: &Relay) {
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let mut pending: Vec<u8> = Vec::new();
    // `pending[line_start..scan_pos]` is already known to hold no newline,
    // so each read scans only the bytes it appended — a long line arriving
    // in many chunks stays linear instead of quadratic. `pending_units`
    // tracks the UTF-16 length of the unterminated buffer the same way.
    let mut line_start = 0usize;
    let mut scan_pos = 0usize;
    let mut pending_units = 0usize;
    // Carries decoder state across reads so sequences split between chunks
    // count once; a newline always leaves it clean, matching the per-line
    // subtraction below.
    let mut decoder = Utf16Units::default();
    let mut chunk = [0u8; 64 * 1024];
    loop {
        if relay.is_closed() {
            return;
        }
        match input.read(&mut chunk) {
            Ok(0) => return,
            Ok(count) => {
                pending.extend_from_slice(&chunk[..count]);
                pending_units += chunk[..count]
                    .iter()
                    .map(|byte| decoder.feed(*byte))
                    .sum::<usize>();
                while scan_pos < pending.len() {
                    if pending[scan_pos] == b'\n' {
                        let raw = &pending[line_start..scan_pos];
                        let raw = if raw.last() == Some(&b'\r') {
                            &raw[..raw.len() - 1]
                        } else {
                            raw
                        };
                        let line = String::from_utf8_lossy(raw);
                        if !line.trim().is_empty() {
                            relay.receive(line.into_owned());
                        }
                        line_start = scan_pos + 1;
                    }
                    scan_pos += 1;
                }
                if line_start > 0 {
                    pending_units -= utf16_units(&pending[..line_start]);
                    pending.drain(..line_start);
                    scan_pos -= line_start;
                    line_start = 0;
                }
                if pending_units > MAX_LINE_UNITS {
                    return;
                }
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(_) => return,
        }
    }
}

#[cfg(unix)]
mod signals {
    use super::*;
    use std::ffi::c_int;
    use std::thread;

    /// Blocks SIGINT/SIGTERM for this thread before worker threads spawn so
    /// they inherit the mask; `sigwait` then consumes them deterministically
    /// instead of relying on delivery to an arbitrary thread.
    fn blocked_signal_set() -> libc::sigset_t {
        // SAFETY: sigset_t is a plain bitmask struct; zeroed is a valid value
        // that sigemptyset then fully initializes before any use.
        let mut set: libc::sigset_t = unsafe { std::mem::zeroed() };
        unsafe {
            libc::sigemptyset(&mut set);
            libc::sigaddset(&mut set, libc::SIGINT);
            libc::sigaddset(&mut set, libc::SIGTERM);
        }
        set
    }

    /// Must run before `Relay::start` spawns threads.
    pub fn block() -> libc::sigset_t {
        let set = blocked_signal_set();
        unsafe {
            libc::pthread_sigmask(libc::SIG_BLOCK, &set, std::ptr::null_mut());
        }
        set
    }

    pub fn watch(relay: Arc<Relay>, set: libc::sigset_t) {
        thread::spawn(move || {
            let mut signal: c_int = 0;
            let result = unsafe { libc::sigwait(&set, &mut signal) };
            if result != 0 {
                // sigwait failed: restore default dispositions so the process
                // stays killable instead of trapping signals forever.
                unsafe {
                    libc::signal(libc::SIGINT, libc::SIG_DFL);
                    libc::signal(libc::SIGTERM, libc::SIG_DFL);
                    libc::pthread_sigmask(libc::SIG_UNBLOCK, &set, std::ptr::null_mut());
                }
                return;
            }
            relay.close();
            std::process::exit(0);
        });
    }
}

fn has_non_empty_env(name: &str) -> bool {
    std::env::var(name).ok().is_some_and(|v| !v.is_empty())
}

fn main() -> ExitCode {
    if std::env::args().skip(1).any(|arg| arg == "--hello") {
        println!("{}", hello_line());
        return ExitCode::SUCCESS;
    }

    #[cfg(unix)]
    let signal_set = signals::block();

    // Filter/schema envelopes take precedence over inner stdio/relay envelopes
    // so a schema-only wrapper around a nested helper runs the outer wrapper
    // first and passes the inner envelope through to the child process.
    if has_non_empty_env("PORACODE_MCP_FILTER_CONFIG_V2")
        || has_non_empty_env("PORACODE_MCP_FILTER_CONFIG_V1")
        || has_non_empty_env("PORACODE_MCP_FILTER_CONFIG")
    {
        let config = match read_filter_config() {
            Ok(config) => config,
            Err(error) => {
                eprintln!("{}", error.message());
                return ExitCode::from(1);
            }
        };
        return if config.schema_only {
            run_schema_proxy(
                config,
                #[cfg(unix)]
                signal_set,
            )
        } else {
            run_filter_proxy(
                config,
                #[cfg(unix)]
                signal_set,
            )
        };
    }

    if has_non_empty_env("PORACODE_MCP_HTTP_RELAY_CONFIG") {
        let config = match read_relay_config() {
            Ok(config) => config,
            Err(error) => {
                eprintln!("{}", error.message());
                return ExitCode::from(1);
            }
        };
        let relay = Relay::start(config);

        #[cfg(unix)]
        signals::watch(Arc::clone(&relay), signal_set);

        run_stdin_loop(&relay);
        relay.close();
        // The JS worker exits 0 once `closed` settles plus a 1s grace; close()
        // already bounds the session DELETE at 1s.
        std::process::exit(0);
    }

    if has_non_empty_env("PORACODE_MCP_STDIO_CONFIG") {
        let config = match read_stdio_config() {
            Ok(config) => config,
            Err(error) => {
                eprintln!("{}", error.message());
                return ExitCode::from(1);
            }
        };
        return run_stdio_launcher(
            config,
            #[cfg(unix)]
            signal_set,
        );
    }

    eprintln!("{}", ConfigError::Missing.message());
    ExitCode::from(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lone_continuation_bytes_each_cost_one_unit() {
        // Invalid UTF-8: StringDecoder emits U+FFFD per byte, so a garbage
        // line of 0x80 must count toward the cap instead of slipping past.
        assert_eq!(utf16_units(&[0x80; 1_000]), 1_000);
        assert_eq!(utf16_units(&[0xC0, 0x80]), 2);
    }

    #[test]
    fn sequences_split_across_chunks_count_once() {
        // '€' = E2 82 AC: three bytes, one UTF-16 unit, wherever the chunk
        // boundary falls.
        assert_eq!(utf16_units(&[0xE2, 0x82, 0xAC]), 1);
        let mut counter = Utf16Units::default();
        assert_eq!(counter.feed(0xE2), 0);
        assert_eq!(counter.feed(0x82), 0);
        assert_eq!(counter.feed(0xAC), 1);
        assert_eq!(counter.feed(b'a'), 1);
    }

    #[test]
    fn truncated_sequence_interrupted_counts_replacement_chars() {
        // F0 9F 92 is three bytes of a four-byte emoji; 'A' interrupts it.
        // StringDecoder emits U+FFFD for the partial sequence, then 'A'.
        assert_eq!(utf16_units(&[0xF0, 0x9F, 0x92, b'A']), 2);
        // ED A0 80 would encode a surrogate: rejected at the second byte,
        // so all three bytes become replacement chars like Node emits.
        assert_eq!(utf16_units(&[0xED, 0xA0, 0x80]), 3);
    }

    #[test]
    fn astral_sequence_split_mid_sequence_costs_two_units() {
        // U+1F4A6 = F0 9F 92 A6; the second UTF-16 unit appears only when
        // the sequence completes.
        let mut counter = Utf16Units::default();
        assert_eq!(counter.feed(0xF0) + counter.feed(0x9F), 0);
        assert_eq!(counter.feed(0x92) + counter.feed(0xA6), 2);
    }
}
