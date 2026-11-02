# Provider Integration Lessons

Evidence-backed checks distilled from the existing provider implementations. Use this with the [adapter checklist](agent-adapters.md), [provider runtime](provider-runtime.md), [provider notes](provider-notes.md), and [versioning rules](versioning.md), not as a replacement for the target provider's current protocol.

## Scope and Evidence

This static audit covers the 19 built-in agent families in [the registry](../../src/supervisor/agents/registry.ts), generic ACP instances, the four profile factories, and their renderer registrations. The index below records representative implementation and regression contracts reviewed; it is not a claim that every test, historical release, or live provider version was revalidated. Usage-only integrations are not automatically chat providers.

A linked test documents an intended regression contract, not a new passing test run. Before shipping a new integration or upgrade, verify the actual target version and execute the applicable gates. Record unsupported and blocked/unverified outcomes separately. When a provider or contract changes, refresh the relevant evidence rather than treating this inventory as permanent upstream truth.

## Reusable Checks

### L1 Capability Evidence

- Distinguish advertised, implemented, qualified, unsupported, and unverified features per version, account, execution environment, and presentation. Static defaults, a method's presence, successful initialization, or a settings control do not alone establish end-to-end support.
- Normalize vendor metadata behind provider-owned hooks. A qualified override may correct an under-advertised capability, but needs native evidence and compatibility tests; do not invent a global protocol rule from one provider. Exercise missing/malformed/older metadata and invalidate affected capability caches when the contract changes.

### L2 Launch and Environment

- Validate the real executable, distribution, runtime prerequisites, version/channel, cwd, argv ordering/quoting, and environment in each supported location. Version/help/initialize probes, login, PTY, GUI, one-shots, and child/helper launches are distinct lanes. Prepare cold WSL environments before building commands; do not depend on a warm detection cache or interactive PATH.
- Keep protocol stdout free of trust prompts, update notices, and wrapper noise. Qualify trust/permission setup and updater suppression without silently altering real user state. Preserve explicit artifact-removal opt-outs; a prerequisite or update source is not necessarily the same as the visible provider card.

### L3 Account and Store Custody

- Follow the selected account/profile through auth, catalogs, usage, launch, resume, native stores, and caches. Do not treat config-directory presence as authentication, borrow the host's login for a failing WSL/profile read, resurrect signed-out credentials, or provision account roots during a read-only probe.
- Use only the credential lane the runtime actually supports: an SDK API key is not permission to inject it into CLI/ACP processes. Preserve authoritative homes/config overrides. Do not clone rotating OAuth grants or migrate native databases by copying files. Journal compatibility/revocation when required, fence future formats before writes, and separate volatile catalog/auth invalidation from durable resume identity.

### L4 Model and Control Fidelity

- Preserve native model/route IDs as opaque values in shared code. Parse or translate them only at a provider-owned boundary when its native contract requires it, preserving the complete route and native values. Carry catalog routing metadata when the selected model's route differs from the server default. Bind effort, Fast, context, modes, permissions, and sandbox controls to exact qualified fields/values, not similar names or substrings.
- Confirm configuration before admitting work and preserve explicit intent on failure. A default setter may persist a global native setting; avoid unnecessary writes. Qualify one-shot, extraction, and resume controls separately: map or explicitly refuse each present carrier instead of silently dropping it. Utility generation must not accidentally acquire a general tool loop or escape an authorized read-only workspace through traversal/symlinks.

### L5 Resume and Readiness

- Persist the real session identity and runtime/store discriminator; a changed default must not reinterpret an old reference. Distinguish reserved IDs from materialized sessions and discover late-created IDs using launch-scoped evidence. Do not guess between overlapping candidates, silently replace a missing conversation, or retry an unrelated failure as a fresh session.
- Resume only the Poracode-associated session. Never expose ACP `session/list` as a second thread index; native-history import stays explicitly user-initiated through the existing import service. Gate new prompts on required live status/subscription/recovery, not optional full-history or metadata hydration. Preserve pending approvals and child ownership, reject late results from retired owners, and scope legacy retries to the exact unsupported optional field/error.

### L6 Turns, Steering, and Shutdown

