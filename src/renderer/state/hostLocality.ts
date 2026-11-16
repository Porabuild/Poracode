/**
 * Whether the host that owns a row runs on this machine.
 *
 * The desktop's own rows live on its managed host, which is co-located with
 * this client: it shares this machine's filesystem and home directory, its
 * native dialogs and OS credential stores, its CLI installs and sign-ins, and
 * it is the only host that sends the desktop-internal event frames (voice
 * sessions, OSC shell events, ...). A paired host's rows are projected
 * (`remoteServerId`); that host is another machine, so none of those are
 * shared. This is the single place a flow asks that question instead of
 * branching on `remoteServerId`; keep a comment beside each use naming which
 * of those it depends on.
 *
 * Kept free of store imports so provider modules and tests can use it
 * without pulling in the catalog and transport graph.
 */
export function hostRunsOnThisMachine(
  entity: { readonly remoteServerId?: string | undefined } | null | undefined,
): boolean {
  return entity?.remoteServerId === undefined;
}

/**
 * {@link hostRunsOnThisMachine} for a project, whose projected location also
 * carries the owning host.
 */
export function projectHostRunsOnThisMachine(
  project:
    | {
        readonly remoteServerId?: string | undefined;
        readonly location: { readonly remoteServerId?: string | undefined };
      }
    | null
    | undefined,
): boolean {
  return hostRunsOnThisMachine(project) && hostRunsOnThisMachine(project?.location);
}
