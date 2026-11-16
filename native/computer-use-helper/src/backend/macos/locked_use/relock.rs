//! Lock the screen now.
//!
//! `SACLockScreenImmediate` in the private `login.framework` is what the
//! menu-bar "Lock Screen" item uses: it locks at once, independent of the
//! screen-saver password delay. It is private, so it is resolved at run time;
//! when it is missing the caller gets an error to surface rather than a
//! session that silently stays unlocked.

use std::sync::OnceLock;

const LOGIN_FRAMEWORK: &std::ffi::CStr = c"/System/Library/PrivateFrameworks/login.framework/login";

type LockScreenImmediate = unsafe extern "C" fn() -> i32;

fn lock_function() -> Option<LockScreenImmediate> {
    static FUNCTION: OnceLock<Option<LockScreenImmediate>> = OnceLock::new();
    *FUNCTION.get_or_init(|| {
        // SAFETY: dlopen with a constant system path; the handle is kept for the
        // life of the process (never dlclosed), so the symbol stays valid.
        let handle = unsafe { libc::dlopen(LOGIN_FRAMEWORK.as_ptr(), libc::RTLD_LAZY) };
        if handle.is_null() {
            return None;
        }
        // SAFETY: `handle` is a live dlopen handle; the name is a C string.
        let symbol = unsafe { libc::dlsym(handle, c"SACLockScreenImmediate".as_ptr()) };
        (!symbol.is_null()).then(|| {
            // SAFETY: SACLockScreenImmediate takes no arguments and returns an
            // int status; this is its long-standing ABI.
            unsafe { std::mem::transmute::<*mut libc::c_void, LockScreenImmediate>(symbol) }
        })
    })
}

/// Lock the console session immediately.
pub(crate) fn relock() -> Result<(), String> {
    let Some(lock) = lock_function() else {
        return Err("SACLockScreenImmediate is unavailable on this macOS version".into());
    };
    // SAFETY: Resolved above with the matching ABI; it has no preconditions.
    let status = unsafe { lock() };
    if status != 0 {
        // The status is undocumented; the session-state poll after the call is
        // the real check, so a non-zero value is only logged.
        log::warn!("locked-use: SACLockScreenImmediate returned {status}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Resolving the symbol is safe to test; calling it would lock the Mac.
    #[test]
    fn resolves_the_private_lock_function() {
        assert!(lock_function().is_some());
    }
}
