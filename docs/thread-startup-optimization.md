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

## Other-provider startup investigation, 2026-10-18

This follow-up uses merged master `a5974a2cd967fc05c2eab2c36d1dc24fc6f3e8a2` on `perf/provider-startup-investigation`. The initial investigation below changed no product code; the subsequent sequential plan records the new shared scheduling change. The earlier comparison above remains the before/after result for the merged optimizations; the measurements below are a new diagnostic baseline.

### Measurement method and limits

An ignored probe runs the actual `SupervisorRuntime`, launch pipeline, adapters, installed providers and canonical runtime events. Each provider has two serial fresh-launch samples and two same-session follow-ups using `Reply OK`. Claude and Cursor ACP also have one explicit unload/resume check. **All 34 turns completed with the exact assistant marker `OK`.** Detection happens before the timed launch and is reported separately. No unit suite or application build ran during the samples.

The probe times owned runtime methods and ACP RPCs, recording names, durations, canonical event kinds and marker results. It records no prompts beyond the test marker, response bodies, credentials, environment values or RPC payloads. A narrow instrumentation transform additionally times the unchanged project-shell preparation call in the second sample. Nested spans overlap and must not be summed. Source remains unchanged on disk.

These are Windows backend measurements with isolated default Poracode settings, the disposable project and existing native provider credentials. Antigravity uses the existing public managed-ACP installation configuration, without copying credentials. Renderer transport, file checkpoints and title generation are outside these backend timings. Different selected models and Auto routing limit cross-provider comparisons. Two samples establish observed phases and variation, not a population percentile or an upstream SLA. Provider initialization and response time are not split into CPU, network and model inference.

Evidence lives under `.tmp/thread-startup-performance/verification/`: `provider-<label>-<sample>.json`, `providers-investigation-summary.json` (all 34 turns, ranges and spans), and `providers-investigation-table.md`. The ignored probe/build/summarizer scripts are in the parent directory. Initial Cursor SDK fixture attempts are retained separately as invalid helper-location/raw-settings attempts and are excluded from all timing summaries; the standalone Node probe cannot unseal the desktop profile's protected credentials.

### Timings and ownership

All numbers below are seconds, medians of the two fresh samples. First content and reply are cumulative from `startThread`; the setup columns are individual durations. First content means the first canonical assistant/reasoning text event. Providers that emit text late can make this close to full completion. Claude starts its SDK query during open and continues initialization after that promise returns, so its near-zero Activate value does not mean free provider initialization.

| Provider / version                  | Model                             | Poracode before provider creation | Adapter creation | Activate / initialize | Open session | First content | Complete `OK` | Follow-up `OK` |
| ----------------------------------- | --------------------------------- | --------------------------------: | ---------------: | --------------------: | -----------: | ------------: | ------------: | -------------: |
| Claude 2.1.302                      | `haiku`                           |                             0.577 |           <0.001 |                <0.001 |        0.147 |         3.511 |         3.686 |          2.153 |
| Cursor ACP 2026.10.16-e3cb207       | `auto`                            |                             0.561 |            0.104 |                 0.607 |        5.990 |         9.929 |        13.475 |          2.356 |
| DeepSeek 0.2.1-rc.2                 | account `deepseek-flash`          |                             0.761 |            0.112 |                 4.693 |        0.510 |         7.523 |         7.570 |          1.461 |
| Factory 0.242.1                     | `auto`                            |                             0.601 |            0.082 |                 0.894 |        0.752 |         7.753 |         7.823 |          3.363 |
| Grok 1.0.60                         | `grok-4.7`                        |                             0.530 |            0.099 |                 0.212 |        0.514 |         3.846 |         4.475 |          2.647 |
| Qoder 1.1.73                        | advertised `qfmodel`              |                             0.553 |            0.100 |                 1.837 |        3.134 |         8.564 |         9.085 |          1.954 |
| CommandCode 1.82.4                  | `deepseek/deepseek-v4-flash-fast` |                             0.554 |            0.100 |                 1.610 |        0.215 |         5.901 |         5.949 |          1.836 |
| Antigravity CLI 1.4.1 + managed ACP | `gemini-4-argon`                  |                             0.591 |            0.005 |                 8.451 |        3.884 |        21.447 |        21.577 |          5.732 |

| Phase                             | Who performs it                                                                            | Measured detail / implication                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before provider creation          | Shared Poracode pipeline                                                                   | Plugin contributions, project environment, skill projection and MCP setup. Fresh-sample medians above are 0.530–0.761 s.                                                                                                                                                                     |
| Project environment               | Poracode starts PowerShell; the user's profile builds the environment                      | Directly timed second samples: **454–544 ms**. `primeWindowsProjectShellEnv` caches the promise by native project cwd. It is not repeated for every same-project turn. A new probe process intentionally begins with an empty in-memory cache.                                               |
| Skill preparation                 | Shared `SkillsService`                                                                     | **17–104 ms** across fresh samples, including the scan for retired projections in other providers' roots. This is measurable repeated work, but it did not cause the multi-second waits here.                                                                                                |
| Adapter creation                  | Provider-owned Poracode adapter                                                            | Builds the command/environment and structured handle; typically around 0.1 s for ACP providers in this run.                                                                                                                                                                                  |
| Activate / initialize             | Poracode sends ACP initialize; the provider process loads and responds                     | DeepSeek: **3.30–6.08 s**; Antigravity: **7.93–8.97 s**. The current evidence locates the wait at that RPC boundary, not inside a named provider-internal function.                                                                                                                          |
| Session creation                  | Provider process answering `session/new`                                                   | Cursor: **4.087–4.089 s**; Qoder: **2.906–3.116 s**; Antigravity: **3.746–4.011 s**.                                                                                                                                                                                                         |
| Model configuration               | Shared Poracode ACP synchronizer requests the selected native value; provider processes it | Cursor: **1.873–1.917 s** in `session/set_config_option`. The second sample records `alreadyCurrent: false`; the requested value differs from the retained native value. Deleting this write would risk a different selection. Qoder and CommandCode also recorded a differing native value. |
| First content / reply after setup | Provider runtime, remote services and model                                                | Includes deferred initialization where applicable. The probe cannot assign all of this residual time to model inference. Cursor full replies varied **10.71–16.24 s**, while its session-creation time was stable.                                                                           |
| Detection, outside timed launches | Poracode adapter performs availability, auth and capability probes                         | Cursor **30.90–31.07 s**, CommandCode **29.54–31.61 s**, Antigravity **15.35–16.26 s**, Qoder **8.48–9.48 s**; other successful rows **3.98–6.99 s**. These are fresh detection measurements, not evidence that every user prompt awaits detection.                                          |

