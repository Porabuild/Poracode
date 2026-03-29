import { useState, type ReactNode } from "react";
import type { ThreadServerRequestId } from "../../../shared/contracts";
import type { PendingThreadServerRequest } from "../../state/appStore";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Select,
  TextArea,
} from "../common";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getQuestionAnswerRecord(questions: RequestQuestion[]): Record<string, string> {
  return Object.fromEntries(questions.map((question) => [question.id, ""]));
}

type RequestQuestion = {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: Array<{ label: string; description: string }> | null;
};

type UserInputRequestParams = {
  questions: RequestQuestion[];
};

type McpElicitationSchemaProperty =
  | {
      type: "string";
      title?: string;
      description?: string;
      minLength?: number;
      maxLength?: number;
      default?: string;
      enum?: string[];
      enumNames?: string[];
      oneOf?: Array<{ const: string; title?: string }>;
    }
  | {
      type: "integer" | "number";
      title?: string;
      description?: string;
      minimum?: number;
      maximum?: number;
      default?: number;
    }
  | {
      type: "boolean";
      title?: string;
      description?: string;
      default?: boolean;
    }
  | {
      type: "array";
      title?: string;
      description?: string;
      minItems?: number;
      maxItems?: number;
      default?: string[];
      items?: {
        enum?: string[];
        enumNames?: string[];
        oneOf?: Array<{ const: string; title?: string }>;
      };
    };

type McpElicitationFormParams = {
  mode: "form";
  message: string;
  serverName: string;
  _meta?: unknown;
  requestedSchema: {
    type: "object";
    properties: Record<string, McpElicitationSchemaProperty>;
    required?: string[];
  };
};

type McpElicitationUrlParams = {
  mode: "url";
  message: string;
  serverName: string;
  url: string;
  elicitationId: string;
  _meta?: unknown;
};

type CommandApprovalParams = {
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
  grantRoot?: string | null;
  permissions?: unknown;
  availableDecisions?: unknown[] | null;
};

function parseUserInputRequestParams(params: unknown): UserInputRequestParams | undefined {
  if (!isRecord(params) || !Array.isArray(params.questions)) {
    return undefined;
  }

  const questions = params.questions.flatMap((question): RequestQuestion[] => {
    if (!isRecord(question)) {
      return [];
    }

    const id = asString(question.id);
    const header = asString(question.header);
    const prompt = asString(question.question);
    if (!id || !header || !prompt) {
      return [];
    }

    const options =
      Array.isArray(question.options) && question.options.length > 0
        ? question.options.flatMap((option) => {
            if (!isRecord(option)) {
              return [];
            }
            const label = asString(option.label);
            const description = asString(option.description);
            return label && description ? [{ label, description }] : [];
          })
        : null;

    return [
      {
        id,
        header,
        question: prompt,
        isOther: question.isOther === true,
        isSecret: question.isSecret === true,
        options,
      },
    ];
  });

  return questions.length > 0 ? { questions } : undefined;
}

function parseMcpElicitationParams(
  params: unknown,
): McpElicitationFormParams | McpElicitationUrlParams | undefined {
  if (!isRecord(params)) {
    return undefined;
  }

  const mode = asString(params.mode);
  const message = asString(params.message);
  const serverName = asString(params.serverName);
  if (!mode || !message || !serverName) {
    return undefined;
  }

  if (mode === "url") {
    const url = asString(params.url);
    const elicitationId = asString(params.elicitationId);
    if (!url || !elicitationId) {
      return undefined;
    }
    return {
      mode: "url",
      message,
      serverName,
      url,
      elicitationId,
      ...(Object.hasOwn(params, "_meta") ? { _meta: params._meta } : {}),
    };
  }

  if (
    mode === "form" &&
    isRecord(params.requestedSchema) &&
    params.requestedSchema.type === "object"
  ) {
    const properties = isRecord(params.requestedSchema.properties)
      ? params.requestedSchema.properties
      : {};
    const required = Array.isArray(params.requestedSchema.required)
      ? params.requestedSchema.required.filter((item): item is string => typeof item === "string")
      : undefined;

    return {
      mode: "form",
      message,
      serverName,
      requestedSchema: {
        type: "object",
        properties: properties as Record<string, McpElicitationSchemaProperty>,
        ...(required ? { required } : {}),
      },
      ...(Object.hasOwn(params, "_meta") ? { _meta: params._meta } : {}),
    };
  }

  return undefined;
}

