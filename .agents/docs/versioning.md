# Versioned State & Protocols

Poracode keeps data and deployed artifacts across app upgrades. A change can work in a clean profile and still fail for existing users when an old cache, renderer store, helper, or plugin remains on disk. Treat every serialized or deployed boundary as an upgrade contract.

## Required check for every change

Before finishing work that changes data produced or consumed across process restarts, app versions, processes, machines, or independently updated components:

1. Identify every writer, reader, persisted copy, mirrored cache, and deployed copy of the changed shape or behavior.
2. Decide explicitly whether old data/artifacts are still valid. Do not assume optional TypeScript fields make derived data semantically current.
3. If old data is valid, keep the version and add backward-compatible parsing where needed.
4. If old data can be migrated without loss, bump the version and add an ordered migration.
5. If it is derived or disposable, bump the version and invalidate it so it is recomputed.
6. If it crosses a wire or deployed-component boundary, update compatibility ranges and every producer/consumer together. Preserve older versions when practical.
7. Add a regression test starting from the previous released version/shape. A clean-profile test is not enough.
8. Search for duplicated or mirrored versions before stopping:

   ```sh
   rg -n --hidden --glob '!node_modules' --glob '!dist' --glob '!out' \
     '(SCHEMA_VERSION|CACHE_VERSION|PROTOCOL_VERSION|STORE_VERSION|MANIFEST_VERSION|BRIDGE_VERSION|version: [0-9]+|schemaVersion)'
   ```

Version bumps are required by compatibility, not by every code edit. Record the reason beside the version or migration so the next agent can make the same decision correctly.

## Persisted data and caches

| Boundary                                          | Version location                                                                                                           | What must trigger a review                                                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite application database                       | `src/main/db/migrations.ts` (`DATABASE_MIGRATIONS`, `LATEST_SCHEMA_VERSION`)                                               | Any table, column, index, constraint, stored JSON meaning, or data repair. Append a migration; never rewrite published history.                                                                    |
| Supervisor agent-status cache                     | `src/supervisor/runtime/agentStatusService.ts` (`STATUS_CACHE_VERSION`)                                                    | Any `AgentStatus`, capability, auth, runtime-routing, detection, or derived provider result that can make a cached status stale.                                                                   |
| Renderer agent-status cache                       | `src/renderer/state/agentStatusesStore.ts` (Zustand `version`)                                                             | The same changes as the supervisor status cache. This is a second persisted copy; audit and usually bump both together.                                                                            |
| Provider usage cache                              | `src/supervisor/runtime/usageService.ts` (`USAGE_CACHE_VERSION`)                                                           | Snapshot shape or changed semantics of a cached usage result.                                                                                                                                      |
| Claude fast-mode cache                            | `src/supervisor/agents/claude/fastModeCacheCore.ts` (`CACHE_VERSION`)                                                      | Account keying or availability semantics/shape.                                                                                                                                                    |
| ACP registry icon index                           | `src/supervisor/agents/acpRegistryIcons.ts` (`ICON_INDEX_VERSION`)                                                         | Index shape, filename derivation, normalization, or cache-validity rules.                                                                                                                          |
| ACP registry extracted-artifact layout            | `src/supervisor/agents/acpRegistryInstallDir.ts` (`ACP_REGISTRY_INSTALL_LAYOUT_VERSION`)                                   | Anything that makes an already-extracted `acp-registry/<id>/<version>/bin` install invalid (mode bits, file placement). Teach `repairAcpRegistryInstallLayouts` the previous generation.           |
| Managed skill manifest                            | `src/supervisor/skills/SkillsService.ts` (`SkillManifest.version` and `.poracode-skill.json` parsing/writes)               | Manifest fields, projection/copy semantics, hashing, or ownership rules.                                                                                                                           |
| Keybindings file                                  | `src/shared/keybindings.ts` (`keybindingsFileSchema.version`) and `src/main/keybindingsFile.ts`                            | File shape, command identity, or default-binding migrations. Keep renderer writers in `src/renderer/commands/keybindingStore.ts` aligned.                                                          |
| Legacy Lightcode import marker                    | `src/main/legacyDataMigration.ts` (`MIGRATION_VERSION`, marker/request filenames)                                          | Import scope or behavior that must run again for already-migrated users.                                                                                                                           |
| Experiment persisted store                        | `src/shared/contracts/experiment.ts` (`EXPERIMENT_STORE_VERSION`)                                                          | Experiment schema/meaning. Keep `src/renderer/state/experimentStore.ts`, `src/main/db/sync.ts`, and remote experiment ownership aligned.                                                           |
| Main renderer app store                           | `src/renderer/state/appStore.ts` (Zustand `version`)                                                                       | Persisted projects, threads, view, or group-layout shape/semantics. Keep `src/renderer/state/dbStorage.ts` fallback reconstruction aligned.                                                        |
| Other renderer stores                             | `src/renderer/state/threadTodoDockStore.ts`, `sidebarUiStore.ts`, and `workspaceStore.ts` (Zustand `version`)              | Any field included by `partialize`, its meaning, defaults, or storage location. Add a `migrate` function when retaining data.                                                                      |
| Remote-server renderer store                      | `src/renderer/state/remoteServersStore.ts` (Zustand persist; currently implicit version `0`)                               | Durable server identity, token, projected projects, or `partialize` shape. Add an explicit version and migration before an incompatible change.                                                    |
| Shared settings and other unversioned JSON stores | `src/shared/settings.ts`, `src/main/sharedSettingsFile.ts`, remote auth/identity/push stores, MCP OAuth, and usage secrets | These normalize or validate instead of carrying a version. Any incompatible change still requires an explicit migration, tolerant parser, or introduction of a version field plus legacy handling. |

