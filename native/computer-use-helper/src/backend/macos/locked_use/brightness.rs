//! Best-effort physical dimming, independent of the opaque security cover.
//!
//! The helper captures the original levels before spawning the guard. Both
//! processes keep that snapshot: the guard restores on helper EOF, and the
//! helper's stdout reader restores if the guard exits (including a crash).
//! Nothing is persisted and unsupported displays are left alone.

use std::sync::OnceLock;

use objc2_core_foundation::{CFRetained, CFUUID};
use objc2_core_graphics::{CGDirectDisplayID, CGDisplayIsOnline, CGGetOnlineDisplayList};
use serde::{Deserialize, Serialize};

const DIM_LEVEL: f32 = 0.05;
const FRAMEWORK: &std::ffi::CStr =
    c"/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices";
type GetBrightness = unsafe extern "C" fn(CGDirectDisplayID, *mut f32) -> i32;
type SetBrightness = unsafe extern "C" fn(CGDirectDisplayID, f32) -> i32;

#[link(name = "ColorSync", kind = "framework")]
unsafe extern "C" {
    fn CGDisplayCreateUUIDFromDisplayID(display: CGDirectDisplayID) -> Option<CFRetained<CFUUID>>;
}

fn identity(display: CGDirectDisplayID) -> Option<String> {
    if !CGDisplayIsOnline(display) {
        return None;
    }
    // SAFETY: ColorSync accepts any display id and returns an owned UUID.
    let uuid = unsafe { CGDisplayCreateUUIDFromDisplayID(display) }?;
    CFUUID::new_string(None, Some(&uuid)).map(|value| value.to_string())
}

struct Functions {
    get: GetBrightness,
    set: SetBrightness,
}

fn functions() -> Option<&'static Functions> {
    static FUNCTIONS: OnceLock<Option<Functions>> = OnceLock::new();
    FUNCTIONS
        .get_or_init(|| {
            // SAFETY: Constant system path. Never dlclose: both pointers must
            // remain valid for the life of the process.
            let handle = unsafe { libc::dlopen(FRAMEWORK.as_ptr(), libc::RTLD_LAZY) };
            if handle.is_null() {
                return None;
            }
            // SAFETY: Live handle and constant null-terminated symbol names.
            let get = unsafe { libc::dlsym(handle, c"DisplayServicesGetBrightness".as_ptr()) };
            // SAFETY: Same as above.
            let set = unsafe { libc::dlsym(handle, c"DisplayServicesSetBrightness".as_ptr()) };
            if get.is_null() || set.is_null() {
                return None;
            }
            Some(Functions {
                // SAFETY: These are DisplayServices' float brightness ABIs.
                get: unsafe { std::mem::transmute::<*mut libc::c_void, GetBrightness>(get) },
                // SAFETY: Same ABI contract as above.
                set: unsafe { std::mem::transmute::<*mut libc::c_void, SetBrightness>(set) },
            })
        })
        .as_ref()
}

fn read(display: CGDirectDisplayID) -> Option<f32> {
    let api = functions()?;
    let mut value = 0.0;
    // SAFETY: Resolved ABI; the output pointer is writable.
    let status = unsafe { (api.get)(display, &mut value) };
    (status == 0 && valid_level(value)).then_some(value)
}

fn valid_level(value: f32) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}

fn write(display: CGDirectDisplayID, value: f32) {
    if let Some(api) = functions() {
        // SAFETY: Resolved ABI, valid display id and normalized brightness.
        let status = unsafe { (api.set)(display, value) };
        if status != 0 {
            log::warn!(
                "locked-use: brightness change unavailable for display {display} ({status})"
            );
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct DisplayBrightness {
    display: CGDirectDisplayID,
    uuid: String,
    original: f32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(transparent)]
pub(super) struct Snapshot(Vec<DisplayBrightness>);

impl Snapshot {
    pub fn capture(enabled: bool) -> Self {
        if !enabled || functions().is_none() {
            return Self::default();
        }
        let mut displays = [0; 32];
        let mut count = 0;
        // SAFETY: The buffer holds 32 ids and count points to a writable u32.
        let status = unsafe {
            CGGetOnlineDisplayList(displays.len() as u32, displays.as_mut_ptr(), &mut count)
        };
        if status.0 != 0 {
            return Self::default();
        }
        Self(
            displays[..(count as usize).min(displays.len())]
                .iter()
                .filter_map(|&display| {
                    let original = read(display)?;
                    // Already dimmer displays must never be brightened.
                    (original > DIM_LEVEL).then_some(DisplayBrightness {
                        display,
                        uuid: identity(display)?,
                        original,
                    })
                })
                .collect(),
        )
    }

    pub fn encode(&self) -> String {
        serde_json::to_string(self).expect("finite brightness snapshot")
    }

    pub fn decode(value: Option<&str>) -> Option<Self> {
        let Some(value) = value else {
            return Some(Self::default());
        };
        let snapshot: Self = serde_json::from_str(value).ok()?;
        (snapshot.0.len() <= 32
            && snapshot.0.iter().all(|entry| {
                valid_level(entry.original) && !entry.uuid.is_empty() && entry.uuid.len() <= 64
            }))
        .then_some(snapshot)
    }

    pub fn dim(&self) {
        for entry in &self.0 {
            if identity(entry.display).as_deref() == Some(&entry.uuid)
                && let Some(current) = read(entry.display)
            {
                write(entry.display, current.min(DIM_LEVEL));
            }
        }
    }

    pub fn restore(&self) {
        for entry in &self.0 {
            // A display id may be recycled after unplugging: do not apply an
            // old level to a different physical display.
            if identity(entry.display).as_deref() == Some(&entry.uuid) {
                write(entry.display, entry.original);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_dimming_captures_nothing() {
        assert_eq!(Snapshot::capture(false).encode(), "[]");
        assert_eq!(Snapshot::decode(None).unwrap().encode(), "[]");
    }

    #[test]
    fn snapshot_roundtrips_without_losing_the_original_level() {
        let old = r#"[{"display":1,"uuid":"display-uuid","original":0.8125}]"#;
        assert_eq!(Snapshot::decode(Some(old)).unwrap().encode(), old);
        for invalid in [
            r#"[{"display":1,"uuid":"id","original":-1}]"#,
            r#"[{"display":1,"uuid":"id","original":2}]"#,
            r#"[{"display":1,"uuid":"","original":0.5}]"#,
            "null",
        ] {
            assert!(Snapshot::decode(Some(invalid)).is_none());
        }
    }

    #[test]
    fn ignores_invalid_driver_values() {
        for invalid in [f32::NAN, f32::INFINITY, -0.1, 1.1] {
            assert!(!valid_level(invalid));
        }
        assert!(valid_level(0.0));
        assert!(valid_level(1.0));
    }
}
