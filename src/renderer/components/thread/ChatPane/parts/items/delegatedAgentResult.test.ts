import { afterEach, expect, it } from "vitest";
import { dynamicActivate, i18n } from "@/renderer/i18n/i18n";
import { msg } from "@/shared/messages";
import { delegatedAgentResultText } from "./delegatedAgentResult";

const source = msg("runtime.delegatedAgentInterrupted");
const translate = i18n._.bind(i18n);

afterEach(async () => dynamicActivate("en"));

it.each([source, { error: source }])(
  "localizes saved interruption %j in the active client locale",
  async (result) => {
    const payload = { name: "Agent", status: "error" as const, result };
    await dynamicActivate("ru");
    const translated = msg("runtime.delegatedAgentInterrupted");
    expect(translated).not.toBe(source);
    expect(delegatedAgentResultText(payload, translate)).toBe(translated);
    await dynamicActivate("en");
    expect(delegatedAgentResultText(payload, translate)).toBe(source);
    expect(payload.result).toBe(result);
  },
);

it("keeps partial output and provider errors intact", async () => {
  await dynamicActivate("ru");
  const result = { error: source, output: "Partial work" };
  expect(delegatedAgentResultText({ name: "Agent", status: "error", result }, translate)).toContain(
    "Partial work",
  );
  expect(delegatedAgentResultText({ name: "Agent", status: "error", result }, translate)).toContain(
    source,
  );
  expect(
    delegatedAgentResultText(
      {
        name: "Agent",
        status: "error",
        result: "Provider-specific failure",
      },
      translate,
    ),
  ).toBe("Provider-specific failure");
  expect(
    delegatedAgentResultText({ name: "Agent", status: "success", result: source }, translate),
  ).toBe(source);
});
