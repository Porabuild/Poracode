/** Socket addresses come from the kernel, never forwarded headers. A specifically
 * bound server's local adapter connects via that interface instead of loopback.
 * This peer check supplements the per-instance dispatch key; it is not authentication. */
export function isLocalDispatchPeer(
  remoteAddress: string | undefined,
  localAddress: string | undefined,
): boolean {
  const remote = remoteAddress?.replace(/^::ffff:/, "");
  const local = localAddress?.replace(/^::ffff:/, "");
  if (!remote) return false;
  return remote === "::1" || remote.startsWith("127.") || remote === local;
}
