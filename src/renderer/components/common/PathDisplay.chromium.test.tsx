import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "@/renderer/tailwind.css";
import { PathDisplay } from "./PathDisplay";

afterEach(cleanup);

it("uses CSS head truncation when font variants cannot be represented by the canvas shorthand", async () => {
  const path = "long/directory/with/12345678/file";
  const view = render(
    <div style={{ width: 110, font: "16px monospace", fontVariantNumeric: "tabular-nums" }}>
      <PathDisplay path={path} dirClassName="directory" />
    </div>,
  );
  const row = view.getByTitle(path);
  expect(getComputedStyle(row).font).toBe("");
  await waitFor(() => {
    const directory = row.querySelector<HTMLElement>(".directory")!;
    expect(getComputedStyle(directory).textOverflow).toBe("ellipsis");
    expect(getComputedStyle(directory).direction).toBe("rtl");
    expect(directory.scrollWidth).toBeGreaterThan(directory.clientWidth);
  });
  expect(view.getByText("file")).toBeVisible();
});

it("fits directory suffixes to the actual font without splitting a joined emoji", async () => {
  const view = render(
    <div style={{ font: "16px monospace" }}>
      <span data-testid="sample">file</span>
      <div data-testid="row" style={{ width: 600 }}>
        <PathDisplay path="long/directory/👩‍💻z/file" dirClassName="directory" />
      </div>
    </div>,
  );
  const sample = view.getByTestId("sample");
  const row = view.getByTestId("row");
  const basenameWidth = sample.getBoundingClientRect().width;
  function allocate(suffix: string) {
    sample.textContent = suffix;
    row.style.width = `${Math.ceil(basenameWidth + 4 + sample.getBoundingClientRect().width)}px`;
  }

  await waitFor(() =>
    expect(row.querySelector(".directory")?.textContent).toBe("long/directory/👩‍💻z"),
  );
  allocate("…👩‍💻z");
  await waitFor(() => expect(row.querySelector(".directory")?.textContent).toBe("…👩‍💻z"));
  allocate("…z");
  await waitFor(() => expect(row.textContent).toBe("file"));
  row.style.width = "600px";
  await waitFor(() =>
    expect(row.querySelector(".directory")?.textContent).toBe("long/directory/👩‍💻z"),
  );
});
