/*
 * Poracode Locked Computer Use — SecurityAgent authorization plug-in.
 *
 * Mechanism "PoracodeLockedUse:allow,privileged" runs as root inside
 * authorizationhost while `system.login.screensaver` is evaluated. It allows
 * the unlock only when the signed Poracode computer-use helper of the console
 * user hands out a fresh, single-use approval over a local socket. Every error,
 * timeout, or unexpected answer denies, which falls through to the stock
 * `use-login-window-ui` rule. SetResult is called exactly once per invocation.
 *
 * Protocol and security rules: native/locked-computer-use/README.md.
 */
#include <CoreFoundation/CoreFoundation.h>
#include <Security/AuthorizationPlugin.h>
#include <Security/Security.h>
#include <SystemConfiguration/SystemConfiguration.h>

#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/ucred.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>

#include "lcu_logic.h"

#ifndef PORACODE_LCU_TEAM_ID
#define PORACODE_LCU_TEAM_ID ""
#endif
#ifndef PORACODE_LCU_HELPER_IDENTIFIER
#define PORACODE_LCU_HELPER_IDENTIFIER "poracode-computer-use"
#endif

#define LCU_EXPORT __attribute__((visibility("default")))
#define LCU_RUN_DIR "/Library/Application Support/Poracode/LockedComputerUse/run"
#define LCU_LOG_DIR "/Library/Logs/Poracode"
#define LCU_LOG_PATH LCU_LOG_DIR "/locked-computer-use.log"
#define LCU_BUDGET_MS 250U
#define LCU_REQUIREMENT                                                                            \
  "anchor apple generic and certificate leaf[subject.OU] = \"" PORACODE_LCU_TEAM_ID                \
  "\" and identifier \"" PORACODE_LCU_HELPER_IDENTIFIER "\""

typedef struct {
  const AuthorizationCallbacks *callbacks;
} lcu_plugin;

typedef struct {
  lcu_plugin *plugin;
  AuthorizationEngineRef engine;
  int known_mechanism;
  int result_set;
} lcu_mechanism;

typedef struct {
  int allowed;
  uint32_t uid;
  const char *reason;
  char helper_reason[LCU_REASON_MAX + 1];
  char approval_id[LCU_APPROVAL_ID_LENGTH + 1];
  char thread_id[LCU_THREAD_ID_MAX + 1];
} lcu_decision;

static uint64_t monotonic_ms(void) { return clock_gettime_nsec_np(CLOCK_UPTIME_RAW) / 1000000ULL; }

static uint64_t wall_clock_ms(void) {
  struct timespec now;
  if (clock_gettime(CLOCK_REALTIME, &now) != 0) return 0;
  return (uint64_t)now.tv_sec * 1000ULL + (uint64_t)now.tv_nsec / 1000000ULL;
}

/* Waits for `events` on fd until the deadline. Returns 1 when ready, 0 on timeout/error. */
static int wait_ready(int fd, short events, uint64_t deadline_ms) {
  for (;;) {
    uint64_t now = monotonic_ms();
    if (now >= deadline_ms) return 0;
    struct pollfd entry = {.fd = fd, .events = events, .revents = 0};
    int rc = poll(&entry, 1, (int)(deadline_ms - now));
    if (rc > 0) return (entry.revents & (events | POLLHUP)) != 0;
    if (rc == 0) return 0;
    if (errno != EINTR) return 0;
  }
}

