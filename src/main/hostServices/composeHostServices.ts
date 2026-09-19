// One host-service composition for both authorities (V5 plan 1.1 / finding
// H3): the desktop app and the standalone server construct the SAME
// Electron-free host services through this module — SSH environments, the
// external-Chrome bridge plus its `chrome` MCP ingress, and the computer-use
// MCP ingress. Only the parts that genuinely need Electron (the
// WebContentsView browser panel, its `browser` MCP ingress, and the
// computer-use desktop overlay hooks) arrive through the optional
// `nativeShell` parameter, so a headless composition simply passes none.
//
// Schedule wiring is intentionally absent here: both authorities already
// compose `ScheduleService` identically inside their backend runtime
// (`BackendDurableServices` — the desktop forks it inside backendHost.cjs,
// the standalone server constructs it in-process in
// `headlessRemoteComposition`), so no desktop-only schedule composition ever
// existed to extract.
//
// The composed services also declare the host's service capabilities (V5
// plan 1.2): the describe builders on both sides publish
// {@link ComposedHostServices.capabilities} verbatim so clients negotiate
// availability instead of inferring it from the host mode.

import { join } from "node:path";
import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import type { SharedSettings } from "@/shared/settings";
import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
// Direct submodule imports, never the ../browser or ../computer-use barrels:
// the standalone server bundles this module, and the barrels re-export
// Electron-only pieces (BrowserPanelManager, the desktop overlay, the wake
// lock), which would drag `electron` into the server bundle.
import { ChromeBridgeServer } from "../browser/external/ChromeBridgeServer";
import { ChromeMcpIngress } from "../browser/external/ChromeMcpIngress";
import type { BrowserMcpIngress } from "../browser/BrowserMcpIngress";
import type { BrowserPanelManager } from "../browser/BrowserPanelManager";
import {
  ComputerUseMcpIngress,
  type ComputerUseActivityEvent,
} from "../computer-use/ComputerUseMcpIngress";
import { resolveComputerUseHelperBinaryPath } from "../computer-use/drivers";
import { SshConnectionManager } from "../ssh/SshConnectionManager";

export interface HostServicesCore {
  /** Owned profile root: SSH runtime cache + the Chrome bridge pairing file. */
  readonly baseDir: string;
  /** Current shared settings (browser allow gates are re-read on demand). */
  readonly getSharedSettings: () => SharedSettings;
  /**
   * SSH runtime staging inputs. `null` declares the host ships no SSH
   * environments at all (capability `ssh: false`); when set, staging failures
   * surface loudly on the first connect, never at composition time.
   */
  readonly ssh: {
    readonly mainBundleDir: string;
    readonly agentPluginsDir: string;
    readonly wslHelpersDir: string;
    readonly bundledSkillsDir?: string;
    readonly bundledPluginsDir?: string;
  } | null;
  /**
   * Computer-use driver inputs. `null` declares the host ships no computer
   * use; when set, the same platform/support rule as the desktop applies
   * (Windows/macOS keep the legacy in-process driver, elsewhere a staged
   * helper binary must resolve).
   */
  readonly computerUse: {
    readonly helperRootDir: string;
    readonly stateDir: string;
  } | null;
  /**
   * Declared custody/gateway facts the composition does not construct itself:
   * OS-backed secret sealing (safeStorage) and the raw port-forward gateway
   * that lives beside the remote server. Hosts declare what they own; the
   * describe payload publishes them verbatim.
   */
  readonly nativeSecrets: boolean;
  readonly portForward: boolean;
}

/**
 * The Electron-shell-owned parts of the host services. The desktop caller
 * constructs these (they need BrowserWindow / WebContentsView / wake locks)
 * and hands them in; a headless composition passes no `nativeShell` at all.
 */
export interface NativeShellHostServices {
  /** Embedded-browser MCP ingress; the WebContentsView panel stays caller-owned. */
  readonly browserMcpIngress: BrowserMcpIngress;
  readonly browserPanelManager: BrowserPanelManager;
  /**
   * Computer-use desktop overlay hooks. The overlay window itself stays
   * caller-owned; the composed ingress only forwards activity to it and
   * asks whether the display wake lock is currently held.
   */
  readonly computerUse?: {
    onActivity(event: ComputerUseActivityEvent): void;
    isDisplayKeptAwake(): boolean;
  };
}

