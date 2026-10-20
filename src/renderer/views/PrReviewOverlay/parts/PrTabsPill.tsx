import { BookOpen, FileDiff, GitCommit, MessageSquare, ShieldCheck } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  LightballTabs,
  makeLightballCountTrailing,
  type LightballTab,
} from "@/renderer/components/common";
import {
  getChecksStatusTone,
  type PrChecksStatus,
  type PrChecksTone,
} from "@/renderer/utils/prStatus";

export type PrTabKey = "conversation" | "commits" | "checks" | "changes" | "guide";

export interface PrTabCounts {
  conversation: number;
  commits: number;
  checks: number;
  changes: number;
  guide?: number;
}

const TAB_DEFS: ReadonlyArray<{
  id: PrTabKey;
  label: MessageDescriptor;
  icon: typeof MessageSquare;
}> = [
  { id: "conversation", label: msg`Conversation`, icon: MessageSquare },
  { id: "commits", label: msg`Commits`, icon: GitCommit },
  { id: "checks", label: msg`Checks`, icon: ShieldCheck },
  { id: "changes", label: msg`Changes`, icon: FileDiff },
  { id: "guide", label: msg`Guide`, icon: BookOpen },
];

const CHECKS_ICON_TONE_CLASS: Record<PrChecksTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const CHECKS_TAB_STATUS: Record<PrChecksStatus, MessageDescriptor> = {
  SUCCESS: msg`Passed`,
  PENDING: msg`Pending`,
  FAILURE: msg`Failed`,
};

export function PrTabsPill(props: {
  active: PrTabKey;
  onChange: (key: PrTabKey) => void;
  counts: PrTabCounts;
  checksStatus?: PrChecksStatus | undefined;
  className?: string;
}) {
  const { active, onChange, counts, checksStatus, className } = props;
  const { t } = useLingui();
  const checksTone = getChecksStatusTone(checksStatus);

  const tabs: ReadonlyArray<LightballTab<PrTabKey>> = TAB_DEFS.filter(
    (def) => def.id !== "guide" || counts.guide !== undefined,
  ).map((def) => {
    const count = counts[def.id] ?? 0;
    const Icon = def.icon;
    const iconToneClass =
      def.id === "checks" && checksTone ? CHECKS_ICON_TONE_CLASS[checksTone] : "";
    const iconClassName = `size-3${iconToneClass ? ` ${iconToneClass}` : ""}`;
    return {
      id: def.id,
      label:
        def.id === "checks" && checksStatus
          ? `${t(def.label)} ${t(CHECKS_TAB_STATUS[checksStatus])}`
          : t(def.label),
      icon: <Icon className={iconClassName} />,
      ...(count > 0 ? { trailing: makeLightballCountTrailing(count) } : {}),
    };
  });

  return (
    <LightballTabs
      tabs={tabs}
      active={active}
      onChange={onChange}
      ariaLabel={t`PR sections`}
      {...(className ? { className } : {})}
    />
  );
}