static const char *verify_peer(int fd, uid_t console_uid) {
  struct xucred credentials;
  socklen_t length = sizeof(credentials);
  memset(&credentials, 0, sizeof(credentials));
  if (getsockopt(fd, SOL_LOCAL, LOCAL_PEERCRED, &credentials, &length) != 0 ||
      credentials.cr_version != XUCRED_VERSION) {
    return "peer_cred_failed";
  }
  if (credentials.cr_uid != console_uid) return "peer_uid_mismatch";

  audit_token_t token;
  length = sizeof(token);
  memset(&token, 0, sizeof(token));
  if (getsockopt(fd, SOL_LOCAL, LOCAL_PEERTOKEN, &token, &length) != 0 ||
      length != sizeof(token)) {
    return "peer_token_failed";
  }

  const char *failure = NULL;
  CFDataRef token_data = CFDataCreate(kCFAllocatorDefault, (const UInt8 *)&token, sizeof(token));
  CFDictionaryRef attributes = NULL;
  SecCodeRef code = NULL;
  SecRequirementRef requirement = NULL;
  CFDictionaryRef information = NULL;
  if (token_data == NULL) {
    failure = "peer_token_failed";
    goto done;
  }
  const void *keys[] = {kSecGuestAttributeAudit};
  const void *values[] = {token_data};
  attributes = CFDictionaryCreate(kCFAllocatorDefault, keys, values, 1,
                                  &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  if (attributes == NULL ||
      SecCodeCopyGuestWithAttributes(NULL, attributes, kSecCSDefaultFlags, &code) != errSecSuccess ||
      code == NULL) {
    failure = "peer_code_failed";
    goto done;
  }
  if (SecRequirementCreateWithString(CFSTR(LCU_REQUIREMENT), kSecCSDefaultFlags, &requirement) !=
          errSecSuccess ||
      requirement == NULL) {
    failure = "requirement_failed";
    goto done;
  }
  if (SecCodeCheckValidity(code, kSecCSDefaultFlags, requirement) != errSecSuccess) {
    failure = "peer_code_invalid";
    goto done;
  }
  if (SecCodeCopySigningInformation((SecStaticCodeRef)code, kSecCSDefaultFlags, &information) !=
          errSecSuccess ||
      information == NULL) {
    failure = "peer_code_failed";
    goto done;
  }
  CFNumberRef flags_value = CFDictionaryGetValue(information, kSecCodeInfoFlags);
  uint32_t flags = 0;
  if (flags_value == NULL || CFGetTypeID(flags_value) != CFNumberGetTypeID() ||
      !CFNumberGetValue(flags_value, kCFNumberSInt32Type, &flags) ||
      (flags & kSecCodeSignatureRuntime) == 0) {
    failure = "peer_not_hardened";
    goto done;
  }

done:
  if (information != NULL) CFRelease(information);
  if (requirement != NULL) CFRelease(requirement);
  if (code != NULL) CFRelease(code);
  if (attributes != NULL) CFRelease(attributes);
  if (token_data != NULL) CFRelease(token_data);
  return failure;
}

static const char *exchange(int fd, uint64_t deadline_ms, char *response, size_t capacity,
                            size_t *response_length) {
  const char *request = LCU_REQUEST_LINE;
  size_t request_length = strlen(request);
  size_t sent = 0;
  while (sent < request_length) {
    ssize_t written = send(fd, request + sent, request_length - sent, 0);
    if (written > 0) {
      sent += (size_t)written;
      continue;
    }
    if (written < 0 && errno == EINTR) continue;
    if (written < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
      if (wait_ready(fd, POLLOUT, deadline_ms)) continue;
      return "timeout";
    }
    return "write_failed";
  }

  size_t received = 0;
  for (;;) {
    if (received >= capacity) return "oversized";
    ssize_t count = recv(fd, response + received, capacity - received, 0);
    if (count > 0) {
      size_t start = received;
      received += (size_t)count;
      for (size_t i = start; i < received; i++) {
        if (response[i] == '\n') {
          if (i + 1 != received) return "malformed"; /* bytes after the line */
          *response_length = received;
          return NULL;
        }
      }
      continue;
    }
    if (count == 0) return "read_failed"; /* EOF before a full line */
    if (errno == EINTR) continue;
    if (errno == EAGAIN || errno == EWOULDBLOCK) {
      if (wait_ready(fd, POLLIN, deadline_ms)) continue;
      return "timeout";
    }
    return "read_failed";
  }
}

static void evaluate(lcu_decision *decision) {
  memset(decision, 0, sizeof(*decision));
  decision->reason = "internal_error";
  const uint64_t deadline_ms = monotonic_ms() + LCU_BUDGET_MS;

  uid_t uid = 0;
  gid_t gid = 0;
  CFStringRef user = SCDynamicStoreCopyConsoleUser(NULL, &uid, &gid);
  if (user == NULL) {
    decision->reason = "no_console_user";
    return;
  }
  const Boolean login_window = CFEqual(user, CFSTR("loginwindow"));
  CFRelease(user);
  decision->uid = (uint32_t)uid;
  if (login_window || uid == 0) {
    decision->reason = "no_console_user";
    return;
  }

  /* Built without a Developer ID team: the helper identity cannot be pinned. */
  if (sizeof(PORACODE_LCU_TEAM_ID) <= 1) {
    decision->reason = "unsigned_build";
    return;
  }

  struct sockaddr_un address;
  memset(&address, 0, sizeof(address));
  address.sun_family = AF_UNIX;
  int path_length = snprintf(address.sun_path, sizeof(address.sun_path), "%s/%u/helper.sock",
                             LCU_RUN_DIR, (unsigned)uid);
  if (path_length < 0 || (size_t)path_length >= sizeof(address.sun_path)) {
    decision->reason = "path_too_long";
    return;
  }

  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0) {
    decision->reason = "socket_error";
    return;
  }
  int one = 1;
  int flags = fcntl(fd, F_GETFL, 0);
  if (fcntl(fd, F_SETFD, FD_CLOEXEC) != 0 || flags < 0 ||
      fcntl(fd, F_SETFL, flags | O_NONBLOCK) != 0 ||
      setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof(one)) != 0) {
    close(fd);
    decision->reason = "socket_error";
    return;
  }

  if (connect(fd, (const struct sockaddr *)&address, sizeof(address)) != 0) {
    if (errno != EINPROGRESS && errno != EINTR) {
      close(fd);
      decision->reason = "helper_unavailable";
      return;
    }
    int socket_error = 0;
    socklen_t error_length = sizeof(socket_error);
    if (!wait_ready(fd, POLLOUT, deadline_ms) ||
        getsockopt(fd, SOL_SOCKET, SO_ERROR, &socket_error, &error_length) != 0 ||
        socket_error != 0) {
      close(fd);
      decision->reason = "helper_unavailable";
      return;
    }
  }

  const char *peer_failure = verify_peer(fd, uid);
  if (peer_failure != NULL) {
    close(fd);
    decision->reason = peer_failure;
    return;
  }

  char response[LCU_MAX_RESPONSE_BYTES];
  size_t response_length = 0;
  const char *io_failure = exchange(fd, deadline_ms, response, sizeof(response), &response_length);
  close(fd);
  if (io_failure != NULL) {
    decision->reason = io_failure;
    return;
  }

  lcu_response parsed;
  switch (lcu_parse_response(response, response_length, &parsed)) {
  case LCU_RESPONSE_DENY:
    memcpy(decision->helper_reason, parsed.reason, sizeof(decision->helper_reason));
    decision->reason = decision->helper_reason;
    return;
  case LCU_RESPONSE_ALLOW:
    break;
  case LCU_RESPONSE_MALFORMED:
  default:
    decision->reason = "malformed";
    return;
  }

  memcpy(decision->approval_id, parsed.approval_id, sizeof(decision->approval_id));
  memcpy(decision->thread_id, parsed.thread_id, sizeof(decision->thread_id));
  switch (lcu_check_freshness(wall_clock_ms(), parsed.minted_at_ms)) {
  case LCU_FRESH:
    decision->allowed = 1;
    decision->reason = "approved";
    return;
  case LCU_FUTURE:
    decision->reason = "future";
    return;
  case LCU_STALE:
  default:
    decision->reason = "stale";
    return;
  }
}

