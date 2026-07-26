import { parse } from "yaml";
import type {
  GitHubActionsWorkflowInput,
  GitHubActionsWorkflowInputType,
} from "@/shared/contracts";

const INPUT_TYPES = new Set<GitHubActionsWorkflowInputType>([
  "boolean",
  "choice",
  "environment",
  "number",
  "string",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inputType(value: unknown): GitHubActionsWorkflowInputType {
  return typeof value === "string" && INPUT_TYPES.has(value as GitHubActionsWorkflowInputType)
    ? (value as GitHubActionsWorkflowInputType)
    : "string";
}

function scalar(value: unknown): string | number | boolean | undefined {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : undefined;
}

export function parseGitHubActionsWorkflowYaml(yaml: string): {
  dispatchable: boolean;
  triggers: string[];
  inputs: GitHubActionsWorkflowInput[];
} {
  const root = parse(yaml) as unknown;
  if (!isRecord(root)) return { dispatchable: false, triggers: [], inputs: [] };

  const on = root.on;
  const triggers = Array.isArray(on)
    ? on.filter((trigger): trigger is string => typeof trigger === "string")
    : typeof on === "string"
      ? [on]
      : isRecord(on)
        ? Object.keys(on)
        : [];
  const dispatchable = triggers.includes("workflow_dispatch");
  const workflowDispatch = isRecord(on) ? on.workflow_dispatch : undefined;
  const rawInputs =
    isRecord(workflowDispatch) && isRecord(workflowDispatch.inputs) ? workflowDispatch.inputs : {};
  const inputs: GitHubActionsWorkflowInput[] = [];

  for (const [name, value] of Object.entries(rawInputs)) {
    const config = isRecord(value) ? value : {};
    const defaultValue = scalar(config.default);
    inputs.push({
      name,
      description: typeof config.description === "string" ? config.description : "",
      required: config.required === true,
      type: inputType(config.type),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      options: Array.isArray(config.options)
        ? config.options.flatMap((option) => {
            const optionValue = scalar(option);
            return optionValue === undefined ? [] : [String(optionValue)];
          })
        : [],
    });
  }

  return { dispatchable, triggers, inputs };
}
