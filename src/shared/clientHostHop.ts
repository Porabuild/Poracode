/**
 * V6 B.5 / T-3: one version for the renderer→host hop. Covers the Electron
 * client-runtime facade, the IPC procedure map, and the backend-host
 * protocol. Previously published IPC map version 1 is an old reader.
 *
 * Keep remote protocol, client-engine protocol, and host-control as separate
 * hops. Inventory of renderer→host constants: this, remote protocol, engine,
 * host-control (≤4).
 */
export const CLIENT_HOST_HOP_VERSION = 14 as const;
export const PREVIOUS_IPC_PROCEDURE_MAP_VERSION = 1 as const;