static int append_audit_line(const char *line, size_t length) {
  if (mkdir(LCU_LOG_DIR, 0755) == 0) {
    (void)chmod(LCU_LOG_DIR, 0755);
  } else if (errno != EEXIST) {
    return 0;
  }
  /* Root appends here, so refuse a directory or file anyone else could have planted or linked. */
  struct stat directory;
  if (lstat(LCU_LOG_DIR, &directory) != 0 || !S_ISDIR(directory.st_mode) ||
      directory.st_uid != 0 || (directory.st_mode & (S_IWGRP | S_IWOTH)) != 0) {
    return 0;
  }

  int fd = open(LCU_LOG_PATH, O_WRONLY | O_APPEND | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0644);
  if (fd >= 0) {
    (void)fchmod(fd, 0644);
  } else if (errno == EEXIST) {
    fd = open(LCU_LOG_PATH, O_WRONLY | O_APPEND | O_NOFOLLOW | O_CLOEXEC);
  }
  if (fd < 0) return 0;
  struct stat file;
  if (fstat(fd, &file) != 0 || !S_ISREG(file.st_mode) || file.st_uid != 0 || file.st_nlink != 1) {
    close(fd);
    return 0;
  }
  size_t written = 0;
  while (written < length) {
    ssize_t count = write(fd, line + written, length - written);
    if (count > 0) {
      written += (size_t)count;
    } else if (count < 0 && errno == EINTR) {
      continue;
    } else {
      break;
    }
  }
  close(fd);
  return written == length;
}

