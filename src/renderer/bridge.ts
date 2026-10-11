import { parseIpcProcedureArgs, type PoracodeBridge } from "@/shared/ipc";
import { routeRemoteProcedure } from "@/renderer/remoteProcedureRouter";
import { isRemoteRoutableProcedure } from "@/renderer/remoteProcedureRoutes";
import { isCompactClientRuntimeSurface, readClientRuntime } from "@/renderer/clientRuntime";

let cachedBridge: PoracodeBridge | undefined;
let cachedSource: ReturnType<typeof readClientRuntime> | undefined;

export function readBridge(): PoracodeBridge {
  if (typeof window === "undefined" || (!window.poracodeHost && !window.poracode)) {
    return undefined as unknown as PoracodeBridge;
  }
  const source = readClientRuntime();
  if (cachedBridge && cachedSource === source) return cachedBridge;
  cachedSource = source;
  const functionCache = new Map<PropertyKey, { value: Function; wrapper: Function }>();
  cachedBridge = new Proxy({} as PoracodeBridge, {
    ownKeys() {
      return [
        ...new Set([...Reflect.ownKeys(source.native), ...Reflect.ownKeys(source.procedures)]),
      ];
    },
    getOwnPropertyDescriptor(_target, property) {
      return Reflect.has(source.procedures, property) || Reflect.has(source.native, property)
        ? { configurable: true, enumerable: true }
        : undefined;
    },
    has(_target, property) {
      return Reflect.has(source.procedures, property) || Reflect.has(source.native, property);
    },
    get(_target, property) {
      const owner = Reflect.has(source.procedures, property) ? source.procedures : source.native;
      const value = Reflect.get(owner, property, owner) as unknown;
      if (typeof value !== "function") return value;
      const cached = functionCache.get(property);
      if (cached?.value === value) return cached.wrapper;
      const routableProcedure =
        typeof property === "string" && isRemoteRoutableProcedure(property) ? property : undefined;
      const wrapper = (...args: unknown[]) => {
        if (routableProcedure) {
          const payload = parseIpcProcedureArgs(routableProcedure, args);
          const decision = routeRemoteProcedure(routableProcedure, payload);
          if (decision.kind === "remote") return decision.result;
        }
        return Reflect.apply(value, owner, args);
      };
      functionCache.set(property, { value, wrapper });
      return wrapper;
    },
  });
  return cachedBridge;
}

export function isWindows(): boolean {
  return readBridge().platform === "win32";
}

export function isMac(): boolean {
  return readBridge().platform === "darwin";
}

export function isDevApp(): boolean {
  return readBridge().isDev === true;
}

export function isQuickComposerWindow(): boolean {
  return readBridge().windowKind === "quickComposer";
}

/**
 * True when the renderer runs against the remote-session bridge shim (the
 * canonical browser app paired to a host) instead of the local Electron bridge.
 * Desktop-only controls (system sleep, tray, agent installs, …) should be
 * hidden in that case — the shim swallows or rejects their bridge calls.
 */
export function isRemoteSession(): boolean {
  return (
    typeof window !== "undefined" &&
    (!!window.poracodeHost || !!window.poracode) &&
    readClientRuntime().transport === "remote-http-websocket"
  );
}

/** True only for the browser client's live compact layout. */
export function isCompactClientSurface(): boolean {
  return isCompactClientRuntimeSurface();
}
