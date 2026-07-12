import { useId, useState, type ReactNode } from "react";
import { Description, FieldError, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { DEFAULT_MCP_SERVER_TIMEOUT_MS, type McpServer } from "@/shared/contracts";
import { Button, LightballTabs, Select, TuxIcon } from "@/renderer/components/common";
import {
  GLOBAL_MCP_DESTINATION_ID,
  McpProjectDestinationDropdown,
  mcpProjectDestinationId,
  type McpProjectDestination,
} from "./McpProjectDestinationDropdown";
import {
  mcpFormStateToServer,
  mcpServerToFormState,
  newMcpServerFormState,
  parseMcpServersJson,
  serializeMcpServersJson,
  validateMcpServerForm,
  type McpFormErrorCode,
  type McpServerFormState,
} from "./mcpFormUtils";

type EditorMode = "form" | "json";

const NEW_MCP_SERVER_JSON = JSON.stringify(
  {
    "my-mcp-server": {
      type: "stdio",
      command: "",
      args: [],
      timeoutMs: DEFAULT_MCP_SERVER_TIMEOUT_MS,
    },
  },
  null,
  2,
);

export function McpServerEditor(props: {
  server?: McpServer;
  previousName?: string;
  existingNames: ReadonlySet<string>;
  scopeId: string;
  projects: readonly McpProjectDestination[];
  onScopeChange: (scopeId: string) => void;
  onSave: (server: McpServer) => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const titleId = useId();
  const descriptionId = useId();
  const [form, setForm] = useState<McpServerFormState>(() =>
    props.server ? mcpServerToFormState(props.server) : newMcpServerFormState(crypto.randomUUID()),
  );
  const [formServer, setFormServer] = useState<McpServer | undefined>(props.server);
  const [mode, setMode] = useState<EditorMode>("form");
  const [jsonText, setJsonText] = useState(() =>
    props.server ? serializeMcpServersJson([props.server]) : NEW_MCP_SERVER_JSON,
  );
  const [jsonDirty, setJsonDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [jsonError, setJsonError] = useState<string | undefined>();
  const [envExpanded, setEnvExpanded] = useState(false);

  const update = <K extends keyof McpServerFormState>(key: K, value: McpServerFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const validation = validateMcpServerForm(form, props.existingNames, props.previousName);

  const errorMessage = (code: McpFormErrorCode | undefined): string | undefined => {
    if (!code) return undefined;
    if (code === "name-required") return t`Name is required.`;
    if (code === "name-invalid") {
      return t`Use letters, numbers, dots, dashes, or underscores without spaces.`;
    }
    if (code === "name-reserved") return t`This name is reserved by a built-in MCP server.`;
    if (code === "name-duplicate") return t`An MCP server with this name already exists.`;
    if (code === "command-required") return t`Command is required.`;
    if (code === "url-required") return t`URL is required.`;
    if (code === "url-invalid") return t`Enter a valid HTTP or HTTPS URL.`;
    if (code === "env-invalid") return t`One KEY=VALUE pair per line`;
    if (code === "headers-invalid") return t`One Header: value pair per line`;
    return t`Timeout must be a positive whole number.`;
  };

  const parseEditorJson = (): McpServer | undefined => {
    const parsed = parseMcpServersJson(jsonText);
    if (!parsed.ok) {
      setJsonError(
        parsed.error === "invalid-json"
          ? t`Enter valid JSON.`
          : parsed.error === "invalid-shape"
            ? t`Enter one MCP server configuration.`
            : t`The MCP server configuration is invalid or uses a reserved name.`,
      );
      return undefined;
    }
    if (parsed.servers.length !== 1) {
      setJsonError(t`Enter one MCP server configuration.`);
      return undefined;
    }
    const parsedServer = parsed.servers[0]!;
    const next = { ...parsedServer, id: props.server?.id ?? form.id };
    const nextValidation = validateMcpServerForm(
      mcpServerToFormState(next),
      props.existingNames,
      props.previousName,
    );
    if (!nextValidation.valid) {
      setJsonError(errorMessage(nextValidation.errors.name) ?? t`The MCP server is invalid.`);
      return undefined;
    }
    setJsonError(undefined);
    return next;
  };

  const changeMode = (next: EditorMode) => {
    if (next === mode) return;
    if (next === "json") {
      if (validation.valid) {
        setJsonText(serializeMcpServersJson([mcpFormStateToServer(form, formServer)]));
        setJsonDirty(false);
      }
      setJsonError(undefined);
      setMode(next);
      return;
    }
    if (jsonDirty) {
      const parsed = parseEditorJson();
      if (parsed) {
        setForm(mcpServerToFormState(parsed));
        setFormServer(parsed);
        setJsonDirty(false);
        setShowErrors(false);
      }
    }
    setMode(next);
  };

  const save = () => {
    if (mode === "json") {
      const parsed = parseEditorJson();
      if (parsed) props.onSave(parsed);
      return;
    }
    if (!validation.valid) {
      setShowErrors(true);
      return;
    }
    props.onSave(mcpFormStateToServer(form, formServer));
  };

  const transportOptions = [
    { id: "stdio", label: t`stdio (local command)` },
    { id: "http", label: t`HTTP (streamable)` },
    { id: "sse", label: t`SSE (legacy)` },
  ];
  const selectedProject = props.projects.find(
    (project) => mcpProjectDestinationId(project.id) === props.scopeId,
  );

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) props.onCancel();
      }}
    >
      <Modal.Container placement="center" scroll="inside" size="lg">
        <Modal.Dialog
          aria-describedby={descriptionId}
          aria-labelledby={titleId}
          className="sm:max-w-[760px]"
        >
          <Modal.CloseTrigger />
          <Modal.Header className="pr-12">
            <div className="flex w-full flex-col items-start justify-between gap-3 sm:flex-row">
              <div>
                <Modal.Heading id={titleId}>
                  {props.server ? <Trans>Edit MCP server</Trans> : <Trans>New MCP server</Trans>}
                </Modal.Heading>
                <p id={descriptionId} className="mt-0.5 text-xs text-muted">
                  <Trans>Configure the server Poracode will add when supported agents start.</Trans>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-muted">
                  <Trans>Scope</Trans>
                </span>
                <McpProjectDestinationDropdown
                  ariaLabel={t`Scope`}
                  placement="bottom end"
                  projects={props.projects}
                  value={props.scopeId}
                  trigger={
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t`Scope`}
                      className="w-44 justify-between text-foreground"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">
                          {props.scopeId === GLOBAL_MCP_DESTINATION_ID
                            ? t`Global`
                            : selectedProject?.name}
                        </span>
                        {selectedProject?.location.kind === "wsl" ? (
                          <TuxIcon aria-hidden="true" className="h-3.5 w-6 shrink-0 text-muted" />
                        ) : null}
                      </span>
                      <ChevronDown className="size-3.5 shrink-0 text-muted" />
                    </Button>
                  }
                  onChange={(scopeId) => {
                    setJsonError(undefined);
                    props.onScopeChange(scopeId);
                  }}
                />
                <LightballTabs
                  ariaLabel={t`MCP server editor mode`}
                  active={mode}
                  onChange={changeMode}
                  tabs={[
                    { id: "form", label: t`Form` },
                    { id: "json", label: t`JSON` },
                  ]}
                />
              </div>
            </div>
          </Modal.Header>

          <Modal.Body className="p-4">
            <div>
              {mode === "form" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem]">
                    <Field
                      label={t`Name`}
                      error={showErrors ? errorMessage(validation.errors.name) : undefined}
                    >
                      <Input
                        aria-label={t`MCP server name`}
                        placeholder={t`my-mcp-server`}
                        value={form.name}
                        onChange={(event) => update("name", event.target.value)}
                      />
                    </Field>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-foreground">{t`Type`}</Label>
                      <Select
                        aria-label={t`MCP transport type`}
                        options={transportOptions}
                        value={form.transportType}
                        onChange={(value) =>
                          update("transportType", value as McpServerFormState["transportType"])
                        }
                      />
                    </div>
                    <Field
                      label={t`Timeout (ms)`}
                      error={showErrors ? errorMessage(validation.errors.timeoutMs) : undefined}
                    >
                      <Input
                        aria-label={t`MCP server timeout in milliseconds`}
                        inputMode="numeric"
                        value={form.timeoutMs}
                        onChange={(event) => update("timeoutMs", event.target.value)}
                      />
                    </Field>
                  </div>

                  {form.transportType === "stdio" ? (
                    <>
                      <Field
                        label={t`Command`}
                        error={showErrors ? errorMessage(validation.errors.command) : undefined}
                      >
                        <Input
                          aria-label={t`MCP server command`}
                          className="font-mono text-xs"
                          placeholder={t`npx`}
                          value={form.command}
                          onChange={(event) => update("command", event.target.value)}
                        />
                      </Field>
                      <Field
                        label={t`Arguments`}
                        hint={t`Space separated; use quotes around spaces`}
                      >
                        <Input
                          aria-label={t`MCP server arguments`}
                          className="font-mono text-xs"
                          placeholder={t`-y @modelcontextprotocol/server-memory`}
                          value={form.argsText}
                          onChange={(event) => update("argsText", event.target.value)}
                        />
                      </Field>
                      <details
                        className="group"
                        open={
                          envExpanded || (showErrors && validation.errors.envText !== undefined)
                        }
                        onToggle={(event) => setEnvExpanded(event.currentTarget.open)}
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted hover:text-foreground">
                          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                          <Trans>Environment variables (optional)</Trans>
                        </summary>
                        <div className="mt-2">
                          <Field
                            label={t`Environment variables`}
                            hint={t`One KEY=VALUE pair per line`}
                            error={showErrors ? errorMessage(validation.errors.envText) : undefined}
                          >
                            <TextArea
                              aria-label={t`MCP server environment variables`}
                              className="font-mono text-xs"
                              rows={3}
                              spellCheck={false}
                              placeholder={t`API_KEY=value`}
                              value={form.envText}
                              onChange={(event) => update("envText", event.target.value)}
                            />
                          </Field>
                        </div>
                      </details>
                    </>
                  ) : (
                    <>
                      <Field
                        label={t`URL`}
                        error={showErrors ? errorMessage(validation.errors.url) : undefined}
                      >
                        <Input
                          aria-label={t`MCP server URL`}
                          className="font-mono text-xs"
                          inputMode="url"
                          placeholder={t`https://example.com/mcp`}
                          value={form.url}
                          onChange={(event) => update("url", event.target.value)}
                        />
                      </Field>
                      <Field
                        label={t`Headers`}
                        hint={t`One Header: value pair per line`}
                        error={showErrors ? errorMessage(validation.errors.headersText) : undefined}
                      >
                        <TextArea
                          aria-label={t`MCP server headers`}
                          className="font-mono text-xs"
                          rows={3}
                          spellCheck={false}
                          placeholder={t`Authorization: Bearer token`}
                          value={form.headersText}
                          onChange={(event) => update("headersText", event.target.value)}
                        />
                      </Field>
                    </>
                  )}

                  <Field label={t`Description`} hint={t`Optional`}>
                    <Input
                      aria-label={t`MCP server description`}
                      placeholder={t`What this server provides`}
                      value={form.description}
                      onChange={(event) => update("description", event.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <TextField className="space-y-2" isInvalid={jsonError !== undefined}>
                  <Label className="text-xs font-medium text-foreground">
                    <Trans>Full configuration</Trans>
                  </Label>
                  <TextArea
                    aria-label={t`MCP server JSON configuration`}
                    className="min-h-64 font-mono text-xs"
                    rows={14}
                    spellCheck={false}
                    value={jsonText}
                    onChange={(event) => {
                      setJsonText(event.target.value);
                      setJsonDirty(true);
                      setJsonError(undefined);
                    }}
                  />
                  {jsonError ? (
                    <FieldError className="text-xs text-danger">{jsonError}</FieldError>
                  ) : null}
                  <p className="text-xs text-muted">
                    <Trans>
                      Paste either a named server object or an object wrapped in an mcpServers key.
                    </Trans>
                  </p>
                </TextField>
              )}
            </div>
          </Modal.Body>

          <Modal.Footer>
            <Button variant="ghost" size="sm" onPress={props.onCancel}>
              <Trans>Cancel</Trans>
            </Button>
            <Button variant="tertiary" size="sm" className="text-white" onPress={save}>
              {props.server ? <Trans>Save</Trans> : <Trans>Add</Trans>}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function Field(props: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <TextField className="space-y-1.5" isInvalid={props.error !== undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-xs font-medium text-foreground">{props.label}</Label>
        {props.hint ? (
          <Description className="text-[11px] text-muted">{props.hint}</Description>
        ) : null}
      </div>
      {props.children}
      {props.error ? (
        <FieldError className="text-[11px] text-danger">{props.error}</FieldError>
      ) : null}
    </TextField>
  );
}
