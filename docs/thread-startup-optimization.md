# Thread startup optimization

## Scope and evidence

Compare clean master `a05031b672264c908a41ad0c1d67c6d7d0f5bfbc` with this change using isolated, managed Electron sessions and real Codex turns. The installed Nightly already contains the earlier deferred OAuth and optional MCP changes; those changes do not remove the remaining Poracode preflight.

The captured installed-app reproduction took 24.608 seconds from thread creation to the assistant item. Its existing logs establish these boundaries, but do not identify every function inside each interval:

| Interval                                                 |    Time | Owner / interpretation                                                                   |
| -------------------------------------------------------- | ------: | ---------------------------------------------------------------------------------------- |
| Thread creation to launch receipt                        | 7.759 s | Client/transport/host ingress; original cause unresolved                                 |
| Launch receipt to plugin-list process creation           | 7.180 s | Poracode preparation, including shell discovery; not all attributable to shell discovery |
| Plugin-list process creation to optimistic working state | 4.811 s | Poracode's awaited native-plugin inventory and remaining preflight                       |
| Working state to Codex receiving input                   | 1.779 s | Provider session startup                                                                 |
| Codex input to model request                             | 1.624 s | Codex local preparation                                                                  |
| Model request to assistant item                          | 1.455 s | Model/network/response handling                                                          |

These historical timings are diagnostic evidence, not a controlled before/after benchmark.

## Documentation decisions

- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) identifies servers by configuration key and supports optional startup behavior. It does not require a host to run a fresh plugin inventory before every thread.
- [OpenAI plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) scope tool-name uniqueness to a server. Similar functionality under distinct server IDs is not sufficient reason to block startup for deduplication. Duplicate connections may still cost resources.
- [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server) marks the plugin-management RPCs as under development and unsuitable for production clients. Do not replace the CLI probe with `plugin/list`.
- Native plugin metadata is still needed when explicitly invoking a plugin-owned skill. Preserve that mapping, including later turns and the selected account/environment.

The competitor comparison is source inspection, not a performance test of installed releases:

