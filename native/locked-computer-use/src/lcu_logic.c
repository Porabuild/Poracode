#include "lcu_logic.h"

#include <string.h>

#define LCU_MAX_TOKENS 5

static int is_lower_hex(char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); }

static int is_thread_char(char c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' ||
         c == '.' || c == ':' || c == '-';
}

static int is_reason_char(char c) { return (c >= 'a' && c <= 'z') || c == '_'; }

int lcu_valid_approval_id(const char *data, size_t length) {
  if (data == NULL || length != LCU_APPROVAL_ID_LENGTH) return 0;
  for (size_t i = 0; i < length; i++) {
    if (!is_lower_hex(data[i])) return 0;
  }
  return 1;
}

int lcu_valid_thread_id(const char *data, size_t length) {
  if (data == NULL || length < 1 || length > LCU_THREAD_ID_MAX) return 0;
  for (size_t i = 0; i < length; i++) {
    if (!is_thread_char(data[i])) return 0;
  }
  return 1;
}

int lcu_valid_reason(const char *data, size_t length) {
  if (data == NULL || length < 1 || length > LCU_REASON_MAX) return 0;
  for (size_t i = 0; i < length; i++) {
    if (!is_reason_char(data[i])) return 0;
  }
  return 1;
}

static int token_equals(const char *token, size_t length, const char *expected) {
  size_t expected_length = strlen(expected);
  return length == expected_length && memcmp(token, expected, length) == 0;
}

static int parse_minted(const char *token, size_t length, uint64_t *out) {
  if (length < 1 || length > LCU_MINTED_MAX_DIGITS) return 0;
  uint64_t value = 0;
  for (size_t i = 0; i < length; i++) {
    if (token[i] < '0' || token[i] > '9') return 0;
    /* 15 decimal digits cannot overflow uint64_t. */
    value = value * 10U + (uint64_t)(token[i] - '0');
  }
  *out = value;
  return 1;
}

lcu_response_kind lcu_parse_response(const char *data, size_t length, lcu_response *out) {
  if (out == NULL) return LCU_RESPONSE_MALFORMED;
  memset(out, 0, sizeof(*out));
  if (data == NULL || length < 2 || length > LCU_MAX_RESPONSE_BYTES) return LCU_RESPONSE_MALFORMED;
  if (data[length - 1] != '\n') return LCU_RESPONSE_MALFORMED;

  const size_t body_length = length - 1;
  const char *starts[LCU_MAX_TOKENS];
  size_t lengths[LCU_MAX_TOKENS];
  size_t count = 0;
  size_t index = 0;
  while (index < body_length) {
    /* Exactly one space separates tokens: no leading, doubled, or trailing space. */
    size_t start = index;
    while (index < body_length && data[index] != ' ') {
      char c = data[index];
      if (c < 0x21 || c > 0x7e) return LCU_RESPONSE_MALFORMED;
      index++;
    }
    if (index == start) return LCU_RESPONSE_MALFORMED;
    if (count == LCU_MAX_TOKENS) return LCU_RESPONSE_MALFORMED;
    starts[count] = data + start;
    lengths[count] = index - start;
    count++;
    if (index < body_length) {
      index++; /* skip the single separator */
      if (index == body_length) return LCU_RESPONSE_MALFORMED;
    }
  }
  if (count < 3) return LCU_RESPONSE_MALFORMED;
  if (!token_equals(starts[1], lengths[1], "1")) return LCU_RESPONSE_MALFORMED;

  if (token_equals(starts[0], lengths[0], "DENY")) {
    if (count != 3 || !lcu_valid_reason(starts[2], lengths[2])) return LCU_RESPONSE_MALFORMED;
    memcpy(out->reason, starts[2], lengths[2]);
    out->reason[lengths[2]] = '\0';
    out->kind = LCU_RESPONSE_DENY;
    return LCU_RESPONSE_DENY;
  }

  if (token_equals(starts[0], lengths[0], "ALLOW")) {
    uint64_t minted = 0;
    if (count != 5 || !lcu_valid_approval_id(starts[2], lengths[2]) ||
        !parse_minted(starts[3], lengths[3], &minted) ||
        !lcu_valid_thread_id(starts[4], lengths[4])) {
      return LCU_RESPONSE_MALFORMED;
    }
    memcpy(out->approval_id, starts[2], lengths[2]);
    out->approval_id[lengths[2]] = '\0';
    out->minted_at_ms = minted;
    memcpy(out->thread_id, starts[4], lengths[4]);
    out->thread_id[lengths[4]] = '\0';
    out->kind = LCU_RESPONSE_ALLOW;
    return LCU_RESPONSE_ALLOW;
  }

  return LCU_RESPONSE_MALFORMED;
}

lcu_freshness lcu_check_freshness(uint64_t now_ms, uint64_t minted_at_ms) {
  if (minted_at_ms > now_ms) return LCU_FUTURE;
  if (now_ms - minted_at_ms > LCU_FRESHNESS_MS) return LCU_STALE;
  return LCU_FRESH;
}

