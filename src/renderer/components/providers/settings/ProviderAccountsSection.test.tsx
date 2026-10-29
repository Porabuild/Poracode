import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ProviderAccountsSection } from "./ProviderAccountsSection";

function renderSection(overrides: {
  providers?: { id?: string; label: string }[];
  addOptions?: readonly { id: string; label: string }[];
}) {
  const onAdd = vi.fn<(optionId?: string) => void>();
  const onSignOut = vi.fn<() => void>();
  render(
    <ProviderAccountsSection
      agentKind="fx"
      description="Fixture description"
      providers={overrides.providers ?? []}
      pendingKey={undefined}
      {...(overrides.addOptions ? { addOptions: overrides.addOptions } : {})}
      onAdd={onAdd}
      onSignOut={onSignOut}
    />,
  );
  return { onAdd, onSignOut };
}

function addTrigger(): HTMLElement {
  const [trigger] = screen.getAllByRole("button", { name: /Add provider/ });
  if (!trigger) throw new Error("Missing Add provider trigger");
  return trigger;
}

describe("ProviderAccountsSection add menu", () => {
  it("opens a menu of add options and passes the chosen id", async () => {
    const { onAdd } = renderSection({
      addOptions: [
        { id: "vercel", label: "Vercel AI Gateway" },
        { id: "grok", label: "Grok" },
      ],
    });

    fireEvent.click(addTrigger());
    expect(await screen.findByRole("menuitem", { name: "Vercel AI Gateway" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Grok" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Grok" }));
    expect(onAdd).toHaveBeenCalledWith("grok");
  });

  it("keeps the single-action Add button when no options are declared", () => {
    const { onAdd } = renderSection({});

    fireEvent.click(addTrigger());
    expect(onAdd).toHaveBeenCalledWith();
  });

  it("disables Add when every option is already connected", () => {
    renderSection({ addOptions: [] });
    expect(
      screen
        .getAllByRole("button", { name: /Add provider/ })
        .some((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
  });
});
