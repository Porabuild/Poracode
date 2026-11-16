//! The persisted "unlocks paused" flag, `<state dir>/locked-use.json`.
//!
//! A pause outlives the helper process on purpose: the host recycles helpers,
//! and a pause set because the user touched the keyboard, or because a thread
//! spent its failure budget, must still hold in the next one. It ends only
//! when the helper sees the user unlock the Mac by hand.
//!
//! Compatibility: the file carries `schemaVersion`. A file this helper cannot
//! read — corrupt, unreadable, or written by a newer schema — loads as paused,
//! which fails safe. Unsupported or unreadable files are preserved and cannot
//! be resumed or rewritten by this version.

use std::fs;
use std::io::{self, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub(super) const FILE_NAME: &str = "locked-use.json";
pub(super) const SCHEMA_VERSION: u32 = 1;
/// After pausing, ignore "unlocked" observations for this long: the relock that
/// accompanies a pause is asynchronous, and the poll must not mistake the
/// moment before it lands for a manual unlock.
pub(super) const CLEAR_GRACE_MS: u64 = 5_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum PauseReason {
    LocalInput,
    BudgetExhausted,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PauseFile {
    schema_version: u32,
    paused: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reason: Option<PauseReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    paused_at_ms: Option<u64>,
}

/// Interpret the file's bytes. `None` (no file) is not paused; anything that
/// does not parse as a schema this helper knows is paused.
fn parse(contents: Option<&[u8]>) -> bool {
    let Some(contents) = contents else {
        return false;
    };
    match serde_json::from_slice::<PauseFile>(contents) {
        Ok(file) if file.schema_version == SCHEMA_VERSION => file.paused,
        Ok(file) => {
            log::warn!(
                "locked-use pause file has schema {}; treating unlocks as paused",
                file.schema_version
            );
            true
        }
        Err(error) => {
            log::warn!("locked-use pause file is unreadable ({error}); treating unlocks as paused");
            true
        }
    }
}

/// Where the pause lives. Without a state directory it is kept in memory only.
#[derive(Debug, Clone)]
pub(super) struct PauseStore {
    path: Option<PathBuf>,
}

impl PauseStore {
    pub(super) fn new(state_dir: Option<&Path>) -> Self {
        Self {
            path: state_dir.map(|dir| dir.join(FILE_NAME)),
        }
    }

    pub(super) fn load(&self) -> bool {
        let Some(path) = &self.path else {
            return false;
        };
        match fs::read(path) {
            Ok(contents) => parse(Some(&contents)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => parse(None),
            Err(error) => {
                log::warn!(
                    "cannot read {}: {error}; treating unlocks as paused",
                    path.display()
                );
                true
            }
        }
    }

    /// Unknown schemas belong to another version, including after a downgrade.
    pub(super) fn can_modify(&self) -> bool {
        let Some(path) = &self.path else {
            return true;
        };
        match fs::read(path) {
            Ok(bytes) => serde_json::from_slice::<PauseFile>(&bytes)
                .is_ok_and(|file| file.schema_version == SCHEMA_VERSION),
            Err(error) => error.kind() == io::ErrorKind::NotFound,
        }
    }

    fn require_compatible(&self) -> io::Result<()> {
        if self.can_modify() {
            Ok(())
        } else {
            Err(io::Error::other(
                "unsupported locked-use pause file; preserving it",
            ))
        }
    }

    pub(super) fn save_paused(&self, reason: PauseReason, at_ms: u64) -> io::Result<()> {
        let Some(path) = &self.path else {
            return Ok(());
        };
        self.require_compatible()?;
        let file = PauseFile {
            schema_version: SCHEMA_VERSION,
            paused: true,
            reason: Some(reason),
            paused_at_ms: Some(at_ms),
        };
        let bytes = serde_json::to_vec(&file).map_err(io::Error::other)?;
        // Write-then-rename so a crash never leaves a torn file (which would
        // load as paused anyway, but should not have to).
        let temporary = path.with_extension("json.tmp");
        let mut handle = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&temporary)?;
        handle.write_all(&bytes)?;
        handle.sync_all()?;
        drop(handle);
        fs::rename(&temporary, path)
    }

    pub(super) fn clear(&self) -> io::Result<()> {
        let Some(path) = &self.path else {
            return Ok(());
        };
        self.require_compatible()?;
        match fs::remove_file(path) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
            _ => Ok(()),
        }
    }
}

/// Whether the 2 s poll should lift a pause: the screen is unlocked, no
/// locked-use session holds it (so the user unlocked it), and the grace period
/// after an in-process pause has passed. A pause loaded from disk has no start
/// time in this process and needs no grace.
pub(super) fn should_clear(
    paused: bool,
    paused_since_ms: Option<u64>,
    now_ms: u64,
    session_active: bool,
    screen_locked: bool,
) -> bool {
    paused
        && !session_active
        && !screen_locked
        && paused_since_ms.is_none_or(|since| now_ms.saturating_sub(since) >= CLEAR_GRACE_MS)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_is_not_paused_and_a_saved_pause_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let store = PauseStore::new(Some(dir.path()));
        assert!(!store.load());
        store.save_paused(PauseReason::LocalInput, 42).unwrap();
        assert!(store.load());
        let saved: serde_json::Value =
            serde_json::from_slice(&fs::read(dir.path().join(FILE_NAME)).unwrap()).unwrap();
        assert_eq!(
            saved,
            serde_json::json!({
                "schemaVersion": 1,
                "paused": true,
                "reason": "local_input",
                "pausedAtMs": 42
            })
        );
        store.clear().unwrap();
        assert!(!store.load());
        // Clearing twice is fine.
        store.clear().unwrap();
    }

    #[test]
    fn the_file_is_private_to_the_user() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let store = PauseStore::new(Some(dir.path()));
        store.save_paused(PauseReason::BudgetExhausted, 1).unwrap();
        let mode = fs::metadata(dir.path().join(FILE_NAME))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    /// Pre-upgrade regression: a version-1 file written by this release, and a
    /// minimal one, both keep loading.
    #[test]
    fn reads_version_one_files() {
        assert!(parse(Some(
            br#"{"schemaVersion":1,"paused":true,"reason":"budget_exhausted","pausedAtMs":5}"#
        )));
        assert!(!parse(Some(br#"{"schemaVersion":1,"paused":false}"#)));
    }

    #[test]
    fn unknown_or_corrupt_files_fail_safe_to_paused() {
        assert!(parse(Some(br#"{"schemaVersion":2,"paused":false}"#)));
        assert!(parse(Some(b"{not json")));
        assert!(parse(Some(b"")));
        assert!(parse(Some(br#"{"paused":false}"#)));
    }

    #[test]
    fn future_pause_files_are_never_cleared_or_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(FILE_NAME);
        let bytes = br#"{"schemaVersion":2,"paused":false,"custody":"future"}"#;
        fs::write(&path, bytes).unwrap();
        let store = PauseStore::new(Some(dir.path()));
        assert!(store.load());
        assert!(!store.can_modify());
        assert!(store.clear().is_err());
        assert!(store.save_paused(PauseReason::LocalInput, 42).is_err());
        assert_eq!(fs::read(path).unwrap(), bytes);
    }

    #[test]
    fn without_a_state_dir_nothing_touches_disk() {
        let store = PauseStore::new(None);
        assert!(!store.load());
        store.save_paused(PauseReason::LocalInput, 1).unwrap();
        assert!(!store.load());
        store.clear().unwrap();
    }

    #[test]
    fn a_pause_clears_only_on_a_manual_unlock_after_the_grace() {
        // Unlocked with no session, but still inside the grace window.
        assert!(!should_clear(
            true,
            Some(1_000),
            1_000 + CLEAR_GRACE_MS - 1,
            false,
            false
        ));
        assert!(should_clear(
            true,
            Some(1_000),
            1_000 + CLEAR_GRACE_MS,
            false,
            false
        ));
        // A pause loaded from disk needs no grace.
        assert!(should_clear(true, None, 0, false, false));
        // Still locked, or the helper's own session holds the desktop.
        assert!(!should_clear(true, None, 0, false, true));
        assert!(!should_clear(true, None, 0, true, false));
        assert!(!should_clear(false, None, 0, false, false));
    }
}
