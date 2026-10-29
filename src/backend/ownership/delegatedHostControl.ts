import { resolve } from "node:path";
import {
  desktopHostControlGrantSchema,
  type DesktopHostControlGrant,
} from "@/shared/desktopHostControl";
import { readHostOwnerRecord } from "./hostOwnerLease";
import { resolveHostRootPaths, type HostRootPaths } from "./hostRootPaths";
import type { HostDataFence } from "./hostDataFence";
import type { HostControlAuthority } from "./HostControlServer";

/** Read-only preflight; this is not authority without the live parent and data fence. */
export function validateDesktopControlGrant(input: {
  grant: unknown;
  dataRoot: string;
  dataFencePath: string | undefined;
  ownerPid: number;
}) {
  const grant = desktopHostControlGrantSchema.parse(input.grant);
  const paths = resolveHostRootPaths(grant.profileNamespace);
  if (
    !input.dataFencePath ||
    paths.dataRoot !== resolve(input.dataRoot) ||
    paths.dataFencePath !== resolve(input.dataFencePath)
  )
    throw new Error(
      "Desktop control delegation does not match the backend's exact data root and fence.",
    );
  assertParentRecord(paths, grant.ownerGeneration, input.ownerPid);
  return { grant, paths };
}

function assertParentRecord(paths: HostRootPaths, generation: string, ownerPid: number) {
  const owner = readHostOwnerRecord(paths);
  if (
    owner?.generation !== generation ||
    owner.pid !== ownerPid ||
    owner.kind !== "desktop" ||
    owner.phase === "stopped"
  )
    throw new Error(
      "The desktop control delegation no longer belongs to the active owner generation.",
    );
}

export function delegatedDesktopControl(input: {
  grant: DesktopHostControlGrant;
  dataRoot: string;
  dataFencePath: string;
  custody: Pick<HostDataFence, "generation" | "assertActive">;
  ownerPid: number;
  assertParentActive(): void;
}): HostControlAuthority {
  const { grant, paths } = validateDesktopControlGrant(input);
  const custodyGeneration = input.custody.generation;
  const authority: HostControlAuthority = {
    paths,
    generation: grant.ownerGeneration,
    kind: "desktop",
    assertActive(expectedGeneration = grant.ownerGeneration) {
      input.assertParentActive();
      input.custody.assertActive(custodyGeneration);
      if (expectedGeneration !== grant.ownerGeneration)
        throw new Error(
          "The desktop control delegation no longer belongs to the active owner generation.",
        );
      assertParentRecord(paths, grant.ownerGeneration, input.ownerPid);
    },
  };
  authority.assertActive();
  return authority;
}
