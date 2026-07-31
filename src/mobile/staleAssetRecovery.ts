export function isStaleAssetError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const message = error.message;
  return (
    message.includes("is not a valid JavaScript MIME type") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed")
  );
}
