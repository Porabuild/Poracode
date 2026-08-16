/**
 * Host → Electron-main IPC is a sibling-client channel after the backend-host
 * extraction. A saturated desktop IPC pipe must not pause supervisor/PTY output:
 * the PWA and other in-process clients consume events here, and a slow desktop
 * recovers through renderer-stream replay/resync.
 *
 * Supervisor → host IPC backpressure (`src/supervisor/index.ts`) is different —
 * that parent is the authority and should still pause PTY output.
 */
export function applyElectronIpcBackpressure(_input: {
  readonly paused: boolean;
  readonly setSupervisorOutputBackpressured: (paused: boolean) => void;
}): void {
  // Electron is a sibling client. Do not call setSupervisorOutputBackpressured.
}