export interface ComposedHostServices {
  /** Null when the host declared no SSH inputs (capability `ssh: false`). */
  readonly sshConnectionManager: SshConnectionManager | null;
  readonly chromeBridgeServer: ChromeBridgeServer;
  readonly chromeMcpIngress: ChromeMcpIngress;
  /** Null without `nativeShell` — the embedded browser is shell-owned. */
  readonly browserMcpIngress: BrowserMcpIngress | null;
  readonly computerUseMcpIngress: ComputerUseMcpIngress | null;
  /** Host-declared service capabilities for the describe payload (V5 1.2). */
  readonly capabilities: HostServiceCapabilities;
  /**
   * URL/token env the supervisor needs to reach the composed MCP ingresses.
   * Desktop and standalone hosts merge this into their supervisor launch env
   * alike; info is absent (and env omitted) until an ingress has started.
   */
  supervisorExtraEnv(): Record<string, string>;
  /** Mirror the shared browser eval/data-access gates onto the ingresses. */
  applyBrowserAllowFlags(settings?: SharedSettings): void;
  /**
   * Resolves once the MCP ingresses have settled their start attempts
   * (failures are logged, never thrown — startup continues degraded exactly
   * like the desktop always has). The Chrome bridge connection listener is
   * kicked at composition time and deliberately not awaited.
   */
  start(): Promise<void>;
  /**
   * Disposes the composed MCP ingresses and the Chrome bridge. The SSH
   * manager is intentionally NOT disposed here: each host joins it at its
   * own shutdown point (the desktop disposes it with the backend child, the
   * standalone server disposes it with its own runtime join).
   */
  dispose(): Promise<void>;
}

