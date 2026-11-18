import { Card, Input, Surface, TextArea } from "@heroui/react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "@/renderer/tailwind.css";
import { ContentSurface } from "./ContentSurface";

afterEach(cleanup);

it.each(["light", "dark"])("shares the flat material across content roots in %s mode", (theme) => {
  const html = document.documentElement;
  const previousTheme = html.getAttribute("data-theme");
  html.setAttribute("data-theme", theme);
  try {
    const { getByText, getByLabelText } = render(
      <>
        <ContentSurface>Panel</ContentSurface>
        <ContentSurface variant="row">Row</ContentSurface>
        <ContentSurface variant="group" aria-label="Row group">
          <div>First</div>
          <div>Last</div>
        </ContentSurface>
        <Card>Catalog</Card>
        <Surface variant="secondary" className="content-surface">
          Group
        </Surface>
        <Input aria-label="Text field" />
        <TextArea aria-label="Secondary field" variant="secondary" />
        <div style={{ backgroundColor: "var(--field-background)" }}>Editable fill</div>
        <div style={{ border: "1px solid var(--hairline-soft)" }}>Theme edge</div>
      </>,
    );
    const style = (name: string) => getComputedStyle(getByText(name));
    for (const name of ["Panel", "Catalog", "Group", "Row"]) {
      expect(style(name).borderRadius).toBe("8px");
      expect(style(name).borderTopWidth).toBe("1px");
      expect(style(name).borderTopColor).toBe(style("Theme edge").borderTopColor);
      expect(style(name).boxShadow).toBe("none");
    }
    expect(getComputedStyle(getByLabelText("Row group")).borderRadius).toBe("8px");
    expect(style("First").borderBottomWidth).toBe("1px");
    expect(style("First").borderBottomColor).toBe(style("Theme edge").borderTopColor);
    expect(style("Last").borderBottomWidth).toBe("0px");
    expect(style("Group").backgroundColor).toBe(style("Panel").backgroundColor);
    expect(style("Catalog").backgroundColor).toBe(style("Panel").backgroundColor);
    expect(style("Row").backgroundColor).toBe(style("Panel").backgroundColor);
    const editable = style("Editable fill").backgroundColor;
    expect(editable).not.toBe(style("Panel").backgroundColor);
    for (const name of ["Text field", "Secondary field"]) {
      expect(getComputedStyle(getByLabelText(name)).backgroundColor).toBe(editable);
    }
  } finally {
    if (previousTheme === null) html.removeAttribute("data-theme");
    else html.setAttribute("data-theme", previousTheme);
  }
});
