import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { AlertDialog, Modal } from "@heroui/react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  auditDialogHeaders,
  headerMarker,
  type HeaderFamily,
} from "./dialogHeaderIconContract.testFixtures";

function DialogFixture({
  family,
  marker,
  children,
}: {
  family: HeaderFamily;
  marker?: HeaderFamily;
  children: ReactNode;
}) {
  const Dialog = family === "Modal" ? Modal : AlertDialog;
  const attributes = marker ? { [headerMarker[marker]]: "" } : {};
  return (
    <Dialog.Backdrop isOpen>
      <Dialog.Container>
        <Dialog.Dialog aria-label="Contract fixture">
          <Dialog.Header {...attributes} data-testid="header">
            {children}
          </Dialog.Header>
        </Dialog.Dialog>
      </Dialog.Container>
    </Dialog.Backdrop>
  );
}

function placementChildren(header: HTMLElement, family: HeaderFamily, marked: boolean) {
  const prefix = family === "Modal" ? "modal" : "alert-dialog";
  const predicate = marked ? `[${headerMarker[family]}]` : `:has(> .${prefix}__icon)`;
  return [...header.querySelectorAll(`.${prefix}__header${predicate} > :not(.${prefix}__icon)`)];
}

describe.each(["Modal", "AlertDialog"] as const)("%s direct Icon DOM contract", (family) => {
  const Icon = family === "Modal" ? Modal.Icon : AlertDialog.Icon;
  const prefix = family === "Modal" ? "modal" : "alert-dialog";

  it.each(["before", "after", "fragment", "hidden", "null-content"] as const)(
    "forwards the presence marker and preserves the %s witness",
    (mode) => {
      const icon = (
        <Icon hidden={mode === "hidden"}>{mode === "null-content" ? null : "Icon"}</Icon>
      );
      const sibling = <div data-testid="heading">Heading</div>;
      const content =
        mode === "after" ? (
          <>
            {sibling}
            {icon}
          </>
        ) : mode === "fragment" ? (
          <>
            <>{icon}</>
            {sibling}
          </>
        ) : (
          <>
            {icon}
            {sibling}
          </>
        );
      const view = render(
        <DialogFixture family={family} marker={family}>
          {content}
        </DialogFixture>,
      );
      const header = view.getByTestId("header");
      const iconElement = header.querySelector(`:scope > .${prefix}__icon`);
      expect(header.tagName).toBe("DIV");
      expect(header).toHaveAttribute(headerMarker[family], "");
      expect(iconElement).not.toBeNull();
      expect(iconElement?.hasAttribute("hidden")).toBe(mode === "hidden");
      expect(placementChildren(header, family, false)).toEqual([view.getByTestId("heading")]);
      expect(placementChildren(header, family, true)).toEqual(
        placementChildren(header, family, false),
      );
    },
  );

  it.each(["none", "nested"] as const)("keeps a %s Icon outside the witness", (mode) => {
    const view = render(
      <DialogFixture family={family}>
        <div>{mode === "nested" ? <Icon>Nested</Icon> : "Heading"}</div>
      </DialogFixture>,
    );
    const header = view.getByTestId("header");
    expect(header).not.toHaveAttribute(headerMarker[family]);
    expect(header.querySelector(`:scope > .${prefix}__icon`)).toBeNull();
    expect(placementChildren(header, family, false)).toEqual([]);
    expect(placementChildren(header, family, true)).toEqual([]);
  });

  it("keeps the other family's class and marker separate", () => {
    const other = family === "Modal" ? "AlertDialog" : "Modal";
    const foreignClass = family === "Modal" ? "alert-dialog__icon" : "modal__icon";
    const view = render(
      <DialogFixture family={family}>
        <div className={foreignClass}>Other family</div>
        <div>Heading</div>
      </DialogFixture>,
    );
    const header = view.getByTestId("header");
    expect(placementChildren(header, family, false)).toEqual([]);
    expect(placementChildren(header, family, true)).toEqual([]);
    view.rerender(
      <DialogFixture family={family} marker={other}>
        <Icon>Own family</Icon>
        <div>Heading</div>
      </DialogFixture>,
    );
    expect(header).toHaveAttribute(headerMarker[other], "");
    expect(header).not.toHaveAttribute(headerMarker[family]);
    expect(placementChildren(header, family, false)).toHaveLength(1);
    expect(placementChildren(header, family, true)).toEqual([]);
  });
});

