import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedFraction, AnimatedNumber } from "./AnimatedNumber";

const mocks = vi.hoisted(() => ({
  numberFlow: vi.fn<(props: Record<string, unknown>) => void>(),
}));

vi.mock("@number-flow/react", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.numberFlow(props);
    return null;
  },
  NumberFlowGroup: () => null,
  useIsSupported: () => true,
}));

describe("AnimatedNumber", () => {
  beforeEach(() => {
    mocks.numberFlow.mockClear();
  });

  it("isolates digit transitions from surrounding layout changes", () => {
    render(<AnimatedNumber value={9} />);

    expect(mocks.numberFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        isolate: true,
        value: 9,
      }),
    );
  });

  it("animates only the changing side of a progress fraction", () => {
    const { container } = render(<AnimatedFraction value={4} total={7} />);

    expect(mocks.numberFlow).toHaveBeenCalledTimes(1);
    expect(mocks.numberFlow).toHaveBeenCalledWith(expect.objectContaining({ value: 4 }));
    expect(container.textContent).toBe("/7");
  });
});
