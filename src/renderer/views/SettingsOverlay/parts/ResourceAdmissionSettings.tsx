import { startTransition } from "react";
import { NumberField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { HostResourceAdmissionSettings } from "@/shared/hostResourceAdmission";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { SettingRow } from "./SettingsForm";

type ResourceLimitKey = keyof HostResourceAdmissionSettings;

/**
 * Host execution-slot bounds enforced by this device's supervisor runtime.
 *
 * The three values bound supervisor-owned logical execution slots (agent
 * sessions, terminal shells, short-lived generation helpers) — they are not
 * OS process counts, provider descendants, or memory (RSS) limits. `0` stays
 * explicitly unlimited/transitional until a measured release policy exists, so
 * the rows never present a number as a validated protective default.
 *
 * Ownership: these fields are written to this host's settings document by its
 * settings authority. They are deliberately absent from the remote settings
 * wire, so callers must hide this section for ordinary remote sessions (the
 * paired host would ignore the write) — see ThreadSettings.
 */
export function ResourceAdmissionSettings() {
  const { t } = useLingui();
  const maxActiveAgentSessions = useSharedSettings(
    (state) => state.hostResourceAdmission.maxActiveAgentSessions,
  );
  const maxActiveTerminalShells = useSharedSettings(
    (state) => state.hostResourceAdmission.maxActiveTerminalShells,
  );
  const maxActiveGenerationHelpers = useSharedSettings(
    (state) => state.hostResourceAdmission.maxActiveGenerationHelpers,
  );
  const setHostResourceAdmissionSetting = useSharedSettings(
    (state) => state.setHostResourceAdmissionSetting,
  );

  const commitLimit = (key: ResourceLimitKey, value: number | undefined) => {
    // Nonnegative safe integers only; the shared schema has no ceiling, so no
    // arbitrary upper bound is invented here. Invalid input leaves the last
    // committed value untouched.
    if (value === undefined || !Number.isSafeInteger(value) || value < 0) return;
    startTransition(() => {
      setHostResourceAdmissionSetting(key, value);
    });
  };

  return (
    <>
      <SettingRow
        anchorId="threads.maxActiveAgentSessions"
        title={t`Max active agent sessions`}
        description={
          <Trans>
            Bounds how many agent sessions can run at once on this host. Counts logical execution
            slots, not OS processes or memory. 0 means unlimited.
          </Trans>
        }
      >
        <NumberField
          aria-label={t`Max active agent sessions, 0 for unlimited`}
          className="w-[160px] shrink-0"
          minValue={0}
          maxValue={Number.MAX_SAFE_INTEGER}
          step={1}
          value={maxActiveAgentSessions}
          onChange={(value) => commitLimit("maxActiveAgentSessions", value)}
        >
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
      </SettingRow>

      <SettingRow
        anchorId="threads.maxActiveTerminalShells"
        title={t`Max active terminal shells`}
        description={
          <Trans>
            Bounds how many terminal shells can run at once on this host. Counts logical execution
            slots, not OS processes or memory. 0 means unlimited.
          </Trans>
        }
      >
        <NumberField
          aria-label={t`Max active terminal shells, 0 for unlimited`}
          className="w-[160px] shrink-0"
          minValue={0}
          maxValue={Number.MAX_SAFE_INTEGER}
          step={1}
          value={maxActiveTerminalShells}
          onChange={(value) => commitLimit("maxActiveTerminalShells", value)}
        >
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
      </SettingRow>

      <SettingRow
        anchorId="threads.maxActiveGenerationHelpers"
        title={t`Max active generation helpers`}
        description={
          <Trans>
            Bounds how many short-lived generation helpers (thread titles, commit messages, conflict
            resolution) can run at once on this host. Counts logical execution slots, not OS
            processes or memory. 0 means unlimited.
          </Trans>
        }
      >
        <NumberField
          aria-label={t`Max active generation helpers, 0 for unlimited`}
          className="w-[160px] shrink-0"
          minValue={0}
          maxValue={Number.MAX_SAFE_INTEGER}
          step={1}
          value={maxActiveGenerationHelpers}
          onChange={(value) => commitLimit("maxActiveGenerationHelpers", value)}
        >
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
      </SettingRow>
    </>
  );
}
