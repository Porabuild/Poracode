/*
 * Unit tests for the pure plug-in logic. Built and run by
 * scripts/prepare-locked-computer-use.test.mjs on macOS:
 *   clang -Wall -Wextra -Werror -I src tests/lcu_logic_test.c src/lcu_logic.c
 */
#include <stdio.h>
#include <string.h>

#include "../src/lcu_logic.h"

static int failures = 0;

#define CHECK(condition)                                                                           \
  do {                                                                                             \
    if (!(condition)) {                                                                            \
      fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);                         \
      failures++;                                                                                  \
    }                                                                                              \
  } while (0)

static const char *APPROVAL = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

static lcu_response_kind parse(const char *text, lcu_response *out) {
  return lcu_parse_response(text, strlen(text), out);
}

static void test_allow(void) {
  lcu_response response;
  CHECK(parse("ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1762214400000 thread_A.1:x-y\n",
              &response) == LCU_RESPONSE_ALLOW);
  CHECK(response.kind == LCU_RESPONSE_ALLOW);
  CHECK(strcmp(response.approval_id, APPROVAL) == 0);
  CHECK(response.minted_at_ms == 1762214400000ULL);
  CHECK(strcmp(response.thread_id, "thread_A.1:x-y") == 0);

  /* 128-character thread id is the maximum. */
  char line[300];
  char thread[130];
  memset(thread, 'a', 128);
  thread[128] = '\0';
  snprintf(line, sizeof(line), "ALLOW 1 %s 1 %s\n", APPROVAL, thread);
  CHECK(parse(line, &response) == LCU_RESPONSE_ALLOW);
  memset(thread, 'a', 129);
  thread[129] = '\0';
  snprintf(line, sizeof(line), "ALLOW 1 %s 1 %s\n", APPROVAL, thread);
  CHECK(parse(line, &response) == LCU_RESPONSE_MALFORMED);
}

static void test_deny(void) {
  lcu_response response;
  CHECK(parse("DENY 1 none_pending\n", &response) == LCU_RESPONSE_DENY);
  CHECK(strcmp(response.reason, "none_pending") == 0);
  CHECK(parse("DENY 1 consumed\n", &response) == LCU_RESPONSE_DENY);
  CHECK(parse("DENY 1 abcdefghijklmnopqrstuvwxyz_abcde\n", &response) == LCU_RESPONSE_DENY);
  /* 33 characters is too long. */
  CHECK(parse("DENY 1 abcdefghijklmnopqrstuvwxyz_abcdef\n", &response) == LCU_RESPONSE_MALFORMED);
  CHECK(parse("DENY 1 Consumed\n", &response) == LCU_RESPONSE_MALFORMED);
  CHECK(parse("DENY 1 none-pending\n", &response) == LCU_RESPONSE_MALFORMED);
  CHECK(parse("DENY 1\n", &response) == LCU_RESPONSE_MALFORMED);
  CHECK(parse("DENY 1 a b\n", &response) == LCU_RESPONSE_MALFORMED);
  CHECK(response.kind == LCU_RESPONSE_MALFORMED);
  CHECK(response.reason[0] == '\0');
}

static void test_malformed(void) {
  lcu_response response;
  const char *cases[] = {
      "",
      "\n",
      "ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t",                /* no newline */
      "ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t\n\n",            /* two lines */
      "ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t\r\n",            /* CR */
      "ALLOW 2 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t\n",              /* protocol version */
      "ALLOW 01 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t\n",             /* version token */
      "allow 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t\n",              /* verb case */
      "ALLOW 1 0123456789ABCDEF0123456789abcdef 1 t\n",              /* uppercase hex */
      "ALLOW 1 0123456789abcdef0123456789abcde 1 t\n",               /* 31 hex */
      "ALLOW 1 0123456789abcdef0123456789abcdef0 1 t\n",             /* 33 hex */
      "ALLOW 1 0123456789abcdef0123456789abcdeg 1 t\n",              /* non-hex */
      "ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef -1 t\n",             /* signed */
      "ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1.5 t\n",            /* decimal point */
      "ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1234567890123456 t\n", /* 16 digits */
      "ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t/x\n",            /* bad thread char */
      "ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t x\n",            /* extra token */
      "ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1\n",                /* missing thread */
      "ALLOW  1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t\n",             /* double space */
      " ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t\n",             /* leading space */
      "ALLOW 1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t \n",             /* trailing space */
      "ALLOW\t1 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef 1 t\n",             /* tab */
      "OK 1 x\n",
  };
  for (size_t i = 0; i < sizeof(cases) / sizeof(cases[0]); i++) {
    if (parse(cases[i], &response) != LCU_RESPONSE_MALFORMED) {
      fprintf(stderr, "FAIL malformed case %zu accepted: %s", i, cases[i]);
      failures++;
    }
  }
  /* Embedded NUL is rejected even when the length covers it. */
  const char nul_line[] = "DENY 1 a\0b\n";
  CHECK(lcu_parse_response(nul_line, sizeof(nul_line) - 1, &response) == LCU_RESPONSE_MALFORMED);
  CHECK(lcu_parse_response(NULL, 4, &response) == LCU_RESPONSE_MALFORMED);
}

