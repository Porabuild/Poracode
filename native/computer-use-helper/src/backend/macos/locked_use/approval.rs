//! The single-use unlock approval the authorization plug-in asks for.
//!
//! At most one approval exists at a time, in memory only. It is minted right
//! before the helper submits the fixed lock-screen placeholder and lives
//! for [`APPROVAL_TTL_MS`]; the first `CONSUME` inside that window takes it, and
//! every later one is told why it got nothing. The store also carries the pause
//! flag and the per-thread failure budget, because both decide what a
//! `CONSUME` may answer.
//!
//! Pure: time and randomness are passed in, so every rule is unit-tested.

use std::collections::HashMap;

/// How long a minted approval may be consumed. The plug-in applies the same
/// bound to `mintedAtMs` independently.
pub(super) const APPROVAL_TTL_MS: u64 = 30_000;
/// Failed begins one thread may cause before unlocks pause. Each failure may
/// have been a lock-screen authentication attempt, and failed-password lockout
/// policies count those.
pub(super) const FAILURE_BUDGET: u32 = 2;

/// Why a `CONSUME` was denied. Spelled as the socket line's `reason` token.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum DenyReason {
    NonePending,
    Expired,
    Consumed,
    Paused,
    BadRequest,
}

impl DenyReason {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::NonePending => "none_pending",
            Self::Expired => "expired",
            Self::Consumed => "consumed",
            Self::Paused => "paused",
            Self::BadRequest => "bad_request",
        }
    }
}

/// What the store hands the plug-in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Consume {
    Allow {
        approval_id: String,
        minted_at_ms: u64,
        thread_id: String,
    },
    Deny(DenyReason),
}

/// Why no approval could be minted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum MintRefused {
    Paused,
    BudgetExhausted,
}

#[derive(Debug)]
struct Approval {
    id: String,
    thread_id: String,
    minted_at_ms: u64,
    consumed: bool,
}

#[derive(Debug, Default)]
pub(super) struct ApprovalStore {
    current: Option<Approval>,
    paused: bool,
    failures: HashMap<String, u32>,
}

fn hex(bytes: &[u8; 32]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut text = String::with_capacity(64);
    for byte in bytes {
        text.push(char::from(DIGITS[usize::from(byte >> 4)]));
        text.push(char::from(DIGITS[usize::from(byte & 0x0f)]));
    }
    text
}

/// Inclusive TTL, matching the plug-in's `0 <= now - minted <= 30000`. A clock
/// that went backwards counts as expired.
fn expired(minted_at_ms: u64, now_ms: u64) -> bool {
    now_ms
        .checked_sub(minted_at_ms)
        .is_none_or(|age| age > APPROVAL_TTL_MS)
}

impl ApprovalStore {
    /// Replace any previous approval with a fresh one for `thread_id`.
    pub(super) fn mint(
        &mut self,
        thread_id: &str,
        random: &[u8; 32],
        now_ms: u64,
    ) -> Result<String, MintRefused> {
        if self.paused {
            return Err(MintRefused::Paused);
        }
        if self.budget_exhausted(thread_id) {
            return Err(MintRefused::BudgetExhausted);
        }
        let id = hex(random);
        self.current = Some(Approval {
            id: id.clone(),
            thread_id: thread_id.to_string(),
            minted_at_ms: now_ms,
            consumed: false,
        });
        Ok(id)
    }

    /// Answer one plug-in `CONSUME`. Marks the approval consumed in the same
    /// step that hands it out, so two racing requests cannot both get it.
    pub(super) fn consume(&mut self, now_ms: u64) -> Consume {
        if self.paused {
            return Consume::Deny(DenyReason::Paused);
        }
        let Some(approval) = self.current.as_mut() else {
            return Consume::Deny(DenyReason::NonePending);
        };
        if approval.consumed {
            return Consume::Deny(DenyReason::Consumed);
        }
        if expired(approval.minted_at_ms, now_ms) {
            return Consume::Deny(DenyReason::Expired);
        }
        approval.consumed = true;
        Consume::Allow {
            approval_id: approval.id.clone(),
            minted_at_ms: approval.minted_at_ms,
            thread_id: approval.thread_id.clone(),
        }
    }

    pub(super) fn is_consumed(&self, approval_id: &str) -> bool {
        self.current
            .as_ref()
            .is_some_and(|approval| approval.id == approval_id && approval.consumed)
    }

    /// Drop any approval so a late `CONSUME` gets `none_pending`.
    pub(super) fn invalidate(&mut self) {
        self.current = None;
    }

    pub(super) fn budget_exhausted(&self, thread_id: &str) -> bool {
        self.failures.get(thread_id).copied().unwrap_or(0) >= FAILURE_BUDGET
    }

    /// Count a failed begin. Returns true when this failure spent the thread's
    /// budget, which pauses unlocks for everyone.
    pub(super) fn record_failure(&mut self, thread_id: &str) -> bool {
        let failures = self.failures.entry(thread_id.to_string()).or_insert(0);
        *failures = failures.saturating_add(1);
        if *failures >= FAILURE_BUDGET {
            self.pause();
            true
        } else {
            false
        }
    }

