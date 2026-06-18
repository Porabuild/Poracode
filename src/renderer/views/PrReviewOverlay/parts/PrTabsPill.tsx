import { FileDiff, GitCommit, MessageSquare, ShieldCheck } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { LightballTabs, type LightballTab } from "@/renderer/components/common";
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

function CountChip(props: { value: number; active: boolean }) {
  return (
    <span
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[10px] font-medium leading-none transition-colors ${
        props.active ? "bg-foreground/[0.12] text-foreground" : "bg-foreground/[0.08] text-muted"
      }`}
    >
      {props.value}
    </span>
  );
}

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
      ...(count > 0
        ? { trailing: (isActive: boolean) => <CountChip value={count} active={isActive} /> }
        : {}),
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
