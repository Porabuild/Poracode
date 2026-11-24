import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "@/renderer/tailwind.css";
import type { AgentCapability } from "@/shared/contracts";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import type { CrewRosterModel } from "./crewComposerModel";
import type { CrewHelperOptions } from "./crewHelperOptions";
import type { CrewMemberSelection, CrewRole, SavedCrew } from "@/shared/crew";
import { CrewMemberRow } from "./CrewMemberRow";

/** The width the crew editor gives a member row on a 390px phone. */
const ROW_WIDTH = 324;
const LONG_MODEL = "a-model-name-long-enough-to-truncate-on-a-phone-line-0001";
const PLAIN_MODEL = "plain-0002";

const agent = {
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  presentationModes: ["gui"],
  mcpScope: { gui: "launch", terminal: "none" },
  settingDefs: [],
} satisfies Partial<AgentCapability>;

const reasoned: AgentCapability = {
  ...agent,
  models: [{ id: LONG_MODEL, label: "Long model" }],
  efforts: ["low", "high"],
  modelEfforts: { [LONG_MODEL]: ["low", "high"] },
  fastModels: [LONG_MODEL],
};
/** No reasoning levels: a member on it shows no reasoning label. */
const plain: AgentCapability = {
  ...agent,
  models: [{ id: PLAIN_MODEL, label: "Plain model" }],
  efforts: [],
  modelEfforts: {},
  fastModels: [],
};
const selection: CrewMemberSelection = {
  agentKind: "codex",
  model: LONG_MODEL,
  effort: "high",
  fast: false,
};
const role: CrewRole = {
  id: "builder",
  label: "Builder",
  brief: "Implements changes and runs tests",
  selection: { ...selection, effort: "low" },
};
const scout: CrewRole = {
  id: "scout",
  label: "Scout",
  brief: "Explores code and docs",
  selection: { agentKind: "pi", model: PLAIN_MODEL, fast: false },
};
const savedCrew: SavedCrew = {
  id: "crew-compact",
  name: "Compact crew",
  lead: selection,
  roles: [role, scout],
  policy: "crew-only",
  updatedAt: 1,
};
const helperOptions: CrewHelperOptions = {
  providers: [
    { kind: "codex", label: "Codex", capabilities: reasoned },
    { kind: "pi", label: "Pi", capabilities: plain },
  ],
  ranked: [],
  modelLabelOf: (member) => member.model,
  selectionFor: (agentKind, model) => ({ agentKind, model, effort: "low" }),
  defaultSelectionFor: () => ({ agentKind: "codex", model: LONG_MODEL, effort: "low" }),
};
const model: CrewRosterModel = {
  binding: {
    version: 1,
    crewId: savedCrew.id,
    name: savedCrew.name,
    policy: savedCrew.policy,
    roles: [role, scout],
  },
  lead: selection,
  savedCrew,
  helperOptions,
  roleTemplates: [
    {
      id: "builder",
      label: "Builder",
      brief: "Implements changes and runs tests",
      tone: "builder",
    },
    { id: "scout", label: "Scout", brief: "Explores code and docs", tone: "scout" },
  ],
  leadProviders: helperOptions.providers,
  defaultHelper: { agentKind: "codex", model: LONG_MODEL, effort: "low" },
  summary: "",
  isDraft: true,
  isDisabled: false,
  onBindingChange: () => {},
  onLeadChange: () => {},
  onSaveToCrew: () => {},
  onSaveAsNewCrew: () => {},
};

function noop() {}

function Rows() {
  return (
    <div style={{ width: ROW_WIDTH, padding: "0 6px" }}>
      <CrewMemberRow
        model={model}
        selection={selection}
        isLead
        isEdited={false}
        isEditing={false}
        onEditToggle={noop}
        onSelectionChange={noop}
        onRoleChange={noop}
        onRemoveRole={noop}
      />
      <CrewMemberRow
        model={model}
        role={role}
        selection={role.selection}
        isLead={false}
        isEdited={false}
        isEditing={false}
        onEditToggle={noop}
        onSelectionChange={noop}
        onRoleChange={noop}
        onRemoveRole={noop}
      />
      <CrewMemberRow
        model={model}
        role={scout}
        selection={scout.selection}
        isLead={false}
        isEdited={false}
        isEditing={false}
        onEditToggle={noop}
        onSelectionChange={noop}
        onRoleChange={noop}
        onRemoveRole={noop}
      />
    </div>
  );
}

afterEach(cleanup);

async function useViewport(width: number, height: number) {
  const { page } = (await import("vitest/browser")) as unknown as {
    page: { viewport: (width: number, height: number) => Promise<void> };
  };
  await page.viewport(width, height);
}

function box(element: Element) {
  const { top, bottom, left, right, width, height } = element.getBoundingClientRect();
  return { top, bottom, left, right, width, height, centerY: top + height / 2 };
}

function near(a: number, b: number) {
  return Math.abs(a - b) <= 1;
}

