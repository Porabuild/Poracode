---
name: supported-version-update
description: Update an existing provider, CLI, SDK, library, or protocol integration to a newer supported version. Use when asked to upgrade supported versions or adapt an integration to a new release; audit upstream release notes and changelogs before implementing. Not for writing the project's own release notes or an installation-only request.
---

# Supported Version Update

Qualify the existing integration against the target release. Installing a package and passing existing tests alone do not establish support for its changed behavior or features.

This is the project-scoped workflow. Follow the repository's `AGENTS.md`, [architecture](../../docs/architecture.md), [versioning rules](../../docs/versioning.md), and normal review/verification procedures. For a new provider rather than an existing integration, use [add-provider](../add-provider/SKILL.md).

## Establish the Upgrade Range

- Identify the installed version, the version declared or pinned by the project, and the last version actually qualified. Keep these distinct when they differ.
- Resolve the requested target and release channel from official sources. Do not silently substitute an alpha, a different distribution channel, or an older package selected by a registry tag.
- Before implementation, read the official release notes, changelog, migration guide, and relevant deprecations for every intermediate release from the current supported baseline through the target. Include baseline notes when assessing features already available there.
- When notes are missing, say so and inspect official tag/commit comparisons or published package diffs for the relevant integration and dependencies. Check for truncated comparisons. Distinguish inspected package changes from uninspected transitive changes; missing notes or unchanged protocol numbers do not prove unchanged behavior.
- Record the actual executable/package and execution target, including platform, WSL, profile/account, and local/cloud routing where relevant. Obtain approval for network/model usage or changing installed software; qualify candidates in isolated fixtures without restarting active sessions or altering the user's real profile.

## Map Changes to the Integration

- Trace applicable changes in launch arguments, authentication, model discovery, capability negotiation, configuration, messages, tools, permissions, MCP, session lifecycle, and persisted formats to their existing consumers.
- Decide which changes already flow through dynamically, which need implementation, and which requested features remain unsupported or unverified.
- Distinguish the upstream application's own UI features from capabilities exposed through its integration protocol. Do not recreate unrelated upstream UI or claim features the protocol does not expose.
- Follow repository compatibility and versioning rules. Reuse provider boundaries and existing extension points; change versions, migrations, or caches only when compatibility requires it.
- Build a baseline-to-target capability/evidence matrix covering changed paths and newly available features. For provider updates, use the [complete provider integration surface](../add-provider/SKILL.md#build-a-capability-matrix) as the audit inventory, not a mandate for unrelated changes. Include detection/install/update metadata, auth and profiles, native/WSL launch and resume, models/config, attachments/tools/subagents/requests, MCP/skills/plugins, usage/status, renderer controls/localization, and affected desktop/standalone/client contracts.
- Re-audit the applicable [established provider lessons](../../docs/provider-integration-lessons.md), recording an L1-L12 applicability/evidence decision. Check whether old workarounds are still needed and whether newly supported contracts can replace them; preserve old supported artifacts and refresh the affected evidence entry. Reading an old regression is not target-version verification.

## Requalify Provider Steering

For providers accepting user input while working, always complete [native steering qualification](../provider-chat-smoke/SKILL.md#native-steering-qualification), even if the existing adapter uses cancel-and-resend or already exposes native steering.

- Trace the actual supervisor-owned mid-turn input path and compare it with current and target-version SDK/protocol capabilities. Explicitly check whether native steering already exists but is unwired, or was introduced in a newer supported release. Missing adapter code is not proof of upstream lack of support.
- Prefer qualified `steerTurn` or a provider-owned ACP `promptSteering` declaration, with runtime capability negotiation where available. Keep vendor parsing in the provider boundary and preserve older supported handshakes. Document the tested-version reason and interruption limitations for any remaining fallback.
- Prove a steer during actual in-flight work preserves the same running subagent where supported, independently prove explicit Stop cancels, and verify rejected/racing/repeated requests and attachment handling do not drop or duplicate input. Repeated native usage replies must not double-count consumption; distinct samples must remain distinct.
- Keep unsupported-at-version and blocked/unverified outcomes separate. Do not infer support from a version number alone or describe a skipped live gate as passing.

## Implement and Verify

Make the required compatibility changes and support the requested features within the authorized scope. Preserve existing settings and user data, and use the repository's normal review and [verification](../verify/SKILL.md) workflows. For provider work, follow [provider isolation](../../docs/agent-adapters.md#provider-isolation--hard-rules), [provider runtime](../../docs/provider-runtime.md), and [provider notes](../../docs/provider-notes.md); reuse capability options/hooks instead of provider-name branches in shared code.

Cover changed behavior with relevant regression tests, including prior-version artifacts when a compatibility boundary changes. Use the real integration when mocks cannot prove the requested behavior; exercise the lifecycle and feature paths affected by the upgrade. Keep previous-version, target-version, mocked, and live evidence distinct.

For affected provider paths, run the applicable [provider chat smoke](../provider-chat-smoke/SKILL.md) / [interactive testing](../interactive-testing/SKILL.md) gates, including reconnect/resume and actual steering/Stop timing. Check desktop/standalone composition and impacted client contracts rather than assuming a renderer test proves them. Follow [i18n](../../docs/i18n.md) for changed renderer strings and the versioning checklist for every persisted/wire/helper boundary. Stop this run's processes and clean up disposable fixtures after preserving cited evidence in `tmp/`.

An error that stops reproducing after an upgrade is evidence of recovery, not proof of its original cause. Attribute a fix to a particular upstream change only when logs, source, or a controlled reproduction support that attribution.

## Report

State the baseline and target, link the upstream sources reviewed, summarize relevant changes and their integration impact, and name what was verified and what remains unsupported or untested. Identify missing release notes and evidence limits explicitly. Do not report a full release audit or complete feature support when only part was checked. For provider work, include the actual steering path, version/capability evidence, same-child/Stop results, fallback limitations, affected clients, and compatibility decisions. Do not commit, publish, or change global skills unless asked.
