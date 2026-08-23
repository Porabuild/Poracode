/**
 * Best-effort identity from `@cursor/sdk`. `Cursor.me({ apiKey })` returns
 * `SDKUser`; older / partial payloads may only have `email`. Account identity
 * is supplemental — a missing or failing `me()` must not fail model probing.
 */

export function readCursorSdkAccountEmail(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["userEmail", "email"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

export async function probeCursorSdkAccountEmail(
  cursor: unknown,
  apiKey?: string,
): Promise<string | undefined> {
  if (!cursor || typeof cursor !== "object") return undefined;
  const me = (cursor as { me?: unknown }).me;
  if (typeof me !== "function") return undefined;
  try {
    const account = await me(apiKey ? { apiKey } : undefined);
    return readCursorSdkAccountEmail(account);
  } catch {
    return undefined;
  }
}
