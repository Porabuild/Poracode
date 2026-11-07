---
name: add-provider
description: Implement a new Poracode agent provider end to end across the supervisor, renderer, installation, authentication, capabilities, and verification. Use when asked to add a provider, integrate a CLI or SDK agent, or implement a new provider adapter. Covers terminal and structured runtimes, platform and client contracts, compatibility, and native steering qualification.
---

# Add Provider

Deliver a complete integration of the provider's qualified capabilities, not just a launch command or a working first reply. Audit the whole integration surface; implement the requested supported features and explicitly classify unsupported or unverified ones rather than inventing support.

## Establish Scope and Evidence

- Read the repository's `AGENTS.md`, [architecture placement](../../docs/architecture.md#choosing-where-a-change-belongs), [provider isolation and full integration checklist](../../docs/agent-adapters.md), [provider runtime](../../docs/provider-runtime.md), and relevant [provider notes](../../docs/provider-notes.md). The checklist owns exact registration paths; follow it rather than maintaining a second registration inventory here.
- Identify the provider's actual executable/package, installed and target supported versions, official documentation/source, transport, authentication requirements, and execution targets. Distinguish native Windows, WSL, local/cloud execution, and profiles/accounts. Get approval before network/model usage, changing the installed CLI, or touching active sessions.
- Inspect actual version/help output, SDK interfaces, or negotiated protocol payloads. Use current official documentation and release notes; record the source and version for each conclusion. An upstream UI feature is not necessarily exposed over its integration protocol. A guessed flag/RPC or a reference adapter's behavior is not evidence.
- Decide presentation from the available contract: terminal threads require a real PTY; structured GUI threads require the provider's structured runtime. Only the supervisor spawns agent processes. Do not simulate GUI support by scraping a TUI or add Electron dependencies to shared host code.

## Build a Capability Matrix

For each area, record supported, unsupported, or unverified; the native contract; its Poracode projection; affected platforms/clients; and the regression/live evidence required. Include:

- **Installation and launch:** detection, binary resolution, versions, install/update commands and release channel, argv/environment, working/additional directories, Windows/WSL quoting, first launch, resume, one-shot/utility tasks, shutdown, and orphan cleanup.
- **Authentication and identity:** missing/expired credentials, login/logout, available auth methods, permissions/trust policy, profile/account isolation, stable session references, invalid-session recovery, and explicit session import where supported. Never infer sign-in from a config directory or expose credentials in artifacts.
- **Models and configuration:** live catalogs, model routing, modes, effort/context/Fast options, approval/sandbox policies, acknowledged config writes, unsupported selections, and settings changes during a turn where qualified. Do not advertise static guesses as negotiated capabilities or silently downgrade explicit selections.
- **Conversation and tools:** user/assistant/reasoning streams, file mentions and attachments, images/audio where supported, resource/path localization, commands and terminals, file changes, plans, subagents/background work, questions/permissions, MCP, skills/plugins, usage/context accounting, and provider errors.
- **Lifecycle and interaction:** first/follow-up turns, native steering, explicit Stop, pending requests, timers/status/attention, reconnect/reopen/resume, process/transport failure, replay deduplication, and work continuing without a mounted client.
- **Presentation and clients:** provider icon/manifest, discovery and model pickers, supported composer controls, utility-task registration, native install/settings UI, localized strings, desktop/standalone composition, and affected web/PWA/native client contracts. Do not assume a renderer-only change proves host behavior or mobile parity.

An unavailable feature is not permission to implement an unrelated substitute. Mark not-applicable gates with evidence; do not count skipped or unverified gates as passing.

## Apply Established Provider Lessons

Read the [audited provider lessons and evidence index](../../docs/provider-integration-lessons.md) before choosing a reference adapter. It covers every current built-in family, generic ACP, and profile variants; do not reduce the audit to steering alone.

- Extend the capability/evidence matrix with an explicit decision for each L1-L12 lesson group: applicable native contract and shared seam with planned regression/live proof, or evidenced unsupported/not-applicable. Leave missing evidence unverified rather than inventing support.
- Check the linked implementation and regression for the relevant pattern, then qualify it against the target runtime/version. A similar provider name, common protocol, or existing workaround does not make its behavior portable.
- Refresh the affected evidence entry when adding a provider or changing a contract. Keep vendor payload/flag details in provider-owned code/notes and reusable rules in the shared guide; do not duplicate the whole guide in this skill.

