/**
 * V6 B.5 / T-3: one version for the renderer→host hop. Covers the Electron
 * client-runtime facade, the IPC procedure map, and the backend-host
 * protocol. Previously published IPC map version 1 is an old reader.
 *
 * Version 15 (V2 A2): the backend→main bulk supervisor-event relay, its
 * `supervisor-event-gap` recovery kind, and the `setRendererEventInterests`
 * IPC sync were removed. Live renderer content rides the loopback WS; main
 * receives only the bounded `native-thread-activity` projection. A peer from
 * an earlier bundle still speaks the removed vocabulary, so this hop rejects
 * it typed instead of silently dropping its bulk.
 *
 * Version 15 (host correction, same unreleased boundary): the `projects-changed`
 * native event is removed too — the full Project[] mirror relay across
 * backend→main→renderer is gone; project mutations publish the bounded
 * `remote-projects-changed` WS membership event and main keeps only the
 * `database-projection-changed` tray refresh. No hop-15 artifact was released
 * with that event vocabulary.
 *
 * Version 16 (V2): the legacy `dbPersistExperimentState` IPC procedure is
 * removed. The renderer experiment store is a memory-only projection of the
 * co-located host's durable authority (`GET /api/experiments` +
 * `/api/experiments/{id}/command`, capability `experiments` v1), so no
 * renderer→host experiment persist remains. A hop-15 peer still dispatches
 * the removed name, so the gates reject that pairing typed
 * (`PREVIOUS_CLIENT_HOST_HOP_VERSION`).
 *
 * Keep remote protocol, client-engine protocol, and host-control as separate
 * hops. Inventory of renderer→host constants: this, remote protocol, engine,
 * host-control (≤4).
 */
export const CLIENT_HOST_HOP_VERSION = 16 as const;
/** The previous artifact hop, kept as an old reader for pre-upgrade regressions. */
export const PREVIOUS_CLIENT_HOST_HOP_VERSION = 15 as const;
export const PREVIOUS_IPC_PROCEDURE_MAP_VERSION = 1 as const;
