//! Is this a signed release build, launched by the signed Poracode app?
//!
//! Locked use is refused (`unsigned_build`) unless both the helper and its
//! parent process satisfy `anchor apple generic and certificate leaf[subject.OU]
//! = "<TEAM>"`, where TEAM is the helper's own signing team. That is the same
//! anchor-and-team shape the plug-in demands of the helper, so a build the
//! plug-in would reject never gets as far as the lock screen. There is no
//! override: unsigned and ad-hoc development builds report `signed:false`.
//!
//! This check gates the helper's own behaviour. The security boundary is the
//! plug-in, which verifies the helper by audit token.

use std::ffi::c_void;
use std::ptr::NonNull;

use objc2_core_foundation::{CFDictionary, CFNumber, CFRetained, CFString, CFType};

const ERR_SEC_SUCCESS: i32 = 0;
const SEC_CS_DEFAULT_FLAGS: u32 = 0;
/// `kSecCSSigningInformation`: include the certificate-derived fields
/// (the team identifier among them).
const SEC_CS_SIGNING_INFORMATION: u32 = 1 << 1;

#[link(name = "Security", kind = "framework")]
unsafe extern "C" {
    fn SecCodeCopySelf(flags: u32, code: *mut *mut c_void) -> i32;
    fn SecCodeCopyGuestWithAttributes(
        host: *const c_void,
        attributes: *const CFDictionary,
        flags: u32,
        guest: *mut *mut c_void,
    ) -> i32;
    fn SecCodeCheckValidity(code: *const c_void, flags: u32, requirement: *const c_void) -> i32;
    fn SecCodeCopySigningInformation(
        code: *const c_void,
        flags: u32,
        information: *mut *const CFDictionary,
    ) -> i32;
    fn SecRequirementCreateWithString(
        text: *const CFString,
        flags: u32,
        requirement: *mut *mut c_void,
    ) -> i32;
    fn SecRandomCopyBytes(generator: *const c_void, count: usize, bytes: *mut c_void) -> i32;

    static kSecCodeInfoTeamIdentifier: &'static CFString;
    static kSecGuestAttributePid: &'static CFString;
}

/// Take ownership of a Copy/Create-rule Security object.
fn owned(pointer: *mut c_void) -> Option<CFRetained<CFType>> {
    // SAFETY: Security returns these objects at +1 and they are CF types.
    NonNull::new(pointer.cast::<CFType>()).map(|pointer| unsafe { CFRetained::from_raw(pointer) })
}

fn as_ptr(value: &CFRetained<CFType>) -> *const c_void {
    CFRetained::as_ptr(value).as_ptr().cast()
}

fn self_code() -> Option<CFRetained<CFType>> {
    let mut code = std::ptr::null_mut();
    // SAFETY: `code` is a writable out-pointer.
    let status = unsafe { SecCodeCopySelf(SEC_CS_DEFAULT_FLAGS, &mut code) };
    (status == ERR_SEC_SUCCESS).then(|| owned(code)).flatten()
}

fn guest_for_pid(pid: libc::pid_t) -> Option<CFRetained<CFType>> {
    let pid = CFNumber::new_i32(pid);
    // SAFETY: Reading an immutable framework constant.
    let key = unsafe { kSecGuestAttributePid };
    let attributes = CFDictionary::<CFString, CFNumber>::from_slices(&[key], &[&*pid]);
    let mut code = std::ptr::null_mut();
    // SAFETY: A null host means "the system"; the attribute dictionary is a
    // live CFDictionary and `code` is a writable out-pointer.
    let status = unsafe {
        SecCodeCopyGuestWithAttributes(
            std::ptr::null(),
            CFRetained::as_ptr(&attributes).as_ptr().cast(),
            SEC_CS_DEFAULT_FLAGS,
            &mut code,
        )
    };
    (status == ERR_SEC_SUCCESS).then(|| owned(code)).flatten()
}

