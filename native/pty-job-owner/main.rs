#![windows_subsystem = "windows"]

use std::ffi::c_void;
use std::io::{self, BufRead, Write};
use std::mem::{size_of, zeroed};
use std::ptr::null;

const HELPER_VERSION: &str = "1.0.0";

type RawHandle = *mut c_void;
#[repr(C)]
struct BasicLimits {
    process_time: i64,
    job_time: i64,
    flags: u32,
    minimum_working_set: usize,
    maximum_working_set: usize,
    active_process_limit: u32,
    affinity: usize,
    priority: u32,
    scheduling: u32,
}
#[repr(C)]
struct IoCounters {
    read: u64,
    write: u64,
    other: u64,
    read_bytes: u64,
    write_bytes: u64,
    other_bytes: u64,
}
#[repr(C)]
struct ExtendedLimits {
    basic: BasicLimits,
    io: IoCounters,
    process_memory: usize,
    job_memory: usize,
    peak_process_memory: usize,
    peak_job_memory: usize,
}
#[repr(C)]
struct Accounting {
    user: i64,
    kernel: i64,
    period_user: i64,
    period_kernel: i64,
    faults: u32,
    total: u32,
    active: u32,
    terminated: u32,
}
#[repr(C)]
struct FileTime {
    low: u32,
    high: u32,
}

#[link(name = "kernel32")]
unsafe extern "system" {
    #[link_name = "CreateJobObjectW"]
    fn create_job_object(attributes: *const c_void, name: *const u16) -> RawHandle;
    #[link_name = "SetInformationJobObject"]
    fn set_job_information(job: RawHandle, kind: u32, data: *const c_void, size: u32) -> i32;
    #[link_name = "QueryInformationJobObject"]
    fn query_job_information(
        job: RawHandle,
        kind: u32,
        data: *mut c_void,
        size: u32,
        length: *mut u32,
    ) -> i32;
    #[link_name = "TerminateJobObject"]
    fn terminate_job(job: RawHandle, code: u32) -> i32;
    #[link_name = "OpenProcess"]
    fn open_process(access: u32, inherit: i32, pid: u32) -> RawHandle;
    #[link_name = "AssignProcessToJobObject"]
    fn assign_process(job: RawHandle, process: RawHandle) -> i32;
    #[link_name = "WaitForSingleObject"]
    fn wait_one(handle: RawHandle, milliseconds: u32) -> u32;
    #[link_name = "CloseHandle"]
    fn close_handle(handle: RawHandle) -> i32;
    #[link_name = "GetProcessTimes"]
    fn get_process_times(
        process: RawHandle,
        creation: *mut FileTime,
        exit: *mut FileTime,
        kernel: *mut FileTime,
        user: *mut FileTime,
    ) -> i32;
    #[link_name = "Sleep"]
    fn sleep(milliseconds: u32);
}

