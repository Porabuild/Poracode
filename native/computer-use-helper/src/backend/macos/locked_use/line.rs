//! The plug-in socket's line protocol (v1): newline-terminated ASCII.
//!
//! Request `CONSUME 1\n`; reply `ALLOW 1 <approvalId> <mintedAtMs> <threadId>\n`
//! or `DENY 1 <reason>\n`, at most [`MAX_REPLY_BYTES`]. The plug-in parses the
//! reply strictly and denies anything it does not recognise, so formatting
//! refuses to emit a reply that would not parse.

use super::approval::{Consume, DenyReason};
use crate::protocol::locked_use::is_valid_thread_id;

pub(super) const REQUEST: &[u8] = b"CONSUME 1\n";
/// Longest request worth reading; anything longer is not a valid request.
pub(super) const MAX_REQUEST_BYTES: usize = 64;
pub(super) const MAX_REPLY_BYTES: usize = 256;

/// Whether `bytes` (everything read up to and including the first newline) is
/// exactly the one request this protocol version knows.
pub(super) fn is_consume_request(bytes: &[u8]) -> bool {
    bytes == REQUEST
}

fn is_approval_id(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn is_reason(value: &str) -> bool {
    (1..=32).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'_')
}

fn deny(reason: DenyReason) -> String {
    debug_assert!(is_reason(reason.as_str()));
    format!("DENY 1 {}\n", reason.as_str())
}

/// The reply line for a consume outcome. An `ALLOW` whose fields would not
/// satisfy the plug-in's parser is downgraded to `DENY 1 none_pending`: the
/// plug-in would deny it anyway, and saying so keeps the audit log honest.
pub(super) fn format_reply(outcome: &Consume) -> String {
    match outcome {
        Consume::Allow {
            approval_id,
            minted_at_ms,
            thread_id,
        } => {
            if !is_approval_id(approval_id) || !is_valid_thread_id(thread_id) {
                return deny(DenyReason::NonePending);
            }
            let line = format!("ALLOW 1 {approval_id} {minted_at_ms} {thread_id}\n");
            if line.len() > MAX_REPLY_BYTES {
                return deny(DenyReason::NonePending);
            }
            line
        }
        Consume::Deny(reason) => deny(*reason),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The plug-in's parser, restated: exactly the fields, in order, each in its
    /// alphabet, one trailing newline, nothing else.
    fn plug_in_parse(line: &str) -> Option<Consume> {
        let body = line.strip_suffix('\n')?;
        if line.len() > MAX_REPLY_BYTES || body.contains('\n') {
            return None;
        }
        let fields = body.split(' ').collect::<Vec<_>>();
        match fields.as_slice() {
            ["ALLOW", "1", id, minted, thread]
                if is_approval_id(id)
                    && !minted.is_empty()
                    && minted.bytes().all(|byte| byte.is_ascii_digit())
                    && is_valid_thread_id(thread) =>
            {
                Some(Consume::Allow {
                    approval_id: (*id).to_string(),
                    minted_at_ms: minted.parse().ok()?,
                    thread_id: (*thread).to_string(),
                })
            }
            ["DENY", "1", reason] if is_reason(reason) => Some(Consume::Deny(match *reason {
                "none_pending" => DenyReason::NonePending,
                "expired" => DenyReason::Expired,
                "consumed" => DenyReason::Consumed,
                "paused" => DenyReason::Paused,
                "bad_request" => DenyReason::BadRequest,
                _ => return None,
            })),
            _ => None,
        }
    }

    #[test]
    fn accepts_only_the_exact_request_line() {
        assert!(is_consume_request(b"CONSUME 1\n"));
        for invalid in [
            &b"CONSUME 1"[..],
            b"CONSUME 2\n",
            b"consume 1\n",
            b"CONSUME 1\r\n",
            b" CONSUME 1\n",
            b"CONSUME 1 \n",
            b"",
        ] {
            assert!(!is_consume_request(invalid), "accepted {invalid:?}");
        }
    }

    #[test]
    fn allow_round_trips_through_the_plug_in_parser() {
        let allow = Consume::Allow {
            approval_id: "0123456789abcdef".repeat(4),
            minted_at_ms: 1_762_000_000_123,
            thread_id: "thread_A.b:c-1".into(),
        };
        let line = format_reply(&allow);
        assert_eq!(
            line,
            format!(
                "ALLOW 1 {} 1762000000123 thread_A.b:c-1\n",
                "0123456789abcdef".repeat(4)
            )
        );
        assert_eq!(plug_in_parse(&line), Some(allow));
    }

    #[test]
    fn every_deny_reason_round_trips() {
        for reason in [
            DenyReason::NonePending,
            DenyReason::Expired,
            DenyReason::Consumed,
            DenyReason::Paused,
            DenyReason::BadRequest,
        ] {
            let line = format_reply(&Consume::Deny(reason));
            assert_eq!(line, format!("DENY 1 {}\n", reason.as_str()));
            assert_eq!(plug_in_parse(&line), Some(Consume::Deny(reason)));
        }
    }

    #[test]
    fn a_reply_the_plug_in_would_reject_is_never_an_allow() {
        for allow in [
            Consume::Allow {
                approval_id: "ABCDEF".repeat(10),
                minted_at_ms: 1,
                thread_id: "t".into(),
            },
            Consume::Allow {
                approval_id: "a".repeat(64),
                minted_at_ms: 1,
                thread_id: "bad thread".into(),
            },
        ] {
            assert_eq!(format_reply(&allow), "DENY 1 none_pending\n");
        }
        // The longest legal reply still fits.
        let longest = Consume::Allow {
            approval_id: "f".repeat(64),
            minted_at_ms: u64::MAX,
            thread_id: "x".repeat(128),
        };
        let line = format_reply(&longest);
        assert!(line.starts_with("ALLOW 1 "));
        assert!(line.len() <= MAX_REPLY_BYTES);
    }
}
