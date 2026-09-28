/**
 * Default standalone-server install prefix: `/opt/poracode` on POSIX,
 * `%LOCALAPPDATA%\Poracode\server` on Windows. The implementation is the one
 * in `scripts/server-host-tools.mjs` (shipped in the tarball and mirrored in
 * the launcher), so the installer scripts and the in-process upgrade CLI can
 * never disagree about where a server lives.
 */
export { defaultServerPrefix } from "../../scripts/server-host-tools.mjs";