## Wire protocols and deployed artifacts

| Boundary                       | Version location                                                                                         | Coupled producers/consumers                                                                                                                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI hook event protocol        | `src/shared/contracts/agentEvent.ts` (`PROTOCOL_VERSION`, `MIN_PROTOCOL_VERSION`)                        | `src/supervisor/agents/plugin/forward-runtime/poracode-hook-runtime.mjs`, the OpenCode forwarder, HookIngress, and the WSL bridge. Update the latest version for envelope/intent changes; raise the minimum only when deliberately dropping compatibility. |
| Remote desktop/helper API      | `src/shared/remote/protocol.ts` (`PORACODE_REMOTE_PROTOCOL_VERSION`)                                     | Desktop server, headless server, renderer client, mobile/PWA client, snapshots, and SSH helper negotiation.                                                                                                                                                |
| Relay framing                  | `src/shared/remote/relayProtocol.ts` (`PORACODE_RELAY_PROTOCOL_VERSION`)                                 | Relay host and relay server.                                                                                                                                                                                                                               |
| Cursor SDK worker              | `src/supervisor/agents/cursor/sdkWorkerProtocol.ts` (`CURSOR_SDK_WORKER_PROTOCOL_VERSION`)               | Worker and worker client message shapes.                                                                                                                                                                                                                   |
| WSL bridge deployment          | `src/supervisor/wsl/bridge/bridge.mjs` (`BRIDGE_VERSION`)                                                | Bump for every behavioral, endpoint, auth, or wire change so existing deployed bridge copies are replaced. Its hook `PROTOCOL_VERSION` must stay compatible with the CLI hook protocol.                                                                    |
| SSH runtime build manifest     | `src/shared/sshRuntimeManifest.ts` (`SSH_RUNTIME_MANIFEST_VERSION`)                                      | Build manifest generation and `src/main/ssh/runtimeBundle.ts` validation/bundling.                                                                                                                                                                         |
| Provider hook plugins          | Every `src/supervisor/agents/*/plugin/plugin.json`                                                       | Bump the plugin semver whenever installed plugin files or their behavior change; detection/install logic uses it to replace deployed copies. Check shared forward-runtime changes against every provider plugin.                                           |
| Interactive debug session file | `.agents/skills/interactive-testing/scripts/poracode-debug-session.mjs` (`DEBUG_SESSION_SCHEMA_VERSION`) | Debug-session JSON fields or lifecycle semantics.                                                                                                                                                                                                          |

External protocol identifiers such as MCP protocol dates and ACP SDK protocol versions are negotiated standards, not Poracode cache generations. Change them only with the corresponding dependency/protocol implementation and interoperability tests.

## Mirrored-boundary rule

Some state has more than one durable layer. A version audit must follow the value end to end, not stop at the file being edited. The agent-status path is the canonical example:

```text
provider probe -> supervisor agent-status cache -> IPC/event -> renderer Zustand cache -> UI
```

If provider discovery semantics change, an old value can survive in either cache. Review both `STATUS_CACHE_VERSION` and the renderer store version, then test an upgrade fixture containing the previous version and stale data.