describe("dialog Header producer admission", () => {
  it("checks every production Header's direct DOM contract", () => {
    const root = resolve(import.meta.dirname, "../..");
    function sources(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) return sources(path);
        return /\.(?:ts|tsx)$/.test(entry.name) &&
          !/\.(?:test|spec|fixtures?|testFixtures)\./.test(entry.name)
          ? [path]
          : [];
      });
    }
    const sites = [];
    const issues: string[] = [];
    for (const path of sources(root)) {
      const source = readFileSync(path, "utf8");
      if (!source.includes("@heroui/react")) continue;
      const audit = auditDialogHeaders(source);
      sites.push(...audit.sites.map((site) => ({ path, ...site })));
      issues.push(...audit.issues.map((issue) => `${path}:${issue}`));
    }
    expect(issues).toEqual([]);
    expect(sites).toHaveLength(34);
    expect(sites.filter((site) => site.family === "Modal")).toHaveLength(29);
    expect(sites.filter((site) => site.family === "AlertDialog")).toHaveLength(5);
    expect(sites.filter((site) => site.marked)).toHaveLength(6);
    expect(sites.filter((site) => !site.marked)).toHaveLength(28);
  });

  it.each([
    '<M.Header data-direct-modal-icon=""><M.Icon hidden>{null}</M.Icon><div>Title</div></M.Header>',
    '<M.Header data-direct-modal-icon=""><div>Title</div><><M.Icon /></></M.Header>',
    "<M.Header><div><M.Icon /></div></M.Header>",
    "<M.Header><A.Icon /><div>Title</div></M.Header>",
    '<A.Header data-direct-alert-icon=""><A.Icon /><A.Heading>Title</A.Heading></A.Header>',
  ])("admits literal directness independent of Icon content: %s", (jsx) => {
    const audit = auditDialogHeaders(
      `import { Modal as M, AlertDialog as A } from "@heroui/react"; const element = ${jsx};`,
    );
    expect(audit.issues).toEqual([]);
    expect(audit.sites).toHaveLength(1);
  });

  it.each([
    ["missing flag", "<M.Header><M.Icon /></M.Header>"],
    ["nested-only flag", '<M.Header data-direct-modal-icon=""><div><M.Icon /></div></M.Header>'],
    ["foreign flag", '<M.Header data-direct-alert-icon=""><M.Icon /></M.Header>'],
    ["false presence", '<M.Header data-direct-modal-icon="false"><M.Icon /></M.Header>'],
    ["conditional Icon", '<M.Header data-direct-modal-icon="">{show && <M.Icon />}</M.Header>'],
    ["unknown direct producer", "<M.Header><CustomIcon /></M.Header>"],
    ["raw class witness", '<M.Header><div className="modal__icon" /></M.Header>'],
    ["dynamic class witness", "<M.Header><div className={iconClass} /></M.Header>"],
    ["Header spread", '<M.Header {...props} data-direct-modal-icon=""><M.Icon /></M.Header>'],
    [
      "Icon render override",
      '<M.Header data-direct-modal-icon=""><M.Icon render={<div />} /></M.Header>',
    ],
    ["marker on another element", '<div data-direct-modal-icon=""><M.Icon /></div>'],
    ["component alias", "<M.Header><Icon /></M.Header>; const Icon = M.Icon"],
  ])("requires review for %s", (_case, jsx) => {
    const audit = auditDialogHeaders(
      `import { Modal as M } from "@heroui/react"; const element = ${jsx};`,
    );
    expect(audit.issues.length).toBeGreaterThan(0);
  });

  it("requires review for namespace component access", () => {
    expect(
      auditDialogHeaders('import * as H from "@heroui/react"; const element = <H.Modal.Header />;')
        .issues,
    ).toContain("1: audit namespace/default HeroUI access");
  });
});

it("keeps the real ConfirmDialog marker with its Icon across status updates", () => {
  const props = {
    isOpen: true,
    title: "Confirm",
    body: "Body",
    confirmLabel: "Proceed",
    onConfirm: vi.fn<() => void>(),
    onClose: vi.fn<() => void>(),
  };
  const view = renderWithI18n(<ConfirmDialog {...props} status="danger" />);
  const header = view.getByRole("alertdialog").querySelector<HTMLElement>(".alert-dialog__header")!;
  expect(header).toHaveAttribute("data-direct-alert-icon", "");
  expect(header.querySelector(":scope > .alert-dialog__icon")).not.toBeNull();
  expect(placementChildren(header, "AlertDialog", true)).toEqual(
    placementChildren(header, "AlertDialog", false),
  );
  view.rerender(<ConfirmDialog {...props} status="warning" />);
  expect(header).toHaveAttribute("data-direct-alert-icon", "");
  expect(header.querySelector(":scope > .alert-dialog__icon")).not.toBeNull();
  expect(placementChildren(header, "AlertDialog", true)).toEqual(
    placementChildren(header, "AlertDialog", false),
  );
});
