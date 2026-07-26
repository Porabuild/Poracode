import { useEffect, useState } from "react";
import { Button, Checkbox, Description, Input, Label, Popover, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { LoaderCircle, Play } from "lucide-react";
import type { GitHubActionsWorkflow, GitHubActionsWorkflowDefinition } from "@/shared/contracts";
import { Select } from "@/renderer/components/common";

type InputValues = Record<string, string | boolean>;

function defaultInputValues(definition: GitHubActionsWorkflowDefinition): InputValues {
  return Object.fromEntries(
    definition.inputs.map((input) => {
      const defaultValue = input.defaultValue;
      return [
        input.name,
        typeof defaultValue === "number"
          ? String(defaultValue)
          : (defaultValue ?? (input.type === "boolean" ? false : "")),
      ];
    }),
  );
}

function stringInputValue(values: InputValues, name: string): string {
  const value = values[name];
  return typeof value === "string" ? value : "";
}

export function buildWorkflowDispatchInputs(
  definition: GitHubActionsWorkflowDefinition,
  values: InputValues,
): { inputs: Record<string, string>; missing: string[] } {
  const inputs: Record<string, string> = {};
  const missing: string[] = [];
  for (const input of definition.inputs) {
    const value = values[input.name];
    const serialized = typeof value === "boolean" ? String(value) : (value ?? "").trim();
    if (input.required && serialized === "") missing.push(input.name);
    if (serialized !== "" || input.type === "boolean") inputs[input.name] = serialized;
  }
  return { inputs, missing };
}

export function GitHubActionsDispatchPopover(props: {
  workflow: GitHubActionsWorkflow;
  definition: GitHubActionsWorkflowDefinition;
  refs: readonly { id: string; label: string }[];
  isDefinitionLoading: boolean;
  isPending: boolean;
  onRefChange: (ref: string) => void;
  onRun: (ref: string, inputs: Record<string, string>) => Promise<boolean>;
}) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [ref, setRef] = useState(props.definition.ref);
  const [values, setValues] = useState<InputValues>(() => defaultInputValues(props.definition));
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    setRef(props.definition.ref);
    setValues(defaultInputValues(props.definition));
    setMissing([]);
  }, [props.definition]);

  async function runWorkflow() {
    const result = buildWorkflowDispatchInputs(props.definition, values);
    setMissing(result.missing);
    if (result.missing.length > 0) return;
    if (await props.onRun(ref, result.inputs)) setIsOpen(false);
  }

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <Button variant="primary">
          <Play className="size-4" />
          <Trans>Run workflow</Trans>
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="w-[min(420px,calc(100vw-2rem))] p-0">
        <Popover.Dialog className="overflow-hidden !p-0">
          <div className="border-b border-[var(--hairline)] px-4 py-3">
            <p className="text-sm font-semibold text-foreground">{t`Run ${props.workflow.name}`}</p>
            <p className="mt-1 text-xs text-muted">
              <Trans>Use workflow from</Trans>
            </p>
          </div>
          <div className="max-h-[min(520px,70vh)] space-y-4 overflow-y-auto px-4 py-4">
            <Select
              aria-label={t`Branch or tag`}
              options={props.refs}
              value={ref}
              onChange={(value) => {
                setRef(value);
                props.onRefChange(value);
              }}
            />
            {props.isDefinitionLoading ? (
              <div className="flex items-center gap-2 py-5 text-xs text-muted">
                <LoaderCircle className="size-4 animate-spin" />
                <Trans>Loading workflow inputs</Trans>
              </div>
            ) : (
              props.definition.inputs.map((input) =>
                input.type === "boolean" ? (
                  <Checkbox
                    key={input.name}
                    isSelected={values[input.name] === true}
                    onChange={(selected) =>
                      setValues((current) => ({ ...current, [input.name]: selected }))
                    }
                  >
                    <Checkbox.Content className="items-start">
                      <Checkbox.Control className="mt-0.5">
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <span>
                        <span className="block text-xs font-medium text-foreground">
                          {input.description || input.name}
                        </span>
                        {input.description ? (
                          <span className="mt-0.5 block font-mono text-[11px] text-muted">
                            {input.name}
                          </span>
                        ) : null}
                      </span>
                    </Checkbox.Content>
                  </Checkbox>
                ) : input.type === "choice" && input.options.length > 0 ? (
                  <div key={input.name} className="space-y-1">
                    <Label className="text-xs font-medium text-foreground">
                      {input.description || input.name}
                    </Label>
                    <Select
                      aria-label={input.description || input.name}
                      options={input.options.map((option) => ({ id: option, label: option }))}
                      value={stringInputValue(values, input.name)}
                      onChange={(value) =>
                        setValues((current) => ({ ...current, [input.name]: value }))
                      }
                    />
                    {input.description ? (
                      <p className="font-mono text-[11px] text-muted">{input.name}</p>
                    ) : null}
                  </div>
                ) : (
                  <TextField
                    key={input.name}
                    value={stringInputValue(values, input.name)}
                    isRequired={input.required}
                    isInvalid={missing.includes(input.name)}
                    type={input.type === "number" ? "number" : "text"}
                    onChange={(value) =>
                      setValues((current) => ({ ...current, [input.name]: value }))
                    }
                  >
                    <Label>{input.description || input.name}</Label>
                    <Input />
                    {input.description ? <Description>{input.name}</Description> : null}
                  </TextField>
                ),
              )
            )}
            {missing.length > 0 ? (
              <p className="text-xs text-danger">
                <Trans>Fill in all required workflow inputs.</Trans>
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--hairline)] px-4 py-3">
            <Button variant="ghost" isDisabled={props.isPending} onPress={() => setIsOpen(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              isPending={props.isPending}
              isDisabled={props.isDefinitionLoading}
              onPress={() => void runWorkflow()}
            >
              {({ isPending }) => (
                <>
                  {isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  <Trans>Run workflow</Trans>
                </>
              )}
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