function parseCommandApprovalParams(params: unknown): CommandApprovalParams {
  if (!isRecord(params)) {
    return {};
  }

  return {
    ...(Object.hasOwn(params, "reason") ? { reason: asString(params.reason) ?? null } : {}),
    ...(Object.hasOwn(params, "command")
      ? {
          command:
            typeof params.command === "string"
              ? params.command
              : Array.isArray(params.command)
                ? params.command
                    .filter((item): item is string => typeof item === "string")
                    .join(" ")
                : null,
        }
      : {}),
    ...(Object.hasOwn(params, "cwd") ? { cwd: asString(params.cwd) ?? null } : {}),
    ...(Object.hasOwn(params, "grantRoot")
      ? { grantRoot: asString(params.grantRoot) ?? null }
      : {}),
    ...(Object.hasOwn(params, "permissions") ? { permissions: params.permissions } : {}),
    ...(Array.isArray(params.availableDecisions)
      ? { availableDecisions: params.availableDecisions }
      : {}),
  };
}

function getCommandDecisionLabel(decision: unknown): string {
  if (decision === "accept") {
    return "Approve";
  }
  if (decision === "acceptForSession") {
    return "Approve for session";
  }
  if (decision === "decline") {
    return "Decline";
  }
  if (decision === "cancel") {
    return "Cancel";
  }
  if (isRecord(decision) && isRecord(decision.acceptWithExecpolicyAmendment)) {
    return "Approve and allow similar";
  }
  if (
    isRecord(decision) &&
    isRecord(decision.applyNetworkPolicyAmendment) &&
    isRecord(decision.applyNetworkPolicyAmendment.network_policy_amendment)
  ) {
    const amendment = decision.applyNetworkPolicyAmendment.network_policy_amendment;
    const action = asString(amendment.action) ?? "apply";
    const host = asString(amendment.host) ?? "host";
    return `${action === "allow" ? "Allow" : "Deny"} ${host}`;
  }
  return "Respond";
}

function getLegacyDecisionLabel(decision: string): string {
  switch (decision) {
    case "approved":
      return "Approve";
    case "approved_for_session":
      return "Approve for session";
    case "denied":
      return "Decline";
    case "abort":
      return "Abort";
    default:
      return decision;
  }
}

function getMcpEnumOptions(property: McpElicitationSchemaProperty) {
  if ("oneOf" in property && Array.isArray(property.oneOf)) {
    return property.oneOf
      .filter((option) => isRecord(option) && typeof option.const === "string")
      .map((option) => ({
        id: option.const,
        label: asString(option.title) ?? option.const,
      }));
  }

  if ("enum" in property && Array.isArray(property.enum)) {
    return property.enum.map((option, index) => ({
      id: option,
      label:
        Array.isArray(property.enumNames) && typeof property.enumNames[index] === "string"
          ? property.enumNames[index]
          : option,
    }));
  }

  if (
    property.type === "array" &&
    property.items &&
    "oneOf" in property.items &&
    Array.isArray(property.items.oneOf)
  ) {
    return property.items.oneOf
      .filter((option) => isRecord(option) && typeof option.const === "string")
      .map((option) => ({
        id: option.const,
        label: asString(option.title) ?? option.const,
      }));
  }

  const arrayItems = property.type === "array" ? property.items : undefined;
  if (arrayItems && Array.isArray(arrayItems.enum)) {
    return arrayItems.enum.map((option, index) => ({
      id: option,
      label:
        Array.isArray(arrayItems.enumNames) && typeof arrayItems.enumNames[index] === "string"
          ? arrayItems.enumNames[index]
          : option,
    }));
  }

  return [];
}

