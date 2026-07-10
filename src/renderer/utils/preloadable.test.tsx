import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { preloadable } from "./preloadable";

describe("preloadable", () => {
  it("deduplicates preloads and renders the resolved component without a fallback", async () => {
    function Loaded(props: { label: string }) {
      return <div>{props.label}</div>;
    }

    const load = vi.fn<() => Promise<typeof Loaded>>(async () => Loaded);
    const Preloadable = preloadable(load);

    await Promise.all([Preloadable.preload(), Preloadable.preload()]);
    render(
      <Suspense fallback={<div>loading</div>}>
        <Preloadable label="ready" />
      </Suspense>,
    );

    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
  });
});
