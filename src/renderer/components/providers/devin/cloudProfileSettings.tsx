import { Trans, useLingui } from "@lingui/react/macro";
import { DEVIN_CLOUD_PLATFORMS } from "@/shared/agents/devin/profileConfig";
import { Input, Select } from "@/renderer/components/common";
import {
  devinCloudFormIssues,
  type DevinCloudDefaultsForm,
  type DevinCloudFormIssue,
  type DevinCloudPersonaMode,
  type DevinCloudPlatformMode,
  type DevinCloudRepositoryMode,
} from "./profileConfigUi";

const REPOSITORY_MODES = ["keep", "none", "list"] as const;
const PERSONA_MODES = ["keep", "agent", "custom"] as const;

/**
 * The profile's cloud chat setup: repository, persona, and platform defaults
 * Devin applies when this profile starts a cloud chat. Extracted from the
 * profile editor (which owns the state and the single Save); this component
 * is purely presentational — every change flows up through `onChange`, no
 * choice is ever read from a live account inventory, and the dropdown values
 * are only the native platform names plus the keep/clear modes.
 */
export function DevinCloudChatSetup(props: {
  form: DevinCloudDefaultsForm;
  onChange: (form: DevinCloudDefaultsForm) => void;
}) {
  const { t } = useLingui();
  const form = props.form;
  const patch = (partial: Partial<DevinCloudDefaultsForm>) =>
    props.onChange({ ...form, ...partial });
  const issues = devinCloudFormIssues(form);
  const has = (issue: DevinCloudFormIssue) => issues.includes(issue);
  const issueLines = [
    ...(has("repository-entry")
      ? [t`Each repository entry must be 1–512 characters without control characters.`]
      : []),
    ...(has("repository-duplicate") ? [t`Repository entries must be unique.`] : []),
    ...(has("repository-overflow") ? [t`A profile can carry at most 100 repositories.`] : []),
    ...(has("persona-empty") ? [t`Enter a persona ID or keep the current choice.`] : []),
    ...(has("persona-overflow") ? [t`Persona IDs are limited to 512 characters.`] : []),
  ];
  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs font-medium text-foreground">
        <Trans>Cloud chat setup</Trans>
      </p>
      <p className="text-[11px] text-muted">
        <Trans>
          Choose the workspace for new cloud chats. Existing cloud sessions keep their workspace.
        </Trans>
      </p>
      <p className="text-[11px] text-muted">
        <Trans>
          These choices apply to Chat. In CLI mode, configure the workspace from the terminal.
        </Trans>
      </p>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted">
          <Trans>Repositories (optional)</Trans>
        </span>
        <div className="max-w-sm">
          <Select
            aria-label={t`Cloud repositories`}
            options={[
              { id: "keep", label: t`Keep current choice` },
              { id: "none", label: t`No repositories` },
              { id: "list", label: t`Specific repositories` },
            ]}
            value={form.repositoryMode}
            onChange={(value) => {
              if (REPOSITORY_MODES.includes(value as DevinCloudRepositoryMode)) {
                patch({ repositoryMode: value as DevinCloudRepositoryMode });
              }
            }}
          />
        </div>
        {form.repositoryMode === "list" ? (
          <>
            <Input
              aria-label={t`Cloud repository list`}
              placeholder={t`owner/name, owner/name`}
              value={form.repositoriesText}
              onChange={(event) => patch({ repositoriesText: event.target.value })}
            />
            <p className="text-[11px] text-muted">
              <Trans>
                Enter repository names separated by commas, such as acme/website, acme/api.
              </Trans>
            </p>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted">
          <Trans>Persona (optional)</Trans>
        </span>
        <div className="max-w-sm">
          <Select
            aria-label={t`Cloud persona`}
            options={[
              { id: "keep", label: t`Keep current choice` },
              { id: "agent", label: t`Agent` },
              { id: "custom", label: t`Specific persona` },
            ]}
            value={form.personaMode}
            onChange={(value) => {
              if (PERSONA_MODES.includes(value as DevinCloudPersonaMode)) {
                patch({ personaMode: value as DevinCloudPersonaMode });
              }
            }}
          />
        </div>
        {form.personaMode === "custom" ? (
          <>
            <Input
              aria-label={t`Persona ID`}
              value={form.personaSlug}
              onChange={(event) => patch({ personaSlug: event.target.value })}
            />
            <p className="text-[11px] text-muted">
              <Trans>Use the ID of a persona available in your Devin cloud organization.</Trans>
            </p>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted">
          <Trans>Platform (optional)</Trans>
        </span>
        <div className="max-w-sm">
          <Select
            aria-label={t`Cloud platform`}
            options={[
              { id: "keep", label: t`Keep current choice` },
              ...DEVIN_CLOUD_PLATFORMS.map((platform) => ({
                id: platform,
                label:
                  platform === "linux" ? t`Linux` : platform === "macos" ? t`macOS` : t`Windows`,
              })),
            ]}
            value={form.platformMode === "select" && form.platform ? form.platform : "keep"}
            onChange={(value) => {
              if (value === "keep") {
                patch({ platformMode: "keep", platform: undefined });
              } else if (
                DEVIN_CLOUD_PLATFORMS.includes(value as (typeof DEVIN_CLOUD_PLATFORMS)[number])
              ) {
                const platformPatch: Partial<DevinCloudDefaultsForm> = {
                  platformMode: "select" satisfies DevinCloudPlatformMode,
                  platform: value as (typeof DEVIN_CLOUD_PLATFORMS)[number],
                };
                patch(platformPatch);
              }
            }}
          />
        </div>
        {form.platformMode === "select" ? (
          <p className="text-[11px] text-muted">
            <Trans>Availability depends on your Devin organization.</Trans>
          </p>
        ) : null}
      </div>

      {issueLines.map((line) => (
        <p key={line} className="text-[11px] text-warning">
          {line}
        </p>
      ))}
    </section>
  );
}
