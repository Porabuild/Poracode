import type { PoracodeBridge } from "@/shared/ipc";
import { isRemoteRoutableProcedure, routeRemoteProcedure } from "@/renderer/remoteProcedureRouter";

let cachedBridge: PoracodeBridge | undefined;
let cachedSource: PoracodeBridge | undefined;

export function readBridge(): PoracodeBridge {
  const source = window.poracode;
  if (!source) return source as PoracodeBridge;
  if (cachedBridge && cachedSource === source) return cachedBridge;
  cachedSource = source;
  const functionCache = new Map<PropertyKey, { value: Function; wrapper: Function }>();
  cachedBridge = new Proxy({} as PoracodeBridge, {
    get(_target, property) {
      const value = Reflect.get(source, property, source) as unknown;
      if (typeof value !== "function") return value;
      const cached = functionCache.get(property);
      if (cached?.value === value) return cached.wrapper;
      const shouldRoute = typeof property === "string" && isRemoteRoutableProcedure(property);
      const wrapper = (...args: unknown[]) => {
        const routed = shouldRoute ? routeRemoteProcedure(property as string, args[0]) : undefined;
        return routed ?? Reflect.apply(value, source, args);
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
 * mobile PWA paired to a desktop) instead of the local Electron bridge.
 * Desktop-only controls (system sleep, tray, agent installs, …) should be
 * hidden in that case — the shim swallows or rejects their bridge calls.
 */
export function isRemoteSession(): boolean {
  return typeof window !== "undefined" && window.poracode?.appVersion === "remote";
}
