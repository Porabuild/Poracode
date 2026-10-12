import { describe, expect, it } from "vitest";
import {
  DEVIN_NATIVE_PERSONAS_ACTION_ID,
  devinNativePersonasSessionAction,
  projectDevinPersonasView,
} from "./sessionAction";
import type {
  DevinPersonaCatalog,
  DevinPersonaCatalogEntry,
  DevinPersonaScanOutcome,
} from "./catalog";
import type { DevinPersonaDefinition } from "./definitions";

const signal = new AbortController().signal;

const definition = (overrides: Partial<DevinPersonaDefinition> = {}): DevinPersonaDefinition => ({
  id: "reviewer",
  pathId: "reviewer",
  origin: "project",
  filePath: "/project/.devin/agents/reviewer.md",
  frontmatter: {
    name: "reviewer",
    description: "Reviews changes",
    model: "swe-2-max",
    allowedTools: [],
    maxNesting: 0,
    unknown: {},
  },
  body: "",
  rawFrontmatter: "",
  ...overrides,
});

const catalog = (
  entries: DevinPersonaCatalog["entries"] = [],
  crossRootIssues: DevinPersonaCatalog["crossRootIssues"] = [],
  truncated = false,
): DevinPersonaCatalog => ({
  entries,
  crossRootIssues,
  truncated,
});

const entry = (overrides: Partial<DevinPersonaCatalogEntry> = {}): DevinPersonaCatalogEntry => ({
  definition: definition(),
  root: { origin: "project", scope: "project", path: "/project/.devin/agents", precedence: 1 },
  scope: "project",
  confirmed: false,
  validation: [],
  ...overrides,
});

describe("devinNativePersonasSessionAction", () => {
  it("declares the root-agreed neutral id", () => {
    const action = devinNativePersonasSessionAction(async () => ({
      status: "ok",
      catalog: catalog(),
    }));
    expect(action.id).toBe(DEVIN_NATIVE_PERSONAS_ACTION_ID);
    expect(action.id).toBe("native-personas.list");
  });

  it("projects the agreed view shape with confirmed always false", async () => {
    const action = devinNativePersonasSessionAction(async () => ({
      status: "ok",
      catalog: catalog([
        entry({
          root: {
            origin: "global",
            scope: "global",
            path: "/cfg/devin/agents",
            precedence: 10,
            readOnly: true,
          },
          scope: "global",
          validation: [
            { code: "missing-description", severity: "warning", message: "no description" },
          ],
        }),
      ]),
    }));
    const result = await action.invoke!({}, { threadId: "t", sessionId: "s", signal });
    expect(result).toEqual({
      entries: [
        {
          name: "reviewer",
          description: "Reviews changes",
          model: "swe-2-max",
          origin: "global",
          scope: "global",
          path: "/project/.devin/agents/reviewer.md",
          readOnly: true,
          confirmed: false,
          issues: [{ severity: "warning", message: "no description" }],
        },
      ],
      crossRootIssues: [],
      truncated: false,
    });
  });

  it("fails with the typed reason instead of an empty catalog on unsupported environments", async () => {
    const action = devinNativePersonasSessionAction(async (): Promise<DevinPersonaScanOutcome> => ({
      status: "unsupported-environment",
      reason: "WSL persona roots are Linux paths inside the distro.",
    }));
    await expect(
      action.invoke!({}, { threadId: "t", sessionId: "s", signal }),
    ).rejects.toThrowError(/WSL persona roots/);
  });

  it("honors cancellation before scanning", async () => {
    const controller = new AbortController();
    controller.abort();
    let scanned = false;
    const action = devinNativePersonasSessionAction(async (options) => {
      options.signal?.throwIfAborted();
      scanned = true;
      return { status: "ok", catalog: catalog() } as DevinPersonaScanOutcome;
    });
    await expect(
      action.invoke!({}, { threadId: "t", sessionId: "s", signal: controller.signal }),
    ).rejects.toThrowError(/abort/i);
    expect(scanned).toBe(false);
  });

  it("marks a bound-exceeding scan as truncated instead of silently cutting it", async () => {
    const many = Array.from({ length: 501 }, (_, index) =>
      entry({ definition: definition({ id: `p${index}`, pathId: `p${index}` }) }),
    );
    const view = projectDevinPersonasView(catalog(many));
    expect(view.truncated).toBe(true);
    expect(view.entries).toHaveLength(500);
  });

  it("projects the scan's own projected-truncation marker", () => {
    // The scan reports PROJECTED truncation long before 500 entries pile up —
    // a stopped-at-the-bound scan with, say, 3 listed entries must still mark
    // the view truncated.
    const view = projectDevinPersonasView(catalog([entry()], [], true));
    expect(view.truncated).toBe(true);
    expect(view.entries).toHaveLength(1);
  });
});

describe("projectDevinPersonasView", () => {
  it("keeps malformed entries visible with their validation issues", () => {
    const view = projectDevinPersonasView(
      catalog([
        entry({
          definition: definition({
            frontmatter: {
              name: undefined,
              description: undefined,
              model: undefined,
              allowedTools: [],
              maxNesting: undefined,
              unknown: {},
            },
          }),
          validation: [
            { code: "missing-description", severity: "warning", message: "no description" },
          ],
        }),
      ]),
    );
    expect(view.entries[0]).toMatchObject({
      name: "reviewer",
      confirmed: false,
      issues: [{ severity: "warning", message: "no description" }],
    });
    expect(view.entries[0]?.description).toBeUndefined();
    expect(view.entries[0]?.model).toBeUndefined();
  });

  it("projects cross-root duplicate findings", () => {
    const view = projectDevinPersonasView(
      catalog(
        [],
        [
          {
            code: "duplicate-name",
            severity: "warning",
            message: "reviewer shadowed by a later root",
          },
        ],
      ),
    );
    expect(view.crossRootIssues).toEqual([
      { severity: "warning", message: "reviewer shadowed by a later root" },
    ]);
  });
});
