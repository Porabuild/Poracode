import { z } from "zod";
import {
  forgeAccountRefSchema,
  forgeListPullRequestsInStatePayloadSchema,
} from "@/shared/contracts";
import { defineAppControlTool } from "../defineTools";
import { githubTools, syncPullRequest } from "./github";
import {
  projectIdProp,
  requireAppRuntime,
  requireProject,
  type AppControlsToolContext,
  type ToolDomain,
} from "./types";

const accountProperty = {
  type: "object",
  additionalProperties: false,
  required: ["forge", "host", "login"],
  properties: {
    forge: { type: "string", enum: forgeAccountRefSchema.shape.forge.options },
    host: {
      type: "string",
      description: "Exact HTTPS deployment URL, including subpath or Azure organization.",
    },
    login: {
      type: "string",
      minLength: 1,
      description: "Public account identity returned by review_repository; never a token.",
    },
  },
};
const scopeSchema = z.object({
  projectId: z.string().min(1),
  forgeAccount: forgeAccountRefSchema.optional(),
  forgeRepository: z.string().min(1).optional(),
});
const repositoryProperty = {
  type: "string",
  minLength: 1,
  description:
    "Full repository namespace from review_repository. Pins writes to this repository if the project's remote or CLI default changes.",
};
const prSchema = scopeSchema.extend({ prNumber: z.number().int().positive() });
const aliases = {
  review_get_pr: "gh_get_pr",
  review_create_pr: "gh_create_pr",
  review_comment: "gh_pr_comment",
  review_merge_pr: "gh_merge_pr",
  review_update_pr: "gh_update_pr",
} as const;

/** Reuse the existing mutation/readback flow with an explicitly scoped RPC client. */
export function scopedReviewContext(
  ctx: AppControlsToolContext,
  raw: unknown,
): AppControlsToolContext {
  const { forgeAccount, forgeRepository } = scopeSchema.parse(raw);
  const account = {
    ...(forgeAccount ? { forgeAccount } : {}),
    ...(forgeRepository ? { forgeRepository } : {}),
  };
  const client = ctx.supervisor;
  return {
    ...ctx,
    supervisor: {
      ...client,
      ghCheckAvailable: async (payload) => ({
        available:
          (await client.forgeGetRepository({ ...payload, ...account })).repository !== null,
      }),
      ghListPullRequests: (payload) => client.forgeListPullRequests({ ...payload, ...account }),
      ghGetPrDetails: (payload) => client.forgeGetPrDetails({ ...payload, ...account }),
      ghGetPrChecks: (payload) => client.forgeGetPrChecks({ ...payload, ...account }),
      ghGetPrFiles: (payload) => client.forgeGetPrFiles({ ...payload, ...account }),
      ghGetPrDiff: (payload) => client.forgeGetPrDiff({ ...payload, ...account }),
      ghCreatePr: (payload) => client.forgeCreatePr({ ...payload, ...account }),
      ghPostPrComment: (payload) => client.forgePostPrComment({ ...payload, ...account }),
      ghMergePr: (payload) => client.forgeMergePr({ ...payload, ...account }),
      ghMergePrAtHead: (payload) => client.forgeMergePrAtHead({ ...payload, ...account }),
      ghClosePr: (payload) => client.forgeClosePr({ ...payload, ...account }),
      ghReopenPr: (payload) => client.forgeReopenPr({ ...payload, ...account }),
      ghMarkPrReady: (payload) => client.forgeMarkPrReady({ ...payload, ...account }),
      ghUpdatePrBranch: (payload) => client.forgeUpdatePrBranch({ ...payload, ...account }),
    },
  };
}