export function composeHostServices(
  core: HostServicesCore,
  nativeShell?: NativeShellHostServices,
): ComposedHostServices {
  const sshConnectionManager = core.ssh
    ? new SshConnectionManager({
        mainBundleDir: core.ssh.mainBundleDir,
        agentPluginsDir: core.ssh.agentPluginsDir,
        wslHelpersDir: core.ssh.wslHelpersDir,
        ...(core.ssh.bundledSkillsDir ? { bundledSkillsDir: core.ssh.bundledSkillsDir } : {}),
        ...(core.ssh.bundledPluginsDir ? { bundledPluginsDir: core.ssh.bundledPluginsDir } : {}),
        cacheDir: join(core.baseDir, "ssh-runtime-bundles"),
      })
    : null;

  const chromeBridgeServer = new ChromeBridgeServer({
    pairingFilePath: join(core.baseDir, "chrome-bridge.json"),
  });
  const chromeMcpIngress = new ChromeMcpIngress();
  chromeMcpIngress.setConnectionAccessor(() => chromeBridgeServer.getConnection());

  const browserMcpIngress = nativeShell?.browserMcpIngress ?? null;
  if (nativeShell) {
    browserMcpIngress?.setManagerAccessor(() => nativeShell.browserPanelManager);
  }

  // Windows and macOS keep a legacy in-process driver, so they stay
  // supported even without a staged helper. Everywhere else the helper is
  // the only backend: with no binary for this platform/arch the ingress
  // would advertise tools that all fail and would still inject a token into
  // every agent launch, so skip it entirely and let supervisorExtraEnv
  // yield nothing because getInfo() stays null.
  const computerUseSupported =
    core.computerUse !== null &&
    (process.platform === "win32" ||
      process.platform === "darwin" ||
      resolveComputerUseHelperBinaryPath(core.computerUse.helperRootDir) !== null);
  const overlayHooks = nativeShell?.computerUse;
  const computerUseMcpIngress =
    computerUseSupported && core.computerUse
      ? new ComputerUseMcpIngress({
          driverOptions: {
            helperRootDir: core.computerUse.helperRootDir,
            stateDir: core.computerUse.stateDir,
            warn: (message) => console.warn(`[poracode] ${message}`),
          },
          ...(overlayHooks
            ? {
                onActivity: (event: ComputerUseActivityEvent) => overlayHooks.onActivity(event),
                isDisplayKeptAwake: () => overlayHooks.isDisplayKeptAwake(),
              }
            : {}),
        })
      : null;

  const capabilities: HostServiceCapabilities = {
    ssh: sshConnectionManager !== null,
    browserPanel: nativeShell !== undefined,
    chromeBridge: true,
    computerUse: computerUseMcpIngress !== null,
    nativeSecrets: core.nativeSecrets,
    portForward: core.portForward,
  };

  const applyBrowserAllowFlags = (settings?: SharedSettings): void => {
    let allowEval = false;
    let allowDataAccess = false;
    try {
      const s = settings ?? core.getSharedSettings();
      allowEval = s.browser?.allowEval === true;
      allowDataAccess = s.browser?.allowDataAccess === true;
    } catch {
      allowEval = false;
      allowDataAccess = false;
    }
    // The embedded browser and the external Chrome bridge share the same
    // eval / data-access gates from browser settings.
    browserMcpIngress?.setAllowEval(allowEval);
    browserMcpIngress?.setAllowDataAccess(allowDataAccess);
    chromeMcpIngress.setAllowEval(allowEval);
    chromeMcpIngress.setAllowDataAccess(allowDataAccess);
  };
  // Prime the gates from current settings at composition time, exactly like
  // the desktop always primed them before the first ingress start.
  applyBrowserAllowFlags();

  const startSettled = Promise.all([
    browserMcpIngress
      ? browserMcpIngress.start().catch((err) => {
          console.error("[poracode] browser MCP ingress failed to start:", err);
          return null;
        })
      : Promise.resolve(null),
    chromeMcpIngress.start().catch((err) => {
      console.error("[poracode] chrome MCP ingress failed to start:", err);
      return null;
    }),
    computerUseMcpIngress
      ? computerUseMcpIngress.start().catch((err) => {
          console.error("[poracode] computer use MCP ingress failed to start:", err);
          return null;
        })
      : Promise.resolve(null),
  ]);
  // The bridge's localhost WS listener is fire-and-forget on the desktop, so
  // it stays fire-and-forget here: agents reach it through the chrome MCP
  // ingress, which retries its connection accessor lazily.
  void chromeBridgeServer.start().catch((err) => {
    console.error("[poracode] chrome bridge server failed to start:", err);
  });

  let disposal: Promise<void> | null = null;

  return {
    sshConnectionManager,
    chromeBridgeServer,
    chromeMcpIngress,
    browserMcpIngress,
    computerUseMcpIngress,
    capabilities,
    supervisorExtraEnv: () => {
      const env: Record<string, string> = {};
      const browserInfo = browserMcpIngress?.getInfo();
      if (browserInfo) {
        env.PORACODE_BROWSER_MCP_URL = browserInfo.url;
        env.PORACODE_BROWSER_MCP_TOKEN = browserInfo.token;
      }
      const chromeInfo = chromeMcpIngress.getInfo();
      if (chromeInfo) {
        env.PORACODE_CHROME_MCP_URL = chromeInfo.url;
        env.PORACODE_CHROME_MCP_TOKEN = chromeInfo.token;
      }
      const computerUseInfo = computerUseMcpIngress?.getInfo();
      if (computerUseInfo) {
        env.PORACODE_COMPUTER_USE_MCP_URL = computerUseInfo.url;
        env.PORACODE_COMPUTER_USE_MCP_TOKEN = computerUseInfo.token;
      }
      return env;
    },
    applyBrowserAllowFlags,
    start: () => startSettled.then(() => undefined),
    dispose: () => {
      disposal ??= joinRuntimeShutdown(
        [
          () => browserMcpIngress?.dispose(),
          () => computerUseMcpIngress?.dispose(),
          () => chromeMcpIngress.dispose(),
          () => chromeBridgeServer.dispose(),
        ],
        "Host service shutdown did not complete cleanly.",
      );
      return disposal;
    },
  };
}
