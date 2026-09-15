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

| Boundary                                          | Version location                                                                                                                                                                                                                                                                                                                                                                                                                                  | What must trigger a review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite application database                       | `src/main/db/migrations.ts` (`DATABASE_MIGRATIONS`, `LATEST_SCHEMA_VERSION`)                                                                                                                                                                                                                                                                                                                                                                      | Any table, column, index, constraint, stored JSON meaning, or data repair. Append a migration; never rewrite published history.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Supervisor agent-status cache                     | `src/supervisor/runtime/agentStatusService.ts` (`STATUS_CACHE_VERSION`)                                                                                                                                                                                                                                                                                                                                                                           | Any `AgentStatus`, capability, auth, runtime-routing, detection, or derived provider result that can make a cached status stale.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Renderer agent-status cache                       | `src/renderer/state/agentStatusesStore.ts` (Zustand `version`)                                                                                                                                                                                                                                                                                                                                                                                    | The same changes as the supervisor status cache. This is a second persisted copy; audit and usually bump both together.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Provider usage cache                              | `src/supervisor/runtime/usageService.ts` (`USAGE_CACHE_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                  | Snapshot shape or changed semantics of a cached usage result.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Claude fast-mode cache                            | `src/supervisor/agents/claude/fastModeCacheCore.ts` (`CACHE_VERSION`)                                                                                                                                                                                                                                                                                                                                                                             | Account keying or availability semantics/shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ACP registry icon index                           | `src/supervisor/agents/acpRegistryIcons.ts` (`ICON_INDEX_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                | Index shape, filename derivation, normalization, or cache-validity rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Durable package-install pins                      | `src/supervisor/runtime/packageInstallPin.ts` (`PACKAGE_INSTALL_PIN_FILE_VERSION`), path in `src/shared/poracodePaths.ts` (`packageInstallPinsPath`), per-provider slot claim under `src/supervisor/agents/<provider>/` (Cursor: `sdkInstallPin.ts`)                                                                                                                                                                                              | Record shape, slot-keying, or the rule for when a recorded root is trusted versus re-derived. A mismatch is discarded, never migrated: every pin is recoverable by one successful discovery pass, so losing the memory must cost a probe and never an installation. Write only when a slot's meaning changes; readers must keep treating an unreadable or unknown-generation file as "nothing recorded".                                                                                                                                          |
| ACP registry extracted-artifact layout            | `src/supervisor/agents/acpRegistryInstallDir.ts` (`ACP_REGISTRY_INSTALL_LAYOUT_VERSION`)                                                                                                                                                                                                                                                                                                                                                          | Anything that makes an already-extracted `acp-registry/<id>/<version>/bin` install invalid (mode bits, file placement). Teach `repairAcpRegistryInstallLayouts` the previous generation.                                                                                                                                                                                                                                                                                                                                                          |
| Managed skill manifest                            | `src/supervisor/skills/SkillsService.ts` (`SkillManifest.version` and `.poracode-skill.json` parsing/writes)                                                                                                                                                                                                                                                                                                                                      | Manifest fields, projection/copy semantics, hashing, or ownership rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Keybindings file                                  | `src/shared/keybindings.ts` (`keybindingsFileSchema.version`) and `src/main/keybindingsFile.ts`                                                                                                                                                                                                                                                                                                                                                   | File shape, command identity, or default-binding migrations. Keep renderer writers in `src/renderer/commands/keybindingStore.ts` aligned.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Legacy Lightcode import marker                    | `src/main/legacyDataMigration.ts` (`MIGRATION_VERSION`, marker/request filenames)                                                                                                                                                                                                                                                                                                                                                                 | Import scope or behavior that must run again for already-migrated users.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Experiment persisted store                        | `src/shared/contracts/experiment.ts` (`EXPERIMENT_STORE_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                 | Experiment schema/meaning. Keep `src/renderer/state/experimentStore.ts`, `src/main/db/sync.ts`, and remote experiment ownership aligned.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Main renderer app store                           | `src/renderer/state/appStore.ts` (Zustand `version`)                                                                                                                                                                                                                                                                                                                                                                                              | Persisted projects, threads, view, or group-layout shape/semantics. Keep `src/renderer/state/dbStorage.ts` fallback reconstruction aligned.                                                                                                                                                                                                                                                                                                                                                                                                       |
| Other renderer stores                             | `src/renderer/state/threadTodoDockStore.ts`, `sidebarUiStore.ts`, and `workspaceStore.ts` (Zustand `version`)                                                                                                                                                                                                                                                                                                                                     | Any field included by `partialize`, its meaning, defaults, or storage location. Add a `migrate` function when retaining data.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Remote-server renderer store                      | `src/renderer/state/remoteServersStore.ts` (Zustand persist; currently implicit version `0`)                                                                                                                                                                                                                                                                                                                                                      | Durable server identity, token, projected projects, or `partialize` shape. Add an explicit version and migration before an incompatible change.                                                                                                                                                                                                                                                                                                                                                                                                   |
| iOS native multi-host catalog                     | `ios/App/App/Models/HostRecord.swift` (`HostRegistryDocument.formatVersion`), `Storage/HostRegistryStore.swift` (`directoryName`, `fileName`), `Storage/HostVault.swift` (`service`, `accountPrefix`, `journalAccount`), `Storage/HostTransactionJournal.swift` (`currentVersion`), and `Storage/LegacyHostImport.swift` (`Receipt.currentVersion`, `Tombstone.currentVersion`)                                                                   | Registry schema, host identity/LRU semantics, Keychain service or account derivation, token encoding, journal record/stage/recovery semantics, or legacy-source fingerprint/import rules. Registry format 2 is stored at Application Support `Poracode/hosts/registry.json`; secrets and journal v3 use the dedicated `com.lightcodeapp.mobile.remote.hosts` Keychain service. Journal v1 and v2 are explicitly migrated during decode. Review registry, vault, journal, import receipts/tombstones, recovery, and upgrade tests as one boundary. |
| iOS project sync preferences                      | `ios/App/App/Storage/ProjectSyncPreferences.swift` (`documentVersion`, stable `storageKey`)                                                                                                                                                                                                                                                                                                                                                       | Per-device project exclusion shape or host/project identity semantics. The versioned document is stored in `UserDefaults`; preserve unknown future documents and cover the absent pre-feature state in upgrade tests.                                                                                                                                                                                                                                                                                                                             |
| iOS AI content language preference                | `ios/App/App/Features/Settings/UI/AIContentLanguagePreference.swift` (`storageKey`)                                                                                                                                                                                                                                                                                                                                                               | The key suffix versions the device-local scalar vocabulary used to prefill commit-message and PR-summary generation requests. Adding, removing, or reinterpreting values requires a new key plus an explicit migration; unknown installed values resolve to `match-app`.                                                                                                                                                                                                                                                                          |
| iOS chat text-size preference                     | `ios/App/App/AppTheme.swift` (`PoracodeChatTextSize.storageKey`)                                                                                                                                                                                                                                                                                                                                                                                  | The versioned device-local scalar mirrors the compact PWA's 8...20 range but maps it to native Dynamic Type-aware body, command, and metadata baselines. Changing the range, default, or mapping semantics requires a new key or an explicit migration with an upgrade regression test.                                                                                                                                                                                                                                                           |
| iOS terminal text-size preferences                | `ios/App/App/Features/Terminal/TerminalTextSurface.swift` (`PoracodeTerminalTextSize.storageKey`, `projectStorageKey`)                                                                                                                                                                                                                                                                                                                            | Versioned device-local scalars independently drive agent-terminal and project-shell rendering plus PTY viewport geometry. The project key falls back to the legacy shared/agent value when absent so upgrades retain their prior size. Changing either role, range, default, fallback, scaling semantics, or cell metrics requires a new key or an explicit migration plus resize regression coverage.                                                                                                                                            |
| Android native multi-host catalog                 | `android/app/src/main/kotlin/com/poracode/app/model/HostModels.kt` (`HostRegistryDocument.FORMAT_VERSION`), `storage/HostRegistryStore.kt` (`DIRECTORY_NAME`, `FILE_NAME`), `storage/HostVault.kt` (`JOURNAL_ACCOUNT`, `account` and vault envelope), `storage/HostTransactionJournal.kt` (`VERSION`), `storage/LegacyHostImport.kt` (receipt/tombstone filenames and `VERSION`), and `security/AccessTokenCipher.kt` (`HOST_VAULT_ALIAS_PREFIX`) | Registry schema, host identity/LRU semantics, no-backup file locations, vault account/file/envelope or Keystore alias derivation, journal record/phase/recovery semantics, or legacy-source fingerprint/import rules. Registry format 2 is `hosts/registry.json`; vault envelopes, receipts, and tombstones are version 1; the journal is version 2 and explicitly accepts version 1 records. Review registry, encrypted vault files, per-account Keystore keys, journal, import artifacts, recovery, and upgrade tests as one boundary.          |
| Native push registration store                    | `src/main/remote/push/PushRegistrationStore.ts` (`PUSH_REGISTRATIONS_FILE_FORMAT_VERSION`)                                                                                                                                                                                                                                                                                                                                                        | Registration identity/keying, token ownership, routing metadata, or native alert preferences. Format 2 reads both the unversioned legacy `{ registrations }` file and format 1, then writes device-owned sound/status filters on the next mutation; routed records remain keyed by normalized `clientConnectionId`. Unknown future formats are never overwritten. Keep the remote push-registration schema, native clients, and hosted gateway payload consumers aligned.                                                                         |
| Shared settings and other unversioned JSON stores | `src/shared/settings.ts`, `src/main/sharedSettingsFile.ts`, remote auth/identity/push stores, MCP OAuth, and usage secrets                                                                                                                                                                                                                                                                                                                        | These normalize or validate instead of carrying a version. Any incompatible change still requires an explicit migration, tolerant parser, or introduction of a version field plus legacy handling.                                                                                                                                                                                                                                                                                                                                                |

The prepared settings authority in `src/backend/settings/` introduces a flat
`$poracodeSettingsVersion: 1` marker. Absence is legacy generation 0; malformed
or future markers and corrupt known values are refused without rewriting the
file. Existing migrations run over validated values while retaining unknown
fields and ciphertext on disk. The first authority commit persists that
canonical document and adds the marker. Public snapshots omit unknown fields.

`src/shared/settingsTransactions.ts` defines transaction vocabulary version 1
and subject content revisions prefixed `s1:`. Revisions express content equality,
not event ordering; an authority UUID invalidates revisions across owner
lifetimes. A volatile commit sequence orders snapshots/deltas and advances with
the cache after rename. Entry replies include containing-field revisions without
copying those field values; whole-field changes refresh affected entry revisions.
Clients bind callbacks and one-use read tokens to a connection generation. A
sequence gap sets a required publication floor: a refresh must cover the highest
observed sequence before it can replace client state. Insufficient refreshes
explicitly request another read; authority changes require a new connection and
invalidate older callbacks. None of this metadata is persisted in settings.

The inactive authority has explicit initial ceilings of 128 pending transactions
(including the active write), 4 MiB of queued UTF-8 request bytes, and 1 MiB per
request. These are admission bounds, not measured throughput budgets. Oversized
or full-queue requests return an overload outcome; they do not join the queue or
implicitly repeat. Parse failures and every settlement path release capacity.

Serialized commits sync a unique temporary file before rename, then
attempt directory sync. A directory-sync error reports separately from the
already committed result. Process-crash tests do not establish power-loss
durability or exactly-once request receipts.

This foundation is not connected to the live writers yet. Activation must remove
every old settings writer, finish leased-root import/key preparation first, and
coordinate the backend-host, renderer-stream, remote/native and supervisor
reverse-service fences. Current live wire versions remain unchanged until that
composition is complete; native release and full F2/Phase 1 gates remain open.

## Wire protocols and deployed artifacts

| Boundary                             | Version location                                                                                                                                                                                                                                                                | Coupled producers/consumers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI hook event protocol              | `src/shared/contracts/agentEvent.ts` (`PROTOCOL_VERSION`, `MIN_PROTOCOL_VERSION`)                                                                                                                                                                                               | `src/supervisor/agents/plugin/forward-runtime/poracode-hook-runtime.mjs`, the OpenCode forwarder, HookIngress, and the WSL bridge. Update the latest version for envelope/intent changes; raise the minimum only when deliberately dropping compatibility.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Remote desktop/helper API            | `src/shared/remote/protocol.ts` (`PORACODE_REMOTE_PROTOCOL_VERSION`)                                                                                                                                                                                                            | Desktop server, headless server, renderer client, mobile/PWA client, snapshots, and SSH helper negotiation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Remote binding-format IR             | `src/shared/remote/contract/versions.ts` (`REMOTE_BINDING_FORMAT_VERSION = 2`, `REMOTE_GENERATOR_VERSION = 3`), `src/shared/remote/contract/{generate,hashes}.ts`, and `protocol/remote/v3/generated/{inventory.json,ir.json,json-schema.bundle.json}`                          | Binding format 2 covers the normalized IR / JSON Schema 2020-12 envelope and binding semantics; generator 3 adds executable native root validation, portable transforms, and Zod-compatible default semantics while retaining the format-2 IR boundary. `sourceHash` and `manifestHash` are derived integrity values from the live authority and manifest, so regenerate them with `pnpm protocol:remote:v3:generate`, keep `pnpm protocol:remote:v3:check` green, and never hardcode their current values in this inventory. Audit the binding-format version for IR/schema/envelope or wire-encoding semantic changes and the generator version for generation-algorithm changes, even when the remote wire protocol version stays unchanged.                                                                                                                                                                                                                                                                 |
| Remote native binding bundle         | `src/shared/remote/contract/native/generate.ts` (`NATIVE_BINDINGS_MANIFEST_FORMAT_VERSION = 1`), `protocol/remote/v3/generated/native/native-bindings.json`, and the recursively generated `protocol/remote/v3/generated/native/{swift,kotlin}/` trees                          | Bundle format 1 inventories every generated Swift/Kotlin artifact; `native-bindings.json` `languages.*.files` is the authoritative recursive membership list, including each path, digest, byte count, and line count. Any native generator ABI/API change, semantic-validation behavior or metadata change, union/discriminator codec change, or optional/null/unknown-field representation change requires an intentional audit of both this bundle format and the upstream binding/generator versions. Regenerate rather than hand-editing; stale, missing, or extra tree members must fail `pnpm protocol:remote:v3:check`.                                                                                                                                                                                                                                                                                                                                                                                 |
| Remote native parity ledger          | `protocol/remote/v3/native-parity.json` (`formatVersion = 1`, `protocolVersion = 12`)                                                                                                                                                                                           | Format 1 assigns every remote route, procedure, WebSocket message/event, and runtime event to one native implementation batch with per-platform disposition and evidence. Any ledger shape or disposition-semantics change requires a format-version audit. A protocol-version mismatch or any manifest inventory addition, removal, or rename invalidates the ledger and must fail until the complete ledger is reviewed and updated. The `remote/v3` directory name is the established contract-generation family, not the current wire protocol number.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Remote thread command variants       | `src/shared/contracts/thread.ts` (`remoteThreadCommandSchema`), `src/main/remote/server/threadCommands.ts`, renderer command mirroring, and native `ThreadRemoteCommand` mirrors                                                                                                | New discriminator variants are additive within a wire-protocol version only when all existing payloads retain their encoding and older hosts reject the unknown variant before mutation. Update host durability, renderer mirroring, generated Swift/Kotlin bindings, native manual encoders, and route goldens together. `clear-group` also dissolves a one-member remainder so every persisted/mirrored layer keeps the same grouping invariant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Native E2E coverage ledger           | `tests/native-e2e/harness/versions.ts` (`NATIVE_E2E_LEDGER_FORMAT_VERSION = 2`, `NATIVE_E2E_OPERATION_MAP_VERSION = 1`), `tests/native-e2e/harness/{coverageLedger,operationMap}.ts`, and `tests/native-e2e/harness/operation-map.json`                                         | Ledger format 2 versions the per-operation evidence, status, counts, and completion projections. The operation-map `manifestHash` is a derived boundary over the current protocol manifest identity/format, generated inventory `sourceHash`, and sorted route/procedure/WebSocket/replay/runtime operation keys; never hardcode its current value in this inventory. A ledger shape/meaning change requires a ledger-format audit; a manifest/inventory/key derivation or hash-algorithm change requires regenerating and reviewing the committed operation map and its consumers.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Android push channel IDs             | `website/src/lib/push/fcm.ts` (`STATUS_CHANNEL_ID = "poracode_status_v1"`, `ATTENTION_CHANNEL_ID = "poracode_attention_v1"`)                                                                                                                                                    | These IDs are durable Android OS-facing identifiers carried in FCM `channel_id`: silent status updates use `poracode_status_v1`, while attention notifications use `poracode_attention_v1`. The native Android app must create matching channels. Do not rename an ID or reuse it for different sound, importance, or user-visible semantics; introduce a new versioned ID and coordinate gateway and native creation/migration instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| iOS notification delivery preference | `ios/App/App/Features/Notifications/NotificationPermissionController.swift` (`NotificationDeliveryPreference.storageKey`)                                                                                                                                                       | The device-local master switch defaults on for upgrades and unregisters the exact APNs routing identity from every paired host when disabled. Changing its meaning, default, or storage shape requires a new versioned key and an explicit migration; pending unregister entries must drain before a route can register again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| iOS notification alert preferences   | `ios/App/App/Features/Notifications/NotificationPermissionController.swift` (`NotificationAlertPreference.*StorageKey`)                                                                                                                                                         | Sound, foreground presentation, and each alert-category filter are device-local, default on/always for upgrade compatibility, and sync to every paired host as optional native push-registration metadata. Changing defaults or meaning requires new versioned keys; background delivery filtering must remain host-enforced because iOS renders APNs alerts before launching the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Android project sync preferences     | `android/app/src/main/kotlin/com/poracode/app/storage/ProjectSyncPreferences.kt` (`DOCUMENT_VERSION`)                                                                                                                                                                           | Device-local project exclusions are keyed by client connection and project ID, default to synced for upgrades, and filter Home utilities, quick compose, and project rows without mutating the host. Changing scope, default, document shape, or inclusion semantics requires a version migration; future-version documents must never be overwritten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Android device settings              | `android/app/src/main/kotlin/com/poracode/app/storage/DeviceSettingsPreferences.kt` (`DOCUMENT_VERSION`)                                                                                                                                                                        | Versioned device-local appearance, chat typography, and agent/project terminal typography. Defaults preserve the pre-feature system/dynamic theme, Material 14sp/20sp chat body, and 13sp terminal text. Changing defaults, value meaning, or document shape requires migration; future-version documents must never be overwritten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| iOS Create PR mode                   | `ios/App/App/Features/Projects/GitHubOperations/GitHubOperationsPresentation.swift` (`GitHubPullRequestCreationMode.storageKey`)                                                                                                                                                | Device-local default for the native Create Pull Request primary action. `dialog` preserves the released editable-sheet behavior; `auto` generates a summary with the selected host's commit-generation settings and immediately performs one exact-host PR mutation. Changing this vocabulary or default requires a new versioned key and migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| iOS GitHub workflow pins             | `ios/App/App/Features/GitHubActions/GitHubActionsPageView.swift` (`GitHubWorkflowPinPreferences.storageKey`, `documentVersion`)                                                                                                                                                 | Device-local pinned workflow IDs are scoped by desktop and project. Changing the scope, ID meaning, document shape, or ordering semantics requires a new key/document version and an upgrade regression test; future-version documents must never be overwritten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Remote terminal cursor-sync          | `src/shared/remote/protocol.ts` (`TERMINAL_CURSOR_SYNC_VERSION`, `TERMINAL_CURSOR_SYNC_V2_VERSION`), `src/main/remote/server/terminalCursorSync.ts` (`TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS`), `protocol/remote/v3/manifest.json` (`compatibility.terminalOutput.cursorSync`) | Additive capability under the current remote protocol / manifest `formatVersion` 1. Advertised in environment `capabilities.terminalCursorSync.versions` (currently `[1, 2]`). Version 2 adds byte-budgeted chunked baselines and cumulative ACK credit; version-1 watches retain their framing. Client `terminal-watch.cursorSync.version` accepts any positive int; unsupported versions get a non-retryable `unavailable` watch-result and install no reliable watch. Wire frames keep legacy byte shapes when the capability is absent. `generation: null` on snapshots is replace-only and never append-compatible. Cursors are **JS string code units** (UTF-16 / `String.length`), not code points — astral planes and surrogate pairs are two units; do not change unit space without a capability bump. One reliable or legacy watch per `(connection, terminalId)` (rewatch replaces; no dual streams). Keep goldens, conformance, server registry, and mobile protocol mirrors aligned when bumping. |
| Remote native push routing           | `src/shared/remote/protocol.ts` (`REMOTE_PUSH_ROUTING_VERSION`), `src/main/remote/push/PushRegistrationStore.ts`, `src/main/remote/push/pushRouting.ts`, and `website/src/lib/push/{validate,fcm}.ts`                                                                           | Additive capability under remote protocol v3. Environment advertises `capabilities.pushRouting.versions` (currently `[1]`). A client opts in by registering the complete `{ version, clientConnectionId, desktopId }` routing identity; legacy registrations and payloads remain accepted. Native payload v1 carries that identity plus `threadId`; APNs custom data is outside `aps`, while FCM data values are strings. Update host, hosted gateway, and native consumers together before adding a version.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Relay framing                        | `src/shared/remote/relayProtocol.ts` (`PORACODE_RELAY_PROTOCOL_VERSION`)                                                                                                                                                                                                        | Relay host and relay server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Cursor SDK worker                    | `src/supervisor/agents/cursor/sdkWorkerProtocol.ts` (`CURSOR_SDK_WORKER_PROTOCOL_VERSION`)                                                                                                                                                                                      | Worker and worker client message shapes and required lifecycle behavior. Version 3 requires detached SDK cancellation handling so a stale helper cannot kill a parent and its subagents on a transport abort; message shapes remain unchanged. Version 2 added `sdk.pinnedRoot` to discovery requests and `packageRoot` to the probe result; both ends ship together and the native helper under `resources/wsl-helpers` is staged from the same source, so a stale staged copy must fail the handshake rather than ignore the field.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| WSL bridge deployment                | `src/supervisor/wsl/bridge/bridge.mjs` (`BRIDGE_VERSION`)                                                                                                                                                                                                                       | Bump for every behavioral, endpoint, auth, or wire change so existing deployed bridge copies are replaced. Its hook `PROTOCOL_VERSION` must stay compatible with the CLI hook protocol.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| SSH runtime build manifest           | `src/shared/sshRuntimeManifest.ts` (`SSH_RUNTIME_MANIFEST_VERSION`)                                                                                                                                                                                                             | `src/build/runtimeDeclarationPlugin.ts` source/code/resource declarations, `src/main/ssh/runtimeBuildManifests.ts` validation before memory/disk cache reuse, and `src/main/ssh/runtimeBundle.ts` staged verification. Generation 4 carries settings capture metadata; owner-control generation 3 and settings generation 4 require fresh combined generation 5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Supervisor code capture              | `src/shared/runtimeCodeManifest.ts` (`RUNTIME_CAPTURE_PROTOCOL_VERSION`, currently 1)                                                                                                                                                                                           | `src/main/supervisor/runtimeManifest.ts`, `capturedRuntime.ts`, and serialized `capturedRuntimeBootstrap.ts` share the bounded declaration/session protocol. The production supervisor still advertises settings service 0 and `SupervisorClient` does not activate capture; settings reverse-service 1 and all-writer authority conversion remain required together. External dependencies, native libraries, separate workers and executable resources are outside the captured-code guarantee.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Provider hook plugins                | Every `src/supervisor/agents/*/plugin/plugin.json`                                                                                                                                                                                                                              | Bump the plugin semver whenever installed plugin files or their behavior change; detection/install logic uses it to replace deployed copies. Check shared forward-runtime changes against every provider plugin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Computer-use native helper           | `src/shared/contracts/computerUse.ts` (`COMPUTER_USE_HELPER_PROTOCOL_VERSION`) and `native/computer-use-helper/src/protocol/version.rs`                                                                                                                                         | Any helper request, response, capability, or delivery contract. Keep both constants equal, update the protocol fixture, and bump the bundled computer-use plugin semver when deployed helper behavior changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Interactive debug session file       | `.agents/skills/interactive-testing/scripts/poracode-debug-session.mjs` (`DEBUG_SESSION_SCHEMA_VERSION`)                                                                                                                                                                        | Debug-session JSON fields or lifecycle semantics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

External protocol identifiers such as MCP protocol dates and ACP SDK protocol versions are negotiated standards, not Poracode cache generations. Change them only with the corresponding dependency/protocol implementation and interoperability tests.

Crossagents plugin `1.6.0` updates the bundled skills, MCP guidance and prepared worker prompts.
`steer_agent` still accepts the previous `{ run_id, prompt }` request, but now waits for a
normal run result by default. `background: true` returns `accepted` without waiting for the result;
wait/output options are additive. The plugin manifest also supplies the MCP server version.
Completed structured workers can resume their same provider session through `steer_agent`;
the additive `continued_from` receipt identifies a new run ID for that turn, preserving old
reports, cursors and workflow joins. `list_runs.can_steer` includes resumable completed workers,
and `continued_by` directs old receipts to the latest turn. Resume is memory-only and capability
gated, never a fallback to a new conversation. Compact envelope version 1 is unchanged; its
prompt clarifies existing string-array and finding semantics without changing the schema.
Existing skill projections refresh by source content, and user skill overrides continue to
win over older bundles. No stored run state or compact-report shape changes; workflows and
runs remain memory-only. An already connected client must reload its tool catalog and skill
to use new behavior consistently. Keep old-host guidance in the skill until those clients
upgrade; instruction changes alone do not add newer server capabilities.

Crossagents plugin `1.7.0` reduces repeated initialization guidance and the core skills,
uses compact JSON whitespace for tool results without changing their decoded shape, and
adds an optional exact `model` filter to `get_agent`. Omitting the filter retains the full
provider response. Instruction/payload footprint gates and previous-bundle tests include
`1.6.0`; existing clients must refresh their catalog/skill to use the smaller setup path.
The compact report schema, session continuation semantics and 240-second wait cap are unchanged.

Crossagents plugin `1.8.0` raises the default/cap from 240 to 480 seconds and the
configured client deadline from 300 to 600 seconds. Authenticated tool responses
flush headers and legal leading JSON whitespace every 30 seconds while pending,
so HTTP header/body idle limits do not terminate the longer wait. Responses still
contain one JSON-RPC value; no MCP protocol date or compact-report schema changes.
Standalone and batch waits now wake for pending input/approval, as workflows already
do; deadlines never cancel workers. Prior-bundle tests include `1.7.0`. Existing
provider sessions need fresh MCP configuration; an updated skill alone cannot raise
an older host's cap or client timeout.

## Host ownership and local control

The standalone entry now consumes the shared ownership boundary; desktop entry
wiring remains pending. [Host ownership](../../docs/HOST_OWNERSHIP.md) describes
the active headless mapping, credential/import refusals and shutdown obligations.
Audit these separate identities together before changing their meaning:

| Boundary                   | Current version/source                                                                     | Compatibility requirement                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owned root layout          | `HOST_ROOT_LAYOUT_VERSION = 1`, `hostRootPaths.ts` / `hostRootManifest.ts`                 | Map the original namespace once to its sibling; reject unknown layouts and staged activation.                                                                              |
| Permanent lease / metadata | SQLite `user_version = 1` / owner format 1, `hostOwnerLease.ts`                            | Never replace an unknown lease; PID metadata is informational. Keep strong lease retention and the unmanaged-descriptor prohibition.                                       |
| Credential provenance      | `HOST_CREDENTIAL_STATE_VERSION = 1`, `hostCredentialState.ts`                              | Root, mode and fingerprint must match; malformed or cross-mode state never rotates silently.                                                                               |
| Offline import receipt     | `HOST_IMPORT_RECEIPT_VERSION = 1`, `stageHostImport.ts`                                    | Imported state requires activation and later inventory revalidation; ephemeral control discovery is excluded.                                                              |
| Local management wire      | `HOST_CONTROL_PROTOCOL_VERSION = 1`, `hostControlProtocol.ts`                              | Closed operations, generation-bound HMAC request/response proofs; no bearer or PID-signal fallback.                                                                        |
| Private control discovery  | `HOST_CONTROL_DISCOVERY_VERSION = 1`, `hostControlProtocol.ts` / `hostControlDiscovery.ts` | Bounded private file, exact namespace/root/generation, authenticated running peer.                                                                                         |
| SSH deployment manifest    | `SSH_RUNTIME_MANIFEST_VERSION = 3`, `sshRuntimeManifest.ts`                                | Refuse predecessor manifests 1/2 for the changed owner/pair command. Settings preflight reserves 4; the combined deployment must use fresh 5 and validate warm caches too. |

Only the kernel lease grants ownership. Never open an existing leased SQLite
inode through an unmanaged descriptor in its owning process: closing it can
release POSIX file locks. `cancelStartup()` retains this lease for runtime drain;
only final joined `close()` releases it. The existing unversioned headless-key
and relay-secret byte formats remain valid inside their root-bound provenance;
blank, malformed or mismatched state is refused rather than converted.

## Electron preload compatibility

The Electron preload must advertise `clientRuntimeVersion` from
`PORACODE_CLIENT_RUNTIME_VERSION`. The renderer checks this peer value before
creating its transport. Version 8 required the native quick-composer show
subscription; absent, version-6, and version-7 preload artifacts are rejected.
Version 9 stays RESERVED for the settings-authority activation. Version 10 is
the per-window delivery-ownership boundary (V4 F7 correction): the facade
additionally requires the generation-fenced recovery-barrier listener
(`onRendererStreamRecovery`) and the per-window ownership grant
(`getRendererStreamOwnershipGrant`). An older preload cannot honor recovery
barriers, so a version-8/9 preload paired with a version-10 renderer would
silently trust a cursor advanced past missing bulk after socket loss — the
version gate rejects that pairing loudly instead. Version 11 is the off-main
remote HTTP bridge boundary (V4 F8): the preload must expose
`remoteHttpBridgeVersion` plus `openRemoteHttpBridge`/`cancelRemoteHttpBridge`
and forward each request's `MessagePort` into the main world. A version-10
preload cannot deliver those ports, and the renderer no longer has a
full-body main-process HTTP path, so the facade gate must reject the pairing
loudly rather than fall back to buffering every remote response through main.
Browser runtimes use the same local facade version; this desktop boundary does
not change the remote wire, backend-host protocol, or persisted state.

## Off-main remote HTTP bridge contract (facade 11 / bridge frame set 2)

`src/shared/remote/httpBridgeProtocol.ts` owns the versioned frame set for the
utility-process HTTP bridge introduced by V4 F8; main-side admission schemas
live in `src/shared/remote/httpBridgeValidation.ts`.

- `REMOTE_HTTP_BRIDGE_VERSION = 2` gates two surfaces: main → utility control
  messages (`open` with the admission descriptor, `cancel`, `abort-window`,
  `abort-all`, `stats-query`) and the per-request renderer ⇄ utility port
  frames (`upload-chunk`, `upload-end`, `credit`, `cancel` upstream;
  `upload-grant`, `head`, `chunk`, `end`, `error` downstream). Worker → main
  `settled` and `stats-reply` messages close the control loop.
- Version 2 is an intentional bump with real compatibility meaning: v2 adds
  the downstream `upload-grant` acknowledgement that makes uploads
  admission-gated and credit-bounded, and it gives responses a metadata budget
  separate from the stricter request budget (a v1 renderer would post a whole
  body before utility admission and reject legal response header shapes). The
  version is mirrored by the preload's advertised `remoteHttpBridgeVersion`
  marker and the renderer client's `resolveDefaultTransport` gate, so a
  mismatched pairing is rejected loudly even at the same facade 11.
- The renderer facade version `PORACODE_CLIENT_RUNTIME_VERSION` moved 10 → 11
  for this milestone (see above) and stays 11 for both corrections: the
  required preload API shape (`remoteHttpBridgeVersion`, open/cancel, port
  forwarding) is unchanged, and the bridge frame-set gate rejects a mixed
  frame set on its own. Facade 9 stays RESERVED.
- Correction 2 keeps frame set 2: admission is reserved synchronously before
  the shared utility start yields (caps include pending starts, and pre-port
  cancels/window lifecycle events retire the reservation), the post-await
  revalidation plus expected-record-identity releases fence a stale
  continuation or settlement from a reused id, the utility emits its existing
  `settled` control frame for valid rejected opens so main releases the slot
  immediately (duplicate and malformed descriptors emit nothing), upload chunks
  are posted as exact-length copies instead of subarray views of the caller's
  backing store, and the utility clamps accumulated response credit to the
  advertised 1 MiB ceiling. None of these changes a frame shape, so no version
  bump; the peer inventory (preload marker, renderer gate, utility entry,
  preload port forwarding, packaging `asarUnpack`) is unchanged.
- Compatibility: a generation mismatch closes the request and settles it; no
  frame may revive a retired request or consume another request's credit. Any
  descriptor/frame shape change requires auditing the utility entry
  (`dist/main/remoteHttpBridge.cjs`), the preload port forwarding, the
  supervisor admission path, the renderer bridge client, and the direct-mock
  suites together.
- No persisted state participates: the bridge is process-lifetime only, so
  there is no migration. The packaging boundary is audited by the
  `dist/main/remoteHttpBridge.cjs` entry in `tsdown.config.ts` plus its
  `asarUnpack` entry in `scripts/build-desktop-artifact.mjs` (a packaged
  utility child must start from a real file path).
- Bounds pinned by tests: 64 MiB response body, 64 MiB request body, 96 MiB
  aggregate upload account (declared reservation + retained bytes; committed
  utility memory, not total RSS), 1 MiB response credit enforced on both the
  client grant and the utility accumulator, 1 MiB upload credit window,
  64/128 active requests per window/global including pending cold-start
  reservations, request metadata 64 headers/8 KiB value/32 KiB total, response
  metadata 4096 headers/16 KiB value/64 KiB total, and a 60 s whole-request
  deadline with the pre-F8 error message. The remote wire protocol (12), relay,
  and native clients are untouched by this local boundary.
- Diagnostic seam (unchanged by the correction): `PORACODE_REMOTE_HTTP_BRIDGE_DEBUG=1`
  enables utility settle logging and main lifecycle lines, but desktop builds
  minify with `dropConsole`, so those logs exist only in development builds.
  `PORACODE_REMOTE_HTTP_BRIDGE_INSPECT_PORT` forks the utility with
  `--inspect=127.0.0.1:<port>` only when `!app.isPackaged`; packaged
  verification must rely on the packaged main-process inspector and the
  payload-free stats/memory probes instead.

  Qualification note (F8 publication, 2026-09-14): this boundary is qualified
  on the frozen candidate (source SHA `74dcf4e0…c983`, bridge 2 / facade 11)
  by the independent source + real-transport and full-mock + packaged-UI
  evidence recorded in `docs/V4_EXECUTION_LOG.md`. Publication commits the
  candidate as-is with no version change.

## Local delivery-ownership wire boundary (backend-host 13 / renderer stream 5)

The V4 F7 correction consumed three previously unused versions for one
incompatible handoff, chosen deliberately around the active reservations:

- `BACKEND_HOST_PROTOCOL_VERSION` 7 → 13 in `src/shared/backendHostProtocol.ts`
  — `set-renderer-stream-ownership` now carries a per-window
  grant+interests table (every entry carries its minted grant — main mints
  identity and generation before publishing interests, so the former
  `grant: null` sentinel has no supported producer — plus the explicit
  `receivesShellRemainder` role that keeps the shell-recipient window's
  controls exact-once), `supervisor-event` envelopes gained a targeted
  `windowId`/`generation` recipient, the untargeted shell copy no longer
  carries a sequence, `call-supervisor` carries an authenticated
  `originWindowId` (main-assigned from the IPC sender, or the
  backend-validated stream bind) that scopes terminal-bootstrap retention to
  the requesting window, and the new `renderer-stream-recovery` kind announces
  generation-fenced loss windows through the ordered desktop-IPC fallback.
  Versions 8-12 remain RESERVED for their recorded V4 activations (owner
  bootstrap 8, settings authority 9, the superseded two-parent combination 10,
  private usage-secret 11, and 12 for the eventual combined contract); this
  milestone deliberately skipped them.
- `BACKEND_RENDERER_STREAM_VERSION` 3 → 5 — the interests-frame version gates
  recovery ordering and the acknowledged-handoff cursor semantics; a v3/v4
  frame is closed with 1008 instead of being half-owned. Version 4 remains
  RESERVED for the settings-authority activation and was deliberately skipped.
- `PORACODE_CLIENT_RUNTIME_VERSION` 8 → 10 (see above); facade 9 stays
  RESERVED.

Old-artifact rejection is regression-covered at every boundary (request and
outbound version gates, stream-info version checks, and the renderer facade
check), and a stale backend that never receives the per-window table keeps the
legacy full-relay behavior instead of starving fallback windows. The remote
wire protocol and its reserved remote 13 are unrelated to this local boundary
and untouched by it.

Final-correction note (same uncommitted candidate, same 13/5/10 versions): the
v13 table shape was audited and tightened after independent review — the
grant-less sentinel was removed (recovery-barrier and delivery targets now
always fence to a real generation ≥ 1; `RENDERER_STREAM_UNGRANTED_GENERATION`
survives only as the renderer-presented fallback when a grant pull has not
confirmed), the shell-remainder role was added, and the call-supervisor origin
field was added. Because 13 was never shipped, the shape change does not
consume a new version; the acceptance tests at every mirror (protocol gate,
ownership registry, delivery-table builder, host client, grant authority) pin
the final shape.

Integration-replay note (same uncommitted candidate, same 13/5/10 versions):
after the local F7 batch was replayed onto the five incoming `poracode/v2`
commits and `origin/master` (#765) was resolved in, a third review round fixed
main-side publication and dispatch only — the per-window table is republished
for every per-window interest/identity change even when the merged union is
unchanged (a dedicated wiring helper), native/sleep handling is applied exactly
once on the shell/legacy path instead of on every targeted copy, grant-authority
sync failures are reported through its `onError` callback instead of rejecting
into fire-and-forget callers, and the `call-supervisor` envelope is again built
by one shared origin-aware builder used by both ends. None of these change the
wire shape or any version identifier; the never-shipped 13/5/10 boundary is
unchanged, and the remote/native protocols remain untouched.

Final boundary-correction note (same uncommitted candidate, same 13/5/10
versions): the independent integrated review proved the quick-composer
duplicate suppression keyed on object identity that cannot survive the
backend-host IPC boundary — the targeted copy and the shell remainder are
separate messages, so each `process.send` produces a distinct object in main.
The correction is main-local only: `createRendererEventDispatcher` never sends
a targeted agent-status copy to the quick composer window, and the shell
forward is the overlay's single delivery path (a directly owned overlay keeps
its direct stream; a hidden overlay refetches on show). No envelope shape,
operation, payload field, or version identifier changes, so host 13 / stream 5
/ facade 10 remain correct and no migration or new pre-upgrade fixture is
required for a change that only alters which already-versioned envelope main
forwards. Reserved host 8-12, stream 4, and facade 9 remain unconsumed, and the
existing mixed-pairing gates (protocol request/outbound gates, stream-info
version check, interests-frame version close, facade version check) still
reject older peers.

## Bounded large-reply transfer candidate (renderer stream 5 → 6, uncommitted)

Phase 3 item-6 candidate (working tree only, not published): the direct
renderer stream moves 5 → 6 for bounded large-reply transfer while host 13,
facade 11, HTTP bridge frame set 2, remote wire 12, and relay 3 stay unchanged.

- `BACKEND_RENDERER_STREAM_VERSION` 5 → 6 in
  `src/shared/backendHostProtocol.ts` — backend → renderer adds
  `reply-start`/`reply-chunk`/`reply-end`/`reply-abort` and renderer → backend
  adds `reply-ack`/`request-cancel`, all version-gated. A v5 peer fails the
  same loud gates as before (1008 on frames, IPC fallback on stream info) and
  never receives chunked frames. No new host IPC shape, no preload/facade
  change, no F8 bridge/remote/relay frame change.
- Budgets (all regression-pinned): logical serialized reply ≤ 64 MiB UTF-8;
  complete encoded data frame ≤ 64 KiB; receiver credit ≤ 2 chunks / 128 KiB
  unacked per transfer (ACK only after validation/acceptance; 30 s credit stall
  aborts that transfer with a bounded error, socket alive, ownership kept);
  delivery ≤ 2 large/client with 64 MiB retained serialized bytes/client and
  ≤ 4 large / 128 MiB global (exactly-once reserve/release); execution 64 /
  client (cancelled-but-unsettled counts) plus a new 128 outstanding
  direct-handler global that survives disconnect/reconnect orphans. Delivery
  cancellation frees delivery buffers promptly while the handler slot is held
  until real settlement; late completion never publishes, never replays, never
  reroutes over main IPC. Fragmentation applies to any valid `ok:true` reply
  (no procedure whitelist — chunking never re-executes the handler).
- Compatibility mirrors: old-stream v5 info rejected / v6 accepted at the
  main/host-client gate, preload info gate, transport v5-1008 / v6-ok in both
  directions, and stale-host fixtures (`src/main/backend/
rendererStreamVersionGate.test.ts`, renderer transport + backend suites).
- Qualification status (candidate, 2026-09-14): focused suites only —
  framing/slicing (5), reassembly (8), transport wiring (6), backend delivery
  incl. 2 MiB hash equality / Unicode-escaping / 64 MiB and +1 / credit /
  sibling / mutation-once (7), admission/cancel/orphan/version (6), smoke hash
  (1); adjacent pre-existing stream/transport suites (65); `tsc`, `oxlint`
  (plain + type-aware on touched files), `oxfmt` green. No full-repo
  build/test, no live app/CI verification in this lane — those run once on the
  frozen milestone candidate with the renderer/iOS lanes.

## Native mock controls

`src/main/testing/smokeNativeControls.ts` owns the separate version-2 QA bridge
and versioned channels. The preload and Quick Composer smoke driver must agree;
version-1 drivers are rejected. Version 2 adds native `BrowserWindow.close()` and
`app.quit()` probes. Registration requires development mode, an unpackaged app,
mock agents, and the current main window's top frame. It adds no public
ClientRuntime, backend-host, or remote operation. HTML `window.close()` is not a
substitute for the native close callback in a sandboxed Electron renderer.

## Measurement evidence

`ProcessMemorySummary` in `tests/native-e2e/helpers/processMemorySampler.ts` emits
`samplerVersion: 3`; `HostLoadSummary` in the adjacent `hostLoadSampler.ts` emits
`samplerVersion: 2`. Both use asynchronous probes, a fixed delay after each
completed probe, and a joined `stop()` before evidence serialization. Their
`sampling` field records probe duration and unexpected failures. These versions
distinguish the new observer from older synchronous probes, which blocked the
test client's event loop and could contaminate latency measurements.

Host-load scenario windows and summaries are asynchronous: they capture the
window end before joining the pending probe. `buildMetricsArtifact` emits
`metricsVersion: 2` and copies raw per-client samples, keeping those samples
consistent with the captured aggregates while observer completion is awaited.
Unversioned metrics retained live array references and were only safe to
serialize without an intervening asynchronous boundary.

Memory version 2 already corrected own-process RSS peak accounting. Earlier
unversioned reports contain a last-sample value in that field and must be
remeasured before use as peak-memory evidence. Machine load and foreign-tool
presence are contention indicators, not process CPU measurements or proof of an
idle machine. Keep measurement versions separate from the application's wire and
storage versions, and record both with the exact tested artifact.

`ProcessCpuSampler` emits its independent `samplerVersion: 1`. It records
per-process cumulative CPU deltas only between matching PID/start identities,
with counter resolution, missing roots, discarded counter regressions, untracked
identities and lost exit tails explicit. It is partial external POSIX observation,
not complete CPU accounting or a strict lower bound: counter quantization can
overstate a short interval. Windows reports an unsupported platform rather than
valid zero usage. The 4,096 cap bounds historical metric records; the most recent
tree is separately bounded by the 8 MiB process-output limit. Preserve these
limits when supplementing in-process CPU/event-loop traces.

`src/shared/diagnostics/processPerformanceSampler.ts` retains process-sample
format 1. The surrounding local NDJSON evidence envelope in
`nodePerformanceDiagnostics.ts` is now format 2: it declares process-sample format
1 and IPC-queue sample format 1 independently. Existing format-1 evidence remains
unchanged; each run creates new exclusive files. Readers must check the envelope
version before interpreting its samples. With `PORACODE_PERF_OUTPUT_DIR` set to an existing absolute directory,
the desktop main, backend, supervisor, standalone server and relay write distinct
private NDJSON files. No collector starts by default. CPU/RSS are process-wide;
event loop, heap and GC describe the current thread/isolate. Completed callback
intervals are assigned at capture, can span a window boundary, and include the
configured timer period. The unfinished callback tail is recorded separately.
This method is distinct from native timer/iteration histograms; do not compare
their percentiles as if they were the same measurement.

The reporting interval defaults to 1,000 ms (`PORACODE_PERF_INTERVAL_MS`, range
100–60,000). The per-file cap defaults to 64 MiB (`PORACODE_PERF_MAX_BYTES`, range
64 KiB–512 MiB). Output serializes at most four pending 16 KiB records; overflow,
budget exhaustion and I/O failures invalidate that recording. Normal shutdown
attempts a final sample and end marker, with at most 500 ms added for diagnostic
output. A missing/truncated end marker or incomplete-output warning cannot qualify
a gate. Successful writes are not a power-loss durability guarantee. No message
content, argv, environment dump or credentials are recorded. The observer's CPU
and timer work is included; qualify its overhead against a disabled control.

Format 2 adds opt-in observations for the application waiting queues from main to
backend, backend to main, and supervisor to its host (backend or standalone
server). Registration is limited to those three names with one current reader
each; the recorder copies only the fixed numeric/boolean schema and a random
sender-instance UUID. Sender replacement changes that UUID. An absent sender is
`unavailable`, a failed/invalid observation is `error`, and an unregistered queue
is absent. None means measured zero. A complete end marker describes file output,
not queue-observation coverage or successful delivery.

Waiting bytes are the existing sender admission estimates, not native IPC buffer
measurements. Age starts at initial waiting-queue admission; a queued retry keeps
that time, and merging an existing recovery marker preserves the marker's age.
Any missing/invalid admission time makes the oldest age unknown. In-flight counts
and send-adapter attempts (including a local adapter rejection) are separate from
waiting messages and are not peer processing acknowledgments. Terminal coalescer count is separate; its bytes/ages and other
transport queues remain outside this measurement. Per-sample queue collection
work is reported separately from process sampler work. With diagnostics disabled,
the sender creates no probe or admission timestamps; the optional code branches
remain, so this is not a claim of zero overhead.
Stopping the recorder, including budget/error stops, also ends the shared capture
lifetime; existing senders stop timestamps/counters and replacement senders do
not reactivate them. Application message admission and delivery continue normally.

## Mirrored-boundary rule

Some state has more than one durable layer. A version audit must follow the value end to end, not stop at the file being edited. The agent-status path is the canonical example:

```text
provider probe -> supervisor agent-status cache -> IPC/event -> renderer Zustand cache -> UI
```

If provider discovery semantics change, an old value can survive in either cache. Review both `STATUS_CACHE_VERSION` and the renderer store version, then test an upgrade fixture containing the previous version and stale data.
