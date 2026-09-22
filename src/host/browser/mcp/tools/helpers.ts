import { resolveRefToSelector, type PageJavaScriptExecutor } from "../../pageDriver";

export function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export async function resolveSelectorArg(
  tab: { webContents: PageJavaScriptExecutor },
  payload: Record<string, unknown>,
): Promise<string | null> {
  if (typeof payload.selector === "string" && payload.selector.length > 0) {
    return payload.selector;
  }
  if (typeof payload.ref === "string" && payload.ref.length > 0) {
    return await resolveRefToSelector(tab.webContents, payload.ref);
  }
  return null;
}