fn team_identifier(code: &CFRetained<CFType>) -> Option<String> {
    let mut information: *const CFDictionary = std::ptr::null();
    // SAFETY: `code` is a live SecCode (accepted wherever a SecStaticCode is)
    // and `information` is a writable out-pointer.
    let status = unsafe {
        SecCodeCopySigningInformation(as_ptr(code), SEC_CS_SIGNING_INFORMATION, &mut information)
    };
    if status != ERR_SEC_SUCCESS {
        return None;
    }
    // SAFETY: A successful copy returns a +1 CFDictionary whose keys are
    // CFStrings.
    let information = unsafe {
        CFRetained::<CFDictionary<CFString, CFType>>::from_raw(NonNull::new(
            information.cast_mut().cast(),
        )?)
    };
    // SAFETY: Reading an immutable framework constant.
    let key = unsafe { kSecCodeInfoTeamIdentifier };
    let team = information
        .get(key)?
        .downcast::<CFString>()
        .ok()?
        .to_string();
    is_team_identifier(&team).then_some(team)
}

/// Apple team identifiers are ten upper-case alphanumerics. Checking the shape
/// also keeps the value safe to splice into a requirement string.
fn is_team_identifier(value: &str) -> bool {
    value.len() == 10
        && value
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
}

fn team_requirement_text(team: &str) -> String {
    format!("anchor apple generic and certificate leaf[subject.OU] = \"{team}\"")
}

fn requirement(team: &str) -> Option<CFRetained<CFType>> {
    let text = CFString::from_str(&team_requirement_text(team));
    let mut requirement = std::ptr::null_mut();
    // SAFETY: `text` is a live CFString and `requirement` a writable out-pointer.
    let status = unsafe {
        SecRequirementCreateWithString(
            CFRetained::as_ptr(&text).as_ptr(),
            SEC_CS_DEFAULT_FLAGS,
            &mut requirement,
        )
    };
    (status == ERR_SEC_SUCCESS)
        .then(|| owned(requirement))
        .flatten()
}

fn satisfies(code: &CFRetained<CFType>, requirement: &CFRetained<CFType>) -> bool {
    // SAFETY: Both are live Security objects of the expected types.
    let status =
        unsafe { SecCodeCheckValidity(as_ptr(code), SEC_CS_DEFAULT_FLAGS, as_ptr(requirement)) };
    status == ERR_SEC_SUCCESS
}

/// Whether the helper and its parent are validly signed by the helper's
/// Developer ID team.
pub(super) fn signed_by_same_team_as_parent() -> bool {
    let Some(own) = self_code() else {
        return false;
    };
    let Some(team) = team_identifier(&own) else {
        log::info!("locked-use: the helper has no signing team; locked use is unavailable");
        return false;
    };
    let Some(requirement) = requirement(&team) else {
        return false;
    };
    if !satisfies(&own, &requirement) {
        log::warn!("locked-use: the helper's own signature does not validate");
        return false;
    }
    // SAFETY: getppid has no preconditions.
    let parent = unsafe { libc::getppid() };
    let parent_ok = guest_for_pid(parent).is_some_and(|code| satisfies(&code, &requirement));
    if !parent_ok {
        log::info!("locked-use: the parent process is not signed by team {team}");
    }
    parent_ok
}

/// 32 bytes from the system CSPRNG.
pub(super) fn random_bytes() -> Option<[u8; 32]> {
    let mut bytes = [0u8; 32];
    // SAFETY: A null generator selects kSecRandomDefault; the buffer is
    // writable for its full length.
    let status =
        unsafe { SecRandomCopyBytes(std::ptr::null(), bytes.len(), bytes.as_mut_ptr().cast()) };
    (status == ERR_SEC_SUCCESS).then_some(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn team_identifiers_are_strictly_shaped() {
        assert!(is_team_identifier("ABCDE12345"));
        for invalid in ["", "abcde12345", "ABCDE1234", "ABCDE123456", "ABC\"E12345"] {
            assert!(!is_team_identifier(invalid), "accepted {invalid:?}");
        }
        assert_eq!(
            team_requirement_text("ABCDE12345"),
            "anchor apple generic and certificate leaf[subject.OU] = \"ABCDE12345\""
        );
    }

    #[test]
    fn the_requirement_compiles() {
        assert!(requirement("ABCDE12345").is_some());
    }

    /// `cargo test` binaries are ad-hoc signed at most, so they must never
    /// report signed — the property that keeps development builds away from
    /// the lock screen.
    #[test]
    fn an_unsigned_test_binary_is_not_signed() {
        assert!(!signed_by_same_team_as_parent());
    }

    #[test]
    fn random_bytes_are_produced_and_differ() {
        let first = random_bytes().unwrap();
        let second = random_bytes().unwrap();
        assert_ne!(first, second);
    }
}