/** One member row: its model-name trigger, icon, optional reasoning label, and trailing controls. */
function memberRow(member: string) {
  const name = screen.getByLabelText(`Model for ${member}`);
  // The row grid owns the name's placement wrapper.
  const grid = name.closest('[class*="col-start-3"]')?.parentElement;
  const icon = grid?.querySelector('[class*="col-start-2"]');
  if (!grid || !icon) throw new Error(`no row for ${member}`);
  const trailing = [...grid.querySelectorAll('[class*="col-start-4"]')];
  const reasoning = screen.queryByLabelText(`Reasoning for ${member}`);
  const details = grid.querySelector('[aria-label="Role details"]');
  return {
    name: box(name),
    icon: box(icon),
    reasoning: reasoning ? box(reasoning) : null,
    firstLine: trailing[0] ? box(trailing[0]) : null,
    secondLine: trailing[1] ? box(trailing[1]) : null,
    details: details ? box(details) : null,
  };
}

it("stacks a member with a reasoning label on two touch-sized lines in the compact layout", async () => {
  await useViewport(390, 800);
  renderWithI18n(<Rows />);
  await waitFor(() => expect(document.documentElement).toHaveAttribute("data-compact-layout"));

  const lead = memberRow("Lead");
  const builder = memberRow("Builder");
  if (!builder.reasoning || !builder.firstLine || !builder.secondLine || !builder.details) {
    throw new Error("the builder row lost its reasoning label or a control line");
  }
  // The icon, the model name, and the role pill share the first line.
  for (const row of [lead, builder]) {
    if (!row.firstLine) throw new Error(`no control line for ${row}`);
    expect(row.name.left).toBeGreaterThan(row.icon.right);
    expect(near(row.icon.centerY, row.name.centerY)).toBe(true);
    expect(near(row.name.centerY, row.firstLine.centerY)).toBe(true);
  }
  // The reasoning label and the controls share the second line, under the name.
  expect(builder.reasoning.top).toBeGreaterThanOrEqual(builder.name.bottom - 1);
  expect(builder.reasoning.left).toBe(builder.name.left);
  expect(near(builder.reasoning.centerY, builder.details.centerY)).toBe(true);
  // The role pill ends where the controls end.
  expect(near(builder.firstLine.right, builder.details.right)).toBe(true);
  // Every control keeps the compact 44px touch target.
  expect(lead.name.height).toBeGreaterThanOrEqual(44);
  expect(builder.reasoning.height).toBeGreaterThanOrEqual(44);
  expect(builder.details.height).toBeGreaterThanOrEqual(44);
  // A long name keeps the width the icon controls would otherwise take from it.
  expect(builder.name.width).toBeGreaterThanOrEqual(180);
});

it("keeps a member without a reasoning label on one touch-sized line in the compact layout", async () => {
  await useViewport(390, 800);
  renderWithI18n(<Rows />);
  await waitFor(() => expect(document.documentElement).toHaveAttribute("data-compact-layout"));

  const scoutRow = memberRow("Scout");
  expect(scoutRow.reasoning).toBeNull();
  expect(scoutRow.secondLine).toBeNull();
  if (!scoutRow.firstLine || !scoutRow.details) throw new Error("the scout row lost its controls");
  // The icon, the model name, the role pill, and the controls share the line.
  expect(scoutRow.name.left).toBeGreaterThan(scoutRow.icon.right);
  for (const center of [
    scoutRow.name.centerY,
    scoutRow.firstLine.centerY,
    scoutRow.details.centerY,
  ]) {
    expect(near(scoutRow.icon.centerY, center)).toBe(true);
  }
  expect(scoutRow.name.height).toBeGreaterThanOrEqual(44);
  expect(scoutRow.details.height).toBeGreaterThanOrEqual(44);
  // One 44px line: the controls do not reach below it.
  expect(scoutRow.details.bottom - scoutRow.name.top).toBeLessThanOrEqual(46);
});

it("keeps the two 16px lines of the desktop row", async () => {
  await useViewport(1280, 800);
  renderWithI18n(<Rows />);
  await waitFor(() => expect(document.documentElement).not.toHaveAttribute("data-compact-layout"));

  const builder = memberRow("Builder");
  const scoutRow = memberRow("Scout");
  if (!builder.reasoning || !builder.details || !scoutRow.details) {
    throw new Error("a row lost its reasoning label or its controls");
  }
  expect(builder.name.height).toBeLessThanOrEqual(17);
  expect(builder.reasoning.top).toBeGreaterThanOrEqual(builder.name.bottom - 1);
  expect(builder.reasoning.bottom - builder.name.top).toBeLessThanOrEqual(40);
  expect(builder.reasoning.left).toBe(builder.name.left);
  // The icon and the controls sit on the row's center line, between the two text lines.
  for (const row of [builder, scoutRow]) {
    if (!row.details) throw new Error("a row lost its controls");
    expect(near(row.icon.centerY, row.details.centerY)).toBe(true);
  }
  expect(near(builder.icon.centerY, (builder.name.top + builder.reasoning.bottom) / 2)).toBe(true);
});
