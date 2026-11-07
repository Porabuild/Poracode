//! Locked Computer Use wire shapes: the `hello.lockedUse` flags and the
//! `locked_use_begin` / `locked_use_end` / `locked_use_status` actions.
//!
//! Field names are the contract with the TypeScript host
//! (`src/shared/contracts/computerUse.ts`).
//! Every platform answers these actions; only macOS can ever say `unlocked`.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::actions::deserialize_opt_number;
use super::{HelperError, Result};

pub const DEFAULT_OVERLAY_TITLE: &str = "Poracode is using this Mac";
pub const DEFAULT_OVERLAY_SUBTITLE: &str = "Press any key to take over";
/// Longest overlay line the guard draws; longer text is truncated, not refused.
pub const MAX_OVERLAY_CHARS: usize = 200;
pub const DEFAULT_MAX_SESSION: Duration = Duration::from_secs(15 * 60);
/// `maxSessionMs` is clamped into this range: short enough that a forgotten
/// session relocks within the hour, long enough that a typo cannot make the
/// guard flash up and immediately relock.
pub const MIN_MAX_SESSION: Duration = Duration::from_secs(5);
pub const MAX_MAX_SESSION: Duration = Duration::from_secs(60 * 60);
const MAX_THREAD_ID_LEN: usize = 128;

/// Command line of the guard subprocess (macOS): the helper re-runs its own
/// binary with these flags.
pub const GUARD_FLAG: &str = "--locked-use-guard";
pub const GUARD_TITLE_FLAG: &str = "--overlay-title";
pub const GUARD_SUBTITLE_FLAG: &str = "--overlay-subtitle";
pub const GUARD_BRIGHTNESS_FLAG: &str = "--restore-brightness";

/// `threadId` travels on the plug-in socket line, so it is restricted to the
/// line protocol's `[A-Za-z0-9_.:-]{1,128}` alphabet.
pub fn is_valid_thread_id(thread_id: &str) -> bool {
    (1..=MAX_THREAD_ID_LEN).contains(&thread_id.len())
        && thread_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'-'))
}

/// Reported in `hello.lockedUse`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedUseFlags {
    /// The platform can run a locked-use session at all (macOS).
    pub supported: bool,
    /// The helper and its parent process are signed by the same Developer ID
    /// team. Unsigned and development builds report `false` and never unlock.
    pub signed: bool,
    /// Unlocks are paused until the user next unlocks the Mac by hand.
    pub paused: bool,
    /// A locked-use session currently holds the desktop.
    pub active: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedUseBeginInput {
    pub thread_id: String,
    #[serde(default)]
    pub overlay_title: Option<String>,
    #[serde(default)]
    pub overlay_subtitle: Option<String>,
    /// Additive opt-in: older hosts leave display brightness unchanged.
    #[serde(default)]
    pub dim_display: bool,
    #[serde(default, deserialize_with = "deserialize_opt_number")]
    pub max_session_ms: Option<f64>,
}

/// The text the guard overlay shows on every screen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Overlay {
    pub title: String,
    pub subtitle: String,
}

/// A validated `locked_use_begin` request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LockedUseBeginRequest {
    pub thread_id: String,
    pub overlay: Overlay,
    pub max_session: Duration,
    pub dim_display: bool,
}

fn overlay_text(value: Option<&str>, default: &str) -> String {
    let cleaned = value
        .unwrap_or_default()
        .chars()
        .filter(|character| !character.is_control())
        .take(MAX_OVERLAY_CHARS)
        .collect::<String>();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() {
        default.to_string()
    } else {
        cleaned.to_string()
    }
}

