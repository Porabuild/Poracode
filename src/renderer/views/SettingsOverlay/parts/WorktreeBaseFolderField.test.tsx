import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const runtime = vi.hoisted(() => ({ browser: false }));
vi.mock("@/renderer/clientRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/clientRuntime")>()),
  isBrowserClientRuntime: () => runtime.browser,
}));

import { WorktreeBaseFolderField } from "./WorktreeBaseFolderField";

function renderField(props: { remoteDesktopId?: string } = {}) {
  render(<WorktreeBaseFolderField isWsl={false} value="" onChange={() => undefined} {...props} />);
  return screen.getByRole("button", { name: "Choose worktree base folder" });
}

describe("WorktreeBaseFolderField", () => {
  afterEach(() => {
    runtime.browser = false;
  });

  it("uses the OS folder picker in the desktop app", () => {
    expect(renderField()).toBeEnabled();
  });

  it("offers only a host's folders in a browser, which has no OS picker", () => {
    runtime.browser = true;
    expect(renderField()).toBeDisabled();
  });

  it("browses the host's folders in a browser when the folder belongs to a host", () => {
    runtime.browser = true;
    expect(renderField({ remoteDesktopId: "pc" })).toBeEnabled();
  });
});