function getInitialMcpFormValues(
  schema: McpElicitationFormParams["requestedSchema"],
): Record<string, boolean | number | string | string[]> {
  return Object.fromEntries(
    Object.entries(schema.properties).map(([key, property]) => {
      if (property.type === "boolean") {
        return [key, property.default ?? false];
      }
      if (property.type === "integer" || property.type === "number") {
        return [key, property.default ?? ""];
      }
      if (property.type === "array") {
        return [key, property.default ?? []];
      }
      return [key, property.default ?? ""];
    }),
  );
}

function isEmptyRequiredValue(value: boolean | number | string | string[]): boolean {
  if (typeof value === "boolean") {
    return false;
  }
  if (typeof value === "number") {
    return Number.isNaN(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return String(value).trim().length === 0;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resolveAgentLead(agentLabel?: string): string {
  const trimmed = agentLabel?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "The agent";
}

function RequestShell(props: {
  title: string;
  description: string;
  details?: Array<{ label: string; value: string }>;
  body: ReactNode;
  footer?: ReactNode;
}) {
  const { title, description, details = [], body, footer } = props;

  return (
    <Card className="border border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--surface)_94%,transparent)] shadow-none">
      <CardHeader className="space-y-1 px-5 py-4">
        <CardTitle className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </CardTitle>
        <CardDescription className="text-sm text-muted">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5">
        {details.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {details.map((detail) => (
              <div
                key={`${detail.label}-${detail.value}`}
                className="rounded-xl border border-[color:var(--border)] bg-white/[0.03] px-3 py-2"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                  {detail.label}
                </p>
                <p className="mt-1 text-sm text-foreground">{detail.value}</p>
              </div>
            ))}
          </div>
        ) : null}
        {body}
      </CardContent>
      {footer ? <CardFooter className="px-5 pb-5 pt-0">{footer}</CardFooter> : null}
    </Card>
  );
}

function UserInputRequestCard(props: {
  params: UserInputRequestParams;
  agentLabel?: string | undefined;
  onResolve: (response: unknown) => Promise<void>;
}) {
  const { params, agentLabel, onResolve } = props;
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    getQuestionAnswerRecord(params.questions),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const agentLead = resolveAgentLead(agentLabel);

  return (
    <RequestShell
      title="Input requested"
      description={`${agentLead} is waiting for more information before it can continue.`}
      body={
        <div className="space-y-4">
          {params.questions.map((question) => (
            <div key={question.id} className="space-y-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{question.header}</p>
                <p className="text-sm text-muted">{question.question}</p>
              </div>
              {question.options ? (
                <Select
                  options={question.options.map((option) => ({
                    id: option.label,
                    label: option.label,
                  }))}
                  value={answers[question.id] ?? ""}
                  onChange={(value) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: value,
                    }))
                  }
                />
              ) : question.isSecret ? (
                <Input
                  fullWidth
                  type="password"
                  value={answers[question.id] ?? ""}
                  variant="secondary"
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value,
                    }))
                  }
                />
              ) : (
                <TextArea
                  fullWidth
                  rows={question.isOther ? 2 : 3}
                  value={answers[question.id] ?? ""}
                  variant="secondary"
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value,
                    }))
                  }
                />
              )}
            </div>
          ))}
        </div>
      }
      footer={
        <div className="flex w-full justify-end">
          <Button
            className="rounded-full px-4"
            isDisabled={isSubmitting}
            onPress={async () => {
              setIsSubmitting(true);
              try {
                await onResolve({
                  answers: Object.fromEntries(
                    Object.entries(answers).map(([id, value]) => [
                      id,
                      { answers: value ? [value] : [] },
                    ]),
                  ),
                });
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            Submit
          </Button>
        </div>
      }
    />
  );
}

function McpElicitationRequestCard(props: {
  params: McpElicitationFormParams | McpElicitationUrlParams;
  onResolve: (response: unknown) => Promise<void>;
}) {
  const { params, onResolve } = props;
  const [formValues, setFormValues] = useState<
    Record<string, boolean | number | string | string[]>
  >(() => (params.mode === "form" ? getInitialMcpFormValues(params.requestedSchema) : {}));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requiredKeys = params.mode === "form" ? (params.requestedSchema.required ?? []) : [];
  const hasMissingRequiredField =
    params.mode === "form" &&
    requiredKeys.some((key) => isEmptyRequiredValue(formValues[key] ?? ""));

  const resolveWith = async (response: unknown) => {
    setIsSubmitting(true);
    try {
      await onResolve(response);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RequestShell
      title="MCP input requested"
      description={params.message}
      details={[{ label: "Server", value: params.serverName }]}
      body={
        params.mode === "url" ? (
          <a
            className="text-sm font-medium text-[color:var(--accent)] underline-offset-4 hover:underline"
            href={params.url}
            rel="noreferrer"
            target="_blank"
          >
            Open required URL
          </a>
        ) : (
          <div className="space-y-4">
            {Object.entries(params.requestedSchema.properties).map(([key, property]) => {
              const label = property.title ?? key;
              const description = property.description ?? "";
              const options = getMcpEnumOptions(property);

              return (
                <div key={key} className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    {description ? <p className="text-sm text-muted">{description}</p> : null}
                  </div>

                  {property.type === "boolean" ? (
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        checked={Boolean(formValues[key])}
                        className="size-4"
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            [key]: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>{label}</span>
                    </label>
                  ) : property.type === "integer" || property.type === "number" ? (
                    <Input
                      fullWidth
                      type="number"
                      value={formValues[key] === "" ? "" : String(formValues[key] ?? "")}
                      variant="secondary"
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          [key]:
                            event.target.value.trim().length === 0
                              ? ""
                              : Number(event.target.value),
                        }))
                      }
                    />
                  ) : property.type === "array" ? (
                    <div className="grid gap-2">
                      {options.map((option) => {
                        const currentValues = Array.isArray(formValues[key])
                          ? (formValues[key] as string[])
                          : [];

                        return (
                          <label
                            key={option.id}
                            className="flex items-center gap-2 text-sm text-foreground"
                          >
                            <input
                              checked={currentValues.includes(option.id)}
                              className="size-4"
                              onChange={(event) =>
                                setFormValues((current) => {
                                  const nextValues = Array.isArray(current[key])
                                    ? [...(current[key] as string[])]
                                    : [];

                                  return {
                                    ...current,
                                    [key]: event.target.checked
                                      ? [...nextValues, option.id]
                                      : nextValues.filter((value) => value !== option.id),
                                  };
                                })
                              }
                              type="checkbox"
                            />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : options.length > 0 ? (
                    <Select
                      options={options}
                      value={String(formValues[key] ?? "")}
                      onChange={(value) =>
                        setFormValues((current) => ({
                          ...current,
                          [key]: value,
                        }))
                      }
                    />
                  ) : (
                    <Input
                      fullWidth
                      value={String(formValues[key] ?? "")}
                      variant="secondary"
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        )
      }
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button
            className="rounded-full px-4"
            isDisabled={isSubmitting}
            onPress={() => resolveWith({ action: "decline" })}
            variant="ghost"
          >
            Decline
          </Button>
          <Button
            className="rounded-full px-4"
            isDisabled={isSubmitting}
            onPress={() => resolveWith({ action: "cancel" })}
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            className="rounded-full px-4"
            isDisabled={isSubmitting || hasMissingRequiredField}
            onPress={() =>
              resolveWith({
                action: "accept",
                ...(params.mode === "form" ? { content: formValues } : {}),
                ...(Object.hasOwn(params, "_meta") ? { _meta: params._meta } : {}),
              })
            }
          >
            Continue
          </Button>
        </div>
      }
    />
  );
}

function ApprovalRequestCard(props: {
  request: PendingThreadServerRequest;
  agentLabel?: string | undefined;
  onResolve: (response: unknown) => Promise<void>;
}) {
  const { request, agentLabel, onResolve } = props;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const params = parseCommandApprovalParams(request.params);
  const agentLead = resolveAgentLead(agentLabel);

  const resolveWith = async (response: unknown) => {
    setIsSubmitting(true);
    try {
      await onResolve(response);
    } finally {
      setIsSubmitting(false);
    }
  };

  const commonDetails = [
    ...(params.reason ? [{ label: "Reason", value: params.reason }] : []),
    ...(params.command ? [{ label: "Command", value: params.command }] : []),
    ...(params.cwd ? [{ label: "Directory", value: params.cwd }] : []),
    ...(params.grantRoot ? [{ label: "Grant root", value: params.grantRoot }] : []),
  ];

  if (request.method === "item/permissions/requestApproval") {
    return (
      <RequestShell
        title="Permissions requested"
        description={params.reason ?? `${agentLead} requested additional permissions.`}
        body={
          <pre className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-white/[0.03] p-3 text-xs text-muted">
            {formatJson(params.permissions ?? request.params)}
          </pre>
        }
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button
              className="rounded-full px-4"
              isDisabled={isSubmitting}
              onPress={() =>
                resolveWith({
                  permissions: params.permissions ?? {},
                  scope: "turn",
                })
              }
              variant="secondary"
            >
              Allow this turn
            </Button>
            <Button
              className="rounded-full px-4"
              isDisabled={isSubmitting}
              onPress={() =>
                resolveWith({
                  permissions: params.permissions ?? {},
                  scope: "session",
                })
              }
            >
              Allow for session
            </Button>
          </div>
        }
      />
    );
  }

  const actions =
    request.method === "item/commandExecution/requestApproval"
      ? (params.availableDecisions ?? ["accept", "acceptForSession", "decline", "cancel"]).map(
          (decision) => ({
            key: JSON.stringify(decision),
            label: getCommandDecisionLabel(decision),
            response: { decision },
            variant: decision === "decline" || decision === "cancel" ? "ghost" : "secondary",
          }),
        )
      : request.method === "item/fileChange/requestApproval"
        ? ["accept", "acceptForSession", "decline", "cancel"].map((decision) => ({
            key: decision,
            label: getCommandDecisionLabel(decision),
            response: { decision },
            variant: decision === "decline" || decision === "cancel" ? "ghost" : "secondary",
          }))
        : ["approved", "approved_for_session", "denied", "abort"].map((decision) => ({
            key: decision,
            label: getLegacyDecisionLabel(decision),
            response: { decision },
            variant: decision === "denied" || decision === "abort" ? "ghost" : "secondary",
          }));

  return (
      <RequestShell
        title={
          request.method === "item/fileChange/requestApproval" ||
          request.method === "applyPatchApproval"
            ? "File changes need approval"
            : "Command needs approval"
        }
        description={params.reason ?? `${agentLead} is waiting for approval before it can continue.`}
        details={commonDetails}
      body={
        params.permissions ? (
          <pre className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-white/[0.03] p-3 text-xs text-muted">
            {formatJson(params.permissions)}
          </pre>
        ) : null
      }
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          {actions.map((action) => (
            <Button
              key={action.key}
              className="rounded-full px-4"
              isDisabled={isSubmitting}
              onPress={() => resolveWith(action.response)}
              variant={action.variant === "ghost" ? "ghost" : "secondary"}
            >
              {action.label}
            </Button>
          ))}
        </div>
      }
    />
  );
}

export function ThreadServerRequestPanel(props: {
  request: PendingThreadServerRequest;
  agentLabel?: string | undefined;
  onResolve: (input: {
    requestId: ThreadServerRequestId;
    method: string;
    response: unknown;
  }) => Promise<void>;
}) {
  const { request, agentLabel, onResolve } = props;
  const userInputParams = parseUserInputRequestParams(request.params);
  if (request.method === "item/tool/requestUserInput" && userInputParams) {
    return (
      <UserInputRequestCard
        params={userInputParams}
        agentLabel={agentLabel}
        onResolve={(response) =>
          onResolve({
            requestId: request.requestId,
            method: request.method,
            response,
          })
        }
      />
    );
  }

  const mcpParams = parseMcpElicitationParams(request.params);
  if (request.method === "mcpServer/elicitation/request" && mcpParams) {
    return (
      <McpElicitationRequestCard
        params={mcpParams}
        onResolve={(response) =>
          onResolve({
            requestId: request.requestId,
            method: request.method,
            response,
          })
        }
      />
    );
  }

  return (
    <ApprovalRequestCard
      request={request}
      agentLabel={agentLabel}
      onResolve={(response) =>
        onResolve({
          requestId: request.requestId,
          method: request.method,
          response,
        })
      }
    />
  );
}