struct Handle(RawHandle);
// Windows kernel handles may be waited on and closed from another thread.
unsafe impl Send for Handle {}
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            close_handle(self.0);
        }
    }
}
impl Handle {
    fn new(raw: RawHandle) -> io::Result<Self> {
        if raw.is_null() {
            Err(io::Error::last_os_error())
        } else {
            Ok(Self(raw))
        }
    }
    fn wait(&self, milliseconds: u32) -> u32 {
        unsafe { wait_one(self.0, milliseconds) }
    }
}
fn checked(result: i32) -> io::Result<()> {
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}
fn invalid() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        "Unsupported PTY job owner selection or protocol",
    )
}
fn emit(nonce: &str, kind: &str, suffix: &str) -> io::Result<()> {
    writeln!(io::stdout(), "{kind}-v1 {nonce}{suffix}")?;
    io::stdout().flush()
}
fn line(reader: &mut impl BufRead) -> io::Result<Option<String>> {
    let mut bytes = Vec::new();
    let count = std::io::Read::take(&mut *reader, 257).read_until(b'\n', &mut bytes)?;
    if count == 0 {
        return Ok(None);
    }
    if bytes.len() > 256 || bytes.last() != Some(&b'\n') || !bytes.is_ascii() {
        return Err(invalid());
    }
    bytes.pop();
    Ok(Some(String::from_utf8(bytes).map_err(|_| invalid())?))
}
fn positive(raw: &str) -> io::Result<u32> {
    if raw.is_empty() || !raw.bytes().all(|b| b.is_ascii_digit()) {
        return Err(invalid());
    }
    let value = raw.parse::<u32>().map_err(|_| invalid())?;
    if value == 0 {
        return Err(invalid());
    }
    Ok(value)
}
fn birth(handle: &Handle) -> io::Result<u64> {
    let (mut creation, mut exit, mut kernel, mut user): (FileTime, FileTime, FileTime, FileTime) =
        unsafe { (zeroed(), zeroed(), zeroed(), zeroed()) };
    checked(unsafe {
        get_process_times(handle.0, &mut creation, &mut exit, &mut kernel, &mut user)
    })?;
    Ok((u64::from(creation.high) << 32) | u64::from(creation.low))
}
fn retire(job: &Handle) -> io::Result<()> {
    checked(unsafe { terminate_job(job.0, 1223) })?;
    loop {
        let mut accounting: Accounting = unsafe { zeroed() };
        checked(unsafe {
            query_job_information(
                job.0,
                1,
                (&mut accounting as *mut Accounting).cast(),
                size_of::<Accounting>() as u32,
                std::ptr::null_mut(),
            )
        })?;
        if accounting.active == 0 {
            return Ok(());
        }
        unsafe {
            sleep(5);
        }
    }
}
struct Prepared {
    id: u32,
    pid: u32,
    handle: Handle,
    assigned: bool,
}
fn run() -> io::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--version"] {
        writeln!(io::stdout(), "poracode-pty-job-owner {HELPER_VERSION}")?;
        return io::stdout().flush();
    }
    if args.len() != 3
        || args[0] != "--pty-job-v1"
        || args[1].len() != 48
        || !args[1]
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(invalid());
    }
    let nonce = &args[1];
    let parent_pid = positive(&args[2])?;
    let parent = Handle::new(unsafe { open_process(0x0010_0000, 0, parent_pid) })?;
    let job = Handle::new(unsafe { create_job_object(null(), null()) })?;
    let mut limits: ExtendedLimits = unsafe { zeroed() };
    limits.basic.flags = 0x2000;
    checked(unsafe {
        set_job_information(
            job.0,
            9,
            (&limits as *const ExtendedLimits).cast(),
            size_of::<ExtendedLimits>() as u32,
        )
    })?;
    emit(nonce, "ready", "")?;
    let mut reader = io::BufReader::new(io::stdin());
    if line(&mut reader)?.as_deref() != Some(format!("bind-v1 {nonce}").as_str())
        || parent.wait(0) != 258
    {
        return Err(invalid());
    }
    // The private bind reply proves the spawning parent is still alive after
    // its kernel handle was captured. No numeric PID is reopened afterward.
    let watcher = std::thread::spawn(move || {
        let _parent = parent;
        _parent.wait(u32::MAX);
        std::process::exit(1);
    });
    drop(watcher);
    emit(nonce, "bound", "")?;
    let mut prepared: Option<Prepared> = None;
    let mut cancelled = false;
    let control_result = (|| -> io::Result<()> {
        while let Some(request) = line(&mut reader)? {
            let parts: Vec<&str> = request.split(' ').collect();
            if parts.len() < 2 || parts[1] != nonce {
                emit(nonce, "error", " protocol")?;
                continue;
            }
            match (parts[0], parts.len()) {
                ("prepare-v1", 4) if prepared.is_none() && !cancelled => {
                    let id = positive(parts[2])?;
                    let pid = positive(parts[3])?;
                    match Handle::new(unsafe { open_process(0x0010_1101, 0, pid) }) {
                        Ok(handle) => {
                            let created = birth(&handle)?;
                            prepared = Some(Prepared {
                                id,
                                pid,
                                handle,
                                assigned: false,
                            });
                            emit(nonce, "prepared", &format!(" {id} {pid} {created}"))?;
                        }
                        Err(_) => emit(nonce, "error", " unavailable")?,
                    }
                }
                ("assign-v1", 3) if !cancelled => {
                    let id = positive(parts[2])?;
                    let Some(current) = prepared.as_mut().filter(|p| p.id == id) else {
                        emit(nonce, "error", " unknown")?;
                        continue;
                    };
                    if current.assigned {
                        emit(
                            nonce,
                            "assigned",
                            &format!(" {} {}", current.id, current.pid),
                        )?;
                        continue;
                    }
                    if current.handle.wait(0) != 258 {
                        emit(nonce, "error", " exited")?;
                        continue;
                    }
                    checked(unsafe { assign_process(job.0, current.handle.0) })?;
                    current.assigned = true;
                    emit(
                        nonce,
                        "assigned",
                        &format!(" {} {}", current.id, current.pid),
                    )?;
                }
                ("cancel-prepared-v1", 3)
                    if prepared
                        .as_ref()
                        .is_some_and(|p| p.id.to_string() == parts[2] && !p.assigned) =>
                {
                    prepared = None;
                    cancelled = true;
                    emit(nonce, "cancelled", "")?;
                }
                ("close-v1", 2) => return Ok(()),
                _ => emit(nonce, "error", " protocol")?,
            }
        }
        Ok(())
    })();
    // The success acknowledgment follows confirmed kernel job emptiness,
    // never just a signal, missing root PID, or released JavaScript handle.
    retire(&job)?;
    control_result?;
    emit(nonce, "retired", " 0")
}
fn main() {
    if let Err(error) = run() {
        let _ = writeln!(io::stderr(), "PTY job owner refused: {error}");
        std::process::exit(1);
    }
}
