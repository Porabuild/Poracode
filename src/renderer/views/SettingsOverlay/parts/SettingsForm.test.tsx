import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsPage } from "./SettingsForm";

describe("SettingsPage", () => {
  it("does not create its own scroll container", () => {
    const { container } = render(
      <SettingsPage title="General">
        <div>Body</div>
      </SettingsPage>,
    );

    const scrollers = container.querySelectorAll("[data-settings-scroll-area]");

    expect(scrollers).toHaveLength(0);
  });
});
