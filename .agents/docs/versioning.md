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

**Activation status (Gates 2–3 batch 1, lane 1B):** one `SettingsAuthority` per
composition is now the only settings writer for its process. The desktop
backend (`BackendSettingsService.createBackendSettingsAccess`) and the headless
composition (`src/server/headlessSettingsAuthority.ts`) both open the authority
against the leased root; `setSharedSettings`, the app-controls settings write,
the remote `POST /api/settings` patch, and the durable routing edits commit
through it as scoped compare-and-swap edits. Whole-snapshot compat writes are
diffed against the committed state with `mergeManagedSharedSettings` pinning,
so an old renderer or tool payload can no longer clobber another writer's
fields; a same-subject race loses after the bounded rebase
(`SETTINGS_WRITE_REBASE_ATTEMPTS`) instead of overwriting whole-document.
Desktop lease custody is a process-lifetime adapter until the
HostOwnerController unification (Gate 2.5); its credential-persistence guard is
therefore an explicit always-persistent assertion, while the headless
composition passes the real `assertCanPersistSecrets` capability, completing
the settings half of the HOST_OWNERSHIP.md writer obligation.

**Frozen-out writer, integrated at the correction pass:** the desktop remote
access controller was still patching `settings.json` directly
(`DesktopRemoteAccessController.ts` `writeSharedSettingsPatch` /
`writeRemoteAccessEnabledSetting`) when the batch freeze landed mid-batch, so
an authority commit and a remote-access toggle were last-writer-wins between
two writers instead of one custody chain. That interim state is closed: the
controller's remote `POST /api/settings` patch and the remote-access toggles
(`remoteAccessEnabled`, `remoteAccessTailscaleHttps`,
`remoteAccessAdvertisedUrl`) now commit through the composition's
`settingsWrites.commitCompatPatch` / `editSettingsField` scoped compare-and-swap
edits, so every desktop writer shares one authority chain.

**Device-local (client-only) preferences are declared out of the shared
authority on purpose:** keybindings (`src/shared/keybindings.ts` /
`src/main/keybindingsFile.ts`), login-item and OS-global-shortcut state
(Electron main, per device), and the reserved `R.client-v1` Electron device
root are per-device files that never ride `settings.json` or the settings
transaction protocol. They have no revisions, no authority, and no remote
sync contract; moving any of them into shared settings would be a new
versioned feature, not a default.

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
With activation these ceilings now bound the live desktop and headless write
paths, including compat translations of whole-snapshot writes.

Serialized commits sync a unique temporary file before rename, then
attempt directory sync. A directory-sync error reports separately from the
already committed result. Process-crash tests do not establish power-loss
durability or exactly-once request receipts.

The transaction vocabulary is served by two additive main-local procedures,
`settingsTransactionMutate` and `settingsTransactionSnapshot`
(`src/shared/ipc/procedures/settings.ts`), dispatched through the backend
service-call boundary to the composition's `SettingsCommandService` in both
compositions. They are additive within the current wire generations: an older
renderer never calls them and an older backend loud-rejects the unknown
procedure name. Remaining activation work keeps its recorded coordination
requirements: usage-secret custody (Gate 2.5) and the native release gates
remain open; the desktop remote-access writer above was the last settings
writer outside the authority and is integrated as of the correction pass.

## Wire protocols and deployed artifacts