- A prompt queue or hidden context hook is not proof of native user steering. Complete [native steering qualification](../skills/provider-chat-smoke/SKILL.md#native-steering-qualification), including whether a newer release removes a fallback. Keep accepted steer responses attached to the original work and preserve active tools/subagents; independently verify explicit Stop and no late replay.
- Separate foreground completion, detached child completion, autonomous background continuations, and process exit. Use actual protocol boundaries, not prose or silence alone. Reject stale interrupts/queued input after cancellation, settle pending requests once, share concurrent disposal, and do not announce process/session exit before confirmed teardown. Leased/shared hosts must not kill sibling sessions or an attached successor.

### L7 Canonical Stream Identity

- Normalize vendor stream/tool/resource/error envelopes before shared mapping. Correlate by session, owner, native item, and stream; preserve parented content and meaningful command exit status. Derive working/attention from authoritative events/hooks/OSC, with narrowly qualified terminal fallbacks, not arbitrary output words.
- Where the native contract provides authoritative snapshots, replace the same item rather than appending a duplicate. Never deduplicate equal prose heuristically or let a child/sibling replace another owner's stream. Reconnect must reconcile missed final text and requests without replaying completed history, usage, or creating a new turn for a history-only correction.

### L8 Subagent Correlation

- A launch receipt is not child completion. Preserve original native/canonical identities across streamed arguments, foreground/background transitions, sibling work, parent turns, and late reports. Do not use the current foreground tool as a catch-all parent or close detached children when the foreground turn ends.
- If the protocol omits child events, observe only the current owned session's bounded native source through an existing extension/coordinator. Require fresh native session/tool anchors; never attach by position, the newest unrelated file, or stale replayed history. Bound post-turn settling and dispose observers; test cancel, malformed records, late input/reports, concurrent children, and replay.

### L9 Client Services and Requests

- Qualify filesystem, terminals, media, and resources against the actual execution host and selected route, not just a handshake flag. Proxying provider-owned state through client filesystem services can change missing-file/error semantics and break native planning. Do not widen host access to hide that incompatibility; retain native ownership or declare the service unavailable.
- Preserve request/option identity, schema, validation, and exactly-once answer/decline/cancel outcomes through resume, Stop, and disposal. Never send an empty structured answer or silently approve. Test real denied/missing resources, attachment delivery and retained-history route limits; another route advertising images does not prove the selected one accepts them.

### L10 MCP, Skills, and Deployed Helpers

- Prefer session-local launch configuration/overlays/mods; preserve native settings and unrelated servers. Keep secrets out of argv/logs, protect and clean up staged files, preserve tool filtering and provider-owned schema/name normalization, and defer interactive authorization until the authorized connection. Negotiate/qualify each transport; any compatibility retry must be narrow and removable when native support arrives.
- Respect native skill roots, precedence, frontmatter, and invocation forms; a model-only skill must not be forced into a user slash command. Stage hook/mod/helper dependencies and wrappers through the shared resource pipeline for native, WSL, and remote hosts. Verify packaged assets and absolute runtime resolution, not merely source-tree imports or a developer shell's Node. See [hook runtime resolution](provider-runtime.md#hook-runtime-resolution).

### L11 Usage and Context

- Separate cumulative/per-call consumption, context occupancy, quota windows, and credits. Carry native sample identity, scope/epoch, and freshness where needed so repeated steer/reconnect replies do not double-count; genuinely separate samples must remain separate. Never infer context occupancy from consumption when the provider has an authoritative context signal.
- Scope usage credentials/caches to their actual login source and invalidate on logout/replacement without leaking secrets. Read-only usage discovery must not trigger hidden sign-in/refresh dialogs or switch accounts. Missing/unsupported/failed usage is not a measured zero; preserve the native unit and uncertainty.

### L12 Registration and Distribution

- Follow the full supervisor/renderer/install/profile checklist and parity tests. Register only supported controls and actual chat providers, preserve profile base identity/ranks, and honor explicit first-class registry adoption without discarding unrelated generic instances. One integration can have multiple runtime/install prerequisites and update sources.
- Carry changes through status/capability caches, manifests, generated/native protocol copies, helpers, localization, and affected client/desktop/standalone composition. Use existing extension points and components. Audit version/migration/invalidation decisions and no-client/multi-client/reconnect behavior rather than claiming a renderer test or local build proves distributed support.

## Provider Evidence Index

Each entry identifies concrete lessons and a representative code/test pair. Follow the linked files for vendor details instead of copying their flags or wire shapes into shared code.

- **Claude (`claude`, L6/L10):** immediate SDK steering preserves live tool output; user-only and model-only skills have different invocation forms. [Runtime](../../src/supervisor/agents/claude/sdkSession.ts), [steering regression](../../src/supervisor/agents/claude/sdkSession.nativeSteer.test.ts), [skill invocation regression](../../src/supervisor/agents/claude/skillInvocationHost.test.ts).
- **Copilot (`copilot`, L9/L10):** MCP launch/resume uses a protected `@file` and environment substitutions instead of secret-bearing argv, with staged-file cleanup. [Implementation](../../src/supervisor/agents/copilot/mcp.ts), [regressions](../../src/supervisor/agents/copilot/copilot.test.ts).
- **Codex (`codex`, L5):** metadata-only resume preserves the same thread; only an explicit rejection of the optional `excludeTurns` field retries without it. Unrelated errors must not start a replacement conversation. [Implementation](../../src/supervisor/agents/codex/threadResume.ts), [regressions](../../src/supervisor/agents/codex/threadResume.test.ts).
- **Gemini (`gemini`, L2/L5):** trust notices must not contaminate ACP stdout; first-launch session assignment and resume use distinct native flags. [Implementation](../../src/supervisor/agents/gemini/argv.ts), [regressions](../../src/supervisor/agents/gemini/gemini.test.ts).
- **Qwen (`qwen`, L6/L8):** background reports and autonomous continuations have native turn boundaries; detached tasks must not collapse into foreground completion. [Bridge](../../src/supervisor/agents/qwen/acpTransform.ts), [regressions](../../src/supervisor/agents/qwen/acpTransform.test.ts).
- **Qoder (`qoder`, L2):** cold WSL preparation is awaited by both ACP auth and session creation; warmed caches must not hide a launch dependency. [Implementation](../../src/supervisor/agents/qoder/index.ts), [regressions](../../src/supervisor/agents/qoder/qoder.test.ts).
- **Grok (`grok`, L2/L5):** a preassigned but unmaterialized session is not a valid resume target; real session identity survives a project move, and WSL/native login paths differ. [Implementation](../../src/supervisor/agents/grok/index.ts), [regressions](../../src/supervisor/agents/grok/grok.test.ts).
- **Kimi (`kimi`, L8/L9/L10):** client-fs errno translation can break native plan files; optional MCP stdio compatibility and streamed/background child ownership need separate qualification. [Composition](../../src/supervisor/agents/kimi/index.ts), [client-service regressions](../../src/supervisor/agents/kimi/acpFsCapability.test.ts), [child regressions](../../src/supervisor/agents/kimi/acpTransform.test.ts).
- **Muse (`muse`, L4/L5/L6):** model catalog routing must reach `session/start`; resume restores requests/config without replay, and disposal must confirm owned-host shutdown. [MSP runtime](../../src/supervisor/agents/muse/msp/session.ts), [regressions](../../src/supervisor/agents/muse/msp/session.test.ts).
- **Antigravity (`antigravity`, L8/L12):** missing child wire data is reconstructed only from fresh matching native anchors, never replay; late reports require bounded settling. Its terminal and ACP prerequisites remain one adopted provider. [Bridge](../../src/supervisor/agents/antigravity/acpSubagents.ts), [child regressions](../../src/supervisor/agents/antigravity/acpSubagents.test.ts), [alias regressions](../../src/supervisor/agents/registry.test.ts).
- **Command Code (`commandcode`, L1/L2/L9/L10):** qualified newer versions support ACP while older ones stay terminal-only; the harness retains filesystem/terminal ownership, and MCP mods/hooks require staged runtime assets. [Composition](../../src/supervisor/agents/commandcode/index.ts), [version regressions](../../src/supervisor/agents/commandcode/detection.acp.test.ts), [ACP regressions](../../src/supervisor/agents/commandcode/acp.test.ts), [staging regressions](../../src/supervisor/agents/commandcode/plugin/install.stage.test.ts).
- **Cursor (`cursor`, L3/L5):** saved runtime-prefixed IDs override a changed ACP/SDK default; API-key profile sessions have a qualified SDK lane rather than blind CLI/ACP credential injection. [Identity](../../src/supervisor/agents/cursor/structuredRuntime.ts), [identity regressions](../../src/supervisor/agents/cursor/structuredRuntime.test.ts), [profile regressions](../../src/supervisor/agents/cursor/cursor.test.ts).
- **OpenCode 1 (`opencode`, L4/L6):** its deferred prompt queue is not the same as native in-flight steering; permission policy must be reconciled on the selected session. [Runtime](../../src/supervisor/agents/opencode/sdkSession.ts), [regressions](../../src/supervisor/agents/opencode/sdkSession.test.ts).
- **OpenCode 2 (`opencode2`, L3/L5/L7):** live-tail subscription admission and snapshot recovery restore missed text/requests without replay; native/legacy credential stores must not share rotating OAuth grants. [Recovery](../../src/supervisor/agents/opencode2/recovery.ts), [recovery regressions](../../src/supervisor/agents/opencode2/recovery.test.ts), [readiness regressions](../../src/supervisor/agents/opencode2/eventHub.test.ts), [credential regressions](../../src/supervisor/agents/opencode2/credentialCompatibility.test.ts).
- **Pi (`pi`, L6/L11):** rejected native corrections remain errors; cumulative session consumption is distinct from context, and disposal cannot report exit before the RPC process closes. [Runtime](../../src/supervisor/agents/pi/rpcSession.ts), [regressions](../../src/supervisor/agents/pi/rpcSession.test.ts).
- **Factory (`factory`, L1/L8):** a qualified HTTP MCP override covers under-advertised initialization; detached siblings remain alive until their native invocation records become terminal. [Composition](../../src/supervisor/agents/factory/index.ts), [bridge](../../src/supervisor/agents/factory/subagentTranscripts.ts), [regressions](../../src/supervisor/agents/factory/subagentTranscripts.test.ts).
- **Devin (`devin`, L3/L6/L11):** negotiated mid-turn prompts preserve children; repeated native usage samples deduplicate, while volatile catalog/auth changes must not arbitrarily move resume identity. [Steering declaration](../../src/supervisor/agents/devin/acp/promptSteering.ts), [steering regressions](../../src/supervisor/agents/devin/acp/promptSteering.test.ts), [scope regressions](../../src/supervisor/agents/devin/volatileCatalog.test.ts).
- **DeepSeek Harness (`deepseek`, L4/L9):** ACP tuple model routes remain opaque to shared code; provider-owned headless generation decodes the native route without losing its values, restricts callable tools, and confines workspace reads including symlink/traversal cases. [Generation](../../src/supervisor/agents/deepseek/oneShot.ts), [route regressions](../../src/supervisor/agents/deepseek/oneShot.test.ts), [policy regressions](../../src/supervisor/agents/deepseek/oneShotPolicy.test.ts).
- **fx (`fx`, L2/L4/L7):** permission/updater behavior belongs in qualified spawn settings, status uses OSC, and Fast binds the exact `fast` select rather than higher-priced `ultrafast`. [Composition](../../src/supervisor/agents/fx/index.ts), [config binding](../../src/supervisor/agents/fx/acp.ts), [launch regressions](../../src/supervisor/agents/fx/fx.test.ts), [config regressions](../../src/supervisor/agents/fx/acp.test.ts).
- **Generic ACP (`acp-generic`, L1/L3/L12):** native/WSL/distro auth acknowledgments do not cross environments, and provider-owned normalization/behavior extensions stay outside generic protocol rules. [Implementation](../../src/supervisor/agents/acp-generic/index.ts), [regressions](../../src/supervisor/agents/acp-generic/index.test.ts).

## Profiles and Cross-Provider Proof

- **Claude profiles:** selected config-directory precedence and custom environment/model restrictions are part of the adapter contract, not generic UI branches. [Factory](../../src/supervisor/agents/claude/index.ts), [regressions](../../src/supervisor/agents/claude/claude.test.ts).
- **Codex profiles:** read/watch only the selected account home and do not restore logged-out credentials from an overlay copy. [Regressions](../../src/supervisor/agents/codex/profileIsolation.test.ts).
- **Cursor profiles:** require their own key and qualify the SDK lane; a profile must not inherit ambient CLI/ACP credentials. [Factory/regressions](../../src/supervisor/agents/cursor/cursor.test.ts).
- **Devin profiles:** account-root ownership/version fences, references, org/config selection, and WSL roots must be checked before provisioning or use. [Implementation](../../src/supervisor/agents/devin/profileContext.ts), [regressions](../../src/supervisor/agents/devin/profileContext.test.ts).
- **Registration and clients:** the [supervisor registry tests](../../src/supervisor/agents/registry.test.ts) check directory parity, uniqueness, profiles, and alias adoption. The [renderer manifest tests](../../src/renderer/components/providers/providerManifest.test.ts) cover discovery, provider-owned registrations, profile ranks, and exclusion of usage-only services. These are distinct contracts.
- **Deployment and cache compatibility:** [staged plugin tests](../../src/supervisor/agents/plugin/prepareAgentPlugins.test.ts) cover shipped provider assets, while [Claude cache regressions](../../src/supervisor/agents/claude/statusCache.test.ts) demonstrate provider/profile capability invalidation without dropping unrelated providers. Follow the full versioning and client checks for the boundary actually changed.

## Applying and Maintaining the Audit

For a new provider or upgrade, add a decision for each L1-L12 group to the capability/evidence matrix: the applicable native contract, existing extension point, and planned regression/live proof, or an evidenced unsupported/not-applicable outcome. Unverified remains unverified. Reuse existing tests/helpers; do not copy every vendor workaround or make unrelated changes to satisfy an inventory.

Update the affected evidence entry when adding/removing providers or changing a contract. Put vendor wire details in the provider folder/notes, shared rules here, and procedures in the project skills. Report reviewed-source, executed-test, and live-version evidence separately; this guide is not a substitute for any of them.