const submitSchema = prSchema.extend({
  decision: z.enum(["approve", "request-changes", "comment"]),
  body: z.string(),
});
const editSchema = prSchema
  .extend({
    title: z.string().min(1).optional(),
    body: z.string().optional(),
    baseBranch: z.string().min(1).optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined || input.body !== undefined || input.baseBranch !== undefined,
  );
const properties = {
  projectId: projectIdProp,
  forgeAccount: accountProperty,
  forgeRepository: repositoryProperty,
  prNumber: { type: "integer", minimum: 1 },
};

const listReviewTool = defineAppControlTool({
  name: "review_list_prs",
  description:
    "List a project’s reviews by state. The default open list also refreshes Poracode’s open review list. Set state to closed, merged, or all where supported. Use the public account and repository from review_repository to select a source explicitly.",
  input: scopeSchema
    .extend({
      state: z
        .enum(["open", ...forgeListPullRequestsInStatePayloadSchema.shape.state.options])
        .default("open"),
    })
    .strict(),
  run: async ({ state, ...scope }, ctx) => {
    if (state === "open")
      return githubTools.handlers.gh_list_prs!(scope, scopedReviewContext(ctx, scope));
    const { projectId, forgeAccount, forgeRepository } = scope;
    const result = await requireAppRuntime(ctx).call("forgeListPullRequestsInState", {
      projectLocation: requireProject(ctx, projectId).location,
      state,
      ...(forgeAccount === undefined ? {} : { forgeAccount }),
      ...(forgeRepository === undefined ? {} : { forgeRepository }),
    });
    return { projectId, state, count: result.pullRequests.length, ...result };
  },
});

export const reviewTools: ToolDomain = {
  specs: [
    listReviewTool.spec,
    ...Object.entries(aliases).map(([name, legacy]) => {
      const spec = githubTools.specs.find((s) => s.name === legacy)!;
      return {
        ...spec,
        name,
        description:
          spec.description
            .replaceAll("GitHub", "source-host")
            .replaceAll("via the `gh` CLI", "using the host integration") +
          " Supports GitHub, GitLab, Forgejo/Gitea, Bitbucket Cloud, Azure DevOps and GitCafe according to review_repository capabilities. An explicit forgeAccount never falls back to another account. Unsupported operations fail without bypassing host policies.",
        inputSchema: {
          ...spec.inputSchema,
          properties: {
            ...(spec.inputSchema.properties as Record<string, unknown>),
            forgeAccount: accountProperty,
            forgeRepository: repositoryProperty,
          },
        },
      };
    }),
    {
      name: "review_repository",
      description:
        "Discover the project's source host, full repository identity, current public account and supported review operations. Credentials stay in the supervisor. Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: projectIdProp,
          forgeAccount: accountProperty,
          forgeRepository: repositoryProperty,
        },
      },
    },
    {
      name: "review_threads",
      description: "Read review conversations, resolution state and file locations. Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "prNumber"],
        properties,
      },
    },
    {
      name: "review_submit",
      description:
        "Submit an approval, a change request or a review comment where supported. Publishes feedback; the user's request must authorize it. Review bodies are required except for approvals.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "prNumber", "decision", "body"],
        properties: {
          ...properties,
          decision: { type: "string", enum: ["approve", "request-changes", "comment"] },
          body: { type: "string" },
        },
      },
    },
    {
      name: "review_edit",
      description:
        "Update a PR/MR title, body or target branch where supported. Publishes the change; the user's request must authorize it. Supply at least one field.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "prNumber"],
        properties: {
          ...properties,
          title: { type: "string", minLength: 1 },
          body: { type: "string" },
          baseBranch: { type: "string", minLength: 1 },
        },
      },
    },
  ],
  handlers: {
    [listReviewTool.spec.name]: listReviewTool.handler,
    ...Object.fromEntries(
      Object.entries(aliases).map(([name, legacy]) => [
        name,
        async (args: Record<string, unknown>, ctx: AppControlsToolContext) =>
          githubTools.handlers[legacy]!(args, scopedReviewContext(ctx, args)),
      ]),
    ),
    review_repository: async (args, ctx) => {
      const { projectId, ...account } = scopeSchema.parse(args);
      return ctx.supervisor.forgeGetRepository({
        projectLocation: requireProject(ctx, projectId).location,
        ...account,
      });
    },
    review_threads: async (args, ctx) => {
      const { projectId, ...input } = prSchema.parse(args);
      return ctx.supervisor.forgeGetPrReviewComments({
        projectLocation: requireProject(ctx, projectId).location,
        ...input,
      });
    },
    review_submit: async (args, ctx) => {
      const { projectId, ...input } = submitSchema.parse(args);
      await ctx.supervisor.forgeSubmitPrReview({
        projectLocation: requireProject(ctx, projectId).location,
        ...input,
      });
      return {
        submitted: true,
        ...(await syncPullRequest(scopedReviewContext(ctx, args), projectId, input.prNumber)),
      };
    },
    review_edit: async (args, ctx) => {
      const { projectId, ...input } = editSchema.parse(args);
      await ctx.supervisor.forgeEditPr({
        projectLocation: requireProject(ctx, projectId).location,
        ...input,
      });
      return {
        updated: true,
        ...(await syncPullRequest(scopedReviewContext(ctx, args), projectId, input.prNumber)),
      };
    },
  },
};
