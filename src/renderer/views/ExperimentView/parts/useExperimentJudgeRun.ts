import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { useLingui } from "@lingui/react/macro";
import type { AgentStatus, Experiment } from "@/shared/contracts";
import { cancelExperimentJudge, crownExperiment } from "@/renderer/actions/experimentActions";
import { formatModelConfigLabel } from "@/renderer/components/providers/modelDisplay";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { resolveExperimentJudgeConfig, type ExperimentJudgeConfig } from "./ExperimentJudgeDialog";
import { replaceExperimentSolutionReferences } from "./experimentJudgeRationale";
import type {
  JudgeRunState,
  JudgeTranscriptEntry,
  JudgeTranscriptEntryInput,
} from "./ExperimentJudgeRunDialog";

export function useExperimentJudgeRun(args: {
  experiment: Experiment | undefined;
  judgeAgents: readonly AgentStatus[];
  projectAgents: readonly AgentStatus[];
  runCrown: (action: () => Promise<void>) => void;
}) {
  const { t } = useLingui();
  const [config, setConfig] = useState<ExperimentJudgeConfig | null>(null);
  const [run, setRun] = useState<JudgeRunState | null>(null);
  const savedConfig = useSharedSettings(
    useShallow((state) => ({
      agentKind: state.experimentJudgeProvider,
      model: state.experimentJudgeModel,
      effort: state.experimentJudgeEffort,
      fast: state.experimentJudgeFast,
    })),
  );
  const saveConfig = useSharedSettings((state) => state.setExperimentJudgeConfig);
  const candidates = args.experiment?.candidates ?? [];
  const candidateByThreadId = new Map(
    candidates.map((candidate) => [candidate.threadId, candidate] as const),
  );
  const projectAgentByKind = new Map(
    args.projectAgents.map((agent) => [agent.kind, agent] as const),
  );

  function candidateDisplay(threadId: string): { label: string; details: string } {
    const candidate = candidateByThreadId.get(threadId);
    if (!candidate) return { label: "", details: "" };
    const provider = candidate.agentLabel ?? candidate.agentKind;
    const model = formatModelConfigLabel(projectAgentByKind.get(candidate.agentKind), candidate);
    return {
      label: model || provider,
      details: model ? provider : "",
    };
  }

  function winnerRun(input: {
    threadId: string;
    rationale: string;
    assessments: readonly { threadId: string; rationale: string }[];
  }): JudgeRunState {
    const candidateReferences = candidates.map((candidate, index) => {
      const candidateName = candidateDisplay(candidate.threadId);
      const name = candidateName.details
        ? `${candidateName.label} · ${candidateName.details}`
        : candidateName.label;
      return `${name} (${t`Solution ${index + 1}`})`;
    });
    const assessmentByThreadId = new Map(
      input.assessments.map((assessment) => [assessment.threadId, assessment] as const),
    );
    const assessments = candidates.flatMap((candidate, index) => {
      const assessment = assessmentByThreadId.get(candidate.threadId);
      if (!assessment) return [];
      return [
        {
          threadId: candidate.threadId,
          ...candidateDisplay(candidate.threadId),
          solutionLabel: t`Solution ${index + 1}`,
          rationale: replaceExperimentSolutionReferences(assessment.rationale, candidateReferences),
        },
      ];
    });
    const winnerOrdinal = candidates.findIndex(
      (candidate) => candidate.threadId === input.threadId,
    );
    return {
      stage: "won",
      winner: {
        ...candidateDisplay(input.threadId),
        solutionLabel: t`Solution ${winnerOrdinal + 1}`,
        rationale: replaceExperimentSolutionReferences(input.rationale, candidateReferences),
        assessments,
      },
    };
  }

  function append(entry: JudgeTranscriptEntryInput) {
    setRun((previous) =>
      previous?.stage === "running"
        ? {
            ...previous,
            transcript: [
              ...previous.transcript,
              { ...entry, id: previous.transcript.length + 1 } as JudgeTranscriptEntry,
            ],
          }
        : previous,
    );
  }

  function open() {
    setConfig(resolveExperimentJudgeConfig([...args.judgeAgents], savedConfig));
  }

  function confirm() {
    if (!config || !args.experiment) return;
    const experiment = args.experiment;
    const selectedConfig = config;
    saveConfig(
      selectedConfig.agentKind,
      selectedConfig.model,
      selectedConfig.effort,
      selectedConfig.fast,
    );
    const judgeAgent = args.judgeAgents.find((agent) => agent.kind === selectedConfig.agentKind);
    const provider = judgeAgent?.label ?? selectedConfig.agentKind;
    const detail = formatModelConfigLabel(judgeAgent, selectedConfig);
    const judgeLabel = detail ? `${detail} · ${provider}` : provider;
    setConfig(null);
    setRun({ stage: "running", transcript: [] });

    args.runCrown(async () => {
      const won = await crownExperiment(
        experiment.id,
        {
          agentKind: selectedConfig.agentKind,
          model: selectedConfig.model,
          ...(selectedConfig.effort ? { effort: selectedConfig.effort } : {}),
          fast: selectedConfig.fast,
          mode: selectedConfig.mode,
        },
        (event) => {
          if (event.kind === "capturing") {
            append({ kind: "capturing", mode: event.mode });
          } else if (event.kind === "captured") {
            const display = candidateDisplay(event.threadId);
            append({
              kind: "captured",
              ...display,
              files: event.files,
              insertions: event.insertions,
              deletions: event.deletions,
              ...(event.omittedFiles ? { omittedFiles: event.omittedFiles } : {}),
            });
          } else if (event.kind === "captured-response") {
            const display = candidateDisplay(event.threadId);
            append({
              kind: "captured-response",
              ...display,
              characters: event.characters,
            });
          } else if (event.kind === "judging") {
            append({ kind: "judging", judgeLabel, mode: event.mode });
          } else if (event.kind === "winner") {
            setRun((previous) => (previous?.stage === "running" ? winnerRun(event) : previous));
          }
        },
      );
      if (!won) setRun(null);
    });
  }

  return {
    config,
    run,
    setConfig,
    setRun,
    open,
    openResults: () => {
      const crown = args.experiment?.crown;
      if (crown?.source !== "ai") return;
      setRun(
        winnerRun({
          threadId: crown.threadId,
          rationale: crown.rationale,
          assessments: crown.assessments ?? [],
        }),
      );
    },
    confirm,
    cancel: () => {
      if (args.experiment) cancelExperimentJudge(args.experiment.id);
    },
  };
}
