import { describe, expect, it } from "vitest";
import {
  forgeAccountRefSchema,
  forgeMergePrAtHeadPayloadSchema,
  ghMergePrPayloadSchema,
  prDataSchema,
} from "@/shared/contracts";
import { forgeProcedures } from "@/shared/ipc/procedures/forge";
import { githubProcedures } from "@/shared/ipc/procedures/github";
import { REMOTE_PROCEDURE_SPECS } from "@/shared/remote/procedures";

describe("additive review contract compatibility", () => {
  const account = { forge: "gitlab" as const, host: "https://git.example/gitlab", login: "alice" };
  it("still reads a pre-forge persisted/remote GitHub snapshot without metadata", () => {
    const previous = {
      number: 1,
      state: "open",
      title: "Existing PR",
      url: "https://github.com/team/app/pull/1",
      baseBranch: "main",
      isDraft: false,
      updatedAt: "now",
    };
    expect(prDataSchema.parse(previous)).toEqual(previous);
  });
  it("requires a new operation name for identity and head-precondition semantics", () => {
    const input = {
      projectLocation: { kind: "posix", path: "/repo" },
      prNumber: 1,
      method: "squash",
      admin: false,
      forgeAccount: account,
      expectedHeadSha: "a".repeat(40),
    };
    // Previous hosts strip unknown payload keys. The new caller never uses that old name.
    expect(ghMergePrPayloadSchema.parse(input)).not.toHaveProperty("forgeAccount");
    expect(forgeMergePrAtHeadPayloadSchema.parse(input)).toMatchObject({
      forgeAccount: account,
      expectedHeadSha: input.expectedHeadSha,
    });
    expect(Object.hasOwn(githubProcedures, "forgeMergePrAtHead")).toBe(false);
    expect(forgeProcedures.forgeMergePrAtHead.channel).not.toBe(
      githubProcedures.ghMergePrAtHead.channel,
    );
    expect(REMOTE_PROCEDURE_SPECS.forgeMergePrAtHead.scope).toBe("session:operate");
    expect(REMOTE_PROCEDURE_SPECS.forgeGetPrDetails.scope).toBe("session:read");
  });
  it.each([
    "http://git.example",
    "https://user:secret@git.example",
    "https://@git.example",
    "https://git.example?token=secret",
    "https://git.example/#secret",
    "https://git.example?",
    "https://git.example#",
    "https://git.example\\path",
    "https://git.ex\tample",
  ])("rejects credential-bearing or insecure public host reference %s", (host) => {
    expect(forgeAccountRefSchema.safeParse({ ...account, host }).success).toBe(false);
  });
});