impl LockedUseBeginInput {
    pub fn validate(&self) -> Result<LockedUseBeginRequest> {
        if !is_valid_thread_id(&self.thread_id) {
            return Err(HelperError::invalid_input(
                "threadId must be 1-128 characters of [A-Za-z0-9_.:-]",
            ));
        }
        let max_session = match self.max_session_ms {
            None => DEFAULT_MAX_SESSION,
            Some(ms) if ms > 0.0 => {
                Duration::from_millis(ms as u64).clamp(MIN_MAX_SESSION, MAX_MAX_SESSION)
            }
            Some(_) => {
                return Err(HelperError::invalid_input(
                    "maxSessionMs must be a positive number",
                ));
            }
        };
        Ok(LockedUseBeginRequest {
            thread_id: self.thread_id.clone(),
            overlay: Overlay {
                title: overlay_text(self.overlay_title.as_deref(), DEFAULT_OVERLAY_TITLE),
                subtitle: overlay_text(self.overlay_subtitle.as_deref(), DEFAULT_OVERLAY_SUBTITLE),
            },
            max_session,
            dim_display: self.dim_display,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LockedUseOutcome {
    Unlocked,
    NotLocked,
    AlreadyActive,
    Paused,
    Unavailable,
    Failed,
}

/// Why a begin was `unavailable` or `failed`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LockedUseStage {
    // `unavailable`
    UnsupportedPlatform,
    UnsignedBuild,
    PluginNotInstalled,
    // `failed`
    GuardFailed,
    NoPasswordField,
    PasswordFieldNotEmpty,
    NotConsumed,
    StillLocked,
    BudgetExhausted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedUseBeginResult {
    pub outcome: LockedUseOutcome,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage: Option<LockedUseStage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_id: Option<String>,
}

impl LockedUseBeginResult {
    pub fn outcome(outcome: LockedUseOutcome) -> Self {
        Self {
            outcome,
            stage: None,
            approval_id: None,
        }
    }

    pub fn unavailable(stage: LockedUseStage) -> Self {
        Self {
            stage: Some(stage),
            ..Self::outcome(LockedUseOutcome::Unavailable)
        }
    }

    pub fn failed(stage: LockedUseStage) -> Self {
        Self {
            stage: Some(stage),
            ..Self::outcome(LockedUseOutcome::Failed)
        }
    }

    pub fn unlocked(approval_id: String) -> Self {
        Self {
            approval_id: Some(approval_id),
            ..Self::outcome(LockedUseOutcome::Unlocked)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LockedUseEndReason {
    TurnEnd,
    Disabled,
    Idle,
    Shutdown,
    HostRequest,
}

impl LockedUseEndReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TurnEnd => "turn_end",
            Self::Disabled => "disabled",
            Self::Idle => "idle",
            Self::Shutdown => "shutdown",
            Self::HostRequest => "host_request",
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct LockedUseEndInput {
    pub reason: LockedUseEndReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LockedUseEndOutcome {
    Relocked,
    Inactive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct LockedUseEndResult {
    pub outcome: LockedUseEndOutcome,
}

/// How the last session ended. `reason` is an end reason from
/// [`LockedUseEndReason`] or one the helper chose itself: `local_input`,
/// `guard_exited`, `max_session`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedUseLastEnd {
    pub reason: String,
    pub at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedUseStatus {
    pub supported: bool,
    pub signed: bool,
    pub paused: bool,
    pub active: bool,
    pub screen_locked: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_end: Option<LockedUseLastEnd>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn begin(input: serde_json::Value) -> Result<LockedUseBeginRequest> {
        serde_json::from_value::<LockedUseBeginInput>(input)
            .map_err(HelperError::from)?
            .validate()
    }

    #[test]
    fn begin_applies_defaults() {
        let request = begin(json!({ "threadId": "thread-1" })).unwrap();
        assert_eq!(request.thread_id, "thread-1");
        assert_eq!(request.overlay.title, DEFAULT_OVERLAY_TITLE);
        assert_eq!(request.overlay.subtitle, DEFAULT_OVERLAY_SUBTITLE);
        assert_eq!(request.max_session, DEFAULT_MAX_SESSION);
        assert!(!request.dim_display);
        assert!(
            begin(json!({ "threadId": "t", "dimDisplay": true }))
                .unwrap()
                .dim_display
        );
    }

    #[test]
    fn begin_rejects_thread_ids_outside_the_socket_alphabet() {
        for invalid in ["", "has space", "new\nline", "ünïcode", &"a".repeat(129)] {
            assert!(
                begin(json!({ "threadId": invalid })).is_err(),
                "accepted {invalid:?}"
            );
        }
        assert!(begin(json!({ "threadId": "A-z_0.9:x" })).is_ok());
        assert!(begin(json!({ "threadId": "a".repeat(128) })).is_ok());
    }

    #[test]
    fn begin_cleans_overlay_text_and_clamps_the_session() {
        let request = begin(json!({
            "threadId": "t",
            "overlayTitle": "  Line\none\u{7}  ",
            "overlaySubtitle": "x".repeat(500),
            "maxSessionMs": "1000",
        }))
        .unwrap();
        assert_eq!(request.overlay.title, "Lineone");
        assert_eq!(request.overlay.subtitle.chars().count(), MAX_OVERLAY_CHARS);
        assert_eq!(request.max_session, MIN_MAX_SESSION);

        let request = begin(json!({ "threadId": "t", "maxSessionMs": 1e12 })).unwrap();
        assert_eq!(request.max_session, MAX_MAX_SESSION);
        assert!(begin(json!({ "threadId": "t", "maxSessionMs": 0 })).is_err());
        assert!(begin(json!({ "threadId": "t", "maxSessionMs": -5 })).is_err());
    }

    #[test]
    fn begin_results_serialize_with_camel_case_and_omit_absent_fields() {
        assert_eq!(
            serde_json::to_value(LockedUseBeginResult::unlocked("ab".into())).unwrap(),
            json!({ "outcome": "unlocked", "approvalId": "ab" })
        );
        assert_eq!(
            serde_json::to_value(LockedUseBeginResult::unavailable(
                LockedUseStage::PluginNotInstalled
            ))
            .unwrap(),
            json!({ "outcome": "unavailable", "stage": "plugin_not_installed" })
        );
        assert_eq!(
            serde_json::to_value(LockedUseBeginResult::outcome(LockedUseOutcome::NotLocked))
                .unwrap(),
            json!({ "outcome": "not_locked" })
        );
    }

    #[test]
    fn end_and_status_match_the_wire_contract() {
        let input: LockedUseEndInput =
            serde_json::from_value(json!({ "reason": "host_request" })).unwrap();
        assert_eq!(input.reason, LockedUseEndReason::HostRequest);
        assert!(serde_json::from_value::<LockedUseEndInput>(json!({ "reason": "bogus" })).is_err());
        assert_eq!(
            serde_json::to_value(LockedUseEndResult {
                outcome: LockedUseEndOutcome::Relocked
            })
            .unwrap(),
            json!({ "outcome": "relocked" })
        );
        let status = LockedUseStatus {
            supported: true,
            screen_locked: true,
            last_end: Some(LockedUseLastEnd {
                reason: "turn_end".into(),
                at_ms: 7,
            }),
            ..LockedUseStatus::default()
        };
        assert_eq!(
            serde_json::to_value(status).unwrap(),
            json!({
                "supported": true,
                "signed": false,
                "paused": false,
                "active": false,
                "screenLocked": true,
                "lastEnd": { "reason": "turn_end", "atMs": 7 }
            })
        );
        assert_eq!(
            serde_json::to_value(LockedUseFlags::default()).unwrap(),
            json!({ "supported": false, "signed": false, "paused": false, "active": false })
        );
    }
}