The explicit resume samples also completed `OK`: Claude backend open/dispatch **42 ms**, complete reply **2.77 s**; Cursor ACP open/dispatch **5.40 s**, complete reply **8.06 s**. Both reused their provider session references.

### Documentation and remaining optimization targets

Cursor's [official ACP request flow](https://cursor.com/docs/cli/acp#request-flow) places initialization and session creation before prompting. The [ACP configuration contract](https://agentclientprotocol.com/protocol/v1/session-config-options) makes the provider's current values and complete setter reply authoritative. Those required operations should stay ordered; a slow RPC alone does not prove redundant work.

1. **Check whether Cursor SDK account metadata actually blocks startup.** `sdkSession.ts:371` awaits `worker.listModels`; `sdkWorker.ts:365` then awaits `probeCursorSdkAccountEmail`. The follow-up below found that its object-only guard skips the installed SDK's class export, so the visible await does not establish a live identity request. The [official SDK reference](https://cursor.com/docs/sdk/typescript) documents identity separately from account-specific model/parameter discovery. No live milliseconds saved are claimed.
2. **Investigate redundant Cursor SDK catalog fetches with the real credential context.** In installed SDK **1.0.38**, the public `Cursor.models.list()` creates a client and calls `/v1/models`; explicit-model `Agent.create()` performs local selection validation through a separate local-model cache. Poracode calls the former before the latter. The next experiment should count actual requests in one authenticated worker. Reuse must be scoped to the captured account, credential generation and SDK version, with stale-selection recovery. Do not depend on the SDK's private test override for model catalogs. The [official model-parameter documentation](https://cursor.com/docs/sdk/typescript#model-parameters) requires account-specific discovery; skipping validation is not the proposed optimization.
3. **Trace native provider initialization before adding prewarming.** DeepSeek and Antigravity are the largest measured handshake waits; Cursor and Qoder spend seconds creating sessions. Instrument the owned child process and provider diagnostics to separate module loading, local scanning and remote calls. A generic pool would introduce account, cwd, MCP and disposal ownership requirements; this investigation does not justify building one.
4. **Shared preparation is a smaller follow-up.** Windows project environment acquisition must finish before spawning a process that needs it, but independent filesystem preparation could overlap it after dependency checks. The retired-projection scan could run once per environment/projection generation with correct invalidation while selected-provider projection stays awaited. Expected savings from the observed skill work are tens of milliseconds. Preserve external skill changes, projection policy and retirement cleanup.
5. **Keep discovery outside ordinary send admission.** Fresh detection itself is expensive for Cursor and CommandCode. Audit joins against cached discovery, cancellation and refresh ownership before adding caches. The measurements here do not show that ordinary sends await those entire detection sweeps.

The previous shared async title-generation and OpenCode/Codex auxiliary changes remain applicable. This investigation found no new evidence that title generation blocks the first prompt.

### Live UI evidence and incomplete providers

The managed real Electron snapshot at `C:\Users\sdsle\.poracode-smoke\provider-startup-investigation-20261018-a` uses the same source revision and an unchanged frozen runtime. A native composer submit of `Reply OK` through Claude/Haiku completed and visibly rendered `OK`, with **zero renderer console/runtime errors** in the capture. Screenshots were inspected. This UI control used the renderer's normalized `ultracode`/400k configuration and built-in crossagent MCP, so it is separate from the plain backend samples. Evidence: `artifacts/claude-ui-live.json`, `claude-before.png` and `claude-after.png`. The frozen runtime passed `verify-runtime` with artifact SHA-256 `7e85ad31513fa1413b09453388f10bef5d421ed12bb4cda0278a625a668ae173`, 90,123 files. Cold build/staging took 575 s before readiness and is excluded from all provider timings.

| Provider / surface                                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cursor SDK profile                                            | A separate labelled Home test through app-controls on installed Nightly **2.0.0-nightly.202610171809**, using `default` with inherited `max` effort, ended in an error after **3.434 s**, with no assistant reply. Thread `67877765-e116-426f-aee6-6fe17c93db8e` is retained for inspection. This is not a successful latency sample and is not the merged-source backend environment. The recorded transcript/get-thread response does not expose the startup error cause; no authentication failure or fix is claimed. |
| Copilot 1.0.98                                                | Fresh detection reports installed/authenticated but advertises no models. No valid model reply timing was collected.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Gemini                                                        | Fresh native detection reports unavailable, despite the older cached installed inventory.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Kimi                                                          | Installed with missing authentication; no sign-in or model request attempted.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| OpenCode 2                                                    | Earlier real GUI checks in this report were blocked on provider-route credentials/reconnection. No new successful latency sample.                                                                                                                                                                                                                                                                                                                                                                                        |
| OpenCode 1, Devin, Muse, Qwen, Pi                             | Managed-app native discovery reports not installed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Claude account profiles                                       | Share the measured Claude SDK path; their separate account backends were not qualified live.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Linux, macOS, WSL, remote hosts, every provider's terminal UI | Not measured by this follow-up.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

