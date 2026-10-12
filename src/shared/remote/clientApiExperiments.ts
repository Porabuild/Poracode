import {
  remoteExperimentCommandResultSchema,
  remoteExperimentStateSchema,
  type RemoteExperimentCommand,
  type RemoteExperimentCommandResult,
  type RemoteExperimentState,
} from "@/shared/contracts";
import { REMOTE_COMMAND_ID_HEADER } from "./protocol";
import { RemoteClientEnvironmentsApi } from "./clientApiEnvironments";
import { parseResponse } from "./clientParse";

/**
 * Experiment authority SDK (capabilities.experiments v1).
 *
 * The authority is composed only by the embedded desktop backend. Gate every
 * call on the advertised `capabilities.experiments` v1 (see
 * {@link hostSupportsExperiments}) and refuse truthfully when absent — never
 * fall back to a whole-map local writer.
 *
 * Identity rules for the command route: mint ONE command id per user action
 * and reuse it only to retry the SAME uncertain operation. A conflict
 * (`experiment_revision_conflict`) is recovered by re-reading
 * {@link experimentState} and rebasing only the intended change under a NEW
 * command id. An `uncertain` receipt must be retried with the same id; a
 * resumed re-execution is idempotent (absolute effects, postcondition-checked,
 * timestamps never re-stamped).
 */
export abstract class RemoteClientExperimentsApi extends RemoteClientEnvironmentsApi {
  /** `GET /api/experiments` — canonical records plus the store-wide CAS token. */
  async experimentState(): Promise<RemoteExperimentState> {
    return parseResponse(
      remoteExperimentStateSchema,
      await this.requestJson("/api/experiments"),
      "experiment state",
    );
  }

  /**
   * `POST /api/experiments/{experimentId}/command` — one of the three intents
   * (`create`/`replace`/`remove`), under the caller's explicit per-action
   * command id and the host's mutation-locality gate.
   */
  async sendExperimentCommand(
    command: RemoteExperimentCommand,
    options: { readonly commandId: string },
  ): Promise<RemoteExperimentCommandResult> {
    if (!options.commandId) {
      throw new Error(
        "Experiment commands require an explicit per-action commandId so an uncertain retry is reconciled instead of re-applied.",
      );
    }
    return parseResponse(
      remoteExperimentCommandResultSchema,
      await this.requestJson(
        `/api/experiments/${encodeURIComponent(command.experimentId)}/command`,
        {
          method: "POST",
          mutation: true,
          headers: { [REMOTE_COMMAND_ID_HEADER]: options.commandId },
          body: command,
        },
      ),
      "experiment command",
    );
  }
}