/* Howard Hinnant's days-to-civil algorithm, valid for the proleptic Gregorian calendar. */
static void civil_from_days(int64_t days, int64_t *year, unsigned *month, unsigned *day) {
  days += 719468;
  const int64_t era = (days >= 0 ? days : days - 146096) / 146097;
  const unsigned doe = (unsigned)(days - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  *day = doy - (153 * mp + 2) / 5 + 1;
  *month = mp < 10 ? mp + 3 : mp - 9;
  *year = (int64_t)yoe + era * 400 + (*month <= 2 ? 1 : 0);
}

static size_t put_digits(char *out, uint64_t value, size_t width) {
  for (size_t i = width; i > 0; i--) {
    out[i - 1] = (char)('0' + (value % 10U));
    value /= 10U;
  }
  return width;
}

size_t lcu_format_iso8601_utc(char *out, size_t capacity, uint64_t epoch_ms) {
  const size_t length = 24; /* YYYY-MM-DDTHH:MM:SS.mmmZ */
  if (out == NULL || capacity < length + 1) return 0;
  const uint64_t seconds = epoch_ms / 1000U;
  const uint64_t millis = epoch_ms % 1000U;
  const int64_t days = (int64_t)(seconds / 86400U);
  const uint64_t day_seconds = seconds % 86400U;
  int64_t year = 0;
  unsigned month = 0;
  unsigned day = 0;
  civil_from_days(days, &year, &month, &day);
  if (year < 0 || year > 9999) return 0;
  size_t at = 0;
  at += put_digits(out + at, (uint64_t)year, 4);
  out[at++] = '-';
  at += put_digits(out + at, month, 2);
  out[at++] = '-';
  at += put_digits(out + at, day, 2);
  out[at++] = 'T';
  at += put_digits(out + at, day_seconds / 3600U, 2);
  out[at++] = ':';
  at += put_digits(out + at, (day_seconds / 60U) % 60U, 2);
  out[at++] = ':';
  at += put_digits(out + at, day_seconds % 60U, 2);
  out[at++] = '.';
  at += put_digits(out + at, millis, 3);
  out[at++] = 'Z';
  out[at] = '\0';
  return at;
}

static int append(char *out, size_t capacity, size_t *at, const char *text, size_t length) {
  if (*at + length >= capacity) return 0;
  memcpy(out + *at, text, length);
  *at += length;
  out[*at] = '\0';
  return 1;
}

static int append_cstr(char *out, size_t capacity, size_t *at, const char *text) {
  return append(out, capacity, at, text, strlen(text));
}

static size_t bounded_length(const char *text, size_t limit) {
  size_t length = 0;
  while (length <= limit && text[length] != '\0') length++;
  return length;
}

size_t lcu_format_audit_line(char *out, size_t capacity, uint64_t now_ms, uint32_t uid, int allowed,
                             const char *reason, const char *approval_id, const char *thread_id) {
  if (out == NULL || capacity == 0) return 0;
  out[0] = '\0';
  char stamp[32];
  if (lcu_format_iso8601_utc(stamp, sizeof(stamp), now_ms) == 0) return 0;

  char uid_text[16];
  size_t uid_length = 0;
  {
    char reversed[16];
    uint32_t value = uid;
    do {
      reversed[uid_length++] = (char)('0' + (value % 10U));
      value /= 10U;
    } while (value != 0 && uid_length < sizeof(reversed));
    for (size_t i = 0; i < uid_length; i++) uid_text[i] = reversed[uid_length - 1 - i];
    uid_text[uid_length] = '\0';
  }

  const char *safe_reason = "invalid_reason";
  size_t reason_length = strlen(safe_reason);
  if (reason != NULL) {
    size_t length = bounded_length(reason, LCU_REASON_MAX);
    if (lcu_valid_reason(reason, length)) {
      safe_reason = reason;
      reason_length = length;
    }
  }

  const char *approval = "-";
  size_t approval_length = 1;
  if (approval_id != NULL &&
      lcu_valid_approval_id(approval_id, bounded_length(approval_id, LCU_APPROVAL_ID_LENGTH))) {
    approval = approval_id;
    approval_length = LCU_APPROVAL_SHORT_LENGTH;
  }

  const char *thread = "-";
  size_t thread_length = 1;
  if (thread_id != NULL) {
    size_t length = bounded_length(thread_id, LCU_THREAD_ID_MAX);
    if (lcu_valid_thread_id(thread_id, length)) {
      thread = thread_id;
      thread_length = length;
    }
  }

  size_t at = 0;
  if (!append_cstr(out, capacity, &at, stamp) || !append_cstr(out, capacity, &at, " uid=") ||
      !append(out, capacity, &at, uid_text, uid_length) ||
      !append_cstr(out, capacity, &at, allowed ? " outcome=allow" : " outcome=deny") ||
      !append_cstr(out, capacity, &at, " reason=") ||
      !append(out, capacity, &at, safe_reason, reason_length) ||
      !append_cstr(out, capacity, &at, " approval=") ||
      !append(out, capacity, &at, approval, approval_length) ||
      !append_cstr(out, capacity, &at, " thread=") ||
      !append(out, capacity, &at, thread, thread_length) || !append_cstr(out, capacity, &at, "\n")) {
    out[0] = '\0';
    return 0;
  }
  return at;
}