These results support focusing next on native handshake/session waits and the SDK's optional metadata dependency. They do not reproduce or attribute the original 7.759-second busy-app ingress gap, and they do not establish a new before/after speedup.

Initial investigation verification: all 34 backend turns have canonical `turn.completed` state `completed`, with no recorded runtime-disposal errors. The managed UI reset and owner stop completed (`stop:ok`, retained session `stopped`), and no probe process remained. Touched-document formatting, `pnpm run lint`, `pnpm run typecheck` and `git diff --check` passed. At that point only this report changed in tracked source; no product change or publication was made. Logs: `providers-investigation-{runtime,reset,stop,lint,typecheck}.log` in the verification directory.

### Sequential implementation plan

Work through these items in order. Validate each change before starting the next;
retain required authentication, model selection and process-environment barriers.

| Order | Work                                                                     | Completion check                                                                                                               | Status                              |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| 1     | Check Cursor SDK account-display lookup on the startup path.             | Verify the installed export and whether the helper calls it before adding a protocol change.                                   | Ruled out for installed SDK         |
| 2     | Count Cursor SDK model-catalog requests and inspect safe reuse.          | Account-specific validation remains intact; implement only a supported reduction with evidence, otherwise record why it stays. | Confirmed; retain validation        |
| 3     | Trace the slow native DeepSeek, Antigravity, Cursor ACP and Qoder calls. | Identify the process/function boundary and any avoidable Poracode wait; compare changed behavior with the recorded baseline.   | Profiled; no safe shared cache gain |
| 4     | Check shared environment/skill preparation dependencies.                 | Overlap independent work only; verify required launch inputs, failure handling and measured timing.                            | Implemented; focused checks pass    |
| 5     | Check discovery-refresh joins against ordinary sends.                    | Confirm cached admission and refresh ownership with focused regression evidence; fix a blocking join only if found.            | Verified; no blocking join found    |

After the ordered items, review the complete diff and run the required final
checks. Live provider/network timings and controlled fixture timings are reported
separately. This wave remains uncommitted until publication is requested.

Items 1–2 evidence: `verification/cursor-sdk-catalog-audit.json` uses the installed
unmodified SDK 1.0.38 with an explicit dummy API key and all HTTP intercepted
locally. Its `Cursor` export is a function; the identity helper returns without
calling `me` (`identityCalls: 0`). An attempted separation regression exposed this
guard, so the proposed flag/protocol changes were discarded. This also identifies
an existing account-display issue; no account-identity fix or latency gain is
claimed here.

The same audit observes an API-key exchange, then two `GET /v1/models` calls:
one from public `Cursor.models.list()`, another from `Agent.create()` model
validation. It deliberately rejects the second call before creating an agent.
The SDK's public configuration exposes no model-catalog seeding option; its
platform cache is private. Poracode's first lookup maps current account-specific
parameters, Max Mode and retired-model fallback. Removing it changes behavior,
and patching the SDK or intercepting production HTTP would add an unsupported
dependency. Retain both for now. This proves the request sequence, not its live
network cost or a successful authenticated run.

Item 3 uses direct installed ACP commands in owned fixture directories, without
Poracode or a model prompt. The three Node CPU profiles include profiler overhead
and disabled compile cache; they are diagnostic samples, not comparisons with the
earlier full-runtime baseline. `verification/native-cpu-summary.json` records
sampled stacks, and `native-startup/*/timings.json` records RPC boundaries.

| Provider        | Direct diagnostic result                                                 | Attributed work / remaining limit                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DeepSeek        | Initialize 8.006 s; session creation 0.565 s under profiling.            | Of 8.514 s sampled, `lstat` takes 1.831 s, module existence checks 1.141 s, reads 0.631 s and ESM compilation 0.561 s. The largest stacks run through the provider's `canonicalPath` → `compileResolution` → `ResolutionRouter` → `installRuntimeInterception` in `@deepseek-ai/dsh-app-boot`. |
| Qoder           | Initialize 3.976 s; session creation 3.628 s under profiling.            | Of 7.458 s sampled, 2.784 s is idle; the bundle's export-copy helper `QJr` accounts for 1.280 s and ESM compilation 0.679 s. Idle samples do not distinguish network from other asynchronous waits.                                                                                            |
| Cursor ACP      | Initialize 1.723 s; session creation 3.909 s under profiling.            | 3.432 s of sampled time is idle. Its Windows launcher already sets Node compile cache. The earlier model setter changes a different native current value and remains required.                                                                                                                 |
| Antigravity ACP | Initialize 20.139 s; session creation 5.014 s without the Node profiler. | Both waits reproduce directly in the installed native executable. Internal functions remain unattributed; the Node profiler cannot instrument this binary. These are separate samples with substantial variability from the earlier 8–9 s initialization.                                      |