static OSStatus finish(lcu_mechanism *mechanism, int allowed) {
  if (mechanism->result_set) return errSecSuccess;
  mechanism->result_set = 1;
  return mechanism->plugin->callbacks->SetResult(
      mechanism->engine, allowed ? kAuthorizationResultAllow : kAuthorizationResultDeny);
}

static OSStatus mechanism_invoke(AuthorizationMechanismRef reference) {
  lcu_mechanism *mechanism = (lcu_mechanism *)reference;
  if (mechanism == NULL) return errSecParam;

  lcu_decision decision;
  if (mechanism->known_mechanism) {
    evaluate(&decision);
  } else {
    memset(&decision, 0, sizeof(decision));
    decision.reason = "unknown_mechanism";
  }

  char line[LCU_AUDIT_LINE_MAX];
  size_t length = lcu_format_audit_line(
      line, sizeof(line), wall_clock_ms(), decision.uid, decision.allowed, decision.reason,
      decision.approval_id[0] != '\0' ? decision.approval_id : NULL,
      decision.thread_id[0] != '\0' ? decision.thread_id : NULL);
  int logged = length > 0 && append_audit_line(line, length);
  /* An unlock that cannot be audited is not allowed. */
  return finish(mechanism, decision.allowed && logged);
}

static OSStatus mechanism_deactivate(AuthorizationMechanismRef reference) {
  lcu_mechanism *mechanism = (lcu_mechanism *)reference;
  if (mechanism == NULL) return errSecParam;
  return mechanism->plugin->callbacks->DidDeactivate(mechanism->engine);
}

static OSStatus mechanism_destroy(AuthorizationMechanismRef reference) {
  free(reference);
  return errSecSuccess;
}

static OSStatus mechanism_create(AuthorizationPluginRef plugin_reference,
                                 AuthorizationEngineRef engine,
                                 AuthorizationMechanismId mechanism_id,
                                 AuthorizationMechanismRef *out_mechanism) {
  if (plugin_reference == NULL || out_mechanism == NULL) return errSecParam;
  lcu_mechanism *mechanism = calloc(1, sizeof(*mechanism));
  if (mechanism == NULL) return errSecAllocate;
  mechanism->plugin = (lcu_plugin *)plugin_reference;
  mechanism->engine = engine;
  /* Unknown ids still get a mechanism that denies, never an engine error. */
  mechanism->known_mechanism = mechanism_id != NULL && strcmp(mechanism_id, "allow") == 0;
  *out_mechanism = mechanism;
  return errSecSuccess;
}

static OSStatus plugin_destroy(AuthorizationPluginRef reference) {
  free(reference);
  return errSecSuccess;
}

static const AuthorizationPluginInterface lcu_interface = {
    kAuthorizationPluginInterfaceVersion,
    plugin_destroy,
    mechanism_create,
    mechanism_invoke,
    mechanism_deactivate,
    mechanism_destroy,
};

LCU_EXPORT OSStatus AuthorizationPluginCreate(const AuthorizationCallbacks *callbacks,
                                              AuthorizationPluginRef *out_plugin,
                                              const AuthorizationPluginInterface **out_interface) {
  if (callbacks == NULL || out_plugin == NULL || out_interface == NULL) return errSecParam;
  lcu_plugin *plugin = calloc(1, sizeof(*plugin));
  if (plugin == NULL) return errSecAllocate;
  plugin->callbacks = callbacks;
  *out_plugin = plugin;
  *out_interface = &lcu_interface;
  return errSecSuccess;
}
