import { hasElectronHostBridge } from "@/renderer/clientRuntime";

// Retire the hosted Nightly's pre-recovery pairings and crypto key together.
// A new namespace avoids reading broken CryptoKeys or waiting for old PWA tabs
// to release IndexedDB. Keep this identity fixed so re-pairing survives updates.
const recoverNightlyPairings =
  typeof window !== "undefined" &&
  !hasElectronHostBridge() &&
  window.location.hostname === "app-nightly.poracode.com";

export const remotePairingStorage = {
  name: recoverNightlyPairings
    ? "poracode-remote-servers-nightly-20261115"
    : "poracode-remote-servers",
  vaultDatabase: recoverNightlyPairings
    ? "poracode-remote-vault-nightly-20261115"
    : "lightcode-mobile-vault",
  importLegacy: !recoverNightlyPairings,
};
