import { FileDiff, GitCommit, MessageSquare, ShieldCheck } from "lucide-react";
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

export type PrTabKey = "conversation" | "commits" | "checks" | "changes";

export interface PrTabCounts {
  conversation: number;
  commits: number;
  checks: number;
  changes: number;
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
];

const CHECKS_ICON_TONE_CLASS: Record<PrChecksTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
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

  const tabs: ReadonlyArray<LightballTab<PrTabKey>> = TAB_DEFS.map((def) => {
    const count = counts[def.id];
    const Icon = def.icon;
    const iconToneClass =
      def.id === "checks" && checksTone ? CHECKS_ICON_TONE_CLASS[checksTone] : "";
    const iconClassName = `size-3${iconToneClass ? ` ${iconToneClass}` : ""}`;
    return {
      id: def.id,
      label: t(def.label),
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
