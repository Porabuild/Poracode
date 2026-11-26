# Telemetry in Poracode

Poracode sends **no telemetry unless you opt in**. Full stop. Product
analytics and crash reports are separate opt-ins, both start off, and native
crash memory dumps are a third opt-in that requires crash reports and also
starts off. Installs that predate consent stay silent until their owner makes
an explicit choice. This page is the complete catalog of what can leave your
machine; it is kept in sync with the code by
`src/shared/analytics/telemetryManifest.test.ts`.

## Turning telemetry on or off

- **Settings → Privacy** (desktop app) has one switch for product analytics,
  one for crash reports, and one for native crash dumps that stays disabled
  until crash reports are on. All three default to off. Turning ordinary crash
  reports off also revokes the native-dump choice. Turning crash reports back
  on requires a fresh, separate dump opt-in. Turning a switch off stops sending
  immediately and drops anything still queued — no restart needed. Until you
  choose, a prompt at startup offers Accept all, Save choices, or No thanks.
  Closing it keeps everything off and asks again next launch. Accept all never
  enables native crash dumps.
- **Environment variables** win over the switches and are meant for managed
  or CI environments:

  | Variable                                               | Effect                                                  |
  | ------------------------------------------------------ | ------------------------------------------------------- |
  | `PORACODE_TELEMETRY_ENABLED=0`                         | Disables every telemetry stream                         |
  | `DO_NOT_TRACK=1`                                       | Disables every telemetry stream                         |
  | `CI=true`                                              | Disables every telemetry stream (runners are not users) |
  | `POSTHOG_ENABLED=0`                                    | Disables product analytics only                         |
  | `PORACODE_CRASH_REPORTS_ENABLED=0` or `SENTRY_DSN=off` | Disables crash reports and native crash dumps           |

- The browser/PWA client, the CLI, and the native iOS and Android apps send
  no product analytics and no crash reports. The standalone server has no
  analytics. Its supervisor may send scrubbed crash reports only when the
  shared settings on that data root were opted in (for example, from the
  desktop). Native crash dumps are only ever sent by the desktop main process.

## Product analytics (PostHog, direct)

When opted in, the desktop app sends allowlisted events straight to PostHog
(`us.i.posthog.com` by default) in batches — there is no Poracode server in
between keeping a copy. Events are associated with a **random installation
ID** generated on your device (`distinct_id`) and a per-session ID. Person
profiles are disabled (`$process_person_profile: false`), and IP/geo capture
is disabled (`$ip: null`, `$geoip_disable: true`), so PostHog does not derive
your address or location from the request.

Never collected, by construction (the sanitizer in
`src/shared/analytics/posthogPrivacy.ts` drops anything not allowlisted):
prompts and responses, code or file contents, file/project/thread names or
IDs, paths, branches, remotes, commit messages, terminal output, token counts,
account identifiers from any tool, and private/custom model names (only
public model IDs pass; everything else collapses to `other`). Library-scale
counts and durations are sent only as coarse buckets. Poracode never reads
another tool's credentials to identify you for analytics.

### Events

`app.started`, `app.surface_duration`, `app.surface_seen`, `app.view_duration`, `app.view_seen`,
`experiment.completed`, `experiment.started`, `experiment.winner_selected`, `file.opened`,
`git.commit_created`, `git.commit_message_generated`, `git.pr_created`, `git.pr_summary_generated`,
`git.sync_action`, `project.added`, `schedule.created`, `schedule.run_requested`,
`settings.section_duration`, `settings.section_seen`, `thread.checkpoint_reverted`,
`thread.input_submitted`, `thread.interrupted`, `thread.request_resolved`, `thread.started`,
`thread.turn_completed`

### Properties

Every event property key that can be sent:

`$geoip_disable`, `$ip`, `$process_person_profile`, `$insert_id`, `$session_id`, `action`,
`add_all`, `app_version`, `arch`, `attachment_segment_count`, `attention`,
`auto_generated_message`, `browser_mcp`, `candidate_count`, `channel`, `chrome`, `chrome_mcp`,
`cleanup_complete`, `computer_use`, `crossagent_mcp`, `duration_bucket`, `electron`, `effort`,
`enabled`, `fast_mode`, `file_segment_count`, `has_context_size`, `has_file_checkpoint`,
`has_project`, `has_remote`, `has_session_ref`, `has_tracking`, `has_worktree`, `is_dev`,
`is_draft`, `launch_kind`, `location_kind`, `mcp_segment_count`, `model`, `model_family`, `node`,
`overlay_mode`, `outcome`, `pane_count`, `permission_level`, `platform`, `presentation`,
`project_count_bucket`, `provider`, `prompt_length_bucket`, `prompt_kind`, `push_after`,
`recurrence`, `request_type`, `rollback_turn_count`, `runtime_kind`, `segment_count`,
`settings_section`, `settings_scope`, `skill_segment_count`, `source`, `status`, `surface`,
`surface_lane`, `text_segment_count`, `thinking`, `thread_count_bucket`, `thread_segment_count`,
`view_kind`, `winner_source`, `work_mode`, `worktree_count_bucket`

## Crash reports (Sentry)

When opted in, the desktop main process, supervisor, and renderer may send
scrubbed crash diagnostics to Sentry. Both crash-report choices default to
off. Release-health sessions, client reports, and the SDK's on-disk offline
queue are disabled, so nothing is sent or replayed outside the per-event
consent check. Performance traces, breadcrumbs, screenshots, request data,
cookies, headers, HTTP bodies, and GenAI/MCP inputs and outputs are all
disabled. Before sending, each event passes through a scrubber
(`src/shared/diagnostics/sentryPrivacy.ts`) that deletes user/request/extra
payloads and strips paths, URLs, email addresses, and secret-looking values
from messages. Only allowlisted diagnostic tags (app version, architecture,
channel, platform, provider kind, stable error classes) survive. Consent is
checked for every event, native crash minidumps included, so opting out takes
effect immediately.

### Native crash dumps (separate opt-in)

Native crash memory dumps are raw Crashpad minidumps, not scrubbed event
payloads. They are off by default, require crash reports to be on, and are
sent only by the desktop main process for a native crash event, as the single
`event.minidump` attachment alongside the ordinary scrubbed crash summary. A
minidump is a snapshot of process memory and **may contain sensitive data**,
including prompts, source or document text, credentials, or other information
present in memory at crash time. It is not passed through the event scrubber.
With crash reports on but this separate choice off, the summary is sent with
no attachment. Turning the dump choice off removes attachments from the next
event, keeping the summary. Turning crash reports off stops both, and the
environment hard-off switches above also stop both. Sentry is the sole
recipient of crash events and any admitted minidump.

## Retention and deletion

Analytics events are tied only to a random installation ID stored on your
device, never to an account, and are retained in PostHog for product analysis.
Crash reports (and any separately admitted native minidumps) are retained in
Sentry under the project's standard retention. Turning a stream off stops all
future sending. For deletion requests, contact us via
[the privacy policy](https://poracode.com/privacy).

## Rules for contributors

- Telemetry is opt-in. Do not add a stream, event, or property that ships
  without consent, and do not weaken the environment hard-off switches. Native
  crash dumps are a separate opt-in. Never attach them under `crashReports`
  alone.
- New events or properties go through the allowlist in
  `src/shared/analytics/posthogPrivacy.ts`, this document, and a changelog
  entry — in the same change. The manifest test fails when they drift.
- Never add token counts, private model or endpoint names, or identifiers
  read from other tools' configuration to any telemetry payload.
- Agents must not change telemetry consent: the `privacy` settings key is
  write-protected in the app-controls MCP settings tool.
