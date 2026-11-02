import type { ProjectLocation } from "@/shared/contracts";
import { transportUrl, useMcpServerOauth } from "@/renderer/components/mcp/useMcpServerOauth";
import { useMcpServerProbes } from "@/renderer/components/mcp/useMcpServerProbes";
import type { ComposerCustomMcpItem } from "./ComposerMcpServersMenu";

interface ComposerMcpSignIn {
  id: string;
  name: string;
  busy: boolean;
  signIn: () => void;
}

/**
 * Sign-in actions for the composer's MCP Servers list: one per enabled HTTP/SSE
 * server whose probe reports that it needs OAuth and that has no stored
 * credentials — the same rule as the settings page's Authenticate button.
 * Mount it only while the list is open: it probes the servers it is given.
 * Project-scope rows probe through their project location; OAuth tokens live
 * with the host that launches the server (the paired host for a remote
 * project), mirroring `McpServersManager`.
 */
export function useComposerMcpSignIns(
  items: readonly ComposerCustomMcpItem[],
): ComposerMcpSignIn[] {
  const candidates = items.flatMap((item) =>
    item.enabled && item.oauth && transportUrl(item.oauth.server) !== undefined
      ? [{ id: item.id, name: item.name, ...item.oauth }]
      : [],
  );
  const projectLocation: ProjectLocation | undefined = candidates.find(
    (candidate) => candidate.projectLocation,
  )?.projectLocation;
  const userProbes = useMcpServerProbes(
    candidates.filter((candidate) => !candidate.projectLocation).map(({ server }) => server),
  );
  const projectProbes = useMcpServerProbes(
    candidates.filter((candidate) => candidate.projectLocation).map(({ server }) => server),
    projectLocation,
  );
  const remoteOauthLocation = projectLocation?.remoteServerId ? projectLocation : undefined;
  // Global rows, and project rows of a local project, sign in on this host.
  const signsInLocally = candidates.some(
    (candidate) => !candidate.projectLocation || !remoteOauthLocation,
  );
  const userOauth = useMcpServerOauth(undefined, signsInLocally);
  const remoteOauth = useMcpServerOauth(remoteOauthLocation, remoteOauthLocation !== undefined);

  return candidates.flatMap((candidate) => {
    const isProject = candidate.projectLocation !== undefined;
    const probes = isProject ? projectProbes : userProbes;
    const oauth = isProject && remoteOauthLocation ? remoteOauth : userOauth;
    const url = transportUrl(candidate.server);
    if (!url || oauth.authenticatedUrls.has(url)) return [];
    if (probes.states[candidate.server.id]?.status !== "auth-required") return [];
    return [
      {
        id: candidate.id,
        name: candidate.name,
        busy: oauth.busyServerIds.has(candidate.server.id),
        signIn: () => {
          void oauth.authenticate(candidate.server).then((authenticated) => {
            if (authenticated) probes.probe(candidate.server);
          });
        },
      },
    ];
  });
}
