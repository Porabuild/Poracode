// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/renderer/i18n/i18n";

const calls = vi.hoisted(
  () => [] as Array<{ canonical: string; presentation: string | undefined }>,
);

vi.mock("./utilityPreset", async () => {
  const actual = await vi.importActual<typeof import("./utilityPreset")>("./utilityPreset");
  return {
    ...actual,
    createUtilityPresetSetter: (input: Parameters<typeof actual.createUtilityPresetSetter>[0]) => {
      calls.push({ canonical: input.keys.canonical, presentation: input.presentation });
      return actual.createUtilityPresetSetter(input);
    },
  };
});

import { AISettings } from "./AISettings";

describe("AISettings one-shot presentation", () => {
  afterEach(() => {
    cleanup();
    calls.length = 0;
  });

  it("declares title and commit one-shot presentation instead of leaving it unset", () => {
    render(createElement(I18nProvider, { i18n }, createElement(AISettings)));

    const declared = (canonical: string) =>
      calls.filter((call) => call.canonical === canonical).map((call) => call.presentation);
    expect(declared("titleGenSelection")).toEqual(["terminal"]);
    expect(declared("commitGenSelection")).toEqual(["terminal"]);
  });
});