| App / inspected revision                                 | Relevant behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T3 Code `07cb90286656393e395192d82f5c9980b604ef31`       | Repository search found no runtime CLI or RPC plugin inventory. Its adapter [initializes the shared app-server](https://github.com/pingdotgg/t3code/blob/07cb90286656393e395192d82f5c9980b604ef31/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts#L1756-L1784) and [starts the thread](https://github.com/pingdotgg/t3code/blob/07cb90286656393e395192d82f5c9980b604ef31/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts#L6456-L6470).                                                                                                                                                                                                                                         |
| Synara v1.0.7 `b8cf9382d36ac1120b3fe16241cfd96189a9a71e` | [Composer discovery](https://github.com/Emanuele-web04/synara/blob/b8cf9382d36ac1120b3fe16241cfd96189a9a71e/apps/web/src/components/chat/useComposerDiscovery.ts#L148-L160) queries plugin inventory outside thread startup. It uses the experimental RPC above, a [30-second frontend stale time](https://github.com/Emanuele-web04/synara/blob/b8cf9382d36ac1120b3fe16241cfd96189a9a71e/apps/web/src/lib/providerDiscoveryReactQuery.ts#L644-L673), and an [account/context-keyed backend cache](https://github.com/Emanuele-web04/synara/blob/b8cf9382d36ac1120b3fe16241cfd96189a9a71e/apps/server/src/codexAppServerManager.ts#L3544-L3584) backed by a 128-entry LRU without a time-based expiry. |

Neither implementation establishes that duplicate services are beneficial. The relevant decision is to preserve separately enabled server identities without making semantic deduplication a launch prerequisite.

## Implementation plan

1. **Separate shell selection from shell inventory.** An ordinary Windows launch should select an existing executable from PATH or known locations without collecting versions or running Appx discovery. Keep the chosen automatic executable for the supervisor lifetime, check that it still exists, honor explicit settings immediately, and reset the choice when a fresh complete Settings catalog is collected. Retain the complete catalog and rare discovery fallback.
2. **Request native plugin metadata only when consumed.** Ordinary startup and per-turn MCP refresh must not await `codex plugin list`. Resolve inventory for explicit plugin-owned skill invocations, preserving native skill mapping on first turns and follow-ups. Bind deferred lookup to the adapter captured by the session, so later profile edits cannot substitute another account's metadata. Keep permission, tool-filtering and environment boundaries unchanged.
3. **Measure the initial gap before changing transport behavior.** Capture renderer submit/fetch timing, Chromium queue/send/response timing, long tasks, host launch receipt, provider startup and first assistant output. Investigate idle and background-contention conditions separately. Do not label synthetic contention as the original cause.
4. **Review and validate.** Cover shell cache invalidation and settings changes, plain startup with unresolved inventory, explicit skills and follow-ups. Run focused tests, full formatting/lint/typecheck/unit checks, provider integration checks and managed live first-turn/follow-up checks.

No persisted shape, public wire contract or deployed helper format changed; existing artifacts remain valid. The Home working directory, Codex's MCP timeouts, installed provider configuration and user-owned running apps were preserved.

## Before/after protocol

- Use separate clean baseline and patched source worktrees, separate owned app roots, the same native Codex executable/account/model/effort, and the same safe `Reply OK` prompt.
- Use frozen renderer/runtime snapshots and verify each runtime manifest. These are development integration builds, not packaged production benchmarks.
- Capture several fresh threads and distinguish first-use from warm supervisor behavior. Avoid running full verification workloads during timing samples.
- Report client-to-host delay, launch preparation, provider startup and first output separately; model/network latency is variable.
- Retain sanitized raw timing artifacts, app logs, runtime identities and UI screenshots. Stop only the managed sessions created for this comparison.

## Results

### Live managed Electron comparison

Three fresh Home Chat launches and one follow-up per version completed on the same machine after builds and full unit checks stopped. Both apps used native Codex 0.163.0, `gpt-6.1-sol`, Low effort, 400k context, Fast enabled, Full access, and Cursor `composer-2.5` for title generation. All eight turns returned `OK`; all captures recorded zero renderer/runtime errors. Both frozen runtime snapshots passed `verify-runtime`, and both final two-turn screenshots were inspected.

| Fresh launch                           | Baseline host request | Patched host request | Baseline first content | Patched first content |
| -------------------------------------- | --------------------: | -------------------: | ---------------------: | --------------------: |
| More than 65s idle since configuration |               8.007 s |              1.431 s |               15.001 s |               6.581 s |
| Repeat 2                               |               3.264 s |              0.944 s |                8.144 s |               5.869 s |
| Repeat 3                               |               1.924 s |              0.713 s |                6.412 s |               5.313 s |
| Median                                 |           **3.264 s** |          **0.944 s** |            **8.144 s** |           **5.869 s** |

Median host launch request duration decreased by 2.320 seconds (71%). Median submit-to-first-content decreased by 2.275 seconds (28%). These are three samples per version, with variable Codex/model latency, not a production latency guarantee. Host request duration includes opening/submitting the provider session; it is not exclusively Poracode preparation. UI idle alone does not prove that the old catalog expired, because background activity can refresh it. The isolated function test below measures expiry directly.

The first pair provides a finer, non-overlapping owner breakdown. Each row ends where the next begins; these are first-pair values, not sums of independent medians:

| Phase                                         | Baseline | Patched | Responsible components                        |
| --------------------------------------------- | -------: | ------: | --------------------------------------------- |
| Metadata created to launch receipt            |  0.169 s | 0.083 s | Poracode renderer, transport and host ingress |
| Receipt to backend working marker             |  5.182 s | 0.121 s | Poracode launch preparation                   |
| Working marker to app-server process creation |  0.907 s | 0.523 s | Poracode, wrapper and process launch          |
| Process creation to Codex receiving the turn  |  1.923 s | 0.785 s | Codex initialization and Poracode handshake   |
| Codex input to model request                  |  2.653 s | 3.810 s | Codex local preparation                       |
| Model request to first message event          |  4.110 s | 1.223 s | Provider, model and network                   |

Exact process creation was observed for the first and third launches; it was not captured for repeat 2. Native plugin-list process counts were not recorded. Skipping that inventory is established by the launch code and regression assertions, not inferred from missing process events. The backend working marker is distinct from the renderer's optimistic working status.

Follow-ups reused the same Codex process and provider session on each version. First content took 1.429 seconds on baseline and 1.870 seconds after the change; submit-to-Codex-input was 25 ms and 37 ms respectively. No follow-up speed improvement is established.

The original 7.759-second pre-receipt gap did not reproduce in any of the six fresh launches. Browser request-to-send was 28 ms / 7 ms in the first pair and approximately 0.3 ms in repeats. Renderer actions before fetch took milliseconds, with no intervening long task. The fixtures do not reproduce the original app's background project/PR polling load, so these results neither identify nor rule out the original queue or synchronous title-preparation candidates. No transport change was made on that basis.

Sanitized evidence is retained locally:

- Aggregate, all eight turns: `.tmp/thread-startup-performance/comparison.json`.
- Baseline captures, summaries, process snapshots, runtime verification and `final-ok.png`: `C:\Users\sdsle\.poracode-smoke\thread-startup-before-20261018-a\artifacts`.
- Patched equivalents: `C:\Users\sdsle\.poracode-smoke\thread-startup-after-20261018-b\artifacts`.

Provider timestamps were joined by exact session ID in the Codex log database. Launch receipts were joined by their exact `{threadId}` response. Renderer and CDP wall clocks differed by approximately 15–18 ms, so browser queuing uses CDP monotonic timestamps; very short cross-clock deltas are not treated as precise. A follow-up overwrote the patched third thread's database working marker, which is omitted from that first-turn summary; baseline3's original summary was preserved before its follow-up. Raw captures remain unchanged.

Both initial app builds had failed before readiness because a disposable legacy fixture migration tried to hash an Electron-locked GPU cache. Both owned fixture roots were migrated offline through the normal host lease and activation code before the supported `--reuse-fixture` managed retry. Those failed launches produced no thread samples. The successful comparison apps were stopped through their owning managed sessions after evidence capture. The installed Nightly was not modified.

### Shell function comparison

The actual `SupervisorRuntime.resolveWindowsPowerShell` function was bundled from each source tree and measured with identical in-memory settings. Three samples per case gave these medians:

| Shell selection case                   | Baseline |  Patched | Direct subprocess calls before / after |
| -------------------------------------- | -------: | -------: | -------------------------------------- |
| First automatic selection              |  1212 ms |  1.75 ms | 5 / 0                                  |
| Cached automatic selection             | 0.010 ms | 0.088 ms | 0 / 0                                  |
| Automatic selection after cache expiry |  1727 ms | 0.117 ms | 5 / 0                                  |
| First explicitly configured selection  |  1227 ms | 0.123 ms | 5 / 0                                  |
| Cached explicitly configured selection | 0.008 ms | 0.091 ms | 0 / 0                                  |

The expiry case advances the cache clock by 120 seconds while measuring actual elapsed time. First selection means an empty JavaScript cache, not a cold OS cache. Settings-file I/O and module loading are excluded. The small increase in already-cached calls is the new executable-existence check. Full unit tests with two workers were active during these samples, so these are function measurements under load, not end-to-end launch gains. Raw samples, source hashes and ranges are retained in `.tmp/thread-startup-performance/shell-selection-results-2026-10-17T23-07-06-097Z.json`.

## Cross-provider scope and follow-up audit

The implementation changes shared supervisor code, not a Codex-specific startup path. The measured end-to-end gains above are nevertheless Codex-only evidence.

| Change                                        | Scope                                                                                                              | Behavior retained                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Fast Windows launch-shell selection           | Every provider using shared Windows command/environment helpers, plus terminals and utility commands               | Explicit settings, executable disappearance recovery, full Settings inventory and non-Windows behavior |
| Demand-driven native plugin metadata          | Shared launch, follow-up and restart contract; currently only Codex and its profiles implement `listNativePlugins` | Explicit plugin-skill mapping, captured account adapter, execution environment and session snapshots   |
| Preserve independently enabled MCP identities | Shared plugin MCP composition for every adapter                                                                    | User-server name collision protection, plugin policy, authorization and disabled-tool filtering        |
| Skip redundant absolute-executable discovery  | Every shared Windows command builder caller, including title helpers                                               | Bare commands and scripts still resolve normally                                                       |
| Asynchronous Windows private-file preparation | Every provider staging private launch files through the shared helper                                              | Identity and ACL success remain required before private files are written                              |

Code inspection covered all 18 built-in adapters, the shared ACP factory and the profile/generic-ACP registry paths. This establishes where to measure next; it does not establish other providers' latency or live GUI correctness.

The startup-work column below records the implementation before the auxiliary wave; the OpenCode catalog changes are described and verified later in this report.

| Provider     | Structured runtime to profile | Additional startup work to distinguish from shared preparation                                               | Live Windows terminal lifecycle            |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Claude       | Agent SDK                     | Query initialization, model/permission/MCP synchronization; command discovery already runs in the background | Passed                                     |
| Copilot      | ACP                           | Initialize, session new/load and negotiated configuration                                                    | Skipped: no model in detected capabilities |
| Codex        | Native app-server             | Initialize, thread start/resume and turn submission; explicit plugin skills still require native metadata    | Passed, required                           |
| Gemini       | ACP                           | Session-local MCP settings, initialize and session new/load                                                  | Skipped: CLI not installed                 |
| Qwen         | ACP                           | Session-local MCP settings, initialize and session new/load                                                  | Skipped: CLI not installed                 |
| Qoder        | ACP                           | MCP launch settings, initialize and session new/load                                                         | Passed; model-alias warning noted below    |
| Grok         | ACP                           | Initialize, session new/load and provider configuration                                                      | Passed                                     |
| Kimi         | ACP                           | Initialize, session new/load and subagent integration                                                        | Skipped: authentication missing            |
| Muse         | MSP                           | Serve host, initialize, model-provider lookup and session start/resume                                       | Skipped: CLI not installed                 |
| Antigravity  | Optional managed ACP runtime  | Separate CLI/ACP prerequisites, initialize and session new/load                                              | Passed                                     |
| Command Code | ACP when supported            | MCP mod/config preparation and negotiated runtime support                                                    | Passed                                     |
| Cursor       | ACP or separate SDK worker    | ACP handshake; SDK worker startup, authenticated model catalog and create/resume                             | Passed; separate SDK/GUI timing unmeasured |
| OpenCode     | Pooled HTTP SDK server        | Server acquisition, session create/get and awaited command catalog                                           | Skipped: CLI not installed                 |
| OpenCode 2   | Pooled HTTP V2 server         | Activation/plugin readiness, awaited GUI command/skill/agent catalogs and session create/get                 | Passed                                     |
| Pi           | Native JSON RPC               | MCP extension staging, process spawn, get_state and configuration                                            | Skipped: CLI not installed                 |
| Factory      | ACP                           | Initialize, MCP capability negotiation and session new/load                                                  | Skipped: GUI only                          |
| Devin        | ACP, local or cloud target    | Account/resume identity, optional variant catalog, MCP overlay/relay and configuration                       | Skipped: CLI not installed                 |
| DeepSeek     | ACP, GUI only                 | Initialize and session new/resume; terminal lifecycle coverage cannot qualify this provider                  | Skipped: GUI only                          |

These lifecycle cases check a real terminal create/unload/resume and restoration of the original prompt. Their total test durations include detection, polling and teardown and are not startup latency measurements. All 18 providers have passing unit cases; ten do not have a live terminal qualification on this host. User-configured profiles, arbitrary ACP instances and other providers' GUI runtime variants still need their own live matrix.

Qoder logged a rejected ACP `auto` model setting and a session-close warning while its lifecycle check passed. The same warnings reproduced on unchanged baseline `a05031b6` using `pnpm run test:integration:providers -t qoder` with `PORACODE_LIVE_PROVIDERS_REQUIRED=qoder`: one passed and 54 excluded/skipped, exit 0. This establishes that those warnings predate this change; it does not qualify Qoder's model controls. Evidence: `verification/reverify-qoder-baseline.log` and JSON under the scratch directory above.

Investigate the remaining paths in this order:

1. **Shared critical path:** correlate submit, fetch/send, host receipt, skill preparation, MCP composition/auth/filtering, wrapper preparation, provider create/activate/open and input acceptance. Repeat with the original PR/worktree polling load; the original ingress gap is still unresolved.
2. **Shared skill preparation:** `SkillsService.prepareForLaunch` awaits projection synchronization. `syncProjections` first checks retired copies across provider roots, then scans managed global/project skills even when the selected provider has no projection targets. Measure empty and populated roots, including WSL, before narrowing or caching this work. Required projections and policy changes must be visible before the provider reads them.
3. **Catalog work by runtime family:** the auxiliary wave below removes OpenCode and OpenCode 2 menu discovery from ordinary startup, while retaining catalog readiness for native command dispatch. Cursor SDK model discovery also authenticates and provides parameter definitions; it cannot simply be discarded. Muse's model-provider lookup and Devin's variant mapping need their own measurements.
4. **Qualification matrix:** for each installed/authenticated provider, capture cold/warm first turns, follow-up and resume, GUI/terminal where supported, plain text and explicit skills, MCP selection/filtering, Stop and profile changes. Run latency comparisons separately from full checks. Keep native Windows, WSL, macOS/Linux and remote-host results distinct, and report unavailable cases explicitly.

The auxiliary-work follow-up below implements the measured preparation fixes and optional metadata changes, with separate evidence from the first live comparison.

### Title generation and other auxiliary work

Title generation is shared across thread providers. The helper provider comes from the native/WSL title settings and can differ from the conversation provider: the live comparison used Codex for the conversation and Cursor for its title. `prepareDraftThread` persists the draft and calls `generateTitleAsync`, which returns without awaiting the title. Its continuation applies the title only if the thread still exists and the user has not renamed it. Auto-provider retries are inside that separate title task.

The supervisor also handles requests concurrently (`src/supervisor/index.ts:248`). `GenerationService.withHelperLease` uses a separate `generation-helper` resource class; admission either succeeds or refuses immediately and does not queue an agent behind a helper. Commit/PR generation and context extraction use that same helper service but are not prerequisites of an ordinary new thread. This removes a promise dependency, not resource contention: synchronous helper setup still blocks the supervisor event loop, and helper HTTP requests share the managed host connection pool with foreground requests.

The existing live captures establish actual overlap. Times below are milliseconds from submit except the launch-after-title column; “pending” means no title response headers arrived within that capture. All six conversation replies completed with `OK`.

| Fresh launch      | Launch request after title request | First conversation content | Title response headers | Title still pending at completed reply |
| ----------------- | ---------------------------------- | -------------------------- | ---------------------- | -------------------------------------- |
| Baseline idle     | 3.9                                | 15,000.7                   | 13,366.7               | No                                     |
| Baseline repeat 2 | 1.1                                | 8,144.2                    | 10,169.0               | Yes                                    |
| Baseline repeat 3 | 1.4                                | 6,411.6                    | Pending                | Yes                                    |
| Patched idle      | 2.0                                | 6,580.7                    | Pending                | Yes                                    |
| Patched repeat 2  | 1.3                                | 5,868.7                    | Pending                | Yes                                    |
| Patched repeat 3  | 1.2                                | 5,313.4                    | Pending                | Yes                                    |

Evidence: `.tmp/thread-startup-performance/title-concurrency-evidence.json`, derived from the six original raw captures linked above. The five replies completed before their title responses, so waiting for the generated title cannot explain those launches. The original busy-app ingress gap still requires its own reproduction; a background HTTP request can contribute to connection contention even when its result is never awaited.

An isolated Windows probe then ran the real adapters' title command preparation through `prepareOneShot`, stopping before any provider process or model request. Each cell is the median of three samples; module loading is excluded, runtime shell/binary caches are cold, OS files are warm, and the per-module registry PATH cache is warm after its first use. The probe also scheduled `setImmediate` before preparation and counted synchronous child calls: event-loop delay closely matched the preparation duration.

| Title helper | Baseline cold preparation | Patched cold preparation |
| ------------ | ------------------------- | ------------------------ |
| Cursor       | 91.4 ms                   | 89.9 ms                  |
| Codex        | 883.8 ms                  | 49.0 ms                  |
| Claude       | 48.4 ms                   | 48.0 ms                  |
| Qoder        | 50.8 ms                   | 50.4 ms                  |
| Grok         | 49.0 ms                   | 49.3 ms                  |
| Antigravity  | 48.0 ms                   | 46.4 ms                  |

The Codex helper's cold improvement comes from the first shared shell fix (six synchronous children become one). At that stage, repeated Cursor preparation still performed two synchronous `where.exe` calls against its already absolute `node.exe` path; both failed and command construction retained the supplied path. Its repeat median was 36.4 ms. This probe identified avoidable blocking work but did not reproduce an eight-second stall. Evidence, individual child durations and source hashes: `.tmp/thread-startup-performance/title-preparation-results-2026-10-18T08-03-16.540Z.json`; harness: `title-preparation-benchmark.mjs` in that directory. These are preparation measurements, not title generation or conversation latency benchmarks.

The other shared synchronous path was `stageLaunchFiles`: Windows ran `whoami.exe` and `icacls.exe` before writing private files. Three real invocations with empty dummy configs took 42.3, 35.3 and 36.7 ms, with matching event-loop delay. Only owned temporary directories were created and removed. Claude/Cursor/Qwen/Qoder MCP staging and DeepSeek helper policy staging use this primitive. The asynchronous implementation below retains the permission-before-write dependency. Initial evidence: `.tmp/thread-startup-performance/launch-files-timings.json`.

The runtime-family audit before the auxiliary changes distinguished menu enrichment from configuration that determines what the agent actually runs. The following table records that pre-change state:

| Runtime/provider scope                                                                                          | Work and current launch dependency                                                                                                                                                                                                                                       | Optimization constraint                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared thread creation                                                                                          | Durable metadata is awaited; title completion is not. Project file checkpoints are awaited before initial input; Home skips them. Git/worktree refresh after launch is already detached.                                                                                 | Preserve row ownership and a checkpoint before the agent can edit; measure transport contention separately.                                                                                                           |
| Shared supervisor preparation                                                                                   | Environment priming, skill projection synchronization and selected MCP authorization/filter setup precede provider startup.                                                                                                                                              | Prime is memoized by cwd, hook installation by adapter/environment. Required environment, projections and tool policy must be ready before use; retired-skill scans across unrelated roots remain a profiling target. |
| Codex and profiles                                                                                              | `skills/list` is already detached after initialization. On resume, `thread/goal/get` is awaited before the authoritative thread snapshot, with the RPC's default 30-second timeout. Fresh threads skip the goal call.                                                    | Resume goal hydration is another candidate; fence any late result by session/generation and preserve the awaited activity snapshot. It does not explain the original fresh-thread gap.                                |
| Claude and profiles                                                                                             | Slash-command discovery and context-usage refresh already run in the background. Query initialization, selected controls and MCP synchronization remain on the input path.                                                                                               | Keep permission/model/control application ahead of input; detaching those would change behavior.                                                                                                                      |
| Pi                                                                                                              | `get_commands` runs in the background. `get_state` is awaited to confirm provider session identity.                                                                                                                                                                      | Retain identity/configuration checks before input.                                                                                                                                                                    |
| OpenCode 1                                                                                                      | Both new and resumed `openThread` await `command.list`, even though this session's `startTurn` builds prompt parts and does not consult that catalog.                                                                                                                    | Strong candidate for background menu discovery; late completion must not publish idle status over a running turn or update a disposed/replaced server handle. CLI unavailable here, so no live latency claim.         |
| OpenCode 2                                                                                                      | GUI `openThread` awaits command, skill and agent lists in parallel before session create/get. A failure of any list therefore prevents even a plain text start. Terminal mode skips those three lists.                                                                   | Strong candidate for background menus on plain text; `/compact`, custom commands, `/skill` and `/agent/...` must await the required catalog before local dispatch. Preserve activation and SSE readiness.             |
| Cursor SDK and profiles                                                                                         | Each open awaits `worker.listModels` before worker initialization. ACP uses the shared protocol path instead.                                                                                                                                                            | This lookup authenticates the SDK and supplies model parameter definitions; replacing it with an empty catalog would lose selection semantics. Any reuse needs credential/runtime/config invalidation.                |
| Muse MSP                                                                                                        | A fresh session awaits `model/list` with a 10-second best-effort timeout to derive `providerId`.                                                                                                                                                                         | The route preserves retained-image support; the existing regression covers image routing. Cache/reuse or protocol improvement needs route correctness, rather than dropping the await.                                |
| Devin local/cloud and profiles                                                                                  | Execution account and resume binding are resolved before spawn; explicit model variants require scoped catalog mapping. Cloud utilities refuse unsupported execution.                                                                                                    | Preserve credential/org/config scope and variant controls; do not substitute another account or default route.                                                                                                        |
| Copilot, Gemini, Qwen, Qoder, Grok, Kimi, Factory, DeepSeek, managed Antigravity, Command Code ACP, generic ACP | Shared initialize and session new/load/resume receive model/config options and later command notifications. No separate shared command-menu RPC is awaited there. Fresh terminal handoff may allocate an ACP session ID; terminal resume skips the parallel ACP process. | Protocol/session identity and selected MCP/configuration are required. Profile the handshake and provider implementation; there is no demonstrated menu await to remove in this shared family.                        |

Cursor/Muse/Devin model catalogs remain unchanged because they affect authentication, routing or selected controls. Their reuse needs scope-aware invalidation rather than removing the waits.

### Auxiliary work implementation and comparison

- **Shared executable preparation:** an already absolute Windows `.exe`/`.com` command bypasses redundant `where.exe` resolution. Bare commands and scripts retain existing resolution. This also benefits helper/title preparation without adding provider-specific branches to shared code.
- **Shared private files:** Windows identity and ACL subprocesses run asynchronously. The directory ACL must succeed before any private file is written; failure removes the owned directory. WSL staging is unchanged.
- **OpenCode 1:** fresh/resumed sessions load command menus in the background. Late results preserve the current running/approval/error state and are ignored after disposal, replacement or a newer refresh.
- **OpenCode 2:** GUI command/skill/agent catalogs load alongside session opening. Plain input does not await them; slash input and steering await the current catalog before native command/skill/agent dispatch. Activation, SSE subscription and selected configuration remain required. Recovery retires the old catalog wait, cancels its owned requests and follows the replacement catalog; disposal releases waiters and rejects further dispatch.
- **Codex resume:** goal hydration runs alongside the required activity snapshot. Ordinary input waits only for that snapshot. Goal replacement still waits for existing-goal discovery so it clears the previous goal before setting another. Newer goal notifications, edits, reopen and disposal fence stale snapshots; authoritative goal updates remain visible during resume replay suppression.

The next comparison froze the first-wave implementation before these edits, then alternated three samples of frozen/current code. It is an incremental comparison, not the clean-master comparison above. The machine's child-process timings were higher than in the earlier probe; only paired results from this run are compared.

| Measured component                                         |         Before auxiliary changes |              After | Owner / meaning                                                                                |
| ---------------------------------------------------------- | -------------------------------: | -----------------: | ---------------------------------------------------------------------------------------------- |
| Cursor title preparation, cold runtime                     | 246.4 ms, 3 synchronous children |  123.6 ms, 1 child | Poracode command preparation; remaining bare CLI lookup                                        |
| Cursor title preparation, repeat                           |  61.5 ms, 2 synchronous children | 1.6 ms, 0 children | Shared absolute-executable shortcut                                                            |
| Private-file setup event-loop delay                        |  84.2 ms, 2 synchronous children | 5.1 ms, 0 children | Shared supervisor responsiveness                                                               |
| Private-file setup elapsed time                            |                          84.2 ms |            72.3 ms | Still awaits Windows identity and ACL work; no claim that asynchronous setup removes that work |
| OpenCode 1 open with a scripted 400 ms command catalog     |                         404.1 ms |            0.11 ms | Actual `openThread`, scripted protocol client                                                  |
| OpenCode 2 GUI open with scripted 400 ms parallel catalogs |                         404.8 ms |            0.22 ms | Actual `openThread`; required activation succeeds immediately in this fixture                  |
| Codex resume open with a scripted 400 ms goal read         |                         403.5 ms |            0.16 ms | Actual `openThread`; required activity snapshot succeeds immediately in this fixture           |

Evidence: `.tmp/thread-startup-performance/wave2-title-results.json`, `wave2-launch-files-results.json` and `auxiliary-gates-results.json`, with individual samples and source/bundle hashes. Title and private-file cases use real native command preparation and filesystem/permission subprocesses, without spawning a provider. Catalog/goal cases inject a controlled delay into scripted protocol clients to prove the removed dependency. They do not measure live provider startup, model latency or an additional end-to-end speedup. Other title helper providers retained their one bare-command lookup; this change does not claim a gain for them.

This wave changes process-local scheduling only. No persisted data, cache format, public wire contract or deployed helper format changes, so the versioning audit requires no version bump or migration. Existing settings, saved sessions and helper artifacts retain their interpretation.

## Review

### Scope reviewed

Two independent read-only reviews covered the runtime/skill contract and account boundaries, Windows shell selection, regression coverage, compatibility, and simplification. The review base is the master commit above.

Two targeted read-only reviews subsequently checked the integration skip-reporting delta for behavior, proof, minimality and truthful reporting; neither found an issue.

The auxiliary wave used three independent read-only reviewers: shared preparation plus efficiency across all additions, OpenCode catalog lifecycle/dispatch, and Codex resume goal lifecycle/UI. Two targeted rereviews checked the lifecycle fixes below and returned no findings.

### Fixed

- Deferred native metadata originally reselected the current registry adapter. A profile edit could therefore mix another account's plugin paths into a live session. The lookup now uses the session's captured adapter; regressions replace adapter A with B before skill follow-up/restart and require A's inventory only. The account-boundary fix received a targeted second review.
- Removed the obsolete catalog-based internal PowerShell selector and its superseded test after replacing its last production caller.
- Two OpenCode integration cases returned without assertions when their CLI prerequisites were unavailable, incorrectly reporting passes. Those same availability exits now call Vitest's explicit skip API. Installed-provider assertions and production behavior are unchanged.
- **Important, lifecycle** (`src/supervisor/agents/opencode2/session.ts:549`): a command could stay attached to a retired catalog request after server recovery. Refresh retirement now wakes existing waiters and aborts owned discovery. Regression dispatches using the new server before the old catalog resolves and also covers disposal during discovery.
- **Important, lifecycle/UI** (`src/supervisor/agents/codex/acp.ts:1474`): a new goal notification could fence the old snapshot while resume replay suppression also discarded the new notification. Goal notifications now pass through that suppression; regressions assert the current goal actually renders during and just after the required snapshot.
- **Important, behavior compatibility** (`src/supervisor/agents/codex/acp.ts:448`): an early goal replacement could omit clearing an existing resumed goal before its metadata arrived. Only replacement waits for pending goal discovery; delayed existing/absent goal tests assert the exact clear/set sequence. Direct goal edits also fence stale hydration.

### Rejected after validation

- Reverse PATH traversal is intentional compatibility: the existing executable resolver chooses the last non-alias match. The fast selector preserves that ordering.

### Deferred major or dangerous refactors

None.

### Verification

The following first-wave checks precede the auxiliary implementation; its final checks are recorded separately below.

- Focused shell/runtime, plain launch, native profile discovery, SkillsService and skill follow-up/restart regressions passed during implementation.
- The initial title/helper and provider-family audit reran 13 existing test files covering renderer title generation and launch, supervisor generation and one-shots, and Codex/Claude/Pi/OpenCode/OpenCode 2/Cursor/Muse sessions: **303 passed, zero failures**, in 15.44 seconds with two workers. Evidence: `verification/title-provider-audit.log` and JSON. This audit preceded the auxiliary implementation.
- Full `pnpm run fmt:check`, `pnpm run lint`, `pnpm run typecheck` and `pnpm run architecture:check` passed again; formatting covered 6,291 files and architecture checks include 19 tests. Format/lint/typecheck were also rerun after the integration reporting corrections.
- The clean full rerun, `pnpm run test --maxWorkers=4 --reporter=verbose --reporter=json --outputFile.json=.tmp/thread-startup-performance/verification/reverify-unit.json`, passed: **24,925 passed, 208 skipped, zero failures**, across 2,190 files (2,168 passed, 22 skipped), in 1,253.81 seconds. No builds or live provider checks ran concurrently. Passing cases exist under every one of the 18 built-in provider folders, plus shared ACP and generic ACP tests. This full run preceded the two integration-only reporting edits; the hermetic suite excludes those files, which are exercised separately by the integration command.
- Earlier under-load attempts included an interrupted run and a completed two-worker run with one five-second CLI-child timeout. The complete 75-test `SubagentRunManager.test.ts` file subsequently passed on baseline and patched source, and that child case also passed in the clean full rerun above. No timeout or assertion was weakened. Earlier logs and the clean `reverify-unit.log`/JSON remain under `.tmp/thread-startup-performance/verification/`.
- The final `pnpm run test:integration:providers --reporter=verbose --reporter=json --outputFile.json=.tmp/thread-startup-performance/verification/reverify-providers-final.json` with `PORACODE_LIVE_PROVIDERS_REQUIRED=codex` passed: **28 passed, 27 skipped, zero failures**, across nine files (four passed, five skipped), in 270.38 seconds. The passing cases comprise eight real provider lifecycle checks, six Crossagents checks and 14 strict-gate helper tests. The two absent-OpenCode cases now correctly appear skipped. Ten lifecycle providers did not qualify, for the reasons in the table above; Codex could not silently skip. Final evidence: `verification/reverify-providers-final.log` and JSON under the scratch directory. The initial re-verification report (`reverify-providers.log`/JSON) is retained to show the two former false passes.
- Managed live GUI checks passed all eight turns (three fresh launches and one follow-up per version), with zero capture errors. Both exact managed sessions reported `stop:ok` after evidence capture.

#### Auxiliary-wave verification

- Full `pnpm run typecheck`, `pnpm run lint`, `pnpm run fmt:check` and `pnpm run architecture:check` passed on the final implementation; architecture checks include 19 tests and formatting covers 6,291 files. `git diff --check` passed. All 21 changed TypeScript files still match the verification-run hashes after the live checks. Evidence: `verification/wave2-typecheck.log`, `wave2-lint.log`, `wave2-fmt-final.log`, `wave2-architecture-check.log` and `wave2-verified-sources.json`.
- `pnpm exec vitest run src/supervisor/agents/base/launchFiles.test.ts src/supervisor/agents/base.windows-path.test.ts src/supervisor/agents/codex/threadResume.test.ts src/supervisor/agents/codex/codex.test.ts src/supervisor/agents/opencode/sdkSession.test.ts src/supervisor/agents/opencode2/session.test.ts --maxWorkers=2` passed: **276 passed, one platform skip, zero failures**, across six files. These cover stalled catalogs, plain/native input, steering, approval/error preservation, replacement/disposal, delayed goals and permission-before-write behavior. Evidence: `verification/wave2-focused-final.log` and JSON.
- `pnpm run test --maxWorkers=4 --reporter=dot --reporter=json --outputFile.json=.tmp/thread-startup-performance/verification/wave2-unit.json` passed: **24,960 passed, 208 skipped, zero failures**, across **2,190 files** (2,168 passed, 22 skipped), in **1,116.16 seconds**. Builds and live provider checks did not run concurrently. This adds 35 passing regression cases to the first-wave tree.
- Passing unit cases exist under every built-in provider folder, including the unavailable live CLIs. The exact 18-provider counts are retained in `verification/wave2-provider-unit-coverage.json`; this proves hermetic coverage, not a live connection or every provider feature. `verification/wave2-verified-sources.json` records the source hashes for this verification run.
- `PORACODE_LIVE_PROVIDERS_REQUIRED=codex,opencode2 pnpm run test:integration:providers --reporter=verbose --reporter=json --outputFile.json=.tmp/thread-startup-performance/verification/wave2-providers.json` passed: **28 passed, 27 skipped, zero failures**, across nine files (four passed, five skipped), in **313.35 seconds**. Eight real terminal create/unload/resume cases passed: Claude, Codex, Qoder, Grok, Antigravity, Command Code, Cursor and OpenCode 2. The remaining passes are six Crossagents cases and 14 strict-gate helper tests. Codex and OpenCode 2 were mandatory; unavailable and opt-in cases remain explicitly skipped. The terminal result does not qualify the new GUI catalog path, which is checked separately.
- `node .agents/skills/interactive-testing/scripts/run-poracode-smoke.mjs --scope changed --mode mock --root C:\Users\sdsle\.poracode-smoke\thread-startup-wave2-mock-20261018-a` passed welcome dismissal, baseline, Everything search and all three relevant mock integration gates, with **zero console/runtime errors**. The runner stopped its owned app; its retained session is `stopped`. Evidence: that root's `artifacts/smoke-report.json` and two inspected screenshots, plus `verification/wave2-mock-smoke.log`. The seeded legacy fixture was promoted through the production owned-root preparation API before Electron started. The initial wrapper attempt supplied unsupported `--base` and was rejected before launch; the successful wrapper used its default `HEAD`, which is the recorded base commit.
- A separate frozen **real** managed Electron app used the final source at `C:\Users\sdsle\.poracode-smoke\thread-startup-wave2-real-20261018-a`. Its automated welcome/baseline/Everything-search checks passed with zero console/runtime errors. That smoke report exited 2 because its three broad manual gates were not acknowledged; it is not an all-gates pass. The focused interactions below provide narrower live evidence. Evidence: `artifacts/automated/smoke-report.json` in that root and `verification/wave2-real-automated.log`.
- **Codex GUI:** a fresh `Reply OK` and a second `Reply OK` after explicit unload/resume both completed with `OK`, preserving provider session `01a14e4f-934d-73d3-b9c0-c532f9bbde10`. Captures recorded zero renderer/runtime errors. Evidence: `artifacts/codex-fresh-live.json`, `codex-resume.json` and the inspected `codex-resumed.png`. Two earlier capture attempts stopped at the native-input guard because the effort popover made the composer inert; neither launched a provider request. Closing that popover allowed the checks to proceed.
- **OpenCode 2 GUI:** ordinary input opened real sessions, but `opencode-go/deepseek-v4.1-flash` returned `Invalid credential` and `opencode/beam-free` returned `Reconnect OpenCode Console to continue.` These captures have no renderer exceptions, but neither is a successful model reply. Native `/agent/plan` and `/agent/build` then changed the session mode correctly. After explicit unload/resume, another `/agent/plan` completed and preserved provider session `ses_eb1accbfcffeIWes5BevfCYdiT`, proving catalog-dependent native dispatch across resume without requiring model credentials. Evidence: `artifacts/opencode2-fresh.json`, `opencode2-free.json`, `opencode2-native-build.json`, `opencode2-native-resume-final.json` and inspected screenshots. Custom commands, skill execution and steering have hermetic coverage; they were not qualified live.
- The real managed launcher exceeded its initial attach deadlines while compiling/staging its isolated test runtime, before Electron existed. The original owner subsequently reached READY; no duplicate launch or product timeout change was used. The seeded fixture was promoted with the production owned-root API. A test-owned Kimi login pane appeared during discovery/setup and was closed without completing sign-in. No credential repair was attempted.
- The frozen real runtime passed `verify-runtime` after the live interactions: artifact SHA-256 `bf25470b3c25580356210ac27e702460110126d6dbf659a51f6b1dcea4d0bed3`, 90,123 files. The driven UI reset to baseline, and its owner stopped the app with `stop:ok`; the retained session is `stopped`. Evidence: `verification/wave2-real-runtime.log`, `wave2-real-reset.log` and `wave2-real-stop.log`.

### Blocked or unverified

The OpenCode live check also exposed an intermittent shared command-menu display problem. The supervisor snapshot contains the command catalog and runtime updates can restore it, but a subsequent durable managed-root catalog row can erase it. `src/host/db/rowMappers.ts:137` omits `slashCommands`, and `src/renderer/state/managedRootCatalog/rootCatalogRows.ts:139` carries session controls but not commands when replacing the resident row. Both paths are identical to clean baseline; the previous awaited discovery published through the same runtime path. The exact refresh that erased the live row was not captured. This existing issue is separate from the startup changes and remains unchanged. Native dispatch above succeeds using the provider session's catalog; reliable menu retention is not claimed. Evidence: `artifacts/opencode2-catalog-ui.json` and the inspected screenshot in the real managed root.

The original 7.759-second client/ingress gap remains unattributed because the original busy-app condition was not reproduced. OpenCode model replies require provider reconnection; OpenCode 1 is not installed. No Linux/macOS runtime timing, installed-package latency or complete live GUI qualification of every provider is claimed. Evidence was captured on `perf/thread-startup-performance`; the installed Nightly was unchanged during verification.