static void test_oversized(void) {
  lcu_response response;
  char line[LCU_MAX_RESPONSE_BYTES + 8];
  /* 256 bytes total is accepted when otherwise valid... */
  memset(line, 0, sizeof(line));
  const char *prefix = "DENY 1 ";
  size_t prefix_length = strlen(prefix);
  memcpy(line, prefix, prefix_length);
  memset(line + prefix_length, 'a', 10);
  line[prefix_length + 10] = '\n';
  CHECK(lcu_parse_response(line, prefix_length + 11, &response) == LCU_RESPONSE_DENY);
  /* ...but any buffer longer than 256 bytes is rejected outright. */
  memset(line, 'a', sizeof(line));
  line[LCU_MAX_RESPONSE_BYTES] = '\n';
  CHECK(lcu_parse_response(line, LCU_MAX_RESPONSE_BYTES + 1, &response) == LCU_RESPONSE_MALFORMED);
}

static void test_validators(void) {
  CHECK(lcu_valid_approval_id(APPROVAL, 64));
  CHECK(!lcu_valid_approval_id(APPROVAL, 63));
  CHECK(!lcu_valid_approval_id("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeF", 64));
  CHECK(lcu_valid_thread_id("A-z_0.9:", 8));
  CHECK(!lcu_valid_thread_id("", 0));
  CHECK(!lcu_valid_thread_id("a b", 3));
  CHECK(!lcu_valid_thread_id("a=b", 3));
  CHECK(lcu_valid_reason("none_pending", 12));
  CHECK(!lcu_valid_reason("none pending", 12));
  CHECK(!lcu_valid_reason("", 0));
  CHECK(!lcu_valid_reason("x9", 2));
}

static void test_freshness(void) {
  CHECK(lcu_check_freshness(1000000, 1000000) == LCU_FRESH);
  CHECK(lcu_check_freshness(1030000, 1000000) == LCU_FRESH);
  CHECK(lcu_check_freshness(1030001, 1000000) == LCU_STALE);
  CHECK(lcu_check_freshness(999999, 1000000) == LCU_FUTURE);
  CHECK(lcu_check_freshness(0, 1) == LCU_FUTURE);
}

static void test_audit_line(void) {
  char line[LCU_AUDIT_LINE_MAX];
  char stamp[32];
  CHECK(lcu_format_iso8601_utc(stamp, sizeof(stamp), 0) == 24);
  CHECK(strcmp(stamp, "1970-01-01T00:00:00.000Z") == 0);
  /* 2026-11-04T12:34:56.789Z */
  CHECK(lcu_format_iso8601_utc(stamp, sizeof(stamp), 1793795696789ULL) == 24);
  CHECK(strcmp(stamp, "2026-11-04T12:34:56.789Z") == 0);
  /* Leap day. */
  CHECK(lcu_format_iso8601_utc(stamp, sizeof(stamp), 1709164800000ULL) == 24);
  CHECK(strcmp(stamp, "2024-02-29T00:00:00.000Z") == 0);
  CHECK(lcu_format_iso8601_utc(stamp, 24, 0) == 0);

  size_t length = lcu_format_audit_line(line, sizeof(line), 1793795696789ULL, 501, 1, "approved",
                                        APPROVAL, "thread-1");
  CHECK(length == strlen(line));
  CHECK(strcmp(line, "2026-11-04T12:34:56.789Z uid=501 outcome=allow reason=approved "
                     "approval=01234567 thread=thread-1\n") == 0);

  lcu_format_audit_line(line, sizeof(line), 0, 0, 0, "helper_unavailable", NULL, NULL);
  CHECK(strcmp(line, "1970-01-01T00:00:00.000Z uid=0 outcome=deny reason=helper_unavailable "
                     "approval=- thread=-\n") == 0);

  /* Hostile values never reach the log verbatim. */
  lcu_format_audit_line(line, sizeof(line), 0, 4294967295U, 0, "bad reason\nx", "nothex",
                        "t\nforged=1");
  CHECK(strcmp(line, "1970-01-01T00:00:00.000Z uid=4294967295 outcome=deny reason=invalid_reason "
                     "approval=- thread=-\n") == 0);

  /* Too-small buffers fail closed with an empty string. */
  CHECK(lcu_format_audit_line(line, 40, 0, 501, 0, "denied", NULL, NULL) == 0);
  CHECK(line[0] == '\0');
}

int main(void) {
  test_allow();
  test_deny();
  test_malformed();
  test_oversized();
  test_validators();
  test_freshness();
  test_audit_line();
  if (failures != 0) {
    fprintf(stderr, "%d failure(s)\n", failures);
    return 1;
  }
  printf("lcu_logic_test: ok\n");
  return 0;
}
