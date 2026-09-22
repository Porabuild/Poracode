import {
  catalogMembershipRequestSchema,
  catalogMembershipRequestUniquenessIssue,
  catalogMembershipResponseSchema,
} from "@/shared/remote/catalogReadContract";
import { dbReadCatalogMembership } from "@/host/db/catalogMembershipReads";
import { RemoteHttpError } from "../auth";
import { writeJson } from "./httpResponses";
import { readJsonBody } from "./requestBody";
import type { HttpRouteCall } from "./httpRouteHandlers.shared";

/**
 * B4 `POST /api/catalog/membership` handler. Read-only, bearer
 * `session:read`, no audit kind ("read"): the body is bounded to 200 unique
 * ids per list and the answer is the authoritative existence set the client's
 * deletion gate needs after a completed inventory walk.
 *
 * C0 registers the route and response schema from
 * `@/shared/remote/catalogReadContract`; no host-side registry entry is edited
 * by this slice.
 */
export async function handleCatalogMembership(call: HttpRouteCall): Promise<void> {
  const request = catalogMembershipRequestSchema.parse(await readJsonBody(call.req));
  const duplicateField = catalogMembershipRequestUniquenessIssue(request);
  if (duplicateField !== null) {
    throw new RemoteHttpError("invalid_request", `${duplicateField} must be unique.`, 400);
  }
  writeJson(call.res, 200, catalogMembershipResponseSchema.parse(dbReadCatalogMembership(request)));
}