    pub(super) fn paused(&self) -> bool {
        self.paused
    }

    pub(super) fn pause(&mut self) {
        self.paused = true;
        self.invalidate();
    }

    /// The user unlocked by hand: the OS has reset its own failed-attempt
    /// count, so the helper resets its budgets with it.
    pub(super) fn resume(&mut self) {
        self.paused = false;
        self.failures.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RANDOM: [u8; 32] = [
        0x00, 0x01, 0x0a, 0x0f, 0x10, 0xab, 0xcd, 0xef, 0xff, 0x7f, 0x80, 0x11, 0x22, 0x33, 0x44,
        0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x12, 0x34, 0x56, 0x78, 0x9a,
        0xbc, 0xde,
    ];

    #[test]
    fn mints_lowercase_hex_of_all_32_bytes() {
        let mut store = ApprovalStore::default();
        let id = store.mint("t", &RANDOM, 1_000).unwrap();
        assert_eq!(id.len(), 64);
        assert!(id.starts_with("00010a0f10abcdefff7f80"));
        assert!(
            id.bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        );
    }

    #[test]
    fn an_approval_is_consumed_exactly_once() {
        let mut store = ApprovalStore::default();
        assert_eq!(store.consume(0), Consume::Deny(DenyReason::NonePending));
        let id = store.mint("thread-1", &RANDOM, 1_000).unwrap();
        assert!(!store.is_consumed(&id));
        assert_eq!(
            store.consume(1_500),
            Consume::Allow {
                approval_id: id.clone(),
                minted_at_ms: 1_000,
                thread_id: "thread-1".into(),
            }
        );
        assert!(store.is_consumed(&id));
        assert_eq!(store.consume(1_600), Consume::Deny(DenyReason::Consumed));
        assert!(!store.is_consumed("someone-else"));
    }

    #[test]
    fn expiry_is_inclusive_and_rejects_a_clock_that_went_backwards() {
        let mut store = ApprovalStore::default();
        store.mint("t", &RANDOM, 10_000).unwrap();
        assert_eq!(
            store.consume(10_000 + APPROVAL_TTL_MS + 1),
            Consume::Deny(DenyReason::Expired)
        );
        store.mint("t", &RANDOM, 10_000).unwrap();
        assert_eq!(store.consume(9_999), Consume::Deny(DenyReason::Expired));
        store.mint("t", &RANDOM, 10_000).unwrap();
        assert!(matches!(
            store.consume(10_000 + APPROVAL_TTL_MS),
            Consume::Allow { .. }
        ));
    }

    #[test]
    fn invalidation_and_a_new_mint_replace_the_old_approval() {
        let mut store = ApprovalStore::default();
        let first = store.mint("t", &RANDOM, 0).unwrap();
        store.invalidate();
        assert_eq!(store.consume(1), Consume::Deny(DenyReason::NonePending));
        assert!(!store.is_consumed(&first));

        let mut other = RANDOM;
        other[0] = 0xff;
        store.mint("t", &RANDOM, 0).unwrap();
        let second = store.mint("t", &other, 0).unwrap();
        match store.consume(1) {
            Consume::Allow { approval_id, .. } => assert_eq!(approval_id, second),
            denied => panic!("expected allow, got {denied:?}"),
        }
    }

    #[test]
    fn the_failure_budget_pauses_after_two_failures_of_one_thread() {
        let mut store = ApprovalStore::default();
        assert!(!store.record_failure("a"));
        assert!(!store.record_failure("b"));
        assert!(!store.paused());
        store.mint("b", &RANDOM, 0).unwrap();
        assert!(store.record_failure("a"));
        assert!(store.paused());
        assert!(store.budget_exhausted("a"));
        assert!(!store.budget_exhausted("b"));
        // Pausing withdraws the pending approval and refuses new ones.
        assert_eq!(store.consume(1), Consume::Deny(DenyReason::Paused));
        assert_eq!(store.mint("b", &RANDOM, 2), Err(MintRefused::Paused));
    }

    #[test]
    fn a_paused_store_denies_even_a_pending_approval() {
        let mut store = ApprovalStore::default();
        store.mint("t", &RANDOM, 0).unwrap();
        store.pause();
        assert_eq!(store.consume(1), Consume::Deny(DenyReason::Paused));
    }

    #[test]
    fn resuming_clears_the_pause_and_every_budget() {
        let mut store = ApprovalStore::default();
        store.record_failure("a");
        store.record_failure("a");
        assert!(store.paused());
        store.resume();
        assert!(!store.paused());
        assert!(!store.budget_exhausted("a"));
        assert!(store.mint("a", &RANDOM, 0).is_ok());
    }

    #[test]
    fn an_exhausted_thread_cannot_mint_after_the_pause_is_lifted_elsewhere() {
        let mut store = ApprovalStore::default();
        store.record_failure("a");
        store.record_failure("a");
        // Only the persisted pause flag is cleared (e.g. reloaded state).
        store.paused = false;
        assert_eq!(
            store.mint("a", &RANDOM, 0),
            Err(MintRefused::BudgetExhausted)
        );
        assert!(store.mint("b", &RANDOM, 0).is_ok());
    }
}
