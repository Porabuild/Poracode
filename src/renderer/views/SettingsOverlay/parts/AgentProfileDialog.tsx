import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, ComboBox, ListBox, Modal, Tabs, toast } from "@heroui/react";
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Info } from "lucide-react";
import type { AgentInstanceConfig, AgentStatus } from "@/shared/contracts";
import { MIN_CONTEXT_WINDOW_TOKENS, MAX_CONTEXT_WINDOW_TOKENS } from "@/shared/contextWindow";
import { parseOllamaContextInput } from "@/shared/agents/ollamaContext";
import { friendlyError } from "@/shared/messages";
import { Input, Select } from "@/renderer/components/common";
import type { AgentSettingsHost } from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import type { NativeAgentProfileSupport } from "./agentRegistryNative";
import { agentProfileDraftId, createAgentProfile } from "./agentProfileCreate";
import { AgentProfileAddModelDialog } from "./AgentProfileAddModelDialog";
import { isDuplicateProfileName } from "./profileIds";
import { isValidModelEndpoint, LOCAL_PROFILE_MODEL_MAX_LENGTH } from "./localModelServer";

/** The three honest destination choices in the Add profile dialog. */
type ConnectionChoice = "default" | "ollama" | "other";

export interface AgentProfileHarnessOption {
  driver: string;
  label: MessageDescriptor;
  support: NativeAgentProfileSupport;
}

/**
 * The one Add profile form every supported harness uses. The parent mounts it
 * only while open, so each opening starts from a clean draft. Everything that
 * differs between providers arrives through the profile descriptor: its
 * harness label, the existing add-form field, and (when the provider declares
 * a route factory) the local model payload.
 */