| Boundary                             | Version location                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Coupled producers/consumers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CLI hook event protocol              | `src/shared/contracts/agentEvent.ts` (`PROTOCOL_VERSION`, `MIN_PROTOCOL_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                    | `src/supervisor/agents/plugin/forward-runtime/poracode-hook-runtime.mjs`, the OpenCode forwarder, HookIngress, and the WSL bridge. Update the latest version for envelope/intent changes; raise the minimum only when deliberately dropping compatibility.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Desktop/attach IPC procedure map     | `src/shared/ipc/procedureMap.ts` (`IPC_PROCEDURE_MAP_VERSION`, `ipcProcedureMapFingerprint`, `assertIpcProcedureMapVersion`, `IpcProcedureMapVersionError`), fingerprint pin in `src/shared/ipc/procedureMapVersion.test.ts`                                                                                                                                                                                                                                         | Renderer bridge (`createInvokeBridge`), main handler maps (`registerHandlers`), the attach device-procedure allowlist, and the standalone owner's procedure dispatch. ANY map change (procedure added/removed, transport changed) must refresh the pinned fingerprint — that forces the compat review even when the version stays; bump the version only for changes an already-published peer cannot accept. A peer-declared version mismatch rejects typed (`IpcProcedureMapVersionError`); absent/malformed declarations count as legacy version 0 and also reject typed. **Runtime exchange point (wired in V5 2.5):** the preload advertises its bundle's `ipcProcedureMapVersion`, and the renderer asserts it in BOTH Electron runtime installers (`installElectronClientRuntime` for the managed bootstrap, `installAttachedElectronClientRuntime` for the attach bootstrap) before anything installs — so a mixed bundle/preload pair rejects typed at the renderer⇄main bootstrap boundary. The standalone-owner attach handshake needs no second exchange: the owner serves no IPC procedures to the renderer (its server-owned procedures ride the versioned remote wire; the renderer's device-procedure fallback is served by the SAME-build attach main). |
| Client engine worker protocol        | `src/renderer/state/remote/engine/protocol.ts` (`CLIENT_ENGINE_PROTOCOL_VERSION`, currently 2), `clientEngineWorker.ts`, `clientEngineHost.ts`                                                                                                                                                                                                                                                                                                                       | Same-renderer-bundle Web Worker and host (shipped together, so no cross-build pairs exist in production; a stale cached chunk pair fails loud instead of half-working). Version 1 gained the typed `protocol-mismatch` answer additively: a worker refuses a foreign-version request with `{ type: "protocol-mismatch" }` instead of dropping it, and the host rejects every pending consumer with `ClientEngineProtocolMismatchError` and retires the worker to the sync fallback on any version-gated reply. Version 2 (V5 plan 2.5) removes the `decode-backend` work type together with the deleted renderer-stream transport; a stale cached chunk pair fences into the loud mismatch path rather than half-serving the deleted request. Engines are per-consumer since V5 2.2 and now number TWO (`getRemoteSocketEngine` / `getPersistJsonEngine`; the backend-stream engine left with the deleted stream): each has its own generation, pending set, overflow handlers, and worker, so resetting one consumer can never reject another's in-flight work. Bump the version for any message-shape change; old-reader rejection tests live in `clientEngineHost.test.ts`.                                                                                           |
| Remote desktop/helper API            | `src/shared/remote/protocol.ts` (`PORACODE_REMOTE_PROTOCOL_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                 | Desktop server, headless server, renderer client, mobile/PWA client, snapshots, and SSH helper negotiation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Remote binding-format IR             | `src/shared/remote/contract/versions.ts` (`REMOTE_BINDING_FORMAT_VERSION = 2`, `REMOTE_GENERATOR_VERSION = 3`), `src/shared/remote/contract/{generate,hashes}.ts`, and `protocol/remote/v3/generated/{manifest.json,inventory.json,ir.json,json-schema.bundle.json}`                                                                                                                                                                                                 | Binding format 2 covers the normalized IR / JSON Schema 2020-12 envelope and binding semantics; generator 3 adds executable native root validation, portable transforms, and Zod-compatible default semantics while retaining the format-2 IR boundary. `sourceHash` and `manifestHash` are derived integrity values from the live authority and manifest, so regenerate them with `pnpm protocol:remote:v3:generate`, keep `pnpm protocol:remote:v3:check` green, and never hardcode their current values in this inventory. Audit the binding-format version for IR/schema/envelope or wire-encoding semantic changes and the generator version for generation-algorithm changes, even when the remote wire protocol version stays unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Remote native binding bundle         | `src/shared/remote/contract/native/generate.ts` (`NATIVE_BINDINGS_MANIFEST_FORMAT_VERSION = 4` — format 2 added the pairing state machine, format 3 the terminal-cursor machine, format 4 the terminal hardware-key encoder), `protocol/remote/v3/generated/native/native-bindings.json`, and the recursively generated `protocol/remote/v3/generated/native/{swift,kotlin}/` trees                                                                                  | Bundle format 1 inventories every generated Swift/Kotlin artifact; `native-bindings.json` `languages.*.files` is the authoritative recursive membership list, including each path, digest, byte count, and line count. Any native generator ABI/API change, semantic-validation behavior or metadata change, union/discriminator codec change, or optional/null/unknown-field representation change requires an intentional audit of both this bundle format and the upstream binding/generator versions. Regenerate rather than hand-editing; stale, missing, or extra tree members must fail `pnpm protocol:remote:v3:check`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Remote native parity ledger          | `protocol/remote/v3/native-parity.json` (`formatVersion = 2`, `protocolVersion = 12`)                                                                                                                                                                                                                                                                                                                                                                                | Format 1 assigns every remote route, procedure, WebSocket message/event, and runtime event to one native implementation batch with per-platform disposition and evidence. Format 2 splits every feature claim into `wire` and `ui` columns (`{wire:{disposition,evidence}, ui:{disposition,evidence,note?}}`); a `partial` ui disposition REQUIRES a precise `note`. Format-1 ledgers migrate by the recorded rule: the format-1 claim becomes `wire` unchanged and `ui` mirrors it with the UI-surface subset of the evidence. Any ledger shape or disposition-semantics change requires a format-version audit. A protocol-version mismatch or any manifest inventory addition, removal, or rename invalidates the ledger and must fail until the complete ledger is reviewed and updated. The `remote/v3` directory name is the established contract-generation family, not the current wire protocol number.                                                                                                                                                                                                                                                                                                                                                         |
| Remote thread command variants       | `src/shared/contracts/thread.ts` (`remoteThreadCommandSchema`), `src/main/remote/server/threadCommands.ts`, renderer command mirroring, and native `ThreadRemoteCommand` mirrors                                                                                                                                                                                                                                                                                     | New discriminator variants are additive within a wire-protocol version only when all existing payloads retain their encoding and older hosts reject the unknown variant before mutation. Update host durability, renderer mirroring, generated Swift/Kotlin bindings, native manual encoders, and route goldens together. `clear-group` also dissolves a one-member remainder so every persisted/mirrored layer keeps the same grouping invariant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Native E2E coverage ledger           | `tests/native-e2e/harness/versions.ts` (`NATIVE_E2E_LEDGER_FORMAT_VERSION = 2`, `NATIVE_E2E_OPERATION_MAP_VERSION = 1`), `tests/native-e2e/harness/{coverageLedger,operationMap}.ts`, and `tests/native-e2e/harness/operation-map.json`                                                                                                                                                                                                                              | Ledger format 2 versions the per-operation evidence, status, counts, and completion projections. The operation-map `manifestHash` is a derived boundary over the current protocol manifest identity/format, generated inventory `sourceHash`, and sorted route/procedure/WebSocket/replay/runtime operation keys; never hardcode its current value in this inventory. A ledger shape/meaning change requires a ledger-format audit; a manifest/inventory/key derivation or hash-algorithm change requires regenerating and reviewing the committed operation map and its consumers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Android push channel IDs             | `website/src/lib/push/fcm.ts` (`STATUS_CHANNEL_ID = "poracode_status_v1"`, `ATTENTION_CHANNEL_ID = "poracode_attention_v1"`)                                                                                                                                                                                                                                                                                                                                         | These IDs are durable Android OS-facing identifiers carried in FCM `channel_id`: silent status updates use `poracode_status_v1`, while attention notifications use `poracode_attention_v1`. The native Android app must create matching channels. Do not rename an ID or reuse it for different sound, importance, or user-visible semantics; introduce a new versioned ID and coordinate gateway and native creation/migration instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| iOS notification delivery preference | `ios/App/App/Features/Notifications/NotificationPermissionController.swift` (`NotificationDeliveryPreference.storageKey`)                                                                                                                                                                                                                                                                                                                                            | The device-local master switch defaults on for upgrades and unregisters the exact APNs routing identity from every paired host when disabled. Changing its meaning, default, or storage shape requires a new versioned key and an explicit migration; pending unregister entries must drain before a route can register again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| iOS notification alert preferences   | `ios/App/App/Features/Notifications/NotificationPermissionController.swift` (`NotificationAlertPreference.*StorageKey`)                                                                                                                                                                                                                                                                                                                                              | Sound, foreground presentation, and each alert-category filter are device-local, default on/always for upgrade compatibility, and sync to every paired host as optional native push-registration metadata. Changing defaults or meaning requires new versioned keys; background delivery filtering must remain host-enforced because iOS renders APNs alerts before launching the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Android project sync preferences     | `android/app/src/main/kotlin/com/poracode/app/storage/ProjectSyncPreferences.kt` (`DOCUMENT_VERSION`)                                                                                                                                                                                                                                                                                                                                                                | Device-local project exclusions are keyed by client connection and project ID, default to synced for upgrades, and filter Home utilities, quick compose, and project rows without mutating the host. Changing scope, default, document shape, or inclusion semantics requires a version migration; future-version documents must never be overwritten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Android device settings              | `android/app/src/main/kotlin/com/poracode/app/storage/DeviceSettingsPreferences.kt` (`DOCUMENT_VERSION`)                                                                                                                                                                                                                                                                                                                                                             | Versioned device-local appearance, chat typography, and agent/project terminal typography. Defaults preserve the pre-feature system/dynamic theme, Material 14sp/20sp chat body, and 13sp terminal text. Changing defaults, value meaning, or document shape requires migration; future-version documents must never be overwritten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| iOS Create PR mode                   | `ios/App/App/Features/Projects/GitHubOperations/GitHubOperationsPresentation.swift` (`GitHubPullRequestCreationMode.storageKey`)                                                                                                                                                                                                                                                                                                                                     | Device-local default for the native Create Pull Request primary action. `dialog` preserves the released editable-sheet behavior; `auto` generates a summary with the selected host's commit-generation settings and immediately performs one exact-host PR mutation. Changing this vocabulary or default requires a new versioned key and migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| iOS GitHub workflow pins             | `ios/App/App/Features/GitHubActions/GitHubActionsPageView.swift` (`GitHubWorkflowPinPreferences.storageKey`, `documentVersion`)                                                                                                                                                                                                                                                                                                                                      | Device-local pinned workflow IDs are scoped by desktop and project. Changing the scope, ID meaning, document shape, or ordering semantics requires a new key/document version and an upgrade regression test; future-version documents must never be overwritten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Remote terminal cursor-sync          | `src/shared/remote/protocol.ts` (`TERMINAL_CURSOR_SYNC_VERSION`, `TERMINAL_CURSOR_SYNC_V2_VERSION`), `src/main/remote/server/terminalCursorSync.ts` (`TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS`), `protocol/remote/v3/generated/manifest.json` (`compatibility.terminalOutput.cursorSync`)                                                                                                                                                                            | Additive capability under the current remote protocol / manifest `formatVersion` 1. Advertised in environment `capabilities.terminalCursorSync.versions` (currently `[1, 2]`). Version 2 adds byte-budgeted chunked baselines and cumulative ACK credit; version-1 watches retain their framing. Client `terminal-watch.cursorSync.version` accepts any positive int; unsupported versions get a non-retryable `unavailable` watch-result and install no reliable watch. Wire frames keep legacy byte shapes when the capability is absent. `generation: null` on snapshots is replace-only and never append-compatible. Cursors are **JS string code units** (UTF-16 / `String.length`), not code points — astral planes and surrogate pairs are two units; do not change unit space without a capability bump. One reliable or legacy watch per `(connection, terminalId)` (rewatch replaces; no dual streams). Keep goldens, conformance, server registry, and mobile protocol mirrors aligned when bumping.                                                                                                                                                                                                                                                          |
| Remote native push routing           | `src/shared/remote/protocol.ts` (`REMOTE_PUSH_ROUTING_VERSION`), `src/main/remote/push/PushRegistrationStore.ts`, `src/main/remote/push/pushRouting.ts`, and `website/src/lib/push/{validate,fcm}.ts`                                                                                                                                                                                                                                                                | Additive capability under remote protocol v3. Environment advertises `capabilities.pushRouting.versions` (currently `[1]`). A client opts in by registering the complete `{ version, clientConnectionId, desktopId }` routing identity; legacy registrations and payloads remain accepted. Native payload v1 carries that identity plus `threadId`; APNs custom data is outside `aps`, while FCM data values are strings. Update host, hosted gateway, and native consumers together before adding a version.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Relay framing                        | `src/shared/remote/relayProtocol.ts` (`PORACODE_RELAY_PROTOCOL_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                             | Relay host and relay server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Browser-forward child origins        | `src/main/remote/portForward/forwardOrigin.ts` (`ForwardOriginPolicy` label shape `f-<owner24hex>-<forward32hex>`; `deriveForwardOwner` HMAC domain `poracode-forward-origin-v1`), `src/main/remote/portForward/portProxy.ts` (`FORWARD_ORIGIN_SESSION_COOKIE_NAME = "__Host-poracode-forward"`), `src/shared/remote/relayProtocol.ts` (`RELAY_FORWARD_SESSION_COOKIE_NAME` / `RELAY_ROUTING_COOKIE_NAME` — legacy `lc_forward`/`lc_relay`, credential role removed) | These are persisted browser-side boundaries (cookie jars and origin-scoped storage outlive deploys), so change them only with a deliberate compatibility design. The cookie name is `__Host-`-prefixed and minted only on a forward's own child origin, bound server-side to the exact (forwardId, origin) pair — renaming it invalidates every live forward session (a fresh entry is required, never a silent reuse), and reusing a name for different semantics lets an old cookie authenticate new behavior. The owner label derives from the host's persistent 32-byte origin secret (not the relay password and not a caller-supplied hostname), so rotating the secret or changing the derivation/label shape mints a different namespace: previously served child origins stay reserved by shape (`isForwardOriginAuthority`) and must never start serving host content. Relay-derived labels additionally bind to relay framing version 2; old relays/hosts must not claim isolation merely because optional fields parse. Acceptance: the two-host probe (`src/server/relay/forwardOriginTwoHostProbe.test.ts`) plus the real-Safari boundary drill (`tmp/b3-lane3/safari-two-host-probe.mjs`).                                                                |
| Cursor SDK worker                    | `src/supervisor/agents/cursor/sdkWorkerProtocol.ts` (`CURSOR_SDK_WORKER_PROTOCOL_VERSION`)                                                                                                                                                                                                                                                                                                                                                                           | Worker and worker client message shapes and required lifecycle behavior. Version 3 requires detached SDK cancellation handling so a stale helper cannot kill a parent and its subagents on a transport abort; message shapes remain unchanged. Version 2 added `sdk.pinnedRoot` to discovery requests and `packageRoot` to the probe result; both ends ship together and the native helper under `resources/wsl-helpers` is staged from the same source, so a stale staged copy must fail the handshake rather than ignore the field.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| WSL bridge deployment                | `src/supervisor/wsl/bridge/bridge.mjs` (`BRIDGE_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                            | Bump for every behavioral, endpoint, auth, or wire change so existing deployed bridge copies are replaced. Its hook `PROTOCOL_VERSION` must stay compatible with the CLI hook protocol.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| SSH runtime build manifest           | `src/shared/sshRuntimeManifest.ts` (`SSH_RUNTIME_MANIFEST_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                  | `src/build/runtimeDeclarationPlugin.ts` source/code/resource declarations, `src/main/ssh/runtimeBuildManifests.ts` validation before memory/disk cache reuse, and `src/main/ssh/runtimeBundle.ts` staged verification. Generation 4 carries settings capture metadata; owner-control generation 3 and settings generation 4 require fresh combined generation 5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Supervisor code capture              | `src/shared/runtimeCodeManifest.ts` (`RUNTIME_CAPTURE_PROTOCOL_VERSION`, currently 1)                                                                                                                                                                                                                                                                                                                                                                                | `src/main/supervisor/runtimeManifest.ts`, `capturedRuntime.ts`, and serialized `capturedRuntimeBootstrap.ts` share the bounded declaration/session protocol. The production supervisor still advertises settings service 0 and `SupervisorClient` does not activate capture; settings reverse-service 1 and all-writer authority conversion remain required together. External dependencies, native libraries, separate workers and executable resources are outside the captured-code guarantee.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Provider hook plugins                | Every `src/supervisor/agents/*/plugin/plugin.json`                                                                                                                                                                                                                                                                                                                                                                                                                   | Bump the plugin semver whenever installed plugin files or their behavior change; detection/install logic uses it to replace deployed copies. Check shared forward-runtime changes against every provider plugin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Computer-use native helper           | `src/shared/contracts/computerUse.ts` (`COMPUTER_USE_HELPER_PROTOCOL_VERSION`) and `native/computer-use-helper/src/protocol/version.rs`                                                                                                                                                                                                                                                                                                                              | Any helper request, response, capability, or delivery contract. Keep both constants equal, update the protocol fixture, and bump the bundled computer-use plugin semver when deployed helper behavior changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Interactive debug session file       | `.agents/skills/interactive-testing/scripts/poracode-debug-session.mjs` (`DEBUG_SESSION_SCHEMA_VERSION`)                                                                                                                                                                                                                                                                                                                                                             | Debug-session JSON fields or lifecycle semantics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

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

| Boundary                   | Current version/source                                                                                                            | Compatibility requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owned root layout          | `HOST_ROOT_LAYOUT_VERSION = 1`, `hostRootPaths.ts` / `hostRootManifest.ts`                                                        | Map the original namespace once to its sibling; reject unknown layouts and staged activation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Permanent lease / metadata | SQLite `user_version = 1` / owner format 1, `hostOwnerLease.ts`                                                                   | Never replace an unknown lease; PID metadata is informational. Keep strong lease retention and the unmanaged-descriptor prohibition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Data-custody fence         | SQLite `user_version = 1` / fence format 1, `hostDataFence.ts` (`<namespace>.host-data.sqlite`, lease-family sibling)             | New in Gates 2-3 Batch 1: the forked desktop backend child holds it for its lifetime (acquired before SQLite opens, released after it closes); owner admission probes it with a bounded wait. Old binaries never acquire it — an orphan from a pre-upgrade owner is undetectable by the fence and remains the documented legacy-contention case. No migration: an absent file is created fresh; an unknown future `user_version` is refused, never replaced. Desktop-only wiring today; the headless composition owns its database in-process and omits the fence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Credential provenance      | `HOST_CREDENTIAL_STATE_VERSION = 1`, `hostCredentialState.ts`                                                                     | Root, mode and fingerprint must match; malformed or cross-mode state never rotates silently.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Offline import receipt     | `HOST_IMPORT_RECEIPT_VERSION = 1`, `stageHostImport.ts`                                                                           | Imported state requires activation and later inventory revalidation; ephemeral control discovery is excluded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Host activation manifest   | `HOST_ACTIVATION_MANIFEST_VERSION = 1`, `hostRootManifest.ts`                                                                     | The activated offline-backup form inside root layout 1 (`activation: "ready"` + `activationVersion`/`activatedAt`); the layout version itself stays 1. A pre-activation reader refuses an activated manifest loudly as an unsupported activation state instead of misreading it as staged or empty, and a future `activationVersion` fails the same read — never upgraded in place.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Host activation record     | `HOST_ACTIVATION_RECORD_VERSION = 1`, `activationHostRoot.ts` (`host-activation.json`)                                            | Decision evidence written after the manifest flip (which archives the staged receipt). A missing, malformed or foreign-`formatVersion` record is refused as unsupported — never converted; activation is idempotent-by-refusal, so a root whose record is absent but whose manifest says activated surfaces the loud reader error rather than silently re-activating.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Host key adoption offer    | `HOST_KEY_ADOPTION_OFFER_VERSION = 1` / `HOST_KEY_ADOPTION_PROTOCOL_VERSION = 1`, `nativeSecretKey.ts` (`host-key-adoption.json`) | One-time desktop cooperation for unsealing a staged OS-sealed key. The bounded private offer is validated field-by-field against the recorded owner generation, so a stale or foreign-version offer fails as "no desktop owner is currently offering key adoption" and the staged root stays untouched; the loopback request/response versions are literal-checked and a mismatch refuses the answer instead of parsing loosely. An offer left behind by a crashed desktop is retired on the first answered request or on service dispose, and stays inert in the meantime because it is bound to the owning generation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Host operation journal     | `HOST_OPERATION_JOURNAL_VERSION = 1`, `hostOperationJournal.ts` (`host-operations.json`, inside the leased data root)             | New in Gates 2-3 Batch 3: durable claim/receipt records for mutating host operations, written before and after each side effect. Bounded (≤32 records; terminal records expire after 60 s; a begin at capacity is refused, never evicting) with `HostControlServer` receipt semantics made durable. First consumer: staged-import activation (`activationHostRoot.ts`), whose interrupted mid-custody attempts now resume from the frozen plan evidence or refuse typed instead of surfacing a generic inventory mismatch. Records carry fingerprints and notes only, never key material. Unknown future `formatVersion` is refused loudly by readers and never rewritten; the file is excluded from import inventory like the other owned markers (see `hostImportFiles.ts`). Adding a new journaled operation kind or a plan-evidence field is an additive record change within version 1 only if every reader treats unknown kinds/fields as absent; changing phase or classification semantics requires a version bump plus an upgrade regression test seeded from the version-1 shape. |
| Local management wire      | `HOST_CONTROL_PROTOCOL_VERSION = 2`, `hostControlProtocol.ts`                                                                     | Closed operations, generation-bound HMAC request/response proofs; no bearer or PID-signal fallback. Version 2 is the host-declared service-capabilities boundary (V5 plan 1.2): the describe result renames its operation list to `operations` and gains the closed `capabilities` boolean object (ssh, browserPanel, chromeBridge, computerUse, nativeSecrets, portForward), published by both the desktop and headless describe builders from their actual service composition. Version-1 peers reject version-2 requests/replies on the literal version check in both directions — regression-covered in `src/shared/hostControlProtocol.test.ts`; there is no cross-version describe.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Private control discovery  | `HOST_CONTROL_DISCOVERY_VERSION = 1`, `hostControlProtocol.ts` / `hostControlDiscovery.ts`                                        | Bounded private file, exact namespace/root/generation, authenticated running peer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| SSH deployment manifest    | `SSH_RUNTIME_MANIFEST_VERSION = 3`, `sshRuntimeManifest.ts`                                                                       | Refuse predecessor manifests 1/2 for the changed owner/pair command. Settings preflight reserves 4; the combined deployment must use fresh 5 and validate warm caches too.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Server install layout      | `SERVER_INSTALL_LAYOUT_VERSION = 1`, `serverInstallLayout.ts`                                                                     | Prefix and checkout are the only supported bundle shapes; anything else refuses startup with `ServerLayoutError` instead of misresolving resources, and explicit `PORACODE_*` asset declarations win but must be absolute existing directories. No persisted artifact carries this version, so an older deployed prefix never half-works: it either still matches a supported shape or fails the loud layout refusal until reinstalled per docs/STANDALONE_SERVER.md.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Server backup receipt      | `SERVER_BACKUP_RECEIPT_VERSION = 1`, `serverBackup.ts` (`poracode-backup.json`)                                                   | Written last, after the verified copy, as the disclosure of what was captured. Nothing imports a backup by trusting this receipt — the restore path re-verifies content through the staged-import hashing — so an older receipt never corrupts a restore; any future reader must refuse an unknown `formatVersion` instead of degrading it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Server doctor report       | `SERVER_DOCTOR_REPORT_VERSION = 1`, `serverDoctor.ts`                                                                             | Read-only diagnostics emitted fresh on every run and never persisted, so no stale report artifact can remain present; a consumer of an emitted report must refuse an unknown `formatVersion` instead of guessing section shapes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Remote audit log           | `REMOTE_AUDIT_LOG_VERSION = 1`, `src/main/remote/server/auditLog.ts` (`remote-audit.jsonl`, JSONL at the host data root)          | New in Gate 6 batch 4 (item 4.7): append-only, one JSON object per line (`v`, `at`, `kind`, optional `sessionId`/`detail`), never containing credential material. Readers must tolerate a torn trailing line and unknown `kind`s/fields; rotation is deliberately a no-op seam until plan item 4.9 lands a size-capped policy, so nothing may yet depend on rotation behavior. Changing the line envelope or a `kind`'s meaning requires a version audit with an upgrade regression test seeded from the version-1 shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

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

Facade 12 is the settings-authority procedure boundary (Gates 2–3 batch 1): the
renderer procedure map gains the additive main-local procedures
`settingsTransactionMutate` and `settingsTransactionSnapshot`. The preload
invoke surface is generic (`invokeProcedure`) and exposes no new API, but the
renderer bundle, the main handler map, and the preload must agree on the
procedure map in lockstep, so the facade gate rejects a version-11 preload
instead of letting an older bundle disagree about which settings procedures
exist (the pre-upgrade rejection is regression-covered in
`src/renderer/clientRuntime.test.ts`, old-version list including 11). No
persisted state, remote wire, or backend-host version changes for this bump;
the new procedures are additive names inside the existing envelopes.

Facade 13 is the bounded thread-list hydration boundary (Gate 4 hazard #3): the
renderer procedure map gains the additive main-local procedure `dbGetThreadsPage`
(cursor-paginated, project-scoped counterpart of `dbGetThreads`). The same
lockstep rule applies and the gate now rejects a version-12 preload (old-version
list updated in `src/renderer/clientRuntime.test.ts`, including 12). No
persisted state, remote wire, or backend-host version change; see the bounded
thread-list surfaces note above for the full boundary audit.

Facade 14 is the renderer-stream leg deletion (V5 plan 2.5). The preload no
longer exposes `getBackendRendererStreamInfo`,
`onBackendRendererStreamChanged`, `onRendererStreamRecovery`, or
`getRendererStreamOwnershipGrant` — the direct renderer stream, its grants,
and its recovery barriers are gone, and desktop events arrive only over the
sequenced desktop-IPC relay (with its gap signal, still required). The facade
additionally advertises `ipcProcedureMapVersion` (the V5 2.6 procedure-map
handshake; the renderer asserts it typed in both Electron runtime installers)
and the `onBackendSupervisorReset` signal (the desktop-IPC relay sequence
space restarts with a new backend child, so windows drop their dedupe cursor
and rebuild). A version-13 preload cannot deliver the reset signal and still
serves the deleted stream APIs, so the gate rejects that pairing loudly
(old-version list updated in `src/renderer/clientRuntime.test.ts`,
including 13). No persisted state, remote wire, or relay change.

## Bounded thread-list surfaces (Gate 4 hazard #3)

`dbGetThreads` returns every row, so every client attach transferred the whole host
thread list (380,596 B at the 1069-thread Gate-4 fixture). Two additive bounded
surfaces now replace the full-list transfer; the unbounded read stays valid for
in-bundle non-renderer consumers (tray, attachment cleanup, headless scans):

- **Desktop (facade 13).** The renderer procedure map gains the additive main-local
  procedure `dbGetThreadsPage` (`{ limit ≤ 200, cursor?, projectId? }` →
  `{ threads, nextCursor }`), consumed by the renderer's app-store hydration in pages
  of 100. The preload invoke surface is generic and exposes no new API, but the
  renderer bundle, the main handler map, and the preload must agree on the procedure
  map in lockstep, so the facade gate rejects a version-12 preload (regression list
  updated in `clientRuntime.test.ts`). No persisted state, backend-host version, or
  remote wire change: the procedure is an additive name inside the existing
  envelopes, and an older backend loud-rejects the unknown name.
- **Remote (protocol 12, additive capability).** `GET /api/snapshot` accepts
  `threadLimit` (1–200): the response bounds the thread list to its head rows and
  carries `threadsNextCursor` (new optional field on `remoteShellSnapshotSchema` —
  present only for opted-in requests, so clients that never send the parameter never
  see the field, honoring the manifest's `unknownObjectFields: "ignore"` policy). The
  new `GET /api/threads?cursor&limit` route serves continuation pages with per-page
  `runtimeSummariesByThread`/`gitSummariesByThread` slices. `RemoteDesktopClient
.snapshot({ threadListPageLimit })` assembles the complete snapshot and treats an
  absent cursor as "complete" (legacy host). Cursors are versioned opaque strings
  (`tp1.` + base64url `(sort_order, id)`); malformed cursors are refused, never
  mispaged.
- **Contract artifacts moved together:** `manifest.json` (65 routes),
  `protocol/remote/v3/generated/*` (regenerated, `pnpm protocol:remote:v3:generate`),
  `native-parity.json` (`thread-list` and `local-image-ticket` ledgered as `planned`
  for both native platforms with absence tokens pinned in `native-parity.test.ts`),
  and the committed native e2e `operation-map.json` (224 keys, route 65; regenerated
  and reviewed per the operation-map lock). `PORACODE_REMOTE_PROTOCOL_VERSION` stays
  12: additive routes plus opt-in optional fields are capabilities, not
  wire-generation changes (same pattern as terminal cursor-sync and push routing).
- **One-time image tickets (B5b, query-token removal in V5 4.6):**
  `POST /api/files/image-ticket` (bearer, `session:read`) mints a 30-second,
  one-time, path-bound `lc_img_` ticket (256-bit, stored sha256-hashed,
  256-cap oldest-first) consumed by `GET /api/files/image?ticket=…`; any
  failed consume burns it. The legacy `access_token` query param on the image
  routes was **removed** in V5 batch 4 (item 4.6): the host accepts only the
  Authorization header or the one-time `ticket` query parameter on
  `local-image`/`runtime-image`. The registry auth label stays
  `bearer-or-query` on purpose (the wire shape "header or query credential" is
  unchanged and native strict auth-kind parsers stay valid); only the query
  credential's name and semantics changed, which is an additive regeneration,
  not a route removal. The TS client now returns "" for the first render per
  path while a mint is in flight instead of falling back to a tokened URL, so
  no client-built URL carries a bearer token. Native platforms keep
  authenticating image GETs with the bearer header, which the host still
  accepts — their generated query codecs gained the optional `ticket` field
  through regeneration; native ticket minting remains `planned`
  (absence tokens `LocalImageTicket`).
- The renderer page size (100) is the policy that keeps one page's serialized
  response inside the 64 KiB acceptance bound at realistic thread sizes; it is
  asserted per page by `snapshots.pagination.test.ts` at a 1,000-thread fixture,
  together with the unbounded response exceeding the bound.

## Remote contract registry as the single route/procedure/scope table (V5 batch 3)

- **Artifact home change:** the hand-maintained `protocol/remote/v3/manifest.json`
  is GONE. The manifest is now GENERATED at
  `protocol/remote/v3/generated/manifest.json` from the contract registry
  (`src/shared/remote/contract/`), byte-compared by
  `pnpm protocol:remote:v3:check` and `git diff -- protocol/remote/v3/generated`
  in native CI. `manifestHash`/`sourceHash` changed for this reason (the
  generated manifest also corrects two pre-existing hand-copy drifts: the
  `local-image-ticket` route's `queryParameters` and the
  `thread-start-existing` idempotency marker, both now taken from the registry).
  Every consumer of the old path was moved in the same change: conformance,
  native-parity and replay-parity tests, the registry/goldens tests, and the
  native-e2e harness (`tests/native-e2e/harness/paths.ts`). The committed
  native-e2e `operation-map.json` was regenerated for the new
  `manifestHash`/inventory `sourceHash` (224 keys unchanged). Native apps never
  read the manifest at runtime — they compile the generated bundles, which
  embed the manifest hash.
- **Router dispatch is registry-driven:** `src/main/remote/server/httpRouter.ts`
  compiles its matchers from `REMOTE_HTTP_ROUTES` and looks handlers up in an
  exhaustively-typed table (`httpRouteHandlers.ts`) keyed by the closed
  `RemoteHttpRouteId` union. Adding a route without a registry contract, or a
  registry route without a handler, is a typecheck error; the former
  regex-over-router-source conformance gate was deleted as structurally
  impossible. Route scopes are enforced by the dispatcher from the registry
  contract (`requireBearer` once per bearer route), so registry scopes are the
  wire truth; procedure-defined routes keep their per-procedure scope check.
- **Per-route scopes flow to every client from one generation:** the generated
  manifest carries `httpRoutes[].scopes`, the Swift/Kotlin bundles embed them
  in `RemoteRouteDescriptor.scopes`, and the native parity ledger
  (`native-parity.json`) restates them per route with an equality check in
  `native-parity.test.ts`. No wire shape changed: envelopes, payloads, and
  status codes are untouched; this batch restructured where the truth lives.

## Pairing scope presets (V5 batch 4, item 4.3)

- `src/shared/remote/protocol.ts` now names two pairing-scope presets:
  `REMOTE_OPERATOR_SCOPES` (the pairing default; identical to the historical
  `REMOTE_STANDARD_SCOPES` full set) and `REMOTE_VIEWER_SCOPES`
  (`["session:read", "terminal:read"]`, the read-only split). Presets are
  host- and client-side vocabulary only: no wire schema changed, so
  `PORACODE_REMOTE_PROTOCOL_VERSION` and the generated bindings are untouched
  (`pnpm protocol:remote:v3:check` stays byte-stable). A later additive
  `preset` field on the token-exchange payload would be the wire-visible form
  for native clients and requires regeneration at that point.
- The pairing credential remains the scope ceiling and the exchange still
  rejects over-requests (`compatibility.unknownClientRequestedScopes: "reject"`
  is unchanged): a client pairs into the viewer preset by requesting
  `REMOTE_VIEWER_SCOPES` (or no scopes, inheriting the grant) against a
  viewer-scoped pairing credential. The desktop renderer
  (`remoteServersStore.ts`) now requests the operator preset by name; the
  persisted `RemoteServerRecord.scopes` continue to come from the
  server-echoed grant, so an operator-preset request against a narrower
  credential fails loudly at pairing rather than silently widening.
- Enforcement is the dispatcher's registry-driven scope gate
  (`httpRouter.ts`), proven per route by
  `RemoteAccessServer.scopePresets.test.ts`, which enumerates the mutating and
  read-only route matrices from `REMOTE_HTTP_ROUTES` itself.

## Generated pairing state machine (V5 batch 5, item 5.2)

- **One spec, three consumers.** `src/shared/remote/contract/pairingMachineSpec.ts`
  declares the pairing intent states/events/guards, the failure-phase
  transition table, the one-shot candidate fingerprint (sha256 over
  `endpoint \u0001 credential`), both duplicate-detection policies (in-flight +
  last-succeeded tracker; process-lifetime consumed set), the deep-link
  confirmation policy, and the scope-request policy.
  `contract/native/emitPairing{Swift,Kotlin}.ts` render it into the native
  bundles as `swift/PairingMachine.swift` and `kotlin/PairingMachine.kt` under
  the same byte-stability, hash, size, and 450-line gates as the wire bindings
  (`native/generate.ts` fails closed if the spec is not exhaustive);
  `contract/pairingMachine.ts` is the executable TS reference the contract
  tests pin vectors against.
- **Native-bindings manifest format 1 → 2** (`native-bindings.json`): the
  manifest now declares a `stateMachines` section and
  `counts.pairingStateMachines`. Every mirrored pin moved with the bump in the
  same change: `GeneratedRemoteV3Contract.expectedNativeBundleManifestFormatVersion`
  (iOS startup check), the `verifyRemoteV3NativeBindings` gradle pin, the
  Android JVM `GeneratedRemoteV3ManifestTest`, and the generator's own
  `generate.test.ts`. An old reader refuses a v2 manifest fail-closed; a v1
  manifest cannot list the new source shards, and both apps' directory
  membership checks refuse extra files, so a torn bundle cannot half-adopt the
  machine.
- **No wire change.** The pairing spec is deliberately not part of the wire IR
  (`buildRemoteV3IrDocument` never reads it), so `sourceHash`/`manifestHash` —
  and therefore the native-e2e `operation-map.json` — are unchanged.
- **Hand-written copies deleted.** iOS `PendingPairingState` /
  `DeepLinkPairingPolicy` / `PairingCandidateTracker` and Android
  `PairingIntentDecisions` / `PairingPhaseMapping` are gone; the apps keep
  thin app-owned facades only for API stability (`RemoteAccessScopes`,
  `SessionPolicies.shouldShowBrowsableConfirm` / `sanitizedHostLabel`,
  `PairingFailurePhaseMapper`, `ProtocolConstants.STANDARD_SCOPES`) that
  delegate to the generated machine. The existing iOS/Android pairing tests
  pass unchanged in shape against the generated sources.
- **Intentional behavior unification.** The candidate fingerprint recipe is now
  identical across platforms (Android previously hashed a trimmed/lowercased
  endpoint with a `\u0000` separator; iOS hashed the raw endpoint with
  `\u0001`). Digests are process-memory-only on both platforms — never
  persisted, never logged — so no migration is required; the spec is the single
  recipe going forward.
- **TS convergence is a recorded follow-up.** The renderer pairing flow
  (`remoteServersStore.ts`) remains hand-written this pass (renderer files sit
  outside the contract tree); converging it onto the spec executor is the
  outstanding 5.2 remainder.

## Generated terminal-cursor state machine + native-bindings manifest format 3 (V5 plan item 5.2, remainder)

- **One spec, three consumers.**
  `src/shared/remote/contract/terminalCursorMachineSpec.ts` declares the
  terminal-cursor reconciliation machine: frame kinds, consumer actions (the
  parity-fixture tokens), resync reasons (with `stale-watch` as an
  informational, never-resyncing annotation), the UTF-16 bounds (200_000-unit
  transcript tail; pre-baseline buffer bounded by 200_000 units AND 1024
  frames — iOS previously lacked the frame bound), and the ordered first-match
  rule table. `contract/native/emitTerminalCursor{Swift,Kotlin}.ts` render it
  into `swift/TerminalCursorMachine.swift` and
  `kotlin/TerminalCursorMachine.kt` under the same byte-stability, hash, size,
  and 450-line gates as the wire bindings;
  `contract/terminalCursorMachine.ts` is the executable TS reference the
  contract tests run against the shared parity tape
  (`protocol/remote/v3/fixtures/terminal-cursor-sequence.json`).
- **Native-bindings manifest format 2 → 3** (`native-bindings.json`): counts
  gained `stateMachines` (2 — the pairing machine plus the cursor machine;
  `counts.pairingStateMachines` is retired) and the `stateMachines` array
  gained the `terminalCursor` entry (rule/guard/action/reason counts, bound,
  and source shards `swift/TerminalCursorMachine.swift` /
  `kotlin/TerminalCursorMachine.kt`). Every mirrored pin moved with the bump
  in the same change: `GeneratedRemoteV3Contract.
expectedNativeBundleManifestFormatVersion` (iOS startup check, refuses v2
  fail-closed), the `verifyRemoteV3NativeBindings` gradle pin,
  `GeneratedRemoteV3ManifestTest`, and the generator's own
  `native/generate.test.ts`. Both apps' directory-membership checks refuse
  extra files, so a v2 app cannot half-adopt the new shard.
- **No wire change.** The cursor spec is deliberately not part of the wire IR
  (`buildRemoteV3IrDocument` never reads it), so `sourceHash`/`manifestHash`
  are unchanged; only `outputHash` moved (new files).
- **Hand-written copies deleted.** iOS `TerminalCursorReconciler.swift` and
  Android `TerminalCursorReconciler.kt` (reconciler + state/action types) are
  gone; consumers import the generated types
  (`com.poracode.remote.v3.generated.TerminalCursor*` on Android, same-target
  names on iOS). The per-platform JSON frame decoders stay hand-written
  coordinators (iOS `TerminalCursorFrameDecoder.swift` over `RichJSON`,
  Android `TerminalCursorFrameDecoder.kt` over `kotlinx.serialization`) —
  `terminalCursorMachine.ts#decodeTerminalCursorFrameMessage` is the
  normative reference they are tested against. The parity fixture tests run
  unchanged in shape against the generated machines; the Android
  frame-count-bound test (`TerminalCursorBufferBoundTest`) now passes on both
  platforms.
- **Renderer pairing convergence, recorded per 5.2** (same slice): the
  renderer now consumes `contract/pairingMachine.ts` — which required moving
  the fingerprint digest to the browser-safe pure-TS `contract/sha256.ts`
  (`node:crypto` cannot enter the renderer bundle; digests are byte-identical
  to Node's, pinned in `sha256.test.ts`). The web deep-link intake
  (`bootstrap.ts`) applies the executor's consumed-set duplicate policy over
  the same host+credential key material as the retired raw `host\0token` set;
  `usePairing.ts`, `pairingDirect.ts`, and the mobile settings sheet drive the
  executor's direct in-app path (candidate → beginPair → commit/failed). The
  QR-scanned PWA link still pairs without the spec's external-confirmation
  stop (treated as the direct in-app path); routing scanned links through the
  external `pendingConfirmation` stop — as the natives already do for
  browsable intents — is the recorded follow-up divergence. The TS renderer
  terminal feed (`remoteTerminalFeed.ts`) keeps its own hand-written cursor
  reconciliation this pass (renderer terminal feed files are outside this
  lane's pairing-scoped renderer surface); converging it onto
  `terminalCursorMachine.ts` is the recorded follow-up.

## Generated terminal hardware-key encoder + native-bindings manifest format 4 (deep-review consolidation)

- **One spec, three consumers.**
  `src/shared/remote/contract/terminalKeyEncodingSpec.ts` declares the PTY
  byte encoding for one normalized hardware-keyboard press: the normalized
  key set, the modifier flags (shift=1, alt=2, ctrl=4, meta=8 — the values
  double as the xterm CSI-u modifier contributions, so the wire parameter is
  `1 + sum(set flags)`), the bare-key sequences, the arrow suffixes, the
  CSI-u code points, the C0 fold band (0x40..0x5F), the scalar bounds, and
  the ordered first-match rule table ending in a passthrough catch-all.
  `contract/native/emitTerminalKeyEncoding{Swift,Kotlin}.ts` render it into
  `swift/TerminalKeyEncoding.swift` (`TerminalHardwareKeyEvent` +
  `TerminalRawKeyEncoder.encode`) and `kotlin/TerminalKeyEncoding.kt`
  (`TerminalHardwareKey` + `terminalHardwareKeySequence`) under the same
  byte-stability, hash, size, and 450-line gates as the wire bindings;
  `contract/terminalKeyEncoding.ts` is the executable TS reference the
  contract tests pin the shared vector table against.
- **Native-bindings manifest format 3 → 4** (`native-bindings.json`):
  `counts.stateMachines` moves 2 → 3 and the `stateMachines` array gains the
  `terminalKeyEncoding` entry (key/rule/guard/effect counts and source shards
  `swift/TerminalKeyEncoding.swift` / `kotlin/TerminalKeyEncoding.kt`). Every
  mirrored pin moved with the bump in the same change:
  `GeneratedRemoteV3Contract.expectedNativeBundleManifestFormatVersion` (iOS
  startup check, refuses v3 fail-closed), the `verifyRemoteV3NativeBindings`
  gradle pin, `GeneratedRemoteV3ManifestTest`, and the generator's own
  `native/generate.test.ts`. Both apps' directory-membership checks refuse
  extra files, so a v3 app cannot half-adopt the new shard.
- **No wire change.** The encoder spec is deliberately not part of the wire
  IR (`buildRemoteV3IrDocument` never reads it), so `sourceHash`/`manifestHash`
  — and therefore `manifest.json`/`ir.json` — are byte-identical; only
  `outputHash` moved (the new shards).
- **Hand-written copies deleted.** Android `terminalHardwareKeySequence` +
  `TerminalHardwareKey` + their lookup extensions (in
  `TerminalKeyAccessory.kt`) and iOS `TerminalRawKeyEncoder` +
  `TerminalHardwareKeyEvent` (in `TerminalRawKeyInput.swift`) are gone;
  consumers import the generated encoder (same-name types, so only the
  import lines moved). Event normalization stays a hand-written per-platform
  coordinator exactly like the terminal-cursor JSON decoders: Android
  `terminalHardwareKey(Key)` over Compose `Key`, iOS
  `TerminalTranscriptView.terminalEvent` over `UIPress`. The Android
  on-screen accessory encoder (`terminalVirtualKeySequence`) is a separate
  app-owned surface (its Ctrl toggle deliberately keeps classic sequences
  for non-arrow/non-letter keys) and is not generated.
- **Reconciled divergences (the spec decides; both platforms now ship the
  same behavior).** (1) Ctrl-only/ Ctrl+Shift on a fold-band miss (Ctrl+1,
  Ctrl+Space, Ctrl+Delete): Android emitted the xterm CSI-u form while iOS
  silently dropped the modifier and passed the character through,
  contradicting both doc comments — the spec keeps CSI-u. (2) A character
  with no single scalar code point: iOS fell back to the bare sequence while
  Android emitted CSI-u with the first UTF-16 unit — a lone surrogate for
  supplementary input, i.e. a broken escape — the spec keeps the fallback and
  maps single supplementary scalars by code point, not UTF-16 unit. (3) The
  C0 fold width: Android required one UTF-16 unit, iOS one UTF-8 byte — the
  spec measures Unicode scalars, which also removes Android's latent
  `.single()` crash on Ctrl+'ß' (two-scalar uppercase "SS" neither folds nor
  maps, so it passes through). The reconciled rows are pinned as vectors in
  the TS contract test, `TerminalKeyAccessoryTest`, and
  `TerminalRawKeyInputTests`.

## mDNS advertiser contract (V5 plan item P4)

- **Discovery wire boundary.** `src/main/remote/mdnsAdvertiser.ts` speaks
  RFC 6762/6763: service type `_poracode._tcp.local`, one record set per
  host — PTR (shared, class IN, TTL 4500), SRV + TXT (unique, cache-flush,
  TTL 4500), A (TTL 120, IPv4 hosts only) — announced twice ~1 s apart, then
  every 5 minutes, with a bounded query responder (service-type PTR/ANY
  questions only). TXT entries: `id=<desktopId>` and
  `fp=sha256:<leaf-certificate-hex>` — the same fingerprint the pairing QR
  carries, so discoverers can pin on first connect. The builders are pure
  functions pinned by an independently written RFC parser and a golden byte
  fixture (`mdnsAdvertiser.test.ts`); treat any TXT key, TTL, or class change
  as a compatibility change for older discoverers (they ignore unknown TXT
  keys, but `fp`/`id` consumers are versioned by this entry).
- **Decision boundary.** `shouldAdvertiseMdns` is the single advertise
  decision: default off in `loopback` mode, on only for TLS-configured
  `lan`/`tailnet` binds, overridable per-process by
  `PORACODE_REMOTE_MDNS=0|false|1|true` (forcing cannot advertise a plaintext
  listener — there is no fingerprint). The env name is the compatibility
  surface for deployments/scripts.
- **Native discovery surfaces.** iOS declares `_poracode._tcp` in
  `NSBonjourServices` (Info.plist) — required for local-network browsing and
  part of the app's permission surface; Android uses `NsdManager` with no new
  permission. Both parse the TXT `fp` into the discovered-host model. Native
  TLS-handshake enforcement of that fingerprint (TOFU pin-on-first-connect,
  matching the PWA's `#fp=` machinery) is a recorded follow-up; until it
  lands, the native transports treat the endpoint as ordinary HTTPS.

## Remote TLS, token lifecycle, and operability routes (V5 batch 4, items 4.2/4.6 + 4.9 rider)

- **TLS for direct connections (4.2).** `PORACODE_REMOTE_TLS_CERT` +
  `PORACODE_REMOTE_TLS_KEY` (paths, set together) switch the remote listener
  to HTTPS (`RemoteAccessServer.tls` option; the composition roots resolve the
  material from the environment through `loadRemoteAccessTlsMaterial` in
  `src/main/remote/server/tlsMaterial.ts`). A partial or unloadable
  configuration is a loud startup failure — it never downgrades an operator
  who asked for encryption to plaintext. A TLS-backed wildcard (`lan`) bind no
  longer needs `PORACODE_ALLOW_PLAINTEXT_LAN=1`. The pairing URL gains the
  ADDITIVE `#fp=sha256:<64-hex>` fragment carrying the leaf certificate's
  SHA-256 fingerprint (`pairingUrl.ts`); clients that ignore it pair exactly
  as before. The TS client pins on first pair (TOFU anchored by the QR
  assertion, probed through a `certFingerprintProbe` transport hook) and
  refuses (`certificate_fingerprint_mismatch`, before credentials are sent)
  on mismatch; the renderer persists pins in localStorage beside the server
  records (`remoteServersStore.ts`, key `poracode.remoteServerCertPins`) and
  drops them with the record. No wire envelope, schema, or version changed —
  the fragment is inside the existing pairing URL string.
- **Token lifecycle (4.6).** Access tokens now live 24 hours and every
  pairing/exchange mints a rotating refresh token with a fixed 30-day
  absolute deadline; the exchange RESULT gained the additive optional
  `refreshToken`/`refreshTokenExpiresAt` fields, and the token-exchange
  PAYLOAD gained the additive `refresh_token` grant type plus an optional
  `refreshToken` field (`src/shared/remote/protocol.ts`). Older clients strip
  the unknown response fields (Zod default) and never send the new grant;
  older hosts reject it loudly, and the TS client then surfaces the original
  401 rather than a grant-endpoint error. A server-side revocation list
  (hashes of the access AND refresh halves, remembered until their natural
  expiry) rides the existing `remote-access-auth.json` shape as the additive
  `revokedTokenHashes` array (default `[]`) and per-session additive
  `refreshTokenHash`/`refreshExpiresAtMs` fields: old hosts strip them
  (sessions keep their remaining validity), new hosts read old files
  unchanged (pre-refresh 30-day sessions stay valid; regression-tested).
  The renderer keeps refresh tokens in the existing encrypted WebCrypto vault
  (not in the Zustand persist — no store-version change) and rotates them
  transparently on the first 401 of an expired access token.
- **Operability routes (4.9 rider).** `GET /healthz` (fixed `{ok:true}`, no
  auth, discloses nothing) and `GET /metrics` (loopback-peer-gated snapshot)
  are registry contracts (`src/shared/remote/contract/routes/ops.ts`), so
  route counts moved 65→67 everywhere: the generated artifacts
  (`pnpm protocol:remote:v3:generate`), the native parity ledger
  (`unsupported-by-wire` on both platforms — natives never consume them),
  the committed native-e2e `operation-map.json` (226 keys), and the pinned
  counts in `registry.test.ts`, `generate.test.ts`, `routeGoldens.test.ts`,
  `operationMap.ts/.test.ts`, `foundationCoverage.test.ts`, and
  `unsupportedLedger.test.ts`. `PORACODE_REMOTE_PROTOCOL_VERSION` stays 12:
  additive routes and opt-in optional fields are capabilities under the
  established pattern. The native-e2e mock's `bearerToken` helper is now
  header-only, mirroring the removed `?access_token=` acceptance.

## Client transport cursor and engine scoping (V5 batch 2, items 2.1/2.2/2.6)

Two behavior contracts changed for the remote event socket and the client
decode engine; both are process-local (no persisted state, no remote wire
change):

- **Applied-cursor rule (2.1).** The per-server resume watermark
  (`remoteServerSnapshotSeq`) now advances only AFTER a frame is applied —
  dispatched, replayed from the recovery queue, or filtered out — never on
  receipt, and never past a frame the client provably dropped. The remote WS
  server delivers every seq to a connected client contiguously, so the
  session treats `seq > watermark + 1` as a client-detected loss: it marks
  the session resync-required and reconnects from the last applied seq, then
  re-baselines interested threads from authoritative snapshots. The same
  loss path handles engine-dropped frames: a rejected `decodeRemote`
  (overflow/reset) and the engine overflow listener both reconnect instead
  of swallowing the frame. Frames parked in the recovery queue advance the
  cursor only when replayed, so a failed recovery never skips them. Fixtures
  that hand-craft event streams must deliver seqs densely (see
  `deliverFillersThrough` in `remoteServersStore.test.ts`).
- **Per-consumer decode engines (2.2).** The former process-wide
  `getClientEngineHost()` singleton is gone. `clientEngineHost.ts` exposes
  three independent engines (`getBackendStreamEngine`,
  `getRemoteSocketEngine`, `getPersistJsonEngine`), each with its own
  generation, pending set, overflow handlers, and worker. A loopback
  renderer-stream close resets only the backend-stream engine, so remote
  socket decodes and Zustand persist JSON work can no longer be rejected as
  collateral and silently report state as absent. Do not reintroduce a
  shared engine accessor.
- **Typed protocol mismatches (2.6).** Both versioned boundaries here reject
  typed instead of dropping: the engine worker answers a foreign-version
  request with `protocol-mismatch` and the host rejects pending work with
  `ClientEngineProtocolMismatchError` (then falls back to sync decode), and
  the IPC procedure map gate is `assertIpcProcedureMapVersion` (see the
  wire-protocol table rows above).

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

## Renderer-stream leg deletion (V5 plan 2.5) — one desktop event path, host 14 / facade 14 / engine 2

The desktop renderer no longer has a second, renderer-direct transport. The
`BackendRendererStream` loopback WebSocket, its request/reply vocabulary
(`BackendRendererRequest`), the bounded large-reply chunked framing
(`reply-start/chunk/end/abort`, `reply-ack`, `request-cancel`), the per-window
delivery-ownership table and grants
(`set-renderer-stream-ownership`, `RendererWindowDeliveryState`,
`RendererStreamOwnershipGrant`, `RendererStreamOwnershipClaim`), the targeted
fallback-copy envelopes (`supervisor-event.target`), and the generation-fenced
recovery barriers (`renderer-stream-recovery`) are GONE, together with
`BACKEND_RENDERER_STREAM_VERSION` (last 6, never published) and the
`getBackendStreamEngine` consumer.

- **`BACKEND_HOST_PROTOCOL_VERSION` 13 → 14** (`src/shared/backendHostProtocol.ts`):
  the deleted operation and envelope shapes are refused at the request and
  outbound gates (a v13 backend child fails both directions instead of
  half-serving a deleted transport), and a `supervisor-event` envelope that
  still carries targeting metadata is invalid. The relay is the legacy
  full-relay shape again: every `supervisor-event` crosses untargeted with its
  host-lifetime monotonic `rendererSequence`; windows dedupe by sequence;
  IPC shedding recovers through `supervisor-event-gap` (unchanged, and now the
  only recovery signal); `call-supervisor.originWindowId` still scopes
  terminal-bootstrap retention from the authenticated IPC sender. Host and
  main ship in one bundle, so the bump gates stale artifacts rather than
  cross-version production pairs.
- **Facade `PORACODE_CLIENT_RUNTIME_VERSION` 13 → 14** (see the preload
  compatibility section): the four stream bridge APIs are replaced by
  `ipcProcedureMapVersion` (the wired V5 2.6 handshake) and
  `onBackendSupervisorReset` (new `backendSupervisorReset` IPC channel;
  windows drop their dedupe cursor and rebuild subscribed state when a
  replacement backend child restarts the sequence space).
- **Client engine protocol 1 → 2**: the `decode-backend` work type left with
  the transport; the per-consumer engines are now the remote socket and the
  persist-JSON engines only (the T2 isolation rule — never reintroduce a
  shared engine — is unchanged).
- **What deliberately did NOT move:** the desktop event intake stays on the
  desktop-IPC relay, NOT the loopback remote HTTP+WS server. The remote wire
  deliberately does not carry the full desktop event surface — PTY bytes ride
  the opt-in `terminal-watch` frames instead of the replayable stream,
  `REMOTELY_CONSUMED_EVENT_TYPES` withholds desktop-only supervisor events
  (provider usage, workflow events, …), and `capBroadcastEvent` strips largest
  payload fields. Porting the desktop renderer onto that wire would therefore
  lose desktop features or require contract changes (a separate, deliberate
  decision). Requests keep flowing over the surviving main→backend
  `call-supervisor`/`call-database`/`call-service` operations, which the tray
  and shell consumers already require. The collapsed path deletes the
  redundant second implementation (stream + grants + chunking + recovery),
  which was the H4 redundancy.

## Desktop-internal loopback sessions (V5 plan 2.5 continuation) — additive remote-wire surface, no version bump

The wire-level blockers that stopped the loopback unification sub-item are
resolved with an ADDITIVE, admission-gated extension of the remote protocol.
The co-located desktop renderer can now consume the withheld desktop event
families over the loopback server without widening the surface any external or
native client sees.

- **New server message `desktop-event`** (`src/shared/remote/protocol.ts`,
  carried verbatim in the generated manifest via
  `REMOTE_DESKTOP_INTERNAL_MESSAGES` in `protocolFacts.ts`): `{type, seq,
event}` where `event` is a desktop-only `SupervisorEvent`
  (`DESKTOP_INTERNAL_EVENT_TYPES` in `RemoteAccessServer.ts` — provider usage,
  LSP, OSC, crossagent, experiment judging, `thread-voice`,
  `thread-scrollback-resync`, `agent-detected`, `git-changed`,
  `project-tree-changed`). It rides a SECOND bounded replayable buffer with its
  own contiguous `desktopSeq`, fully independent of the shared `event`
  sequence, so external clients' replay-contiguity contract never observes a
  desktop-only type. `thread-output` is absent from BOTH streams by design
  (PTY bytes stay on the terminal path).
- **New `/ws` handshake query parameters** `desktopInternal` (`0-or-1`) and
  `lastDesktopSeq` (`int`), declared in `WEBSOCKET_QUERY_CODECS` and the
  `desktopInternalStream` compatibility-policy block. Admission is
  loopback-origin gated in `wsConnections.ts`: the parameter counts only when
  the upgrade socket's remote address is loopback (IPv4, IPv6, IPv4-mapped,
  or a unix socket's empty address); a remote peer sending it is admitted as
  an ordinary session. Fail-closed by construction.
- **Version policy: no bump, both directions safe.** The protocol's
  compatibility policy treats unknown server-message discriminators as
  accept-and-ignore, so an OLD client never receives the frame (the server
  gates delivery per connection) and cannot be broken by its existence; an OLD
  server ignores the two new query parameters, so a NEW desktop client
  degrades to an ordinary session (live shared events only) and keeps
  working. `PORACODE_REMOTE_PROTOCOL_VERSION` (12) is unchanged.
- **Generated artifacts**: `pnpm protocol:remote:v3:generate` regenerated
  `protocol/remote/v3/generated/**` (manifest, IR, JSON-schema bundle,
  inventory, Swift/Kotlin bindings) so the `manifestHash`/`sourceHash` pins
  moved together in one generation — the single-source pipeline, not a hand
  mirror.
- **Renderer intake boundary** (`state/remoteServers/desktopLoopbackIntake.ts`
  - `ElectronBackendTransport`): the intake bootstraps through the EXISTING
    `getRemoteAccessPairing` main-local procedure and the standard
    pairing-token → access-token → WS-ticket HTTP flow, so no preload surface,
    IPC channel, or `standaloneAttachInfo` field changed. The pairing
    credential it consumes is the same single-use startup credential the
    desktop already mints per server start (consuming it participates in the
    existing rotation; the renderer is just a new consumer of an existing
    boundary). The intake joins live-only (no replay cursors) and recovers
    through the transport's rebuild dispatch — the same primitive the relay's
    shed/gap signals use — so no desktop reducer gained seq-replay obligations.
- **Completion (V5 plan 2.5, final):** the three recorded not-yet-moved
  sub-items landed; see the section below.

## Loopback 2.5 completion — terminal-watch migration, loopback request routing, always-on managed server — additive, no version bumps

The last three 2.5 sub-items moved the desktop's terminal bytes, its managed
requests, and the server guarantee itself onto the loopback leg. The version
verdict first, boundary by boundary:

- **Remote wire (`PORACODE_REMOTE_PROTOCOL_VERSION`, 12): unchanged, generated
  artifacts untouched.** The terminal migration consumes the EXISTING
  `terminal-watch` / `terminal-output` / cursor-sync v1/v2 surface (the
  desktop-internal admission from the 2.5 continuation). The request-routing
  and bootstrap surfaces below ride desktop-internal IPC, not the remote
  manifest; `pnpm protocol:remote:v3:check` stays green with the existing
  `manifestHash`/`sourceHash` pins.
- **IPC procedure map (`IPC_PROCEDURE_MAP_VERSION`, 1): additive name, version
  stays, fingerprint pin moved.** One new main-local procedure,
  `getManagedLoopbackBootstrap`, was added; every peer loud-rejects unknown
  names, so per the map's recorded rule the version stays 1 and the pinned
  fingerprint in `procedureMapVersion.test.ts` was refreshed to force exactly
  this review.
- **Backend-host protocol (14): additive same-build service name.**
  `getManagedLoopbackBootstrap` mirrors through `BackendServiceProcedureMap`;
  main and the backend child ship in one bundle, so no protocol bump (the
  same rule as the `dataFencePath` field).
- **`standaloneAttachInfo` / attach bootstrap: untouched.** The managed
  bootstrap payload is a separate surface; attach mode and the standalone
  server are unaffected.

The three sub-items:

- **Terminal UI on `terminal-watch`.** Local (managed) terminal surfaces
  subscribe through `watchManagedTerminal` (`remoteTerminalFeed.ts`) instead
  of the raw relay subscription: while the loopback leg is active, PTY bytes
  and terminal lifecycle ride the loopback session's `terminal-watch`
  machinery (v2 chunked baselines + cursor sync, v1 downgrade preserved),
  exactly as remote terminals always have; while it is down, the
  desktop-IPC relay's `thread-output` is the fallback, and the transport's
  rebuild dispatch (`thread-scrollback-resync`) drives the existing
  scrollback-recovery rehydration on every leg flip. The transport now
  suppresses ALL relay events while the loopback leg is active (the
  `thread-output` exception is gone — relay dedupe/cursor semantics are
  unchanged). Renderer terminal interest leases are still held in both
  modes, so backend retention and rebuild scope do not change. The terminal
  surface contract (real PTY, byte-exact output, Ctrl chords, resize
  propagation, scrollback persistence) is regression-covered on the unified
  path against a real `RemoteAccessServer`
  (`desktopLoopbackUnification.test.ts`).
- **Loopback request routing.** While the loopback leg is active, managed
  remote-routable requests (the `REMOTE_PROCEDURE_ROUTES` set) route over the
  loopback HTTP leg through an ephemeral, in-memory owner row
  (`managedLoopbackOwner.ts`, `MANAGED_LOOPBACK_DESKTOP_ID = "managed-loopback"`
  — a literal that can never collide with a UUID `desktopId`). The managed
  host mirrors attach mode's owner-row routing for the desktop's OWN
  entities: identity owners (managed rows are not projected), with local
  location payloads stamped `remoteServerId` by `stampRemoteOwnerOntoPayload`
  (the router's `unprojectRemotePayload` strips the stamp before the wire, so
  the request the server sees is byte-identical). Persisted paired owners
  still resolve first, so desktop-as-client routing is unchanged. A request
  whose loopback transport fails mid-flight falls back to preload IPC
  (transport failures only — never a server verdict, which the same backend
  would answer identically over IPC). The 32 MiB large-reply acceptance runs
  on the loopback HTTP path.
- **Always-on managed server + bootstrap payload.** The desktop-managed
  flavor ALWAYS has a loopback `RemoteAccessServer` running from readiness:
  `startIfEnabled` starts unconditionally — the full (advertised) instance
  when remote access is enabled, otherwise a loopback-only instance whose
  bind is pinned to `127.0.0.1` regardless of bind-mode env. The loopback
  instance is reachable but never discoverable: the user-facing pairing
  surface (`getPairingInfo`, the `remote-access-pairing-changed` broadcast,
  and `refreshRemoteAccessPairing`'s QR rotation) reports `disabled` while
  only the loopback instance runs, and no pairing URL is logged for it.
  Enabling upgrades (replaces the loopback-only instance), disabling
  downgrades to it — the full stop path is deleted. The renderer learns the
  attach point through the **managed bootstrap payload**
  (`ManagedLoopbackBootstrap` = `{ endpoint: <loopback http origin>,
pairingUrl: <loopback pairing URL with the single-use `#token=` credential> }`)
  served by `getManagedLoopbackBootstrap`; the controller serializes behind
  readiness, so the server is running and a fresh dedicated credential
  (`mintLoopbackRendererCredential`, which never rotates the displayed QR)
  is minted before the renderer asks. On leg loss the renderer re-asks the
  bootstrap (fresh endpoint/credential after a server restart); a failed
  attempt retries on the discovery interval, and the desktop-IPC relay plus
  preload IPC remain the documented fallback legs throughout.

## Local delivery-ownership wire boundary (backend-host 13 / renderer stream 5) — SUPERSEDED, deleted in V5 2.5

> **DELETED (V5 plan 2.5, host protocol 14 / facade 14 / engine protocol 2).**
> The entire renderer-stream leg this section describes — the per-window
> delivery-ownership table, minted grants, targeted fallback copies,
> generation-fenced recovery barriers, and `BACKEND_RENDERER_STREAM_VERSION`
> itself — was removed together with the desktop-IPC relay becoming the sole
> desktop event path. See "Renderer-stream leg deletion (V5 plan 2.5)" below.
> The history here is retained for the audit trail of versions 13/5/10.

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

## Bounded large-reply transfer candidate (renderer stream 5 → 6, uncommitted) — DELETED in V5 2.5

> **DELETED (V5 plan 2.5).** This working-tree candidate was never published
> and its entire subject (the renderer-stream chunked large-reply framing and
> `BACKEND_RENDERER_STREAM_VERSION` 6) was removed with the renderer-stream
> leg before any release. Large replies now travel the unified desktop-IPC
> procedure path un-chunked; the 32 MiB acceptance is pinned by
> `src/renderer/electronBackendTransport.largeReply.test.ts`. The budgets
> below are historical.

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
