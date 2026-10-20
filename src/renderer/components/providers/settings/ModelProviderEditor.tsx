import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  modelProviderConfigSchema,
  type ConfiguredModelProvider,
  type ModelProviderConfig,
} from "@/shared/contracts";
import { Select } from "@/renderer/components/common/Select";

export function ModelProviderEditor({
  provider,
  catalog,
  busy,
  onSave,
  onCancel,
}: {
  provider: ConfiguredModelProvider | undefined;
  catalog: { id: string; name: string; baseURL: string }[];
  busy: boolean;
  onSave: (provider: ModelProviderConfig, apiKey: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const [selected, setSelected] = useState(provider?.id ?? catalog[0]?.id ?? "__custom__");
  const [id, setId] = useState(provider?.id ?? "");
  const [name, setName] = useState(provider?.name ?? "");
  const [baseURL, setBaseURL] = useState(provider?.baseURL ?? "");
  const [protocol, setProtocol] = useState<ModelProviderConfig["protocol"]>(
    provider?.protocol ?? "openai-completions",
  );
  const [models, setModels] = useState(provider?.modelIds.join(", ") ?? "");
  const [apiKey, setApiKey] = useState("");
  const custom = provider?.custom ?? selected === "__custom__";
  const parsed = modelProviderConfigSchema.safeParse({
    id: provider?.id ?? (custom ? id : selected),
    name,
    baseURL: baseURL.trim(),
    protocol,
    modelIds: [
      ...new Set(
        models
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
  });
  const valid =
    parsed.success &&
    (provider !== undefined || !custom || /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(parsed.data.id)) &&
    (!custom || (parsed.data.baseURL.length > 0 && parsed.data.modelIds.length > 0));
  return (
    <div className="space-y-3 rounded-lg border border-border/20 p-3">
      {!provider ? (
        <Select
          label={t`Provider`}
          value={selected}
          isDisabled={busy}
          onChange={(value) => {
            setSelected(value);
            setName("");
            setBaseURL("");
            setModels("");
            setApiKey("");
          }}
          options={[
            ...catalog.map((entry) => ({ id: entry.id, label: entry.name })),
            { id: "__custom__", label: t`Custom endpoint` },
          ]}
        />
      ) : (
        <p className="text-sm font-medium">{provider.name}</p>
      )}
      {custom && !provider ? (
        <TextField value={id} onChange={setId} isDisabled={busy} isRequired>
          <Label>
            <Trans>Provider ID</Trans>
          </Label>
          <Input placeholder="my-provider" />
          <p className="text-xs text-muted">
            <Trans>Use lowercase letters, numbers, and hyphens.</Trans>
          </p>
        </TextField>
      ) : null}
      <TextField value={name} onChange={setName} isDisabled={busy}>
        <Label>
          <Trans>Display name</Trans>
        </Label>
        <Input />
      </TextField>
      <TextField value={baseURL} onChange={setBaseURL} isDisabled={busy} isRequired={custom}>
        <Label>
          <Trans>Base URL</Trans>
        </Label>
        <Input
          placeholder={
            catalog.find((entry) => entry.id === selected)?.baseURL || "https://api.example.com/v1"
          }
        />
      </TextField>
      {custom ? (
        <Select
          label={t`API protocol`}
          value={protocol}
          isDisabled={busy}
          onChange={(value) => setProtocol(value as ModelProviderConfig["protocol"])}
          options={[
            { id: "openai-completions", label: "OpenAI Chat Completions" },
            { id: "openai-responses", label: "OpenAI Responses" },
            { id: "anthropic-messages", label: "Anthropic Messages" },
          ]}
        />
      ) : null}
      <TextField value={models} onChange={setModels} isDisabled={busy} isRequired={custom}>
        <Label>
          <Trans>Model IDs, separated by commas</Trans>
        </Label>
        <Input />
        {!custom ? (
          <p className="text-xs text-muted">
            <Trans>Leave blank to use the installed model catalog.</Trans>
          </p>
        ) : null}
      </TextField>
      <TextField value={apiKey} onChange={setApiKey} isDisabled={busy}>
        <Label>
          <Trans>API key</Trans>
        </Label>
        <Input type="password" autoComplete="new-password" />
        <p className="text-xs text-muted">
          <Trans>Leave blank to keep existing credentials or use environment authentication.</Trans>
        </p>
      </TextField>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="tertiary" isDisabled={busy} onPress={onCancel}>
          <Trans>Cancel</Trans>
        </Button>
        <Button
          size="sm"
          isDisabled={!valid || busy}
          isPending={busy}
          onPress={() => {
            if (parsed.success) onSave(parsed.data, apiKey.trim());
          }}
        >
          <Trans>Save</Trans>
        </Button>
      </div>
    </div>
  );
}