export function AgentProfileDialog(props: {
  harnesses: readonly AgentProfileHarnessOption[];
  initialDriver: string;
  settingsHost: AgentSettingsHost;
  agentInstances: Readonly<Record<string, AgentInstanceConfig>>;
  statuses: readonly AgentStatus[];
  hostLabel?: string;
  /** True only for an actual desktop client on the selected native host. */
  workspaceIsClientDevice?: boolean | undefined;
  onDismiss: () => void;
  onCreated: (kind: string) => void;
}) {
  const { t } = useLingui();
  const min = MIN_CONTEXT_WINDOW_TOKENS;
  const max = MAX_CONTEXT_WINDOW_TOKENS;
  const initialHarness =
    props.harnesses.find((harness) => harness.driver === props.initialDriver) ?? props.harnesses[0];
  const [driver, setDriver] = useState(initialHarness?.driver ?? "");
  const [name, setName] = useState("");
  const [field, setField] = useState("");
  const [connection, setConnection] = useState<ConnectionChoice>(
    initialHarness?.support.addProfile?.local ? "ollama" : "default",
  );
  const [endpoint, setEndpoint] = useState(
    initialHarness?.support.addProfile?.local?.ollamaEndpoint ?? "",
  );
  const [model, setModel] = useState("");
  const [contextInput, setContextInput] = useState("");
  const [contextBadInput, setContextBadInput] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [showServerHelp, setShowServerHelp] = useState(false);
  const [showContextInfo, setShowContextInfo] = useState(false);
  const [modelImportOpen, setModelImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const addModelButtonRef = useRef<HTMLButtonElement>(null);
  const nameId = useId();

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const selected = props.harnesses.find((harness) => harness.driver === driver) ?? initialHarness;
  const support = selected?.support;
  const addSupport = support?.addProfile;
  const local = addSupport?.local;
  const localAvailable = local !== undefined;
  const isLocal = connection !== "default" && localAvailable;
  const trimmedName = name.trim();
  const driverInstances = Object.values(props.agentInstances).filter(
    (instance) => instance.driver === selected?.driver,
  );
  const duplicateName = isDuplicateProfileName(trimmedName, driverInstances);
  const draftId = agentProfileDraftId(trimmedName, props.agentInstances);
  const fieldPlaceholder = support?.field?.placeholderFor
    ? support.field.placeholderFor(trimmedName, draftId)
    : support?.field?.placeholder
      ? t(support.field.placeholder)
      : "";
  const defaultFieldMissing = support?.field?.required === true && !field.trim();
  const customEndpoint = connection === "other";
  const trimmedEndpoint = endpoint.trim();
  const endpointMissing = customEndpoint && trimmedEndpoint.length === 0;
  const endpointInvalid =
    customEndpoint && trimmedEndpoint.length > 0 && !isValidModelEndpoint(trimmedEndpoint);
  const modelMissing = isLocal && model.trim().length === 0;
  const modelTooLong = isLocal && model.trim().length > LOCAL_PROFILE_MODEL_MAX_LENGTH;
  const contextParse = parseOllamaContextInput(contextInput, contextBadInput);
  const contextInvalid = contextParse.kind === "invalid";
  const contextTokens = contextParse.kind === "valid" ? contextParse.tokens : undefined;
  const suggestions =
    connection === "ollama" ? (local?.modelSuggestions?.(props.statuses) ?? []) : [];
  const ollamaEndpoint = local?.ollamaEndpoint ?? "";
  const canOperateContextTerminal =
    props.settingsHost.canOperateTerminal ?? !props.settingsHost.isRemote;
  const canReadContextTerminal = props.settingsHost.canReadTerminal ?? !props.settingsHost.isRemote;
  const contextAvailable =
    props.settingsHost.isOnline &&
    props.settingsHost.canWrite &&
    canOperateContextTerminal &&
    canReadContextTerminal &&
    props.settingsHost.machineProject !== undefined;
  const contextUnavailableReason = !props.settingsHost.isOnline
    ? t`The selected host is offline.`
    : !props.settingsHost.canWrite
      ? t`This connection is read-only.`
      : !canOperateContextTerminal || !canReadContextTerminal
        ? t`This connection does not allow terminal access on the selected host.`
        : !props.settingsHost.machineProject
          ? t`No host location is available for this machine.`
          : undefined;
  const canAttempt =
    props.settingsHost.isOnline &&
    props.settingsHost.canManageProfiles &&
    props.settingsHost.canWrite &&
    trimmedName.length > 0 &&
    !duplicateName &&
    !saving;
  const canCreate =
    canAttempt &&
    !defaultFieldMissing &&
    !endpointMissing &&
    !endpointInvalid &&
    !modelMissing &&
    !modelTooLong &&
    !contextInvalid &&
    (contextTokens === undefined || contextAvailable);
  const machineHostLabel = props.hostLabel ?? props.settingsHost.machineLabel;
  const connectionOptions = localAvailable
    ? ([
        { id: "default", label: t`Agent default` },
        { id: "ollama", label: t`Local Ollama` },
        { id: "other", label: t`Other server` },
      ] satisfies { id: ConnectionChoice; label: string }[])
    : ([{ id: "default", label: t`Agent default` }] satisfies {
        id: ConnectionChoice;
        label: string;
      }[]);

  const resetLocalDraft = (next: ConnectionChoice) => {
    setConnection(next);
    setEndpoint(next === "ollama" ? ollamaEndpoint : "");
    setModel("");
    setContextInput("");
    setContextBadInput(false);
    setShowServerHelp(false);
    setShowContextInfo(false);
    setModelImportOpen(false);
    setAttempted(false);
  };

  const changeDriver = (nextDriver: string) => {
    const next = props.harnesses.find((harness) => harness.driver === nextDriver);
    if (!next) return;
    setDriver(nextDriver);
    setField("");
    const nextLocal = next.support.addProfile?.local;
    setConnection(nextLocal ? "ollama" : "default");
    setEndpoint(nextLocal?.ollamaEndpoint ?? "");
    setModel("");
    setContextInput("");
    setContextBadInput(false);
    setShowServerHelp(false);
    setShowContextInfo(false);
    setModelImportOpen(false);
    setAttempted(false);
  };

  const changeConnection = (next: ConnectionChoice) => {
    if (next === connection) return;
    if (next !== "default" && !localAvailable) return;
    resetLocalDraft(next);
  };

  const chooseModel = (id: string) => {
    setModel(id);
    setAttempted(false);
  };

  const captureContextInput = (target: HTMLInputElement) => {
    setContextInput(target.value);
    setContextBadInput(target.validity.badInput);
  };

  const dismiss = () => {
    if (!saving) props.onDismiss();
  };

  const submit = () => {
    setAttempted(true);
    if (!support || !canCreate) {
      if (!trimmedName) nameRef.current?.focus();
      return;
    }
    setSaving(true);
    void createAgentProfile({
      support,
      settingsHost: props.settingsHost,
      agentInstances: props.agentInstances,
      statuses: props.statuses,
      draft: {
        displayName: trimmedName,
        connection: isLocal ? "local" : "default",
        field,
        endpoint: connection === "ollama" ? ollamaEndpoint : trimmedEndpoint,
        model,
        ...(connection === "ollama" && contextTokens !== undefined
          ? { contextLength: contextTokens }
          : {}),
      },
    })
      .then((created) => {
        toast.success(t`Profile ${trimmedName} added.`);
        if (created.flushError) {
          toast.danger(
            t`Profile ${trimmedName} was created, but its settings could not be saved. Refresh Agents before using it.`,
          );
        }
        props.onCreated(created.kind);
        props.onDismiss();
      })
      .catch((error) => {
        toast.danger(friendlyError(error));
        setSaving(false);
      });
  };

  const submitOnEnter = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submit();
  };

  if (!selected || !support) return null;

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => (open ? undefined : dismiss())}
      isDismissable={false}
    >
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog className="sm:max-w-[680px]">
          <Modal.Header>
            <Modal.Heading>{t`Add profile`}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1">
              <label htmlFor={nameId} className="text-[11px] font-medium text-muted">
                <Trans>Profile name</Trans>
              </label>
              <Input
                ref={nameRef}
                id={nameId}
                aria-label={t`New profile name`}
                placeholder={t`e.g. Work`}
                value={name}
                disabled={saving}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={submitOnEnter}
              />
            </div>
            {duplicateName ? (
              <p role="alert" className="-mt-2 text-[11px] text-danger">
                <Trans>A profile with this name already exists for this harness.</Trans>
              </p>
            ) : null}

            {props.harnesses.length >= 3 ? (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-muted">
                  <Trans>Harness</Trans>
                </span>
                <Select
                  aria-label={t`Harness`}
                  options={props.harnesses.map((harness) => ({
                    id: harness.driver,
                    label: t(harness.label),
                    icon: (
                      <ProviderIcon
                        kind={harness.driver}
                        tone="inactive"
                        fallbackLabel={t(harness.label)}
                        className="size-3.5"
                      />
                    ),
                  }))}
                  value={driver}
                  isDisabled={saving}
                  onChange={changeDriver}
                />
              </div>
            ) : props.harnesses.length === 2 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[11px] font-medium text-muted">
                  <Trans>Harness</Trans>
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {props.harnesses.map((harness) => (
                    <ConnectionCard
                      key={harness.driver}
                      name="agent-profile-harness"
                      value={harness.driver}
                      checked={driver === harness.driver}
                      disabled={saving}
                      title={
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <ProviderIcon
                            kind={harness.driver}
                            tone="inactive"
                            fallbackLabel={t(harness.label)}
                            className="size-3.5 shrink-0"
                          />
                          <span className="truncate">{t(harness.label)}</span>
                        </span>
                      }
                      ariaLabel={t(harness.label)}
                      onChange={() => changeDriver(harness.driver)}
                    />
                  ))}
                </div>
              </fieldset>
            ) : (
              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                {addSupport ? (
                  <ProviderIcon
                    kind={selected.driver}
                    tone="inactive"
                    fallbackLabel={t(addSupport.label)}
                    className="size-3.5"
                  />
                ) : null}
                <Trans>Harness</Trans> · {addSupport ? t(addSupport.label) : null}
              </p>
            )}

            <Tabs
              selectedKey={connection}
              onSelectionChange={(key) => changeConnection(key as ConnectionChoice)}
            >
              <Tabs.ListContainer className="agent-profile-tablist w-fit max-w-full self-start">
                <Tabs.List aria-label={t`Connection`}>
                  {connectionOptions.map((option) => (
                    <Tabs.Tab
                      key={option.id}
                      id={option.id}
                      className="whitespace-nowrap max-sm:px-2 max-sm:text-[10px]"
                    >
                      {option.label}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel id={connection} className="flex flex-col gap-3 pt-3 outline-none">
                {connection === "default" && support.field ? (
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label={t(support.field.ariaLabel)}
                      className="font-mono text-xs"
                      placeholder={fieldPlaceholder}
                      value={field}
                      disabled={saving}
                      onKeyDown={submitOnEnter}
                      onChange={(event) => setField(event.target.value)}
                      {...(support.field.secret
                        ? {
                            type: "password" as const,
                            spellCheck: false,
                            autoCapitalize: "off" as const,
                            autoCorrect: "off" as const,
                          }
                        : {})}
                    />
                    {attempted && defaultFieldMissing ? (
                      <p role="alert" className="text-[11px] text-danger">
                        <Trans>This field is required.</Trans>
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {connection === "other" ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-medium text-muted">
                        <Trans>Server address</Trans>
                      </span>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        className="size-6 min-h-6 min-w-6 text-muted"
                        aria-label={t`About the server address`}
                        aria-expanded={showServerHelp}
                        aria-controls={`${nameId}-address-help`}
                        onPress={() => setShowServerHelp((open) => !open)}
                      >
                        <Info className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                    <Input
                      aria-label={t`Server address`}
                      className="font-mono text-xs"
                      placeholder="http://192.168.1.20:8000/v1"
                      value={endpoint}
                      disabled={saving}
                      onKeyDown={submitOnEnter}
                      onChange={(event) => setEndpoint(event.target.value)}
                    />
                    <div
                      id={`${nameId}-address-help`}
                      hidden={!showServerHelp}
                      className="text-xs text-muted"
                    >
                      {local?.modelHint ?? t`Use the address the server expects.`}
                    </div>
                    {endpointMissing && attempted ? (
                      <p role="alert" className="text-[11px] text-danger">
                        <Trans>Enter the server address.</Trans>
                      </p>
                    ) : endpointInvalid ? (
                      <p role="alert" className="text-[11px] text-danger">
                        <Trans>Use a valid HTTP(S) URL.</Trans>
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {connection !== "default" ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-medium text-muted">
                        <Trans>Model</Trans>
                      </span>
                      {connection === "ollama" ? (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          className="size-6 min-h-6 min-w-6 text-muted"
                          aria-label={t`About the server address`}
                          aria-expanded={showServerHelp}
                          aria-controls={`${nameId}-model-help`}
                          onPress={() => setShowServerHelp((open) => !open)}
                        >
                          <Info className="size-3.5" aria-hidden />
                        </Button>
                      ) : null}
                      <Button
                        ref={addModelButtonRef}
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 min-h-6 px-2 text-[11px]"
                        aria-label={t`Add model…`}
                        onPress={() => setModelImportOpen(true)}
                      >
                        <Trans>Add model…</Trans>
                      </Button>
                    </div>
                    {connection === "ollama" ? (
                      <div id={`${nameId}-model-help`} hidden={!showServerHelp}>
                        <p className="text-xs text-muted">
                          {t`Ollama on this host: ${ollamaEndpoint}`}
                        </p>
                      </div>
                    ) : null}
                    <ModelComboBox
                      value={model}
                      options={suggestions}
                      disabled={saving}
                      onChange={setModel}
                    />
                    {modelMissing && attempted ? (
                      <p role="alert" className="text-[11px] text-danger">
                        <Trans>Enter or choose a model ID.</Trans>
                      </p>
                    ) : modelTooLong ? (
                      <p role="alert" className="text-[11px] text-danger">
                        <Trans>Model IDs are limited to 200 characters.</Trans>
                      </p>
                    ) : null}
                    {modelImportOpen ? (
                      <AgentProfileAddModelDialog
                        key={`${props.settingsHost.key}:${driver}:${connection === "ollama" ? ollamaEndpoint : trimmedEndpoint}`}
                        isOpen={modelImportOpen}
                        serverLabel={
                          connection === "ollama"
                            ? machineHostLabel
                              ? t`Ollama on ${machineHostLabel}`
                              : t`Ollama on the selected host`
                            : trimmedEndpoint
                        }
                        sameAsWorkspaceHost={
                          connection === "ollama" && props.workspaceIsClientDevice === true
                        }
                        settingsHost={props.settingsHost}
                        ollamaDownload={connection === "ollama"}
                        returnFocusRef={addModelButtonRef}
                        onClose={() => setModelImportOpen(false)}
                        onUseModel={chooseModel}
                      />
                    ) : null}
                  </div>
                ) : null}

                {connection === "ollama" ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-medium text-muted">
                        <Trans>Context length</Trans>
                      </span>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        className="size-6 min-h-6 min-w-6 text-muted"
                        aria-label={t`About context length`}
                        aria-expanded={showContextInfo}
                        aria-controls={`${nameId}-context-help`}
                        onPress={() => setShowContextInfo((open) => !open)}
                      >
                        <Info className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                    <Input
                      aria-label={t`Context length`}
                      aria-invalid={contextInvalid}
                      className="font-mono text-xs"
                      type="number"
                      inputMode="numeric"
                      min={min}
                      max={max}
                      step={1}
                      placeholder={t`Server default`}
                      value={contextInput}
                      disabled={saving || !contextAvailable}
                      onChange={(event) => captureContextInput(event.currentTarget)}
                      onInput={(event) => captureContextInput(event.currentTarget)}
                      onKeyDown={submitOnEnter}
                    />
                    {contextInvalid ? (
                      <p role="alert" className="text-[11px] text-danger">
                        {t`Enter a whole number from ${min} to ${max}.`}
                      </p>
                    ) : null}
                    {contextUnavailableReason ? (
                      <p role="status" className="text-[11px] text-muted">
                        {contextUnavailableReason}
                      </p>
                    ) : null}
                    <div id={`${nameId}-context-help`} hidden={!showContextInfo}>
                      <p className="text-[11px] text-muted">
                        <Trans>
                          Larger windows reserve more memory. A size that does not fit this machine
                          can fail to load.
                        </Trans>
                      </p>
                    </div>
                  </div>
                ) : null}
              </Tabs.Panel>
            </Tabs>
          </Modal.Body>
          <Modal.Footer>
            <Button
              className="flex-1 sm:flex-none"
              variant="ghost"
              isDisabled={saving}
              onPress={dismiss}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              variant="primary"
              isDisabled={!canCreate}
              isPending={saving}
              onPress={submit}
            >
              <Trans>Create</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function ConnectionCard(props: {
  name: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  title: ReactNode;
  ariaLabel?: string;
  onChange: () => void;
}): ReactNode {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
        props.checked ? "border-accent/50 bg-accent/5" : "border-border/20"
      } ${props.disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="radio"
        name={props.name}
        value={props.value}
        checked={props.checked}
        disabled={props.disabled}
        aria-label={props.ariaLabel ?? (typeof props.title === "string" ? props.title : undefined)}
        className="mt-0.5 size-3.5 shrink-0 accent-accent"
        onChange={props.onChange}
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-foreground">{props.title}</span>
      </span>
    </label>
  );
}

/** Editable searchable model picker; a suggestion is never required. */
function ModelComboBox(props: {
  value: string;
  options: readonly string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const query = props.value.trim().toLowerCase();
  const filteredOptions = query
    ? props.options.filter((id) => id.toLowerCase().includes(query))
    : props.options;
  return (
    <ComboBox
      aria-label={t`Model`}
      onKeyDown={(event) => {
        // Keep Escape inside an open model list instead of closing the modal.
        if (event.key === "Escape" && open) event.stopPropagation();
      }}
      className="w-full min-w-0"
      allowsCustomValue
      menuTrigger="input"
      items={filteredOptions.map((id) => ({ id, label: id }))}
      inputValue={props.value}
      onInputChange={props.onChange}
      onChange={(key) => {
        if (key != null) props.onChange(String(key));
      }}
      onOpenChange={setOpen}
      isDisabled={props.disabled}
    >
      <ComboBox.InputGroup>
        <Input
          placeholder={t`Choose or enter a model ID`}
          maxLength={LOCAL_PROFILE_MODEL_MAX_LENGTH}
        />
        <ComboBox.Trigger aria-label={t`Show model suggestions`} />
      </ComboBox.InputGroup>
      <ComboBox.Popover
        placement="bottom start"
        maxHeight={240}
        className="min-w-0 max-w-[calc(100vw-16px)] p-1"
      >
        <ListBox className="poracode-menu max-h-60 overflow-y-auto">
          {(option: { id: string; label: string }) => (
            <ListBox.Item id={option.id} textValue={option.id} className="min-w-0 pe-7">
              <span className="block max-w-full truncate font-mono text-[11px]">
                {option.label}
              </span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          )}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}