`verification/native-compile-cache-comparison.json` contains 14 successful real
initialize-only launches: one cache-populating launch plus three alternating
disabled/warm pairs per provider. DeepSeek disabled/warm medians are 6.355/9.837 s;
Qoder 4.190/3.672 s, with ranges 3.018–6.480/2.262–4.196 s and one pair effectively
unchanged. No general cache change is justified by these noisy results. Node's
[compile-cache documentation](https://nodejs.org/api/module.html#modulecompilecache)
also distinguishes cached compilation from application initialization; it cannot
remove the observed path-resolution or export-initialization work. Required ACP
ordering stays intact. One incorrect Cursor CLI-flag attempt timed out and is
excluded; the valid profile uses the adapter's `acp` subcommand.

Item 4 changes the shared spawn pipeline to await shell-environment acquisition
and skill projection together. Native skill paths use the explicit project/home
locations and process environment; shell acquisition populates a separate
per-project environment cache. Neither needs the other's result. Both still
finish before MCP authorization and provider creation. WSL retains its existing
skill preparation path without a native shell probe. No projection-scan cache is
added: current launch work still sees external edits and removes retired copies.

| Comparison                                                                                      | Before     | After            | Meaning                                                                                                                                |
| ----------------------------------------------------------------------------------------------- | ---------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Controlled real manager, 450 ms shell + 80 ms skills, median of 3 alternating pairs             | 545.240 ms | 464.880 ms       | About 80 ms of serialized waiting removed. These are injected task durations, not live provider latency.                               |
| Real native shell/profile + filesystem preparation, median of 3 alternating fresh-process pairs | 959.658 ms | 942.118 ms       | Observed 17.540 ms difference; wide shell variation (after includes a 1.189 s shell probe) prevents a stable end-to-end speedup claim. |
| Real native skill time overlapping shell work                                                   | 0 ms       | 80.995–98.637 ms | Every after sample finishes all skill work while the shell probe is pending.                                                           |

Evidence: `verification/shared-preparation-controlled.json` and
`shared-preparation-native.json`. Native runs use the actual `SupervisorRuntime`
and `SkillsService`, followed by a fixture provider handle, and do not measure
Electron rendering or model output. Build records identify the base/current
pipeline hashes; unchanged staged resources come from the retained stopped owned
runtime. Focused verification: 122 tests pass across five manager/pipeline suites,
both lint passes and project typecheck pass. Existing GUI/terminal authorization
tests now exercise both completion orders; new failure cases prove neither
preparation failure spawns a provider or leaks an admission slot. This changes
in-process scheduling only: no persisted/wire/helper shape changes or version bump
is needed.

Item 5: `ipcHandlers.ts` routes start/send directly to the thread manager, whose
ordinary admission and spawn paths do not await provider detection. Status reads
return the accepted cache/readiness view and launch discovery in the background
(`agentStatusService.ts:414`); only explicit refresh/install/login operations join
the detection queue. Registry polls preserve unchanged adapter instances and their
account/runtime state. Host automation awaits accepted-status reads for permission
selection (and slash-command title parsing), not fresh model generation or a
discovery sweep. The readiness tests hold other native/WSL detectors pending while
accepted reads finish; cancellation/publication tests exercise superseded owners.
All 76 focused tests pass across six status/registry/host-launch suites. No new
cache or refresh change is needed. Background discovery can still consume CPU/I/O;
this audit rules out a promise dependency, not all resource contention.

The supervisor IPC dispatcher starts each request independently with
`void handleRequest(request)` (`src/supervisor/index.ts:248`); there is no global
request queue joining an explicit refresh before a later start request. The usage
auto-refresh loop schedules its first tick with the configured cadence, floored
at two minutes (`src/supervisor/runtime/usageService.ts:470`), rather than fetching
all usage immediately during runtime construction. Neither is an additional
startup barrier. Model-title generation remains asynchronous as established in
the merged wave.

### Sequential plan review and verification

Two independent read-only reviews checked preparation dependencies, launch and
disposal ownership, efficiency, regression tests, evidence and versioning. Both
reported no findings. The retained product diff is confined to the shared
preparation barrier and its existing workspace-scope test file; the proposed SDK
protocol change and broad compile-cache change were not retained.

Full `pnpm run fmt:check` (6,291 files), `pnpm run lint` (ordinary and type-aware)
and `pnpm run typecheck` passed. The five preparation/lifecycle suites passed
122 tests, and the six discovery/launch suites passed 76 tests. Logs are
`verification/plan-final-{format,lint,typecheck}.log`, `step4-tests.log` and
`step5-tests.log`.

The default-concurrency full unit attempt was stopped after memory pressure and
timing failures; only its verified test-owned process tree was stopped. The
complete bounded rerun, `pnpm run test --maxWorkers 2`, finished in 2,140.46 s:
**24,967 passed, 208 skipped, three failed**, across 2,190 files (2,165 passed,
22 skipped, three failed). The failures were a 15 s native-binding generator
timeout, HTTP 502 from the relay test using local link address `169.254.83.107`,
and a 30.532 s `realpathSync.native` lookup of the slug fixture
`\\wsl$\Ubuntu\home\user\proj`. No timeout, assertion or path canonicalization was
weakened. Removing realpath resolution would change CommandCode's transcript
directory contract and is not justified by a fake-path test.

The exact three cases then passed on the unchanged merged-master revision
`a5974a2` (4.58 s) and current source (3.90 s), with two workers and the same name
filter. Each run reports three passed and 100 filtered-out cases; these are
targeted reruns, not clean full-suite results. An earlier baseline check also
passed all 82 tests in four timing-sensitive files from the interrupted attempt.
The failure causes were not reproduced in isolation, so they are not labelled
confirmed pre-existing defects. The full gate remains qualified by those three
transient failures. Evidence: `plan-final-tests.log`,
`plan-final-tests-bounded.log`, `plan-base-timing-tests.log`,
`plan-base-remaining-failures.log` and `plan-current-remaining-failures.log` under
`verification/`.

`PORACODE_LIVE_PROVIDERS_REQUIRED=codex pnpm run test:integration:providers`
passed in 253.48 s: **28 passed, 27 skipped, zero failures**, across nine files
(four passed, five skipped). All eight qualifying real terminal create/unload/
resume cases passed: Claude, Codex, Qoder, Grok, Antigravity, CommandCode, Cursor
and OpenCode 2. The other passes are six Crossagents checks, including a real
Claude child turn, and 14 strict-gate helper tests. Codex was mandatory and could
not silently skip. Unavailable, unauthenticated, no-model, no-terminal and opt-in
cases remain explicit skips; those are not live qualification. This lifecycle
suite checks prompt preservation, not successful model replies for every case.
Evidence: `verification/plan-providers-integration.log` and JSON.

The serial current-source structured backend check also passed **20/20 exact
`OK` replies across nine providers**: Claude, Cursor ACP, DeepSeek, Factory,
Grok, Qoder, CommandCode, Antigravity ACP and Codex. Each has a fresh launch and
same-session follow-up; Claude and Cursor additionally close and resume the
original provider session. All 20 canonical `turn.completed` events have state
`completed`, with no recorded runtime-disposal errors. The probe's pipeline hash
matches the tested source. Evidence: `verification/post-plan-providers-summary.json`,
`post-plan-<label>.json` and `post-plan-providers.log`.

These checks use the actual current `SupervisorRuntime` and installed providers,
isolated settings/namespaces and the retained unchanged helper resources from the
stopped owned Electron snapshot. They exclude renderer transport, checkpoint and
title work; they are functional checks rather than a new full-app before/after
latency comparison. No probe process remained in the final inventory. The
current scheduling change was not built into or driven through a new managed
Electron app, and the installed Nightly was not updated. No Linux/macOS/WSL or
remote-host qualification is claimed. The original busy-app 7.759 s ingress gap
remains unattributed. All five plan items are complete; this wave remains
uncommitted and unpublished.

### Under-ten-second follow-up: startup and prompt processing

The benchmark now separates **submit to `session/prompt` dispatch** from
**prompt dispatch to first nonempty assistant/reasoning delta**. The former
excludes model inference; the latter includes all provider prompt processing,
including any deferred initialization. Neither is response-completion time.
Total submit-to-first-content remains visible. Fast models are selected only
inside disposable probes; user model defaults and saved thread configs are not
changed.

These serial probes use the actual current supervisor and installed providers,
with fresh native processes, isolated settings and a read-only `Reply OK`
prompt. Discovery runs before the timer, consistent with the cached-status
admission path audited above. Renderer delivery, host transport, title generation
and checkpoint work are excluded. Cursor and Antigravity comparisons alternate
three before/after pairs, changing only the respective adapter source back to
`a5974a2` in the before bundle. Both bundles retain the same current shared
pipeline. Native Antigravity ACP is the installed **1.4.1 executable**; discovery's
1.4.2 version belongs to the separate `agy` CLI.

| Provider / model                   | Before startup | Current startup | Current prompt to first content | Current total to first content | Samples                    |
| ---------------------------------- | -------------- | --------------- | ------------------------------- | ------------------------------ | -------------------------- |
| Cursor ACP / GPT-5.4 Nano          | 6.743 s        | 5.177 s         | 1.825 s                         | 7.026 s                        | Three alternating pairs    |
| Antigravity ACP / Gemini 3.8 Flash | 9.783 s        | 10.023 s        | 2.222 s                         | 12.198 s                       | Three alternating pairs    |
| Factory / Gemini 3.8 Flash         | Not remeasured | 1.806 s         | 3.404 s                         | 5.210 s                        | Two current fresh launches |
| Factory / GPT-5.4 Mini Fast        | Not remeasured | 1.944 s         | 3.325 s                         | 5.268 s                        | Two current fresh launches |

Each cell is its own median; medians of component columns need not sum to the
median total. Factory's candidates are effectively tied in this small sample;
neither is established as universally fastest. All 16 marker turns completed.
Evidence: `verification/target10-fast-{cursor,antigravity,factory}-comparison.json`
and the individual `target10-fast-*-pair*.json` reports. Build records retain the
adapter and shared-pipeline hashes.

Startup ownership in the same current samples:

| Work / owner                                                | Cursor  | Antigravity | Factory / Flash |
| ----------------------------------------------------------- | ------- | ----------- | --------------- |
| Native ACP initialization, session creation and config RPCs | 4.706 s | 9.614 s     | 1.313 s         |
| Remaining Poracode / OS process setup                       | 0.438 s | 0.379 s     | 0.493 s         |
| Shell-environment acquisition, within that remaining setup  | 0.350 s | 0.346 s     | 0.383 s         |
| Skill preparation, overlapping shell acquisition            | 0.016 s | 0.088 s     | 0.028 s         |

The remaining setup is elapsed time outside measured native RPCs, not an
exclusive CPU profile of Poracode. Skill time must not be added again; the
shared barrier overlaps it with shell acquisition. Independent column medians
again need not sum exactly.

Cursor now passes the selected base model to its supported `--model` launch
option for fresh GUI ACP sessions. The native session starts with the correct
model, so shared config synchronization skips the subsequent model setter.
Every before sample issued that setter; every after sample omitted it. Startup
fell by 1.566 s at the median (current range 5.121–5.481 s). Resumed sessions,
terminal sessions and the SDK route keep their existing launch path. Effort,
thinking, fast mode and context controls still use normal config synchronization.

Antigravity now receives its supported `AGY_ACP_DEFAULT_MODEL` launch hint for
advertised modern native model/effort combinations. Its native model setter
returns quickly but defers a harness rebuild until the next prompt. Three
same-Argon/high pairs confirm one rebuild before and zero after. They do **not**
show a stable first-content gain: medians were 18.536/25.816 s amid large prompt
variation. The Flash comparison above needs no rebuild even before the change,
so no Flash speedup is claimed. Its current startup range is 9.976–10.093 s,
including 5.954–6.119 s native initialization and 3.541–3.644 s native session
creation. An earlier separate Flash cold sample took 16.840 s to dispatch, with
12.178 s inside initialization. Antigravity is therefore **not reliably below
ten seconds**, even after excluding prompt processing.

Inspection of the shipped native executable identifies a PyInstaller one-file
package containing 7,341 extractable files, about 335 MB unpacked. Native
initialization includes its process/bootstrap work; session creation starts the
local harness and initializes a conversation. This identifies real native work
but does not attribute every millisecond to an internal function. No vendor
binary, antivirus setting or private extraction-cache mechanism is changed.
The raw-process prewarm experiment was rejected on mismatched launch inputs and
was not adopted. Hiding that cost before the timer is not a cold-start gain.

The probes also timestamp the first native ACP text before Poracode maps it.
Across these 16 launches, native-to-canonical first-content delay was
11.614–30.590 ms. This rules out seconds of buffering at that mapping boundary
for these samples; it does not measure renderer paint or explain the original
busy-app ingress gap.

### Antigravity: one failed MCP must not abort the turn

The reported Nightly thread contains the native error that Vercel's unauthorized
`initialize` aborts the prompt. The native server explicitly treats an MCP load
failure as a turn failure. Removing the user's connector or changing its
credentials is not required for this fix.

An adapter capability now requests connection-failure isolation for GUI launches.
After normal MCP authorization, the shared pipeline wraps user/plugin MCP servers
with the existing tool-filter helper. A failed connection or tool listing leaves
a healthy downstream MCP endpoint with a diagnostic tool explaining that server's
tools are unavailable for the session. Healthy tools, filtering, structured
results and cancellation retain their normal behavior. Terminal launches and
providers without the capability keep their existing policy. Built-in owned MCP
services are not routed through this optional-user-server policy. Configured
connection deadlines still apply; this change does not promise instant startup
for an unresponsive MCP.

The helper config has a version-1 envelope under
`PORACODE_MCP_FILTER_CONFIG_V1`. New readers still accept the previous unversioned
key. Old workers reject the new key before connecting, and future versions are
refused rather than partially applied. The service writes the envelope, the
standalone worker reads it, and normal byte-sensitive helper staging plus
content-addressed WSL deployment refresh the deployed copy. Previous-shape and
future-version regressions cover this upgrade boundary; user settings and
credential storage do not change.

Native before/after evidence uses the real Antigravity executable, a local HTTP
401 fixture and a healthy read-only stdio MCP tool. Before, the first turn failed
with the native MCP initialization error. After, both fresh and follow-up turns
called `healthy_ping` and returned exactly `MCP_HEALTHY_OK`, with no MCP
initialization error. This is backend integration evidence, not an installed
Nightly or Electron-rendering claim. The disposable proof used the native
no-approval policy for that read-only tool; it did not change user permissions.
Evidence: `target10-mcp-native-before.json` and
`target10-mcp-native-after-approved-fixture.json` in the verification directory.

Independent reviews found a teardown leak when the proxy's downstream stdio
closed. Two real-child regressions reproduced it before the fix. Downstream
closure now idempotently closes both protocol legs and terminates the upstream
child; both default and isolation policies pass. Targeted lifecycle re-review
reported no findings. Separate adapter behavior and proof-efficiency reviews
also reported no outstanding findings.

A targeted follow-up found a second lifecycle issue: the MCP SDK starts its
request timeout only after the upstream transport opens. An SSE server that
opens the stream but never supplies its endpoint could therefore wait forever,
while the downstream stdin had no reader to observe EOF. Four real-SSE cases
reproduced this under both default and isolation policies. Downstream ownership
now starts first, tool requests wait for upstream readiness, and a transport-wide
deadline honors the configured timeout (or SDK default). Disconnect cancels
startup and closes both legs; a late connection cannot publish a new proxy.
All four previously failing cases and all 14 proxy tests pass. Both targeted
reviews report no findings, including an early downstream tools request held
until upstream readiness. Evidence: `target10-mcp-pending-{before,after}.log`.

### Follow-up verification in managed Electron

The final product changes were built into the isolated managed root
`C:/Users/sdsle/.poracode-smoke/provider-startup-target10-20261018-e`.
The runtime's 90,124-file artifact hash was verified after the live checks.
Installed Nightly and the user's saved models, permissions and connectors were
not changed.

Three real GUI threads completed eight turns:

- Antigravity called the healthy read-only MCP tool on both a fresh turn and a
  follow-up while a separate HTTP-401 MCP remained configured. Both replies were
  exactly `MCP_HEALTHY_OK`; no native MCP initialization error aborted the turn.
- With normal approvals restored in that disposable thread, denying the same
  tool produced `Rejected by user` and the requested `DENIED_OK` reply. Its native
  two-choice question displayed a structured question dock. Submit advertised
  `aria-disabled="true"` before selection, became enabled after choosing Alpha,
  and resumed to `QUESTION_OK` with no outstanding request.
- Cursor ACP completed fresh and follow-up turns using Auto. A second thread
  launched with GPT-5.4 Nano, then completed another turn after the normal model
  picker changed it to Auto. Persisted config and canonical output confirm the
  model change; the launch hint does not prevent later config synchronization.

Canonical snapshots are in
`verification/target10-managed-final-threads.json`; question and permission
snapshots are alongside it. Screenshots under the managed root's `artifacts/`
were visually inspected. These functional checks ran alongside the unit suite
and are not additional performance samples.

The diff-derived real smoke passed welcome dismissal, baseline and Everything
Search with **zero console/runtime errors**. Its IPC round-trip, MCP extension,
live-provider and runtime-request manual gates were acknowledged only after the
real flows above completed. The report is `artifacts/final-smoke/smoke-report.json`.
Earlier roots affected by profile promotion or superseded builds are not used
as final-code proof.
The managed app was stopped through its owner; its two listening ports and the
local fixture port are closed, with no healthy-MCP fixture child left running.
The owned profile, runtime and evidence are retained.

Full formatting, ordinary and type-aware lint, typecheck, architecture checks
and 19 architecture-script tests passed. The focused change suite passed 181
tests in eight files; the Cursor picker correction subsequently passed 66 tests
in three files. That existing integration test still expected the old fresh
launch arguments, so its assertion now includes the selected-model flag while
retaining the parameterized-picker contract and unchanged resume expectation.
Both lint modes and a final typecheck passed after that test-only correction.

The full unit run completed in 1,357.42 s: **24,993 passed, 208 skipped, one
failed** across 2,190 files. Its sole failure was the old Cursor launch-argument
assertion described above, executed before that test-only correction. The
corrected file and related adapter/config tests passed in the 66-test focused
rerun. No other full-suite failure remains unresolved. This is a full-run result
plus a passing correction rerun, not a claim that the original invocation was
green. Evidence: `verification/target10-final-tests.log` and
`verification/target10-cursor-picker-after.log`.

The real provider integration suite passed **28 tests, with 27 explicitly
skipped and no failures**. This includes eight installed-provider terminal
create/unload/resume cases, cross-agent checks and strict helper tests. Skipped
availability, authentication, model and opt-in cases are not live-provider
passes. Evidence: `verification/target10-providers-integration.log`.

### Direct console CLI versus raw ACP

A subsequent comparison bypassed Poracode entirely: Node spawned the installed
native binaries directly with hidden windows and piped streams. Three serial
pairs used fresh processes, an empty workspace per pair, Gemini 3.8 Flash/high
and the same read-only `Reply exactly OK` prompt. Pair order alternated. All six
replies were exactly `OK`; no tools were requested and the workspaces remained
empty. CLI self-update was disabled for these child processes only.

| Installed native path                       | Startup milestone, median  | First assistant text, median |
| ------------------------------------------- | -------------------------- | ---------------------------- |
| Console `agy.exe` 1.4.2, headless streaming | 3.713 s to `init` event    | 5.970 s                      |
| `agy_acp_server.exe` 1.4.1, raw JSON-RPC    | 9.302 s to prompt dispatch | 11.163 s                     |

The CLI `init` event is an observable readiness milestone, not an instrumented
model-dispatch timestamp. Its user-input step followed at a 3.790 s median.
Both first-text columns start immediately before native process creation and
include prompt processing, not response completion. This compares the installed
CLI and ACP distributions; it is not a matched-version comparison or a measurement
of interactive TUI paint. The CLI's documented NDJSON schema is
`event: init/step_update/result`; an initial exploratory run with an incorrect
parser is excluded from these six samples.

The raw ACP median was 5.401 s before the first `Starting AGY ACP Server` log,
5.428 s for the initialize RPC including that bootstrap, then 3.869 s for
`session/new`. The server source imports its Python dependencies before the
startup log; session creation authenticates, prepares config, and enters the SDK
agent context, which starts its harness. Thus the delay persists without the
Poracode supervisor, skill preparation, MCP proxies or renderer.

A no-prompt control reinforces the bootstrap finding: CLI `--help` exited in
0.105–0.106 s, while ACP `--help` took 6.352–8.452 s. No session or model prompt
was sent in that control. ACP's packaged Python startup is expensive on this
machine. Those aggregate controls did not separate archive extraction, Python
initialization and exit cleanup; the follow-up below does. The console executable is a different runtime path, so it
does not inherit the same ACP bootstrap delay.

Evidence is under `.tmp/thread-startup-performance/raw-console-20261018/`:
`measured-comparison.json`, the six individual reports, and
`bootstrap-help-control.json`. The probe uses the CLI's
[documented headless streaming mode](https://antigravity.google/docs/cli/headless/).
No product code, installed executable or saved user setting changed for this
comparison.

### Upstream reports and measured ACP packaging cost

GitHub investigation found matching reports, rather than an upstream speed fix:

- [T3 issue #9432](https://github.com/pingdotgg/t3code/issues/9432) reports direct
  Windows ACP initialization taking 40–47 s on an older official distribution.
  Its merged [PR #9510](https://github.com/pingdotgg/t3code/pull/9510) raises health,
  model-refresh and sign-out deadlines to 90 s. The production diff changes
  timeouts; it does not accelerate bootstrap. The issue's closed state therefore
  does not establish that the native performance problem was fixed.
- [Google issue #921](https://github.com/google-antigravity/antigravity-cli/issues/921)
  remains open and reports ACP extracting DLLs into `%TEMP%/_MEI*`, while the
  normal CLI works. A collaborator redirected ACP reports to the Antigravity
  forum. The [dedicated forum report](https://discuss.ai.google.dev/t/acp-server-1-1-1-official-agy-acp-server-cold-starts-in-16s-on-every-windows-spawn/183427)
  separately reproduces repeated one-file extraction and harness-restart costs.
  Those older Python-3.10/version-1.1.1 timings are not current-machine results.
- The live [ACP registry manifest](https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json)
  still selects 1.4.1. The installed CLI is the separate 1.4.2 release. Updating
  the CLI does not replace the ACP executable measured here.

Three further no-prompt controls observed Windows process creation times and
I/O counters through standard query APIs. They did not patch the executable,
inject code, change PyInstaller internals or alter security settings. PyInstaller
one-file mode extracts dependencies in a parent process before starting the
Python child; this matches its [documented bootstrap behavior](https://pyinstaller.org/en/stable/operating-mode.html#how-the-one-file-program-works).

| Measured stage in the three controls                                      | Observed elapsed time     |
| ------------------------------------------------------------------------- | ------------------------- |
| Parent creation to Python child creation: extraction/bootstrap            | 4.196–5.833 s             |
| Python child creation to first help output: runtime/import initialization | Approximately 1.73–2.01 s |
| First help output to process exit: Python teardown and parent cleanup     | Approximately 1.38–1.44 s |

The help commands exited normally through their help path, with the expected
status 1. Their total 7.344–9.287 s includes shutdown cleanup, which must not be
added to time-to-first-content. The lightweight observer can add overhead;
these phase controls are separate from the unprofiled first-content samples.

The parent writes exactly **334,646,354 bytes** on every observed launch. Reading
the executable's archive table independently finds **7,341 extracted files**
whose uncompressed sizes sum to that exact byte count. The current bundle uses
Python 3.14 (`python314.dll`). This establishes actual repeated extraction,
rather than attributing the wait to model inference or an MCP connection.

Two schema trees explain much of the payload:

- `googleapiclient/discovery_cache/documents/`: 581 files, 98,697,594 bytes.
- `google3/third_party/py/googleapiclient/discovery_cache/documents/`: another
  581 files and 98,697,594 bytes, with identical compressed payloads for all pairs.

Together they account for 197.4 MB, about 59% of the extracted bytes. One copy is
98.7 MB of duplicate content. Removing either path safely would require auditing
its consumers; neither path is removed in the experiments below, and no measured
saving is attributed to trimming this data.

The separate 3.869 s median `session/new` from the raw comparison includes auth,
config and SDK startup. The shipped `Agent.__aenter__`,
`LocalConnectionStrategy._spawn_harness_and_connect_ws` and
`LocalConnectionStrategy.__aenter__` method bodies match the public SDK source:
[agent startup](https://github.com/google-antigravity/antigravity-sdk-python/blob/main/google/antigravity/agent.py)
and [harness startup](https://github.com/google-antigravity/antigravity-sdk-python/blob/main/google/antigravity/connections/local/local_connection.py).
They spawn the harness, exchange configuration over stdio, connect a WebSocket
and wait for conversation initialization. This does not separately time each
auth, config or handshake function. The three no-prompt phase ranges should not
be summed with a median from a different run batch.

A PyInstaller-supported packaging alternative is a one-folder distribution,
which avoids per-launch extraction, plus a leaner dependency payload. A host could also
investigate process reuse with session isolation; no production pool or prewarm
change is implemented here. Individual Python imports
and Windows filesystem/security overhead remain unseparated.

Evidence under `.tmp/thread-startup-performance/raw-console-20261018/`:
`bootstrap-process-profile.json`, `bootstrap-archive-inventory.json`,
`bootstrap-archive-bloat.json` and `sdk-method-comparison.json`.

### Local one-folder hot-patch experiment

A separate copy of the official Windows ACP 1.4.1 executable was converted into
a one-folder layout. All 7,341 extracted files and both schema trees were kept.
Only the copied executable's archive extraction markers were changed; its Python
scripts and embedded module payloads were not edited. The original installed
executable remains unchanged, with a valid Google Authenticode signature.

Three serial, alternating stock/cache pairs used the same empty workspace per
pair, `gemini-3.8-flash` with `high` effort, no MCP servers, and the same
read-only `Reply exactly OK` prompt. Every launch returned `OK` without a tool
request. Medians from this new comparison batch:

| Stage                                       | Stock executable | One-folder copy |
| ------------------------------------------- | ---------------- | --------------- |
| ACP initialize RPC, including process start | 9.501 s          | 2.957 s         |
| Process start to prompt dispatch            | 13.798 s         | 7.664 s         |
| Process start to first nonempty text        | 16.197 s         | 9.503 s         |

This removes roughly six seconds from startup in this batch; it does not speed
up model inference. Stock extraction varied more than in the earlier comparison,
so the before/after claim uses only these paired samples. The one-time extraction
and copy took 2.228 s in the initial experiment; cache preparation was outside
the launch measurements. The retained cache adds about 567 MB of files,
including the executable, its 334.6 MB payload and the unchanged harness.

The copied executable reports **Authenticode HashMismatch**. No security policy
was disabled or signature validation bypassed. Consequently this experiment is
not enabled automatically in Poracode and is not a Nightly/user rollout. A
production cache would need explicit provenance and version qualification,
atomic preparation, update invalidation, and stock-runtime fallback.

Three subsequent controls used the unchanged signed executable and recorded
the boundary immediately after `initialize` completed, before `session/new`.
From that ready boundary, median session creation/prompt dispatch was **3.894 s**,
and first text was **5.908 s**. All three returned `OK` without tools. This
quantifies the latency available if Poracode prepares a spare process before
the user opens a thread. The cold preparation still took **10.460 s** median
and is excluded from those ready-boundary numbers; clicking before preparation
finishes would still wait. No pool, background replenishment, idle lifetime or
handoff integration is implemented or qualified by these controls.
Prewarming was subsequently rejected: it moves the same work into the background
and adds an idle process. No prewarming or spare-process pool is included in the
product changes.

The first experiment inside this Git checkout failed because a bundled
`websockets` version helper interpreted the enclosing Poracode Git tag as its own.
The successful copy lives outside any repository. A production cache must avoid
that location-dependent failure. Closing stdin did not end these native ACP
processes within five seconds; the comparison terminated only its own process
trees, so shutdown and orphan-cache handling remain qualification work.

This is a native first-turn experiment. Follow-ups, tools, permissions, session
resume, managed Electron, other versions and other operating systems have not
been qualified for this derived runtime.

Evidence: `.tmp/thread-startup-performance/raw-console-20261018/onedir-experiment-comparison.json`,
`onedir-integrity.json`, `prewarm-control-comparison.json`, the per-launch JSON
files, and the ignored
`.tmp/thread-startup-performance/prepare-antigravity-onedir.py` prototype.
