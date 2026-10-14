/** Managed QA sessions can suppress incidental credential reads and quota calls.
 * Production sessions ignore the override; real provider turns are unaffected. */
export function isUsageCollectionEnabled(
  requested = process.env.PORACODE_DISABLE_USAGE_COLLECTION,
  isDevSession = process.env.PORACODE_IS_DEV === "1" || Boolean(process.env.VITE_DEV_SERVER_URL),
): boolean {
  return requested !== "1" || !isDevSession;
}
