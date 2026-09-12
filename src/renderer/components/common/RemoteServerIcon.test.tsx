import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { RemoteServerIcon } from "./RemoteServerIcon";

describe("RemoteServerIcon", () => {
  it("anchors the status light inside the shared machine glyph", () => {
    render(<RemoteServerIcon status="online" />);

    const light = screen.getByTitle("Online");
    expect(light).toHaveClass("right-0", "bottom-0", "ring-1", "ring-background", "bg-success");
    expect(light.parentElement).toHaveClass("relative", "size-4", "shrink-0");
    expect(light.parentElement?.querySelector("svg")).toHaveClass("size-full");
  });

  it("can identify an unpaired remote machine without showing a connection light", () => {
    const { container } = render(<RemoteServerIcon status={null} />);

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByTitle("Offline")).not.toBeInTheDocument();
  });
});
