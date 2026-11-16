/*
 * Pure, side-effect-free logic for the Poracode Locked Computer Use
 * authorization plug-in. Nothing in this module performs I/O or system calls,
 * so it is compiled into a standalone unit test (tests/lcu_logic_test.c).
 *
 * Socket protocol v1 (see README.md):
 *   request:  "CONSUME 1\n"
 *   response: "ALLOW 1 <approvalId:64 lowercase hex> <mintedAtMs> <threadId>\n"
 *             "DENY 1 <reason>\n"
 */
#ifndef PORACODE_LCU_LOGIC_H
#define PORACODE_LCU_LOGIC_H

#include <stddef.h>
#include <stdint.h>

#define LCU_PROTOCOL_VERSION 1
#define LCU_REQUEST_LINE "CONSUME 1\n"
#define LCU_MAX_RESPONSE_BYTES 256
#define LCU_APPROVAL_ID_LENGTH 64
#define LCU_APPROVAL_SHORT_LENGTH 8
#define LCU_THREAD_ID_MAX 128
#define LCU_REASON_MAX 32
#define LCU_MINTED_MAX_DIGITS 15
#define LCU_FRESHNESS_MS 30000ULL
/* Generous upper bound for one formatted audit line. */
#define LCU_AUDIT_LINE_MAX 320

typedef enum {
  LCU_RESPONSE_MALFORMED = 0,
  LCU_RESPONSE_ALLOW = 1,
  LCU_RESPONSE_DENY = 2,
} lcu_response_kind;

typedef struct {
  lcu_response_kind kind;
  char approval_id[LCU_APPROVAL_ID_LENGTH + 1];
  uint64_t minted_at_ms;
  char thread_id[LCU_THREAD_ID_MAX + 1];
  char reason[LCU_REASON_MAX + 1];
} lcu_response;

typedef enum {
  LCU_FRESH = 0,
  LCU_STALE = 1,
  LCU_FUTURE = 2,
} lcu_freshness;

/* Character-set validators. Each requires the full [data, data+length) range. */
int lcu_valid_approval_id(const char *data, size_t length);
int lcu_valid_thread_id(const char *data, size_t length);
int lcu_valid_reason(const char *data, size_t length);

/*
 * Parses one complete response. `data` must contain exactly one line that ends
 * with a single '\n' as its final byte; no other bytes are permitted. Any
 * deviation (oversize, CR, extra spaces, bad charset, trailing data, wrong
 * protocol version) yields LCU_RESPONSE_MALFORMED and a zeroed `out`.
 */
lcu_response_kind lcu_parse_response(const char *data, size_t length, lcu_response *out);

/* 0 <= now_ms - minted_at_ms <= LCU_FRESHNESS_MS is fresh. */
lcu_freshness lcu_check_freshness(uint64_t now_ms, uint64_t minted_at_ms);

/*
 * Formats one audit line (terminated by '\n') into `out`:
 *   <ISO8601 UTC ms> uid=<n> outcome=<allow|deny> reason=<token> approval=<id8|-> thread=<id|->
 * Invalid reason/approval/thread values are replaced by safe placeholders so a
 * hostile helper response can never inject text into the log. Returns the
 * number of bytes written (excluding the NUL), or 0 when `capacity` is too small.
 */
size_t lcu_format_audit_line(char *out, size_t capacity, uint64_t now_ms, uint32_t uid, int allowed,
                             const char *reason, const char *approval_id, const char *thread_id);

/* Writes "YYYY-MM-DDTHH:MM:SS.mmmZ" (24 chars + NUL). Returns 0 on bad capacity. */
size_t lcu_format_iso8601_utc(char *out, size_t capacity, uint64_t epoch_ms);

#endif