## Design the Boundaries

1. Trace client actions through transport/authorization to the authoritative supervisor/host state and back to client projections. Reuse the same owner under desktop and the independent CLI server; clients must not become a second writer on reconnect.
2. Inspect the closest provider examples, but verify their assumptions against this provider. Keep vendor flags, parsers, payload normalization, timing quirks, and profile rules in the provider folder. Reuse named capabilities, behavior options, and supplied hooks; no provider-name branches in shared runtime/UI code.
3. Audit every changed persisted, cached, wire, manifest, or deployed-helper boundary using [versioning rules](../../docs/versioning.md). Keep compatible older artifacts valid, or deliberately migrate/invalidate them with pre-upgrade regression coverage. Never discard user data to make a clean-profile test pass.
4. Complete [native steering qualification](../provider-chat-smoke/SKILL.md#native-steering-qualification) before selecting cancel-and-resend. Check current and newer supported releases; prefer qualified native delivery that preserves ongoing work. Stop is a separate operation, not a steering implementation.

## Implement End to End

- Follow every applicable item in the [full provider checklist](../../docs/agent-adapters.md#adding-a-new-provider--full-checklist): supervisor adapter modules, explicit registry/parity, renderer manifest and registrations, native install/update discovery, and lifecycle tests. Check both detection and adapter exposure of update metadata; a launcher alone is not integration.
- Implement truthful detection/auth probes and capabilities. Declare shared spawn environment once through the existing contract so detection, login, PTY, structured sessions, one-shots, and child processes agree. Keep profile/account and execution-location identity intact across launch and resume.
- For structured providers, wire session creation/loading, authoritative configuration, canonical event mapping and parent/child ownership, bounded request/permission resolution, error handling, disposal, and stable session-ref persistence. Preserve exactly-once request outcomes and usage sample identity; do not import provider history automatically.
- Qualify attachment and filesystem/terminal access against the execution host, including WSL and cloud boundaries. Reuse existing MCP/skill/plugin mechanisms; advertise only operations actually implemented and authorized. Wire optional import, utility generation, hooks, or controls only where the contract and requested scope support them.
- Reuse existing renderer components and provider extension points; follow [UI patterns](../../docs/ui-patterns.md), [React editing rules](../../docs/editing-rules.md), and the HeroUI skill when applicable. Localize user-facing strings with [i18n](../../docs/i18n.md), including extraction and all required catalogs. Do not add controls the runtime cannot honor.
- Update only necessary provider notes or compatibility records; preserve unrelated providers and user changes. Do not commit, publish, or open a PR unless asked.

## Verify and Finish

1. Add targeted adapter/registration and contract tests from the capability matrix: normal/negative detection and auth, argv/location handling, old/malformed handshakes, new/resume/invalid sessions, config acknowledgements, tool/request outcomes, attachments, failure/disposal, usage/replay deduplication, and qualified steering/Stop/subagent behavior. Scope cases to real supported surfaces, not invented features. Name which established lessons each changed regression proves; inspected test code is not an executed-test result.
2. Run the applicable [verify](../verify/SKILL.md) gate and conditional checks, including architecture, localization, remote/native protocol, or deployed-helper checks when those boundaries change. Never weaken tests or timeouts to claim support.
3. Use [provider chat smoke](../provider-chat-smoke/SKILL.md) and [interactive testing](../interactive-testing/SKILL.md) for real supported surfaces, in isolated fixtures with approved access/model usage. Prove mid-turn controls during actual activity and subagent completion under the original identity. For terminal-only providers, prove the real PTY lifecycle without inventing structured controls.
4. Verify affected desktop/standalone composition and client contracts, including relevant no-client, multi-client, and reconnect cases. Keep mocked, live, platform-specific, and unverified evidence separate.
5. Stop only this run's processes, copy cited evidence into `tmp/`, and clean up disposable fixtures/smoke roots according to interactive-testing. Never mutate the user's real profile or another live session.

Report versions/targets and upstream evidence, implemented capabilities and registrations, compatibility decisions, exact checks/live gates, unsupported/unverified features, and remaining risks. A first reply or a green typecheck alone is not completion.
