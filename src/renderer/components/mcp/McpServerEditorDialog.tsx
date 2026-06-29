import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "@heroui/react";
import type { McpServer } from "@/shared/contracts";
import { Button, Input, Select, TextArea } from "@/renderer/components/common";
import {
  formStateToServer,
  newServerFormState,
  serverToFormState,
  validateForm,
  type McpServerFormState,
} from "./mcpFormUtils";

const TRANSPORT_OPTIONS = [
  { id: "stdio", label: "stdio (local command)" },
  { id: "http", label: "http (streamable)" },
  { id: "sse", label: "sse (legacy)" },
];

export function McpServerEditorDialog(props: {
  isOpen: boolean;
  /** The server being edited, or undefined to create a new one. */
  server?: McpServer | undefined;
  /** Existing server names (lowercased) used to flag duplicates. */
  existingNames: ReadonlySet<string>;
  setupHint?: string | undefined;
  onSave: (server: McpServer) => void;
  onClose: () => void;
}) {
  const { isOpen, server, existingNames, setupHint, onSave, onClose } = props;
  const [state, setState] = useState<McpServerFormState>(() => newServerFormState(""));
  const [showErrors, setShowErrors] = useState(false);

  // Re-seed the form each time the dialog opens for a (possibly different) server.
  useEffect(() => {
    if (!isOpen) return;
    setShowErrors(false);
    setState(server ? serverToFormState(server) : newServerFormState(crypto.randomUUID()));
  }, [isOpen, server]);

  const validation = validateForm(state);
  const trimmedName = state.name.trim().toLowerCase();
  const duplicate =
    trimmedName.length > 0 &&
    trimmedName !== (server?.name.toLowerCase() ?? "") &&
    existingNames.has(trimmedName);

  const update = <K extends keyof McpServerFormState>(key: K, value: McpServerFormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (!validation.ok || duplicate) {
      setShowErrors(true);
      return;
    }
    onSave(formStateToServer(state, server));
    onClose();
  };

  const fieldError = (key: "name" | "command" | "url") =>
    showErrors ? validation.errors[key] : undefined;

  return (
    <Modal>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[620px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{server ? "Edit MCP server" : "Add MCP server"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="space-y-4 px-5 pb-5 pt-2">
              {setupHint ? (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  {setupHint}
                </p>
              ) : null}

              <Field
                label="Name"
                error={
                  fieldError("name") ??
                  (duplicate ? "A server with this name already exists." : undefined)
                }
              >
                <Input
                  aria-label="Server name"
                  placeholder="e.g. github"
                  value={state.name}
                  onChange={(e) => update("name", e.target.value)}
                />
              </Field>

              <Field label="Transport">
                <Select
                  aria-label="Transport type"
                  options={TRANSPORT_OPTIONS}
                  value={state.transportType}
                  onChange={(value) =>
                    update("transportType", value as McpServerFormState["transportType"])
                  }
                />
              </Field>

              {state.transportType === "stdio" ? (
                <>
                  <Field label="Command" error={fieldError("command")}>
                    <Input
                      aria-label="Command"
                      className="font-mono text-xs"
                      placeholder="npx"
                      value={state.command}
                      onChange={(e) => update("command", e.target.value)}
                    />
                  </Field>
                  <Field label="Arguments" hint="One per line">
                    <TextArea
                      aria-label="Arguments"
                      className="w-full font-mono text-xs"
                      rows={3}
                      placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir"}
                      value={state.argsText}
                      onChange={(e) => update("argsText", e.target.value)}
                    />
                  </Field>
                  <Field label="Environment" hint="KEY=VALUE per line">
                    <TextArea
                      aria-label="Environment variables"
                      className="w-full font-mono text-xs"
                      rows={2}
                      placeholder={"API_KEY=..."}
                      value={state.envText}
                      onChange={(e) => update("envText", e.target.value)}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="URL" error={fieldError("url")}>
                    <Input
                      aria-label="Server URL"
                      className="font-mono text-xs"
                      placeholder="https://example.com/mcp"
                      value={state.url}
                      onChange={(e) => update("url", e.target.value)}
                    />
                  </Field>
                  <Field label="Headers" hint="Header-Name: value per line">
                    <TextArea
                      aria-label="Headers"
                      className="w-full font-mono text-xs"
                      rows={2}
                      placeholder={"Authorization: Bearer ..."}
                      value={state.headersText}
                      onChange={(e) => update("headersText", e.target.value)}
                    />
                  </Field>
                </>
              )}

              <Field label="Description" hint="Optional">
                <Input
                  aria-label="Description"
                  placeholder="What this server provides"
                  value={state.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </Field>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="tertiary">
                Cancel
              </Button>
              <Button variant="primary" onPress={handleSave}>
                {server ? "Save" : "Add server"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function Field(props: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-foreground">{props.label}</span>
        {props.hint ? <span className="text-[11px] text-muted">{props.hint}</span> : null}
      </div>
      {props.children}
      {props.error ? <p className="text-[11px] text-danger">{props.error}</p> : null}
    </div>
  );
}
